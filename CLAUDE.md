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

## Content & internationalization — the app is worldwide, not Canada-only
This product is used by organizations around the world. When writing or changing any
user-facing content or building new features, keep the copy internationally neutral:

- **"Protected B" and other Canadian classifications may ONLY appear inside the
  project / intake creation flow** (the ITSG-33 categorization: `views/admin/project-new.hbs`
  classification/C-I-A fields, `views/public/intake.hbs` profile logic, and the assessment
  control-profile). There, Protected A/B/C is a legitimate framework field — keep it.
- **Everywhere else** (registration, the Protected-B/attestation notice, marketing, help,
  dashboards, emails) use neutral terms: **"personal information"**, **"sensitive and
  personal information"**, **"applicable privacy laws"** — NOT "Privacy Act",
  "Government of Canada", "hosted in Canada", or "Protected B".
- **Reference links** must point to neutral/international resources (e.g. Wikipedia
  "Personal data" / "Information privacy"), not Canada-specific pages.
- The registration attestation is the **"Personal information & privacy notice"**
  (`pbmm.*` keys), not a "Protected B privacy notice".

- **All user-facing strings are localized via i18next** in `locales/*.json`. Add new copy as
  keys (English + French at minimum; the other 6 languages fall back to English). Use flat,
  uniquely-prefixed keys (e.g. `rf.*`, `pl.*`, `pbmm.*`) — do NOT add keys under the nested
  `nav` object (it shadows flat `nav.*` lookups; use `navbar.*`). i18next **preloads locales at
  startup**, so restart/redeploy after changing them.
