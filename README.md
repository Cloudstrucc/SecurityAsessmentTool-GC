# GC Security Assessment & Authorization (SA&A) Tool — Requirements Breakdown

## Overview

A web-based tool for Government of Canada security practitioners to conduct ITSG-33 / Protected B / PII security assessments, manage evidence gathering, perform audits, and generate ATO/iATO authorization packages. Styled and architected like the Cloudstrucc BA Questionnaire App (Node.js, Express, Handlebars, Bootstrap 5, sql.js).

---

## Phase 1 — Project & Control Setup (Assessor Side)

### 1.1 Assessor Authentication

- Login page for security practitioners (email/password)
- Session-based auth with Passport.js
- Role: `assessor` (admin of the tool)

### 1.2 Project Creation

- Form fields: project name, description (plain text or markdown upload), department/agency
- Classification level dropdown: Unclassified, Protected A, **Protected B**
- Hosting environment checkboxes: Azure, AWS, GCP, IBM Cloud, SSC Data Centre, On-Premises, Hybrid
- Application type: Internal-facing, External-facing, Both
- Data collected: Free text + PII flag (yes/no)
- Technology stack checkboxes: Active Directory, Entra ID, MFA, Azure PIM, Defender, CrowdStrike, Splunk, Sentinel, GitHub Enterprise, Azure DevOps, WAF, TLS/SSL, Key Vault, KMS, etc.

### 1.3 Automatic Control Recommendation

- Based on project characteristics (classification, hosting, app type, PII, tech stack), the system auto-recommends relevant ITSG-33 controls
- Controls displayed grouped by family (AC, AU, CA, CM, IA, IR, SC, SI, etc.)
- Each control shows: Family, Control ID, Title, Standard Description, **Tailored Description** (auto-generated first pass), Evidence Guidance
- Priority tagging: P1 (critical), P2 (important), P3 (recommended)

### 1.4 Inherited Control Detection

- System flags controls that may be **inherited** from existing agency technologies (e.g., AD handles IA-2, Entra ID handles IA-5, Azure handles PE-family)
- Practitioner can confirm/reject inheritance per control
- Inherited controls still appear in the package but marked as "Inherited — [Technology Name]"

### 1.5 Control Tailoring

- Practitioner can edit: tailored description, evidence guidance, priority, applicability (in-scope / out-of-scope)
- Ability to add/remove controls from the recommended set
- Save as draft; finalize when ready to send

---

## Phase 2 — Invite & Evidence Gathering (Project Owner Side)

### 2.1 Invite System

- Practitioner generates an invite link with a unique access code
- Configurable expiry (default 30 days)
- Email notification sent to project owner with link + code
- Landing page: enter access code to access the assessment

### 2.2 Evidence Submission Portal

- Project owner sees controls organized by family with progress indicators
- Each control shows: ID, title, tailored description, evidence guidance, inheritance status
- **Rich text editor** per control for evidence input (bold, italic, lists, headings, links)
- Auto-save on each control's evidence field
- File/video attachment upload per control (max 25MB per file)
- Visual progress bar: X of Y controls addressed

### 2.3 Comment Threads

- Each control has a collapsible comment thread
- Both practitioner and project owner can post comments
- Timestamped, author-labeled messages
- Unobtrusive — collapsed by default, badge shows unread count

### 2.4 Submission & Locking

- "Submit All Evidence" button with confirmation dialog
- On submission: all evidence fields lock (read-only), timestamp recorded
- Email notification sent to practitioner
- Practitioner can **reactivate** the submission to allow edits

---

## Phase 3 — Audit & Scoring (Assessor Side)

### 3.1 Audit Interface

- Practitioner sees each control with the submitted evidence
- Per control: **Met / Partially Met / Not Met** radio buttons
- Auditor comments field per control
- Ability to view attachments inline or download
- Filter/sort by: family, status (met/partial/not-met/unreviewed), priority

### 3.2 Scoring Engine

- Auto-calculates score: Met = 1.0, Partially Met = 0.5, Not Met = 0.0
- Score = (total points / applicable controls) × 100
- Thresholds (aligned to GC SA&A guidelines):
  - **ATO**: 100% met (all controls fully satisfied)
  - **iATO**: ≥ 80% with no critical (P1) gaps
  - **Denied**: < 80% or critical gaps present
- Visual score dashboard: pie/bar chart, family-level breakdown

### 3.3 Assessment Completion

- Practitioner finalizes audit, system determines ATO/iATO/Denied
- Summary page with overall score, per-family scores, gap list
- Option to save met controls as **reusable templates** for future assessments

---

## Phase 4 — Authorization Package (ATO / iATO)

### 4.1 ATO Document Generation

- PDF generated with: project details, control summary, audit results, score, authorization statement
- Signature blocks: Assessor → Project Authority → CIO
- Timestamp and unique document ID

### 4.2 iATO with Remediation Checklist

- If iATO: practitioner creates a checklist of remediation items
- Each item: description, linked control(s), deadline, assigned to, status
- Checklist visible to project owner via their access code
- Project owner can update status; practitioner validates

### 4.3 iATO → ATO Upgrade Path

- Once all checklist items addressed, practitioner triggers a new audit round
- Same audit interface (3.1) focused on previously not-met/partially-met controls
- If all pass → ATO generated, file closed
- If gaps remain → updated iATO or denied

### 4.4 Signature Workflow

- Generated document sent to assessor for digital signature (or checkbox acknowledgment v1)
- Then to project authority, then CIO
- Each signer notified by email
- Final signed document stored and downloadable

---

## Phase 5 — Reusability & Templates

### 5.1 Save Control Templates

- When an assessment achieves ATO, met controls can be saved as templates
- Template includes: tailored description, evidence guidance, example evidence text, technology tags

### 5.2 Template Reuse on New Assessments

- When creating a new assessment, system checks for matching templates based on tech stack overlap
- Practitioner can apply templates to pre-fill tailored descriptions and evidence guidance
- Example evidence from past assessments shown as reference (not auto-filled for the project owner)

---

## Phase 6 — Exports & Reporting

### 6.1 PDF Export — Assessment Report

- Full report: project details, all controls with evidence, audit results, scoring, comments
- Formatted for GC standards (Government of Canada branding)

### 6.2 PDF Export — ATO/iATO Document

- Authorization document with signature blocks
- Executive summary, risk posture, conditions (for iATO)

### 6.3 Dashboard & Analytics

- Assessor dashboard: total projects, active assessments, pending audits, ATO/iATO counts
- Per-project status at a glance

---

## Phase 7 — Future Enhancements (Post-MVP)

### 7.1 LLM Integration for Evidence Refinement

- Project owner can click "Refine with AI" on evidence text
- LLM rewrites/improves text, references official GC documentation
- Practitioner can also use LLM to generate tailored descriptions

### 7.2 Markdown Upload for Project Specs

- Accept .md file upload at project creation for detailed specs
- Parse and display as project context alongside controls

### 7.3 Video Attachment Support

- Upload and inline preview for video evidence

### 7.4 Advanced Signature Capture

- Digital signature pad or integration with GC signing tools

### 7.5 Multi-Assessor Collaboration

- Multiple practitioners on a single assessment with role assignments

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js + Express |
| Templates | Handlebars (.hbs) |
| Database | sql.js (SQLite in-memory/file) |
| Auth | Passport.js (local strategy) |
| UI Framework | Bootstrap 5.3 + Bootstrap Icons |
| Rich Text | TinyMCE or Quill (embedded in forms) |
| File Upload | Multer |
| PDF Generation | PDFKit |
| Email | Nodemailer |
| Styling | Cloudstrucc-style (Open Sans/Raleway, GC blue/red accent palette) |

---

## Build Order (Step by Step)

| Step | Scope | Depends On |
|------|-------|-----------|
| **1** | Project creation + auth (1.1, 1.2) | — |
| **2** | Control catalog + recommendation engine (1.3) | Step 1 |
| **3** | Inherited control detection (1.4) | Step 2 |
| **4** | Control tailoring UI (1.5) | Step 3 |
| **5** | Invite system + access code (2.1) | Step 4 |
| **6** | Evidence submission portal + rich text (2.2) | Step 5 |
| **7** | Comment threads (2.3) | Step 6 |
| **8** | Submission locking + reactivation (2.4) | Step 7 |
| **9** | Audit interface + scoring (3.1, 3.2) | Step 8 |
| **10** | ATO/iATO determination + doc gen (3.3, 4.1, 4.2) | Step 9 |
| **11** | iATO checklist + upgrade path (4.2, 4.3) | Step 10 |
| **12** | Signature workflow (4.4) | Step 11 |
| **13** | Template reuse (5.1, 5.2) | Step 10 |
| **14** | PDF exports + dashboard (6.1–6.3) | Step 10 |
| **15** | LLM integration + enhancements (7.x) | All above |
