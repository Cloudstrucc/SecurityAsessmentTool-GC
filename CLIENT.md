# Client And Assessor Guide

This guide is for people using the GC Security Assessment Tool after it has been installed.

## Roles

Admin assessor:

- Creates and reviews intakes.
- Creates projects and assessments.
- Assigns work to clients or other assessors.
- Reviews evidence, manages POA&M items, and completes assessment/audit work.

Client evidence provider:

- Creates intake submissions.
- Responds to assigned assessments.
- Uploads evidence and comments.
- Does not have admin dashboard access.

## Sign-In And MFA

Assessor login:

- Go to `/admin/login`.
- Sign in with your assessor email and password.
- On first login, configure TOTP with an authenticator app.
- After TOTP is configured, you may register a passkey.
- TOTP remains available even if you use a passkey.

Client login:

- Go to `/client/login`.
- Sign in with your client email and password.
- Configure TOTP if prompted.
- Use passkey setup only after TOTP is working.

Lost MFA:

- Contact an admin assessor.
- Do not create a second account unless the admin tells you to.

Break-glass accounts:

- These are emergency admin accounts.
- They are not for normal work.
- They do not require TOTP or passkey.

## Assessor Workflow

### Create A Project

1. Sign in at `/admin/login`.
2. Open Projects.
3. Choose New Project.
4. Enter the project name, description, department, branch, categorization, hosting, technologies, contacts, and notes.
5. Upload a supporting document if you have one.
6. Save.

The system creates both the project and a linked project intake record.

### Create An Assessment

1. Open the project.
2. Choose Create Assessment.
3. Review the recommended controls.
4. Tailor controls and evidence guidance as needed.
5. Save.

The assessment is associated with the project and the linked intake.

### Assign Work

You can assign an intake or assessment to:

- An existing client user.
- An existing assessor user.
- A new invited client user.
- A new invited assessor user.

If the user already exists, select them from the existing-user list.

If the user does not exist:

1. Choose the invite/new-user option.
2. Enter their email, name, organization, and role.
3. Add a message if useful.
4. Submit the assignment.
5. Share the invitation code if email delivery is not configured.

### Review Intake And Evidence

Use the intake and assessment detail pages to:

- Confirm categorization.
- Review uploaded documents.
- Check assigned users.
- Start evidence collection.
- Review submitted evidence.
- Record audit results.
- Track POA&M items.
- Export reports when ready.

## Client Workflow

### Register

1. Open the registration link or go to `/client/register`.
2. Enter your name, organization, email, and password.
3. If you received an invitation code, enter it during registration.
4. Configure TOTP when prompted.

### Submit An Intake

1. Sign in at `/client/login`.
2. Open `/intake`.
3. Describe the project clearly.
4. Fill in categorization, hosting, technology, privacy, and contact details.
5. Upload supporting documents such as architecture diagrams, project briefs, or security plans.
6. Submit the intake.

### Provide Assessment Evidence

1. Open the assessment link or enter the invite code from your assessor.
2. Sign in if prompted.
3. Review each control request.
4. Add evidence text, links, screenshots, documents, or explanations.
5. Save as you work.
6. Submit when the evidence package is ready.

### Respond To Follow-Up

Your assessor may ask for more detail or remediation evidence. Keep comments specific and attach updated evidence where possible.

## Good Evidence Practices

- Use current documents.
- Name files clearly.
- Include dates and system names.
- Explain where evidence satisfies the control.
- Avoid uploading unnecessary personal information.
- Tell your assessor if evidence is stored in another system and cannot be uploaded.

## Common Problems

Invitation code does not work:

- Check for extra spaces.
- Confirm the code has not expired.
- Confirm you are using the same email address the assessor assigned.

Cannot access an assessment:

- Sign out and sign in with the assigned account.
- Ask the assessor to confirm the assignment email.

TOTP code fails:

- Check your device time.
- Use the newest code.
- Ask an admin assessor to reset MFA if needed.

Upload fails:

- Confirm the file is under the configured size limit.
- Try a PDF, image, text file, or Office document.
- Contact the assessor if the document is too large.

Submitted by mistake:

- Contact your assessor. They can review status and decide whether to reopen or request follow-up.
