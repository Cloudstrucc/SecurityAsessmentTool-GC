#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# provision-tenant.sh — Non-interactive tenant provisioning for self-service signup
# Called by the product signup route. Writes progress to a JSON status file.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── Arguments ──
JOB_ID=""
ORG_SLUG=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_NAME=""
STATUS_FILE=""
DB_PATH=""
AZURE_LOCATION="${AZURE_LOCATION:-canadacentral}"
AZURE_SKU="${AZURE_SKU:-B1}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --job-id)        JOB_ID="$2"; shift 2 ;;
    --org)           ORG_SLUG="$2"; shift 2 ;;
    --email)         ADMIN_EMAIL="$2"; shift 2 ;;
    --password)      ADMIN_PASSWORD="$2"; shift 2 ;;
    --name)          ADMIN_NAME="$2"; shift 2 ;;
    --status-file)   STATUS_FILE="$2"; shift 2 ;;
    --db-path)       DB_PATH="$2"; shift 2 ;;
    --location)      AZURE_LOCATION="$2"; shift 2 ;;
    --sku)           AZURE_SKU="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$JOB_ID" ] || [ -z "$ORG_SLUG" ] || [ -z "$ADMIN_EMAIL" ]; then
  echo "Missing required arguments" >&2
  exit 1
fi

# ── Naming ──
APP_NAME="vcs-sa-${ORG_SLUG}"
RESOURCE_GROUP="vcs-sa-${ORG_SLUG}-rg"
APP_SERVICE_PLAN="${APP_NAME}-plan"
DOMAIN="${APP_NAME}.azurewebsites.net"
INSTANCE_URL="https://${DOMAIN}"
NODE_VERSION="20-lts"

# ── Status update helper ──
update_status() {
  local STATUS="$1" PROGRESS="$2" STEP="$3" ERROR="${4:-}"
  
  # Update status file (for fast polling)
  cat > "$STATUS_FILE" << EOF
{
  "job_id": "$JOB_ID",
  "status": "$STATUS",
  "progress": $PROGRESS,
  "step": "$STEP",
  "app_name": "$APP_NAME",
  "instance_url": "$INSTANCE_URL",
  "error": "$ERROR"
}
EOF

  # Also update database
  if [ -n "$DB_PATH" ] && command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" "UPDATE provisioning_jobs SET status='$STATUS', progress=$PROGRESS, step='$(echo "$STEP" | sed "s/'/''/g")', app_name='$APP_NAME', instance_url='$INSTANCE_URL', error_message='$(echo "$ERROR" | sed "s/'/''/g")' $([ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && echo ", completed_at=CURRENT_TIMESTAMP") WHERE job_id='$JOB_ID';" 2>/dev/null || true
  fi
}

# ── Trap errors ──
on_error() {
  update_status "failed" "$CURRENT_PROGRESS" "Provisioning failed" "An error occurred at step: $CURRENT_STEP"
  exit 1
}
trap on_error ERR

CURRENT_PROGRESS=0
CURRENT_STEP="Initializing"

# ═══════════════════════════════════════════════════════════════
# STEP 1: Validate Azure CLI
# ═══════════════════════════════════════════════════════════════
update_status "running" 5 "Checking Azure credentials..."
CURRENT_STEP="Azure CLI check" CURRENT_PROGRESS=5

if ! command -v az &>/dev/null; then
  update_status "failed" 5 "Azure CLI not found" "Azure CLI is not installed on the provisioning server."
  exit 1
fi

if ! az account show &>/dev/null 2>&1; then
  update_status "failed" 5 "Azure not authenticated" "Azure CLI is not logged in. Contact support."
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# STEP 2: Create Resource Group
# ═══════════════════════════════════════════════════════════════
update_status "running" 15 "Creating resource group..."
CURRENT_STEP="Resource group" CURRENT_PROGRESS=15

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --output none 2>&1

# ═══════════════════════════════════════════════════════════════
# STEP 3: Create App Service Plan
# ═══════════════════════════════════════════════════════════════
update_status "running" 25 "Creating App Service plan..."
CURRENT_STEP="App Service Plan" CURRENT_PROGRESS=25

az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku "$AZURE_SKU" \
  --is-linux \
  --output none 2>&1

# ═══════════════════════════════════════════════════════════════
# STEP 4: Create Web App
# ═══════════════════════════════════════════════════════════════
update_status "running" 40 "Creating web application..."
CURRENT_STEP="Web App" CURRENT_PROGRESS=40

az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE|$NODE_VERSION" \
  --output none 2>&1

# ═══════════════════════════════════════════════════════════════
# STEP 5: Configure App Settings
# ═══════════════════════════════════════════════════════════════
update_status "running" 55 "Configuring environment and credentials..."
CURRENT_STEP="App Settings" CURRENT_PROGRESS=55

SESSION_SECRET=$(openssl rand -base64 32)

az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV="production" \
    PORT="8080" \
    SESSION_SECRET="$SESSION_SECRET" \
    ADMIN_EMAIL="$ADMIN_EMAIL" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    ADMIN_NAME="$ADMIN_NAME" \
    WEBAUTHN_RP_ID="$DOMAIN" \
    WEBAUTHN_ORIGIN="$INSTANCE_URL" \
    WEBSITE_NODE_DEFAULT_VERSION="~20" \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE="true" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
    PLAN_TIER="trial" \
    MAX_ASSESSMENTS="3" \
    DAILY_ASSESSMENT_LIMIT="1" \
    AI_TOKEN_LIMIT="25000" \
  --output none 2>&1

# ── Startup command ──
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "[ -L node_modules ] && rm -f node_modules || true; [ -d _del_node_modules ] && mv _del_node_modules node_modules || true; rm -f oryx-manifest.toml node_modules.tar.gz .oryx_all_node_modules_copied_marker; node app.js" \
  --output none 2>&1

# ── Enable logging ──
az webapp log config \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --application-logging filesystem \
  --level information \
  --output none 2>&1

# ═══════════════════════════════════════════════════════════════
# STEP 6: Package and Deploy Code
# ═══════════════════════════════════════════════════════════════
update_status "running" 65 "Packaging application..."
CURRENT_STEP="Code packaging" CURRENT_PROGRESS=65

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ZIP="/tmp/vcs-deploy-${JOB_ID}.zip"

cd "$SCRIPT_DIR"

# Ensure node_modules exists (tenant needs them — no npm install during deploy)
if [ ! -d "node_modules" ] || [ ! -d "node_modules/dotenv" ]; then
  npm install --production --no-audit --no-fund > /dev/null 2>&1
fi
mkdir -p data uploads uploads/intakes

zip -r "$DEPLOY_ZIP" . \
  -x "*.git*" \
  -x "node_modules/@azure/*" \
  -x "*.env" \
  -x ".env.*" \
  -x "deploy-azure.sh" \
  -x "provision-tenant.sh" \
  -x "data/*.db" \
  -x "uploads/*" \
  -x "*.tar.gz" \
  -x ".DS_Store" \
  -x "provisioning-status/*" \
  -x "oryx-manifest.toml" \
  -x ".oryx_all_node_modules_copied_marker" \
  -x "_del_node_modules/*" \
  -x "cookies.txt" \
  > /dev/null 2>&1

update_status "running" 75 "Deploying to Azure (this may take 3–5 minutes)..."
CURRENT_STEP="Code deploy" CURRENT_PROGRESS=75

az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$DEPLOY_ZIP" \
  --type zip \
  --output none 2>&1

rm -f "$DEPLOY_ZIP"

# ═══════════════════════════════════════════════════════════════
# STEP 7: Wait for Instance Health
# ═══════════════════════════════════════════════════════════════
update_status "running" 90 "Waiting for instance to become healthy..."
CURRENT_STEP="Health check" CURRENT_PROGRESS=90

MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${INSTANCE_URL}/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTHY=true
    break
  fi
  sleep 10
done

if ! $HEALTHY; then
  update_status "running" 95 "Instance deployed — finalizing startup..."
  sleep 15
fi

# ═══════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════
update_status "completed" 100 "Your instance is ready!"
exit 0