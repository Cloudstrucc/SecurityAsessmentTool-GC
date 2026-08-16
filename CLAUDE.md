# Working agreement for this repo

## Deployment — DO NOT deploy to Azure yourself
- **Never run `deploy-azure.sh` or any `az webapp ... deploy` / azure push command.** It wastes tokens and time.
- Instead, **after committing, give the user the exact deploy command(s) to run in their own terminal.**
- Standard per-environment commands (run from repo root):
  ```bash
  AZURE_APP_NAME=vanguard-saa-dev  AZURE_RESOURCE_GROUP=gc-sa-tool-dev-rg  AZURE_ENV_FILE=.env.dev  bash deploy-azure.sh --update-only -y
  AZURE_APP_NAME=vanguard-saa-qa   AZURE_RESOURCE_GROUP=gc-sa-tool-qa-rg   AZURE_ENV_FILE=.env.qa   bash deploy-azure.sh --update-only -y
  AZURE_APP_NAME=vanguard-saa-prod AZURE_RESOURCE_GROUP=gc-sa-tool-prod-rg AZURE_ENV_FILE=.env       bash deploy-azure.sh --update-only -y
  ```
- Azure apps live in the **vanguardcs** tenant, subscription **"Power Platform Dev"**. If a deploy errors with "app not found", run `az account set --subscription "Power Platform Dev"` first.
- Git operations (commit, push to GitHub, open/merge PRs) are fine when asked — that's GitHub, not Azure.

## Conventions
- `.env`, `.env.dev`, `.env.qa`, `.env.local` are gitignored and hold real secrets; `.env.example` is the tracked template. Never commit real secrets.
- Deploys carry config: `deploy-azure.sh` with `AZURE_ENV_FILE=<file>` syncs that env file's keys to Azure App Settings.
- Run `npm run test:e2e` before committing app changes.
