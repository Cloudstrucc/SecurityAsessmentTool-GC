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
  // Passwordless (passkey) sign-up: the client submits via fetch and expects JSON,
  // then runs the passkey registration ceremony before navigating.
  const passwordless = !!req.body.passwordless;
  const fail = (msg) => {
    if (passwordless) return res.status(400).json({ error: msg });
    res.locals.messages = Object.assign({}, res.locals.messages, { error: msg });
    return res.render('billing/register', billingView('register', {
      title: 'Create your account', selectedPlan: planKey, plan: billing.getPlan(planKey), formData: req.body, error: msg
    }));
  };

  if (!fullName || !email || !organization) return fail('Name, organization and email are required.');
  if (!passwordless && (!password || password.length < 10)) return fail('Password must be at least 10 characters.');
  if (!agree) return fail('Please accept the Terms of Service to continue.');
  if (get('SELECT id FROM users WHERE email = ?', [normalizeEmail(email)])) return fail('An account with this email already exists. Please sign in.');
  // For passwordless accounts, store a random unusable password; the user
  // authenticates with their passkey (and can set a password later if they wish).
  const effectivePassword = passwordless ? access.generatePassword(24) : password;

  // Optional comp code — validated before we create anything.
  let comp = null;
  if (comp_code && comp_code.trim()) {
    const v = billing.validateCompCode(comp_code);
    if (!v.ok) return fail(v.error);
    comp = v.code;
  }

  // Create the owner user — the tenant's ROOT admin, licensed by default.
  const userId = run(
    `INSERT INTO users (email, password, name, role, organization, account_type, is_root_admin, is_licensed, totp_secret, mfa_enabled, is_active)
     VALUES (?, ?, ?, 'assessor', ?, 'owner', 1, 1, ?, 0, 1)`,
    [normalizeEmail(email), bcrypt.hashSync(effectivePassword, 12), fullName, organization, otpGenerateSecret()]
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
    // Passwordless: return JSON so the client can run the passkey ceremony, then
    // it navigates to the welcome/recovery-key screen.
    if (passwordless) return res.json({ ok: true, next: '/billing/welcome' });
    return res.redirect('/billing/welcome');
  });
 } catch (err) {
  console.error('[billing] register error:', err);
  req.flash('error', 'Something went wrong creating your account. Please try again.');
  return res.redirect('/pricing');
 }
});

// ── Redeem an org invitation (member/collaborator must register) ──────────────
function findInvite(code) {
  const inv = get("SELECT * FROM invitations WHERE invite_code = ? AND status = 'pending'", [String(code || '').toUpperCase().trim()]);
  if (!inv) return null;
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return null;
  return inv;
}

router.get('/redeem/:code', (req, res) => {
  const inv = findInvite(req.params.code);
  if (!inv) return res.render('billing/redeem', billingView('redeem', { title: 'Redeem invitation', invalid: true }));
  const org = inv.organization_id ? billing.getOrg(inv.organization_id) : null;
  res.render('billing/redeem', billingView('redeem', { title: 'Redeem invitation', inv, org, code: req.params.code, formData: {} }));
});

router.post('/redeem/:code', (req, res) => {
 try {
  const inv = findInvite(req.params.code);
  if (!inv) return res.render('billing/redeem', billingView('redeem', { title: 'Redeem invitation', invalid: true }));
  const org = inv.organization_id ? billing.getOrg(inv.organization_id) : null;
  const { first_name, last_name, password, agree } = req.body;
  const fullName = `${first_name || ''} ${last_name || ''}`.trim();
  const rerender = (msg) => {
    res.locals.messages = Object.assign({}, res.locals.messages, { error: msg });
    return res.render('billing/redeem', billingView('redeem', { title: 'Redeem invitation', inv, org, code: req.params.code, formData: req.body }));
  };
  if (!fullName || !password) return rerender('Your name and a password are required.');
  if (password.length < 10) return rerender('Password must be at least 10 characters.');
  if (!agree) return rerender('Please accept the Terms of Service to continue.');

  const email = normalizeEmail(inv.email);
  if (get('SELECT id FROM users WHERE email = ?', [email])) return rerender('An account already exists for this email. Please sign in instead.');

  // Seat / admin capacity checks at redemption time.
  if (org && inv.grant_license) { const l = access.canAddLicense(org); if (!l.ok) return rerender(l.reason); }
  if (org && inv.grant_admin)  { const a = access.canAddAdmin(org);  if (!a.ok) return rerender(a.reason); }

  const accountType = inv.grant_admin ? 'admin' : (inv.grant_license ? 'member' : 'collaborator');
  const licensed = inv.grant_admin || inv.grant_license ? 1 : 0;
  const userId = run(
    `INSERT INTO users (email, password, name, role, organization, organization_id, account_type, is_licensed, is_root_admin, totp_secret, mfa_enabled, is_active)
     VALUES (?, ?, ?, 'assessor', ?, ?, ?, ?, 0, ?, 0, 1)`,
    [email, bcrypt.hashSync(password, 12), fullName, org ? org.name : (inv.organization || ''), inv.organization_id || null, accountType, licensed, otpGenerateSecret()]
  );
  run("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ? WHERE id = ?", [userId, inv.id]);
  // Attach any pending assignments that were invited to this email/code.
  run("UPDATE assessment_assignments SET assigned_to = ?, status = 'active', accepted_at = CURRENT_TIMESTAMP WHERE invitation_id = ?", [userId, inv.id]);

  const user = get('SELECT * FROM users WHERE id = ?', [userId]);
  req.logIn(user, (err) => {
    if (err) { req.flash('error', 'Account created — please sign in.'); return res.redirect('/admin/login'); }
    req.flash('success', `Welcome to ${org ? org.name : 'the workspace'}! Set up MFA to continue.`);
    res.redirect('/admin/dashboard');
  });
 } catch (err) {
  console.error('[billing] redeem error:', err);
  req.flash('error', 'Something went wrong redeeming your invitation. Please try again.');
  res.redirect(`/redeem/${req.params.code}`);
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
