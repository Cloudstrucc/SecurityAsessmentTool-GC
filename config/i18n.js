// const i18next = require('i18next');
// const i18nextMiddleware = require('i18next-http-middleware');
// const Backend = require('i18next-fs-backend');
// const path = require('path');

// const SUPPORTED_LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
// const DEFAULT_LANG = 'en';
// const langNames = {
//   en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch',
//   pt: 'Português', it: 'Italiano', nl: 'Nederlands', ja: '日本語'
// };

// function initI18n() {
//   return i18next
//     .use(Backend)
//     .use(i18nextMiddleware.LanguageDetector)
//     .init({
//       backend: { loadPath: path.join(__dirname, '../locales/{{lng}}.json') },
//       fallbackLng: DEFAULT_LANG,
//       supportedLngs: SUPPORTED_LANGS,
//       preload: SUPPORTED_LANGS,
//       detection: {
//         order: ['querystring', 'cookie', 'header'],
//         lookupQuerystring: 'lang',
//         lookupCookie: 'lang',
//         caches: ['cookie'],
//         cookieOptions: { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 },
//       },
//       interpolation: { escapeValue: false },
//       returnEmptyString: false,
//       returnNull: false,
//     });
// }

// function i18nMiddleware() { return i18nextMiddleware.handle(i18next); }

// function registerHandlebarsHelpers(hbs) {
//   hbs.handlebars.registerHelper('t', function (...args) {
//     const options = args.pop();
//     const key = args[0];
//     const interp = args[1] && typeof args[1] === 'object' && !args[1].name ? args[1] : {};
//     const req = options.data?.root?.req;
//     return req?.t ? req.t(key, interp) : key;
//   });
//   hbs.handlebars.registerHelper('currentLang', function (options) {
//     return options.data?.root?.lang || DEFAULT_LANG;
//   });
//   hbs.handlebars.registerHelper('ifLang', function (lang, options) {
//     return (options.data?.root?.lang || DEFAULT_LANG) === lang ? options.fn(this) : options.inverse(this);
//   });
// }

// function i18nLocals(req, res, next) {
//   res.locals.lang = req.language || DEFAULT_LANG;
//   res.locals.req = req;
//   res.locals.supportedLangs = SUPPORTED_LANGS.map(code => ({
//     code, name: langNames[code], short: code.toUpperCase(),
//     active: code === (req.language || DEFAULT_LANG)
//   }));
//   next();
// }

// module.exports = { initI18n, i18nMiddleware, i18nLocals, registerHandlebarsHelpers, SUPPORTED_LANGS, DEFAULT_LANG, langNames };
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
    });
}
function i18nMiddleware() { return i18nextMiddleware.handle(i18next); }
function registerHandlebarsHelpers(hbs) {
  // {{t 'key'}} or {{t 'key' email=someVar}} — translates with optional hash params
  hbs.handlebars.registerHelper('t', function (...args) {
    const options = args.pop();
    const key = args[0];
    // Hash params from {{t 'key' email=requestEmail}} come via options.hash
    const interp = (options.hash && Object.keys(options.hash).length) ? options.hash : {};
    const req = options.data?.root?.req;
    return req?.t ? req.t(key, interp) : key;
  });
  hbs.handlebars.registerHelper('currentLang', function (options) {
    return options.data?.root?.lang || DEFAULT_LANG;
  });
  hbs.handlebars.registerHelper('ifLang', function (lang, options) {
    return (options.data?.root?.lang || DEFAULT_LANG) === lang ? options.fn(this) : options.inverse(this);
  });
}
function i18nLocals(req, res, next) {
  res.locals.lang = req.language || DEFAULT_LANG;
  res.locals.req = req;
  res.locals.supportedLangs = SUPPORTED_LANGS.map(code => ({
    code, name: langNames[code], short: code.toUpperCase(),
    active: code === (req.language || DEFAULT_LANG)
  }));
  next();
}
module.exports = { initI18n, i18nMiddleware, i18nLocals, registerHandlebarsHelpers, SUPPORTED_LANGS, DEFAULT_LANG, langNames };