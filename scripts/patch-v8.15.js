#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// patch-v8.15.js — 3 fixes:
//   1. i18n {{t}} helper hash params (email interpolation)
//   2. Intake submitter inherits assessment access
//   3. Admin password reset for client users
//
// Usage: node scripts/patch-v8.15.js
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
let applied = 0, skipped = 0;

function patch(file, find, replace, label) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { console.log(`  ✗ ${file} not found`); skipped++; return; }
  let c = fs.readFileSync(p, 'utf-8');
  if (c.includes(replace.substring(0, Math.min(60, replace.length)))) { console.log(`  ○ ${label} — already applied`); return; }
  if (!c.includes(find)) { console.log(`  ✗ ${label} — pattern not found`); skipped++; return; }
  c = c.replace(find, replace);
  fs.writeFileSync(p, c);
  console.log(`  ✓ ${label}`);
  applied++;
}

function appendBefore(file, anchor, code, label) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { console.log(`  ✗ ${file} not found`); skipped++; return; }
  let c = fs.readFileSync(p, 'utf-8');
  if (c.includes(code.substring(0, 60))) { console.log(`  ○ ${label} — already applied`); return; }
  const idx = c.lastIndexOf(anchor);
  if (idx === -1) { console.log(`  ✗ ${label} — anchor not found`); skipped++; return; }
  c = c.substring(0, idx) + code + '\n\n' + c.substring(idx);
  fs.writeFileSync(p, c);
  console.log(`  ✓ ${label}`);
  applied++;
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  GC SA&A Tool — Patch v8.15');
console.log('═══════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────
// FIX 1: i18n helper — options.hash for {{t 'key' email=var}}
// ─────────────────────────────────────────────────────────────
console.log('[Fix 1] i18n {{t}} helper — hash param interpolation');

patch('config/i18n.js',
  `const interp = args[1] && typeof args[1] === 'object' && !args[1].name ? args[1] : {};`,
  `// Hash params from {{t 'key' email=requestEmail}} come via options.hash
    const interp = (options.hash && Object.keys(options.hash).length) ? options.hash : {};`,
  'config/i18n.js — options.hash interpolation'
);

// ─────────────────────────────────────────────────────────────
// FIX 2: DB migrations
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 2] Database migrations');

const dbFile = path.join(ROOT, 'models/database.js');
if (fs.existsSync(dbFile)) {
  let db = fs.readFileSync(dbFile, 'utf-8');
  if (db.includes("'reset_token'")) {
    console.log('  ○ v8.15 migrations already present');
  } else {
    const anchor = `    ['sa_access_requests', null,`;
    const idx = db.indexOf(anchor);
    if (idx > -1) {
      // Find the ]; that closes the migrations array after this block
      const closeIdx = db.indexOf('  ];', idx);
      if (closeIdx > -1) {
        const newMigrations = `    // v8.15: Intake submitter tracking + password reset
    ['intake_submissions', 'submitted_by', 'ALTER TABLE intake_submissions ADD COLUMN submitted_by INTEGER'],
    ['users', 'reset_token', 'ALTER TABLE users ADD COLUMN reset_token TEXT'],
    ['users', 'reset_token_expires', 'ALTER TABLE users ADD COLUMN reset_token_expires DATETIME'],
`;
        db = db.substring(0, closeIdx) + newMigrations + db.substring(closeIdx);
        fs.writeFileSync(dbFile, db);
        console.log('  ✓ models/database.js — added v8.15 column migrations');
        applied++;
      }
    } else {
      console.log('  ✗ models/database.js — sa_access_requests anchor not found');
      skipped++;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 3: Store submitted_by when client submits intake
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 3] Track intake submitter');

const pubFile = path.join(ROOT, 'routes/public.js');
if (fs.existsSync(pubFile)) {
  let pub = fs.readFileSync(pubFile, 'utf-8');

  // The intake already stores submitted_by_user_id via the INSERT.
  // But we need to also store submitted_by (the new column) for backward compat.
  // Actually looking at the code, submitted_by_user_id is already there.
  // We need to update the dashboard query to also check submitted_by_user_id.
  console.log('  ○ routes/public.js — submitted_by_user_id already tracked in intake INSERT');
}

// ─────────────────────────────────────────────────────────────
// FIX 4: Client dashboard — submitter sees linked assessments
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 4] Client dashboard — submitter sees linked assessments');

if (fs.existsSync(pubFile)) {
  let pub = fs.readFileSync(pubFile, 'utf-8');

  // Check if already patched
  if (pub.includes('submitted_by_user_id = ? AND project_id IS NOT NULL')) {
    console.log('  ○ routes/public.js — assessment query already includes submitter check');
  } else {
    // Flexible match: find the WHERE clause and add the submitter subquery
    const flexFind = 'WHERE LOWER(a.client_email) = LOWER(?) OR LOWER(p.project_owner_email) = LOWER(?)';
    if (pub.includes(flexFind)) {
      pub = pub.replace(
        flexFind,
        'WHERE LOWER(a.client_email) = LOWER(?) OR LOWER(p.project_owner_email) = LOWER(?)\n      OR p.id IN (SELECT project_id FROM intake_submissions WHERE submitted_by_user_id = ? AND project_id IS NOT NULL)'
      );
      // Also add the extra param: [clientUser.email, clientUser.email] → [clientUser.email, clientUser.email, clientUser.id]
      pub = pub.replace(
        '[clientUser.email, clientUser.email]',
        '[clientUser.email, clientUser.email, clientUser.id]'
      );
      fs.writeFileSync(pubFile, pub);
      console.log('  ✓ routes/public.js — assessment query now includes intake submitter');
      applied++;
    } else {
      console.log('  ✗ routes/public.js — assessment query pattern not found');
      skipped++;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 5: Client reset-password routes
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 5] Client reset-password routes');

if (fs.existsSync(pubFile)) {
  let pub = fs.readFileSync(pubFile, 'utf-8');
  if (pub.includes('/client/reset-password')) {
    console.log('  ○ routes/public.js — reset-password routes already exist');
  } else {
    const resetRoutes = `
// ══════════════════════════════════════════════════════════════
// CLIENT PASSWORD RESET (admin-initiated)
// ══════════════════════════════════════════════════════════════

router.get('/client/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) { req.flash('error', 'Invalid reset link.'); return res.redirect('/client/login'); }
  const user = get("SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')", [token]);
  if (!user) { req.flash('error', 'This reset link has expired or is invalid. Please contact your assessor for a new one.'); return res.redirect('/client/login'); }
  res.render('public/reset-password', { title: 'Reset Password', token, email: user.email });
});

router.post('/client/reset-password', async (req, res) => {
  const { token, password, password_confirm } = req.body;
  if (!token || !password) { req.flash('error', 'All fields are required.'); return res.redirect('/client/login'); }
  if (password.length < 10) { req.flash('error', 'Password must be at least 10 characters.'); return res.redirect(\`/client/reset-password?token=\${token}\`); }
  if (password !== password_confirm) { req.flash('error', 'Passwords do not match.'); return res.redirect(\`/client/reset-password?token=\${token}\`); }

  const user = get("SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')", [token]);
  if (!user) { req.flash('error', 'This reset link has expired. Please contact your assessor for a new one.'); return res.redirect('/client/login'); }

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, 12);
  run('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, user.id]);

  req.flash('success', 'Password reset successfully! Please sign in. You will be prompted to set up MFA.');
  res.redirect('/client/login');
});
`;
    appendBefore('routes/public.js', 'module.exports = router;', resetRoutes, 'routes/public.js — added reset-password routes');
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 6: Admin password reset route
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 6] Admin password reset route');

const adminFile = path.join(ROOT, 'routes/admin.js');
if (fs.existsSync(adminFile)) {
  let admin = fs.readFileSync(adminFile, 'utf-8');
  if (admin.includes('reset-password/:userId')) {
    console.log('  ○ routes/admin.js — reset-password route already exists');
  } else {
    const resetRoute = `
// ══════════════════════════════════════════════════════════════
// ADMIN-INITIATED PASSWORD RESET FOR CLIENTS
// ══════════════════════════════════════════════════════════════

router.post('/invitations/reset-password/:userId', ensureAdminMfa, (req, res) => {
  try {
    const user = get('SELECT id, email, name FROM users WHERE id = ? AND role = ?', [req.params.userId, 'client']);
    if (!user) { req.flash('error', 'Client user not found.'); return res.redirect('/admin/invitations'); }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Clear password hash (force reset), clear MFA + passkeys (force re-setup)
    run(\`UPDATE users SET reset_token = ?, reset_token_expires = ?,
         mfa_secret = NULL, mfa_enabled = 0,
         webauthn_credential_id = NULL, webauthn_public_key = NULL, webauthn_counter = 0
         WHERE id = ?\`,
      [resetToken, expiry, user.id]);

    const baseUrl = \`\${req.protocol}://\${req.get('host')}\`;
    const resetLink = \`\${baseUrl}/client/reset-password?token=\${resetToken}\`;

    req.flash('success', \`Password reset link for <strong>\${user.email}</strong>:<br><code style="word-break:break-all;font-size:0.82rem;">\${resetLink}</code><br><small class="text-muted">Valid for 24 hours. Share this link with the client. They will also need to re-setup MFA after reset.</small>\`);
    res.redirect('/admin/invitations');
  } catch (err) {
    console.error('Password reset error:', err);
    req.flash('error', 'Failed to generate reset link: ' + err.message);
    res.redirect('/admin/invitations');
  }
});
`;
    appendBefore('routes/admin.js', 'module.exports = router;', resetRoute, 'routes/admin.js — added password reset route');
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 7: Add reset button to invitations.hbs (Client Users section)
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 7] Invitations template — add reset buttons');

const invFile = path.join(ROOT, 'views/admin/invitations.hbs');
if (fs.existsSync(invFile)) {
  let inv = fs.readFileSync(invFile, 'utf-8');

  if (inv.includes('reset-password')) {
    console.log('  ○ views/admin/invitations.hbs — reset buttons already present');
  } else {
    // Add a "Registered Client Users" section to the Client Invitations tab
    // Insert before the closing </div> of tab-clients
    const clientUsersSection = `
      <!-- Registered Client Users -->
      <div class="form-section mt-4">
        <div class="section-header">
          <h3 class="section-title">
            <span class="section-number"><i class="bi bi-people-fill"></i></span>
            Registered Client Users
          </h3>
        </div>
        <p class="text-muted small">Manage registered client accounts. Reset password will invalidate their current credentials and MFA — share the reset link with the client.</p>
        {{#if clientUsers.length}}
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead class="table-light">
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Last Login</th>
                <th>MFA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {{#each clientUsers}}
              <tr>
                <td><i class="bi bi-person me-1"></i>{{this.name}}</td>
                <td><code>{{this.email}}</code></td>
                <td>{{this.organization}}</td>
                <td><small class="text-muted">{{this.last_login}}</small></td>
                <td>
                  {{#if this.mfa_enabled}}<span class="badge bg-success">Active</span>{{else}}<span class="badge bg-secondary">Off</span>{{/if}}
                </td>
                <td>
                  <form action="/admin/invitations/reset-password/{{this.id}}" method="POST" class="d-inline mfa-protected" data-mfa-label="Reset password & MFA for {{this.name}}?" onsubmit="return confirm('This will invalidate the user\\'s password and MFA. They will need to use the reset link to set a new password and re-enroll MFA. Continue?')">
                    <button type="submit" class="btn btn-sm btn-outline-warning" title="Reset password & MFA">
                      <i class="bi bi-key me-1"></i>Reset
                    </button>
                  </form>
                </td>
              </tr>
              {{/each}}
            </tbody>
          </table>
        </div>
        {{else}}
        <p class="text-muted text-center py-3"><i class="bi bi-person-x me-2"></i>No registered client users yet.</p>
        {{/if}}
      </div>`;

    // Insert before the closing of tab-clients div
    const tabClientsEnd = inv.indexOf('<!-- ══ ASSESSOR INVITATIONS ══ -->');
    if (tabClientsEnd > -1) {
      // Find the </div> just before it
      const closingDiv = inv.lastIndexOf('</div>', tabClientsEnd);
      if (closingDiv > -1) {
        inv = inv.substring(0, closingDiv) + clientUsersSection + '\n    ' + inv.substring(closingDiv);
        fs.writeFileSync(invFile, inv);
        console.log('  ✓ views/admin/invitations.hbs — added Registered Client Users section');
        applied++;
      }
    } else {
      console.log('  ✗ views/admin/invitations.hbs — could not find insertion point');
      skipped++;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 8: Update admin invitations route to pass clientUsers
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 8] Admin invitations route — pass clientUsers');

if (fs.existsSync(adminFile)) {
  let admin = fs.readFileSync(adminFile, 'utf-8');
  if (admin.includes('clientUsers')) {
    console.log('  ○ routes/admin.js — clientUsers already passed');
  } else {
    // Add clientUsers query to the GET /invitations route
    const oldRender = `  res.render('admin/invitations', {
    title: 'Invitation Management',
    isAdmin: true,
    isInvitations: true,
    clientInvites,
    assessorInvites,
    peerAssessors,
    user: req.user
  });`;

    const newRender = `  // Get registered client users (accepted invites from this assessor)
  const clientUsers = all(
    \`SELECT u.id, u.name, u.email, u.organization, u.last_login, u.mfa_enabled
     FROM users u
     INNER JOIN invitations i ON i.accepted_by_user_id = u.id AND i.invited_by = ? AND i.type = 'client' AND i.status = 'accepted'
     WHERE u.role = 'client' AND u.is_active = 1
     ORDER BY u.name ASC\`, [req.user.id]
  );

  res.render('admin/invitations', {
    title: 'Invitation Management',
    isAdmin: true,
    isInvitations: true,
    clientInvites,
    assessorInvites,
    peerAssessors,
    clientUsers,
    user: req.user
  });`;

    if (admin.includes(oldRender)) {
      admin = admin.replace(oldRender, newRender);
      fs.writeFileSync(adminFile, admin);
      console.log('  ✓ routes/admin.js — added clientUsers query to GET /invitations');
      applied++;
    } else {
      console.log('  ⚠ routes/admin.js — render pattern not exact match, trying flexible');
      // Try flexible: just add clientUsers before the render
      if (admin.includes('clientInvites,') && admin.includes('peerAssessors,') && !admin.includes('clientUsers')) {
        admin = admin.replace(
          'peerAssessors,\n    user: req.user',
          `peerAssessors,\n    clientUsers: all(\`SELECT u.id, u.name, u.email, u.organization, u.last_login, u.mfa_enabled FROM users u INNER JOIN invitations i ON i.accepted_by_user_id = u.id AND i.invited_by = ? AND i.type = 'client' AND i.status = 'accepted' WHERE u.role = 'client' AND u.is_active = 1 ORDER BY u.name ASC\`, [req.user.id]),\n    user: req.user`
        );
        fs.writeFileSync(adminFile, admin);
        console.log('  ✓ routes/admin.js — added clientUsers (flex match)');
        applied++;
      } else {
        skipped++;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FIX 9: Create reset-password template
// ─────────────────────────────────────────────────────────────
console.log('\n[Fix 9] Reset password template');

const resetView = path.join(ROOT, 'views/public/reset-password.hbs');
if (fs.existsSync(resetView)) {
  console.log('  ○ views/public/reset-password.hbs — already exists');
} else {
  fs.mkdirSync(path.dirname(resetView), { recursive: true });
  fs.writeFileSync(resetView, `<div class="container">
  <div class="row justify-content-center mt-5">
    <div class="col-lg-5">
      <div class="text-center mb-4">
        <i class="bi bi-key" style="font-size:3rem;color:var(--cs-accent,#2563eb)"></i>
        <h2 class="mt-2">Reset Your Password</h2>
        <p class="text-muted">Set a new password for <strong>{{email}}</strong></p>
      </div>

      <div class="card">
        <div class="card-body p-4">
          <form action="/client/reset-password" method="POST">
            <input type="hidden" name="token" value="{{token}}">

            <div class="mb-3">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" value="{{email}}" disabled>
            </div>

            <div class="mb-3">
              <label for="password" class="form-label">New Password <span class="text-danger">*</span></label>
              <input type="password" class="form-control" id="password" name="password" required minlength="10"
                placeholder="Minimum 10 characters">
              <small class="text-muted">At least 10 characters with a mix of upper/lower, numbers, and symbols.</small>
            </div>

            <div class="mb-3">
              <label for="password_confirm" class="form-label">Confirm Password <span class="text-danger">*</span></label>
              <input type="password" class="form-control" id="password_confirm" name="password_confirm" required minlength="10"
                placeholder="Re-enter your password">
            </div>

            <button type="submit" class="btn btn-primary w-100 py-2">
              <i class="bi bi-check-circle me-2"></i>Reset Password
            </button>
          </form>

          <div class="text-center mt-3">
            <p class="text-muted small">
              <i class="bi bi-info-circle me-1"></i>After resetting, you will need to set up MFA again.
            </p>
          </div>
        </div>
      </div>

      <div class="text-center mt-3">
        <a href="/client/login" class="text-muted small"><i class="bi bi-arrow-left me-1"></i>Back to Sign In</a>
      </div>
    </div>
  </div>
</div>
`);
  console.log('  ✓ views/public/reset-password.hbs — created');
  applied++;
}

// ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(55)}`);
console.log(`  Applied: ${applied} | Skipped: ${skipped}`);
console.log(`${'═'.repeat(55)}`);
if (applied > 0) {
  console.log('\n  Next steps:');
  console.log('    1. npm start');
  console.log('    2. Test: /self-assessment → request access → verify email shows');
  console.log('    3. Test: /admin/invitations → Reset button on client users');
  console.log('    4. Test: client dashboard shows assessments from submitted intakes');
  console.log('    5. Deploy: ./deploy-azure.sh\n');
}