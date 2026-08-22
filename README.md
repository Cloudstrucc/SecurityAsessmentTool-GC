# Aegis SA — Security Assessment Platform

**Aegis SA** ("SA" = Security Assessment) is the product name; the codebase, Azure resources, and env files still use the legacy `vanguard-saa` / `sa-tool` identifiers.

Node.js/Express application for managing security assessment & authorization (SA&A) work: project intake, project records, multi-framework assessment packages (ITSG-33, NIST SP 800-53, CIS, ISO/IEC 27001, FedRAMP, ASD ISM, ACSC Essential Eight), evidence collection, assignment, MFA, and assessor/client workflows. User-facing content is internationally neutral and localized into 8 languages.

## What This App Does

- Lets clients submit intake forms and supporting documents.
- Lets assessors create projects directly from the admin dashboard.
- Creates a project intake record when a project is created by an assessor.
- Lets assessors create assessments from projects and link them back to the related intake.
- **Accepting an intake never creates an assessment.** If the intake already belongs to a project,
  acceptance records the decision and returns to that project; a standalone (client-submitted)
  intake creates a project only. Creating the assessment stays an explicit step from the project.
- Stores project documentation for later AI analysis, evidence guidance, audit traceability, and reporting references.
- Lets assessors tailor assessment controls, edit guidance/evidence fields, and preserve AI guidance provenance.
- Shows a **business process flow** (chevron) on projects, intakes and assessments: the project's
  position in the lifecycle (Intake → Security assessment → Decision package → Authorized) is
  **derived from its own records**, so it cannot drift. Each stage expands into a checklist of
  completed/outstanding steps that link straight to the underlying record, and the next action is
  surfaced explicitly. Fully localized in all 8 languages.
- Records authorization decisions as **decision packages** (ATO / iATO / denial) with their own
  state machine. Each package **pins the exact assessment version it authorized** — an
  append-only snapshot — plus the POA&M items and a document manifest with SHA-256 hashes, so
  what was authorized can always be proven. The assessment is locked while a decision is under
  review and released once issued; issued packages cannot be deleted (revoke instead).
- Provides project **collaboration**: discussion threads posted against any record but rolled up
  to the project, with @mentions resolved server-side against that project's own people and
  records. On by default, switchable per project and org-wide. Collaboration content is **never
  sent to the AI provider**.
- Versions each assessment: every change checkpoint (creation, AI-applied changes, manual checkpoints) is captured as a point-in-time snapshot, with a full audit history and non-destructive revert to any prior version.
- Includes the **Aegis SA Assistant** — the single in-app AI chat, available on every major record
  (project, intake, assessment, decision package, plus the evidence portal) with context-aware
  starter prompts for the record in view. It helps tailor controls, answer coverage questions and
  draft evidence; the assessor approves every change. Non-chat AI generators (document analysis,
  intake review, control suggestions) remain, shown in a result panel.
- **Evidence submission requires an account.** An invite code identifies which assessment you are
  responding to, but contributors must sign in, so every contribution is attributable.
- Routes **all** transactional email through the tenant's own SMTP when configured (not just
  invitations), resolved from the request's organization context.
- Provides project-level report branding, control exports, full project exports, decision-package PDF exports (rendered from the pinned assessment version), and POA&M management.
- Includes an admin security control catalog at `/admin/security-controls` with ITSG-33, CIS, ISO/IEC 27001, FedRAMP, NIST SP 800-53, ASD ISM, and ACSC Essential Eight entries.
- Includes an authenticated Help guide with screenshots, plus standalone Markdown and HTML guide files under `docs/`.
- Lets assessors assign intakes and assessments to existing users or invite new client/assessor users.
- Supports TOTP MFA and passkeys, with TOTP available as a fallback whenever a passkey is used.
- Supports a controlled break-glass assessor account that uses password-only login for emergency recovery.
- Gives tenant root admins full CRUD over organization settings at `/admin/organization` — own SMTP, own SMS (Twilio), a bring-your-own AI provider / MCP server, and a custom domain. Each group can be created, updated, tested, and **deleted**; deleting clears the stored credentials and falls back to the platform default.
- Validates every integration for real, never by self-attestation: a **custom domain is only marked verified when its TXT ownership record and CNAME (or apex A) routing record actually resolve in public DNS**; SMTP is checked with a real connection + auth handshake (no mail sent); SMS with a live Twilio credential call; the AI provider with a real model round-trip. Each shows a **Last valid check** timestamp with a re-validate button, and keeps a **24-hour check log**.

## Requirements

- Node.js 20 LTS recommended. Node.js 18+ should also work.
- npm 9+
- Azure CLI for Azure App Service deployment.
- Optional: SMTP credentials for email notifications.
- Optional: Anthropic API key for AI-assisted intake/document workflows.

## Start From Scratch

```bash
git clone <repo-url>
cd SecurityAssessmentTool
npm install
cp .env.example .env
npm run dev
```

Open:

- App home: `http://localhost:3000`
- Assessor login: `http://localhost:3000/admin/login`
- Client login: `http://localhost:3000/client/login`
- Client registration: `http://localhost:3000/client/register`
- Health check: `http://localhost:3000/health`

The database is created automatically at `data/sa-tool.db` unless `DB_PATH` is set.

## Environment

Create `.env` from `.env.example` and update the values for your environment.

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=replace-with-a-long-random-secret

ADMIN_EMAIL=admin@youragency.gc.ca
ADMIN_PASSWORD=ChangeThisPassword123!
ADMIN_NAME=Security Assessor

DATA_DIR=./data
DB_PATH=./data/sa-tool.db

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM="GC SA Tool <sa-tool@example.gc.ca>"

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514

MAX_FILE_SIZE_MB=25
```

Useful notes:

- `SESSION_SECRET` must be stable across restarts or active sessions will be invalidated.
- If SMTP is not configured, invitation emails are logged to the server console instead.
- `DB_PATH` is useful for tests, backups, and local experiments because it lets you point the app at a separate SQLite file.
- Uploaded files are stored under `uploads/`.

## Common Commands

```bash
npm start
npm run dev
npm run users -- list
npm run test:e2e
```

`npm start` runs `node app.js`.

`npm run dev` starts the app with `NODE_ENV=development`.

`npm run users -- list` lists users in the configured database.

`npm run test:e2e` runs the integration test suite against a temporary database and a temporary local port.

## Admin And User Scripts

User administration is handled by `scripts/manage-users.js`.

List users:

```bash
npm run users -- list
```

Create or regenerate an assessor/admin user with MFA enabled:

```bash
npm run user:admin -- --email admin@youragency.gc.ca --password 'ChangeThisPassword123!' --name 'Security Assessor'
```

The command upserts the user: if the email exists it updates the password, role, profile fields, and MFA settings. It prints the TOTP secret so it can be enrolled in an authenticator app.

Create a dedicated MFA-enabled test assessor:

```bash
npm run users -- test-assessor --email e2e.assessor@example.test --password 'TestPassword123!'
```

Create a dedicated MFA-enabled test client:

```bash
npm run users -- test-client --email e2e.client@example.test --password 'TestPassword123!'
```

Target a different database:

```bash
DB_PATH=/tmp/sa-tool-test.db DATA_DIR=/tmp npm run users -- list
```

## Break-Glass Account

Break-glass accounts are assessor accounts that bypass TOTP and passkey checks. They are meant for emergency recovery only.

Create or regenerate one:

```bash
npm run user:break-glass -- --email breakglass.admin@local.test --password 'Use-A-Long-Random-Password' --name 'Break Glass Administrator'
```

Operational rules:

- Store the password offline in an approved vault or sealed recovery process.
- Do not use the account for normal assessment work.
- Rotate the password after any emergency use.
- Keep the number of break-glass accounts as small as possible.
- Review audit logs after use.

Normal assessor and client users should use MFA. The automated test suite uses dedicated MFA-required test users, not the break-glass account.

## MFA And Passkeys

Expected behavior:

- New assessor/admin users without MFA are challenged to configure TOTP after password login.
- Client users configure TOTP during registration or first sign-in flow.
- Users can register a passkey after completing TOTP.
- If a user has a passkey, TOTP remains available as a fallback.
- Break-glass assessor users bypass MFA by design.

If a user loses MFA access, regenerate the account with `scripts/manage-users.js admin` or `scripts/manage-users.js test-client` using a new TOTP secret.

## Project, Intake, Assessment Flow

Assessor-created project flow:

1. Sign in at `/admin/login`.
2. Go to `/admin/projects`.
3. Choose New Project.
4. Enter the project details, security categorization, description, and optional attachments.
5. Save the project.

The app creates:

- A `projects` record.
- A linked `intake_submissions` record.
- Any uploaded project intake attachments.

Create an assessment from a project:

1. Open the project detail page.
2. Choose Create Assessment.
3. Review the tailored recommended controls or switch to the full baseline.
4. Save the assessment.
5. Use Tailor on the assessment page to edit applicability, descriptions, guidance, evidence, notes, status, and risk.

The assessment is linked to both the project and the project intake record.

Project documentation:

1. Open the project detail page.
2. Use the Documentation section to upload project documents.
3. Uploaded documents are associated with the project and can be downloaded, removed, used for control suggestion, or selected for AI evidence guidance.
4. Full project reports list associated documents but do not embed uploaded attachments.

AI evidence guidance:

1. Upload one or more project documents.
2. Open the assessment page.
3. In AI Guidance From Project Documentation, select documents and controls.
4. Generate a preview.
5. Review, edit, and save approved guidance.

The app does not silently overwrite existing assessor-entered guidance unless the save action confirms replacement.

ATO/iATO and POA&M:

1. Open a project.
2. Use Reports & Authorization to create an ATO or iATO record.
3. Edit all authorization sections before export.
4. Add POA&M items from an assessment and link them to controls and ATO/iATO records.
5. Manage owners, due dates, status, mitigation plans, milestones, residual risk, and assessor notes.

Admin control catalog:

- Browse `/admin/security-controls`.
- Current seeded frameworks: ITSG-33, CIS Controls v8, ISO/IEC 27001:2022 Annex A, FedRAMP Rev. 5, NIST SP 800-53 Rev. 5, ASD ISM, and ACSC Essential Eight.
- Filter by framework, family, category, baseline, applicability, status, or keyword.
- Export the visible catalog data as CSV.
- Regenerate the non-ITSG catalog data from official machine-readable sources with `npm run catalog:generate`.
- CIS and ISO entries intentionally include identifiers, titles, and conservative metadata only. Use the official publications for normative control text.

Assignment flow:

1. Open an intake, project, or assessment detail page.
2. Use the assignment form.
3. Select an existing active client/assessor user, or invite a new user.
4. If the invited user does not exist, the app creates a pending invitation code.
5. Once the user registers with the invitation, they can access assigned work according to their role.

## Test Suite

The e2e tests live in `tests/e2e/security-assessment.e2e.test.js`.

Run:

```bash
npm run test:e2e
```

Each run creates a new Markdown report in `tests/reports/`, for example `tests/reports/e2e-2026-05-07T12-00-00-000Z.md`.

The suite:

- Creates a temporary database under the OS temp directory.
- Starts the app on a random local port.
- Seeds dedicated MFA-required assessor and client users.
- Seeds a break-glass user only inside the temporary database to verify emergency-login behavior.
- Deletes the temporary database after the run.

Current executable checks:

- Admin without MFA is redirected to TOTP setup.
- Break-glass admin can sign in with password only.
- MFA-enabled assessor can sign in with TOTP and see passkey setup while TOTP remains available.
- Client can sign in with TOTP and create an intake.
- Admin can create a project and linked project intake.
- Admin can create an assessment linked to the project intake.
- Admin can upload the SADD HTML document to project documentation and download it later.
- Admin can tailor assessment controls and persist description, guidance, evidence, notes, status, applicability, and risk changes.
- Admin can preview and save AI evidence guidance generated from uploaded project documentation.
- Admin can create editable ATO/iATO records and manage linked POA&M items.
- Admin can browse the security control catalog.
- Assessment creation captures a baseline version and manual checkpoints add new versions.
- Reverting an assessment restores the prior control set as a new active version and records the revert in the audit history.
- The legacy `/sa-tool-overview.html` path redirects to the live overview route (guards against stale static files in `wwwroot`).

The suite forces `MFA_ENABLED=true` on the server it spawns, so `npm run test:e2e` runs the full TOTP/passkey flow directly — no extra environment variables are needed. It currently runs 62 checks. See [docs/TESTING.md](docs/TESTING.md) for what each one covers.

In the Codex sandbox, binding a local test server may require approval. On a normal developer machine, `npm run test:e2e` should run directly.

## Azure Deployment

The repo includes `deploy-azure.sh` for Azure App Service.

Prerequisites:

```bash
az login
az account show
```

Fresh deploy:

```bash
chmod +x deploy-azure.sh
./deploy-azure.sh
```

### Environments

The Azure apps live in the **vanguardcs** tenant, subscription **"Power Platform Dev"**. Each environment has its own App Service, resource group, and env file. A deploy syncs the named env file's keys to that app's settings.

| Environment | `AZURE_APP_NAME`    | `AZURE_RESOURCE_GROUP`  | `AZURE_ENV_FILE` |
| ----------- | ------------------- | ----------------------- | ---------------- |
| prod        | `vanguard-saa-prod` | `gc-sa-tool-prod-rg`    | `.env`           |
| qa          | `vanguard-saa-qa`   | `gc-sa-tool-qa-rg`      | `.env.qa`        |
| dev         | `vanguard-saa-dev`  | `gc-sa-tool-dev-rg`     | `.env.dev`       |

If a deploy errors with "app not found", select the subscription first:

```bash
az account set --subscription "Power Platform Dev"
```

### Update an environment (code + that env's settings)

```bash
AZURE_APP_NAME=vanguard-saa-prod AZURE_RESOURCE_GROUP=gc-sa-tool-prod-rg AZURE_ENV_FILE=.env     bash deploy-azure.sh --update-only -y
AZURE_APP_NAME=vanguard-saa-qa   AZURE_RESOURCE_GROUP=gc-sa-tool-qa-rg   AZURE_ENV_FILE=.env.qa  bash deploy-azure.sh --update-only -y
AZURE_APP_NAME=vanguard-saa-dev  AZURE_RESOURCE_GROUP=gc-sa-tool-dev-rg  AZURE_ENV_FILE=.env.dev bash deploy-azure.sh --update-only -y
```

### Deploy all three (prod → qa → dev) in one command

The `&&` chain stops on the first failure so a bad build never propagates:

```bash
AZURE_APP_NAME=vanguard-saa-prod AZURE_RESOURCE_GROUP=gc-sa-tool-prod-rg AZURE_ENV_FILE=.env bash deploy-azure.sh --update-only -y && AZURE_APP_NAME=vanguard-saa-qa AZURE_RESOURCE_GROUP=gc-sa-tool-qa-rg AZURE_ENV_FILE=.env.qa bash deploy-azure.sh --update-only -y && AZURE_APP_NAME=vanguard-saa-dev AZURE_RESOURCE_GROUP=gc-sa-tool-dev-rg AZURE_ENV_FILE=.env.dev bash deploy-azure.sh --update-only -y
```

### Logs / restart / user scripts (substitute the env's app + RG)

```bash
az webapp log tail --name vanguard-saa-prod --resource-group gc-sa-tool-prod-rg
az webapp restart  --name vanguard-saa-prod --resource-group gc-sa-tool-prod-rg
az webapp ssh      --name vanguard-saa-prod --resource-group gc-sa-tool-prod-rg
# inside the SSH session:
cd /home/site/wwwroot && node scripts/manage-users.js list
```

### Important deployment behavior (gotchas)

- **`deploy-azure.sh` zips the current working directory** (`zip -r … .`). Always deploy from a checkout on the latest `main` (`git checkout main && git pull`) — deploying from a stale folder ships stale code even though the app restarts.
- **Deploys use `az webapp deploy --clean false`**, so files removed from the repo are **not** deleted from `wwwroot`. A stale static file can therefore linger and be served by `express.static` ahead of a route with the same path. This bit us with a leftover `public/sa-tool-overview.html`; the app now redirects that path to the route (`app.js`), but if you hit a similar case, delete the orphan via `az webapp ssh` → `rm /home/site/wwwroot/public/<file>`.
- The script enables App Service storage with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`, and excludes local `data/`, `uploads/`, and generated test reports from the ZIP.
- **Do not deploy from CI or scripts that push to Azure without review** — deploys carry env-file settings to App Service application settings.
- SQLite is acceptable for a small single-instance deployment. For production scale or multiple instances, plan a move to Azure SQL or another managed database.
- Keep `SESSION_SECRET`, admin passwords, SMTP secrets, and API keys in the env files (gitignored) / App Service application settings — never commit real secrets.
- After deploying, create or rotate the break-glass account from an SSH session and store the generated password offline.
- i18next preloads locales at startup, so restart/redeploy after changing `locales/*.json`.
- **One-time on first start after upgrading to real integration validation:** any custom domain that was marked verified under the old self-attesting flow (flag set, but never DNS-checked) is reset to unverified, logging `Migration: cleared N self-attested custom-domain verification flag(s)`. The domain itself is kept — a root admin re-proves it with **Check DNS & verify**. Domains verified by a real DNS check are untouched.

## Troubleshooting

Port already in use:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
```

Or run on another port:

```bash
PORT=3001 npm run dev
```

Where to see Codex terminal output:

- My command output appears in the Codex conversation as tool output blocks.
- If you start the app in your own terminal, that terminal shows the live server logs.
- If a Codex-started server is still running, ask me to stop it or use the `lsof` command above to find the process.

Reset local database:

```bash
cp data/sa-tool.db data/sa-tool.backup.db
rm data/sa-tool.db
npm run dev
```

SMTP login failures:

- The app continues running.
- Emails are logged to the console.
- Use the displayed invitation code manually.
- For Microsoft 365, confirm SMTP AUTH is enabled or use an approved app password/OAuth2 setup.

MFA reset:

```bash
npm run user:admin -- --email admin@youragency.gc.ca --password 'NewPassword123!'
```

Database path problems:

- Confirm `DATA_DIR` exists or can be created by the app.
- Confirm `DB_PATH` points inside a writable directory.
- On Azure App Service, use persistent storage or a managed database before production use.

Test server cannot bind a port:

- In restricted environments, approve localhost port binding.
- On a developer machine, check for endpoint security or another process blocking the chosen port.

## Important Files

- `app.js`: Express app bootstrap.
- `models/database.js`: SQLite schema, migrations, and database helpers.
- `routes/admin.js`: Assessor/admin workflows.
- `routes/public.js`: Client, intake, registration, and evidence workflows.
- `routes/api.js`: API endpoints including MFA/passkey helpers.
- `config/passport.js`: Authentication middleware.
- `config/mfa-signature.js`: TOTP/passkey signature token helpers.
- `scripts/manage-users.js`: User, admin, break-glass, and test-user script.
- `tests/e2e/security-assessment.e2e.test.js`: Integration tests.
- `deploy-azure.sh`: Azure App Service deployment script.
- `CLIENT.md`: End-user guide for assessors/admins and client evidence providers.
