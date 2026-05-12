const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const Backend = require('i18next-fs-backend');
const path = require('path');

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
const DEFAULT_LANG = 'en';
const langNames = {
  en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch',
  pt: 'Português', it: 'Italiano', nl: 'Nederlands', ja: '日本語'
};

function languageUrl(req, code) {
  const url = new URL(req.originalUrl || '/', 'http://local');
  url.searchParams.set('lang', code);
  return `${url.pathname}${url.search}`;
}

function initI18n() {
  return i18next
    .use(Backend)
    .use(i18nextMiddleware.LanguageDetector)
    .init({
      backend: { loadPath: path.join(__dirname, '../locales/{{lng}}.json') },
      fallbackLng: DEFAULT_LANG,
      supportedLngs: SUPPORTED_LANGS,
      preload: SUPPORTED_LANGS,
      detection: {
        order: ['querystring', 'cookie', 'header'],
        lookupQuerystring: 'lang',
        lookupCookie: 'lang',
        caches: ['cookie'],
        cookieOptions: { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 },
      },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      returnNull: false,
      showSupportNotice: false,
    });
}
function i18nMiddleware() { return i18nextMiddleware.handle(i18next); }
function i18nLocals(req, res, next) {
  res.locals.lang = req.language || DEFAULT_LANG;
  res.locals.req = req;
  res.locals.supportedLangs = SUPPORTED_LANGS.map(code => ({
    code, name: langNames[code], short: code.toUpperCase(),
    active: code === (req.language || DEFAULT_LANG),
    url: languageUrl(req, code)
  }));
  next();
}

module.exports = { initI18n, i18nMiddleware, i18nLocals, SUPPORTED_LANGS, DEFAULT_LANG, langNames };
