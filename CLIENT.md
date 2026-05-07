# Security Assessment & Authorization Tool

## Client And Assessor Guide

This Markdown guide is for assessor/admin users and client evidence providers. A branded, paginated HTML version with the same full-width screenshots is available at [docs/client-assessor-guide.html](docs/client-assessor-guide.html), and authenticated users can open it from **Help** in the application header.

![Assessor dashboard](docs/assets/guide/desktop-01-admin-dashboard.png)

## Assessor Workflow

### 1. Create A Project And Intake

![Create project and intake](docs/assets/guide/desktop-02-project-new-intake-ai.png)

1. Sign in at `/admin/login`.
2. Open **Projects** and choose **New Project**.
3. Upload a SADD or paste a project description in the AI-assisted intake area.
4. Review proposed field values before using them.
5. Complete project name, description, department, branch, classification, hosting, technologies, privacy details, and contacts.
6. Optionally assign the intake to an existing user or invite a new client/assessor.
7. Save the project.

Saving creates the project and a linked project intake record.

### 2. Manage The Project Dashboard

![Project dashboard](docs/assets/guide/desktop-03-project-dashboard.png)

Use the project dashboard to review project information, linked intakes, documentation, assignments, assessments, report branding, POA&M items, and ATO/iATO records.

### 3. Upload Project Documentation

![Project documents and reports](docs/assets/guide/desktop-06-project-documents-reports.png)

1. Open the project dashboard.
2. Use **Documentation** to upload SADDs, diagrams, security plans, data-flow documents, or privacy material.
3. Confirm the document appears in the table.
4. Use download to verify the stored file.
5. Use the AI action when the document should support control selection or evidence guidance.

### 4. Create And Tailor An Assessment

![Assessment tailoring](docs/assets/guide/desktop-09-assessment-tailoring.png)

1. From the project dashboard, choose **New Assessment**.
2. Review suggested controls and create the assessment.
3. Open the assessment and choose **Tailor**.
4. Edit applicability, control description, control guidance, evidence guidance, evidence collected, assessor notes, status, inheritance, priority, and risk.
5. Remove non-applicable controls.
6. Save tailoring changes and refresh to confirm persistence.

### 5. Assign Existing Users

![Existing user assignment](docs/assets/guide/desktop-04-project-assignment-existing.png)

1. Open the project or assessment.
2. Choose the target intake, assessment, or all linked work.
3. Select **Existing user**.
4. Choose the client or assessor.
5. Add notes and assign.

### 6. Invite New Users

![Invite new user from project](docs/assets/guide/desktop-05-project-assignment-invite.png)

1. Select **Invite new user**.
2. Choose client or assessor.
3. Enter name, email, organization, and message.
4. Assign the work.
5. If email is not configured, share the invitation code through an approved channel.

![Invite new user from assessment](docs/assets/guide/desktop-08-assessment-invite-user.png)

### 7. Manage POA&M Items

![Assessment POA&M](docs/assets/guide/desktop-10-assessment-poam.png)

1. Open the assessment.
2. Use **Auto-Populate** to create POA&M items from findings or add items manually.
3. Track finding, risk, owner, target date, status, mitigation plan, milestones, residual risk, and assessor notes.
4. Link items to controls and ATO/iATO records where appropriate.

### 8. Create ATO/iATO Records

![ATO/iATO edit](docs/assets/guide/desktop-11-ato-edit.png)

1. Open the project dashboard.
2. Select **New ATO** or **New iATO**.
3. Link the assessment.
4. Edit title, system details, authorizing official, dates, summary text, risk statements, conditions, POA&M summary, notes, static text, and custom sections.
5. Save and export when ready.

### 9. Manage ATO/iATO Remediation Items

![ATO/iATO POA&M CRUD](docs/assets/guide/desktop-12-ato-poam-crud.png)

1. Open the ATO/iATO record.
2. Scroll to **Risk Remediation Items / POA&M**.
3. Add, edit, update status, or delete remediation items.
4. Link each item to a project, assessment, control, and authorization package as needed.

### 10. Export Reports

Export controls CSV, controls PDF, full project PDF, assessment PDF, and ATO/iATO PDF from the project or assessment pages. Full project reports list uploaded documents but do not embed attachments.

### 11. Browse The Security Control Catalog

![Security control catalog](docs/assets/guide/desktop-13-security-control-catalog.png)

Open `/admin/security-controls` to search, filter, sort, and export the supported security control catalog across ITSG-33, CIS Controls v8, ISO/IEC 27001:2022 Annex A, FedRAMP Rev. 5, NIST SP 800-53 Rev. 5, ASD ISM, and ACSC Essential Eight.

## Client Workflow

### 1. Submit An Intake

![Client intake](docs/assets/guide/desktop-15-client-intake.png)

1. Sign in at `/client/login`.
2. Complete TOTP verification.
3. Open `/intake`.
4. Enter project description, categorization, hosting, technology, privacy, and contact details.
5. Upload supporting documents.
6. Submit the intake.

### 2. Respond To An Assessment

![Client evidence portal](docs/assets/guide/desktop-16-client-evidence-portal.png)

1. Open the assessment link or enter the invite code.
2. Sign in with the assigned account.
3. Review each control request.
4. Add evidence text, links, exports, screenshots, or document references.
5. Save progress.
6. Submit when the evidence package is ready.

Good evidence is current, clearly named, dated, tied to the system under assessment, and specific about which control it supports.

## Help And Troubleshooting

![Authenticated help guide](docs/assets/guide/desktop-14-help-guide.png)

Use **Help** in the application header for the full paginated guide.

Common issues:

- Invitation code fails: check spaces, expiry, and invited email address.
- Assigned work is missing: sign in with the exact assigned account.
- TOTP fails: check device time and use the newest code.
- Upload fails: check file type and file size.
- AI guidance unavailable: confirm the Anthropic API key is configured.
- PDF export fails: confirm the project has required assessment, controls, branding, or authorization records.
