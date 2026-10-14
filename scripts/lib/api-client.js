/**
 * Minimal HTTP client for driving the app the way a signed-in person would.
 *
 * Why HTTP rather than writing to the database: the app holds the whole SQLite
 * file in memory (sql.js) and rewrites it on every save, so an external process
 * that edits the same file has its changes silently overwritten by the next
 * request the app serves. Going through the app's own endpoints has no such race
 * and cannot create states the app itself would refuse.
 *
 *   const api = new ApiClient({ baseUrl, email, password, totpSecret });
 *   await api.loginAdmin();
 *   const { text } = await api.getText('/admin/projects');
 */
const otplib = require('otplib');

/** Cookie storage across requests. Session cookie only — nothing is persisted. */
class CookieJar {
  constructor() { this.cookies = new Map(); }

  store(response) {
    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    setCookies.forEach(cookie => {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    });
  }

  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/**
 * Encode a form body. Accepts a plain object, or an array of [key, value] pairs
 * when a key must repeat — which the tailoring form needs, because it posts one
 * `offered_ids` per control. `new URLSearchParams({a:[1,2]})` would flatten
 * those into the single string "1,2", which is not what the server parses.
 */
function encodeForm(form) {
  const params = new URLSearchParams();
  const pairs = Array.isArray(form) ? form : Object.entries(form);
  pairs.forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(item => params.append(k, item));
    else params.append(k, v);
  });
  return params.toString();
}

/** otplib's sync generator moved around between majors; find whichever exists. */
function totp(secret) {
  if (typeof otplib.generateSync === 'function') return otplib.generateSync({ secret });
  if (otplib.authenticator && typeof otplib.authenticator.generate === 'function') {
    return otplib.authenticator.generate(secret);
  }
  throw new Error('Could not find a synchronous TOTP generator in otplib.');
}

class ApiClient {
  constructor({ baseUrl, email, password, totpSecret, verbose = false } = {}) {
    if (!baseUrl) throw new Error('baseUrl is required (e.g. https://vanguard-saa-dev.azurewebsites.net)');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.email = email;
    this.password = password;
    this.totpSecret = totpSecret;
    this.verbose = verbose;
    this.jar = new CookieJar();
  }

  log(...args) { if (this.verbose) console.error('  ·', ...args); }

  async request(method, url, { form, json, body: rawBody, headers: extraHeaders, redirect = 'manual' } = {}) {
    const headers = { ...(extraHeaders || {}) };
    let body;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = encodeForm(form); }
    if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (rawBody !== undefined) body = rawBody;
    const cookie = this.jar.header();
    if (cookie) headers.cookie = cookie;

    const response = await fetch(this.baseUrl + url, { method, headers, body, redirect });
    this.jar.store(response);
    this.log(method, url, '->', response.status);
    return response;
  }

  async getText(url) {
    const response = await this.request('GET', url, { redirect: 'follow' });
    return { response, text: await response.text() };
  }

  async postJson(url, payload) {
    const response = await this.request('POST', url, { json: payload });
    let data = null;
    try { data = await response.json(); } catch (e) { /* not json */ }
    return { response, data };
  }

  /** Is the app up? Also a cheap way to confirm the base URL is right. */
  async health() {
    const r = await fetch(this.baseUrl + '/health');
    if (!r.ok) throw new Error(`${this.baseUrl}/health returned ${r.status}`);
    return r.json();
  }

  /**
   * Sign in as an assessor. Handles both shapes: MFA on (password, then TOTP)
   * and MFA off (password alone redirects straight to the dashboard), so the
   * same script works against environments configured either way.
   */
  async loginAdmin() { return this._login('/admin/login', '/admin/login', '/admin/dashboard'); }

  /** Sign in as an evidence provider / client. */
  async loginClient() { return this._login('/client/login', '/client/login/mfa', '/portal'); }

  async _login(loginPath, mfaPath, expectPrefix) {
    if (!this.email || !this.password) throw new Error('email and password are required to sign in');

    const step1 = await this.request('POST', loginPath, {
      form: { email: this.email, password: this.password }
    });

    // MFA off: a 302 straight out of step 1 means we are already in.
    if (step1.status === 302) {
      const to = step1.headers.get('location') || '';
      if (to.startsWith(expectPrefix) || to.startsWith('/admin') || to.startsWith('/portal')) {
        this.log('signed in (no MFA step)');
        return this;
      }
      throw new Error(`Sign-in redirected to ${to} — check the email and password.`);
    }

    const text = await step1.text();
    if (!/Authentication Code|Verify MFA|code d'authentification/i.test(text)) {
      throw new Error('Sign-in failed — the password was not accepted.');
    }
    if (!this.totpSecret) {
      throw new Error('This account has MFA enabled, so --totp-secret (or $AEGIS_TOTP) is required.');
    }

    const form = loginPath === '/admin/login'
      ? { _mfa_step: '1', token: totp(this.totpSecret) }
      : { token: totp(this.totpSecret) };
    const step2 = await this.request('POST', mfaPath, { form });
    if (step2.status !== 302) throw new Error('MFA step failed — check the TOTP secret.');
    this.log('signed in (MFA)');
    return this;
  }
}

/** Build a client from CLI args and environment, so every script is consistent. */
function clientFromArgs(args = {}) {
  const baseUrl = args['base-url'] || process.env.AEGIS_BASE_URL;
  if (!baseUrl || baseUrl === true) {
    throw new Error('Missing --base-url (or $AEGIS_BASE_URL), e.g. https://vanguard-saa-dev.azurewebsites.net');
  }
  return new ApiClient({
    baseUrl,
    email: args.email || process.env.AEGIS_EMAIL,
    password: args.password || process.env.AEGIS_PASSWORD,
    totpSecret: args['totp-secret'] || process.env.AEGIS_TOTP,
    verbose: !!args.verbose
  });
}

/** Shared `--flag value` parser, matching manage-users.js / manage-org.js. */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i++; }
  }
  return args;
}

module.exports = { ApiClient, CookieJar, encodeForm, clientFromArgs, parseArgs, totp };
