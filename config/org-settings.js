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

// ── AI provider (bring-your-own LLM / MCP) ──────────────────────────────────
const AI_PROVIDERS = ['oob', 'anthropic', 'openai', 'grok', 'gemini', 'custom'];

function updateAi(orgId, s) {
  ensureRow(orgId);
  const cur = getSettings(orgId) || {};
  const key = (s.ai_api_key && s.ai_api_key.length) ? s.ai_api_key : cur.ai_api_key;       // keep if blank
  const mcpTok = (s.ai_mcp_token && s.ai_mcp_token.length) ? s.ai_mcp_token : cur.ai_mcp_token;
  const provider = AI_PROVIDERS.includes(s.ai_provider) ? s.ai_provider : 'oob';
  run(`UPDATE org_settings SET ai_provider=?, ai_api_key=?, ai_model=?, ai_base_url=?,
       ai_mcp_url=?, ai_mcp_token=?, updated_at=CURRENT_TIMESTAMP WHERE organization_id=?`,
    [provider, key || null, s.ai_model || null, s.ai_base_url || null,
     s.ai_mcp_url || null, mcpTok || null, orgId]);
  return getSettings(orgId);
}

/**
 * Resolve the AI provider config for a tenant. When the tenant hasn't brought
 * their own provider (or left the key blank), returns the OOB default so the
 * platform's built-in Anthropic key is used and usage is metered.
 */
function aiConfig(orgId) {
  const s = getSettings(orgId) || {};
  const provider = s.ai_provider || 'oob';
  // A custom / on-prem OpenAI-compatible endpoint may authenticate at the network
  // layer (mTLS, private link, IP allow-list) and need no API key — a base URL is
  // enough to treat it as bring-your-own. Hosted providers always require a key.
  // Without this, a keyless custom endpoint would silently fall back to the
  // platform's Anthropic key and be metered against the tenant's OOB allowance.
  const hasCreds = provider === 'custom' ? (!!s.ai_api_key || !!s.ai_base_url) : !!s.ai_api_key;
  const isByo = provider !== 'oob' && hasCreds;
  if (!isByo) {
    return { provider: 'oob', isByo: false, orgId: orgId || null, mcpUrl: s.ai_mcp_url || null, mcpToken: s.ai_mcp_token || null };
  }
  return {
    provider, isByo: true, orgId: orgId || null,
    apiKey: s.ai_api_key || null, model: s.ai_model || null, baseUrl: s.ai_base_url || null,
    mcpUrl: s.ai_mcp_url || null, mcpToken: s.ai_mcp_token || null
  };
}

module.exports = {
  getSettings, updateSmtp, updateSms, updateDomain, setDomainVerified, smtpConfig, orgSmtp,
  AI_PROVIDERS, updateAi, aiConfig
};
