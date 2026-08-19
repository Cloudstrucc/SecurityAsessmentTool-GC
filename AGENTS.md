# Agent guide — Vanguard SA&A

This file is for AI coding agents (and contributors) working in this repo. The full working
agreement lives in [CLAUDE.md](CLAUDE.md); this is the short version plus the content rules.

## Deployment
- **Never deploy to Azure yourself** (no `deploy-azure.sh`, no `az webapp ... deploy`). After
  committing, hand the user the per-environment deploy commands to run themselves. See CLAUDE.md.
- Git/GitHub operations (commit, push, PRs) are fine when asked.

## Content & internationalization — the app is used worldwide
Write all user-facing copy to be internationally neutral. The product is not Canada-only.

- **"Protected B" / Canadian classifications may ONLY appear in the project & intake creation
  flow** (ITSG-33 categorization — project-new, public intake, assessment control-profile),
  where they are legitimate framework values. Keep them there.
- **Everywhere else** use neutral language: **personal information**, **sensitive and personal
  information**, **applicable privacy laws**. Do NOT write "Privacy Act", "Government of Canada",
  "hosted in Canada", or "Protected B" in registration, notices, marketing, help, or dashboards.
- The registration attestation is the **Personal information & privacy notice** (`pbmm.*`), and
  reference links point to neutral resources (Wikipedia "Personal data" / "Information privacy"),
  not Canada-specific pages.

## Localization
- All user-facing strings go through **i18next** (`locales/*.json`). Add new copy as keys in
  **English + French** at minimum; the other six languages (es, de, pt, it, nl, ja) fall back to
  English.
- Use **flat, uniquely-prefixed keys** (`rf.*`, `pl.*`, `pbmm.*`, `regside.*`, `pb.*`, `navbar.*`).
  Do **not** add keys under the nested `nav` object — it shadows flat `nav.*` lookups; use
  `navbar.*` instead.
- i18next **preloads locales at startup** — restart the dev server / redeploy after editing them.

## Testing
- Run `npm run test:e2e` before committing app changes. Note the suite currently expects
  `MFA_ENABLED=true` (MFA defaults off), so run it as `MFA_ENABLED=true npm run test:e2e`.
