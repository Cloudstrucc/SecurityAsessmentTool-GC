require('dotenv').config();
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
const emailService = require('./utils/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// File upload config
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024 }
});
app.locals.upload = upload;

async function initialize() {
  try {
    await initDatabase();
    console.log('Database initialized');
    emailService.initialize();
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
    statusBadge: function(status) {
      const badges = {
        'draft': '<span class="badge bg-secondary">Draft</span>',
        'in-progress': '<span class="badge bg-info">In Progress</span>',
        'evidence-gathering': '<span class="badge bg-warning text-dark">Evidence Gathering</span>',
        'submitted': '<span class="badge bg-primary">Submitted</span>',
        'under-review': '<span class="badge bg-info">Under Review</span>',
        'audit': '<span class="badge bg-warning text-dark">Audit</span>',
        'completed': '<span class="badge bg-success">Completed</span>',
        'met': '<span class="badge bg-success">Met</span>',
        'partially-met': '<span class="badge bg-warning text-dark">Partially Met</span>',
        'not-met': '<span class="badge bg-danger">Not Met</span>',
        'pending': '<span class="badge bg-secondary">Pending</span>',
        'ato': '<span class="badge bg-success">ATO Granted</span>',
        'iato': '<span class="badge bg-warning text-dark">iATO Granted</span>',
        'open': '<span class="badge bg-danger">Open</span>',
        'closed': '<span class="badge bg-success">Closed</span>'
      };
      return badges[status] || `<span class="badge bg-secondary">${status || 'Unknown'}</span>`;
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb', parameterLimit: 10000 }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
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
  // Passport user (admin/assessor)
  res.locals.user = req.user;
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
  next();
});

// Routes
app.use('/', publicRoutes);
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
║   GC Security Assessment & Authorization Tool                ║
║   ITSG-33 / Protected B / PII                               ║
║                                                              ║
║   Server:       http://localhost:${PORT}                       ║
║   Admin Login:  http://localhost:${PORT}/admin/login            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}).catch(err => { console.error('Failed to start:', err); process.exit(1); });

module.exports = app;
