# Reporting engine (Phases A & B)

The app produces five report types in four downloadable formats, plus the existing
CSV exports (unchanged). This document is the map for anyone extending it.

## Pipeline

```
                      config/report-model.js          utils/report-render/
  DB  ──────────────▶  build(type, id, {orgId})  ──▶  render(model, format, {branding})  ──▶  bytes
  (tenant-scoped,      → format-agnostic MODEL         html.js  → HTML string
   pinned snapshots                                    pdf.js   → PDF Buffer (pdfkit)
   for decisions)                                      docx.js  → DOCX Buffer (docx lib)
                                                        markdown.js → Markdown string
```

Assemble **once** into a model, then render per format. CSV is **not** in this pipeline —
it keeps its existing per-object routes and byte-for-byte output.

## Report types

| type              | id is…                | notes |
|-------------------|-----------------------|-------|
| `intake`          | intake id             | the submitted pre-project profile (single record) |
| `assessment`      | assessment id         | full SA&A record; scored posture by family |
| `decision-package`| decision package id   | reads the **pinned** assessment version — reproducible |
| `poam`            | decision package id   | landscape POA&M register |
| `project`         | project id            | management rollup (live state) |
| `portfolio`       | (ignored — `all`)     | org-wide summary; admin only |

## Report catalog (`config/report-catalog.js`)

`config/report-catalog.js` is the single registry of the built-in report types —
one deterministic, **no-AI** report per entity set. It drives the hub's "Report
templates" list, the viewer's format buttons, and route validation. When you add a
report type, add it here (id, entity, label/desc keys, formats) so it appears
everywhere at once. The future report-designer will hang off this registry (the
hub already shows a disabled "Design" action per template).

## Formats

`utils/report-render/index.js` dispatches. HTML/Markdown return strings, PDF/DOCX return
Buffers. HTML drives both the on-screen viewer (`embed:true`) and the `.html` download.
The **PDF is a separate pdfkit layout** — we chose to keep pdfkit rather than add a headless
browser, so the two layouts are maintained by hand and kept visually close.

## Routes (`routes/reports.js`, mounted at `/admin/reports`)

- `GET /admin/reports` — hub (projects the user may report on).
- `GET /admin/reports/:type/:id` — on-screen view + format picker (iframe preview of `.html`).
- `GET /admin/reports/:type/:id.:format` — download in `html|pdf|docx|md` (`csv` falls through
  to the existing routes).

**Access:** org admins may export any report in their tenant; everyone else only reports for
assessments they are assigned to (decision/POA&M use the pinned assessment, then the project).
Portfolio and project rollup are admin-only. All reads are tenant-scoped — a project owned by
another org returns 404.

## Branding (Phase B — `config/report-branding.js`)

Resolves **project → org → platform default**. Blank fields at a more specific level fall
through. Stored in `report_branding` (`scope_type` = `project` | `org`). Fields: organization
name, logo (uploaded to `BRANDING_UPLOAD_DIR`, inlined as a data URI at render time), primary
and accent colours, header/footer text, classification label, report subtitle, assessor
company. Renderers must read colours/logo/footer from the resolved branding — never hardcode.

- Org branding UI: Organization settings → **Report branding** (root admin).
- Project branding UI: project detail → **Report branding** card (any admin) — overrides org.

## Localization

Every label a renderer emits is an `rf.*` key. `utils/report-render/labels.js` holds the
English source (and a fallback so renderers work without an i18n runtime); the same keys live
in all 8 `locales/*.json`. Report **content** (control titles, evidence, names) is data and is
passed through untranslated. To add a label: add the `rf.*` key to `labels.js` and to every
locale — `scripts/add-report-locales.js` is the bulk-add helper (idempotent).

## Extending — the rule

When you add a user-facing field or a new reportable object, update **the model and every
renderer**, and add any new `rf.*` labels to all 8 locales. A field that shows on screen but is
missing from the export is a bug. See the reporting section in `CLAUDE.md` / `AGENTS.md`.

## Not yet built (Phases C & D — deferred)

- **C — OData/REST/OpenAPI** for BI tools (all entity sets, per-org read-only tokens).
- **D — AI dynamic reports** with a configurable per-report / standing-threshold approval and
  per-user token caps. Design mockup: `docs/report-mockups/07-ai-cost-controls.html`.

Design mockups for all of the above live in `docs/report-mockups/`.
