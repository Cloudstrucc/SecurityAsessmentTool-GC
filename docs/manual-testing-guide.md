# Manual Testing Guide — Billing, RBAC, Licensing & Access

Covers everything built on `feature/billing-and-redesign`. Work top-to-bottom the first time.

## 0. Setup

```bash
# From the repo root
npm install
# Local run uses .env.local (already has your sk_test_ key). Start on port 3000:
APP_ENV=local PORT=3000 npm run dev
```
Open http://localhost:3000.

**For paid checkout + webhooks (optional but needed for §3b, §7‑seats):**
1. In the Stripe Dashboard (test mode) create Products/Prices for Team, Business, and the two PAYG meters; paste the `price_…` IDs into `STRIPE_PRICE_*` in `.env.local`.
2. Run the webhook forwarder and paste the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/billing/webhook
   ```
3. Restart the app. Test card: `4242 4242 4242 4242`, any future expiry/CVC.

> Tip: a quick way to get a **root-admin session without MFA** for testing admin areas is the **break-glass** account created at sign-up (see §3) — it bypasses MFA.

---

## 1. Product brief & marketing
- Home page http://localhost:3000 → header has a **Product brief** link → opens `/sa-tool-overview.html`.
- Static mockups (design reference): `/mockups/pricing.html`.
- Resize the browser narrow (or DevTools mobile) → the hero has proper side padding and the header wraps (mobile fix).

## 2. Pricing
- Visit `/pricing` → four tiers + Pay‑as‑you‑go + comp‑code note. In test mode you'll see a "card checkout not configured" note only if no `sk_test_` key is set.

## 3. Registration → break-glass → workspace
**3a. Trial (no card):**
1. `/register?plan=trial` → fill it → **Create account**.
2. You land on **/billing/welcome** showing a **break‑glass recovery key** (email + one‑time password). **Copy the password** — you'll use it to log in as root admin without MFA. Tick the box → Continue.
3. You're routed into `/admin/*`; first hit forces **MFA setup** (`/admin/mfa-setup`). Either set up TOTP, or instead log in as the **break‑glass** account (next step) to skip MFA while testing.

**3b. Paid (card) — needs §0 Stripe setup:** `/register?plan=business` → account → **hosted Stripe Checkout** → pay with `4242…` → returns to `/billing/success`. Apple/Google Pay appear automatically on eligible devices/domains.

**3c. Comp code:** create one first (§7), then `/register?plan=trial` with the code in the **Comp code** field → workspace activates as `comped`, no charge.

**Log in as the break-glass root admin** (bypasses MFA): `/admin/login` with the break‑glass email + the one‑time password from step 2.

## 4. Projects: archive & delete
On a project detail page (`/admin/projects/:id`):
- **Archive** → project + its assessments/intakes hidden from dashboard & lists; `/admin/projects?archived=1` shows it; **Restore** brings it back.
- **Delete Project** → GitHub‑style danger modal. If a non‑draft assessment exists it warns and recommends **Archive instead**; deletion requires typing the **exact project name**.

## 5. AI gating & trial allowance
Signed in as a **trial owner/admin**:
- Use an AI feature (e.g. project → assessment → **AI evidence guidance**, or intake AI). You get a small allowance per feature (≈2× for most, 1× for bulk). After the limit, the call returns a 403 with an "upgrade for unlimited AI" message.
- Signed in as an **unlicensed member/collaborator** (see §8/§9): a blue **"AI is a licensed feature"** banner shows at the top of admin pages and AI calls are blocked.
- On a **paid/comped** org or a **licensed** user: AI is unlimited.

## 6. Root-admin console (`/admin` menu → Organization settings)
Only visible/accessible to the **root admin**. `/admin/organization`:
- **SMTP** — enter your mail server, Save, then **Send test** to your inbox (real send).
- **SMS** — enter Twilio SID/token/from, Save, **Send test** to a phone.
- **Custom domain** — enter a domain → shows the CNAME + TXT DNS records → **mark verified**.
- RBAC check: a non‑root user hitting `/admin/organization` is redirected to the dashboard.

## 7. Licensing & seats (`/admin` menu → Licensing & seats)
`/admin/licensing` (root admin):
- **Seat summary** (licensed used/total, admins used/cap).
- **Invite a user** (optionally "as admin") → creates a pending invite + emails a `/redeem` link.
- On a member row: **Make admin / Demote**, **Grant/Revoke license**, **Reset password**, **Reset MFA**, **Deactivate**. Caps are enforced (Team 2 admins / Business 5 / Enterprise unlimited). Root admin & break‑glass rows are protected.
- **Add seats**: comped orgs set a count; paid orgs open the **Stripe billing portal**; trial orgs are sent to pricing.

## 8. Redeem an invitation (members must register)
1. In §7, invite `someone@example.test`.
2. Copy the invite code from the pending list → open `/redeem/<CODE>` (this is the link in the email).
3. Fill name + password → **Create account** → you're signed in as a member of that org (licensed). They set their own password — never anonymous.
4. Invalid code → `/redeem/xxxx` shows "Invitation not found".

## 9. Password / MFA reset
On `/admin/licensing`, for a member (not root/break‑glass):
- **Reset password** → a one‑time password is shown in the success banner; their MFA is cleared → on their next login they're forced through MFA setup again.
- **Reset MFA** → clears TOTP + passkeys only; next login forces re‑enrollment.

## 10. Pre-assessments (sign-in required)
- **Anonymous** `/self-assessment` → redirected to `/register?plan=trial` (no anonymous pre‑assessments).
- **Signed in** → the wizard loads. Fill it, optionally enter a **reviewer email**, submit.
  - Reviewer with an account → gets a "ready for review" email (link to `/admin/self-assessments`).
  - Reviewer without an account → gets an **invitation to create an account** to review.

## 11. Automated tests
```bash
npm run test:e2e     # 42 tests, should be 42/42
```
The suite sets `MFA_ENABLED=true` on its own server, so it runs the full TOTP/passkey flow with no extra flags. Coverage includes assessment versioning, revert/restore, and the `/sa-tool-overview.html` redirect.

---

## Known follow-up (not yet done)
- The legacy **`/respond/:code`** evidence-response flow (assessor assigns a file to a collaborator) is still **code-based/anonymous**. The `/redeem` mechanism now exists to convert it to require registration; that conversion is a deliberate next step because it reworks the live evidence-collection path.
- Full per‑tenant routing of **all** transactional email through org SMTP (currently the invite path is wired; other notifications still use the platform default).
