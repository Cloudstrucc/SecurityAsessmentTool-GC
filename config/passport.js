const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const { get } = require('../models/database');

function initializePassport() {
  passport.use(new LocalStrategy(
    { usernameField: 'email' },
    (email, password, done) => {
      try {
        const user = get('SELECT * FROM users WHERE email = ? AND is_active = 1', [(email || '').toLowerCase().trim()]);
        if (!user) return done(null, false, { message: 'Invalid credentials' });
        if (!bcrypt.compareSync(password, user.password)) return done(null, false, { message: 'Invalid credentials' });
        
        const { run } = require('../models/database');
        run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    try {
      const user = get(`SELECT id, email, name, role, title, organization, is_break_glass,
        organization_id, account_type, is_licensed, is_root_admin, must_reenroll_mfa
        FROM users WHERE id = ?`, [id]);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    if (req.user?.role === 'client' || req.user?.is_break_glass || req.session?.adminMfaVerified) return next();
    const user = get('SELECT mfa_enabled, totp_secret, webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
    // Passkey users are already strongly authenticated — no second factor needed.
    if (user?.webauthn_credential_id) { req.session.adminMfaVerified = true; return next(); }
    // MFA is OPTIONAL. Only enforce it for users who have chosen to enable TOTP.
    if (user?.mfa_enabled && user?.totp_secret) {
      req.flash('error', 'Please complete MFA verification.');
      return res.redirect('/admin/login');
    }
    req.session.adminMfaVerified = true; // no MFA configured → nothing to verify
    return next();
  }
  req.flash('error', 'Please log in to access the admin area');
  res.redirect('/admin/login');
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (req.isAuthenticated() && roles.includes(req.user.role)) return next();
    req.flash('error', 'Insufficient permissions');
    res.redirect('/admin/dashboard');
  };
}

module.exports = { passport, initializePassport, ensureAuthenticated, ensureRole };
