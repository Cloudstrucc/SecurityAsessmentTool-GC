/**
 * Root-admin console — tenant-wide settings only the primary administrator may
 * change: own SMTP, own SMS provider, and a custom domain. Mounted at /admin.
 */
const express = require('express');
const crypto = require('crypto');
const { get, all, run } = require('../models/database');
const billing = require('../config/billing');
const access = require('../config/access');
const orgSettings = require('../config/org-settings');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');
const checks = require('../config/integration-checks');
const reportBranding = require('../config/report-branding');
const { BRANDING_UPLOAD_DIR } = require('../config/storage');
const multer = require('multer');
const brandingUpload = multer({ dest: BRANDING_UPLOAD_DIR, limits: { fileSize: 2 * 1024 * 1024 } });

const router = express.Router();

function baseUrl(req) { return `${req.protocol}://${req.get('host')}`; }

function currentOrg(req) { return billing.orgForUser(req.user); }

function renderConsole(req, res, extra = {}) {
  const org = currentOrg(req);
  const settings = org ? orgSettings.getSettings(org.id) : null;
  return res.render('admin/org-settings', Object.assign({
    title: 'Organization Settings', layout: 'main', isAdmin: true, admin: req.user,
    org, settings, host: req.get('host'),
    // Last 24h of validation history per integration, for the log panels.
    checkHistory: org ? checks.historyAll(org.id) : {},
    domainToken: org ? checks.domainVerificationToken(org.id) : '',
    // Org-level report branding (defaults every project inherits).
    orgBranding: org ? (reportBranding.getOrgRow(org.id) || {}) : {}
  }, extra));
}

/**
 * Re-run a real validation for one integration (the reload icon next to
 * "Last valid check"). Works for smtp | sms | domain | ai.
 */
router.post('/organization/:feature/validate', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  const feature = String(req.params.feature || '');
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  if (!checks.FEATURES.includes(feature)) { req.flash('error', 'Unknown integration.'); return res.redirect('/admin/organization'); }
  const result = await checks.runCheck(feature, {
    orgId: org.id, expectedHost: req.get('host'), user: req.user, kind: 'validate'
  });
  req.flash(result.ok ? 'success' : 'error', result.message);
  res.redirect(`/admin/organization#${feature}`);
});

// Console
router.get('/organization', access.ensureOrgAdmin, (req, res) => renderConsole(req, res));

// ── Report branding (org-level defaults) ──
router.post('/organization/branding', access.ensureOrgAdmin, brandingUpload.single('logo'), (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  try {
    reportBranding.save('org', org.id, {
      organization_name: req.body.organization_name,
      report_subtitle: req.body.report_subtitle,
      classification_label: req.body.classification_label,
      assessor_company_name: req.body.assessor_company_name,
      primary_color: req.body.primary_color,
      accent_color: req.body.accent_color,
      header_text: req.body.header_text,
      footer_text: req.body.footer_text,
      logo_filename: req.file && req.file.filename,
      logo_original_name: req.file && req.file.originalname,
      logo_mime_type: req.file && req.file.mimetype
    }, req.user.id);
    req.flash('success', req.t ? req.t('rf.brandingSaved') : 'Report branding saved.');
  } catch (err) {
    console.error('org branding save error:', err);
    req.flash('error', 'Failed to save branding: ' + err.message);
  }
  res.redirect('/admin/organization#branding');
});

router.post('/organization/branding/clear', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  reportBranding.clear('org', org.id);
  req.flash('success', req.t ? req.t('rf.brandingCleared') : 'Report branding cleared.');
  res.redirect('/admin/organization#branding');
});

// ── SMTP ──
router.post('/organization/smtp', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateSmtp(org.id, req.body);
  req.flash('success', 'SMTP settings saved.');
  res.redirect('/admin/organization#smtp');
});

router.post('/organization/smtp/test', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  const cfg = orgSettings.smtpConfig(orgSettings.getSettings(org && org.id));
  if (!cfg) { req.flash('error', 'Save and enable SMTP settings before testing.'); return res.redirect('/admin/organization#smtp'); }
  const to = (req.body.test_to || req.user.email || '').trim();
  const result = await emailService.sendTestEmail(cfg, to);
  checks.recordResult(org.id, 'smtp', {
    ok: !!result.sent,
    message: result.sent ? `Test email delivered to ${to}.` : `Test email failed: ${result.error}`,
    detail: { to, host: cfg.host, port: cfg.port }
  }, { kind: 'test', user: req.user });
  if (result.sent) req.flash('success', `Test email sent to ${to}.`);
  else req.flash('error', `Test email failed: ${result.error}`);
  res.redirect('/admin/organization#smtp');
});

router.post('/organization/smtp/delete', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.clearSmtp(org.id);
  req.flash('success', 'SMTP settings removed. Email now uses the platform default.');
  res.redirect('/admin/organization#smtp');
});

// ── SMS ──
router.post('/organization/sms', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateSms(org.id, req.body);
  req.flash('success', 'SMS settings saved.');
  res.redirect('/admin/organization#sms');
});

router.post('/organization/sms/test', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  const settings = orgSettings.getSettings(org && org.id);
  const to = (req.body.test_to || '').trim();
  if (!to) { req.flash('error', 'Enter a destination phone number to test.'); return res.redirect('/admin/organization#sms'); }
  const result = await smsService.sendTestSms(settings, to);
  checks.recordResult(org.id, 'sms', {
    ok: !!result.sent,
    message: result.sent ? `Test SMS delivered to ${to}.` : `Test SMS failed: ${result.error}`,
    detail: { to, from: settings && settings.sms_from }
  }, { kind: 'test', user: req.user });
  if (result.sent) req.flash('success', `Test SMS sent to ${to}.`);
  else req.flash('error', `Test SMS failed: ${result.error}`);
  res.redirect('/admin/organization#sms');
});

router.post('/organization/sms/delete', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.clearSms(org.id);
  req.flash('success', 'SMS settings removed.');
  res.redirect('/admin/organization#sms');
});

// ── AI provider (bring-your-own LLM / MCP) ──
router.post('/organization/ai', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateAi(org.id, req.body);
  req.flash('success', 'AI provider settings saved.');
  res.redirect('/admin/organization#ai');
});

router.post('/organization/ai/test', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  const result = await checks.runCheck('ai', { orgId: org.id, user: req.user, kind: 'test' });
  req.flash(result.ok ? 'success' : 'error', result.message);
  res.redirect('/admin/organization#ai');
});

router.post('/organization/ai/delete', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.clearAi(org.id);
  req.flash('success', 'Custom AI provider removed. AI now uses the platform default (OOB).');
  res.redirect('/admin/organization#ai');
});

// ── Mention notifications (tenant policy) ──
router.post('/organization/notifications', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateNotifications(org.id, {
    enabled: !!req.body.notify_mentions_enabled,
    excerpt: !!req.body.notify_mention_excerpt
  });
  req.flash('success', 'Notification settings saved.');
  res.redirect('/admin/organization#notifications');
});

// ── Custom domain ──
router.post('/organization/domain', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateDomain(org.id, (req.body.custom_domain || '').trim().toLowerCase());
  req.flash('success', 'Custom domain saved. Add the DNS records shown, then verify.');
  res.redirect('/admin/organization#domain');
});

/**
 * Verify the custom domain by actually resolving its DNS records. The domain is
 * only marked verified when the ownership TXT record and the routing CNAME (or an
 * apex A record) genuinely resolve — self-attestation is not accepted.
 */
router.post('/organization/domain/verify', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  const result = await checks.runCheck('domain', {
    orgId: org.id, expectedHost: req.get('host'), user: req.user, kind: 'verify'
  });
  orgSettings.setDomainVerified(org.id, result.ok);
  if (result.ok) req.flash('success', `Custom domain verified. ${result.message}`);
  else req.flash('error', `${result.message} DNS changes can take up to 48 hours to propagate — try again once they have.`);
  res.redirect('/admin/organization#domain');
});

router.post('/organization/domain/delete', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.clearDomain(org.id);
  req.flash('success', 'Custom domain removed. The platform default domain is used again.');
  res.redirect('/admin/organization#domain');
});

// ═══════════════════════════════════════════════════════════════════════════
// Licensing & seats
// ═══════════════════════════════════════════════════════════════════════════
function seatSummary(org) {
  const plan = billing.getPlan(org.plan) || {};
  const adminCap = org.admin_seats_limit != null ? org.admin_seats_limit : access.adminSeatsForPlan(org.plan);
  return {
    total: org.seats_limit,                         // null = unlimited
    usedLicensed: access.countLicensed(org.id),
    admins: access.countAdmins(org.id),
    adminCap,
    plan: plan.label || org.plan,
    status: org.status
  };
}

router.get('/licensing', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  const members = all(`SELECT id, name, email, account_type, is_licensed, is_root_admin, is_break_glass, is_active, last_login
                       FROM users WHERE organization_id = ? ORDER BY is_root_admin DESC, is_break_glass ASC, name`, [org.id]);
  const pending = all(`SELECT * FROM invitations WHERE organization_id = ? AND status = 'pending' ORDER BY created_at DESC`, [org.id]);
  res.render('admin/licensing', {
    title: 'Licensing', layout: 'main', isAdmin: true, admin: req.user,
    org, seats: seatSummary(org), members, pending, stripeReady: billing.isConfigured()
  });
});

// Grant / revoke a license for a member.
router.post('/licensing/user/:id/license', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  const u = get('SELECT * FROM users WHERE id = ? AND organization_id = ?', [req.params.id, org.id]);
  if (!u) { req.flash('error', 'User not found in your organization.'); return res.redirect('/admin/licensing'); }
  if (u.is_break_glass) { req.flash('error', 'The break-glass account is always licensed and cannot be changed.'); return res.redirect('/admin/licensing'); }
  if (u.is_licensed) {
    if (u.is_root_admin) { req.flash('error', 'The root administrator must stay licensed.'); return res.redirect('/admin/licensing'); }
    run("UPDATE users SET is_licensed = 0, account_type = CASE WHEN account_type='admin' THEN 'member' ELSE account_type END WHERE id = ?", [u.id]);
    req.flash('success', `License revoked from ${u.name}.`);
  } else {
    const gate = access.canAddLicense(org);
    if (!gate.ok) { req.flash('error', gate.reason); return res.redirect('/admin/licensing'); }
    run('UPDATE users SET is_licensed = 1 WHERE id = ?', [u.id]);
    req.flash('success', `License granted to ${u.name}.`);
  }
  res.redirect('/admin/licensing');
});

// Promote / demote admin.
router.post('/licensing/user/:id/admin', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  const u = get('SELECT * FROM users WHERE id = ? AND organization_id = ?', [req.params.id, org.id]);
  if (!u) { req.flash('error', 'User not found.'); return res.redirect('/admin/licensing'); }
  if (u.is_root_admin || u.is_break_glass) { req.flash('error', 'This account\'s role cannot be changed here.'); return res.redirect('/admin/licensing'); }
  if (u.account_type === 'admin') {
    run("UPDATE users SET account_type = 'member' WHERE id = ?", [u.id]);
    req.flash('success', `${u.name} is no longer an admin.`);
  } else {
    const gate = access.canAddAdmin(org);
    if (!gate.ok) { req.flash('error', gate.reason); return res.redirect('/admin/licensing'); }
    // Admins must hold a license.
    if (!u.is_licensed) {
      const l = access.canAddLicense(org);
      if (!l.ok) { req.flash('error', l.reason); return res.redirect('/admin/licensing'); }
    }
    run("UPDATE users SET account_type = 'admin', is_licensed = 1 WHERE id = ?", [u.id]);
    req.flash('success', `${u.name} is now an admin.`);
  }
  res.redirect('/admin/licensing');
});

// Deactivate a member (frees the seat). Never the root admin or break-glass.
router.post('/licensing/user/:id/remove', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  const u = get('SELECT * FROM users WHERE id = ? AND organization_id = ?', [req.params.id, org.id]);
  if (!u) { req.flash('error', 'User not found.'); return res.redirect('/admin/licensing'); }
  if (u.is_root_admin || u.is_break_glass) { req.flash('error', 'This account cannot be removed.'); return res.redirect('/admin/licensing'); }
  run("UPDATE users SET is_active = 0, is_licensed = 0 WHERE id = ?", [u.id]);
  req.flash('success', `${u.name} was deactivated and their seat freed.`);
  res.redirect('/admin/licensing');
});

// Invite a user to fill a licensed seat (redeem flow lands in Increment 5).
router.post('/licensing/invite', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  const email = (req.body.email || '').toLowerCase().trim();
  const name = (req.body.name || '').trim();
  const asAdmin = !!req.body.as_admin;
  if (!email) { req.flash('error', 'An email is required.'); return res.redirect('/admin/licensing'); }
  if (get('SELECT id FROM users WHERE email = ? AND organization_id = ?', [email, org.id])) {
    req.flash('error', 'That person is already in your organization.'); return res.redirect('/admin/licensing');
  }
  // Seat + admin capacity checks up front.
  const l = access.canAddLicense(org);
  if (!l.ok) { req.flash('error', l.reason); return res.redirect('/admin/licensing'); }
  if (asAdmin) { const a = access.canAddAdmin(org); if (!a.ok) { req.flash('error', a.reason); return res.redirect('/admin/licensing'); } }

  const code = crypto.randomBytes(5).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  run(`INSERT INTO invitations (type, email, name, organization, invite_code, invited_by, expires_at, organization_id, grant_admin, grant_license)
       VALUES ('member', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [email, name, org.name, code, req.user.id, expires, org.id, asAdmin ? 1 : 0]);
  emailService.sendUserInvitation({
    to: email, recipientName: name, inviteCode: code, invitedByName: req.user.name,
    role: 'member', organization: org.name, baseUrl: baseUrl(req),
    smtpConfig: orgSettings.orgSmtp(org.id)
  });
  req.flash('success', `Invitation sent to ${email} (${asAdmin ? 'admin' : 'user'}). Code: ${code}`);
  res.redirect('/admin/licensing');
});

router.post('/licensing/invite/:id/revoke', access.ensureOrgAdmin, (req, res) => {
  const org = currentOrg(req);
  run("UPDATE invitations SET status = 'revoked' WHERE id = ? AND organization_id = ?", [req.params.id, org.id]);
  req.flash('success', 'Invitation revoked.');
  res.redirect('/admin/licensing');
});

// Add seats: paid orgs self-serve in the Stripe portal; comped orgs set a count;
// trial orgs are prompted to upgrade.
router.post('/licensing/seats', access.ensureOrgAdmin, async (req, res) => {
  const org = currentOrg(req);
  if (org.status === 'comped') {
    const n = Math.max(access.countLicensed(org.id), parseInt(req.body.seats, 10) || org.seats_limit || 1);
    run('UPDATE organizations SET seats_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [n, org.id]);
    req.flash('success', `Seat count set to ${n}.`);
    return res.redirect('/admin/licensing');
  }
  if (org.stripe_customer_id && billing.isConfigured()) {
    const p = await billing.createPortalSession(org.stripe_customer_id, `${baseUrl(req)}/admin/licensing`);
    if (p.ok) return res.redirect(303, p.url);
    req.flash('error', p.error);
    return res.redirect('/admin/licensing');
  }
  req.flash('info', 'Upgrade to a paid plan to purchase additional seats.');
  res.redirect('/pricing');
});

// ═══════════════════════════════════════════════════════════════════════════
// Password & MFA reset (admins; never the break-glass account)
// ═══════════════════════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');

function targetInOrg(req) {
  const org = currentOrg(req);
  const u = org ? get('SELECT * FROM users WHERE id = ? AND organization_id = ?', [req.params.id, org.id]) : null;
  return { org, u };
}

/** Clear all MFA methods (TOTP + passkeys) and force re-enrollment next login. */
function clearMfa(userId) {
  run(`UPDATE users SET mfa_enabled = 0, totp_secret = NULL,
       webauthn_credential_id = NULL, webauthn_public_key = NULL, webauthn_counter = 0,
       must_reenroll_mfa = 1 WHERE id = ?`, [userId]);
}

// Reset password → new temp password (shown once) + forced MFA re-enrollment.
router.post('/users/:id/reset-password', access.ensureAdmin, (req, res) => {
  const { u } = targetInOrg(req);
  if (!u) { req.flash('error', 'User not found in your organization.'); return res.redirect('/admin/licensing'); }
  if (u.is_break_glass) { req.flash('error', 'The break-glass account cannot be reset here — use tenant recovery.'); return res.redirect('/admin/licensing'); }

  const temp = access.generatePassword(14);
  run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(temp, 12), u.id]);
  clearMfa(u.id); // resetting a password auto-triggers MFA re-enrollment
  req.flash('success', `Password reset for ${u.name}. One-time password: ${temp} — share it securely. They'll re-enroll MFA on next sign-in.`);
  res.redirect(req.body.return_to || '/admin/licensing');
});

// Reset MFA only (TOTP + passkeys) → forced re-enrollment next login.
router.post('/users/:id/reset-mfa', access.ensureAdmin, (req, res) => {
  const { u } = targetInOrg(req);
  if (!u) { req.flash('error', 'User not found in your organization.'); return res.redirect('/admin/licensing'); }
  if (u.is_break_glass) { req.flash('error', 'The break-glass account cannot be reset here.'); return res.redirect('/admin/licensing'); }
  clearMfa(u.id);
  req.flash('success', `MFA reset for ${u.name}. They'll set up a new authenticator or passkey on next sign-in.`);
  res.redirect(req.body.return_to || '/admin/licensing');
});

module.exports = router;
