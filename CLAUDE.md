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

- **All user-facing strings are localized via i18next** in `locales/*.json`. **Every new feature
  must ship fully localized in ALL 8 supported languages (en, fr, es, de, pt, it, nl, ja) — not
  English-only, and not English+French with the rest falling back.**
- **LOCALIZATION IS PART OF "DONE", NOT A FOLLOW-UP.** Before writing any user-visible string,
  add the key to all 8 locale files and reference it with `{{t 'key'}}`. Never write literal
  English into a template, a flash message, an `alert()`, a `title`/`placeholder`/`aria-label`,
  an email subject or body, or a JS string that reaches the screen. If you catch yourself typing
  visible prose into a `.hbs` or a route, stop and make it a key first. "I'll localize it later"
  is how the admin UI ended up English-only. This applies to the admin /
  signed-in UI as much as the public pages: any new label, button, heading, modal, flash message,
  empty state, or `title`/`aria-label` gets a key in all 8 locale files before the feature ships.
  Verify parity (same key count in every file) as part of the change. Use flat,
  uniquely-prefixed keys (e.g. `rf.*`, `pl.*`, `pbmm.*`) — do NOT add keys under the nested
  `nav` object (it shadows flat `nav.*` lookups; use `navbar.*`). i18next **preloads locales at
  startup**, so restart/redeploy after changing them.
- **External links that open in a new tab must be localized too.** Store each external URL as a
  locale key (e.g. `pbmm.urlProtectedB`) and give every language the language-appropriate target
  (e.g. `fr.wikipedia.org/…` for French, percent-encoded) so the page opens in the user's
  language — the reader should never have to switch language on the destination. Verify each URL
  resolves (HTTP 200); fall back to the English URL only where no localized version exists.
  Reference these via `href="{{t 'key'}}"` — never hardcode an English URL in a `target="_blank"`
  link.
