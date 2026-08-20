/**
 * Real validation for the tenant integrations configured at /admin/organization.
 *
 * Every check here performs an ACTUAL network operation — a DNS lookup, an SMTP
 * handshake, a Twilio API call, a model round-trip — rather than trusting what the
 * root admin typed in. Results are written to `org_setting_checks` (24h rolling
 * retention) and, on success, stamp a `*_verified_at` column on `org_settings` so
 * the console can show a "Last valid check" that survives the log purge.
 *
 * Checks never throw: they always resolve to { ok, message, detail }.
 */
const dns = require('dns').promises;
const { get, all, run } = require('../models/database');
const orgSettings = require('./org-settings');

const FEATURES = ['smtp', 'sms', 'domain', 'ai'];
const VERIFIED_COLUMN = {
  smtp: 'smtp_verified_at',
  sms: 'sms_verified_at',
  domain: 'domain_checked_at',
  ai: 'ai_verified_at'
};
const NET_TIMEOUT_MS = 12000;

/** Reject a hung network/DNS call so a check can never block the request. */
function withTimeout(promise, ms = NET_TIMEOUT_MS, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
  ]);
}

/** The TXT value the tenant must publish to prove domain ownership. */
function domainVerificationToken(orgId) {
  return `vanguard-domain-verification=org${orgId}`;
}

// ── Custom domain: real DNS resolution ──────────────────────────────────────
/**
 * Validate that the CNAME and TXT records shown in the console actually exist in
 * public DNS. Ownership is proven by the TXT token; routing is proven by the CNAME
 * (or, for an apex domain that cannot hold a CNAME, by A records that match the
 * app host's own A records).
 */
async function checkDomain(orgId, expectedHost) {
  const settings = orgSettings.getSettings(orgId) || {};
  const domain = (settings.custom_domain || '').trim().toLowerCase();
  if (!domain) return { ok: false, message: 'No custom domain is configured.', detail: null };

  const token = domainVerificationToken(orgId);
  const txtName = `_vanguard-verify.${domain}`;
  const detail = { domain, expectedHost: expectedHost || null, txtName, expectedTxt: token };

  // 1) TXT ownership record.
  let txtOk = false;
  try {
    const records = await withTimeout(dns.resolveTxt(txtName), NET_TIMEOUT_MS, 'TXT lookup');
    const flat = records.map(r => (Array.isArray(r) ? r.join('') : String(r)).trim());
    detail.txtFound = flat;
    txtOk = flat.some(v => v === token);
  } catch (err) {
    detail.txtError = err.code || err.message;
  }

  // 2) CNAME routing record (with an A-record fallback for apex domains).
  let cnameOk = false;
  try {
    const cnames = await withTimeout(dns.resolveCname(domain), NET_TIMEOUT_MS, 'CNAME lookup');
    detail.cnameFound = cnames;
    if (expectedHost) {
      const want = String(expectedHost).toLowerCase().replace(/\.$/, '');
      cnameOk = cnames.some(c => String(c).toLowerCase().replace(/\.$/, '') === want);
    }
  } catch (err) {
    detail.cnameError = err.code || err.message;
    // Apex domains can't use CNAME — accept matching A records instead.
    if (expectedHost) {
      try {
        const [domainIps, hostIps] = await Promise.all([
          withTimeout(dns.resolve4(domain), NET_TIMEOUT_MS, 'A lookup'),
          withTimeout(dns.resolve4(String(expectedHost).split(':')[0]), NET_TIMEOUT_MS, 'A lookup')
        ]);
        detail.aFound = domainIps;
        detail.aExpected = hostIps;
        cnameOk = domainIps.some(ip => hostIps.includes(ip));
        if (cnameOk) detail.routedVia = 'A record (apex domain)';
      } catch (e2) { detail.aError = e2.code || e2.message; }
    }
  }

  detail.txtOk = txtOk;
  detail.routingOk = cnameOk;

  if (txtOk && cnameOk) {
    return { ok: true, message: `DNS verified for ${domain} — ownership (TXT) and routing both resolve.`, detail };
  }
  const missing = [];
  if (!txtOk) missing.push(`TXT ${txtName} → "${token}"`);
  if (!cnameOk) missing.push(`CNAME ${domain} → ${expectedHost || '(app host)'}`);
  return {
    ok: false,
    message: `DNS not verified for ${domain}. Not found or not matching: ${missing.join('; ')}.`,
    detail
  };
}

// ── SMTP: real connection + authentication handshake (no email sent) ────────
async function checkSmtp(orgId) {
  const settings = orgSettings.getSettings(orgId);
  const cfg = orgSettings.smtpConfig(settings);
  if (!cfg) {
    return { ok: false, message: 'SMTP is not configured or not enabled — save and enable it first.', detail: null };
  }
  const emailService = require('../utils/emailService');
  const detail = { host: cfg.host, port: cfg.port, secure: !!cfg.secure, user: cfg.user || null };
  try {
    await withTimeout(emailService.verifyTransport(cfg), NET_TIMEOUT_MS, 'SMTP connection');
    return { ok: true, message: `Connected and authenticated to ${cfg.host}:${cfg.port}.`, detail };
  } catch (err) {
    detail.error = err.message;
    return { ok: false, message: `SMTP check failed: ${err.message}`, detail };
  }
}

// ── SMS: real Twilio credential validation ─────────────────────────────────
async function checkSms(orgId) {
  const s = orgSettings.getSettings(orgId) || {};
  const provider = s.sms_provider || 'twilio';
  if (!s.sms_account_sid || !s.sms_auth_token) {
    return { ok: false, message: 'SMS is not configured — save an Account SID and auth token first.', detail: null };
  }
  if (provider !== 'twilio') {
    return { ok: false, message: `Unsupported SMS provider: ${provider}.`, detail: { provider } };
  }
  const detail = { provider, accountSid: s.sms_account_sid, from: s.sms_from || null };
  try {
    const auth = Buffer.from(`${s.sms_account_sid}:${s.sms_auth_token}`).toString('base64');
    const resp = await withTimeout(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(s.sms_account_sid)}.json`,
        { headers: { Authorization: `Basic ${auth}` } }),
      NET_TIMEOUT_MS, 'Twilio API call');
    const body = await resp.json().catch(() => ({}));
    detail.status = resp.status;
    if (!resp.ok) {
      detail.error = body && body.message ? body.message : `HTTP ${resp.status}`;
      return { ok: false, message: `Twilio rejected the credentials: ${detail.error}`, detail };
    }
    detail.accountStatus = body.status || null;
    detail.friendlyName = body.friendly_name || null;
    if (body.status && body.status !== 'active') {
      return { ok: false, message: `Twilio account is "${body.status}", not active.`, detail };
    }
    if (!s.sms_from) {
      return { ok: false, message: 'Credentials are valid, but no "From" number is set — messages cannot be sent.', detail };
    }
    return { ok: true, message: `Twilio account "${body.friendly_name || s.sms_account_sid}" is active.`, detail };
  } catch (err) {
    detail.error = err.message;
    return { ok: false, message: `SMS check failed: ${err.message}`, detail };
  }
}

// ── AI provider: real model round-trip through the tenant's provider ───────
async function checkAi(orgId, userId) {
  const cfg = orgSettings.aiConfig(orgId);
  const detail = { provider: cfg.provider, isByo: !!cfg.isByo, model: cfg.model || null, baseUrl: cfg.baseUrl || null };
  try {
    const { runWithAiContext } = require('./ai-context');
    const ai = require('./ai-service');
    if (!cfg.isByo && !ai.isConfigured()) {
      return { ok: false, message: 'No AI provider is available — set your own key, or configure the platform default.', detail };
    }
    const reply = await withTimeout(
      runWithAiContext(Object.assign({ userId: userId || null }, cfg), () => ai.testConnection()),
      NET_TIMEOUT_MS, 'AI request');
    detail.reply = String(reply || '').slice(0, 200);
    return { ok: true, message: `Provider "${cfg.provider}" responded successfully.`, detail };
  } catch (err) {
    detail.error = err.message;
    return { ok: false, message: `AI check failed (${cfg.provider}): ${err.message}`, detail };
  }
}

// ── Logging (24h rolling retention) ────────────────────────────────────────
function purgeOldChecks() {
  try { run("DELETE FROM org_setting_checks WHERE created_at < datetime('now','-24 hours')"); }
  catch (e) { /* non-fatal */ }
}

/** Persist a check result and, when it passed, stamp the "last valid check". */
function recordResult(orgId, feature, result, { kind = 'validate', user = null } = {}) {
  if (!orgId || !FEATURES.includes(feature)) return result;
  try {
    run(`INSERT INTO org_setting_checks (organization_id, feature, kind, ok, message, detail, checked_by)
         VALUES (?,?,?,?,?,?,?)`,
      [orgId, feature, kind, result.ok ? 1 : 0, result.message || '',
       result.detail ? JSON.stringify(result.detail) : null, (user && (user.name || user.email)) || null]);
    if (result.ok) {
      const col = VERIFIED_COLUMN[feature];
      run(`UPDATE org_settings SET ${col}=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE organization_id=?`, [orgId]);
    }
    purgeOldChecks();
  } catch (e) { /* logging is never fatal to the check itself */ }
  return result;
}

/** Run a feature's validation and log it in one step. */
async function runCheck(feature, { orgId, expectedHost, user, kind = 'validate' } = {}) {
  let result;
  switch (feature) {
    case 'domain': result = await checkDomain(orgId, expectedHost); break;
    case 'smtp':   result = await checkSmtp(orgId); break;
    case 'sms':    result = await checkSms(orgId); break;
    case 'ai':     result = await checkAi(orgId, user && user.id); break;
    default:       result = { ok: false, message: `Unknown integration: ${feature}`, detail: null };
  }
  return recordResult(orgId, feature, result, { kind, user });
}

/** Last 24h of check history for one feature (newest first). */
function history(orgId, feature, limit = 25) {
  if (!orgId) return [];
  purgeOldChecks();
  return all(`SELECT feature, kind, ok, message, checked_by, created_at
              FROM org_setting_checks
              WHERE organization_id = ? AND feature = ? AND created_at >= datetime('now','-24 hours')
              ORDER BY id DESC LIMIT ?`, [orgId, feature, limit]);
}

/** Last 24h of history for every feature, keyed by feature name. */
function historyAll(orgId) {
  const out = {};
  FEATURES.forEach(f => { out[f] = history(orgId, f); });
  return out;
}

module.exports = {
  FEATURES, VERIFIED_COLUMN, domainVerificationToken,
  checkDomain, checkSmtp, checkSms, checkAi,
  runCheck, recordResult, history, historyAll, purgeOldChecks
};
