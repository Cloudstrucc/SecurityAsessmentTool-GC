# GC Security Assessment Tool

Node.js/Express application for managing Government of Canada security assessment work: project intake, project records, ITSG-33 assessment packages, evidence collection, assignment, MFA, and assessor/client workflows.

## What This App Does

- Lets clients submit intake forms and supporting documents.
- Lets assessors create projects directly from the admin dashboard.
- Creates a project intake record when a project is created by an assessor.
- Lets assessors create assessments from projects and link them back to the related intake.
- Stores project documentation for later AI analysis, evidence guidance, audit traceability, and reporting references.
- Lets assessors tailor assessment controls, edit guidance/evidence fields, and preserve AI guidance provenance.
- Provides project-level report branding, control exports, full project exports, ATO/iATO records, and POA&M management.
- Includes an admin security control catalog at `/admin/security-controls`.
- Lets assessors assign intakes and assessments to existing users or invite new client/assessor users.
- Supports TOTP MFA and passkeys, with TOTP available as a fallback whenever a passkey is used.
- Supports a controlled break-glass assessor account that uses password-only login for emergency recovery.

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
- Filter by framework, family, category, baseline, applicability, status, or keyword.
- Export the visible catalog data as CSV.

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

Current skipped check:

- Self-assessment creation, because this branch does not currently expose a self-assessment route.

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

Optional overrides:

```bash
export AZURE_RESOURCE_GROUP=gc-sa-tool-rg
export AZURE_APP_NAME=gc-sa-tool-prod
export AZURE_LOCATION=canadacentral
export AZURE_SKU=B1
./deploy-azure.sh
```

Update an existing app:

```bash
AZURE_RESOURCE_GROUP=gc-sa-tool-rg AZURE_APP_NAME=gc-sa-tool-prod ./deploy-azure.sh --update-only
```

Update settings only:

```bash
AZURE_RESOURCE_GROUP=gc-sa-tool-rg AZURE_APP_NAME=gc-sa-tool-prod ./deploy-azure.sh --settings-only
```

View logs:

```bash
az webapp log tail --name gc-sa-tool-prod --resource-group gc-sa-tool-rg
```

Restart:

```bash
az webapp restart --name gc-sa-tool-prod --resource-group gc-sa-tool-rg
```

Run user scripts in Azure:

```bash
az webapp ssh --name gc-sa-tool-prod --resource-group gc-sa-tool-rg
cd /home/site/wwwroot
node scripts/manage-users.js list
node scripts/manage-users.js admin --email admin@youragency.gc.ca --password 'NewPassword123!'
```

Azure notes:

- The deployment script enables App Service storage with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`.
- SQLite is acceptable for a small single-instance deployment. For production scale or multiple instances, plan a move to Azure SQL or another managed database.
- Keep `SESSION_SECRET`, admin passwords, SMTP secrets, and API keys in App Service application settings.
- After deploying, create or rotate the break-glass account from an SSH session and store the generated password offline.

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
