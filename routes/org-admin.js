/**
 * Root-admin console — tenant-wide settings only the primary administrator may
 * change: own SMTP, own SMS provider, and a custom domain. Mounted at /admin.
 */
const express = require('express');
const billing = require('../config/billing');
const access = require('../config/access');
const orgSettings = require('../config/org-settings');
const emailService = require('../utils/emailService');
const smsService = require('../utils/smsService');

const router = express.Router();

function currentOrg(req) { return billing.orgForUser(req.user); }

function renderConsole(req, res, extra = {}) {
  const org = currentOrg(req);
  const settings = org ? orgSettings.getSettings(org.id) : null;
  return res.render('admin/org-settings', Object.assign({
    title: 'Organization Settings', layout: 'main', isAdmin: true, admin: req.user,
    org, settings, host: req.get('host')
  }, extra));
}

// Console
router.get('/organization', access.ensureRootAdmin, (req, res) => renderConsole(req, res));

// ── SMTP ──
router.post('/organization/smtp', access.ensureRootAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateSmtp(org.id, req.body);
  req.flash('success', 'SMTP settings saved.');
  res.redirect('/admin/organization#smtp');
});

router.post('/organization/smtp/test', access.ensureRootAdmin, async (req, res) => {
  const org = currentOrg(req);
  const cfg = orgSettings.smtpConfig(orgSettings.getSettings(org && org.id));
  if (!cfg) { req.flash('error', 'Save and enable SMTP settings before testing.'); return res.redirect('/admin/organization#smtp'); }
  const to = (req.body.test_to || req.user.email || '').trim();
  const result = await emailService.sendTestEmail(cfg, to);
  if (result.sent) req.flash('success', `Test email sent to ${to}.`);
  else req.flash('error', `Test email failed: ${result.error}`);
  res.redirect('/admin/organization#smtp');
});

// ── SMS ──
router.post('/organization/sms', access.ensureRootAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateSms(org.id, req.body);
  req.flash('success', 'SMS settings saved.');
  res.redirect('/admin/organization#sms');
});

router.post('/organization/sms/test', access.ensureRootAdmin, async (req, res) => {
  const org = currentOrg(req);
  const settings = orgSettings.getSettings(org && org.id);
  const to = (req.body.test_to || '').trim();
  if (!to) { req.flash('error', 'Enter a destination phone number to test.'); return res.redirect('/admin/organization#sms'); }
  const result = await smsService.sendTestSms(settings, to);
  if (result.sent) req.flash('success', `Test SMS sent to ${to}.`);
  else req.flash('error', `Test SMS failed: ${result.error}`);
  res.redirect('/admin/organization#sms');
});

// ── Custom domain ──
router.post('/organization/domain', access.ensureRootAdmin, (req, res) => {
  const org = currentOrg(req);
  if (!org) { req.flash('error', 'No organization found.'); return res.redirect('/admin/dashboard'); }
  orgSettings.updateDomain(org.id, (req.body.custom_domain || '').trim().toLowerCase());
  req.flash('success', 'Custom domain saved. Add the DNS records shown, then verify.');
  res.redirect('/admin/organization#domain');
});

router.post('/organization/domain/verify', access.ensureRootAdmin, (req, res) => {
  const org = currentOrg(req);
  // DNS/TLS binding is performed at the hosting layer (e.g. Azure custom domain).
  // Here the root admin confirms the records are in place; a real DNS check can
  // be added later. Mark verified so the app can start using the domain.
  orgSettings.setDomainVerified(org.id, true);
  req.flash('success', 'Custom domain marked verified.');
  res.redirect('/admin/organization#domain');
});

module.exports = router;
