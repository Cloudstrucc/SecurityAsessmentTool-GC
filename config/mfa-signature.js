const crypto = require('crypto');
const { get, run } = require('../models/database');
const { verifySync } = require('otplib');

const sigTokens = new Map();
const challenges = new Map();
const TOKEN_TTL_MS = 2 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of sigTokens) {
    if (now - data.createdAt > TOKEN_TTL_MS) sigTokens.delete(token);
  }
  for (const [userId, data] of challenges) {
    if (now - data.createdAt > TOKEN_TTL_MS) challenges.delete(userId);
  }
}, 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sigTokens.set(token, { userId, createdAt: Date.now() });
  return token;
}

function consumeToken(token) {
  const data = sigTokens.get(token);
  if (!data) return null;
  sigTokens.delete(token);
  if (Date.now() - data.createdAt > TOKEN_TTL_MS) return null;
  return data.userId;
}

function verifyMfaAndIssueToken(userId, token) {
  const user = get('SELECT id, totp_secret, mfa_enabled FROM users WHERE id = ?', [userId]);
  if (!user?.mfa_enabled || !user?.totp_secret) return { valid: false, error: 'TOTP is not configured.' };
  const valid = verifySync({ secret: user.totp_secret, token, window: 1 }).valid;
  if (!valid) return { valid: false, error: 'Invalid authentication code.' };
  return { valid: true, token: issueToken(user.id) };
}

function storeChallenge(userId, challenge) {
  challenges.set(parseInt(userId), { challenge, createdAt: Date.now() });
}

function getChallenge(userId) {
  const key = parseInt(userId);
  const data = challenges.get(key);
  if (!data) return null;
  challenges.delete(key);
  if (Date.now() - data.createdAt > TOKEN_TTL_MS) return null;
  return data.challenge;
}

function getUserMfaMode(userId) {
  const user = get('SELECT mfa_mode FROM users WHERE id = ?', [userId]);
  return user?.mfa_mode || 'totp';
}

function userHasWebAuthn(userId) {
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
  return !!user?.webauthn_credential_id;
}

function logSignature({ userId, userEmail, userName, userRole, action, actionLabel, entityType, entityId, entityName, details, ipAddress, userAgent, mfaMethod }) {
  try {
    run(
      `INSERT INTO audit_signatures (user_id, user_email, user_name, user_role, action, action_label, entity_type, entity_id, entity_name, details, ip_address, user_agent, mfa_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, userEmail, userName || '', userRole || '', action, actionLabel || '', entityType || '', entityId || null, entityName || '', details || '', ipAddress || '', userAgent || '', mfaMethod || 'totp']
    );
  } catch (err) {
    // Older databases may not have audit_signatures; MFA must still work.
  }
}

module.exports = {
  issueToken,
  consumeToken,
  verifyMfaAndIssueToken,
  storeChallenge,
  getChallenge,
  getUserMfaMode,
  userHasWebAuthn,
  logSignature
};
