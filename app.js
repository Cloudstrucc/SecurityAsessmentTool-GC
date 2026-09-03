// Load environment config. APP_ENV selects a per-environment file:
//   APP_ENV=local -> .env.local, dev -> .env.dev, qa -> .env.qa
//   (unset)       -> .env  (production / default)
// On Azure, App Service settings are already in process.env and take precedence
// (dotenv never overrides existing vars), so a missing file is harmless.
const APP_ENV = process.env.APP_ENV;
require('dotenv').config({ path: APP_ENV ? `${__dirname}/.env.${APP_ENV}` : `${__dirname}/.env` });
const express = require('express');
const { engine } = require('express-handlebars');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');

const { initDatabase } = require('./models/database');
const { passport, initializePassport } = require('./config/passport');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const apiRoutes = require('./routes/api');
const billingRoutes = require('./routes/billing');
const orgAdminRoutes = require('./routes/org-admin');
const reportRoutes = require('./routes/reports');
const emailService = require('./utils/emailService');
const { UPLOAD_DIR, ensureUploadDirs } = require('./config/storage');
const { initI18n, i18nMiddleware, i18nLocals, DEFAULT_LANG } = require('./config/i18n');

const app = express();
const PORT = process.env.PORT || 3000;

// File upload config
ensureUploadDirs();
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024 }
});
app.locals.upload = upload;

async function initialize() {
  try {
    await initDatabase();
    console.log('Database initialized');
    // Fold any legacy ato_records into decision_packages (idempotent, one-time).
    try {
      const migrated = require('./config/decision-packages').migrateLegacyAtoRecords();
      if (migrated > 0) console.log(`Migration: moved ${migrated} legacy ATO record(s) into decision packages`);
    } catch (e) { console.error('Decision package migration skipped:', e.message); }
    await initI18n();
    console.log('i18n initialized');
    emailService.initialize();

    // Mention emails are batched: a sweeper sends one digest per user per record
    // once the window has elapsed. In-app notifications are immediate and do not
    // depend on this. Disabled under test so the suite stays deterministic.
    if (process.env.NODE_ENV !== 'test') {
      const mentions = require('./config/mention-notifications');
      const sweep = () => mentions
        .flushDue({ baseUrl: process.env.PUBLIC_BASE_URL || '' })
        .then(n => { if (n) console.log(`[Notifications] sent ${n} mention digest(s)`); })
        .catch(err => console.error('[Notifications] sweep failed:', err.message));
      // Catch up on anything queued while the app was down, then sweep periodically.
      // A request-triggered sweep (below) covers restarts between intervals, so a
      // digest is never stranded just because the process cycled.
      sweep();
      setInterval(sweep, 5 * 60 * 1000).unref();
      app.locals.sweepMentions = sweep;
    }

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
}

// Handlebars setup
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: function(a, b, options) {
      if (options && options.fn) return a === b ? options.fn(this) : options.inverse(this);
      return a === b;
    },
    neq: function(a, b, options) {
      if (options && options.fn) return a !== b ? options.fn(this) : options.inverse(this);
      return a !== b;
    },
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    or: function() {
      const args = Array.from(arguments);
      const options = args.pop();
      return args.some(Boolean) ? options.fn(this) : options.inverse(this);
    },
    and: function() {
      const args = Array.from(arguments);
      const options = args.pop();
      return args.every(Boolean) ? options.fn(this) : options.inverse(this);
    },
    t: function(key, options) {
      const req = options.data?.root?.req;
      const params = options.hash && Object.keys(options.hash).length ? options.hash : {};
      return req?.t ? req.t(key, params) : key;
    },
    tjs: function(key, options) {
      const req = options.data?.root?.req;
      const params = options.hash && Object.keys(options.hash).length ? options.hash : {};
      const translated = req?.t ? req.t(key, params) : key;
      return JSON.stringify(translated);
    },
    currentLang: function(options) {
      return options.data?.root?.lang || DEFAULT_LANG;
    },
    ifLang: function(lang, options) {
      return (options.data?.root?.lang || DEFAULT_LANG) === lang ? options.fn(this) : options.inverse(this);
    },
    // Maps a decision-package state to its i18n key so states render localized.
    dpStateKey: function(state) {
      const map = {
        'draft': 'dp.stateDraft', 'in-review': 'dp.stateInReview', 'recommended': 'dp.stateRecommended',
        'decided': 'dp.stateDecided', 'issued': 'dp.stateIssued', 'denied': 'dp.stateDenied',
        'expired': 'dp.stateExpired', 'revoked': 'dp.stateRevoked'
      };
      return map[String(state || 'draft')] || 'dp.stateDraft';
    },
    // POA&M item state -> i18n key.
    pmStateKey: function(state) {
      const map = { 'open':'pm.stateOpen', 'in-progress':'pm.stateInProgress',
        'evidence-submitted':'pm.stateEvidenceSubmitted', 'accepted':'pm.stateAccepted',
        'rejected':'pm.stateRejected', 'deferred':'pm.stateDeferred' };
      return map[String(state || 'open')] || 'pm.stateOpen';
    },
    json: obj => JSON.stringify(obj),
    formatDate: function(date) {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    },
    formatDateTime: function(date) {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    currentYear: () => new Date().getFullYear(),
    inc: v => parseInt(v) + 1,
    percentage: (a, b) => b > 0 ? Math.round((a / b) * 100) : 0,
    // Localized status badge. Falls back to the raw status when a key is missing so
    // an unrecognised value still renders something meaningful.
    statusBadge: function(status, options) {
      const req = options && options.data && options.data.root ? options.data.root.req : null;
      const label = (key, fallback) => (req && req.t) ? req.t(key) : fallback;
      const meta = {
        'draft': ['bg-secondary', 'st.draft', 'Draft'],
        'in-progress': ['bg-info', 'st.in-progress', 'In Progress'],
        'evidence-gathering': ['bg-warning text-dark', 'st.evidence-gathering', 'Evidence Gathering'],
        'submitted': ['bg-primary', 'st.submitted', 'Submitted'],
        'under-review': ['bg-info', 'st.under-review', 'Under Review'],
        'audit': ['bg-warning text-dark', 'st.audit', 'Audit'],
        'completed': ['bg-success', 'st.completed', 'Completed'],
        'met': ['bg-success', 'st.met', 'Met'],
        'partially-met': ['bg-warning text-dark', 'st.partially-met', 'Partially Met'],
        'not-met': ['bg-danger', 'st.not-met', 'Not Met'],
        'pending': ['bg-secondary', 'st.pending', 'Pending'],
        'ato': ['bg-success', 'st.ato', 'ATO Granted'],
        'iato': ['bg-warning text-dark', 'st.iato', 'iATO Granted'],
        'open': ['bg-danger', 'st.open', 'Open'],
        'closed': ['bg-success', 'st.closed', 'Closed'],
        'archived': ['bg-dark', 'st.archived', 'Archived']
      };
      const hit = meta[status];
      if (!hit) {
        return `<span class="badge bg-secondary">${status || label('st.unknown', 'Unknown')}</span>`;
      }
      const icon = status === 'archived' ? '<i class="bi bi-archive me-1"></i>' : '';
      return `<span class="badge ${hit[0]}">${icon}${label(hit[1], hit[2])}</span>`;
    },
    controlResultIcon: function(result) {
      const icons = {
        'met': '<i class="bi bi-check-circle-fill text-success"></i>',
        'partially-met': '<i class="bi bi-exclamation-circle-fill text-warning"></i>',
        'not-met': '<i class="bi bi-x-circle-fill text-danger"></i>',
        'pending': '<i class="bi bi-circle text-secondary"></i>'
      };
      return icons[result] || icons['pending'];
    },
    ifCond: function(v1, operator, v2, options) {
      switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
      }
    },
    truncate: function(str, len) {
      if (!str) return '';
      if (str.length <= len) return str;
      return str.substring(0, len) + '...';
    },
    includes: function(str, substr) {
      if (!str || !substr) return false;
      return str.includes(substr);
    }
  }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
// Stripe webhook needs the RAW body for signature verification — must be
// registered before the JSON body parser consumes it.
app.post('/billing/webhook', express.raw({ type: 'application/json' }), billingRoutes.webhookHandler);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 10000 }));
app.use(cookieParser());
// Guard against stale static exports lingering in wwwroot. Old deploys shipped a
// static `sa-tool-overview.html`, and because deploys use `--clean false` that file
// is never removed — so `express.static` below would serve the outdated file (old
// branding) instead of the live route. Intercept the `.html` path BEFORE static and
// hand it to the renderer so the current page always wins.
app.get('/sa-tool-overview.html', (req, res) => res.redirect(302, '/sa-tool-overview'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(i18nMiddleware());
app.use(i18nLocals);

app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  // Set SECURE_COOKIES=true once the app is served exclusively over HTTPS (e.g.
  // behind a custom domain with a managed certificate) so the session cookie is
  // never transmitted in the clear. Left off by default: enabling it while any
  // plain-HTTP origin is still in use would drop sessions. `trust proxy` above
  // lets Express see the real protocol behind Azure's front end.
  cookie: {
    secure: process.env.SECURE_COOKIES === 'true',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

initializePassport();
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  res.locals.currentDate = new Date().toISOString().split('T')[0];
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    warning: req.flash('warning'),
    info: req.flash('info')
  };
  // Breadcrumb for signed-in /admin pages: computed at render time (so the page
  // title is available for the leaf) and exposed as a plain local {{{breadcrumbHtml}}}.
  if (req.user) {    const origRender = res.render.bind(res);
    res.render = function(view, locals, cb) {
      if (typeof locals === 'function') { cb = locals; locals = {}; }
      locals = locals || {};
      try { locals.breadcrumbHtml = require('./config/breadcrumb').render(req, locals.title); }
      catch (e) { locals.breadcrumbHtml = ''; }      return origRender(view, locals, cb);
    };
  }
  // Passport user (admin/assessor)
  res.locals.user = req.user;
  // AI availability (for the licensing banner). Computed for signed-in users only.
  if (req.user) {
    try {
      const access = require('./config/access');
      res.locals.aiStatus = access.aiStatus(req.user);
      // Practitioners (invited members/collaborators) get a slimmed, scoped UI.
      res.locals.isPractitioner = !access.isAdmin(req.user);
      res.locals.isRootAdmin = access.isRootAdmin(req.user);
      // Org owners/admins manage their own workspace console (settings, licensing).
      res.locals.canManageOrg = access.isAdmin(req.user) && !!(req.user.organization_id || req.user.is_root_admin);
      // Dockable-menu preference (the user's saved default). Applied server-side so
      // the menu renders in place with no flash; a session override may change it client-side.
      const navPos = ['top', 'left', 'right'].includes(req.user.nav_position) ? req.user.nav_position : 'top';
      res.locals.navPosition = navPos;
      res.locals.navPinned = req.user.nav_pinned == null ? 1 : Number(req.user.nav_pinned);
      // Compact-nav label mode + record action-toolbar label mode (per-user saved defaults).
      res.locals.navLabels = ['auto', 'icons', 'text'].includes(req.user.nav_labels) ? req.user.nav_labels : 'auto';
      res.locals.actionLabels = ['icons', 'text'].includes(req.user.action_labels) ? req.user.action_labels : 'icons';
      const { get: dbGet } = require('./models/database');
      res.locals.unreadNotifications = dbGet('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id])?.c || 0;
    } catch (e) { res.locals.aiStatus = null; }
  }
  // Client session user (for intake portal)
  if (!req.user && req.session && req.session.clientId) {
    try {
      const { get: dbGet } = require('./models/database');
      const clientUser = dbGet('SELECT id, email, name, role, organization FROM users WHERE id = ?', [req.session.clientId]);
      if (clientUser) {
        res.locals.user = clientUser;
        req.clientUser = clientUser;
      }
    } catch (e) { /* db not ready yet */ }
  }
  // Where the brand/logo links point: signed-in users go to their dashboard, not the
  // marketing home. Assessors/admins/practitioners -> /admin/dashboard (role-branched);
  // client/evidence users -> the Client Portal; anonymous -> marketing home.
  res.locals.homeHref = req.user ? '/admin/dashboard' : (req.session && req.session.clientId ? '/portal' : '/');
  next();
});

// Bind the tenant's context to this request: the AI provider (own LLM/MCP or the
// OOB default, with token metering) and the organization id, which also lets the
// email service route every message through the tenant's own SMTP server.
app.use((req, res, next) => {
  let ctx = {};
  try {
    const uid = req.user ? req.user.id : (req.session && req.session.clientId);
    const orgId = req.user ? req.user.organization_id : null;
    if (orgId) ctx = Object.assign({ userId: uid, orgId }, require('./config/org-settings').aiConfig(orgId));
    else if (uid) ctx = { userId: uid, orgId: null, provider: 'oob', isByo: false };
  } catch (e) { /* db not ready */ }
  require('./config/ai-context').runWithAiContext(ctx, next);
});

// Opportunistic mention-digest flush. The interval timer only runs while the
// process is alive; this makes ordinary traffic a second trigger, throttled so it
// costs nothing per request.
let lastSweepAt = 0;
app.use((req, res, next) => {
  const sweep = app.locals.sweepMentions;
  if (sweep && Date.now() - lastSweepAt > 5 * 60 * 1000) {
    lastSweepAt = Date.now();
    setImmediate(sweep);
  }
  next();
});

// Routes
app.use('/', billingRoutes.router);
app.use('/', publicRoutes);
app.use('/admin', orgAdminRoutes);
app.use('/admin/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Page Not Found', message: 'The page you are looking for does not exist.', showAccessForm: true });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
    showAccessForm: false
  });
});

// Start
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Aegis SA Platform — Vanguard Cloud Services                ║
║   Multi-framework security assessment workflows              ║
║                                                              ║
║   Server:       http://localhost:${PORT}                       ║
║   Admin Login:  http://localhost:${PORT}/admin/login            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}).catch(err => { console.error('Failed to start:', err); process.exit(1); });

module.exports = app;
