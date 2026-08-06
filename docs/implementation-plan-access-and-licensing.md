# Implementation Plan — Registration-Gated Access, Collaborators & Licensing

**Status:** Proposal for review. Reworks existing *anonymous* flows — confirm before building.

## Guiding principle
**No one fills out an intake, assessment, or pre-assessment anonymously.** Every participant has a username + password. Access to *paid* capabilities (notably AI) is gated by whether the user holds a **license**.

## Actor model
| Actor | Account | Pays? | AI features |
|-------|---------|-------|-------------|
| **Owner** | Self-registered org owner (trial/paid/comped) | Yes (or trial/comped) | Yes, if org plan is paid/comped (not raw trial past limits) |
| **Licensed member** | Registered, assigned a paid **seat** by an owner/assessor | Covered by owner's plan | Yes |
| **Collaborator** | Registered (free) via an assignment invite | No | **No** — sees a banner to register/request a license |
| **Reviewer** | Invited to review a pre-assessment; registers (trial/paid) | Trial or paid | Per their own plan |

## Data model (additive migrations)
- `users.is_licensed INTEGER DEFAULT 0` — holds a paid seat (AI-enabled).
- `users.account_type TEXT DEFAULT 'owner'` — `owner | member | collaborator`.
- `invitations`: ensure `organization_id`, `entity_type`, `entity_id`, and a `grants_license INTEGER` flag (assessor can pre-grant a license on invite).
- `self_assessments`: add `reviewer_email`, `reviewer_user_id`, `submitted_by_user_id`, `review_invite_code`.
- Seat accounting: licensed member count must respect the org's `seats_limit`; an owner "adds a license" by consuming/purchasing a seat.

## Flow A — Assigned collaborator (assessor assigns a file)
1. Assessor assigns an intake/assessment to a person (existing assignment + invitation system).
2. The invite email links to **/redeem/:code** → if not signed in, the person **must register** (a lightweight collaborator account: name/email/password + MFA). No plan selection, no payment.
3. On redeem, the collaborator is added to the assessor's org as `account_type='collaborator'`, `is_licensed=0`, and linked to the assigned entity.
4. While inputting evidence, a **banner** shows: *"AI assistance is a licensed feature. Register for a licensed account, or ask your assessor to assign you a license."* AI buttons are disabled/hidden.
5. Collaborators can never reach intake/assessment forms without a redeemed invite + account.

## Flow B — Assessor grants a license
1. From Team/Comp management, the assessor **adds/assigns a license** (consumes a seat within `seats_limit`; if none free, prompt to upgrade / add seats via Stripe).
2. Sets `users.is_licensed=1` for the collaborator (→ `account_type='member'`), and **sends a re-invite** notification.
3. Collaborator redeems the re-invite (already registered → just re-auth) and now has AI enabled.

## Flow C — Pre-assessment (self-assessment) requires sign-in
1. **Remove anonymous** self-assessment. `/self-assessment` requires an account; a signed-out visitor is sent to **register (trial)** first.
2. The filler completes the pre-assessment while signed in (trial is enough), and **chooses a reviewer email** to send it to.
3. On submit, the system emails the reviewer either:
   - a **notification** (if the reviewer already has an account), or
   - a **notification + invitation to create an account** (trial or paid) to review and proceed.
4. Reviewer registers/sign-in → reviews → proceeds (converts to project/assessment) post-registration.

## Rework of existing anonymous entry points
- **Intake form (`/intake`)**: currently anonymous → require an account (collaborator/trial). Signed-out users are routed to register or redeem an invite.
- **Self-assessment (`/self-assessment?code=`)**: currently anonymous → require registration (Flow C).
- **AI gating**: a single helper `canUseAI(req)` (licensed member / paid owner) used to guard every `ai-service` route and to toggle the banner + disable AI buttons in views.

## Tests
- Update the existing e2e **"anonymous users can request and complete an invite-code self-assessment"** to the new **registration-gated** flow (this test will otherwise fail by design).
- New e2e: collaborator must register to redeem; AI is gated for collaborators; license assignment enables AI; pre-assessment requires sign-in and sends a reviewer invite.

## Confirmed decisions (locked)
1. **Collaborators are members of the assessor's org**, unlicensed by default. ✅
2. **AI is the ONLY gated feature.** ✅ Exception: **subscription owners/admins on a trial may test AI at a strict cap** — e.g. **1–2 uses per work type** (generate controls, evidence guidance, narratives, intake parsing, intake review). Collaborators get the banner (no AI). Licensed users / paid-or-comped orgs = unlimited.
3. **Pre-assessments fully behind login.** ✅ Minimum = a free trial account to fill; reviewer receives an account-creation invite.
4. **Anonymous `/intake` and `/self-assessment` removed** — fully gated behind login. ✅ (rewrites one e2e test.)
5. **Licensing = purchasable seats.** Buy N licenses (monthly, or annual for the unlimited tier). Licenses cost the **same for admins and regular users**. After purchase the root admin **designates who is admin vs user**. **Admin caps per tier:** Team = **2 admins**, Business = **5 admins**, Enterprise/unlimited = unlimited. Non-admin licensed users fill the remaining seats.

## New requirements (this phase)
6. **RBAC — root admin vs admin.** The **root admin** = the subscriber / primary administrator. Only root admins see **global admin** features (SMTP/SMS config, custom domain, licensing, break-glass, tenant restore). Other admins do everything else (all system tasks minus global admin).
7. **Break-glass on registration.** On sign-up, auto-create a **break-glass account** for the tenant with an **auto-generated password**, shown **once** with instructions to store it offline (paper / external key vault). Used for **tenant restore**. Bypasses MFA; excluded from password/MFA reset.
8. **Admin dashboard + routes (root-admin only):**
   - **Own SMTP** configuration (use their own domain/mail server instead of the SaaS default).
   - **Own SMS** provider configuration.
   - **Custom domain** setup (serve the tenant on their own domain vs the default SaaS domain).
9. **Password & MFA reset.** Admins can **reset a user's password** (never the break-glass account) and **reset MFA methods (TOTP + passkeys)**, forcing **re-enrollment on next login**. Resetting a password **auto-triggers** MFA re-enrollment.

## Build order (incremental, each committed + tested)
- **Increment 1 — Foundation (this turn):** data model (account types, licensing, root admin, AI usage, org settings), `config/access.js` (RBAC + AI gating with trial caps + license/seat helpers + break-glass creation), break-glass auto-creation on registration + one-time reveal screen, AI gating wired into the AI routes + banner.
- **Increment 2 — Admin dashboard (root-admin):** SMTP / SMS / custom-domain config screens + storage + wiring into the mail/SMS senders.
- **Increment 3 — Licensing UI:** purchase seats (Stripe), assign admin/user roles within caps, invite/re-invite.
- **Increment 4 — Password / MFA reset:** admin reset flows + forced re-enrollment on next login.
- **Increment 5 — Access gating:** remove anonymous `/intake` + `/self-assessment`; collaborator redeem→register; pre-assessment sign-in + reviewer invite; update the affected e2e test.
