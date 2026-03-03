# GC Security Assessment & Authorization (SA&A) Tool

A web-based tool for Government of Canada security practitioners to conduct ITSG-33 security assessments, manage evidence gathering, perform audits, and generate ATO/iATO authorization packages with Plan of Action & Milestones (POA&M).

Built with the GCWeb (WET) design system, Node.js, Express, Handlebars, Bootstrap 5, and sql.js.

---

## Quick Start

### Prerequisites

* **Node.js** 18+ (LTS recommended)
* **npm** 9+
* **Anthropic API key** (optional — for AI features)
* **Microsoft 365 SMTP** credentials (optional — for email notifications)

### 1. Install & Run

```bash
git clone https://github.com/Cloudstrucc/SecurityAsessmentTool-GC.git 
cd SecurityAssessmentsTool
npm install
cp .env.example .env    # Edit with your settings
npm start
```

The app starts at  **http://localhost:3000** .

### 2. Configure Environment

Create a `.env` file in the project root:



```env
# ── Server ──
PORT=3000
NODE_ENV=development
SESSION_SECRET=change-this-to-a-random-secret-string # example way to generate random secure secure from your terminal (bash) openssl rand -base64 32

# ── Admin Credentials ──
# The default assessor account is created on first startup.
# Delete data/sa-tool.db and restart to recreate with new credentials.
ADMIN_EMAIL=admin@youragency.gc.ca
ADMIN_PASSWORD=ChangeThisPassword123!
ADMIN_NAME=Security Assessor

# ── Email (Microsoft 365 SMTP) ──
# Option 1: App Password (recommended for M365)
#   Create at https://account.microsoft.com/security → App Passwords
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=sa-tool@youragency.gc.ca
SMTP_PASSWORD=your-16-char-app-password
EMAIL_FROM="GC SA&A Tool <sa-tool@youragency.gc.ca>"

# Option 2: OAuth2 (for orgs that disable App Passwords)
# SMTP_OAUTH_CLIENT_ID=your-azure-ad-app-client-id
# SMTP_OAUTH_CLIENT_SECRET=your-client-secret
# SMTP_OAUTH_REFRESH_TOKEN=your-refresh-token

# ── AI (Anthropic Claude) ──
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# ── File Uploads ──
MAX_FILE_SIZE_MB=25
```

> **Note:** If SMTP is not configured or authentication fails, the app continues to function — emails are logged to the console instead. Invite codes are always displayed in the UI so they can be shared manually.

### 3. Default Login

| Role             | URL               | Email                                   | Password                    |
| ---------------- | ----------------- | --------------------------------------- | --------------------------- |
| Assessor (Admin) | `/admin/login`  | Value of `ADMIN_EMAIL`                | Value of `ADMIN_PASSWORD` |
| Client           | `/client/login` | Self-registered at `/client/register` | Client-chosen               |

### 4. Seed Sample Data

The project includes a browser console script that creates 7 diverse intake submissions spanning all security profiles.

1. Register a client account at `http://localhost:3000/client/register`
2. Log in as the client
3. Open browser DevTools (F12) → Console
4. Paste the contents of **`seed-intakes.js`** and press Enter
5. Log in as the assessor at `/admin/login` and check `/admin/intakes`

The 7 sample intakes cover:

| # | Project                | Classification            | Expected Profile | Controls |
| - | ---------------------- | ------------------------- | ---------------- | -------- |
| 1 | Canada.ca Landing Page | Unclassified / L / L      | NONE (No SA&A)   | 0        |
| 2 | Staff Directory        | Protected A / L / L       | CCCS_LOW         | 112      |
| 3 | Immigration Case Mgmt  | Protected B / M / M       | PBMM             | 305      |
| 4 | CRA MyAccount Portal   | Protected B / M / M + HVA | PBMM_HVA         | 342      |
| 5 | Health Surveillance    | Protected B / H / H       | PB_HIGH          | 342      |
| 6 | Witness Protection     | Protected C / M / M       | PC_BASELINE      | 342+     |
| 7 | Intel Collaboration    | Secret / M / M            | SECRET_MM        | 342      |

### 5. Deploy to Azure

```bash
chmod +x deploy-azure.sh
az login
./deploy-azure.sh
```

The script auto-detects existing resources or creates new ones. Supports `--update-only` for code-only deploys and `--settings-only` for env var updates. Set API keys via Azure App Settings or the script's interactive prompts.

---

## Architecture

### Project Structure

```
├── app.js                          # Express app entry point
├── package.json
├── .env                            # Environment configuration
├── deploy-azure.sh                 # Azure App Service deployment
├── seed-intakes.js                 # Browser console sample data seeder
│
├── config/
│   ├── ai-service.js               # Anthropic Claude API integration
│   ├── itsg33-controls.js          # 342 ITSG-33 controls catalogue
│   ├── passport.js                 # Authentication (Passport.js + MFA)
│   └── security-profiles.js        # 7-level C/I/A categorization engine
│
├── models/
│   └── database.js                 # SQLite schema & initialization
│
├── routes/
│   ├── admin.js                    # Assessor routes (dashboard, projects, assessments, POA&M)
│   ├── api.js                      # API routes (AI endpoints, control updates)
│   └── public.js                   # Public routes (intake, client portal, evidence submission)
│
├── utils/
│   ├── emailService.js             # Microsoft 365 SMTP with OAuth2 + App Password
│   └── pdfExport.js                # Assessment & ATO/iATO PDF generation
│
├── views/
│   ├── layouts/main.hbs            # GCWeb layout (FIP header, Canada wordmark)
│   ├── admin/                      # 13 assessor views
│   │   ├── dashboard.hbs
│   │   ├── intakes.hbs
│   │   ├── intake-review.hbs
│   │   ├── projects.hbs
│   │   ├── project-detail.hbs
│   │   ├── assessments.hbs
│   │   ├── assessment-detail.hbs   # Main audit view with POA&M + family nav
│   │   ├── assessment-new.hbs
│   │   ├── manage-controls.hbs
│   │   ├── guidance-report.hbs
│   │   ├── login.hbs
│   │   └── settings.hbs
│   └── public/                     # 9 client/public views
│       ├── intake.hbs              # 8-section intake form with AI doc parsing
│       ├── respond.hbs             # Evidence submission portal
│       ├── checklist.hbs           # iATO remediation checklist (client view)
│       ├── register.hbs / client-login.hbs / mfa-setup.hbs
│       └── guidance-portal.hbs / guidance-submitted.hbs / success.hbs
│
├── data/
│   └── sa-tool.db                  # SQLite database (auto-created on startup)
└── uploads/                        # File attachments
```

### Tech Stack

| Component   | Technology                                                                |
| ----------- | ------------------------------------------------------------------------- |
| Runtime     | Node.js 18+ / Express 4                                                   |
| Templates   | Handlebars (.hbs) with 33+ custom helpers                                 |
| Database    | sql.js (SQLite, file-backed)                                              |
| Auth        | Passport.js (local strategy) + TOTP MFA (otplib + qrcode)                 |
| UI          | Bootstrap 5.3 + Bootstrap Icons + GCWeb theme                             |
| PDF         | PDFKit (assessment reports, ATO/iATO documents)                           |
| Email       | Nodemailer (M365 SMTP with OAuth2 / App Password)                         |
| AI          | Anthropic Claude API (document parsing, evidence guidance, intake review) |
| File Upload | Multer (25MB max per file)                                                |

---

## Feature Reference

### Phase 1 — Intake & Project Setup

#### 1.1 Client Intake Form

Eight-section intake form with real-time profile preview:

1. **Project Information** — name, description, department, branch, go-live date, user count, app type
2. **Security Categorization** — three-axis C/I/A classification (7 confidentiality levels from Unclassified to Top Secret, 3 integrity levels, 3 availability levels), HVA designation, PII types (10 categories including Indigenous data)
3. **Privacy & ATIP** — PIA status, ATIP subject
4. **Hosting & Technology** — hosting type, region, 21 technology checkboxes (Azure, AWS, GCP, Entra ID, Sentinel, CrowdStrike, etc.), free-text for others
5. **Interconnections** — APIs, GC system interconnections, mobile access, external users
6. **Completed Activities** — TRA, PIA, SSP, VAPT, network diagrams, previous SA&A
7. **Contacts** — project owner, tech lead, authorizing official
8. **Attachments & Notes** — file uploads, additional context

**AI-Powered Document Parsing:** Upload a project spec (PDF, DOCX, etc.) and AI auto-suggests values for all form fields.

**Real-Time Profile Preview:** Side panel updates as you fill the form, showing the determined security profile and estimated control count.

#### 1.2 Security Profile Engine

Seven-level categorization engine per TBS Directive on Security Management:

| Profile         | Trigger                                         | Controls             |
| --------------- | ----------------------------------------------- | -------------------- |
| `NONE`        | Unclassified, no PII, low I/A                   | 0 (no SA&A required) |
| `CCCS_LOW`    | Protected A / Low, or Unclassified with PII     | 112                  |
| `PBMM`        | Protected B / Medium / Medium                   | 305                  |
| `PBMM_HVA`    | Protected B / M / M + HVA designation           | 342                  |
| `PB_HIGH`     | Protected B with High integrity or availability | 342 (enhanced)       |
| `PC_BASELINE` | Protected C (tailored above PBMM)               | 342+                 |
| `SECRET_MM`   | Secret / Medium / Medium (ITSG-33 Profile 3)    | 342                  |

#### 1.3 Admin Intake Review

* AI-powered review summary with risk flags and recommended questions
* AI-suggested additional controls based on project description
* Engine Preview panel showing profile, control count, P1/P2/P3 breakdown
* Accept → creates project + assessment with filtered controls
* Control filtering options: exclude inherited controls, include only P1/P2

#### 1.4 Automatic Control Recommendation

342 ITSG-33 controls catalogued across 18 families, with:

* Profile-based filtering (CCCS_LOW gets 112, PBMM gets 305, etc.)
* Technology-based inheritance detection (e.g., Entra ID → IA family, Azure → PE family)
* Priority tagging: P1 (mandatory), P2 (conditional)
* Tailored descriptions per control based on project context
* Evidence guidance per control

#### 1.5 TBS Risk Categorization

Every control is classified by risk level per Treasury Board policy:

* **High** — P1 in critical families (AC, AU, IA, SC, SI, CP, IR, PE)
* **Medium** — P1 in other families, or P2 in critical families
* **Low** — P2 in non-critical families

Risk levels drive POA&M deadlines, ATO determination logic, and PDF report formatting.

### Phase 2 — Evidence Gathering (Client Side)

#### 2.1 Invite System

* Assessor generates invite with unique access code
* Email sent via Microsoft 365 SMTP (falls back to console log if SMTP unavailable)
* 30-day configurable expiry
* Flash message shows code for manual sharing if email fails

#### 2.2 Evidence Submission Portal

* Controls grouped by family with progress indicators
* Rich text editor (contenteditable) per control with formatting toolbar
* Auto-save (1.5s debounce) — no submit-per-control needed
* File attachment upload per control (25MB max)
* **AI Evidence Guidance** displayed per control — tells the client exactly what to provide (generated by the assessor via AI)
* Comment threads per control (client ↔ assessor)
* Global progress bar: X of Y controls addressed
* "Submit All Evidence" with confirmation → locks form, notifies assessor

#### 2.3 Submission Reactivation

Assessor can reactivate a submitted assessment to allow client edits.

### Phase 3 — Audit & Scoring

#### 3.1 Assessment Detail (Assessor View)

* Controls displayed with family navigation sidebar (sticky, with scroll-spy)
* Mobile-responsive: horizontal scrollable family strip on small screens
* Per control: Met / Partially Met / Not Met radio buttons + auditor comments
* TBS risk level badge (High/Medium/Low) on every control
* Filter input for family codes
* Progress indicators in sidebar

#### 3.2 AI Evidence Guidance

Refactored workflow: the AI generates **guidance for the client** (not the evidence itself):

* Assessor clicks "AI Evidence Guidance" on any control
* AI produces an actionable bullet list (e.g., "Export Azure AD Conditional Access policies showing MFA enforcement")
* "Save to Control" writes guidance to the `evidence_guidance` field
* Client sees guidance in their evidence submission portal with a lightbulb icon
* Bulk mode: generate guidance for 5/10/20 controls at once via FAB button

#### 3.3 Scoring Engine

* Met = 1.0, Partially Met = 0.5, Not Met = 0.0
* Score = (total points / applicable controls) × 100
* TBS-aligned thresholds:
  * **ATO** : ≥80% with no high-risk findings
  * **iATO** : ≥60% (POA&M auto-generated)
  * **Denied** : <60% or assessor override

#### 3.4 Complete Audit Panel

Expanded form with:

* TBS risk summary (high-risk findings count, met/partial/not-met)
* TBS policy alert if high-risk controls are not met
* Override option (auto-calculate, force ATO, force iATO, force Denied)
* iATO expiry date (default 90 days)
* Risk acceptance statement (required for iATO per TBS Directive)
* POA&M notes

### Phase 4 — Authorization Packages

#### 4.1 ATO Document (PDF)

* Title page: "Government of Canada — Authority to Operate"
* System details: name, classification, profile, C/I/A, hosting
* Compliance summary: score, visual bar, met/partial/not-met/pending counts
* Family breakdown table (9 columns)
* Full control evidence appendix
* Signature page: 4 blocks (Assessor, Project Authority, CIO, DSO)
* Footer: page numbers, project name, document type

#### 4.2 iATO with POA&M

Full Plan of Action & Milestones system per TBS Directive on Security Management:

* **Auto-populate** from audit findings (not-met / partially-met controls)
* **Risk-based deadlines** : High = 30 days, Medium = 60 days, Low = 90 days
* **Status workflow** : Open → In Progress → Completed → Verified
* **Per-item tracking** : description, linked control, risk level, assigned-to, deadline, remediation plan, milestone, evidence
* **Progress visualization** : color-coded progress bar, overdue alerts
* **Risk acceptance statement** : documented residual risk per TBS policy
* **iATO expiry date** : visible in both UI and PDF
* **PDF appendix** : full POA&M table with risk levels and remediation plans

#### 4.3 iATO → ATO Upgrade Path

* Assessor reactivates submission for client updates
* New audit round focused on previously not-met/partially-met controls
* If all pass → full ATO generated
* If gaps remain → updated iATO or denied

#### 4.4 Assessment Report (PDF)

* Project info, classification, score
* Compliance summary with visual score bar
* Family breakdown table
* Detailed controls with evidence text, guidance, auditor comments
* TBS risk level per control
* Page headers/footers with GC branding

### Phase 5 — Reusability & Templates

* Met controls automatically saved as templates on ATO
* Templates include: tailored description, evidence guidance, example evidence, technology tags
* New assessments check for matching templates based on tech stack overlap
* Template reuse pre-fills descriptions and guidance (evidence not auto-filled for client)

### Phase 6 — Guidance Workflow (Non-SA&A)

* Lightweight GC web standards compliance checklist
* Invite-based portal for project owners
* Assessor validates and approves
* PDF export of guidance report

### Phase 7 — Dashboard & Analytics

* 5-tile dashboard: total projects, active assessments, pending audits, ATO count, iATO count
* Per-project status at a glance
* Quick links to recent assessments and pending items

---

## AI Integration

All AI features use the Anthropic Claude API and require `ANTHROPIC_API_KEY` in `.env`.

| Feature             | Endpoint                                | Description                                              |
| ------------------- | --------------------------------------- | -------------------------------------------------------- |
| Document Parsing    | `POST /api/ai/parse-document`         | Upload project specs → AI suggests intake form values   |
| Intake Review       | `POST /api/ai/review-intake/:id`      | AI summary of intake with risk flags and questions       |
| Control Suggestions | `POST /api/ai/suggest-controls/:id`   | AI suggests additional controls based on project         |
| Evidence Guidance   | `POST /api/ai/evidence-guidance`      | AI generates actionable guidance for clients             |
| Save Guidance       | `POST /api/ai/save-guidance/:id`      | Saves AI guidance to a control's evidence_guidance field |
| Evidence Narrative  | `POST /api/ai/evidence-narrative`     | AI drafts evidence narrative (assessor use)              |
| Bulk Evidence       | `POST /api/ai/generate-bulk-evidence` | Batch evidence guidance for multiple controls            |

Rate limiting: automatic retry with exponential backoff (2s → 4s → 8s) on 429 responses.

---

## Email Configuration

The tool supports two Microsoft 365 SMTP authentication methods:

### App Password (Simplest)

1. Go to [account.microsoft.com/security](https://account.microsoft.com/security)
2. **Security** → **Advanced security options** → **App Passwords** → create one
3. Set `SMTP_PASSWORD` to the generated 16-character password

### OAuth2 (For Orgs That Disable App Passwords)

1. Register an Azure AD app with Mail.Send permission
2. Set `SMTP_OAUTH_CLIENT_ID`, `SMTP_OAUTH_CLIENT_SECRET`, `SMTP_OAUTH_REFRESH_TOKEN`

### Fallback

If SMTP is not configured or authentication fails, the app:

* Logs a warning at startup with troubleshooting instructions
* Continues to function normally — emails are logged to console
* Shows invite codes in the UI flash message for manual sharing
* Never crashes on email failure (all sends wrapped in try/catch)

---

## GCWeb Theme

The UI implements the Government of Canada Web Experience Toolkit (WET) design:

* **FIP Header** : Canada wordmark, bilingual Government of Canada signature
* **Canada Wordmark Footer** : official footer with landscape links
* **WCAG 2.0 AA** : accessible color contrast, skip links, ARIA roles
* **Typography** : Noto Sans / Lato (GC standard)
* **Color Palette** : Navy (#26374a), Red (#af3c43), Link Blue (#2b4380)
* **CSS Variables** : all themed via `--gc-*` custom properties

---

## Database

SQLite database (`data/sa-tool.db`) auto-created on first startup. Delete to reset.

**Tables:** users, intake_submissions, intake_attachments, projects, assessments, assessment_controls, comments, attachments, iato_checklist (POA&M), control_templates, guidance_reports

**Schema migrations** run automatically — new columns added via `ALTER TABLE` with safe try/catch.

---

## Security Considerations

* Session-based auth with Passport.js + optional TOTP MFA
* Helmet.js for HTTP security headers
* CSRF protection via session tokens
* File upload validation (type, size)
* Input sanitization on all form fields
* Rate-limited AI calls with retry logic
* **Not for production classified data** — this is an assessment management tool, not a classified data store. The tool tracks the assessment process; actual classified documents should remain in approved GC systems.

---

## Build Order Reference

| Step | Scope                                        | Status                               |
| ---- | -------------------------------------------- | ------------------------------------ |
| 1    | Project creation + auth                      | ✅ Complete                          |
| 2    | ITSG-33 control catalogue (342 controls)     | ✅ Complete                          |
| 3    | Inherited control detection                  | ✅ Complete                          |
| 4    | Control tailoring UI                         | ✅ Complete                          |
| 5    | Invite system + access code                  | ✅ Complete                          |
| 6    | Evidence submission portal + rich text       | ✅ Complete                          |
| 7    | Comment threads                              | ✅ Complete                          |
| 8    | Submission locking + reactivation            | ✅ Complete                          |
| 9    | Audit interface + scoring                    | ✅ Complete                          |
| 10   | ATO/iATO determination + PDF generation      | ✅ Complete                          |
| 11   | iATO POA&M + upgrade path                    | ✅ Complete                          |
| 12   | Signature workflow                           | ⬜ Checkbox v1 (digital sig pending) |
| 13   | Template reuse                               | ✅ Complete                          |
| 14   | PDF exports + dashboard                      | ✅ Complete                          |
| 15   | AI integration (doc parse, guidance, review) | ✅ Complete                          |
| 16   | Three-axis C/I/A categorization (7 levels)   | ✅ Complete                          |
| 17   | TBS risk categorization (High/Medium/Low)    | ✅ Complete                          |
| 18   | GCWeb theme (FIP, WET, WCAG 2.0 AA)          | ✅ Complete                          |
| 19   | Client registration + MFA                    | ✅ Complete                          |
| 20   | Family navigation sidebar + scroll-spy       | ✅ Complete                          |
| 21   | POA&M with risk-based deadlines              | ✅ Complete                          |
| 22   | Email service (M365 OAuth2 + App Password)   | ✅ Complete                          |

---

## Future Enhancements

* Digital signature capture (signature pad or GC signing integration)
* Multi-assessor collaboration with role assignments
* Video attachment support with inline preview
* Markdown upload for project specs
* Continuous monitoring dashboard
* SCAP/OSCAL export format
* Bilingual (English/French) support

---

## License

Internal Government of Canada tool. Not for public distribution.
