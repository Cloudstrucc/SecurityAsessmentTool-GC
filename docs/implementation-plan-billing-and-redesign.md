# Implementation Plan — Registration, Stripe Billing & Site Redesign

**Status:** Proposal for review. Mockups delivered; nothing wired to real payments yet.
**Depends on you:** final pricing/limits, a Stripe account, and Stripe API keys + webhook secret (provided via environment variables — never committed).

---

## A. Subscription model & tiers

Placeholder structure shown in the mockups (you set the final numbers):

| Plan | Price (placeholder) | Users | Projects | Notes |
|------|--------------------|-------|----------|-------|
| **Trial** | Free, 14 days | 1 admin + 2 | 1 | No card; auto-expires to a locked state |
| **Team** | $149/mo | 5 | 5 | |
| **Business** | $449/mo | 20 | 25 | "Most popular" |
| **Enterprise** | Custom | Unlimited | Unlimited | SSO, contact sales |
| **Pay-as-you-go** | $19/user/mo + $99/project | metered | metered | Small per-user fee + per-project charge |

Two billing modes: **flat monthly/annual** (Team/Business) and **metered/usage** (PAYG). Annual = 2 months free (toggle in mockup).

---

## B. Data model (migrations, additive)

- `organizations` (new — the billing/workspace boundary):
  `id, name, plan (trial|team|business|enterprise|payg), status (trialing|active|past_due|canceled|comped),
   stripe_customer_id, stripe_subscription_id, trial_ends_at, seats_limit, projects_limit,
   comp_code_id, created_at, updated_at`
- `users.organization_id` (FK) + `users.org_role` (owner|admin|member) — ties every user to a workspace.
- `projects.organization_id` (FK) — for per-org project counting/limits.
- `comp_codes` (new): `id, code (unique), plan, max_redemptions, redemptions, seats_limit, projects_limit,
   expires_at, active, created_by, created_at`.
- `billing_events` (new, audit): raw Stripe webhook events (`id, type, stripe_event_id (unique), payload, received_at`) for idempotency + traceability.
- `payg_usage` (new, PAYG): monthly counters per org (`org_id, period, active_users, projects_created, reported_at`).

All additive `ALTER TABLE`/`CREATE TABLE` via the existing migration array — safe on the live Azure DB. A one-time backfill assigns existing users/projects to a default "Legacy" organization on `enterprise`/`comped` so nothing breaks.

---

## C. Registration & access gating (forced sign-up + plan choice)

1. **Anonymous → must register.** New public routes: `GET/POST /register` (account), `GET /pricing`, `GET/POST /choose-plan`, `GET /checkout`, `GET /billing/success`, `GET /billing/cancel`.
2. **Flow:** register account → create `organization` (status `trialing` or per chosen plan) → MFA setup (existing) → if paid plan, Stripe Checkout; if trial/comped, activate immediately.
3. **Gate middleware** (`ensureActiveOrg`): wraps `/admin/*`. Blocks access when `status IN (past_due, canceled)` or trial expired, redirecting to a billing screen. Read-only "locked" mode optionally lets users export but not create.
4. **Limit enforcement:** on "create project" and "invite user", check `projects_limit` / `seats_limit`; if exceeded, prompt to upgrade (or, for PAYG, confirm the incremental charge).

---

## D. Stripe integration (server)

- **Library:** official `stripe` Node SDK. Config via env: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and price IDs (`STRIPE_PRICE_TEAM`, `…_BUSINESS`, `…_PAYG_USER`, `…_PAYG_PROJECT`). Nothing hard-coded or committed.
- **Checkout:** Stripe **Checkout Session** (hosted) is the fastest, PCI-simplest path and it renders **Apple Pay & Google Pay automatically** on eligible devices — no separate wallet SDK needed. (Alternative: embedded Payment Element in-app; more control, more work. Recommend hosted Checkout for v1.)
- **Apple Pay / Google Pay:** enabled in the Stripe Dashboard + Apple Pay domain verification (a `.well-known` file served from `public/`). With hosted Checkout, wallets appear with zero extra client code once the domain is verified.
- **Subscriptions:** create on Checkout completion; store `stripe_subscription_id` + limits on the org.
- **PAYG metered billing:** subscription with metered prices; report usage (`active_users`, `projects_created`) to Stripe via usage records at period close / on project creation.
- **Webhooks:** `POST /webhooks/stripe` (raw-body, signature-verified). Handle `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid`, `invoice.payment_failed` → update org `status`/limits. Idempotent via `billing_events.stripe_event_id`.
- **Customer portal:** Stripe Billing Portal link from workspace settings for card/plan/cancel self-service (no custom UI to build).

### Comp codes
- Admin screen to mint `comp_codes` (plan + limits + max redemptions + expiry).
- At checkout, entering a valid code **bypasses Stripe entirely**: org set to `status='comped'` with the code's limits, code redemption incremented. No card, no charge. Fully server-validated (client mockup is illustrative only).

---

## E. Security & safety notes

- **Keys** live only in Azure App Settings / `.env` (gitignored). I will never handle secret keys in plaintext — you set them in the environment.
- Webhook endpoint must be **signature-verified** and use the raw body (mount before the JSON body-parser for that route).
- Prices/limits are **enforced server-side**; the mockup JS is presentation only.
- Add e2e tests: registration→trial activation, comp-code redemption, limit enforcement, and webhook state transitions (Stripe events mocked).

---

## F. Site redesign — applying the brief's look site-wide

Goal: design continuity with the product brief, via **global CSS**, without a risky big-bang rewrite.

- **Foundation (done):** `public/css/vanguard-design.css` — tokens + reusable components (nav, buttons, cards, forms, tables, badges, pricing, wallet, auth layouts). This is the single source of truth for the look.
- **Approach:** layer `vanguard-design.css` on top of the existing Bootstrap in both layouts (`views/layouts/main.hbs`, `home.hbs`), then migrate views screen-by-screen to the `vg-*` components. Bootstrap stays for grid/utilities; Vanguard classes own the visual identity.
- **Phased rollout (each phase reviewable):**
  1. **Shell:** shared top nav + footer partials using `.vg-nav`/`.vg-footer`; brand tokens unified. *(anonymous + admin shells)*
  2. **Auth & marketing:** login, register, portal, landing → `.vg-auth-card` / `.vg-hero`.
  3. **Dashboards & lists:** projects/assessments/intakes tables and cards → `.vg-card`, `.vg-badge`, restyled tables.
  4. **Record pages:** project & assessment detail, ATO editor → consistent headers, callouts, buttons.
  5. **Polish:** empty states, print styles, dark-surface headers.
- **Standards:** one design-system stylesheet (+ optional small per-page CSS), CSS custom properties for theming, no inline style sprawl, WCAG-friendly focus states (already in the file), reduced-motion support.

> Recommendation: do the redesign **incrementally, after** the billing feature, so we're not restyling screens whose markup is about to change. Phase 1 (shell) can land early for immediate visual continuity.

---

## Suggested sequence
1. **Review mockups** (pricing/register/checkout/success) → lock pricing, limits, plan names.
2. **Billing backend**: data model → registration/gating → Stripe Checkout + webhooks → comp codes → PAYG → tests. *(behind a feature flag; test mode first)*
3. **Redesign** phased rollout (shell first).

**Before I build the billing backend I'll need from you:** final numbers, confirmation to use hosted Stripe Checkout (recommended), and a Stripe account in test mode with keys placed in the environment.
