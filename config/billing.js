/**
 * Billing module — Stripe hosted Checkout, plans, comp codes, and org limits.
 *
 * Degrades gracefully: when STRIPE_SECRET_KEY is unset, paid checkout is
 * disabled (the UI says so) but trials, comp codes, and the rest of the app
 * keep working. Live/test mode is entirely a function of which key is set.
 */
const { get, all, run } = require('../models/database');

let _stripe = null;

function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  if (!isConfigured()) return null;
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function webhookConfigured() {
  return !!process.env.STRIPE_WEBHOOK_SECRET;
}

/**
 * Plan catalogue. Limits are enforced server-side; prices come from Stripe
 * Price IDs in the environment (so the same code runs in test and live).
 * Placeholder limits — adjust freely; they do not depend on Stripe.
 */
// `tokens` = monthly built-in (OOB) AI token allowance. null = unlimited.
// Bringing your own AI provider bypasses this entirely.
const PLANS = {
  trial:      { key: 'trial',      label: 'Trial',          seats: 3,    projects: 1,    tokens: 250000,    mode: 'trial',        trialDays: 14 },
  team:       { key: 'team',       label: 'Team',           seats: 5,    projects: 5,    tokens: 3000000,   mode: 'subscription', priceEnv: 'STRIPE_PRICE_TEAM' },
  business:   { key: 'business',   label: 'Business',       seats: 20,   projects: 25,   tokens: 15000000,  mode: 'subscription', priceEnv: 'STRIPE_PRICE_BUSINESS' },
  enterprise: { key: 'enterprise', label: 'Enterprise',     seats: null, projects: null, tokens: null,      mode: 'contact' },
  payg:       { key: 'payg',       label: 'Pay as you go',  seats: null, projects: null, tokens: 500000,    mode: 'metered',
                priceEnvUser: 'STRIPE_PRICE_PAYG_USER', priceEnvProject: 'STRIPE_PRICE_PAYG_PROJECT' }
};

// One-time token top-up packs. The token amount already reflects ~70% of the
// raw value of the price (the balance covers platform/admin overhead); tenants
// who want full value can bring their own provider instead. Price IDs come from
// Stripe (create one-time prices and set the env vars).
const TOKEN_PACKS = [
  { id: '1m',  label: '1M tokens',  tokens: 1000000,  priceEnv: 'STRIPE_PRICE_TOKENS_1M' },
  { id: '5m',  label: '5M tokens',  tokens: 5000000,  priceEnv: 'STRIPE_PRICE_TOKENS_5M' },
  { id: '20m', label: '20M tokens', tokens: 20000000, priceEnv: 'STRIPE_PRICE_TOKENS_20M' }
];
function getTokenPack(id) { return TOKEN_PACKS.find(p => p.id === id) || null; }

// Monthly OOB token allowance + usage for an org.
function tokenStatus(org) {
  if (!org) return { unlimited: true, limit: null, used: 0, extra: 0, remaining: null, pct: 0 };
  const plan = getPlan(org.plan) || {};
  const base = org.token_limit != null ? org.token_limit : plan.tokens; // null = unlimited
  const extra = org.tokens_extra || 0;
  // Reset the counter's view if the stored period is an earlier month.
  const period = new Date().toISOString().slice(0, 7);
  const used = (org.token_period === period) ? (org.tokens_used || 0) : 0;
  if (base == null) return { unlimited: true, limit: null, used, extra, remaining: null, pct: 0 };
  const limit = base + extra;
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return { unlimited: false, limit, used, extra, remaining, pct };
}

function getPlan(key) {
  return PLANS[key] || null;
}
function planList() {
  return Object.values(PLANS);
}
function isValidPlan(key) {
  return !!PLANS[key];
}

// ── Organizations ──────────────────────────────────────────────────────────

function getOrg(id) {
  if (!id) return null;
  return get('SELECT * FROM organizations WHERE id = ?', [id]);
}

function orgForUser(user) {
  if (!user) return null;
  const u = user.organization_id ? user : get('SELECT organization_id FROM users WHERE id = ?', [user.id]);
  return u && u.organization_id ? getOrg(u.organization_id) : null;
}

/**
 * Create an organization for a chosen plan. Trial/comped orgs are active
 * immediately; paid orgs start pending until Stripe confirms payment.
 */
function createOrganization({ name, ownerUserId, plan = 'trial', status, compCode = null }) {
  const p = getPlan(plan) || PLANS.trial;
  const trialEnds = p.mode === 'trial'
    ? new Date(Date.now() + (p.trialDays || 14) * 86400000).toISOString()
    : null;
  const st = status || (p.mode === 'trial' ? 'trialing' : 'pending');
  const orgId = run(`INSERT INTO organizations (name, owner_user_id, plan, status, seats_limit, projects_limit, trial_ends_at, comp_code_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, ownerUserId || null, p.key, st, p.seats, p.projects, trialEnds, compCode ? compCode.id : null]);
  if (ownerUserId) run('UPDATE users SET organization_id = ? WHERE id = ?', [orgId, ownerUserId]);
  return getOrg(orgId);
}

function setOrgPlan(orgId, planKey, status, extra = {}) {
  const p = getPlan(planKey);
  run(`UPDATE organizations
       SET plan = ?, status = ?, seats_limit = ?, projects_limit = ?,
           stripe_customer_id = COALESCE(?, stripe_customer_id),
           stripe_subscription_id = COALESCE(?, stripe_subscription_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [planKey, status, p ? p.seats : null, p ? p.projects : null,
     extra.stripeCustomerId || null, extra.stripeSubscriptionId || null, orgId]);
  return getOrg(orgId);
}

// ── Usage & limits ──────────────────────────────────────────────────────────

function seatCount(orgId) {
  return get('SELECT COUNT(*) c FROM users WHERE organization_id = ? AND is_active = 1', [orgId])?.c || 0;
}
function projectCount(orgId) {
  return get('SELECT COUNT(*) c FROM projects WHERE organization_id = ?', [orgId])?.c || 0;
}

/** Returns { ok, reason } — ok=false when the org is over its plan limit. */
function canAddProject(org) {
  if (!org || org.projects_limit == null) return { ok: true };        // unlimited / legacy
  if (org.plan === 'payg') return { ok: true };                        // metered, not capped
  return projectCount(org.id) < org.projects_limit
    ? { ok: true }
    : { ok: false, reason: `Your ${org.plan} plan includes ${org.projects_limit} projects. Upgrade to add more.` };
}
function canAddSeat(org) {
  if (!org || org.seats_limit == null) return { ok: true };
  if (org.plan === 'payg') return { ok: true };
  return seatCount(org.id) < org.seats_limit
    ? { ok: true }
    : { ok: false, reason: `Your ${org.plan} plan includes ${org.seats_limit} users. Upgrade to add more.` };
}

function isOrgActive(org) {
  if (!org) return true; // no org (legacy/admin-seeded users) → not gated
  if (['active', 'comped'].includes(org.status)) return true;
  if (org.status === 'trialing') {
    return !org.trial_ends_at || new Date(org.trial_ends_at) > new Date();
  }
  return false; // pending, past_due, canceled
}

// ── Comp codes ───────────────────────────────────────────────────────────────

function findCompCode(code) {
  if (!code) return null;
  return get('SELECT * FROM comp_codes WHERE code = ? AND active = 1', [String(code).trim()]);
}

/** Validate a comp code without mutating anything. */
function validateCompCode(code) {
  const c = findCompCode(code);
  if (!c) return { ok: false, error: 'That comp code is not valid.' };
  if (c.expires_at && new Date(c.expires_at) < new Date()) return { ok: false, error: 'That comp code has expired.' };
  if (c.max_redemptions != null && c.redemptions >= c.max_redemptions) return { ok: false, error: 'That comp code has already been fully redeemed.' };
  return { ok: true, code: c };
}

/** Redeem a comp code onto an org: sets plan/limits to comped and increments use. */
function redeemCompCode(code, orgId) {
  const v = validateCompCode(code);
  if (!v.ok) return v;
  const c = v.code;
  const p = getPlan(c.plan) || PLANS.business;
  run(`UPDATE organizations
       SET plan = ?, status = 'comped',
           seats_limit = ?, projects_limit = ?,
           comp_code_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [c.plan,
     c.seats_limit != null ? c.seats_limit : p.seats,
     c.projects_limit != null ? c.projects_limit : p.projects,
     c.id, orgId]);
  run('UPDATE comp_codes SET redemptions = redemptions + 1 WHERE id = ?', [c.id]);
  return { ok: true, code: c, org: getOrg(orgId) };
}

// ── Stripe hosted Checkout ────────────────────────────────────────────────────

function priceIdForPlan(planKey) {
  const p = getPlan(planKey);
  if (!p || !p.priceEnv) return null;
  return process.env[p.priceEnv] || null;
}

/**
 * Create a hosted Checkout Session for a paid plan. Apple Pay / Google Pay
 * appear automatically on eligible devices (no extra client code) once the
 * domain is verified in the Stripe dashboard.
 * Returns { ok, url } or { ok:false, error }.
 */
async function createCheckoutSession({ org, plan, customerEmail, baseUrl }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Billing is not configured (no Stripe key set).' };
  const p = getPlan(plan);
  if (!p) return { ok: false, error: 'Unknown plan.' };

  let lineItems;
  if (p.mode === 'metered') {
    const uPrice = process.env[p.priceEnvUser];
    const pPrice = process.env[p.priceEnvProject];
    if (!uPrice || !pPrice) return { ok: false, error: 'Pay-as-you-go price IDs are not configured.' };
    lineItems = [{ price: uPrice }, { price: pPrice }]; // metered prices: no quantity
  } else {
    const price = priceIdForPlan(plan);
    if (!price) return { ok: false, error: `Price ID for the ${p.label} plan is not configured.` };
    lineItems = [{ price, quantity: 1 }];
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      client_reference_id: String(org.id),
      metadata: { organization_id: String(org.id), plan },
      allow_promotion_codes: true,
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing/cancel`
    });
    return { ok: true, url: session.url, id: session.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** One-time Stripe Checkout for an AI token top-up pack. */
async function createTokenCheckout({ org, pack, customerEmail, baseUrl }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'Billing is not configured (no Stripe key set).' };
  const price = process.env[pack.priceEnv];
  if (!price) return { ok: false, error: `Price ID for the ${pack.label} pack is not configured (${pack.priceEnv}).` };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      customer_email: customerEmail || undefined,
      client_reference_id: String(org.id),
      metadata: { type: 'token_pack', organization_id: String(org.id), tokens: String(pack.tokens), pack: pack.id },
      success_url: `${baseUrl}/admin/dashboard?tokens=added`,
      cancel_url: `${baseUrl}/admin/dashboard`
    });
    return { ok: true, url: session.url };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function createPortalSession(customerId, returnUrl) {
  const stripe = getStripe();
  if (!stripe || !customerId) return { ok: false, error: 'Billing portal unavailable.' };
  try {
    const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { ok: true, url: s.url };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Verify + parse a webhook. Throws on bad signature. */
function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  if (!webhookConfigured()) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

/** Idempotently record + apply a webhook event to org state. */
function applyWebhookEvent(event) {
  const existing = get('SELECT id FROM billing_events WHERE stripe_event_id = ?', [event.id]);
  if (existing) return { duplicate: true };

  const obj = event.data && event.data.object ? event.data.object : {};
  let orgId = null;

  const orgFromMeta = (o) => {
    const id = (o.metadata && o.metadata.organization_id) || o.client_reference_id;
    return id ? parseInt(id, 10) : null;
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      // One-time AI token top-up → add tokens to the tenant's balance.
      if (obj.metadata && obj.metadata.type === 'token_pack') {
        orgId = orgFromMeta(obj);
        const tokens = parseInt(obj.metadata.tokens, 10) || 0;
        if (orgId && tokens) run('UPDATE organizations SET tokens_extra = COALESCE(tokens_extra,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [tokens, orgId]);
        break;
      }
      orgId = orgFromMeta(obj);
      if (orgId) {
        setOrgPlan(orgId, (obj.metadata && obj.metadata.plan) || getOrg(orgId)?.plan, 'active', {
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: obj.subscription
        });
      }
      break;
    }
    case 'invoice.paid': {
      const org = obj.customer ? get('SELECT id FROM organizations WHERE stripe_customer_id = ?', [obj.customer]) : null;
      if (org) { orgId = org.id; run("UPDATE organizations SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [org.id]); }
      break;
    }
    case 'invoice.payment_failed': {
      const org = obj.customer ? get('SELECT id FROM organizations WHERE stripe_customer_id = ?', [obj.customer]) : null;
      if (org) { orgId = org.id; run("UPDATE organizations SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [org.id]); }
      break;
    }
    case 'customer.subscription.deleted': {
      const org = obj.customer ? get('SELECT id FROM organizations WHERE stripe_customer_id = ?', [obj.customer]) : null;
      if (org) { orgId = org.id; run("UPDATE organizations SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [org.id]); }
      break;
    }
    case 'customer.subscription.updated': {
      const org = obj.customer ? get('SELECT id FROM organizations WHERE stripe_customer_id = ?', [obj.customer]) : null;
      if (org) {
        orgId = org.id;
        const st = obj.status === 'active' || obj.status === 'trialing' ? 'active'
                 : obj.status === 'past_due' ? 'past_due'
                 : obj.status === 'canceled' ? 'canceled' : null;
        if (st) run('UPDATE organizations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [st, org.id]);
      }
      break;
    }
    default:
      break;
  }

  run('INSERT INTO billing_events (stripe_event_id, type, organization_id, payload) VALUES (?, ?, ?, ?)',
    [event.id, event.type, orgId, JSON.stringify(event).slice(0, 20000)]);
  return { duplicate: false, orgId };
}

module.exports = {
  PLANS, getPlan, planList, isValidPlan,
  isConfigured, webhookConfigured, getStripe,
  getOrg, orgForUser, createOrganization, setOrgPlan,
  seatCount, projectCount, canAddProject, canAddSeat, isOrgActive,
  findCompCode, validateCompCode, redeemCompCode,
  priceIdForPlan, createCheckoutSession, createPortalSession,
  constructWebhookEvent, applyWebhookEvent,
  TOKEN_PACKS, getTokenPack, tokenStatus, createTokenCheckout
};
