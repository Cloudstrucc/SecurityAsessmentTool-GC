# Implementation Plan — Control Inheritance, LLM Audit, and Process Sequencing

**Status:** Proposal for review. Nothing implemented yet.
**Scope:** Three new features for the Aegis SA platform (Node/Express + Handlebars + sql.js SQLite, LLM via `config/ai-service.js`).

Grounding facts confirmed in the codebase:
- `assessment_controls` already has `is_inherited` and `inherited_from` columns (unused today) — a foundation for Feature 1.
- `config/ai-service.js` → `callClaude(system, userContent, opts)` already accepts **content blocks** (text **and images**), so screenshot analysis for Feature 2 is feasible with no client changes. Model is configurable (`ANTHROPIC_MODEL`).
- Assessments already have a status lifecycle (`draft → evidence-gathering → submitted → audit → completed`) and an ATO/iATO record model (`ato_records`, `iato_checklist`).
- Migrations use the additive `[table, column, sql]` array in `models/database.js`.

---

## Feature 1 — Enterprise Control Inheritance

**Goal:** Auto-detect controls that can be inherited from previously **ATO'd or iATO'd** assessments (e.g. access control via Entra ID), inherit their proven evidence by reference, and require only the **app-specific delta** (e.g. which Entra groups grant access to *this* app).

### 1.1 Data model (migrations)
Add to the migration array in `models/database.js`:
- `assessment_controls.inherited_from_control_id INTEGER` — FK to the source `assessment_controls.id` the evidence is inherited from.
- `assessment_controls.inheritance_status TEXT` — `none | suggested | accepted | rejected` (default `none`).
- `assessment_controls.app_specific_evidence TEXT` — the delta narrative the team must add on top of inherited evidence.
- `assessment_controls.app_specific_evidence_html TEXT` — rendered variant, mirroring existing `evidence_html`.
- New table `enterprise_control_registry` (optional but recommended): a curated list of control IDs an org designates as "enterprise/common" (e.g. `AC-2`, `AU-*`, `SC-13`) with a label and default provider (e.g. "Microsoft Entra ID"). Lets admins declare intent rather than relying purely on detection.

Reuse existing `is_inherited` / `inherited_from` for backward-compatible display; the new columns add precision.

### 1.2 Inheritance source resolution
A control is **inheritable** when a prior assessment satisfies all of:
- Belongs to a **different** project (or same project, prior assessment) that reached an **authorized** state — `assessments.result IN ('ato','iato')` or `ato_records` present.
- Shares the same `control_id` **and** the same `security_framework` / baseline family.
- The source control had a passing `audit_result` (e.g. `met`) with non-empty evidence.

Query pattern (server helper `findInheritableEvidence(control, project)`):
```
SELECT ac.*, a.id AS src_assessment_id, p.name AS src_project, a.result, a.ato_expiry_date
FROM assessment_controls ac
JOIN assessments a  ON a.id = ac.assessment_id
JOIN projects p     ON p.id = a.project_id
WHERE ac.control_id = ?           -- same control
  AND ac.audit_result = 'met'
  AND a.result IN ('ato','iato')
  AND a.id <> ?                    -- not the current assessment
ORDER BY a.ato_generated_at DESC
```
Rank candidates by recency, non-expired ATO, and (optionally) technology overlap (`projects.technologies`).

### 1.3 Detection modes
- **Deterministic (primary):** the SQL above + the enterprise registry. Fast, explainable, no LLM cost. Runs when an assessment's controls are created/tailored.
- **LLM-assisted (secondary, optional):** extend `ai-service.js` with `suggestInheritableControls(control, candidateEvidence, projectContext)` — for near-miss cases where the control ID differs but the enterprise capability is the same (e.g. mapping across frameworks). Returns a confidence score + rationale. Human confirms.

### 1.4 UX (assessment-detail page)
- On each control that has candidates: an **"Inheritable"** badge + a panel: *"Access control is provided at the enterprise level via Microsoft Entra ID — inherited from [Project X, ATO 2026-01]."*
- **Reference view:** a link/expandable that shows the **source control's evidence** (read-only) so the reviewer can verify what's being inherited, with a deep link to the source assessment.
- **Accept inheritance** → sets `inheritance_status='accepted'`, copies a reference (not a blind copy) and prompts for the **app-specific delta** field ("Which Entra groups grant access to *this* app? How is your user base authorized?").
- A project/assessment-level **"Inherited controls" summary** showing what was reused and from where.

### 1.5 Reporting
- ATO/iATO PDF and CSV exports mark inherited controls, cite the source authorization, and include both the inherited reference and the app-specific evidence — so the package is self-describing for auditors.

### 1.6 Effort / sequencing
1. Migrations + `enterprise_control_registry` + admin screen to flag enterprise controls. *(S)*
2. `findInheritableEvidence` helper + deterministic detection on control creation. *(M)*
3. Assessment-detail UI: badge, reference view, accept/reject, app-specific delta field. *(M)*
4. Reporting updates. *(S)*
5. Optional LLM cross-framework suggestion. *(M, later)*

---

## Feature 2 — LLM-Driven Audit (Guide → Evidence → Scoring)

**Goal:** Generate a step-by-step **audit guide** tailored to the project's technology and controls, let the user submit proof (screenshots / pasted config) per step, then have the LLM **evaluate** each submission, flag insufficiency with remediation, and produce **per-item and overall scores**. This is a heavy LLM feature with its **own state machine**, attached to an assessment.

### 2.1 Data model (new tables)
- `audits`
  - `id, assessment_id (FK), status, overall_score REAL, summary TEXT, generated_by, model, created_at, updated_at`
  - `status` state machine: `draft → generating → ready → in-progress → evaluating → completed` (+ `failed`).
- `audit_steps`
  - `id, audit_id (FK), step_no, control_ids TEXT, title, objective, instructions TEXT (LLM step-by-step), expected_artifacts TEXT, technology TEXT`
  - `submission_text TEXT, submission_status` (`pending | submitted | evaluated`)
  - `score REAL, verdict TEXT (sufficient|insufficient|partial), feedback TEXT, remediation TEXT, evaluated_at`
- `audit_step_attachments`
  - `id, audit_step_id (FK), filename, original_name, mime_type, size, kind (screenshot|config|doc), created_at` — reuse the existing multer upload pattern (`intakeUpload`/`projectUpload`).

### 2.2 State machine (server-enforced)
```
draft ─generate▶ generating ─LLM ok▶ ready
ready ─user starts▶ in-progress ─submit all▶ evaluating ─LLM ok▶ completed
(any) ─LLM error▶ failed ─retry▶ previous state
```
Transitions live in `routes/admin.js` audit routes; each writes `updated_at` and guards illegal transitions (same discipline as the archive/delete work).

### 2.3 LLM integration (`config/ai-service.js`)
Two new functions:
- `generateAuditPlan(assessment, controls, projectContext)` → returns structured JSON: an ordered list of audit steps, each with objective, **technology-specific** step-by-step instructions (e.g. "In Entra admin center → Protection → Conditional Access, open the policy named…; capture a screenshot showing MFA = required"), and the expected artifacts. Grounded in `projects.technologies`, the tailored controls, and their evidence narratives.
- `evaluateAuditSubmission(step, artifacts, evidenceNarrative)` → accepts **text + image content blocks** (screenshots) via the existing `callClaude` array form; returns `{ verdict, score (0–100), feedback, remediation, missing[] }`. When insufficient, `remediation` explains *why* and *how to fix*.
- Overall score = weighted aggregate of step scores (weight by control priority `P1/P2/P3`), written to `audits.overall_score` with an LLM-authored `summary`.

Cost/latency controls: generate steps in one call; evaluate **per step** (isolates failures, enables partial progress, bounds token size for images). Reuse existing 429 backoff. Add a config cap on image count/size per step.

### 2.4 UX
- **Assessment detail → "Audit" tab/section.** Button **"Generate audit guide"** (→ `generating`). Progress indicator while the LLM works (async; poll or job status).
- **Guide view:** numbered steps (reuse the `.steps` styling from the brief), each expandable with instructions + expected artifacts + an upload/paste area.
- **Per-step result:** score chip, verdict badge, feedback, and a remediation callout when insufficient.
- **Audit summary:** overall score gauge + summary; export to PDF (extend `utils/pdfExport.js`).
- Audit is versioned/immutable once `completed` (re-run creates a new audit record tied to the assessment).

### 2.5 Effort / sequencing
1. Tables + state machine + routes skeleton. *(M)*
2. `generateAuditPlan` + guide UI (generate + render steps). *(M)*
3. Submission capture (uploads + pasted config), per-step. *(M)*
4. `evaluateAuditSubmission` + scoring + feedback/remediation UI. *(L)*
5. Overall scoring, summary, PDF export. *(M)*

> This is the largest feature and the most LLM-intensive; recommend building it behind a feature flag and piloting on one framework/tech stack first.

---

## Feature 3 — Interactive Process Sequencing (Guided Checklists)

**Goal:** After a project is created, show a **checklist of next steps** (create assessment, add documents, assign a resource, …). Items are **interactive** — clicking one **focuses the relevant area** of the page (e.g. scrolls to and highlights the assessment table). Completion is derived from real data. Apply the same to the **assessment** record and the **ATO/iATO** process. The panel is **collapsible/expandable and dismissible**, positioned sensibly on the record page.

### 3.1 Approach — derived, not stored (primary)
No new persistence needed for step *completion*: each step has a **predicate** evaluated from existing data, so the checklist is always accurate and can't drift.

Define a small server-side config, e.g. `config/process-flows.js`:
```
projectFlow = [
  { key:'create_assessment', label:'Create an assessment',
    done: (ctx)=> ctx.assessments.length>0, target:'#assessments-section' },
  { key:'add_documents',      label:'Add system documentation (SADD, etc.)',
    done: (ctx)=> ctx.documents.length>0,   target:'#documents-section' },
  { key:'assign_resource',    label:'Assign to a project resource',
    done: (ctx)=> ctx.assessmentAssignments.length>0, target:'#assign-section' },
  { key:'gather_evidence',    label:'Gather evidence',
    done: (ctx)=> ctx.assessments.some(a=>a.status!=='draft'), target:'#assessments-section' },
  ...
]
assessmentFlow = [ tailor controls → send invite → evidence → review → generate ATO/iATO → sign ]
atoFlow        = [ draft package → POA&M for gaps → assessor sign → authority sign → CIO sign → issued ]
```
The project/assessment detail routes compute `{ step, done }[]` from data already loaded and pass it to the view. **Next step** = first `done:false`.

Optional persistence (secondary): a `process_dismissals` table (or a JSON column on `projects`/`assessments`) to remember manually-checked optional steps or a collapsed/hidden preference per user.

### 3.2 UX
- A **"Getting started / Next steps"** panel on the project and assessment detail pages — a progress bar (`n/total`), a checklist with ✓ / ○ states, and a highlighted **"Next"** item.
- Clicking an item runs a small client script: `scrollIntoView` + a temporary highlight ring on the target section (anchor IDs added to the relevant tables/cards, e.g. `#assessments-section`).
- Collapsible/expandable (chevron) and dismissible (persist collapsed state in `localStorage`, or per-user if we add the table). Reuse Bootstrap 5 collapse already loaded in the layout.
- Same pattern instantiated for the assessment record and the ATO/iATO flow (different flow config).

### 3.3 Effort / sequencing
1. `config/process-flows.js` with the three flows + predicates. *(S)*
2. Route wiring to compute step state for project + assessment detail. *(S)*
3. Reusable Handlebars partial for the checklist panel + client focus/highlight script. *(M)*
4. Anchor IDs + highlight styling on target sections. *(S)*
5. Collapse/dismiss preference persistence. *(S)*

> Lowest-risk, highest day-one usability win. Good candidate to build first.

---

## Cross-cutting notes
- **Migrations** are additive and safe on the live Azure DB (same pattern already validated in the archive/delete work); columns self-apply on boot.
- **LLM cost/latency:** Features 1 (optional) and 2 add real API usage. Recommend a per-org toggle and surfacing model/token settings; reuse the existing 429 backoff and `isConfigured()` guard so the app degrades gracefully when no key is set.
- **Feature flags:** ship Feature 2 (audit) behind a flag; Features 1 and 3 can be gated too for staged rollout.
- **Testing:** extend the e2e suite (`tests/e2e/…`) — inheritance detection round-trip, audit state-machine transitions (mock the LLM), and process-step predicate correctness.

## Suggested build order
1. **Feature 3 (sequencing)** — fast, no LLM, immediate UX value.
2. **Feature 1 (inheritance)** — deterministic core first, LLM suggestion later.
3. **Feature 2 (audit)** — largest; behind a flag, piloted on one tech stack.
