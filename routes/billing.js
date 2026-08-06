/**
 * Billing & registration routes — public sign-up funnel + Stripe hosted Checkout.
 *
 * Public:  GET /pricing, GET/POST /register, GET /billing/checkout,
 *          GET /billing/success, GET /billing/cancel, POST /billing/redeem
 * Auth:    GET /billing/portal, GET/POST /admin/comp-codes (assessor)
 * Webhook: exported separately and mounted with a raw body parser in app.js.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { generateSecret: otpGenerateSecret } = require('otplib');
const { get, all, run } = require('../models/database');
const billing = require('../config/billing');
const access = require('../config/access');
const { ensureAuthenticated } = require('../config/passport');

const router = express.Router();

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}
function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}
function billingView(name, extra = {}) {
  return Object.assign({ layout: 'home', plans: billing.planList(), stripeReady: billing.isConfigured() }, extra);
}

// ── Pricing ──────────────────────────────────────────────────────────────────
router.get('/pricing', (req, res) => {
  res.render('billing/pricing', billingView('pricing', { title: 'Plans & Pricing' }));
});

// ── Register (public sign-up → creates an org) ────────────────────────────────
router.get('/register', (req, res) => {
  const plan = billing.isValidPlan(req.query.plan) ? req.query.plan : 'trial';
  res.render('billing/register', billingView('register', {
    title: 'Create your account', selectedPlan: plan, plan: billing.getPlan(plan), formData: {}
  }));
});

router.post('/register', async (req, res) => {
 try {
  const { first_name, last_name, name, email, organization, password, plan, comp_code, agree } = req.body;
  const planKey = billing.isValidPlan(plan) ? plan : 'trial';
  const fullName = (name || `${first_name || ''} ${last_name || ''}`).trim();
  const rerender = (msg) => {
    // Set the error directly into locals — flash set mid-request isn't read until
    // the next request (the messages middleware runs before this handler).
    res.locals.messages = Object.assign({}, res.locals.messages, { error: msg });
    return res.render('billing/register', billingView('register', {
      title: 'Create your account', selectedPlan: planKey, plan: billing.getPlan(planKey), formData: req.body, error: msg
    }));
  };

  if (!fullName || !email || !password || !organization) return rerender('Name, organization, email and password are required.');
  if (password.length < 10) return rerender('Password must be at least 10 characters.');
  if (!agree) return rerender('Please accept the Terms of Service to continue.');
  if (get('SELECT id FROM users WHERE email = ?', [normalizeEmail(email)])) return rerender('An account with this email already exists. Please sign in.');

  // Optional comp code — validated before we create anything.
  let comp = null;
  if (comp_code && comp_code.trim()) {
    const v = billing.validateCompCode(comp_code);
    if (!v.ok) return rerender(v.error);
    comp = v.code;
  }

  // Create the owner user — the tenant's ROOT admin, licensed by default.
  const userId = run(
    `INSERT INTO users (email, password, name, role, organization, account_type, is_root_admin, is_licensed, totp_secret, mfa_enabled, is_active)
     VALUES (?, ?, ?, 'assessor', ?, 'owner', 1, 1, ?, 0, 1)`,
    [normalizeEmail(email), bcrypt.hashSync(password, 12), fullName, organization, otpGenerateSecret()]
  );

  // Create the organization. Comp code wins over the chosen plan.
  const effectivePlan = comp ? comp.plan : planKey;
  const org = billing.createOrganization({ name: organization, ownerUserId: userId, plan: effectivePlan });
  run('UPDATE organizations SET owner_user_id = ? WHERE id = ?', [userId, org.id]);
  if (comp) billing.redeemCompCode(comp.code, org.id);

  // Auto-create a break-glass recovery account; show its password ONCE.
  let breakGlass = null;
  try { breakGlass = access.createBreakGlassForOrg(billing.getOrg(org.id), normalizeEmail(email)); }
  catch (e) { console.error('[billing] break-glass creation failed:', e.message); }

  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  req.logIn(user, (err) => {
    if (err) { req.flash('error', 'Account created — please sign in.'); return res.redirect('/admin/login'); }
    const p = billing.getPlan(effectivePlan);
    // Where to go after the break-glass reveal:
    const target = (comp || p.mode === 'trial' || p.mode === 'contact')
      ? '/admin/dashboard'
      : `/billing/checkout?plan=${effectivePlan}`;
    req.session.postRegister = { breakGlass, target, plan: effectivePlan, comped: !!comp };
    return res.redirect('/billing/welcome');
  });
 } catch (err) {
  console.error('[billing] register error:', err);
  req.flash('error', 'Something went wrong creating your account. Please try again.');
  return res.redirect('/pricing');
 }
});

// ── Welcome / break-glass reveal (shown once, right after registration) ───────
// Uses a light auth check (not ensureAuthenticated) so the recovery key is shown
// BEFORE the MFA-setup gate kicks in on the way to the dashboard.
router.get('/billing/welcome', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) return res.redirect('/admin/login');
  const pr = req.session.postRegister || {};
  const breakGlass = pr.breakGlass || null;
  // Strip the secret from the session so a refresh can't reveal it again.
  if (req.session.postRegister) req.session.postRegister = { target: pr.target, plan: pr.plan, comped: pr.comped };
  res.render('billing/welcome', billingView('welcome', {
    title: 'Save your recovery key',
    breakGlass, target: pr.target || '/admin/dashboard', comped: pr.comped, plan: billing.getPlan(pr.plan)
  }));
});

// ── Checkout (create hosted Stripe session) ───────────────────────────────────
router.get('/billing/checkout', ensureAuthenticated, async (req, res) => {
  const org = billing.orgForUser(req.user);
  if (!org) { req.flash('error', 'No workspace found for your account.'); return res.redirect('/pricing'); }
  const planKey = billing.isValidPlan(req.query.plan) ? req.query.plan : org.plan;

  if (!billing.isConfigured()) {
    return res.render('billing/checkout', billingView('checkout', {
      title: 'Checkout', org, plan: billing.getPlan(planKey), notConfigured: true
    }));
  }
  const result = await billing.createCheckoutSession({
    org, plan: planKey, customerEmail: req.user.email, baseUrl: baseUrl(req)
  });
  if (!result.ok) {
    req.flash('error', `Could not start checkout: ${result.error}`);
    return res.render('billing/checkout', billingView('checkout', {
      title: 'Checkout', org, plan: billing.getPlan(planKey), notConfigured: true
    }));
  }
  return res.redirect(303, result.url);
});

router.get('/billing/success', (req, res) => {
  res.render('billing/success', billingView('success', { title: 'Welcome aboard' }));
});
router.get('/billing/cancel', (req, res) => {
  req.flash('info', 'Checkout was cancelled — you can pick a plan again any time.');
  res.redirect('/pricing');
});

// ── Comp code redemption for an already-signed-in org ─────────────────────────
router.post('/billing/redeem', ensureAuthenticated, (req, res) => {
  const org = billing.orgForUser(req.user);
  if (!org) { req.flash('error', 'No workspace found.'); return res.redirect('/admin/dashboard'); }
  const result = billing.redeemCompCode(req.body.comp_code, org.id);
  if (!result.ok) req.flash('error', result.error);
  else req.flash('success', 'Comp code applied — your workspace is active.');
  res.redirect(req.body.return_to || '/admin/dashboard');
});

// ── Stripe billing portal (self-service card/plan/cancel) ─────────────────────
router.get('/billing/portal', ensureAuthenticated, async (req, res) => {
  const org = billing.orgForUser(req.user);
  if (!org || !org.stripe_customer_id) { req.flash('error', 'No billing account to manage yet.'); return res.redirect('/admin/dashboard'); }
  const result = await billing.createPortalSession(org.stripe_customer_id, `${baseUrl(req)}/admin/dashboard`);
  if (!result.ok) { req.flash('error', result.error); return res.redirect('/admin/dashboard'); }
  res.redirect(303, result.url);
});

// ── Admin: comp code management (assessor) ────────────────────────────────────
router.get('/admin/comp-codes', ensureAuthenticated, (req, res) => {
  const codes = all('SELECT * FROM comp_codes ORDER BY created_at DESC');
  res.render('admin/comp-codes', { title: 'Comp Codes', layout: 'main', isAdmin: true, admin: req.user, codes, plans: billing.planList() });
});
router.post('/admin/comp-codes', ensureAuthenticated, (req, res) => {
  const { code, plan, max_redemptions, expires_at, note } = req.body;
  if (!code || !code.trim()) { req.flash('error', 'A code is required.'); return res.redirect('/admin/comp-codes'); }
  if (get('SELECT id FROM comp_codes WHERE code = ?', [code.trim()])) { req.flash('error', 'That code already exists.'); return res.redirect('/admin/comp-codes'); }
  const p = billing.getPlan(billing.isValidPlan(plan) ? plan : 'business');
  run(`INSERT INTO comp_codes (code, plan, seats_limit, projects_limit, max_redemptions, expires_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code.trim(), p.key, p.seats, p.projects, parseInt(max_redemptions, 10) || 1, expires_at || null, note || null, req.user.id]);
  req.flash('success', `Comp code "${code.trim()}" created.`);
  res.redirect('/admin/comp-codes');
});
router.post('/admin/comp-codes/:id/toggle', ensureAuthenticated, (req, res) => {
  run('UPDATE comp_codes SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?', [req.params.id]);
  res.redirect('/admin/comp-codes');
});

// ── Webhook handler (mounted with express.raw in app.js) ──────────────────────
function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = billing.constructWebhookEvent(req.body, sig); // req.body is the raw Buffer
  } catch (err) {
    console.error('[billing] webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    billing.applyWebhookEvent(event);
  } catch (err) {
    console.error('[billing] webhook processing error:', err.message);
    // 200 so Stripe does not retry a poison event forever; error is logged.
  }
  res.json({ received: true });
}

module.exports = { router, webhookHandler };
