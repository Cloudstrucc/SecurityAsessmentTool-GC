const express = require('express');
const router = express.Router();
const { run, all, get } = require('../models/database');
const emailService = require('../utils/emailService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { generateSecret: otpGenerateSecret, generateURI: otpGenerateURI, verifySync: otpVerify } = require('otplib');
const QRCode = require('qrcode');
const { requireSignature } = require('../config/mfa-signature');

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const intakeUploadDir = path.join(__dirname, '..', 'uploads', 'intakes');
if (!fs.existsSync(intakeUploadDir)) fs.mkdirSync(intakeUploadDir, { recursive: true });
const intakeUpload = multer({
  dest: intakeUploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Home page
router.get('/', (req, res) => {
  res.render('index', { title: 'GC Security Assessment Portal' });
});

// Access via code
router.get('/access', (req, res) => {
  const { code } = req.query;
  if (!code) { req.flash('error', 'Please enter an access code'); return res.redirect('/'); }
  res.redirect('/respond/' + code.toUpperCase().trim());
});

router.post('/respond/access', (req, res) => {
  const { code } = req.body;
  if (!code) { req.flash('error', 'Please enter an access code'); return res.redirect('/'); }
  res.redirect('/respond/' + code.toUpperCase().trim());
});

// Evidence submission portal dashboard
router.get('/respond/:code', (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  console.log('[Public] Looking up invite code:', code);
  
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.description as project_description,
      p.project_owner_name, p.project_owner_email, p.data_classification
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE UPPER(TRIM(a.invite_code)) = ?
  `, [code]);

  if (!assessment) {
    console.log('[Public] No assessment found for code:', code);
    return res.render('error', { title: 'Invalid Code', message: 'The access code is not valid. Please check the code and try again.', showAccessForm: true });
  }
  
  console.log('[Public] Found assessment ID:', assessment.id, 'status:', assessment.status);
  if (assessment.status === 'draft') {
    return res.render('error', { title: 'Not Ready', message: 'This assessment has not been activated yet.', showAccessForm: false });
  }
  if (assessment.invite_expires_at && new Date(assessment.invite_expires_at) < new Date()) {
    return res.render('error', { title: 'Expired', message: 'This invitation has expired.', showAccessForm: false });
  }

  // ── Require client login ──
  if (!req.session.clientId) {
    req.session.pendingInviteCode = code;
    req.flash('info', 'Please sign in to access this assessment. Use the email address associated with your intake submission.');
    return res.redirect('/client/login');
  }

  // ── Verify email matches ──
  const clientUser = get('SELECT email FROM users WHERE id = ?', [req.session.clientId]);
  const expectedEmail = (assessment.client_email || assessment.project_owner_email || '').toLowerCase().trim();
  const clientEmail = (clientUser?.email || '').toLowerCase().trim();

  if (expectedEmail && clientEmail !== expectedEmail) {
    req.flash('error', 'This assessment is assigned to a different account (' + expectedEmail + '). Please sign in with that email address.');
    return res.redirect('/client/login');
  }

  const controls = all(`
    SELECT * FROM assessment_controls 
    WHERE assessment_id = ? AND is_applicable = 1
    ORDER BY family, control_id
  `, [assessment.id]);

  const families = {};
  controls.forEach(c => {
    if (!families[c.family]) families[c.family] = { code: c.family, name: c.family_name, controls: [] };
    families[c.family].controls.push(c);
  });

  const total = controls.length;
  const provided = controls.filter(c => c.evidence_status === 'provided').length;
  const isSubmitted = assessment.status === 'submitted' || assessment.status === 'audit' || assessment.status === 'completed';
  const isReadOnly = isSubmitted;

  const poamCount = get('SELECT COUNT(*) as c FROM iato_checklist WHERE assessment_id = ?', [assessment.id])?.c || 0;

  res.render('public/respond', {
    title: `Evidence Submission – ${assessment.project_name}`,
    assessment, inviteCode: code,
    clientName: assessment.project_owner_name,
    families: Object.values(families),
    controls, total, provided,
    progress: total > 0 ? Math.round(provided / total * 100) : 0,
    isSubmitted, isReadOnly,
    hasPoamItems: poamCount > 0,
    isIATO: assessment.ato_type === 'iato'
  });
});

// Save evidence for a control (auto-save)
router.post('/respond/:code/save/:controlId', express.json({ limit: '5mb' }), (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = get('SELECT * FROM assessments WHERE invite_code = ?', [code]);
  if (!assessment || assessment.status === 'submitted' || assessment.status === 'audit' || assessment.status === 'completed') {
    return res.json({ success: false, message: 'Cannot save - assessment is locked' });
  }

  const { evidence_text, evidence_html } = req.body;
  run(`UPDATE assessment_controls SET evidence_text = ?, evidence_html = ?, 
    evidence_status = CASE WHEN ? != '' THEN 'provided' ELSE 'pending' END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND assessment_id = ?`,
    [evidence_text, evidence_html, evidence_text || '', req.params.controlId, assessment.id]);

  res.json({ success: true });
});

// Upload attachment
router.post('/respond/:code/upload/:controlId', upload.single('file'), (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = get('SELECT * FROM assessments WHERE invite_code = ?', [code]);
  if (!assessment || !req.file) return res.json({ success: false });

  run(`INSERT INTO attachments (assessment_control_id, filename, original_name, mime_type, size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.controlId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, 'project-owner']);

  // Update control's attachment list
  const attachments = all('SELECT * FROM attachments WHERE assessment_control_id = ?', [req.params.controlId]);
  run('UPDATE assessment_controls SET attachments = ? WHERE id = ?',
    [JSON.stringify(attachments.map(a => ({ id: a.id, name: a.original_name, size: a.size }))), req.params.controlId]);

  res.json({ success: true, file: { id: req.file.filename, name: req.file.originalname } });
});

// Add comment
router.post('/respond/:code/comment/:controlId', express.json(), (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = get(`
    SELECT a.*, p.project_owner_name 
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE a.invite_code = ?
  `, [code]);
  if (!assessment) return res.json({ success: false });

  const { content } = req.body;
  run(`INSERT INTO comments (assessment_control_id, user_name, user_role, content)
    VALUES (?, ?, 'project-owner', ?)`,
    [req.params.controlId, assessment.project_owner_name, content]);

  res.json({ success: true });
});

// Submit all evidence
router.post('/respond/:code/submit', requireSignature('evidence.submit', 'Submitted all evidence for assessment', 'assessment'), (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.project_owner_name, p.project_owner_email
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE a.invite_code = ?
  `, [code]);

  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/'); }

  run(`UPDATE assessments SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assessment.id]);

  // Notify assessor
  const assessor = get('SELECT * FROM users WHERE id = ?', [assessment.created_by]);
  if (assessor) {
    emailService.sendSubmissionNotification({
      assessorEmail: assessor.email,
      projectName: assessment.project_name,
      submitterName: assessment.project_owner_name
    }).catch(err => console.error('[Email] Notification failed:', err.message));
  }

  res.render('public/success', {
    title: 'Evidence Submitted',
    projectName: assessment.project_name,
    submittedAt: new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  });
});

// iATO checklist view for project owner
router.get('/respond/:code/checklist', (req, res) => {
  const code = req.params.code.toUpperCase();
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.project_owner_name
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE a.invite_code = ?
  `, [code]);
  if (!assessment) { return res.render('error', { title: 'Not Found', message: 'Assessment not found.', showAccessForm: true }); }

  const items = all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY deadline', [assessment.id]);

  res.render('public/checklist', {
    title: `iATO Checklist – ${assessment.project_name}`,
    assessment, inviteCode: code, items,
    clientName: assessment.project_owner_name
  });
});

// ── CLIENT AUTH MIDDLEWARE ──
function ensureClientAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.session && req.session.clientId) return next();
  req.flash('error', 'Please sign in to access the intake portal.');
  res.redirect('/client/login');
}

// ── CLIENT REGISTRATION ──

router.get('/client/register', (req, res) => {
  const inviteCode = req.query.invite || '';
  res.render('public/register', { title: 'Register', formData: {}, inviteCode });
});

router.post('/client/register', (req, res) => {
  try {
    const { name, email, organization, password, confirmPassword, invite_code } = req.body;

    if (!name || !email || !organization || !password) {
      req.flash('error', 'All fields are required.');
      return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code || '' });
    }

    if (password.length < 10) {
      req.flash('error', 'Password must be at least 10 characters.');
      return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code || '' });
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code || '' });
    }

    // Validate invite code if provided, or require it
    let invite = null;
    if (invite_code && invite_code.trim()) {
      invite = get(
        "SELECT * FROM invitations WHERE invite_code = ? AND type = 'client' AND status = 'pending'",
        [invite_code.trim().toUpperCase()]
      );
      if (!invite) {
        req.flash('error', 'Invalid or expired invite code.');
        return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code });
      }
      if (new Date(invite.expires_at) < new Date()) {
        req.flash('error', 'This invitation has expired. Please request a new one.');
        return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code });
      }
      // Enforce email match
      if (email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
        req.flash('error', `You must register with the email address the invitation was sent to (${invite.email}).`);
        return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code });
      }
    }

    const existing = get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      req.flash('error', 'An account with this email already exists.');
      return res.render('public/register', { title: 'Register', formData: req.body, inviteCode: invite_code || '' });
    }

    const hashedPassword = bcrypt.hashSync(password, 12);
    const secret = otpGenerateSecret();

    const userId = run(
      `INSERT INTO users (email, password, name, role, organization, totp_secret, mfa_enabled, is_active)
       VALUES (?,?,?,?,?,?,?,?)`,
      [email.toLowerCase().trim(), hashedPassword, name, 'client', organization, secret, 0, 1]
    );

    // Mark invitation as accepted if one was used
    if (invite) {
      run("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ? WHERE id = ?",
        [userId, invite.id]);
    }

    // Redirect to MFA setup
    req.session.pendingMfaUserId = userId;
    res.redirect(303, '/client/mfa-setup');

  } catch (err) {
    console.error('Registration error:', err);
    req.flash('error', 'Registration failed. Please try again.');
    res.redirect('/client/register');
  }
});

// ── MFA SETUP ──

router.get('/client/mfa-setup', async (req, res) => {
  const userId = req.session.pendingMfaUserId;
  if (!userId) { return res.redirect('/client/register'); }

  const user = get('SELECT id, email, totp_secret FROM users WHERE id = ?', [userId]);
  if (!user || !user.totp_secret) { return res.redirect('/client/register'); }

  const otpauth = otpGenerateURI({ issuer: 'GC SA&A Portal', label: user.email, secret: user.totp_secret });

  try {
    const qrCodeUrl = await QRCode.toDataURL(otpauth);
    res.render('public/mfa-setup', {
      title: 'MFA Setup',
      qrCodeUrl,
      secret: user.totp_secret,
      userId: user.id
    });
  } catch (err) {
    console.error('QR code error:', err);
    req.flash('error', 'Failed to generate QR code.');
    res.redirect('/client/register');
  }
});

router.post('/client/mfa-setup', (req, res) => {
  const userId = req.session.pendingMfaUserId || req.body.userId;
  const { token } = req.body;

  const user = get('SELECT id, totp_secret FROM users WHERE id = ?', [userId]);
  if (!user) {
    req.flash('error', 'User not found. Please register again.');
    return res.redirect('/client/register');
  }

  const isValid = otpVerify({ secret: user.totp_secret, token }).valid;
  if (!isValid) {
    req.flash('error', 'Invalid code. Please try again — make sure your device clock is synced.');
    return res.redirect(303, '/client/mfa-setup');
  }

  // Activate MFA
  run('UPDATE users SET mfa_enabled = 1 WHERE id = ?', [user.id]);
  delete req.session.pendingMfaUserId;

  // Log them in
  req.session.clientId = user.id;
  req.flash('success', 'MFA enabled! You can optionally register a passkey for faster sign-in.');
  res.redirect('/client/passkey-setup');
});

// ── PASSKEY SETUP (optional, after MFA) ──
router.get('/client/passkey-setup', (req, res) => {
  if (!req.session.clientId) return res.redirect('/client/login');
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [req.session.clientId]);
  res.render('public/passkey-setup', {
    title: 'Register Passkey',
    hasWebAuthn: !!user?.webauthn_credential_id
  });
});

// ── CLIENT LOGIN ──

router.get('/client/login', (req, res) => {
  res.render('public/client-login', { title: 'Client Sign In' });
});

router.post('/client/login', (req, res) => {
  const { email, password } = req.body;
  const user = get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/client/login');
  }

  if (!user.mfa_enabled) {
    // User registered but never completed MFA setup
    req.session.pendingMfaUserId = user.id;
    req.flash('warning', 'Please complete your MFA setup.');
    return res.redirect(303, '/client/mfa-setup');
  }

  // Show MFA step
  req.session.pendingLoginUserId = user.id;
  res.render('public/client-login', {
    title: 'Verify MFA',
    mfaStep: true,
    userId: user.id,
    hasWebAuthn: !!user.webauthn_credential_id
  });
});

router.post('/client/login/mfa', (req, res) => {
  const userId = req.session.pendingLoginUserId || req.body.userId;
  const { token } = req.body;

  const user = get('SELECT id, totp_secret, name FROM users WHERE id = ? AND mfa_enabled = 1', [userId]);
  if (!user) {
    req.flash('error', 'Session expired. Please sign in again.');
    return res.redirect('/client/login');
  }

  const isValid = otpVerify({ secret: user.totp_secret, token }).valid;
  if (!isValid) {
    req.flash('error', 'Invalid authentication code. Please try again.');
    // Re-render MFA step instead of redirecting (avoids losing state)
    return res.render('public/client-login', {
      title: 'Verify MFA', mfaStep: true, userId: user.id
    });
  }

  // Successful login
  delete req.session.pendingLoginUserId;
  req.session.clientId = user.id;
  run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  // Redirect to pending invite if they came from an invite link
  if (req.session.pendingInviteCode) {
    const code = req.session.pendingInviteCode;
    delete req.session.pendingInviteCode;
    req.flash('success', 'Welcome back, ' + user.name + '!');
    return res.redirect('/respond/' + code);
  }

  req.flash('success', 'Welcome back, ' + user.name + '!');
  res.redirect('/client/dashboard');
});

// ── CLIENT LOGIN VIA WEBAUTHN ──
router.post('/client/login/webauthn', (req, res) => {
  const userId = req.session.pendingLoginUserId;
  if (!userId) { req.flash('error', 'Session expired.'); return res.redirect('/client/login'); }
  const user = get('SELECT id, name, mfa_enabled, webauthn_credential_id FROM users WHERE id = ? AND mfa_enabled = 1', [userId]);
  if (!user || !user.webauthn_credential_id) { req.flash('error', 'Passkey not available.'); return res.redirect('/client/login'); }

  // The sig_token was already verified by /api/webauthn/auth-verify
  const { consumeToken } = require('../config/mfa-signature');
  const tokenUserId = consumeToken(req.body._sig_token);
  if (!tokenUserId || tokenUserId !== userId) { req.flash('error', 'Verification failed.'); return res.redirect('/client/login'); }

  delete req.session.pendingLoginUserId;
  req.session.clientId = user.id;
  run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  if (req.session.pendingInviteCode) {
    const code = req.session.pendingInviteCode;
    delete req.session.pendingInviteCode;
    req.flash('success', 'Welcome back, ' + user.name + '!');
    return res.redirect('/respond/' + code);
  }

  req.flash('success', 'Welcome back, ' + user.name + '!');
  res.redirect('/client/dashboard');
});

// ── CLIENT LOGOUT ──

router.get('/client/logout', (req, res) => {
  delete req.session.clientId;
  delete req.session.pendingLoginUserId;
  delete req.session.pendingMfaUserId;
  req.flash('success', 'You have been signed out.');
  res.redirect('/');
});

// ── CLIENT DASHBOARD ──

router.get('/client/dashboard', ensureClientAuth, (req, res) => {
  const clientUser = get('SELECT * FROM users WHERE id = ?', [req.session.clientId]);
  if (!clientUser) { req.flash('error', 'Session expired.'); return res.redirect('/client/login'); }

  // Get intakes submitted by this user OR assigned to them by an assessor
  const intakes = all(`
    SELECT * FROM intake_submissions 
    WHERE submitted_by_user_id = ? OR LOWER(owner_email) = LOWER(?) OR LOWER(assigned_to_email) = LOWER(?)
    ORDER BY created_at DESC
  `, [clientUser.id, clientUser.email, clientUser.email]);

  // Get assessments scoped to this client (by client_email or project owner email)
  const assessments = all(`
    SELECT a.*, p.name as project_name, p.project_owner_email
    FROM assessments a JOIN projects p ON a.project_id = p.id
    WHERE LOWER(a.client_email) = LOWER(?) OR LOWER(p.project_owner_email) = LOWER(?)
    ORDER BY a.created_at DESC
  `, [clientUser.email, clientUser.email]);

  res.render('public/client-dashboard', {
    title: 'My Dashboard',
    clientUser,
    intakes,
    assessments
  });
});

// ── CLIENT SETTINGS ──

router.get('/client/settings', ensureClientAuth, (req, res) => {
  const clientUser = get('SELECT * FROM users WHERE id = ?', [req.session.clientId]);
  if (!clientUser) { req.flash('error', 'Session expired.'); return res.redirect('/client/login'); }
  res.render('public/client-settings', {
    title: 'Settings',
    clientUser,
    mfaEnabled: clientUser.mfa_enabled === 1,
    mfaMode: clientUser.mfa_mode || 'totp',
    hasWebAuthn: !!clientUser.webauthn_credential_id
  });
});

// ── INTAKE FORM (protected) ──

// GET /intake — Show the intake form
router.get('/intake', ensureClientAuth, (req, res) => {
  res.render('public/intake', {
    title: 'Security Assessment Intake'
  });
});

// POST /intake — Process intake submission
router.post('/intake', ensureClientAuth, intakeUpload.array('attachments', 10), requireSignature('intake.submit', 'Submitted intake form', 'intake'), (req, res) => {
  try {
    const refCode = 'INT-' + uuidv4().substring(0, 8).toUpperCase();

    const piiTypes = Array.isArray(req.body.piiTypes) ? req.body.piiTypes : (req.body.piiTypes ? [req.body.piiTypes] : []);
    const technologies = Array.isArray(req.body.technologies) ? req.body.technologies : (req.body.technologies ? [req.body.technologies] : []);
    const activities = Array.isArray(req.body.completedActivities) ? req.body.completedActivities : (req.body.completedActivities ? [req.body.completedActivities] : []);
    const hasPII = piiTypes.length > 0 && !piiTypes.includes('none') ? 1 : 0;

    // Determine security profile from C/I/A categorization
    const { determineProfile, detectComplexity } = require('../config/security-profiles');
    const confLevel = req.body.confidentialityLevel || 'protected-b';
    const intLevel = req.body.integrityLevel || 'medium';
    const avaLevel = req.body.availabilityLevel || 'medium';
    const isHVA = req.body.isHVA ? 1 : 0;
    const hasComplexity = detectComplexity(req.body.projectDescription || '');
    const profileResult = determineProfile({
      confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
      hasPII: hasPII === 1, isHVA: isHVA === 1, hasComplexity
    });
    const securityProfile = profileResult.profile.id;

    const intakeId = run(
      `INSERT INTO intake_submissions (
        ref_code, project_name, project_description, department, branch,
        target_date, user_count, app_type, data_classification,
        confidentiality_level, integrity_level, availability_level, is_hva,
        security_profile,
        pii_types, has_pii, atip_subject, pia_completed,
        hosting_type, hosting_region, technologies, other_tech,
        has_apis, gc_interconnections, interconnections, mobile_access, external_users,
        completed_activities,
        owner_name, owner_email, owner_title,
        tech_lead_name, tech_lead_email, tech_lead_title,
        authority_name, authority_email, authority_title,
        additional_notes, submitted_by_user_id, selected_regions
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        refCode, req.body.projectName || '', req.body.projectDescription || '',
        req.body.department || '', req.body.branch || '',
        req.body.targetDate || '', req.body.userCount || '', req.body.appType || '',
        confLevel,
        confLevel, intLevel, avaLevel, isHVA,
        securityProfile,
        JSON.stringify(piiTypes), hasPII,
        req.body.atipSubject || '', req.body.piaCompleted || '',
        req.body.hostingType || '', req.body.hostingRegion || '',
        JSON.stringify(technologies), req.body.otherTech || '',
        req.body.hasAPIs || '', req.body.gcInterconnections || '',
        req.body.interconnections || '', req.body.mobileAccess || '', req.body.externalUsers || '',
        JSON.stringify(activities),
        req.body.ownerName || '', req.body.ownerEmail || '', req.body.ownerTitle || '',
        req.body.techLeadName || '', req.body.techLeadEmail || '', req.body.techLeadTitle || '',
        req.body.authorityName || '', req.body.authorityEmail || '', req.body.authorityTitle || '',
        req.body.additionalNotes || '',
        req.session.clientId || null,
        req.body.selectedRegions || '[]'
      ]
    );

    // Save uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        run(
          `INSERT INTO intake_attachments (intake_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?)`,
          [intakeId, file.filename, file.originalname, file.mimetype, file.size]
        );
      });
    }

    res.render('public/intake', {
      title: 'Intake Submitted',
      success: true,
      refCode: refCode
    });

  } catch (err) {
    console.error('Intake submission error:', err);
    req.flash('error', 'Failed to submit intake. Please try again.');
    res.redirect('/intake');
  }
});

// ══════════════════════════════════════════════════
// EDIT DRAFT INTAKE (client completes assessor-created intake)
// ══════════════════════════════════════════════════

router.get('/intake/:refCode/edit', ensureClientAuth, (req, res) => {
  const intake = get('SELECT * FROM intake_submissions WHERE ref_code = ?', [req.params.refCode]);
  if (!intake) { req.flash('error', 'Intake not found.'); return res.redirect('/client/dashboard'); }
  
  // Verify access: client must be the assignee or owner
  const clientUser = get('SELECT * FROM users WHERE id = ?', [req.session.clientId]);
  if (!clientUser) { return res.redirect('/client/login'); }
  const email = clientUser.email.toLowerCase().trim();
  const isOwner = (intake.owner_email || '').toLowerCase().trim() === email;
  const isAssigned = (intake.assigned_to_email || '').toLowerCase().trim() === email;
  const isSubmitter = intake.submitted_by_user_id === clientUser.id;
  if (!isOwner && !isAssigned && !isSubmitter) {
    req.flash('error', 'You do not have access to this intake.');
    return res.redirect('/client/dashboard');
  }
  
  // Only allow editing draft intakes
  if (intake.status !== 'draft') {
    req.flash('info', 'This intake has already been submitted and cannot be edited.');
    return res.redirect('/client/dashboard');
  }
  
  // Parse JSON fields for the template
  let techs = [], regions = [], piiTypes = [], activities = [];
  try { techs = JSON.parse(intake.technologies || '[]'); } catch(e) {}
  try { regions = JSON.parse(intake.selected_regions || '[]'); } catch(e) {}
  try { piiTypes = JSON.parse(intake.pii_types || '[]'); } catch(e) {}
  try { activities = JSON.parse(intake.completed_activities || '[]'); } catch(e) {}
  
  res.render('public/intake', {
    title: 'Complete Security Assessment Intake',
    editMode: true,
    editData: {
      ...intake,
      technologiesArray: techs,
      regionsArray: regions,
      piiTypesArray: piiTypes,
      activitiesArray: activities
    }
  });
});

router.post('/intake/:refCode/edit', ensureClientAuth, intakeUpload.array('attachments', 10), requireSignature('intake.submit', 'Submitted intake form', 'intake'), (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE ref_code = ?', [req.params.refCode]);
    if (!intake || intake.status !== 'draft') {
      req.flash('error', 'Intake not found or already submitted.');
      return res.redirect('/client/dashboard');
    }
    
    const clientUser = get('SELECT * FROM users WHERE id = ?', [req.session.clientId]);
    if (!clientUser) { return res.redirect('/client/login'); }
    const email = clientUser.email.toLowerCase().trim();
    const isOwner = (intake.owner_email || '').toLowerCase().trim() === email;
    const isAssigned = (intake.assigned_to_email || '').toLowerCase().trim() === email;
    if (!isOwner && !isAssigned && intake.submitted_by_user_id !== clientUser.id) {
      req.flash('error', 'You do not have access to this intake.');
      return res.redirect('/client/dashboard');
    }

    const piiTypes = Array.isArray(req.body.piiTypes) ? req.body.piiTypes : (req.body.piiTypes ? [req.body.piiTypes] : []);
    const technologies = Array.isArray(req.body.technologies) ? req.body.technologies : (req.body.technologies ? [req.body.technologies] : []);
    const activities = Array.isArray(req.body.completedActivities) ? req.body.completedActivities : (req.body.completedActivities ? [req.body.completedActivities] : []);
    const hasPII = piiTypes.length > 0 && !piiTypes.includes('none') ? 1 : 0;

    const { determineProfile, detectComplexity } = require('../config/security-profiles');
    const confLevel = req.body.confidentialityLevel || intake.confidentiality_level || 'protected-b';
    const intLevel = req.body.integrityLevel || intake.integrity_level || 'medium';
    const avaLevel = req.body.availabilityLevel || intake.availability_level || 'medium';
    const isHVA = req.body.isHVA ? 1 : 0;
    const hasComplexity = detectComplexity(req.body.projectDescription || '');
    const profileResult = determineProfile({
      confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
      hasPII: hasPII === 1, isHVA: isHVA === 1, hasComplexity
    });

    run(`UPDATE intake_submissions SET
      status = 'pending',
      project_name = ?, project_description = ?, department = ?, branch = ?,
      target_date = ?, user_count = ?, app_type = ?, data_classification = ?,
      confidentiality_level = ?, integrity_level = ?, availability_level = ?, is_hva = ?,
      security_profile = ?,
      pii_types = ?, has_pii = ?, atip_subject = ?, pia_completed = ?,
      hosting_type = ?, hosting_region = ?, technologies = ?, other_tech = ?,
      has_apis = ?, gc_interconnections = ?, interconnections = ?, mobile_access = ?, external_users = ?,
      completed_activities = ?,
      owner_name = ?, owner_email = ?, owner_title = ?,
      tech_lead_name = ?, tech_lead_email = ?, tech_lead_title = ?,
      authority_name = ?, authority_email = ?, authority_title = ?,
      additional_notes = ?, submitted_by_user_id = ?, selected_regions = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      req.body.projectName || intake.project_name || '', req.body.projectDescription || '',
      req.body.department || '', req.body.branch || '',
      req.body.targetDate || '', req.body.userCount || '', req.body.appType || '',
      confLevel,
      confLevel, intLevel, avaLevel, isHVA,
      profileResult.profile.id,
      JSON.stringify(piiTypes), hasPII,
      req.body.atipSubject || '', req.body.piaCompleted || '',
      req.body.hostingType || '', req.body.hostingRegion || '',
      JSON.stringify(technologies), req.body.otherTech || '',
      req.body.hasAPIs || '', req.body.gcInterconnections || '',
      req.body.interconnections || '', req.body.mobileAccess || '', req.body.externalUsers || '',
      JSON.stringify(activities),
      req.body.ownerName || '', req.body.ownerEmail || clientUser.email, req.body.ownerTitle || '',
      req.body.techLeadName || '', req.body.techLeadEmail || '', req.body.techLeadTitle || '',
      req.body.authorityName || '', req.body.authorityEmail || '', req.body.authorityTitle || '',
      req.body.additionalNotes || '',
      clientUser.id,
      req.body.selectedRegions || intake.selected_regions || '[]',
      intake.id
    ]);

    // Save uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        run(
          `INSERT INTO intake_attachments (intake_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?)`,
          [intake.id, file.filename, file.originalname, file.mimetype, file.size]
        );
      });
    }

    // Notify the assessor
    if (intake.created_by_assessor_id) {
      const assessor = get('SELECT name, email FROM users WHERE id = ?', [intake.created_by_assessor_id]);
      if (assessor) {
        const emailService = require('../utils/emailService');
        emailService.sendSubmissionNotification({
          assessorEmail: assessor.email,
          projectName: req.body.projectName || intake.project_name,
          submitterName: clientUser.name
        });
      }
    }

    res.render('public/intake', {
      title: 'Intake Submitted',
      success: true,
      refCode: intake.ref_code
    });

  } catch (err) {
    console.error('Intake edit error:', err);
    req.flash('error', 'Failed to submit intake. Please try again.');
    res.redirect(`/intake/${req.params.refCode}/edit`);
  }
});

// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// CLIENT POA&M REMEDIATION (for iATO assessments)
// ══════════════════════════════════════════════════

router.get('/respond/:code/poam', (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  if (!req.session.clientId) {
    req.session.pendingInviteCode = code;
    req.flash('info', 'Please sign in to access remediation items.');
    return res.redirect('/client/login');
  }

  const assessment = get(`
    SELECT a.*, p.name as project_name, p.project_owner_email
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE UPPER(TRIM(a.invite_code)) = ?
  `, [code]);

  if (!assessment) return res.render('error', { title: 'Invalid Code', message: 'Access code not valid.', showAccessForm: true });

  // Verify email
  const clientUser = get('SELECT email FROM users WHERE id = ?', [req.session.clientId]);
  const expectedEmail = (assessment.client_email || assessment.project_owner_email || '').toLowerCase().trim();
  const clientEmail = (clientUser?.email || '').toLowerCase().trim();
  if (expectedEmail && clientEmail !== expectedEmail) {
    req.flash('error', 'This assessment is assigned to a different account.');
    return res.redirect('/client/login');
  }

  const poamItems = all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY CASE risk_level WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, deadline', [assessment.id]);

  const stats = {
    total: poamItems.length,
    open: poamItems.filter(i => i.status === 'open').length,
    inProgress: poamItems.filter(i => i.status === 'in-progress').length,
    completed: poamItems.filter(i => i.status === 'completed').length,
    verified: poamItems.filter(i => i.status === 'verified').length,
    clientSubmitted: poamItems.filter(i => i.client_evidence_status === 'submitted').length,
    overdue: poamItems.filter(i => i.status !== 'completed' && i.status !== 'verified' && i.deadline && new Date(i.deadline) < new Date()).length,
  };

  res.render('public/poam-remediation', {
    title: `POA&M Remediation – ${assessment.project_name}`,
    assessment, inviteCode: code, poamItems, stats,
    isCompleted: assessment.result === 'ato'
  });
});

// Save remediation evidence for a POA&M item
router.post('/respond/:code/poam/:itemId/save', express.json({ limit: '5mb' }), (req, res) => {
  if (!req.session.clientId) return res.status(401).json({ error: 'Not authenticated' });
  const code = req.params.code.toUpperCase().trim();
  const assessment = get('SELECT id FROM assessments WHERE UPPER(TRIM(invite_code)) = ?', [code]);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const item = get('SELECT id FROM iato_checklist WHERE id = ? AND assessment_id = ?', [req.params.itemId, assessment.id]);
  if (!item) return res.status(404).json({ error: 'POA&M item not found' });

  const { evidence } = req.body;
  run('UPDATE iato_checklist SET client_evidence = ?, client_evidence_status = ? WHERE id = ?',
    [evidence || '', evidence ? 'draft' : 'pending', item.id]);
  res.json({ success: true });
});

// Submit all remediation evidence
router.post('/respond/:code/poam/submit', requireSignature('poam.client_submit', 'Submitted POA&M remediation evidence', 'assessment'), (req, res) => {
  if (!req.session.clientId) { req.flash('error', 'Not authenticated'); return res.redirect('/client/login'); }
  const code = req.params.code.toUpperCase().trim();
  const assessment = get('SELECT id FROM assessments WHERE UPPER(TRIM(invite_code)) = ?', [code]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/client/dashboard'); }

  // Mark all items with evidence as submitted
  run(`UPDATE iato_checklist SET client_evidence_status = 'submitted', client_submitted_at = CURRENT_TIMESTAMP 
    WHERE assessment_id = ? AND client_evidence IS NOT NULL AND client_evidence != ''`, [assessment.id]);

  req.flash('success', 'Remediation evidence submitted for assessor review.');
  res.redirect('/respond/' + code + '/poam');
});

// ══════════════════════════════════════════════════
// PUBLIC GUIDANCE PORTAL (invite-based checklist)
// ══════════════════════════════════════════════════

const { GC_WEB_GUIDANCE } = require('../config/itsg33-controls');

router.get('/guidance/:code', (req, res) => {
  const report = get(`
    SELECT g.*, p.name as project_name, p.data_classification, p.app_type,
      p.hosting_type, p.project_owner_name, p.project_owner_email
    FROM guidance_reports g JOIN projects p ON g.project_id = p.id
    WHERE g.invite_code = ?
  `, [req.params.code.toUpperCase()]);

  if (!report) {
    return res.render('error', {
      title: 'Invalid Code',
      message: 'This guidance checklist code is not valid. Please check the code and try again.',
      showAccessForm: true
    });
  }

  let responses = {};
  try { responses = JSON.parse(report.checklist_responses || '{}'); } catch(e) {}

  const guidanceWithResponses = {
    ...GC_WEB_GUIDANCE,
    categories: GC_WEB_GUIDANCE.categories.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({
        ...item,
        status: responses[item.id]?.status || 'pending',
        notes: responses[item.id]?.notes || ''
      }))
    }))
  };

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  const isReadOnly = report.status === 'validated';
  const isReturned = report.status === 'returned';

  res.render('public/guidance-portal', {
    title: 'GC Web Guidance Checklist — ' + report.project_name,
    report, guidance: guidanceWithResponses,
    totalRequired, totalRecommended,
    isReadOnly, isReturned
  });
});

router.post('/guidance/:code/save', express.json({ limit: '1mb' }), (req, res) => {
  const report = get('SELECT * FROM guidance_reports WHERE invite_code = ?', [req.params.code.toUpperCase()]);
  if (!report) return res.status(404).json({ error: 'Not found' });
  if (report.status === 'validated') return res.status(403).json({ error: 'Already validated' });

  const { responses } = req.body;
  run(`UPDATE guidance_reports SET checklist_responses = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(responses || {}), report.id]);

  res.json({ ok: true });
});

router.post('/guidance/:code/submit', requireSignature('guidance.submit', 'Submitted guidance checklist', 'project'), (req, res) => {
  const report = get(`
    SELECT g.*, p.name as project_name
    FROM guidance_reports g JOIN projects p ON g.project_id = p.id
    WHERE g.invite_code = ?
  `, [req.params.code.toUpperCase()]);
  if (!report) { req.flash('error', 'Invalid code'); return res.redirect('/'); }
  if (report.status === 'validated') { req.flash('error', 'Already validated'); return res.redirect('/guidance/' + req.params.code); }

  const { respondent_name, respondent_email, respondent_notes } = req.body;

  // Save any final checklist state from hidden field
  let responses = {};
  try { responses = JSON.parse(req.body.checklist_json || report.checklist_responses || '{}'); } catch(e) {}

  run(`UPDATE guidance_reports SET status = 'submitted', checklist_responses = ?,
    respondent_name = ?, respondent_email = ?, respondent_notes = ?,
    submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [JSON.stringify(responses), respondent_name || '', respondent_email || '', respondent_notes || '', report.id]);

  res.render('public/guidance-submitted', {
    title: 'Checklist Submitted',
    projectName: report.project_name,
    code: report.invite_code
  });
});

module.exports = router;
