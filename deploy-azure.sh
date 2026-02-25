#!/bin/bash
###############################################################################
# GC SA&A Tool — Azure App Service Deployment Script
#
# Supports both fresh deployments and updates to existing App Services.
# On subsequent runs, it detects existing resources and only deploys code.
#
# Prerequisites:
#   - Azure CLI installed (https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
#   - Logged in: az login
#   - Node.js project in current directory
#
# Usage:
#   chmod +x deploy-azure.sh
#   ./deploy-azure.sh                  # Auto-detect or create
#   ./deploy-azure.sh --update-only    # Skip all resource creation, deploy code only
#
# Optional environment overrides (set before running):
#   export AZURE_RESOURCE_GROUP="my-rg"
#   export AZURE_APP_NAME="my-app-name"
#   export AZURE_LOCATION="canadacentral"
#   export AZURE_SKU="B1"
###############################################################################

set -euo pipefail

# ── Parse flags ────────────────────────────────────────────────────────────────
UPDATE_ONLY=false
SETTINGS_ONLY=false
for arg in "$@"; do
  case $arg in
    --update-only)  UPDATE_ONLY=true ;;
    --settings-only) SETTINGS_ONLY=true ;;
    --help|-h)
      echo "Usage: ./deploy-azure.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --update-only    Deploy code only (skip resource creation/checks)"
      echo "  --settings-only  Update app settings only (no code deploy)"
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
        echo "  Multiple apps found in $RESOURCE_GROUP:"
        echo "$FOUND_APPS" | nl -ba
        echo ""
        read -p "  Enter the app name to update: " APP_NAME
        if [ -z "$APP_NAME" ]; then
          err "No app name provided."
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
if $EXISTING_APP; then
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

read -p "  Proceed? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  warn "Deployment cancelled."
  exit 0
fi

# ── Create resources (only if they don't exist) ───────────────────────────────
if ! $UPDATE_ONLY; then

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
        WEBSITE_NODE_DEFAULT_VERSION="~20" \
        WEBSITES_ENABLE_APP_SERVICE_STORAGE="true" \
      --output none
    log "App settings configured"

    info "Setting startup command..."
    az webapp config set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --startup-file "node app.js" \
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

  SETTINGS_ARGS=()
  [ -n "$NEW_EMAIL" ]    && SETTINGS_ARGS+=("ADMIN_EMAIL=$NEW_EMAIL")
  [ -n "$NEW_PASSWORD" ] && SETTINGS_ARGS+=("ADMIN_PASSWORD=$NEW_PASSWORD")
  [ -n "$NEW_NAME" ]     && SETTINGS_ARGS+=("ADMIN_NAME=$NEW_NAME")

  if [ ${#SETTINGS_ARGS[@]} -gt 0 ]; then
    az webapp config appsettings set \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --settings "${SETTINGS_ARGS[@]}" \
      --output none
    log "Settings updated (${#SETTINGS_ARGS[@]} values changed)"
  else
    warn "No settings changed."
  fi

  echo ""
  log "Done. No code deployed."
  exit 0
fi

# ── Deploy code via ZIP ────────────────────────────────────────────────────────
info "Packaging application for deployment..."

mkdir -p data uploads uploads/intakes

npm install --omit=dev --quiet 2>/dev/null

DEPLOY_ZIP="/tmp/gc-sa-tool-deploy-$(date +%s).zip"
zip -r "$DEPLOY_ZIP" . \
  -x "*.git*" \
  -x "node_modules/.cache/*" \
  -x "*.env" \
  -x "deploy-azure.sh" \
  -x "data/*.db" \
  -x "uploads/*" \
  -x "*.tar.gz" \
  -x "cookies.txt" \
  -x ".DS_Store" \
  > /dev/null

DEPLOY_SIZE=$(du -sh "$DEPLOY_ZIP" | cut -f1)
log "Deployment package ready ($DEPLOY_SIZE)"

info "Deploying to Azure (this may take 2-5 minutes)..."
az webapp deploy \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src-path "$DEPLOY_ZIP" \
  --type zip \
  --output none
log "Deployment complete"

rm -f "$DEPLOY_ZIP"

# ── Done ───────────────────────────────────────────────────────────────────────
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
if $EXISTING_APP; then
echo "║   Update Complete!                                          ║"
else
echo "║   Deployment Complete!                                      ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:        $APP_URL"
echo "  Admin Login:    $APP_URL/admin/login"
echo "  Intake Form:    $APP_URL/intake"
echo ""
echo "  Resource Group: $RESOURCE_GROUP"
echo "  App Name:       $APP_NAME"
echo ""
echo "  Commands:"
echo "  ─────────────────────────────────────────────────────────────"
echo "  Redeploy code:  ./deploy-azure.sh --update-only"
echo "  Update settings:./deploy-azure.sh --settings-only"
echo "  View logs:      az webapp log tail --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Restart app:    az webapp restart --name $APP_NAME -g $RESOURCE_GROUP"
echo "  SSH into app:   az webapp ssh --name $APP_NAME -g $RESOURCE_GROUP"
echo "  Delete all:     az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
if ! $EXISTING_APP; then
  warn "Note: SQLite is suitable for single-instance use. For production scale,"
  warn "consider migrating to Azure SQL or Cosmos DB."
  echo ""
fi
