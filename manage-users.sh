#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# manage-users.sh — Remote user management for GC SA&A Tool on Azure
#
# Usage:
#   ./manage-users.sh                          # Interactive menu
#   ./manage-users.sh --add                    # Add user directly
#   ./manage-users.sh --invite                 # Generate invite code
#   ./manage-users.sh --list                   # List all users
#   ./manage-users.sh --reset-password         # Reset a user's password
#   ./manage-users.sh --update-webauthn        # Update WebAuthn RP ID & Origin
#
# Environment:
#   AZURE_APP_NAME          App Service name
#   AZURE_RESOURCE_GROUP    Resource group (default: gc-sa-tool-rg)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

ACTION=""
LOCAL=false
for arg in "$@"; do
  case $arg in
    --add)              ACTION="add" ;;
    --invite)           ACTION="invite" ;;
    --list)             ACTION="list" ;;
    --reset-password)   ACTION="reset" ;;
    --update-webauthn)  ACTION="webauthn" ;;
    --local)            LOCAL=true ;;
    --help|-h)
      echo "Usage: ./manage-users.sh [--local] [--add|--invite|--list|--reset-password|--update-webauthn]"
      echo ""
      echo "  --local   Run against local ./data/sa-tool.db (no Azure required)"
      echo "            Otherwise runs remotely via Azure Kudu API"
      exit 0 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GC SA&A Tool — Remote User Management                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Determine DB path ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/data/sa-tool.db"

if $LOCAL; then
  # ── Local mode: run directly ──
  APP_NAME="localhost"
  echo -e "  Mode: ${CYAN}LOCAL${NC} (./data/sa-tool.db)"
  echo ""

  [ -f "package.json" ] || err "Run from project root (no package.json found)"
  [ -d "node_modules" ] || err "node_modules missing — run: npm install"
  [ -f "$DB_PATH" ] || warn "Database not found at $DB_PATH (will be created on first app boot)"

  run_js() {
    local JS_FILE="$1"
    local ENV_PREFIX="${2:-}"
    # Replace DB path in JS to use local path
    sed -i.bak "s|/home/site/wwwroot/data/sa-tool.db|${DB_PATH}|g" "$JS_FILE" 2>/dev/null || true
    rm -f "${JS_FILE}.bak"
    local OUTPUT
    OUTPUT=$(eval "NODE_PATH='${SCRIPT_DIR}/node_modules' ${ENV_PREFIX} node '${JS_FILE}' 2>&1") || true
    rm -f "$JS_FILE"
    echo "$OUTPUT"
  }

  restart_app() {
    warn "Local mode: restart your dev server (Ctrl+C then npm start) to reload the DB"
  }

else
  # ── Remote mode: Azure Kudu API ──
  echo -e "  Mode: ${CYAN}AZURE${NC} (remote via Kudu API)"
  echo ""

  command -v az &>/dev/null || err "Azure CLI not found"
  az account show &>/dev/null || err "Not logged in. Run: az login"

  RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-gc-sa-tool-rg}"
  APP_NAME="${AZURE_APP_NAME:-}"

  if [ -z "$APP_NAME" ]; then
    FOUND_APPS=$(az webapp list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || true)
    if [ -z "$FOUND_APPS" ]; then
      read -p "  App Service name: " APP_NAME
      [ -z "$APP_NAME" ] && err "No app name"
    else
      APP_COUNT=$(echo "$FOUND_APPS" | wc -l | tr -d ' ')
      if [ "$APP_COUNT" -eq 1 ]; then
        APP_NAME="$FOUND_APPS"; log "Found app: $APP_NAME"
      else
        echo "  Apps in $RESOURCE_GROUP:"; echo "$FOUND_APPS" | nl -ba
        read -p "  Select number: " APP_CHOICE
        APP_NAME=$(echo "$FOUND_APPS" | sed -n "${APP_CHOICE}p")
        [ -z "$APP_NAME" ] && err "Invalid selection"
      fi
    fi
  fi

  info "Connecting to $APP_NAME..."
  CREDS=$(az webapp deployment list-publishing-credentials \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --query "{u:publishingUserName,p:publishingPassword}" -o tsv 2>/dev/null)
  KUDU_USER=$(echo "$CREDS" | cut -f1)
  KUDU_PASS=$(echo "$CREDS" | cut -f2)
  KUDU_URL="https://${APP_NAME}.scm.azurewebsites.net"

  # ════════════════════════════════════════════════════════════════════════════
  #  run_js — Upload JS + shell wrapper to server, execute, clean up
  #
  #  Why a wrapper? Kudu's command API mangles &&, [], {} in JSON payloads.
  #  Why /tmp/_nm? Oryx symlinks node_modules -> /node_modules, but /node_modules
  #  only exists in the app container, not the Kudu container. We extract from
  #  Oryx's node_modules.tar.gz instead.
  #
  #  $1 = local JS file path  $2 = env vars string (optional)
  # ════════════════════════════════════════════════════════════════════════════
  run_js() {
    local JS_FILE="$1"
    local ENV_PREFIX="${2:-}"
    local JS_NAME="_mu_script.js"
    local SH_NAME="_mu_wrapper.sh"

    # Upload JS
    curl -s -X PUT -u "${KUDU_USER}:${KUDU_PASS}" \
      "${KUDU_URL}/api/vfs/site/wwwroot/${JS_NAME}" \
      -H "If-Match: *" --data-binary "@${JS_FILE}" > /dev/null 2>&1
    rm -f "$JS_FILE"

    # Upload shell wrapper
    local WRAPPER="#!/bin/sh
mkdir -p /tmp/_nm
tar -xzf node_modules.tar.gz -C /tmp/_nm 2>/dev/null
NODE_PATH=/tmp/_nm ${ENV_PREFIX} node ${JS_NAME} 2>&1
"
    echo "$WRAPPER" | curl -s -X PUT -u "${KUDU_USER}:${KUDU_PASS}" \
      "${KUDU_URL}/api/vfs/site/wwwroot/${SH_NAME}" \
      -H "If-Match: *" --data-binary @- > /dev/null 2>&1

    # Execute
    local RESULT
    RESULT=$(curl -s -X POST -u "${KUDU_USER}:${KUDU_PASS}" \
      "${KUDU_URL}/api/command" \
      -H "Content-Type: application/json" \
      -d "{\"command\":\"sh ${SH_NAME}\",\"dir\":\"/home/site/wwwroot\"}" 2>/dev/null)

    # Clean up
    curl -s -X DELETE -u "${KUDU_USER}:${KUDU_PASS}" \
      "${KUDU_URL}/api/vfs/site/wwwroot/${JS_NAME}" -H "If-Match: *" > /dev/null 2>&1
    curl -s -X DELETE -u "${KUDU_USER}:${KUDU_PASS}" \
      "${KUDU_URL}/api/vfs/site/wwwroot/${SH_NAME}" -H "If-Match: *" > /dev/null 2>&1

    # Parse
    local OUTPUT ERROR
    OUTPUT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Output',''))" 2>/dev/null || echo "$RESULT")
    ERROR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Error',''))" 2>/dev/null || echo "")

    [ -n "$OUTPUT" ] && echo "$OUTPUT" || true
    [ -n "$ERROR" ] && echo "$ERROR" >&2 || true
  }

  restart_app() {
    info "Restarting app to apply changes..."
    az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null
    log "App restarting (allow ~30s before logging in)"
  }
fi

# ── Interactive menu ──
if [ -z "$ACTION" ]; then
  echo ""
  echo "    1) Add a new user (direct)"
  echo "    2) Generate an invite code"
  echo "    3) List all users"
  echo "    4) Reset a user's password"
  echo "    5) Update WebAuthn domain"
  echo "    6) Clear passkeys"
  echo ""
  read -p "  Select (1-6): " MENU_CHOICE
  case "$MENU_CHOICE" in
    1) ACTION="add" ;; 2) ACTION="invite" ;; 3) ACTION="list" ;;
    4) ACTION="reset" ;; 5) ACTION="webauthn" ;; 6) ACTION="clear-passkeys" ;;
    *) err "Invalid choice" ;;
  esac
fi

# ══════════════════════════════════════════════════════════════════════════════
#  ADD USER (direct, no invite)
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "add" ]; then
  echo ""; info "Add new user to $APP_NAME"; echo ""
  read -p "  Email: " NEW_EMAIL;    [ -z "$NEW_EMAIL" ] && err "Email required"
  read -p "  Display name: " NEW_NAME; [ -z "$NEW_NAME" ] && err "Name required"
  read -sp "  Password: " NEW_PASSWORD; echo ""; [ -z "$NEW_PASSWORD" ] && err "Password required"
  echo ""; echo "  Role:  1) admin  2) assessor  3) client"
  read -p "  Select (1-3) [1]: " ROLE_CHOICE
  case "${ROLE_CHOICE:-1}" in 1) NEW_ROLE="admin" ;; 2) NEW_ROLE="assessor" ;; 3) NEW_ROLE="client" ;; *) err "Invalid" ;; esac

  info "Creating $NEW_ROLE: $NEW_EMAIL..."

  TMPJS=$(mktemp /tmp/mu-XXXXX.js)
  cat > "$TMPJS" << 'JSEOF'
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  if (!fs.existsSync(dbPath)) { console.log('ERROR: Database not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const email = process.env.MU_EMAIL;
  const name = process.env.MU_NAME;
  const password = process.env.MU_PASSWORD;
  const role = process.env.MU_ROLE;
  const existing = db.exec("SELECT id FROM users WHERE email = '" + email + "'");
  if (existing.length > 0 && existing[0].values.length > 0) {
    console.log('ERROR: User ' + email + ' already exists'); process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);
  // Generate TOTP secret using otplib's own generator (proper base32)
  const { generateSecret } = require('otplib');
  const totpSecret = generateSecret();
  db.run("INSERT INTO users (email, password, name, role, totp_secret, mfa_enabled, is_active) VALUES (?, ?, ?, ?, ?, 0, 1)",
    [email, hash, name, role, totpSecret]);
  const inserted = db.exec("SELECT last_insert_rowid()");
  const newId = inserted[0].values[0][0];
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('SUCCESS: Created ' + role + ' user ' + email + ' (id: ' + newId + ')');
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF

  RESPONSE=$(run_js "$TMPJS" "MU_EMAIL='${NEW_EMAIL}' MU_NAME='${NEW_NAME}' MU_PASSWORD='${NEW_PASSWORD}' MU_ROLE='${NEW_ROLE}'")
  if echo "$RESPONSE" | grep -q "SUCCESS"; then
    log "$RESPONSE"; echo ""
    if $LOCAL; then
      BASE_URL="http://localhost:${PORT:-3000}"
    else
      BASE_URL="https://${APP_NAME}.azurewebsites.net"
    fi
    if [ "$NEW_ROLE" = "client" ]; then
      log "Login at: ${BASE_URL}/client/login"
    else
      log "Login at: ${BASE_URL}/admin/login"
    fi
    restart_app
  else
    err "Failed: $RESPONSE"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
#  GENERATE INVITE CODE
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "invite" ]; then
  echo ""; info "Generate invite code for $APP_NAME"; echo ""
  read -p "  Invitee email: " INV_EMAIL;  [ -z "$INV_EMAIL" ] && err "Email required"
  read -p "  Invitee name: " INV_NAME;    [ -z "$INV_NAME" ] && err "Name required"
  read -p "  Organization (optional): " INV_ORG
  echo ""; echo "  Role:  1) admin  2) assessor  3) client"
  read -p "  Select (1-3) [2]: " INV_ROLE_CHOICE
  case "${INV_ROLE_CHOICE:-2}" in 1) INV_ROLE="admin" ;; 2) INV_ROLE="assessor" ;; 3) INV_ROLE="client" ;; *) err "Invalid" ;; esac
  read -p "  Expires in days [7]: " INV_DAYS; INV_DAYS="${INV_DAYS:-7}"

  info "Creating $INV_ROLE invite for $INV_EMAIL..."

  TMPJS=$(mktemp /tmp/mu-XXXXX.js)
  cat > "$TMPJS" << 'JSEOF'
const initSqlJs = require('sql.js');
const fs = require('fs');
const crypto = require('crypto');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  if (!fs.existsSync(dbPath)) { console.log('ERROR: Database not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const email = process.env.MU_EMAIL;
  const name = process.env.MU_NAME;
  const org = process.env.MU_ORG || '';
  const role = process.env.MU_ROLE;
  const days = parseInt(process.env.MU_DAYS || '7', 10);
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiry = new Date(Date.now() + days * 86400000).toISOString();
  const admin = db.exec("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin.length || !admin[0].values.length) {
    console.log('ERROR: No admin found. Create one first with --add'); process.exit(1);
  }
  const adminId = admin[0].values[0][0];
  db.run("INSERT INTO invitations (type, email, name, organization, invite_code, invited_by, status, expires_at) VALUES (?,?,?,?,?,?,'pending',?)",
    [role, email, name, org, code, adminId, expiry]);
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  // Check if user already has an account
  const existing = db.exec("SELECT id FROM users WHERE email = '" + email + "'");
  const userExists = existing.length > 0 && existing[0].values.length > 0;
  console.log('CODE:' + code);
  console.log('EXISTS:' + (userExists ? 'yes' : 'no'));
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF

  RESPONSE=$(run_js "$TMPJS" "MU_EMAIL='${INV_EMAIL}' MU_NAME='${INV_NAME}' MU_ORG='${INV_ORG:-}' MU_ROLE='${INV_ROLE}' MU_DAYS='${INV_DAYS}'")

  if echo "$RESPONSE" | grep -q "^CODE:"; then
    INVITE_CODE=$(echo "$RESPONSE" | grep "^CODE:" | cut -d: -f2 | tr -d '[:space:]')
    USER_EXISTS=$(echo "$RESPONSE" | grep "^EXISTS:" | cut -d: -f2 | tr -d '[:space:]')

    if $LOCAL; then
      PROTO="http"
      DOMAIN="localhost:${PORT:-3000}"
    else
      PROTO="https"
      DOMAIN="${APP_NAME}.azurewebsites.net"
      CUSTOM=$(az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
        --query "hostNames[?!contains(@, '.azurewebsites.net')]" -o tsv 2>/dev/null || true)
      [ -n "$CUSTOM" ] && DOMAIN=$(echo "$CUSTOM" | head -1)
    fi

    # Build the appropriate URL
    if [ "$USER_EXISTS" = "yes" ]; then
      if [ "$INV_ROLE" = "client" ]; then
        INVITE_URL="${PROTO}://${DOMAIN}/client/login?email=${INV_EMAIL}"
      else
        INVITE_URL="${PROTO}://${DOMAIN}/admin/login?email=${INV_EMAIL}"
      fi
      URL_LABEL="Sign-In URL (existing user)"
    else
      INVITE_URL="${PROTO}://${DOMAIN}/admin/register?invite=${INVITE_CODE}"
      URL_LABEL="Registration URL (new user)"
    fi

    echo ""
    echo "  ┌──────────────────────────────────────────────────────────────┐"
    echo "  │  Invite Created!                                             │"
    echo "  ├──────────────────────────────────────────────────────────────┤"
    printf "  │  Code:    %-49s│\n" "$INVITE_CODE"
    printf "  │  Email:   %-49s│\n" "$INV_EMAIL"
    printf "  │  Role:    %-49s│\n" "$INV_ROLE"
    printf "  │  Expires: %-49s│\n" "in $INV_DAYS days"
    printf "  │  Status:  %-49s│\n" "$([ "$USER_EXISTS" = "yes" ] && echo "Existing user" || echo "New user — must register")"
    echo "  └──────────────────────────────────────────────────────────────┘"
    echo ""; log "$URL_LABEL:"; echo ""; echo "  $INVITE_URL"; echo ""
    warn "Share this URL with: $INV_EMAIL"
    restart_app
  else
    err "Failed: $RESPONSE"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
#  LIST USERS
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "list" ]; then
  echo ""; info "Users on $APP_NAME:"; echo ""

  TMPJS=$(mktemp /tmp/mu-XXXXX.js)
  cat > "$TMPJS" << 'JSEOF'
const initSqlJs = require('sql.js');
const fs = require('fs');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  if (!fs.existsSync(dbPath)) { console.log('No database found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const result = db.exec("SELECT id, email, name, role, is_active, mfa_enabled, created_at FROM users ORDER BY created_at");
  if (!result.length) { console.log('No users found'); return; }
  result[0].values.forEach(r => {
    const pk = db.exec("SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = " + r[0]);
    const pkCount = pk.length ? pk[0].values[0][0] : 0;
    console.log(r[1] + ' | ' + r[2] + ' | ' + r[3] + ' | ' + (r[4]?'active':'inactive') + ' | MFA:' + (r[5]?'yes':'no') + ' | PK:' + pkCount);
  });
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF

  RESPONSE=$(run_js "$TMPJS" "")
  if [ -n "$RESPONSE" ] && ! echo "$RESPONSE" | grep -q "^ERROR"; then
    echo "  ─────────────────────────────────────────────────────────────────"
    printf "  %-35s %-15s %-10s %-8s %-6s %s\n" "EMAIL" "NAME" "ROLE" "STATUS" "MFA" "PASSKEYS"
    echo "  ─────────────────────────────────────────────────────────────────"
    echo "$RESPONSE" | while IFS='|' read -r email name role status mfa pk; do
      printf "  %-35s %-15s %-10s %-8s %-6s %s\n" \
        "$(echo "$email" | xargs)" "$(echo "$name" | xargs)" "$(echo "$role" | xargs)" \
        "$(echo "$status" | xargs)" "$(echo "$mfa" | xargs)" "$(echo "$pk" | xargs)"
    done
    echo "  ─────────────────────────────────────────────────────────────────"
  else
    warn "${RESPONSE:-No output}"
  fi
  echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
#  RESET PASSWORD
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "reset" ]; then
  echo ""; info "Reset password on $APP_NAME"; echo ""
  read -p "  User email: " RESET_EMAIL;  [ -z "$RESET_EMAIL" ] && err "Email required"
  read -sp "  New password: " RESET_PASSWORD; echo ""; [ -z "$RESET_PASSWORD" ] && err "Password required"
  info "Resetting password for $RESET_EMAIL..."

  TMPJS=$(mktemp /tmp/mu-XXXXX.js)
  cat > "$TMPJS" << 'JSEOF'
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  if (!fs.existsSync(dbPath)) { console.log('ERROR: Database not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const email = process.env.MU_EMAIL;
  const password = process.env.MU_PASSWORD;
  const existing = db.exec("SELECT id FROM users WHERE email = '" + email + "'");
  if (!existing.length || !existing[0].values.length) {
    console.log('ERROR: User not found: ' + email); process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);
  db.run("UPDATE users SET password = '" + hash + "' WHERE email = '" + email + "'");
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('SUCCESS: Password reset for ' + email);
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF

  RESPONSE=$(run_js "$TMPJS" "MU_EMAIL='${RESET_EMAIL}' MU_PASSWORD='${RESET_PASSWORD}'")
  if echo "$RESPONSE" | grep -q "SUCCESS"; then log "$RESPONSE"; restart_app; else err "Failed: $RESPONSE"; fi
fi

# ══════════════════════════════════════════════════════════════════════════════
#  CLEAR PASSKEYS
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "clear-passkeys" ]; then
  echo ""; info "Clear passkeys on $APP_NAME"; echo ""
  read -p "  User email (or 'all'): " PK_EMAIL; [ -z "$PK_EMAIL" ] && err "Email required"

  if [ "$PK_EMAIL" = "all" ]; then
    warn "This will remove ALL passkeys for ALL users."
    read -p "  Type 'CONFIRM': " PK_CONFIRM
    [ "$PK_CONFIRM" != "CONFIRM" ] && { warn "Cancelled."; exit 0; }
  fi

  TMPJS=$(mktemp /tmp/mu-XXXXX.js)
  cat > "$TMPJS" << 'JSEOF'
const initSqlJs = require('sql.js');
const fs = require('fs');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  if (!fs.existsSync(dbPath)) { console.log('ERROR: Database not found'); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const email = process.env.MU_EMAIL;
  if (email === 'all') {
    db.run("DELETE FROM webauthn_credentials");
    db.run("UPDATE users SET mfa_enabled = 0");
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('SUCCESS: All passkeys cleared.');
  } else {
    const user = db.exec("SELECT id FROM users WHERE email = '" + email + "'");
    if (!user.length || !user[0].values.length) { console.log('ERROR: User not found'); process.exit(1); }
    const uid = user[0].values[0][0];
    db.run("DELETE FROM webauthn_credentials WHERE user_id = " + uid);
    db.run("UPDATE users SET mfa_enabled = 0 WHERE id = " + uid);
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log('SUCCESS: Passkeys cleared for ' + email);
  }
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF

  RESPONSE=$(run_js "$TMPJS" "MU_EMAIL='${PK_EMAIL}'")
  if echo "$RESPONSE" | grep -q "SUCCESS"; then log "$RESPONSE"; restart_app; else err "Failed: $RESPONSE"; fi
fi

# ══════════════════════════════════════════════════════════════════════════════
#  UPDATE WEBAUTHN DOMAIN
# ══════════════════════════════════════════════════════════════════════════════
if [ "$ACTION" = "webauthn" ]; then
  echo ""; info "Update WebAuthn settings"; echo ""
  if $LOCAL; then
    echo "  Current: check WEBAUTHN_RP_ID in .env"
  else
    echo "  Current domain: ${APP_NAME}.azurewebsites.net"
  fi
  read -p "  New domain: " NEW_DOMAIN; [ -z "$NEW_DOMAIN" ] && err "Domain required"
  echo ""; echo "  WEBAUTHN_RP_ID  → $NEW_DOMAIN"; echo "  WEBAUTHN_ORIGIN → https://$NEW_DOMAIN"
  echo ""; warn "Old passkeys will stop working."
  read -p "  Proceed? (y/N) " -n 1 -r; echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && { warn "Cancelled."; exit 0; }

  if $LOCAL; then
    # Update .env file
    if [ -f ".env" ]; then
      sed -i.bak "s|^WEBAUTHN_RP_ID=.*|WEBAUTHN_RP_ID=$NEW_DOMAIN|" .env
      sed -i.bak "s|^WEBAUTHN_ORIGIN=.*|WEBAUTHN_ORIGIN=https://$NEW_DOMAIN|" .env
      rm -f .env.bak
      log "Updated .env file"
    else
      warn "No .env file found — set these manually:"
      echo "  WEBAUTHN_RP_ID=$NEW_DOMAIN"
      echo "  WEBAUTHN_ORIGIN=https://$NEW_DOMAIN"
    fi
  else
    az webapp config appsettings set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
      --settings "WEBAUTHN_RP_ID=$NEW_DOMAIN" "WEBAUTHN_ORIGIN=https://$NEW_DOMAIN" --output none
    log "Settings updated"
  fi

  read -p "  Clear all passkeys? (y/N) " -n 1 -r; echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    TMPJS=$(mktemp /tmp/mu-XXXXX.js)
    cat > "$TMPJS" << 'JSEOF'
const initSqlJs = require('sql.js');
const fs = require('fs');
async function main() {
  const dbPath = '/home/site/wwwroot/data/sa-tool.db';
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  db.run("DELETE FROM webauthn_credentials");
  db.run("UPDATE users SET mfa_enabled = 0");
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('SUCCESS: All passkeys cleared.');
}
main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
JSEOF
    RESPONSE=$(run_js "$TMPJS" "")
    echo "$RESPONSE" | grep -q "SUCCESS" && log "Passkeys cleared" || warn "Could not clear: $RESPONSE"
  fi

  if $LOCAL; then
    restart_app
  else
    az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
    log "App restarting"
  fi
  echo ""; log "Login: https://${NEW_DOMAIN}/admin/login"
  warn "Users must re-register passkeys on the new domain."
fi

echo ""; log "Done."