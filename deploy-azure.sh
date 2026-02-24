#!/bin/bash
###############################################################################
# GC SA&A Tool — Azure App Service Deployment Script
#
# Prerequisites:
#   - Azure CLI installed (https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
#   - Logged in: az login
#   - Node.js project in current directory
#
# Usage:
#   chmod +x deploy-azure.sh
#   ./deploy-azure.sh
#
# Optional environment overrides (set before running):
#   export AZURE_RESOURCE_GROUP="my-rg"
#   export AZURE_APP_NAME="my-app-name"
#   export AZURE_LOCATION="canadacentral"
#   export AZURE_SKU="B1"
###############################################################################

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-gc-sa-tool-rg}"
APP_NAME="${AZURE_APP_NAME:-gc-sa-tool-$(openssl rand -hex 4)}"
LOCATION="${AZURE_LOCATION:-canadacentral}"
SKU="${AZURE_SKU:-B1}"
NODE_VERSION="20-lts"
APP_SERVICE_PLAN="${APP_NAME}-plan"

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

SUBSCRIPTION=$(az account show --query "{name:name, id:id}" -o tsv)
log "Azure subscription: $SUBSCRIPTION"

if [ ! -f "package.json" ]; then
  err "No package.json found. Run this script from the project root directory."
fi

if [ ! -f "app.js" ]; then
  err "No app.js found. Run this script from the project root directory."
fi

# ── Confirm deployment settings ────────────────────────────────────────────────
echo ""
echo "  Deployment Settings:"
echo "  ─────────────────────────────────────"
echo "  Resource Group:    $RESOURCE_GROUP"
echo "  App Name:          $APP_NAME"
echo "  Location:          $LOCATION"
echo "  SKU:               $SKU"
echo "  Node Version:      $NODE_VERSION"
echo "  ─────────────────────────────────────"
echo ""
read -p "  Proceed with deployment? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  warn "Deployment cancelled."
  exit 0
fi

# ── Create Resource Group ──────────────────────────────────────────────────────
info "Creating resource group: $RESOURCE_GROUP"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
log "Resource group ready"

# ── Create App Service Plan ────────────────────────────────────────────────────
info "Creating App Service plan: $APP_SERVICE_PLAN ($SKU)"
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku "$SKU" \
  --is-linux \
  --output none
log "App Service plan ready"

# ── Create Web App ─────────────────────────────────────────────────────────────
info "Creating web app: $APP_NAME"
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE|$NODE_VERSION" \
  --output none
log "Web app created"

# ── Configure App Settings ─────────────────────────────────────────────────────
info "Configuring app settings..."

# Generate a random session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Prompt for admin credentials
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
  --output none
log "App settings configured"

# ── Configure startup command ──────────────────────────────────────────────────
info "Setting startup command..."
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "node app.js" \
  --output none
log "Startup command set"

# ── Enable persistent storage ──────────────────────────────────────────────────
# Required for SQLite database and uploads to survive restarts
info "Enabling persistent storage..."
az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings WEBSITES_ENABLE_APP_SERVICE_STORAGE="true" \
  --output none
log "Persistent storage enabled"

# ── Ensure directories exist ───────────────────────────────────────────────────
info "Creating required directories..."
mkdir -p data uploads data/exports
log "Directories ready"

# ── Deploy via ZIP ─────────────────────────────────────────────────────────────
info "Packaging application for deployment..."

# Install production dependencies
npm install --omit=dev --quiet 2>/dev/null

# Create deployment zip (exclude dev files)
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

# Clean up
rm -f "$DEPLOY_ZIP"

# ── Configure logging ──────────────────────────────────────────────────────────
info "Enabling application logging..."
az webapp log config \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --application-logging filesystem \
  --level information \
  --output none
log "Logging enabled"

# ── Get URL ────────────────────────────────────────────────────────────────────
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Deployment Complete!                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:        $APP_URL"
echo "  Admin Login:    $APP_URL/admin/login"
echo "  Admin Email:    $ADMIN_EMAIL"
echo ""
echo "  Resource Group: $RESOURCE_GROUP"
echo "  App Name:       $APP_NAME"
echo ""
echo "  Useful commands:"
echo "  ─────────────────────────────────────────────────────────────"
echo "  View logs:      az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "  Restart app:    az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "  SSH into app:   az webapp ssh --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "  Redeploy:       az webapp deploy --name $APP_NAME --resource-group $RESOURCE_GROUP --src-path <zip>"
echo "  Delete all:     az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
warn "Note: SQLite is suitable for single-instance use. For production scale,"
warn "consider migrating to Azure SQL or Cosmos DB."
echo ""