/**
 * Lightweight, request-independent translator for outbound email copy.
 *
 * Emails are sent from background/async paths that have no `req`, so we can't
 * rely on i18next's request middleware. This loads the locale JSON directly and
 * interpolates {{placeholders}} — deterministic and independent of i18next init
 * state. Missing keys fall back to English, then to the key itself.
 *
 * Two flavours per language:
 *   t(key, opts)  — HTML body context: interpolated values are HTML-escaped
 *                   (templates may contain <strong>/<code>, which stay literal).
 *   tp(key, opts) — plain-text context (subjects, and labels the email layout
 *                   escapes itself): values are inserted verbatim.
 */
const fs = require('fs');
const path = require('path');
const { SUPPORTED_LANGS, DEFAULT_LANG } = require('../config/i18n');

const _cache = {};
function dict(lng) {
  if (_cache[lng]) return _cache[lng];
  try { _cache[lng] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${lng}.json`), 'utf8')); }
  catch (e) { _cache[lng] = {}; }
  return _cache[lng];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

function interp(str, opts, doEsc) {
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    const v = (opts && opts[k] != null) ? opts[k] : '';
    return doEsc ? esc(v) : String(v);
  });
}

/** Normalize any language hint to a supported code, else the default. */
function normalizeLang(lng) {
  if (!lng) return DEFAULT_LANG;
  const base = String(lng).toLowerCase().split('-')[0];
  return SUPPORTED_LANGS.includes(base) ? base : DEFAULT_LANG;
}

/** Build the { t, tp, lang } translator bundle for a language. */
function emailT(lng) {
  const L = normalizeLang(lng);
  const d = dict(L), en = dict(DEFAULT_LANG);
  const lookup = k => (d[k] != null ? d[k] : (en[k] != null ? en[k] : k));
  return {
    lang: L,
    t: (k, opts) => interp(lookup(k), opts, true),
    tp: (k, opts) => interp(lookup(k), opts, false)
  };
}

module.exports = { emailT, normalizeLang, SUPPORTED_LANGS, DEFAULT_LANG };
