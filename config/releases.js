// Release-notes data + GitHub Releases integration.
//
// The /releases page reads the repo's live GitHub Releases (cached); when none are
// published yet (or the API is unreachable) it falls back to the CURATED list
// below. CURATED is ALSO the single source the backfill script uses to create the
// GitHub Releases, so the two always agree.
let marked;
try { marked = require('marked').marked || require('marked'); } catch (e) { marked = null; }

const REPO = process.env.RELEASES_REPO || 'Cloudstrucc/SecurityAsessmentTool-GC';
const REPO_URL = `https://github.com/${REPO}`;
const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=40`;

// Semver → release class. x.0.0 = major, x.y.0 = minor, else patch.
function relType(v) {
  const [maj, min, pat] = String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  if (min === 0 && pat === 0) return 'major';
  if (pat === 0) return 'minor';
  return 'patch';
}

function md(body) {
  if (!body) return '';
  try { return marked ? (marked.parse ? marked.parse(body) : marked(body)) : `<pre>${body}</pre>`; }
  catch (e) { return `<pre>${String(body)}</pre>`; }
}

// ── Curated backfill (last ~3 months). Four majors: 1.0.0, 2.0.0, 3.0.0, 4.0.0 ──
// commit = the tag anchor for the backfill script. body = the GitHub release body.
const CURATED = [
  { version: '5.1.0', date: '2026-09-08', commit: 'b0de88d',
    name: 'Read-only evidence, ownership gate & a filterable control list', prs: [],
    body: `A safer, clearer assessor record — evidence always visible read-only, editing gated behind assignment, a filter/search/CSV toolbar over the control list — plus a comprehensive click-by-click tutorial and polished toolbars.

### ✨ Features
- **Read-only evidence on the assessment record** — every control shows its evidence, even when blank and even before the assessment is submitted
- **View / edit evidence ownership gate** — editing is gated behind assignment; a dialog offers *View read-only* or *Assign to me & edit* (take ownership), per control and for the record
- **Filter / fuzzy-search / Export CSV** over the control list, in every phase — by state, by text, exporting exactly the filtered controls
- **Record Tools panel** — overflowing actions collect under a labeled panel, and **Export** expands in place into report formats (PDF / Word / HTML / Markdown, CSV where tabular)
- **Evidence drafts render richly** — **bold** guidance and colour-coded \`[[VALUE]]\`/\`[[ATTACH]]\` placeholders, in both the provider flow and the assessor view
- **Dockable navigation** polish — icon rail with active highlight and an on-screen preferences popover

### 🛠 Fixes
- Bulk "suggest drafts" no longer crashes for assessors (routed through the background worker) and no longer double-escapes \`&\`
- Toolbar dropdowns no longer clipped by their card

### 📚 Docs
- Comprehensive **six-phase, click-by-click end-to-end tutorial** (intake → decision-package close-out), and help sections refreshed for all the above` },

  { version: '5.0.0', date: '2026-09-08', commit: 'b87f345',
    name: 'Evidence & review, reimagined', prs: [],
    body: `AI-drafted evidence with fill-in placeholders, a background bulk drafter, an ownership + Ready/history model for providers, and a full assessor review workflow with evidence-strength scoring — plus the in-app release notes page.

### ✨ Features
- **Contextual assistant** + per-control **"Suggest a draft"** (placeholders for values and attachments), and the assistant can **populate fields directly** with Approve / Approve all
- **Bulk "suggest drafts" as a background job** — drafts only the empty controls, survives navigation/reload, live progress + error reporting
- **Mark Ready / Reactivate**, per-control **edit history & revert**, and an **"edited by X (incl. AI)"** banner
- **Multi-select bulk actions + status filter** (with a right-click menu) on both the evidence and review pages
- **Assessor review**: evidence-strength **scoring** (reliability × sufficiency × impact weight) with a weighted scorecard and weak-evidence flag, review **statuses** and feedback
- **Return for revision & re-assign** — reopens an assessment showing only the controls flagged for re-submission
- **Release notes page** that reads live GitHub Releases (curated fallback)

### 📚 Docs
- Help centre updated with the new evidence-gathering and assessor-review procedures` },

  { version: '4.0.0', date: '2026-09-07', commit: 'c1b74d8',
    name: 'AI-assisted evidence & one-click assignment', prs: [],
    body: `Draft evidence with placeholders, generated per-control, in bulk, or by the assistant — plus assignment that activates in one step.

### ✨ Features
- **AI-suggested placeholder evidence**: per-control "Suggest a draft", bulk "Suggest drafts (all)", and generation at assign/tailoring time — with \`[[VALUE]]\`/\`[[ATTACH]]\` placeholders and a soft submit-time warning
- The **evidence assistant now populates fields** — proposes drafts with **Approve / Approve all** instead of copy-paste
- **"Assign & send"**: assigning an assessment now activates it and sends the invite from one modal
- Evidence editor: explicit **Save**, 10s autosave, and a clear "saved" indicator

### 🔒 Security
- Passwordless **passkey registration on every register page** (account created only on passkey confirmation)

### 🐛 Fixes
- AI drafts never appear as real evidence in reports (HTML/PDF/DOCX/Markdown)` },

  { version: '3.3.0', date: '2026-09-04', commit: '20a8466',
    name: 'Evidence ownership & universal redeem', prs: [],
    body: `A clear owner for each assessment's evidence, and one link that redeems any invite code.

### ✨ Features
- **Evidence ownership**: take-ownership, read-only when assigned to someone else, and persistent read-only visibility for project users
- Invite codes are now clickable **redeem links**, plus a universal "Redeem a code" modal on the intake / assessment / POA&M pages

### 🔒 Security
- Assignable-user lists scoped to the caller's workspace (no cross-org users)

### 🐛 Fixes
- Fixed "Not found" when creating a project (cross-org name collision in matching)` },

  { version: '3.2.0', date: '2026-09-03', commit: '2f3d5bb',
    name: 'Multi-tenant isolation & per-user pricing', prs: [],
    body: `Every workspace now sees only its own data, and pricing moves to a simple per-user model.

### ✨ Features
- Per-user **Basic pricing ($49.99/user, all features)**; centered 3-tier pricing grid
- Direct edit / view links to an assessment's evidence for the creator

### 🔒 Security
- **Full multi-tenant data isolation**: workspace scoping on every list, detail, and by-id mutation route
- Client auth parity: passwordless passkey on client login; standardized, localized client registration

### 🐛 Fixes
- Fixed intake document analysis exceeding the model context limit` },

  { version: '3.0.0', date: '2026-08-24', commit: 'baa29c8',
    name: 'Reporting engine & dockable navigation', prs: [33, 35, 36, 37, 38, 39, 40, 41, 42],
    body: `A unified multi-format reporting engine and a compact, dockable navigation system.

### ✨ Features
- **Unified report engine**: HTML, PDF, DOCX and Markdown from one model, with org/project branding and a report catalog
- Prominent **Export on every record**; per-record intake report; navbar Reports link
- **Compact, dockable navigation** + record action toolbar (icons ⇄ text) + round dockable assistant/collaboration buttons
- Help centre rebuilt as a rendered, refreshed page (assistant how-to rolled in)

### 🐛 Fixes
- Fixed "Report not found" on export; phantom blank pages in report PDFs; HTML-escaped inline JS` },

  { version: '2.2.0', date: '2026-08-22', commit: 'f776711',
    name: 'Decision packages, POA&M & process flow', prs: [26, 27, 28, 29, 30, 31, 32],
    body: `The authorization workflow: business-process flow, immutable decision packages, and POA&M as conditions.

### ✨ Features
- **Business-process flow** (Intake → Assessment → Decision → Authorized) chevrons
- **Decision packages** with immutable assessment pinning + project collaboration
- **POA&M** becomes the conditions of a decision package
- Single unified assistant surface; in-app + batched-email mention notifications

### 🔒 Security
- Encrypt tenant secrets at rest

### 🌐 Content & i18n
- Whole admin UI localized` },

  { version: '2.1.0', date: '2026-08-20', commit: '01afbb8',
    name: 'Custom domain, integrations & assessment versioning', prs: [15, 19, 20, 21, 22, 23, 24, 25],
    body: `Custom-domain readiness, real integration validation, and assessment history you can revert.

### ✨ Features
- Custom-domain cutover support: **multi-origin passkeys + secure cookies**
- Real validation for every org integration, with last-valid-check and 24h logs
- **Assessment versioning**: audit history + revert to any prior version
- Assessment UX: family-focus fix, assistant polish, chat history, version summaries
- Organization settings: full CRUD incl. delete

### 🐛 Fixes
- Stop a stale static overview page from shadowing the live route` },

  { version: '2.0.0', date: '2026-08-19', commit: '8ce2fcb',
    name: 'Aegis SA — AI Assessment Assistant + full internationalization', prs: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18],
    body: `The platform becomes **Aegis SA**: an AI assistant embedded across the assessment lifecycle, fully localized in 8 languages, and mobile-responsive.

### ✨ Features
- **AI Assessment Assistant**: chat-driven control tailoring, plus review and evidence modes with per-control refine and "Approve all"
- **Aegis SA** rebrand; mobile-responsive across the app and the assistant
- Brand logo routes signed-in users to their dashboard

### 🌐 Content & i18n
- **Full internationalization in 8 languages** (nav, register, pricing, product brief, privacy notice); localized external reference links per language

### 🐛 Fixes
- Assistant renders replies as a conversation (no raw JSON); several contrast fixes` },

  { version: '1.1.0', date: '2026-08-16', commit: '08c3a57',
    name: 'Bring-your-own AI + token metering', prs: [4],
    body: `Connect your own AI provider or MCP, or use the built-in AI with transparent metering.

### ✨ Features
- **Bring-your-own AI** provider / MCP endpoint; built-in AI **token metering, limits & top-up**
- Global MFA kill-switch (off by default) — no forced QR on sign-in

### 🐛 Fixes
- Fixed AI token-pack leak and keyless custom-endpoint fallback` },

  { version: '1.0.0', date: '2026-08-09', commit: 'ec7b95d',
    name: 'Commercial foundation — billing, RBAC, licensing & passkeys', prs: [2, 3],
    body: `The first production platform release: self-serve billing, role-based access, licensing, and passwordless sign-in.

### ✨ Features
- **Stripe hosted-checkout billing** + registration funnel
- **RBAC**, AI licensing gate & break-glass accounts; licensing/seat console; root-admin console (own SMTP/SMS/domain)
- Role-scoped dashboards; notification centre; deep-link assignment emails
- **Passwordless passkeys**: FIDO2 sign-in and passkey sign-up

### 🔒 Security
- Finer per-action assessment RBAC

### 🐛 Fixes
- Self-assessment submit spinner fix` },

  { version: '0.9.0', date: '2026-07-30', commit: '9bd494e',
    name: 'Foundations', prs: [1],
    body: `The first tracked release — project lifecycle basics.

### ✨ Features
- Project archive + GitHub-style delete confirmation` }
];

function curatedNormalized() {
  return CURATED.map(r => ({
    version: r.version, name: r.name, date: r.date, type: relType(r.version),
    html_url: `${REPO_URL}/releases/tag/v${r.version}`, prs: r.prs || [],
    bodyHtml: md(r.body), source: 'curated'
  }));
}

// 1h in-memory cache; brief cache on failure so a rate-limit/outage doesn't hammer.
let _cache = { at: 0, ttl: 0, data: null };
async function getReleases() {
  const now = Date.now();
  if (_cache.data && now - _cache.at < _cache.ttl) return _cache.data;
  try {
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'aegis-sa-releases' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    const resp = await fetch(API_URL, { headers });
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
    const json = await resp.json();
    const published = (Array.isArray(json) ? json : []).filter(r => !r.draft);
    if (!published.length) throw new Error('no releases published');
    const data = published.map(r => {
      const version = String(r.tag_name || '').replace(/^v/, '');
      return {
        version, name: r.name || r.tag_name, date: (r.published_at || '').slice(0, 10),
        type: relType(version), html_url: r.html_url, prs: [],
        bodyHtml: md(r.body || ''), source: 'github'
      };
    }).sort((a, b) => cmpVer(b.version, a.version));
    _cache = { at: now, ttl: 60 * 60 * 1000, data: withPrev(data) };
    return _cache.data;
  } catch (e) {
    const data = withPrev(curatedNormalized());
    _cache = { at: now, ttl: 60 * 1000, data }; // short cache on fallback
    return data;
  }
}

function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}
// Attach the previous version for each (for GitHub "compare" links).
function withPrev(list) {
  return list.map((r, i) => ({ ...r, prev: list[i + 1] ? list[i + 1].version : null }));
}

module.exports = { REPO, REPO_URL, getReleases, CURATED, relType, cmpVer };
