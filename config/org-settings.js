/**
 * Per-tenant settings — a root admin can bring their own SMTP, SMS provider,
 * and custom domain instead of the SaaS defaults. Backed by the org_settings
 * table (PK = organization_id).
 *
 * Note: SMTP passwords / SMS tokens are stored as provided. They are never
 * echoed back to the UI (the form shows a "configured" placeholder instead).
 * Encrypting these at rest is a recommended follow-up.
 */
const { get, run } = require('../models/database');

function getSettings(orgId) {
  if (!orgId) return null;
  return get('SELECT * FROM org_settings WHERE organization_id = ?', [orgId]) || null;
}

function ensureRow(orgId) {
  if (!get('SELECT organization_id FROM org_settings WHERE organization_id = ?', [orgId])) {
    run('INSERT INTO org_settings (organization_id) VALUES (?)', [orgId]);
  }
}

function updateSmtp(orgId, s) {
  ensureRow(orgId);
  // Keep the existing password if the form left it blank (placeholder).
  const cur = getSettings(orgId) || {};
  const pass = (s.smtp_password && s.smtp_password.length) ? s.smtp_password : cur.smtp_password;
  run(`UPDATE org_settings SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_password=?, smtp_from=?,
       smtp_secure=?, smtp_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE organization_id=?`,
    [s.smtp_host || null, parseInt(s.smtp_port, 10) || 587, s.smtp_user || null, pass || null,
     s.smtp_from || null, s.smtp_secure ? 1 : 0, s.smtp_enabled ? 1 : 0, orgId]);
  return getSettings(orgId);
}

function updateSms(orgId, s) {
  ensureRow(orgId);
  const cur = getSettings(orgId) || {};
  const token = (s.sms_auth_token && s.sms_auth_token.length) ? s.sms_auth_token : cur.sms_auth_token;
  run(`UPDATE org_settings SET sms_provider=?, sms_account_sid=?, sms_auth_token=?, sms_from=?,
       sms_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE organization_id=?`,
    [s.sms_provider || 'twilio', s.sms_account_sid || null, token || null, s.sms_from || null,
     s.sms_enabled ? 1 : 0, orgId]);
  return getSettings(orgId);
}

function updateDomain(orgId, customDomain) {
  ensureRow(orgId);
  const cur = getSettings(orgId) || {};
  const changed = (cur.custom_domain || '') !== (customDomain || '');
  run(`UPDATE org_settings SET custom_domain=?, custom_domain_verified=?, updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=?`,
    [customDomain || null, changed ? 0 : (cur.custom_domain_verified || 0), orgId]);
  return getSettings(orgId);
}

function setDomainVerified(orgId, verified) {
  ensureRow(orgId);
  run('UPDATE org_settings SET custom_domain_verified=?, updated_at=CURRENT_TIMESTAMP WHERE organization_id=?',
    [verified ? 1 : 0, orgId]);
  return getSettings(orgId);
}

/** nodemailer transport config from org SMTP settings, or null if not usable. */
function smtpConfig(settings) {
  if (!settings || !settings.smtp_enabled || !settings.smtp_host) return null;
  return {
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: !!settings.smtp_secure,
    user: settings.smtp_user || null,
    password: settings.smtp_password || null,
    from: settings.smtp_from || settings.smtp_user || null
  };
}

/** Resolve the SMTP config to use for a tenant, or null to use the SaaS default. */
function orgSmtp(orgId) {
  return smtpConfig(getSettings(orgId));
}

module.exports = {
  getSettings, updateSmtp, updateSms, updateDomain, setDomainVerified, smtpConfig, orgSmtp
};
