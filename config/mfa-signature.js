/**
 * MFA Signature Middleware — v8.5.1
 * 
 * Three MFA modes for state-changing actions (configurable per user in Settings):
 *   'totp'  — Enter 6-digit TOTP code from authenticator app
 *   'push'  — Approve with biometric (Face ID / Touch ID / Windows Hello) via WebAuthn
 *   'none'  — No MFA challenge for state changes (login still requires MFA)
 *
 * Login ALWAYS requires MFA (TOTP or passkey) regardless of mfa_mode setting.
 */

const { get, run } = require('../models/database');
const { verifySync } = require('otplib');
const crypto = require('crypto');

// ── Token store (in-memory, short-lived) ────────────────────────────────────
const sigTokens = new Map();
const TOKEN_TTL_MS = 120_000;
setInterval(() => { const now = Date.now(); for (const [t, d] of sigTokens) { if (now - d.createdAt > TOKEN_TTL_MS) sigTokens.delete(t); } }, 60_000);

// ── WebAuthn challenge store ────────────────────────────────────────────────
const webauthnChallenges = new Map();
const CHALLENGE_TTL_MS = 120_000;
setInterval(() => { const now = Date.now(); for (const [u, d] of webauthnChallenges) { if (now - d.createdAt > CHALLENGE_TTL_MS) webauthnChallenges.delete(u); } }, 60_000);

function storeChallenge(userId, challenge) { webauthnChallenges.set(userId, { challenge, createdAt: Date.now() }); }
function getChallenge(userId) {
  const data = webauthnChallenges.get(userId);
  if (!data) return null;
  webauthnChallenges.delete(userId);
  if (Date.now() - data.createdAt > CHALLENGE_TTL_MS) return null;
  return data.challenge;
}

function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sigTokens.set(token, { userId, createdAt: Date.now(), used: false });
  return token;
}

function verifyMfaAndIssueToken(userId, totpCode) {
  const user = get('SELECT id, totp_secret, mfa_enabled FROM users WHERE id = ?', [userId]);
  if (!user) return { valid: false, error: 'User not found' };
  if (!user.mfa_enabled || !user.totp_secret) return { valid: false, error: 'MFA not configured' };
  const isValid = verifySync({ secret: user.totp_secret, token: totpCode, window: 1 }).valid;
  if (!isValid) return { valid: false, error: 'Invalid authentication code' };
  return { valid: true, token: issueToken(user.id) };
}

function consumeToken(token) {
  if (!token) return null;
  const data = sigTokens.get(token);
  if (!data || data.used) return null;
  if (Date.now() - data.createdAt > TOKEN_TTL_MS) { sigTokens.delete(token); return null; }
  data.used = true; sigTokens.delete(token);
  return data.userId;
}

function logSignature({ userId, userEmail, userName, userRole, action, actionLabel, entityType, entityId, entityName, details, ipAddress, userAgent, mfaMethod }) {
  try {
    run(`INSERT INTO audit_signatures (user_id, user_email, user_name, user_role, action, action_label, entity_type, entity_id, entity_name, details, ip_address, user_agent, mfa_method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, userEmail, userName || '', userRole, action, actionLabel || '', entityType || '', entityId || null, entityName || '', details || '', ipAddress || '', userAgent || '', mfaMethod || 'totp']);
  } catch (err) { console.error('[Audit] Failed to log signature:', err.message); }
}

function getUserMfaMode(userId) {
  const user = get('SELECT mfa_mode FROM users WHERE id = ?', [userId]);
  return user?.mfa_mode || 'totp';
}

function requireSignature(action, actionLabel, entityType) {
  return (req, res, next) => {
    let userId, userEmail, userName, userRole;
    if (req.user) { userId = req.user.id; userEmail = req.user.email; userName = req.user.name; userRole = req.user.role || 'assessor'; }
    else if (req.session?.clientId) {
      const client = get('SELECT id, email, name FROM users WHERE id = ?', [req.session.clientId]);
      if (!client) { if (req.xhr || req.headers.accept?.includes('json')) return res.status(403).json({ error: 'Session expired.' }); req.flash('error', 'Session expired.'); return res.redirect('back'); }
      userId = client.id; userEmail = client.email; userName = client.name; userRole = 'client';
    } else { if (req.xhr || req.headers.accept?.includes('json')) return res.status(401).json({ error: 'Authentication required' }); req.flash('error', 'Please log in first.'); return res.redirect('/admin/login'); }

    const mfaMode = getUserMfaMode(userId);
    const entityId = req.params.id || req.params.itemId || req.params.projectId || null;

    if (mfaMode === 'none') {
      logSignature({ userId, userEmail, userName, userRole, action, actionLabel, entityType, entityId: entityId ? parseInt(entityId) : null, entityName: req.body._entity_name || '', ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] || '').substring(0, 200), mfaMethod: 'none' });
      req.signature = { userId, userEmail, userName, userRole, action, mfaMethod: 'none' }; return next();
    }

    const sigToken = req.body._sig_token;
    if (!sigToken) {
      if (req.xhr || req.headers.accept?.includes('json')) return res.status(403).json({ error: 'MFA signature required', mfa_required: true, mfa_mode: mfaMode, action, action_label: actionLabel });
      req.flash('error', 'This action requires MFA verification.'); return res.redirect('back');
    }
    const tokenUserId = consumeToken(sigToken);
    if (!tokenUserId || tokenUserId !== userId) {
      if (req.xhr || req.headers.accept?.includes('json')) return res.status(403).json({ error: 'Invalid or expired signature.', mfa_required: true, mfa_mode: mfaMode });
      req.flash('error', 'Signature expired.'); return res.redirect('back');
    }
    logSignature({ userId, userEmail, userName, userRole, action, actionLabel, entityType, entityId: entityId ? parseInt(entityId) : null, entityName: req.body._entity_name || '', ipAddress: req.ip || '', userAgent: (req.headers['user-agent'] || '').substring(0, 200), mfaMethod: mfaMode });
    req.signature = { userId, userEmail, userName, userRole, action, mfaMethod: mfaMode }; next();
  };
}

function userHasMfa(userId) { const u = get('SELECT mfa_enabled FROM users WHERE id = ?', [userId]); return u && u.mfa_enabled === 1; }
function userHasWebAuthn(userId) { const u = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]); return u && !!u.webauthn_credential_id; }

module.exports = { verifyMfaAndIssueToken, issueToken, consumeToken, logSignature, requireSignature, userHasMfa, userHasWebAuthn, getUserMfaMode, storeChallenge, getChallenge };
