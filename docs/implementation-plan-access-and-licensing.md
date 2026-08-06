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

## Decisions to confirm before I build
1. **Collaborators are members of the assessor's org** (not their own trial), unlicensed by default. ✅ recommended — matches "assessor provides a licensed account." OK?
2. **AI = the licensing boundary.** Licensed users (paid seat / paid-or-comped owner) get AI; collaborators and raw-trial users get the banner. Is AI the *only* gated feature, or also exports/reports?
3. **Pre-assessment minimum = trial** (free account) to fill; reviewer gets an account-creation invite. OK?
4. **Reworking `/intake` and `/self-assessment` to require login is a breaking UX change** (and rewrites one e2e test). Confirm you want the anonymous entry points removed entirely (vs. kept behind a feature flag during rollout).
5. **Seat/license accounting**: "add a license" consumes a seat within `seats_limit`; exceeding it triggers a Stripe upgrade/add-seat. OK, or should licenses be a separate purchasable add-on?
