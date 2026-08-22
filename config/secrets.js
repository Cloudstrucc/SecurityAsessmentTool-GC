/**
 * Encryption at rest for tenant-held secrets (SMTP passwords, SMS tokens, AI API
 * keys, MCP tokens).
 *
 * These are other people's credentials. Storing them in plain columns means anyone
 * with a copy of the database file — a backup, a support dump, a stolen disk — has
 * every tenant's mail and provider credentials.
 *
 * Values are encrypted with AES-256-GCM under a key derived from SECRET_KEY (or
 * SESSION_SECRET as a fallback) and stored as `enc:v1:<iv>:<tag>:<ciphertext>`.
 * Decryption is transparent and backwards compatible: a value that is not tagged
 * `enc:v1:` is returned as-is, so existing plaintext keeps working and is upgraded
 * the next time it is saved.
 */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function keyMaterial() {
  return process.env.SECRET_KEY || process.env.SESSION_SECRET || '';
}

/** Encryption is only active when a key is configured — never silently half-on. */
function isEnabled() {
  return keyMaterial().length >= 8;
}

function derivedKey() {
  // Deterministic 32-byte key from the configured secret.
  return crypto.createHash('sha256').update(String(keyMaterial())).digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Encrypt a secret for storage. Returns the input unchanged when disabled/empty. */
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  if (!isEnabled() || isEncrypted(plain)) return plain;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, derivedKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return PREFIX + iv.toString('base64') + ':' + cipher.getAuthTag().toString('base64') +
      ':' + enc.toString('base64');
  } catch (e) {
    // Never lose a secret because encryption failed — store it as it was.
    return plain;
  }
}

/** Decrypt a stored secret. Plaintext (pre-encryption) values pass straight through. */
function decrypt(stored) {
  if (!isEncrypted(stored)) return stored;
  try {
    const [, , ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv(ALGO, derivedKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    // Wrong key or tampered value: surface null rather than a corrupt credential.
    return null;
  }
}

module.exports = { encrypt, decrypt, isEncrypted, isEnabled, PREFIX };
