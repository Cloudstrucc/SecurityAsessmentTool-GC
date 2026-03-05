#!/usr/bin/env bash
set -euo pipefail

# ── Parse flags ────────────────────────────────────────────────────────────────
UPDATE_ONLY=false
SETTINGS_ONLY=false
RESET=false
for arg in "$@"; do
  case $arg in
    --update-only)   UPDATE_ONLY=true ;;
    --settings-only) SETTINGS_ONLY=true ;;
    --reset)         RESET=true ;;
    --help|-h)
      echo "Usage: ./deploy-azure.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (no flags)       Normal deploy — creates resources if needed, deploys code"
      echo "  --update-only    Deploy code only (skip resource creation/checks)"
      echo "  --settings-only  Update app settings only (no code deploy)"
      echo "  --reset          FULL RESET: wipe DB + uploads, re-apply ALL env vars"
      echo "                   from .env file (or prompts), deploy fresh code."
      echo "                   This is a clean-slate reinstall on the existing app."
      echo "  -h, --help       Show this help"
      echo ""
      echo "Environment variables:"
      echo "  AZURE_RESOURCE_GROUP  Resource group name (default: gc-sa-tool-rg)"
      echo "  AZURE_APP_NAME       App Service name (required for --update-only)"
      echo "  AZURE_LOCATION       Azure region (default: canadacentral)"
      echo "  AZURE_SKU            App Service SKU (default: B1)"
      exit 0
      ;;
  esac
done

# ── Configuration ──────────────────────────────────────────────────────────────
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-gc-sa-tool-rg}"
APP_NAME="${AZURE_APP_NAME:-}"
LOCATION="${AZURE_LOCATION:-canadacentral}"
SKU="${AZURE_SKU:-B1}"
NODE_VERSION="20-lts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GC SA&A Tool — Azure App Service Deployment               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────────
info "Running preflight checks..."

if ! command -v az &> /dev/null; then
  err "Azure CLI not found. Install it: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
fi

if ! az account show &> /dev/null; then
  err "Not logged in to Azure. Run: az login"
fi

SUBSCRIPTION=$(az account show --query "name" -o tsv)
log "Azure subscription: $SUBSCRIPTION"

if [ ! -f "package.json" ]; then
  err "No package.json found. Run this script from the project root directory."
fi

if [ ! -f "app.js" ]; then
  err "No app.js found. Run this script from the project root directory."
fi

# ── Discover existing resources ────────────────────────────────────────────────
EXISTING_APP=false
EXISTING_RG=false

# Check if resource group exists
if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
  EXISTING_RG=true
  log "Found existing resource group: $RESOURCE_GROUP"
fi

# If no app name provided, try to find one in the resource group
if [ -z "$APP_NAME" ]; then
  if $EXISTING_RG; then
    # Look for existing app services in the resource group
    FOUND_APPS=$(az webapp list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || true)
    if [ -n "$FOUND_APPS" ]; then
      APP_COUNT=$(echo "$FOUND_APPS" | wc -l | tr -d ' ')
      if [ "$APP_COUNT" -eq 1 ]; then
        APP_NAME="$FOUND_APPS"
        EXISTING_APP=true
        log "Found existing app: $APP_NAME"
      else
        echo ""
        echo "  Apps found in $RESOURCE_GROUP:"
        echo "$FOUND_APPS" | nl -ba
        echo ""
        read -p "  Enter number or app name: " APP_CHOICE
        if [ -z "$APP_CHOICE" ]; then
          err "No app selected."
        fi
        # If input is a number, select from list
        if [[ "$APP_CHOICE" =~ ^[0-9]+$ ]]; then
          APP_NAME=$(echo "$FOUND_APPS" | sed -n "${APP_CHOICE}p")
          if [ -z "$APP_NAME" ]; then
            err "Invalid selection: $APP_CHOICE"
          fi
        else
          APP_NAME="$APP_CHOICE"
        fi
        EXISTING_APP=true
      fi
    else
      APP_NAME="gc-sa-tool-$(openssl rand -hex 4)"
      warn "No existing apps found. Will create: $APP_NAME"
    fi
  else
    APP_NAME="gc-sa-tool-$(openssl rand -hex 4)"
  fi
else
  # App name was provided — check if it exists
  if $EXISTING_RG && az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    EXISTING_APP=true
    log "Found existing app: $APP_NAME"
  fi
fi

APP_SERVICE_PLAN="${APP_NAME}-plan"

# ── Show deployment plan ───────────────────────────────────────────────────────
echo ""
if $RESET; then
  echo -e "  ┌─────────────────────────────────────────┐"
  echo -e "  │  ${RED}${BOLD}MODE: FULL RESET / REINSTALL${NC}            │"
  echo -e "  │  Database will be ${RED}DESTROYED${NC}             │"
  echo -e "  │  All env vars re-applied from .env      │"
  echo -e "  │  All user data will be ${RED}LOST${NC}              │"
  echo -e "  └─────────────────────────────────────────┘"
elif $EXISTING_APP; then
  echo "  ┌─────────────────────────────────────┐"
  echo "  │  MODE: Update existing deployment    │"
  echo "  └─────────────────────────────────────┘"
else
  echo "  ┌─────────────────────────────────────┐"
  echo "  │  MODE: Fresh deployment              │"
  echo "  └─────────────────────────────────────┘"
fi
echo ""
echo "  Resource Group:    $RESOURCE_GROUP $(if $EXISTING_RG; then echo '(exists)'; else echo '(will create)'; fi)"
echo "  App Name:          $APP_NAME $(if $EXISTING_APP; then echo '(exists)'; else echo '(will create)'; fi)"
echo "  Location:          $LOCATION"
if ! $EXISTING_APP; then
  echo "  SKU:               $SKU"
fi
echo ""

if $UPDATE_ONLY && ! $EXISTING_APP; then
  err "--update-only specified but app '$APP_NAME' not found in resource group '$RESOURCE_GROUP'"
fi

if $RESET && ! $EXISTING_APP; then
  err "--reset requires an existing app. Run a normal deploy first to create one."
fi

# ── Confirmation ───────────────────────────────────────────────────────────────
if $RESET; then
  echo -e "  ${RED}${BOLD}⚠  WARNING: This will DESTROY the database, all MFA/passkey${NC}"
  echo -e "  ${RED}${BOLD}   registrations, all assessments, intakes, and user accounts.${NC}"
  echo -e "  ${RED}${BOLD}   The app will restart as if freshly installed.${NC}"
  echo ""
  read -p "  Type 'RESET' to confirm: " CONFIRM_RESET
  if [ "$CONFIRM_RESET" != "RESET" ]; then
    warn "Reset cancelled."
    exit 0
  fi
  echo ""
else
  read -p "  Proceed? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    warn "Deployment cancelled."
    exit 0
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
#  Helper: read setting from .env file, fall back to prompt
# ══════════════════════════════════════════════════════════════════════════════
ENV_FILE=""
[ -f ".env" ]            && ENV_FILE=".env"
[ -f ".env.production" ] && ENV_FILE=".env.production"

read_setting() {
  local KEY="$1" PROMPT="$2" DEFAULT="$3" IS_SECRET="${4:-false}" VALUE=""

  # Try .env file
  if [ -n "$ENV_FILE" ]; then
    VALUE=$(grep -E "^${KEY}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
  fi

  # Skip obvious placeholders
  case "$VALUE" in
    *CHANGE-ME*|*your-*|*ChangeThis*|*sk-ant-api03-your*) VALUE="" ;;
  esac

  if [ -n "$VALUE" ]; then
    if $IS_SECRET; then
      echo -e "${GREEN}[✓]${NC}   $KEY = ********** (from $ENV_FILE)" >&2
    else
      echo -e "${GREEN}[✓]${NC}   $KEY = $VALUE (from $ENV_FILE)" >&2
    fi
  else
    if $IS_SECRET; then
      read -sp "  $PROMPT [$DEFAULT]: " VALUE >&2; echo "" >&2
    else
      read -p "  $PROMPT [$DEFAULT]: " VALUE >&2
    fi
    VALUE="${VALUE:-$DEFAULT}"
  fi

  echo "$VALUE"
}

# ══════════════════════════════════════════════════════════════════════════════
#  --reset: Full wipe + settings upsert + code deploy
# ══════════════════════════════════════════════════════════════════════════════
if $RESET; then

  # ── 1. Collect all settings ───────────────────────────────────────────────
  info "Collecting configuration for reset..."
  [ -n "$ENV_FILE" ] && log "Reading from $ENV_FILE (press Enter to accept, or type new value)"
  echo ""

  R_SESSION_SECRET=$(openssl rand -base64 32)
  echo -e "${CYAN}[→]${NC}   SESSION_SECRET = [auto-generated]" >&2

  R_ADMIN_EMAIL=$(read_setting    "ADMIN_EMAIL"    "Admin email"        "admin@youragency.gc.ca")
  R_ADMIN_PASSWORD=$(read_setting "ADMIN_PASSWORD"  "Admin password"     "$(openssl rand -base64 12)" true)
  R_ADMIN_NAME=$(read_setting     "ADMIN_NAME"      "Admin display name" "Security Assessor")
  echo ""

  R_SMTP_HOST=$(read_setting      "SMTP_HOST"       "SMTP host"          "smtp.office365.com")
  R_SMTP_PORT=$(read_setting      "SMTP_PORT"       "SMTP port"          "587")
  R_SMTP_USER=$(read_setting      "SMTP_USER"       "SMTP user"          "sa-tool@youragency.gc.ca")
  R_SMTP_PASSWORD=$(read_setting  "SMTP_PASSWORD"   "SMTP password"      "" true)
  R_EMAIL_FROM=$(read_setting     "EMAIL_FROM"      "Email from"         "GC SA&A Tool <${R_SMTP_USER}>")
  echo ""

  # OAuth2 (read from .env silently — no interactive prompt)
  R_OAUTH_CID="" R_OAUTH_SEC="" R_OAUTH_REF=""
  if [ -n "$ENV_FILE" ]; then
    R_OAUTH_CID=$(grep -E "^SMTP_OAUTH_CLIENT_ID="     "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
    R_OAUTH_SEC=$(grep -E "^SMTP_OAUTH_CLIENT_SECRET="  "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
    R_OAUTH_REF=$(grep -E "^SMTP_OAUTH_REFRESH_TOKEN="  "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' || true)
  fi

  R_API_KEY=$(read_setting        "ANTHROPIC_API_KEY"  "Anthropic API key"    "" true)
  R_API_MODEL=$(read_setting      "ANTHROPIC_MODEL"    "Anthropic model"      "claude-sonnet-4-20250514")
  echo ""

  DOMAIN="${APP_NAME}.azurewebsites.net"
  R_RP_ID=$(read_setting          "WEBAUTHN_RP_ID"     "WebAuthn RP ID"       "$DOMAIN")
  R_ORIGIN=$(read_setting         "WEBAUTHN_ORIGIN"    "WebAuthn Origin URL"  "https://$DOMAIN")
  R_MAX_FILE=$(read_setting       "MAX_FILE_SIZE_MB"   "Max file size (MB)"   "25")
  echo ""

  # Provisioning settings (root site only)
  echo -e "${CYAN}[→]${NC}   Provisioning / Root Site Settings:" >&2
  R_PROVISIONING=$(read_setting   "PROVISIONING_ENABLED" "Enable provisioning? (true/false)" "false")
  if [ "$R_PROVISIONING" = "true" ]; then
    R_AZ_TENANT=$(read_setting    "AZURE_TENANT_ID"       "Azure Tenant ID"         "")
    R_AZ_CLIENT=$(read_setting    "AZURE_CLIENT_ID"       "Azure Client ID (SP)"    "")
    R_AZ_SECRET=$(read_setting    "AZURE_CLIENT_SECRET"   "Azure Client Secret"     "" true)
    R_AZ_SUB=$(read_setting       "AZURE_SUBSCRIPTION_ID" "Azure Subscription ID"   "$(az account show --query id -o tsv 2>/dev/null || true)")
    R_ALTCHA_SECRET=$(read_setting "ALTCHA_HMAC_SECRET"   "ALTCHA HMAC Secret"      "" true)
  fi
  echo ""

  # ── 2. Stop the app ──────────────────────────────────────────────────────
  info "Stopping app..."
  az webapp stop --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null || true
  log "App stopped"

  # ── 3. Wipe database + uploads via Kudu VFS API ─────────────────────────
  info "Wiping database and uploads..."

  CREDS=$(az webapp deployment list-publishing-credentials \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --query "{u:publishingUserName,p:publishingPassword}" -o tsv 2>/dev/null)
  KUDU_USER=$(echo "$CREDS" | cut -f1)
  KUDU_PASS=$(echo "$CREDS" | cut -f2)
  KUDU_URL="https://${APP_NAME}.scm.azurewebsites.net"

  DB_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -u "${KUDU_USER}:${KUDU_PASS}" \
    "${KUDU_URL}/api/vfs/site/wwwroot/data/sa-tool.db" \
    -H "If-Match: *" 2>/dev/null || echo "000")

  case "$DB_HTTP" in
    200|204) log "Database deleted via Kudu" ;;
    404)     log "Database already absent (clean)" ;;
    *)
      warn "Kudu returned HTTP $DB_HTTP — setting startup command as fallback"
      az webapp config set \
        --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
        --startup-file "node app.js" \
        --output none
      ;;
  esac

  # Clean uploads
  curl -s -X DELETE -u "${KUDU_USER}:${KUDU_PASS}" \
    "${KUDU_URL}/api/vfs/site/wwwroot/uploads/?recursive=true" \
    -H "If-Match: *" 2>/dev/null || true
  log "Uploads cleaned"

  # ── 4. Upsert ALL app settings ──────────────────────────────────────────
  info "Applying all app settings (full upsert)..."

  SETTINGS_CMD=(
    "NODE_ENV=production"
    "PORT=8080"
    "SESSION_SECRET=$R_SESSION_SECRET"
    "ADMIN_EMAIL=$R_ADMIN_EMAIL"
    "ADMIN_PASSWORD=$R_ADMIN_PASSWORD"
    "ADMIN_NAME=$R_ADMIN_NAME"
    "SMTP_HOST=$R_SMTP_HOST"
    "SMTP_PORT=$R_SMTP_PORT"
    "SMTP_USER=$R_SMTP_USER"
    "EMAIL_FROM=$R_EMAIL_FROM"
    "ANTHROPIC_MODEL=$R_API_MODEL"
    "MAX_FILE_SIZE_MB=$R_MAX_FILE"
    "WEBAUTHN_RP_ID=$R_RP_ID"
    "WEBAUTHN_ORIGIN=$R_ORIGIN"
    "WEBSITE_NODE_DEFAULT_VERSION=~20"
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE=true"
    "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
  )

  # Secrets — only include if they have actual values (don't blank existing)
  [ -n "$R_SMTP_PASSWORD" ] && SETTINGS_CMD+=("SMTP_PASSWORD=$R_SMTP_PASSWORD")
  [ -n "$R_API_KEY" ]       && SETTINGS_CMD+=("ANTHROPIC_API_KEY=$R_API_KEY")
  [ -n "$R_OAUTH_CID" ]     && SETTINGS_CMD+=("SMTP_OAUTH_CLIENT_ID=$R_OAUTH_CID")
  [ -n "$R_OAUTH_SEC" ]     && SETTINGS_CMD+=("SMTP_OAUTH_CLIENT_SECRET=$R_OAUTH_SEC")
  [ -n "$R_OAUTH_REF" ]     && SETTINGS_CMD+=("SMTP_OAUTH_REFRESH_TOKEN=$R_OAUTH_REF")

  # Provisioning settings (root site)
  if [ "$R_PROVISIONING" = "true" ]; then
    SETTINGS_CMD+=("PROVISIONING_ENABLED=true")
    [ -n "$R_AZ_TENANT" ]      && SETTINGS_CMD+=("AZURE_TENANT_ID=$R_AZ_TENANT")
    [ -n "$R_AZ_CLIENT" ]      && SETTINGS_CMD+=("AZURE_CLIENT_ID=$R_AZ_CLIENT")
    [ -n "$R_AZ_SECRET" ]      && SETTINGS_CMD+=("AZURE_CLIENT_SECRET=$R_AZ_SECRET")
    [ -n "$R_AZ_SUB" ]         && SETTINGS_CMD+=("AZURE_SUBSCRIPTION_ID=$R_AZ_SUB")
    [ -n "$R_ALTCHA_SECRET" ]  && SETTINGS_CMD+=("ALTCHA_HMAC_SECRET=$R_ALTCHA_SECRET")
  fi

  az webapp config appsettings set \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --settings "${SETTINGS_CMD[@]}" --output none
  log "All settings applied (${#SETTINGS_CMD[@]} variables)"

  # Set clean startup command (also removes any leftover Oryx tar.gz on boot)
  az webapp config set \
    --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --startup-file "rm -f /home/site/wwwroot/node_modules.tar.gz /home/site/wwwroot/oryx-manifest.toml /home/site/wwwroot/.oryx_all_node_modules_copied_marker && node app.js" \
    --output none

  info "Waiting 30s for SCM container to settle after settings update..."
  sleep 30

  info "Proceeding to code deployment..."
  echo ""

fi

# ── Create resources (only if they don't exist) ───────────────────────────────
if ! $UPDATE_ONLY && ! $RESET; then

  # Resource Group
  if ! $EXISTING_RG; then
    info "Creating resource group: $RESOURCE_GROUP"
    az group create \
      --name "$RESOURCE_GROUP" \
      --location "$LOCATION" \
      --output none
    log "Resource group created"
  fi

  # App Service Plan + Web App
  if ! $EXISTING_APP; then
    info "Creating App Service plan: $APP_SERVICE_PLAN ($SKU)"
    az appservice plan create \
      --name "$APP_SERVICE_PLAN" \
      --resource-group "$RESOURCE_GROUP" \
      --sku "$SKU" \
      --is-linux \
      --output none
    log "App Service plan created"

    info "Creating web app: $APP_NAME"
    az webapp create \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --plan "$APP_SERVICE_PLAN" \
      --runtime "NODE|$NODE_VERSION" \
      --output none
    log "Web app created"

    # ── First-time app settings ────────────────────────────────────────────
    info "Configuring app settings (first-time setup)..."

    SESSION_SECRET=$(openssl rand -base64 32)
    DOMAIN="${APP_NAME}.azurewebsites.net"

    echo ""
    read -p "  Admin email [admin@youragency.gc.ca]: " ADMIN_EMAIL
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@youragency.gc.ca}"

    read -sp "  Admin password [auto-generated]: " ADMIN_PASSWORD
    echo ""
    if [ -z "$ADMIN_PASSWORD" ]; then
      ADMIN_PASSWORD=$(openssl rand -base64 16)
      warn "Generated admin password: $ADMIN_PASSWORD"
      warn "Save this — it won't be shown again!"
    fi

    read -p "  Admin display name [Administrator]: " ADMIN_NAME
    ADMIN_NAME="${ADMIN_NAME:-Administrator}"

    echo ""
    read -p "  Is this the root provisioning site? (y/N) " -n 1 -r IS_ROOT
    echo ""

    FIRST_DEPLOY_SETTINGS=(
        "NODE_ENV=production"
        "PORT=8080"
        "SESSION_SECRET=$SESSION_SECRET"
        "ADMIN_EMAIL=$ADMIN_EMAIL"
        "ADMIN_PASSWORD=$ADMIN_PASSWORD"
        "ADMIN_NAME=$ADMIN_NAME"
        "WEBAUTHN_RP_ID=$DOMAIN"
        "WEBAUTHN_ORIGIN=https://$DOMAIN"
        "WEBSITE_NODE_DEFAULT_VERSION=~20"
        "WEBSITES_ENABLE_APP_SERVICE_STORAGE=true"
        "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
    )

    if [[ "$IS_ROOT" =~ ^[Yy]$ ]]; then
      echo ""
      info "Configuring provisioning (Service Principal required)..."
      echo ""

      AZ_SUB_DEFAULT=$(az account show --query id -o tsv 2>/dev/null || true)
      read -p "  Azure Tenant ID: " P_TENANT_ID
      read -p "  Azure Client ID (Service Principal): " P_CLIENT_ID
      read -sp "  Azure Client Secret: " P_CLIENT_SECRET; echo ""
      read -p "  Azure Subscription ID [$AZ_SUB_DEFAULT]: " P_SUB_ID
      P_SUB_ID="${P_SUB_ID:-$AZ_SUB_DEFAULT}"
      read -sp "  ALTCHA HMAC Secret (blank to auto-generate): " P_ALTCHA_SECRET; echo ""
      if [ -z "$P_ALTCHA_SECRET" ]; then
        P_ALTCHA_SECRET=$(openssl rand -base64 32)
        echo "    → Auto-generated ALTCHA secret"
      fi

      FIRST_DEPLOY_SETTINGS+=("PROVISIONING_ENABLED=true")
      [ -n "$P_TENANT_ID" ]      && FIRST_DEPLOY_SETTINGS+=("AZURE_TENANT_ID=$P_TENANT_ID")
      [ -n "$P_CLIENT_ID" ]      && FIRST_DEPLOY_SETTINGS+=("AZURE_CLIENT_ID=$P_CLIENT_ID")
      [ -n "$P_CLIENT_SECRET" ]  && FIRST_DEPLOY_SETTINGS+=("AZURE_CLIENT_SECRET=$P_CLIENT_SECRET")
      [ -n "$P_SUB_ID" ]         && FIRST_DEPLOY_SETTINGS+=("AZURE_SUBSCRIPTION_ID=$P_SUB_ID")
      [ -n "$P_ALTCHA_SECRET" ]  && FIRST_DEPLOY_SETTINGS+=("ALTCHA_HMAC_SECRET=$P_ALTCHA_SECRET")
    fi

    az webapp config appsettings set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --settings "${FIRST_DEPLOY_SETTINGS[@]}" \
      --output none
    log "App settings configured"

    info "Setting startup command..."
    az webapp config set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --startup-file "rm -f /home/site/wwwroot/node_modules.tar.gz /home/site/wwwroot/oryx-manifest.toml /home/site/wwwroot/.oryx_all_node_modules_copied_marker && node app.js" \
      --output none
    log "Startup command set"

    info "Enabling application logging..."
    az webapp log config \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --application-logging filesystem \
      --level information \
      --output none
    log "Logging enabled"

  else
    log "Skipping resource creation — app already exists"
  fi

fi

# ── Settings-only mode ─────────────────────────────────────────────────────────
if $SETTINGS_ONLY; then
  info "Updating app settings..."
  echo ""
  echo "  Enter settings to update (leave blank to keep current value):"
  echo ""

  read -p "  Admin email: " NEW_EMAIL
  read -sp "  Admin password: " NEW_PASSWORD
  echo ""
  read -p "  Admin display name: " NEW_NAME
  read -p "  Anthropic API key: " NEW_API_KEY
  read -p "  SMTP user: " NEW_SMTP_USER
  read -sp "  SMTP password: " NEW_SMTP_PASS
  echo ""
  read -p "  WebAuthn RP ID: " NEW_RP_ID
  read -p "  WebAuthn Origin: " NEW_ORIGIN

  SETTINGS_ARGS=()
  [ -n "$NEW_EMAIL" ]     && SETTINGS_ARGS+=("ADMIN_EMAIL=$NEW_EMAIL")
  [ -n "$NEW_PASSWORD" ]  && SETTINGS_ARGS+=("ADMIN_PASSWORD=$NEW_PASSWORD")
  [ -n "$NEW_NAME" ]      && SETTINGS_ARGS+=("ADMIN_NAME=$NEW_NAME")
  [ -n "$NEW_API_KEY" ]   && SETTINGS_ARGS+=("ANTHROPIC_API_KEY=$NEW_API_KEY")
  [ -n "$NEW_SMTP_USER" ] && SETTINGS_ARGS+=("SMTP_USER=$NEW_SMTP_USER")
  [ -n "$NEW_SMTP_PASS" ] && SETTINGS_ARGS+=("SMTP_PASSWORD=$NEW_SMTP_PASS")
  [ -n "$NEW_RP_ID" ]     && SETTINGS_ARGS+=("WEBAUTHN_RP_ID=$NEW_RP_ID")
  [ -n "$NEW_ORIGIN" ]    && SETTINGS_ARGS+=("WEBAUTHN_ORIGIN=$NEW_ORIGIN")

  if [ ${#SETTINGS_ARGS[@]} -gt 0 ]; then
    az webapp config appsettings set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --settings "${SETTINGS_ARGS[@]}" \
      --output none
    log "Settings updated (${#SETTINGS_ARGS[@]} values changed)"

    if [ -n "$NEW_EMAIL" ] || [ -n "$NEW_PASSWORD" ]; then
      echo ""
      warn "Admin credentials changed. The default admin is only created at first boot."
      warn "To apply: ./deploy-azure.sh --reset  OR  SSH in and delete data/sa-tool.db"
    fi
  else
    warn "No settings changed."
  fi

  echo ""
  log "Done. No code deployed."
  exit 0
fi

# ── Pre-deploy cleanup: remove leftover Oryx artifacts from Azure ─────────────
info "Removing leftover Oryx artifacts from Azure (if any)..."
for ARTIFACT in "node_modules.tar.gz" "oryx-manifest.toml" ".oryx_all_node_modules_copied_marker"; do
  RESULT=$(az rest --method DELETE \
    --url "https://${APP_NAME}.scm.azurewebsites.net/api/vfs/site/wwwroot/${ARTIFACT}" \
    --headers "If-Match=*" 2>&1 || true)
  if echo "$RESULT" | grep -q "404\|ResourceNotFound\|does not exist"; then
    log "$ARTIFACT not present (clean)"
  elif echo "$RESULT" | grep -q "error\|Error"; then
    warn "Could not remove $ARTIFACT — startup command will handle it"
  else
    log "Removed $ARTIFACT"
  fi
done

# ── Stamp git commit into app settings for version validation ──────────────────
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
az webapp config appsettings set \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --settings "APP_VERSION=$GIT_SHA" \
  --output none 2>/dev/null
log "Version stamp: $GIT_SHA"

# ── Deploy code via ZIP ────────────────────────────────────────────────────────
info "Installing dependencies locally..."
npm install --omit=dev --no-audit --no-fund > /dev/null 2>&1
log "Dependencies installed ($(ls node_modules | wc -l | tr -d ' ') packages)"

info "Packaging application for deployment..."

mkdir -p data uploads uploads/intakes

DEPLOY_ZIP="/tmp/gc-sa-tool-deploy-$(date +%s).zip"
zip -r "$DEPLOY_ZIP" . \
  -x "*.git*" \
  -x "*.env" \
  -x ".env.*" \
  -x "deploy-azure.sh" \
  -x "provision-tenant.sh" \
  -x "data/*.db" \
  -x "uploads/*" \
  -x "*.tar.gz" \
  -x "cookies.txt" \
  -x ".DS_Store" \
  -x "provisioning-status/*" \
  -x "oryx-manifest.toml" \
  -x ".oryx_all_node_modules_copied_marker" \
  > /dev/null

DEPLOY_SIZE=$(du -sh "$DEPLOY_ZIP" | cut -f1)
log "Deployment package ready ($DEPLOY_SIZE — includes node_modules)"

info "Deploying to Azure (this may take 2-5 minutes)..."
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$DEPLOY_ZIP" \
  --type zip \
  --async true \
  --output none

# Wait for deployment to finish (poll Kudu)
info "Waiting for deployment to complete..."
KUDU_CREDS=$(az webapp deployment list-publishing-credentials \
  --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --query "{u:publishingUserName,p:publishingPassword}" -o tsv 2>/dev/null)
KUDU_AUTH=$(echo "$KUDU_CREDS" | tr '\t' ':')
DEPLOY_DONE=false
for i in $(seq 1 30); do
  sleep 10
  STATUS=$(curl -s -u "$KUDU_AUTH" \
    "https://${APP_NAME}.scm.azurewebsites.net/api/deployments/latest" 2>/dev/null \
    | grep -o '"status":[0-9]*' | head -1 | cut -d: -f2 || echo "")
  if [ "$STATUS" = "4" ]; then
    DEPLOY_DONE=true; break
  elif [ "$STATUS" = "3" ]; then
    err "Deployment failed. Check: az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
  fi
  printf "."
done
echo ""
if $DEPLOY_DONE; then
  log "Deployment complete"
else
  warn "Deployment may still be in progress — check logs"
fi

rm -f "$DEPLOY_ZIP"

# ── Version validation ─────────────────────────────────────────────────────────
info "Validating deployed version..."
sleep 10
DEPLOYED_VERSION=$(curl -s "https://${APP_NAME}.azurewebsites.net/health" 2>/dev/null \
  | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "")
if [ "$DEPLOYED_VERSION" = "$GIT_SHA" ]; then
  log "Version validated: $GIT_SHA is live ✓"
elif [ -n "$DEPLOYED_VERSION" ]; then
  warn "Version mismatch — live: $DEPLOYED_VERSION, expected: $GIT_SHA"
  warn "App may still be restarting. Re-check: curl https://${APP_NAME}.azurewebsites.net/health"
else
  warn "Could not reach /health yet — app may still be starting up"
fi

# ── Start app + health check (reset mode stopped it earlier) ──────────────────
if $RESET; then
  info "Starting app..."
  az webapp start --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
  log "App started"

  info "Waiting for initialization (15s)..."
  sleep 15

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${APP_NAME}.azurewebsites.net/" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "302" ]; then
    log "App is responding (HTTP $HTTP_STATUS)"
  else
    warn "App returned HTTP $HTTP_STATUS — may still be starting up"
    warn "Tail logs: az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
  fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
if $RESET; then
echo "║   Full Reset Complete!                                      ║"
elif $EXISTING_APP; then
echo "║   Update Complete!                                          ║"
else
echo "║   Deployment Complete!                                      ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:        $APP_URL"
echo "  Admin Login:    $APP_URL/admin/login"
echo "  Client Portal:  $APP_URL/client/login"
echo "  Intake Form:    $APP_URL/intake"
echo ""
echo "  Resource Group: $RESOURCE_GROUP"
echo "  App Name:       $APP_NAME"
echo ""
if $RESET; then
  echo -e "  ${GREEN}Status:${NC}  Fresh database — all 12 migrations will run on first request"
  echo -e "  ${GREEN}Admin:${NC}   $R_ADMIN_EMAIL"
  echo -e "  ${GREEN}RP ID:${NC}   $R_RP_ID"
  echo -e "  ${GREEN}Origin:${NC}  $R_ORIGIN"
  echo ""
  echo "  All passkey registrations cleared — users must re-enroll."
  echo ""
fi
echo "  Commands:"
echo "  ─────────────────────────────────────────────────────────────"
echo "  Redeploy code:   ./deploy-azure.sh --update-only"
echo "  Update settings: ./deploy-azure.sh --settings-only"
echo "  Full reset:      ./deploy-azure.sh --reset"
echo "  View logs:       az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Restart app:     az webapp restart --name $APP_NAME -g $RESOURCE_GROUP"
echo "  SSH into app:    az webapp ssh --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Delete all:      az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
if ! $EXISTING_APP && ! $RESET; then
  warn "Note: SQLite is suitable for single-instance use. For production scale,"
  warn "consider migrating to Azure SQL or Cosmos DB."
  echo ""
fi