# Agent guide — Aegis SA

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
- All user-facing strings go through **i18next** (`locales/*.json`). **Every new feature must ship
  fully localized in ALL 8 supported languages (en, fr, es, de, pt, it, nl, ja).**
- **Localization is part of "done".** Add the key to all 8 locale files *before* writing the
  string, and reference it as `{{t 'key'}}`. This applies to templates, flash messages, `alert()`
  text, `title` / `placeholder` / `aria-label` attributes, email subjects and bodies, and any JS
  string that reaches the screen. Never leave literal English in a view "to localize later". English-only —
  or English+French with the rest falling back — is not acceptable for new work, and this applies
  to the admin / signed-in UI as much as the public pages. Labels, buttons, headings, modals,
  flash messages, empty states and `title`/`aria-label` text all need keys in all 8 files.
- **Check locale parity before committing:** every locale file must contain the same keys.
  ```bash
  node -e "const fs=require('fs');const f=(o,p,out={})=>{for(const k in o){const v=o[k],kk=p?p+'.'+k:k;v&&typeof v==='object'&&!Array.isArray(v)?f(v,kk,out):out[kk]=v}return out};const L=['en','fr','es','de','pt','it','nl','ja'];const d={};L.forEach(l=>d[l]=f(JSON.parse(fs.readFileSync('locales/'+l+'.json'))));const en=Object.keys(d.en);L.forEach(l=>{const m=en.filter(k=>!(k in d[l]));console.log(l,'keys:',Object.keys(d[l]).length,'missing:',m.length,m.slice(0,5).join(','))})"
  ```
- Use **flat, uniquely-prefixed keys** (`rf.*`, `pl.*`, `pbmm.*`, `regside.*`, `pb.*`, `navbar.*`).
  Do **not** add keys under the nested `nav` object — it shadows flat `nav.*` lookups; use
  `navbar.*` instead.
- i18next **preloads locales at startup** — restart the dev server / redeploy after editing them.
- **Localize external links too.** Any `target="_blank"` link to an information resource must open
  in the user's language. Store the URL as a locale key (e.g. `pbmm.urlProtectedB`) with a
  per-language value (`fr.wikipedia.org/…` for French, percent-encoded), reference it as
  `href="{{t 'key'}}"`, and verify each resolves (HTTP 200). Fall back to English only where no
  localized version exists.

## Testing
- Run `npm run test:e2e` before committing app changes. Note the suite currently expects
  `MFA_ENABLED=true` (MFA defaults off), so run it as `MFA_ENABLED=true npm run test:e2e`.
