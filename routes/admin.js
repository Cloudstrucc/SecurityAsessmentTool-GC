const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, runBatch, all, get } = require('../models/database');
const { passport, ensureAuthenticated } = require('../config/passport');
const { determineProfile, detectComplexity, categorizationLabel, categorizationFullLabel, SECURITY_PROFILES, CONFIDENTIALITY_LEVELS, INTEGRITY_LEVELS, AVAILABILITY_LEVELS } = require('../config/security-profiles');
const { getRecommendedControls, assessSAARequirement, groupByFamily, COMMON_TECHNOLOGIES, CONTROL_FAMILIES, CONTROLS, GC_WEB_GUIDANCE, computeRiskLevel } = require('../config/itsg33-controls');
const emailService = require('../utils/emailService');
const pdfExport = require('../utils/pdfExport');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { generateSecret: otpGenerateSecret, generateURI: otpGenerateURI, verifySync: otpVerify } = require('otplib');
const QRCode = require('qrcode');

const intakeUploadDir = path.join(__dirname, '..', 'uploads', 'intakes');
if (!fs.existsSync(intakeUploadDir)) fs.mkdirSync(intakeUploadDir, { recursive: true });
const intakeUpload = multer({
  dest: intakeUploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function makeSlug(name) {
  const base = slugBase(name);
  let slug = base;
  let i = 2;
  while (get('SELECT id FROM projects WHERE slug = ?', [slug])) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function slugBase(name) {
  return (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
}

function findProjectForIntake(body) {
  const name = (body.name || body.projectName || '').trim();
  if (!name) return null;

  const slug = slugBase(name);
  const existingProject = get(
    `SELECT * FROM projects
     WHERE slug = ? OR LOWER(name) = LOWER(?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [slug, name]
  );
  if (existingProject) return existingProject;

  return get(
    `SELECT p.*
     FROM intake_submissions i
     JOIN projects p ON p.id = i.project_id
     WHERE LOWER(i.project_name) = LOWER(?)
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [name]
  );
}

function getSecurityProfileFromBody(body, hasPII) {
  if (body.security_profile) return body.security_profile;
  const confLevel = body.confidentiality_level || body.data_classification || 'protected-b';
  const intLevel = body.integrity_level || 'medium';
  const avaLevel = body.availability_level || 'medium';
  const profileResult = determineProfile({
    confidentiality: confLevel,
    integrity: intLevel,
    availability: avaLevel,
    hasPII: hasPII === 1,
    isHVA: body.is_hva === '1' || body.is_hva === 'on',
    hasComplexity: detectComplexity(body.description || body.project_description || '')
  });
  return profileResult.profile.id;
}

function createProjectIntake({ projectId, body, createdBy, files = [], status = 'in-review' }) {
  const refCode = 'INT-' + uuidv4().substring(0, 8).toUpperCase();
  const technologies = asArray(body.technologies);
  const piiTypes = asArray(body.piiTypes);
  const activities = asArray(body.completedActivities);
  const hasPII = body.has_pii || (piiTypes.length > 0 && !piiTypes.includes('none')) ? 1 : 0;
  const confLevel = body.confidentiality_level || body.data_classification || 'protected-b';
  const intLevel = body.integrity_level || 'medium';
  const avaLevel = body.availability_level || 'medium';
  const securityProfile = getSecurityProfileFromBody(body, hasPII);

  const intakeId = run(
    `INSERT INTO intake_submissions (
      ref_code, status, project_name, project_description, department, branch,
      target_date, user_count, app_type, data_classification,
      confidentiality_level, integrity_level, availability_level, is_hva,
      security_profile, pii_types, has_pii, atip_subject, pia_completed,
      hosting_type, hosting_region, technologies, other_tech,
      has_apis, gc_interconnections, interconnections, mobile_access, external_users,
      completed_activities, owner_name, owner_email, owner_title,
      tech_lead_name, tech_lead_email, tech_lead_title,
      authority_name, authority_email, authority_title,
      additional_notes, project_id, created_by_assessor_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      refCode, status, body.name || body.projectName || '', body.description || body.projectDescription || '',
      body.department || '', body.branch || '',
      body.targetDate || body.target_date || '', body.userCount || body.user_count || '', body.app_type || '',
      confLevel, confLevel, intLevel, avaLevel, body.is_hva ? 1 : 0,
      securityProfile, JSON.stringify(piiTypes), hasPII,
      body.atipSubject || body.atip_subject || '', body.piaCompleted || body.pia_completed || '',
      body.hosting_type || body.hostingType || '', body.hostingRegion || body.hosting_region || '',
      JSON.stringify(technologies), body.otherTech || body.other_tech || body.specifications || '',
      body.hasAPIs || body.has_apis || '', body.gcInterconnections || body.gc_interconnections || '',
      body.interconnections || '', body.mobileAccess || body.mobile_access || '', body.externalUsers || body.external_users || '',
      JSON.stringify(activities),
      body.project_owner_name || body.ownerName || '', normalizeEmail(body.project_owner_email || body.ownerEmail), body.ownerTitle || '',
      body.techLeadName || '', normalizeEmail(body.techLeadEmail), body.techLeadTitle || '',
      body.project_authority_name || body.authorityName || '', normalizeEmail(body.project_authority_email || body.authorityEmail), body.authorityTitle || '',
      body.additional_notes || body.additionalNotes || '', projectId, createdBy
    ]
  );

  files.forEach(file => {
    run(
      `INSERT INTO intake_attachments (intake_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?)`,
      [intakeId, file.filename, file.originalname, file.mimetype, file.size]
    );
  });

  return intakeId;
}

function getPrimaryIntakeForProject(projectId) {
  return get('SELECT * FROM intake_submissions WHERE project_id = ? ORDER BY created_at ASC LIMIT 1', [projectId]);
}

function ensureProjectIntake(project, createdBy) {
  const existing = getPrimaryIntakeForProject(project.id);
  if (existing) return existing.id;

  return createProjectIntake({
    projectId: project.id,
    createdBy,
    status: 'in-review',
    body: {
      name: project.name,
      description: project.description,
      data_classification: project.data_classification,
      confidentiality_level: project.confidentiality_level || project.data_classification,
      integrity_level: project.integrity_level || 'medium',
      availability_level: project.availability_level || 'medium',
      security_profile: project.security_profile || 'PBMM',
      is_hva: project.is_hva ? '1' : '',
      hosting_type: project.hosting_type,
      app_type: project.app_type,
      has_pii: project.has_pii ? '1' : '',
      technologies: JSON.parse(project.technologies || '[]'),
      specifications: project.specifications,
      project_owner_name: project.project_owner_name,
      project_owner_email: project.project_owner_email,
      project_authority_name: project.project_authority_name,
      project_authority_email: project.project_authority_email,
      department: project.department,
      branch: project.branch
    }
  });
}

function getAssignableUsers() {
  return all(`
    SELECT id, name, email, role, organization
    FROM users
    WHERE is_active = 1 AND role IN ('client','assessor')
    ORDER BY role, name, email
  `);
}

function getEntityAssignments(entityType, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all(
    `SELECT aa.*, u.name AS assignee_name, u.email AS user_email, u.role AS user_role
     FROM assessment_assignments aa
     LEFT JOIN users u ON u.id = aa.assigned_to
     WHERE aa.entity_type = ? AND aa.entity_id IN (${placeholders}) AND aa.status != 'revoked'
     ORDER BY aa.created_at DESC`,
    [entityType, ...ids]
  );
}

function createInvitation({ type, email, name, organization, message, invitedBy, req, entityType, entityId }) {
  const inviteCode = uuidv4().substring(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitationId = run(
    `INSERT INTO invitations (type, email, name, organization, invite_code, invited_by, expires_at, message, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [type, email, name || '', organization || '', inviteCode, invitedBy, expiresAt, message || '', entityType || '', entityId || null]
  );

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  emailService.sendUserInvitation({
    to: email,
    recipientName: name || '',
    inviteCode,
    invitedByName: req.user.name,
    role: type,
    organization: organization || req.user.organization || '',
    baseUrl,
    message: message || ''
  }).catch(err => console.error('[Email] Invitation failed:', err.message));

  return { invitationId, inviteCode };
}

function upsertEntityAssignment({ entityType, entityId, user, email, assigneeRole, assignedBy, invitationId, notes }) {
  const existing = user
    ? get(
      `SELECT id FROM assessment_assignments
       WHERE entity_type = ? AND entity_id = ? AND assigned_to = ? AND status != 'revoked'`,
      [entityType, entityId, user.id]
    )
    : get(
      `SELECT id FROM assessment_assignments
       WHERE entity_type = ? AND entity_id = ? AND LOWER(assignee_email) = ? AND status != 'revoked'`,
      [entityType, entityId, email]
    );

  if (existing) return existing.id;

  return run(
    `INSERT INTO assessment_assignments
      (entity_type, entity_id, assigned_to, assignee_email, assignee_role, assigned_by, invitation_id, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, user?.id || null, email || user?.email || '', assigneeRole, assignedBy, invitationId || null, user ? 'active' : 'pending', notes || '']
  );
}

function updateAssignmentColumns(entityType, entityId, user, email, role) {
  if (entityType === 'intake') {
    run(
      `UPDATE intake_submissions SET assigned_to_user_id = ?, assigned_to_email = ?, assigned_to_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user?.id || null, email || user?.email || '', role, entityId]
    );
  }
  if (entityType === 'assessment') {
    run(
      `UPDATE assessments SET assigned_to_user_id = ?, assigned_to_email = ?, assigned_to_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user?.id || null, email || user?.email || '', role, entityId]
    );
  }
}

function assignEntityFromRequest({ req, entityType, entityId, entityName }) {
  const mode = req.body.assignment_mode || 'existing';
  const assigneeRole = req.body.assignee_role || 'client';
  const notes = req.body.assignment_notes || '';

  if (mode === 'existing') {
    const user = get(
      `SELECT * FROM users WHERE id = ? AND role IN ('client','assessor') AND is_active = 1`,
      [req.body.assignee_user_id]
    );
    if (!user) throw new Error('Selected user was not found.');

    upsertEntityAssignment({ entityType, entityId, user, assigneeRole: user.role, assignedBy: req.user.id, notes });
    updateAssignmentColumns(entityType, entityId, user, user.email, user.role);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    emailService.sendAssignmentNotification({
      to: user.email,
      recipientName: user.name,
      entityType,
      entityName,
      assignedByName: req.user.name,
      baseUrl,
      message: notes
    }).catch(err => console.error('[Email] Assignment notification failed:', err.message));

    return { email: user.email, name: user.name, pending: false };
  }

  const email = normalizeEmail(req.body.invite_email);
  if (!email) throw new Error('Email is required to invite a new user.');

  const existingUser = get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
  if (existingUser) {
    upsertEntityAssignment({ entityType, entityId, user: existingUser, assigneeRole: existingUser.role, assignedBy: req.user.id, notes });
    updateAssignmentColumns(entityType, entityId, existingUser, existingUser.email, existingUser.role);
    return { email: existingUser.email, name: existingUser.name, pending: false };
  }

  let invitation = get(
    `SELECT * FROM invitations WHERE LOWER(email) = ? AND type = ? AND status = 'pending'`,
    [email, assigneeRole]
  );
  let inviteCode = invitation?.invite_code;
  if (!invitation) {
    const created = createInvitation({
      type: assigneeRole,
      email,
      name: req.body.invite_name || '',
      organization: req.body.invite_organization || '',
      message: req.body.invite_message || '',
      invitedBy: req.user.id,
      req,
      entityType,
      entityId
    });
    invitation = { id: created.invitationId };
    inviteCode = created.inviteCode;
  }

  upsertEntityAssignment({
    entityType,
    entityId,
    email,
    assigneeRole,
    assignedBy: req.user.id,
    invitationId: invitation.id,
    notes
  });
  updateAssignmentColumns(entityType, entityId, null, email, assigneeRole);

  return { email, name: req.body.invite_name || email, pending: true, inviteCode };
}

function copyIntakeAssignmentsToAssessment(intakeId, assessmentId, assignedBy) {
  const assignments = all(
    `SELECT * FROM assessment_assignments
     WHERE entity_type = 'intake' AND entity_id = ? AND status != 'revoked'`,
    [intakeId]
  );
  assignments.forEach(a => {
    upsertEntityAssignment({
      entityType: 'assessment',
      entityId: assessmentId,
      user: a.assigned_to ? { id: a.assigned_to, email: a.assignee_email } : null,
      email: a.assignee_email,
      assigneeRole: a.assignee_role || 'client',
      assignedBy: assignedBy || a.assigned_by,
      invitationId: a.invitation_id,
      notes: a.notes || 'Copied from linked intake'
    });
    if (a.assigned_to) {
      const user = get('SELECT id, email, role FROM users WHERE id = ?', [a.assigned_to]);
      if (user) updateAssignmentColumns('assessment', assessmentId, user, user.email, user.role);
    } else if (a.assignee_email) {
      updateAssignmentColumns('assessment', assessmentId, null, a.assignee_email, a.assignee_role || 'client');
    }
  });
}

// ── AUTH ──
router.get('/login', (req, res) => {
  if (req.isAuthenticated() && req.session.adminMfaVerified) return res.redirect('/admin/dashboard');
  if (req.isAuthenticated()) {
    const user = get('SELECT mfa_enabled, totp_secret, webauthn_credential_id, is_break_glass FROM users WHERE id = ?', [req.user.id]);
    if (user?.is_break_glass) {
      req.session.adminMfaVerified = true;
      return res.redirect('/admin/dashboard');
    }
    if (!user?.mfa_enabled || !user?.totp_secret) return res.redirect('/admin/mfa-setup');
    return res.render('admin/login', {
      title: 'Verify MFA',
      layout: 'main',
      mfaStep: true,
      userId: req.user.id,
      hasWebAuthn: !!user.webauthn_credential_id
    });
  }
  res.render('admin/login', { title: 'Assessor Login', layout: 'main', prefillEmail: req.query.email || '' });
});

router.post('/login', (req, res, next) => {
  if (req.body._mfa_step && req.isAuthenticated()) {
    const user = get('SELECT id, totp_secret, mfa_enabled, webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.mfa_enabled || !user.totp_secret) return res.redirect('/admin/mfa-setup');

    const isValid = otpVerify({ secret: user.totp_secret, token: req.body.token, window: 1 }).valid;
    if (!isValid) {
      req.flash('error', 'Invalid authentication code. Please try again.');
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: user.id,
        hasWebAuthn: !!user.webauthn_credential_id
      });
    }

    req.session.adminMfaVerified = true;
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    return res.redirect('/admin/dashboard');
  }

  if (req.body._webauthn_step && req.isAuthenticated()) {
    const { consumeToken } = require('../config/mfa-signature');
    const tokenUserId = consumeToken(req.body._sig_token);
    if (!tokenUserId || tokenUserId !== req.user.id) {
      req.flash('error', 'Passkey verification failed. Please try again or use TOTP.');
      const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: req.user.id,
        hasWebAuthn: !!user?.webauthn_credential_id
      });
    }
    req.session.adminMfaVerified = true;
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);
    return res.redirect('/admin/dashboard');
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info?.message || 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const dbUser = get('SELECT mfa_enabled, totp_secret, webauthn_credential_id, is_break_glass FROM users WHERE id = ?', [user.id]);
      if (dbUser?.is_break_glass) {
        req.session.adminMfaVerified = true;
        return res.redirect('/admin/dashboard');
      }
      if (!dbUser?.mfa_enabled || !dbUser?.totp_secret) {
        req.session.adminMfaVerified = false;
        return res.redirect('/admin/mfa-setup');
      }

      req.session.adminMfaVerified = false;
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: user.id,
        hasWebAuthn: !!dbUser.webauthn_credential_id
      });
    });
  })(req, res, next);
});

router.get('/logout', (req, res) => {
  delete req.session.adminMfaVerified;
  req.logout(() => res.redirect('/admin/login'));
});

router.get('/mfa-setup', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  const user = get('SELECT id, email, totp_secret, mfa_enabled FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.redirect('/admin/login');

  let secret = user.totp_secret;
  if (!secret) {
    secret = otpGenerateSecret();
    run('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, user.id]);
  }

  const otpauth = otpGenerateURI({ issuer: 'GC SA&A Portal', label: user.email, secret });
  try {
    const qrCodeUrl = await QRCode.toDataURL(otpauth);
    res.render('admin/login', {
      title: 'MFA Setup',
      layout: 'main',
      mfaSetup: true,
      qrCodeUrl,
      secret,
      mfaAlreadyEnabled: user.mfa_enabled === 1
    });
  } catch (err) {
    console.error('QR code error:', err);
    req.flash('error', 'Failed to generate QR code.');
    res.redirect('/admin/login');
  }
});

router.post('/mfa-setup', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  const user = get('SELECT id, totp_secret FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.totp_secret) {
    req.flash('error', 'MFA setup failed. Please try again.');
    return res.redirect('/admin/mfa-setup');
  }

  const isValid = otpVerify({ secret: user.totp_secret, token: req.body.token, window: 1 }).valid;
  if (!isValid) {
    req.flash('error', 'Invalid code. Please try again.');
    return res.redirect('/admin/mfa-setup');
  }

  run('UPDATE users SET mfa_enabled = 1 WHERE id = ?', [user.id]);
  req.session.adminMfaVerified = true;
  req.flash('success', 'MFA enabled. You can optionally register a passkey; TOTP will remain available.');
  res.redirect('/admin/passkey-setup');
});

router.get('/passkey-setup', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  if (!req.session.adminMfaVerified) return res.redirect('/admin/login');
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
  res.render('admin/passkey-setup', {
    title: 'Register Passkey',
    layout: 'main',
    hasWebAuthn: !!user?.webauthn_credential_id
  });
});

router.get('/register', (req, res) => {
  const inviteCode = req.query.invite || '';
  let formData = {};
  if (inviteCode) {
    const invite = get("SELECT email, name, organization FROM invitations WHERE invite_code = ? AND status = 'pending'", [inviteCode.trim().toUpperCase()]);
    if (invite) formData = { email: invite.email, name: invite.name, organization: invite.organization };
  }
  res.render('admin/register', {
    title: 'Assessor Registration',
    layout: 'main',
    inviteCode,
    formData
  });
});

router.post('/register', (req, res) => {
  try {
    const { name, email, organization, password, confirmPassword, invite_code } = req.body;
    if (!name || !email || !password || !invite_code) {
      req.flash('error', 'Name, email, password, and invitation code are required.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (password.length < 10) {
      req.flash('error', 'Password must be at least 10 characters.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }

    const invite = get(
      "SELECT * FROM invitations WHERE invite_code = ? AND type = 'assessor' AND status = 'pending'",
      [invite_code.trim().toUpperCase()]
    );
    if (!invite || new Date(invite.expires_at) < new Date()) {
      req.flash('error', 'Invalid or expired invitation code.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (normalizeEmail(email) !== normalizeEmail(invite.email)) {
      req.flash('error', `Please register with the invited email address (${invite.email}).`);
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (get('SELECT id FROM users WHERE email = ?', [normalizeEmail(email)])) {
      req.flash('error', 'An account with this email already exists.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }

    const userId = run(
      `INSERT INTO users (email, password, name, role, organization, totp_secret, mfa_enabled, is_active)
       VALUES (?, ?, ?, 'assessor', ?, ?, 0, 1)`,
      [normalizeEmail(email), bcrypt.hashSync(password, 12), name, organization || invite.organization || '', otpGenerateSecret()]
    );
    run("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ? WHERE id = ?", [userId, invite.id]);
    run("UPDATE assessment_assignments SET assigned_to = ?, status = 'active', accepted_at = CURRENT_TIMESTAMP WHERE invitation_id = ?", [userId, invite.id]);
    run("UPDATE assessments SET assigned_to_user_id = ? WHERE LOWER(assigned_to_email) = ?", [userId, normalizeEmail(email)]);
    run("UPDATE intake_submissions SET assigned_to_user_id = ? WHERE LOWER(assigned_to_email) = ?", [userId, normalizeEmail(email)]);

    req.flash('success', 'Account created. Please sign in and set up MFA.');
    res.redirect('/admin/login');
  } catch (err) {
    console.error('Assessor registration error:', err);
    req.flash('error', 'Registration failed: ' + err.message);
    res.redirect('/admin/register');
  }
});

// ── DASHBOARD ──
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const projects = all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 10');
  const assessments = all(`
    SELECT a.*, p.name as project_name 
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    ORDER BY a.updated_at DESC LIMIT 10
  `);
  const recentIntakes = all(`SELECT * FROM intake_submissions ORDER BY created_at DESC LIMIT 5`);
  
  const stats = {
    totalProjects: get('SELECT COUNT(*) as c FROM projects')?.c || 0,
    activeAssessments: get("SELECT COUNT(*) as c FROM assessments WHERE status NOT IN ('completed','closed')")?.c || 0,
    pendingAudits: get("SELECT COUNT(*) as c FROM assessments WHERE status = 'submitted'")?.c || 0,
    activeATOs: get("SELECT COUNT(*) as c FROM assessments WHERE ato_type = 'ato' AND result = 'ato'")?.c || 0,
    activeIATOs: get("SELECT COUNT(*) as c FROM assessments WHERE ato_type = 'iato' AND result = 'iato'")?.c || 0,
    pendingIntakes: get("SELECT COUNT(*) as c FROM intake_submissions WHERE status IN ('pending','in-review')")?.c || 0
  };

  res.render('admin/dashboard', {
    title: 'Dashboard',
    isAdmin: true, isDashboard: true,
    admin: req.user, projects, assessments, recentIntakes, stats
  });
});

// ── PROJECTS ──
router.get('/projects', ensureAuthenticated, (req, res) => {
  const projects = all('SELECT * FROM projects ORDER BY updated_at DESC');
  res.render('admin/projects', {
    title: 'Projects', isAdmin: true, isProjects: true,
    admin: req.user, projects
  });
});

router.get('/projects/new', ensureAuthenticated, (req, res) => {
  res.render('admin/project-new', {
    title: 'New Project', isAdmin: true, isProjects: true,
    admin: req.user,
    technologies: COMMON_TECHNOLOGIES,
    users: getAssignableUsers()
  });
});

router.post('/projects/new', ensureAuthenticated, intakeUpload.array('attachments', 10), (req, res) => {
  try {
    const { name, description, data_classification, hosting_type, app_type, has_pii,
      technologies, specifications, project_owner_name, project_owner_email,
      project_authority_name, project_authority_email, cio_name, cio_email,
      department, branch, confidentiality_level, integrity_level, availability_level,
      security_profile, is_hva } = req.body;

    const techArray = asArray(technologies);
    const piiTypes = asArray(req.body.piiTypes);
    const hasPII = has_pii || (piiTypes.length > 0 && !piiTypes.includes('none')) ? 1 : 0;
    const confLevel = confidentiality_level || data_classification || 'protected-b';
    const intLevel = integrity_level || 'medium';
    const avaLevel = availability_level || 'medium';
    const profile = security_profile || getSecurityProfileFromBody(req.body, hasPII);
    const existingProject = findProjectForIntake(req.body);
    let projectId;

    if (existingProject) {
      projectId = existingProject.id;
      run(`UPDATE projects SET
        name = ?, description = ?, data_classification = ?,
        confidentiality_level = ?, integrity_level = ?, availability_level = ?, security_profile = ?, is_hva = ?,
        hosting_type = ?, app_type = ?, has_pii = ?, technologies = ?, specifications = ?,
        project_owner_name = ?, project_owner_email = ?, project_authority_name = ?, project_authority_email = ?,
        cio_name = ?, cio_email = ?, department = ?, branch = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [name, description || '', data_classification || confLevel || 'protected-b',
          confLevel, intLevel, avaLevel, profile, is_hva ? 1 : 0,
          hosting_type || '', app_type || '', hasPII, JSON.stringify(techArray), specifications || '',
          project_owner_name || '', normalizeEmail(project_owner_email), project_authority_name || '', normalizeEmail(project_authority_email),
          cio_name || '', normalizeEmail(cio_email), department || '', branch || '', projectId]);
    } else {
      const slug = makeSlug(name);
      projectId = run(`INSERT INTO projects (name, slug, description, data_classification,
        confidentiality_level, integrity_level, availability_level, security_profile, is_hva,
        hosting_type, app_type, has_pii, technologies, specifications, project_owner_name, project_owner_email,
        project_authority_name, project_authority_email, cio_name, cio_email, department, branch, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [name, slug, description || '', data_classification || confLevel || 'protected-b',
          confLevel, intLevel, avaLevel, profile, is_hva ? 1 : 0,
          hosting_type || '', app_type || '', hasPII, JSON.stringify(techArray), specifications || '',
          project_owner_name || '', normalizeEmail(project_owner_email), project_authority_name || '', normalizeEmail(project_authority_email),
          cio_name || '', normalizeEmail(cio_email), department || '', branch || '', req.user.id]);
    }

    const intakeId = createProjectIntake({
      projectId,
      body: req.body,
      createdBy: req.user.id,
      files: req.files || [],
      status: 'in-review'
    });

    const assignmentMode = req.body.assignment_mode;
    if (assignmentMode === 'existing' || assignmentMode === 'invite') {
      const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [intakeId]);
      assignEntityFromRequest({
        req,
        entityType: 'intake',
        entityId: intakeId,
        entityName: intake?.project_name || name
      });
    }

    req.flash('success', `${existingProject ? 'Project updated' : 'Project created'} and associated intake ${get('SELECT ref_code FROM intake_submissions WHERE id = ?', [intakeId])?.ref_code || ''} created successfully`);
    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/projects/new');
  }
});

router.get('/projects/:id', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  const assessments = all(`
    SELECT a.*, i.ref_code AS intake_ref_code
    FROM assessments a
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
  `, [project.id]);
  const intakes = all('SELECT * FROM intake_submissions WHERE project_id = ? ORDER BY created_at DESC', [project.id]);
  const intakeAssignments = getEntityAssignments('intake', intakes.map(i => i.id));
  const assessmentAssignments = getEntityAssignments('assessment', assessments.map(a => a.id));
  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}

  res.render('admin/project-detail', {
    title: project.name, isAdmin: true, isProjects: true,
    admin: req.user, project, assessments, intakes,
    intakeAssignments, assessmentAssignments,
    users: getAssignableUsers(),
    techNames: techs.map(t => COMMON_TECHNOLOGIES[t]?.name || t)
  });
});

router.post('/projects/:id/intake/create', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

    const existing = getPrimaryIntakeForProject(project.id);
    if (existing) {
      req.flash('info', `This project already has intake ${existing.ref_code}.`);
      return res.redirect(`/admin/projects/${project.id}`);
    }

    const intakeId = ensureProjectIntake(project, req.user.id);
    const intake = get('SELECT ref_code FROM intake_submissions WHERE id = ?', [intakeId]);
    req.flash('success', `Created intake ${intake?.ref_code || ''} for this project.`);
    res.redirect(`/admin/projects/${project.id}`);
  } catch (err) {
    console.error('Create project intake error:', err);
    req.flash('error', 'Failed to create intake: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.post('/projects/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

    const target = req.body.assign_target || 'all';
    const targets = [];
    if (target === 'all' || target.startsWith('intake:')) {
      const intakeIds = target.startsWith('intake:')
        ? [parseInt(target.split(':')[1])]
        : all('SELECT id FROM intake_submissions WHERE project_id = ?', [project.id]).map(i => i.id);
      intakeIds.forEach(id => targets.push({ entityType: 'intake', entityId: id }));
    }
    if (target === 'all' || target.startsWith('assessment:')) {
      const assessmentIds = target.startsWith('assessment:')
        ? [parseInt(target.split(':')[1])]
        : all('SELECT id FROM assessments WHERE project_id = ?', [project.id]).map(a => a.id);
      assessmentIds.forEach(id => targets.push({ entityType: 'assessment', entityId: id }));
    }

    if (!targets.length) {
      req.flash('error', 'There is no intake or assessment to assign yet.');
      return res.redirect(`/admin/projects/${project.id}`);
    }

    let result;
    targets.forEach(t => {
      result = assignEntityFromRequest({
        req,
        entityType: t.entityType,
        entityId: t.entityId,
        entityName: project.name
      });
    });

    req.flash('success', `${target === 'all' ? 'Project intake and assessments' : 'Selected item'} assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/projects/${project.id}`);
  } catch (err) {
    console.error('Project assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

// ── ASSESSMENTS ──
router.get('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
  const intake = getPrimaryIntakeForProject(project.id);

  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}

  const projectInfo = {
    dataClassification: project.data_classification,
    confidentiality: project.confidentiality_level || project.data_classification,
    hostingType: project.hosting_type,
    appType: project.app_type,
    hasPII: !!project.has_pii,
    technologies: techs,
    description: project.description,
    securityProfile: project.security_profile || 'PBMM',
    isHVA: !!project.is_hva
  };

  // Check if SA&A is required
  const saaCheck = assessSAARequirement(projectInfo);
  if (!saaCheck.requiresSAA && !req.query.force) {
    // Redirect to guidance report instead
    return res.redirect(`/admin/projects/${project.id}/guidance`);
  }

  const controls = getRecommendedControls(projectInfo);
  const families = groupByFamily(controls);

  // Check for reusable templates
  const templates = all(`SELECT DISTINCT control_id, tailored_description, evidence_guidance, example_evidence 
    FROM control_templates WHERE hosting_type = ? ORDER BY usage_count DESC`, [project.hosting_type]);
  const templateMap = {};
  templates.forEach(t => { templateMap[t.control_id] = t; });

  // Apply templates where available
  families.forEach(fam => {
    fam.controls.forEach(ctrl => {
      if (templateMap[ctrl.id]) {
        ctrl.tailoredDescription = templateMap[ctrl.id].tailored_description || ctrl.tailoredDescription;
        ctrl.evidenceGuidance = templateMap[ctrl.id].evidence_guidance || ctrl.evidenceGuidance;
        ctrl.hasTemplate = true;
      }
    });
  });

  res.render('admin/assessment-new', {
    title: 'New Assessment', isAdmin: true, isProjects: true,
    admin: req.user, project, intake, families, controlCount: controls.length,
    saaReason: saaCheck.reason
  });
});

router.post('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const intakeId = ensureProjectIntake(project, req.user.id);

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentId = run(`INSERT INTO assessments (project_id, intake_id, type, status, invite_code, created_by)
      VALUES (?, ?, 'initial', 'draft', ?, ?)`, [project.id, intakeId, inviteCode, req.user.id]);
    copyIntakeAssignmentsToAssessment(intakeId, assessmentId, req.user.id);

    console.log('[Assessment] Created assessment ID:', assessmentId, 'invite:', inviteCode);

    // Insert controls via batch (avoids last_insert_rowid issues)
    const controlIds = req.body.control_ids || [];
    const tailored = req.body.tailored || {};
    const guidance = req.body.guidance || {};
    const inherited = req.body.inherited || {};
    const inheritedFrom = req.body.inherited_from || {};
    const applicable = req.body.applicable || {};

    const controlList = Array.isArray(controlIds) ? controlIds : [controlIds];
    const statements = controlList.map(cid => {
      const family = cid.split('-')[0];
      return {
        sql: `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, 
          description, tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority, risk_level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [assessmentId, cid, family, CONTROL_FAMILIES[family] || family,
          req.body[`title_${cid}`] || cid,
          req.body[`desc_${cid}`] || '',
          tailored[cid] || req.body[`tailored_${cid}`] || '',
          guidance[cid] || req.body[`guidance_${cid}`] || '',
          inherited[cid] ? 1 : 0,
          inheritedFrom[cid] || '',
          applicable[cid] !== '0' ? 1 : 0,
          req.body[`priority_${cid}`] || 'P1',
          computeRiskLevel({ family, priority: req.body[`priority_${cid}`] || 'P1' })
        ]
      };
    });

    if (statements.length > 0) {
      runBatch(statements);
      console.log('[Assessment] Inserted', statements.length, 'controls for assessment', assessmentId);
    }

    req.flash('success', `Assessment created with ${statements.length} controls. You can now review and send the invite.`);
    res.redirect(`/admin/assessments/${assessmentId}`);
  } catch (err) {
    console.error('Assessment creation error:', err);
    req.flash('error', 'Failed to create assessment: ' + err.message);
    res.redirect(`/admin/projects/${req.params.projectId}`);
  }
});

router.get('/assessments', ensureAuthenticated, (req, res) => {
  const assessments = all(`
    SELECT a.*, p.name as project_name, i.ref_code as intake_ref_code
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    ORDER BY a.updated_at DESC
  `);
  res.render('admin/assessments', {
    title: 'Assessments', isAdmin: true, isAssessments: true,
    admin: req.user, assessments
  });
});

router.get('/assessments/:id', ensureAuthenticated, (req, res) => {
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.project_owner_name, p.project_owner_email,
      p.data_classification, p.hosting_type, p.app_type,
      p.description as project_description, p.technologies, p.confidentiality_level,
      p.integrity_level, p.availability_level, p.security_profile,
      i.ref_code as intake_ref_code, i.status as intake_status
    FROM assessments a
    JOIN projects p ON a.project_id = p.id
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    WHERE a.id = ?
  `, [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);
  const families = {};
  controls.forEach(c => {
    if (!families[c.family]) families[c.family] = { code: c.family, name: c.family_name, controls: [] };
    families[c.family].controls.push(c);
  });

  const stats = {
    total: controls.length,
    applicable: controls.filter(c => c.is_applicable).length,
    inherited: controls.filter(c => c.is_inherited).length,
    evidenceProvided: controls.filter(c => c.evidence_status === 'provided').length,
    met: controls.filter(c => c.audit_result === 'met').length,
    partiallyMet: controls.filter(c => c.audit_result === 'partially-met').length,
    notMet: controls.filter(c => c.audit_result === 'not-met').length,
    pending: controls.filter(c => !c.audit_result || c.audit_result === 'pending').length,
    highRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'high').length,
    mediumRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'medium').length,
    lowRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'low').length,
    highRiskNotMet: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'high' && (c.audit_result === 'not-met' || c.audit_result === 'partially-met')).length
  };
  stats.score = stats.applicable > 0 ? Math.round((stats.met + stats.partiallyMet * 0.5) / stats.applicable * 100) : 0;

  // Compute risk level for controls that don't have one
  controls.forEach(c => { if (!c.risk_level) c.risk_level = computeRiskLevel(c); });

  const checklistItems = all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY CASE risk_level WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, deadline', [assessment.id]);
  const assignments = getEntityAssignments('assessment', [assessment.id]);
  const poamStats = {
    total: checklistItems.length,
    open: checklistItems.filter(i => i.status === 'open').length,
    inProgress: checklistItems.filter(i => i.status === 'in-progress').length,
    completed: checklistItems.filter(i => i.status === 'completed').length,
    verified: checklistItems.filter(i => i.status === 'verified').length,
    overdue: checklistItems.filter(i => i.status !== 'completed' && i.status !== 'verified' && i.deadline && new Date(i.deadline) < new Date()).length,
    highCount: checklistItems.filter(i => i.risk_level === 'high').length,
    mediumCount: checklistItems.filter(i => i.risk_level === 'medium').length,
    lowCount: checklistItems.filter(i => i.risk_level === 'low').length
  };

  res.render('admin/assessment-detail', {
    title: `Assessment: ${assessment.project_name}`,
    isAdmin: true, isAssessments: true,
    admin: req.user, assessment, assignments, users: getAssignableUsers(),
    families: Object.values(families), controls, stats, checklistItems, poamStats,
    projectContextJSON: JSON.stringify({
      name: assessment.project_name,
      description: assessment.project_description || '',
      technologies: assessment.technologies || '',
      hosting_type: assessment.hosting_type || '',
      confidentiality_level: assessment.confidentiality_level || 'protected-b',
      integrity_level: assessment.integrity_level || 'medium',
      availability_level: assessment.availability_level || 'medium',
      security_profile: assessment.security_profile || 'PBMM'
    })
  });
});

// ── SEND INVITE ──
router.post('/assessments/:id/send-invite', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`
      SELECT a.*, p.project_owner_name, p.project_owner_email, p.name as project_name
      FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
    `, [req.params.id]);

    if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    run(`UPDATE assessments SET status = 'evidence-gathering', invite_sent_at = CURRENT_TIMESTAMP, 
      invite_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [expiresAt.toISOString(), assessment.id]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const recipientEmail = assessment.assigned_to_email || assessment.project_owner_email;
    const recipientName = assessment.assigned_to_user_id
      ? (get('SELECT name FROM users WHERE id = ?', [assessment.assigned_to_user_id])?.name || assessment.project_owner_name)
      : assessment.project_owner_name;
    if (!recipientEmail) {
      req.flash('error', 'No assigned user or project owner email is available for this assessment.');
      return res.redirect(`/admin/assessments/${assessment.id}`);
    }
    const emailResult = await emailService.sendInvite({
      to: recipientEmail,
      recipientName,
      projectName: assessment.project_name,
      inviteCode: assessment.invite_code,
      expiresAt: expiresAt.toISOString(),
      assessorName: req.user.name,
      baseUrl
    });

    if (emailResult.sent) {
      req.flash('success', `Invite emailed to ${recipientEmail} with code: ${assessment.invite_code}`);
    } else {
      req.flash('success', `Assessment activated with code: ${assessment.invite_code}. Email could not be sent (${emailResult.error || 'not configured'}) — share the code manually.`);
    }
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to send invite: ' + err.message);
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

router.post('/assessments/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const assessment = get(`
      SELECT a.*, p.name AS project_name
      FROM assessments a JOIN projects p ON p.id = a.project_id
      WHERE a.id = ?
    `, [req.params.id]);
    if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

    const result = assignEntityFromRequest({
      req,
      entityType: 'assessment',
      entityId: assessment.id,
      entityName: assessment.project_name
    });

    if (assessment.intake_id) {
      assignEntityFromRequest({
        req,
        entityType: 'intake',
        entityId: assessment.intake_id,
        entityName: assessment.project_name
      });
    }

    req.flash('success', `Assessment${assessment.intake_id ? ' and linked intake' : ''} assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error('Assessment assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

// ── AUDIT ──
router.post('/assessments/:id/start-audit', ensureAuthenticated, (req, res) => {
  run(`UPDATE assessments SET status = 'audit', audit_started_at = CURRENT_TIMESTAMP, 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
  req.flash('success', 'Audit started');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/audit-control/:controlId', ensureAuthenticated, (req, res) => {
  const { result, comments } = req.body;
  run(`UPDATE assessment_controls SET audit_result = ?, audit_comments = ?, 
    audit_reviewed_at = CURRENT_TIMESTAMP, audit_reviewed_by = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND assessment_id = ?`,
    [result, comments, req.user.id, req.params.controlId, req.params.id]);
  res.json({ success: true });
});

router.post('/assessments/:id/complete-audit', ensureAuthenticated, (req, res) => {
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? AND is_applicable = 1', [req.params.id]);
  const met = controls.filter(c => c.audit_result === 'met').length;
  const partial = controls.filter(c => c.audit_result === 'partially-met').length;
  const notMet = controls.filter(c => c.audit_result === 'not-met').length;
  const total = controls.length;
  const score = total > 0 ? Math.round((met + partial * 0.5) / total * 100) : 0;

  // Assessor can override the result or let the engine decide
  let result = req.body.overrideResult || null;
  let atoType = null;

  if (!result) {
    // GC scoring: 100% met = ATO, >=80% with no critical = iATO, <80% = denied
    // TBS additional check: any HIGH risk not-met controls = cannot grant full ATO
    const highRiskNotMet = controls.filter(c =>
      (c.audit_result === 'not-met') &&
      (c.risk_level === 'high' || computeRiskLevel(c) === 'high'));

    if (met === total) {
      result = 'ato'; atoType = 'ato';
    } else if (score >= 80 && highRiskNotMet.length === 0) {
      result = 'ato'; atoType = 'ato';
    } else if (score >= 60) {
      result = 'iato'; atoType = 'iato';
    } else {
      result = 'denied'; atoType = null;
    }
  } else {
    atoType = (result === 'ato') ? 'ato' : (result === 'iato') ? 'iato' : null;
  }

  // Set expiry for iATO (default 90 days if not specified)
  let expiryDate = null;
  if (atoType === 'iato') {
    if (req.body.atoExpiryDate) {
      expiryDate = req.body.atoExpiryDate;
    } else {
      const d = new Date(); d.setDate(d.getDate() + 90);
      expiryDate = d.toISOString().split('T')[0];
    }
  }

  run(`UPDATE assessments SET status = 'completed', audit_completed_at = CURRENT_TIMESTAMP, 
    overall_score = ?, result = ?, ato_type = ?, ato_expiry_date = ?,
    risk_acceptance_statement = ?, poam_notes = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [score, result, atoType, expiryDate,
     req.body.riskAcceptance || '', req.body.poamNotes || '',
     req.params.id]);

  // Auto-populate POA&M items for not-met/partially-met controls
  const findings = controls.filter(c => c.audit_result === 'not-met' || c.audit_result === 'partially-met');
  if (atoType === 'iato' && findings.length > 0) {
    const existing = all('SELECT control_id FROM iato_checklist WHERE assessment_id = ?', [req.params.id]);
    const existingIds = new Set(existing.map(e => e.control_id));

    findings.forEach(c => {
      if (!existingIds.has(c.control_id)) {
        const riskLevel = c.risk_level || computeRiskLevel(c);
        const defaultDeadline = new Date();
        defaultDeadline.setDate(defaultDeadline.getDate() + (riskLevel === 'high' ? 30 : riskLevel === 'medium' ? 60 : 90));

        run(`INSERT INTO iato_checklist (assessment_id, control_id, description, risk_level,
          original_finding, deadline, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
          [req.params.id, c.control_id,
           `Remediate ${c.control_id} — ${c.title} (${c.audit_result === 'not-met' ? 'Not Met' : 'Partially Met'})`,
           riskLevel,
           c.audit_comments || `Control ${c.audit_result}: ${c.title}`,
           defaultDeadline.toISOString().split('T')[0],
           req.user.id]);
      }
    });
  }

  // Save templates for reuse
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  const project = get('SELECT * FROM projects WHERE id = ?', [assessment.project_id]);
  controls.filter(c => c.audit_result === 'met' && c.evidence_text).forEach(c => {
    const existing = get('SELECT id FROM control_templates WHERE control_id = ? AND hosting_type = ?',
      [c.control_id, project.hosting_type]);
    if (!existing) {
      run(`INSERT INTO control_templates (control_id, hosting_type, technologies, tailored_description, 
        evidence_guidance, example_evidence, source_project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.control_id, project.hosting_type, project.technologies, c.tailored_description,
          c.evidence_guidance, c.evidence_text, project.id]);
    } else {
      run('UPDATE control_templates SET usage_count = usage_count + 1 WHERE id = ?', [existing.id]);
    }
  });

  req.flash('success', `Audit completed. Score: ${score}%. Result: ${(result || '').toUpperCase()}.${atoType === 'iato' ? ' POA&M items auto-generated for ' + findings.length + ' findings.' : ''}`);
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── POA&M MANAGEMENT ──
router.post('/assessments/:id/checklist/add', ensureAuthenticated, (req, res) => {
  const { description, deadline, control_id, assigned_to, risk_level, remediation_plan, milestone } = req.body;
  run(`INSERT INTO iato_checklist (assessment_id, control_id, description, risk_level,
    remediation_plan, milestone, deadline, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, control_id, description, risk_level || 'medium',
     remediation_plan || '', milestone || '', deadline, assigned_to, req.user.id]);
  req.flash('success', 'POA&M item added');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/:itemId/update', ensureAuthenticated, (req, res) => {
  const { status, risk_level, assigned_to, deadline, remediation_plan, milestone, evidence_text } = req.body;
  const updates = [];
  const params = [];

  if (status) { updates.push('status = ?'); params.push(status); }
  if (risk_level) { updates.push('risk_level = ?'); params.push(risk_level); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
  if (deadline) { updates.push('deadline = ?'); params.push(deadline); }
  if (remediation_plan !== undefined) { updates.push('remediation_plan = ?'); params.push(remediation_plan); }
  if (milestone !== undefined) { updates.push('milestone = ?'); params.push(milestone); }
  if (evidence_text !== undefined) { updates.push('evidence_text = ?'); params.push(evidence_text); }

  if (status === 'completed') {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }
  if (status === 'verified') {
    updates.push('verified_at = CURRENT_TIMESTAMP');
    updates.push('verified_by = ?'); params.push(req.user.id);
  }

  if (updates.length) {
    params.push(req.params.itemId, req.params.id);
    run(`UPDATE iato_checklist SET ${updates.join(', ')} WHERE id = ? AND assessment_id = ?`, params);
  }
  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.json({ success: true });
  }
  req.flash('success', 'POA&M item updated');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/:itemId/delete', ensureAuthenticated, (req, res) => {
  run('DELETE FROM iato_checklist WHERE id = ? AND assessment_id = ?', [req.params.itemId, req.params.id]);
  req.flash('success', 'POA&M item removed');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/auto-populate', ensureAuthenticated, (req, res) => {
  const controls = all(`SELECT * FROM assessment_controls WHERE assessment_id = ? AND is_applicable = 1 
    AND (audit_result = 'not-met' OR audit_result = 'partially-met')`, [req.params.id]);
  const existing = all('SELECT control_id FROM iato_checklist WHERE assessment_id = ?', [req.params.id]);
  const existingIds = new Set(existing.map(e => e.control_id));
  let added = 0;

  controls.forEach(c => {
    if (!existingIds.has(c.control_id)) {
      const riskLevel = c.risk_level || computeRiskLevel(c);
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + (riskLevel === 'high' ? 30 : riskLevel === 'medium' ? 60 : 90));
      run(`INSERT INTO iato_checklist (assessment_id, control_id, description, risk_level,
        original_finding, deadline, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [req.params.id, c.control_id,
         `Remediate ${c.control_id} — ${c.title}`,
         riskLevel, c.audit_comments || `${c.audit_result}: ${c.title}`,
         defaultDeadline.toISOString().split('T')[0], req.user.id]);
      added++;
    }
  });
  req.flash('success', `Auto-populated ${added} POA&M items from ${controls.length} findings (${existing.length} already existed).`);
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── REACTIVATE SUBMISSION ──
router.post('/assessments/:id/reactivate', ensureAuthenticated, (req, res) => {
  run(`UPDATE assessments SET status = 'evidence-gathering', submitted_at = NULL, 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
  run(`UPDATE assessment_controls SET evidence_status = 'pending' WHERE assessment_id = ?`, [req.params.id]);
  req.flash('success', 'Submission reactivated for updates');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── PDF EXPORT ──
router.get('/assessments/:id/export-pdf', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`SELECT a.*, p.* FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?`, [req.params.id]);
    const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);

    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `sa-report-${assessment.id}-${Date.now()}.pdf`);

    await pdfExport.generateAssessmentReport(assessment, controls, assessment, outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to generate PDF');
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

router.get('/assessments/:id/generate-ato', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`SELECT a.*, p.* FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?`, [req.params.id]);
    const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);

    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const atoType = assessment.ato_type || 'ato';
    const outputPath = path.join(outputDir, `${atoType}-${assessment.id}-${Date.now()}.pdf`);

    await pdfExport.generateATODocument(assessment, assessment, atoType, controls, outputPath, {
      poamItems: all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY CASE risk_level WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, deadline', [assessment.id]),
      riskAcceptance: assessment.risk_acceptance_statement || '',
      poamNotes: assessment.poam_notes || ''
    });
    
    run(`UPDATE assessments SET ato_generated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assessment.id]);
    res.download(outputPath);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to generate ATO document');
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

// ── DELETE ASSESSMENT (Draft only) ──
router.post('/assessments/:id/delete', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }
  if (assessment.status !== 'draft') {
    req.flash('error', 'Only draft assessments can be deleted. This assessment is currently in "' + assessment.status + '" status.');
    return res.redirect(`/admin/assessments/${assessment.id}`);
  }

  // Cascade delete related data
  run('DELETE FROM comments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [assessment.id]);
  run('DELETE FROM attachments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [assessment.id]);
  run('DELETE FROM iato_checklist WHERE assessment_id = ?', [assessment.id]);
  run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'assessment' AND entity_id = ?", [assessment.id]);
  run('DELETE FROM assessment_controls WHERE assessment_id = ?', [assessment.id]);
  run('DELETE FROM assessments WHERE id = ?', [assessment.id]);

  req.flash('success', 'Draft assessment deleted successfully');
  res.redirect(req.body.return_to || '/admin/assessments');
});

// ── DELETE PROJECT ──
router.post('/projects/:id/delete', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  // Check for non-draft assessments
  const nonDraftAssessments = all(
    "SELECT id, status, invite_code FROM assessments WHERE project_id = ? AND status != 'draft'",
    [project.id]
  );

  if (nonDraftAssessments.length > 0) {
    const statuses = nonDraftAssessments.map(a => `${a.invite_code} (${a.status})`).join(', ');
    req.flash('error', `Cannot delete project — it contains ${nonDraftAssessments.length} non-draft assessment(s): ${statuses}. Only projects with all assessments in draft status can be deleted.`);
    return res.redirect(`/admin/projects/${project.id}`);
  }

  // Delete all draft assessments and their related data
  const draftAssessments = all("SELECT id FROM assessments WHERE project_id = ?", [project.id]);
  draftAssessments.forEach(a => {
    run('DELETE FROM comments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [a.id]);
    run('DELETE FROM attachments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [a.id]);
    run('DELETE FROM iato_checklist WHERE assessment_id = ?', [a.id]);
    run('DELETE FROM assessment_controls WHERE assessment_id = ?', [a.id]);
    run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'assessment' AND entity_id = ?", [a.id]);
    run('DELETE FROM assessments WHERE id = ?', [a.id]);
  });

  const projectIntakes = all('SELECT id FROM intake_submissions WHERE project_id = ?', [project.id]);
  projectIntakes.forEach(i => {
    run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'intake' AND entity_id = ?", [i.id]);
  });
  run('DELETE FROM intake_attachments WHERE intake_id IN (SELECT id FROM intake_submissions WHERE project_id = ?)', [project.id]);
  run('DELETE FROM intake_submissions WHERE project_id = ?', [project.id]);
  run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'project' AND entity_id = ?", [project.id]);

  // Delete the project itself
  run('DELETE FROM projects WHERE id = ?', [project.id]);

  req.flash('success', `Project "${project.name}" and ${draftAssessments.length} draft assessment(s) deleted`);
  res.redirect('/admin/projects');
});

// ── SETTINGS ──
router.get('/settings', ensureAuthenticated, (req, res) => {
  res.render('admin/settings', {
    title: 'Settings', isAdmin: true, isSettings: true, admin: req.user
  });
});

// ── INTAKE MANAGEMENT ──

const PII_LABELS = {
  'name-address': 'Name, Address & Contact Info',
  'sin': 'Social Insurance Number (SIN)',
  'financial': 'Financial Information',
  'health': 'Health / Medical Records',
  'biometric': 'Biometric Data',
  'employment': 'Employment / HR Records',
  'immigration': 'Immigration / Citizenship',
  'law-enforcement': 'Law Enforcement / Criminal Records',
  'indigenous': 'Indigenous / Treaty Data'
};

const ACTIVITY_LABELS = {
  'tra': 'Threat & Risk Assessment (TRA)',
  'pia': 'Privacy Impact Assessment (PIA)',
  'ssp': 'System Security Plan (SSP)',
  'vapt': 'Vulnerability Assessment / Pen Test',
  'network-diagram': 'Network / Architecture Diagram',
  'previous-sa': 'Previous SA&A / ATO'
};

// List all intakes
router.get('/intakes', ensureAuthenticated, (req, res) => {
  const intakes = all('SELECT * FROM intake_submissions ORDER BY created_at DESC');
  const pending = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'pending'")[0]?.c || 0;
  const accepted = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'accepted'")[0]?.c || 0;
  const inReview = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'in-review'")[0]?.c || 0;

  res.render('admin/intakes', {
    title: 'Intake Submissions', isAdmin: true, isIntakes: true,
    admin: req.user, intakes,
    stats: { total: intakes.length, pending, accepted, inReview }
  });
});

// Review a single intake
router.get('/intakes/:id', ensureAuthenticated, (req, res) => {
  const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
  if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

  const piiTypes = JSON.parse(intake.pii_types || '[]');
  const technologies = JSON.parse(intake.technologies || '[]');
  const activities = JSON.parse(intake.completed_activities || '[]');

  const attachments = all('SELECT * FROM intake_attachments WHERE intake_id = ?', [intake.id]);
  attachments.forEach(a => {
    a.size_display = a.size > 1048576 ? (a.size / 1048576).toFixed(1) + ' MB' : (a.size / 1024).toFixed(0) + ' KB';
  });

  const allTechnologies = Object.entries(COMMON_TECHNOLOGIES).map(([key, val]) => ({
    key, name: val.name, alreadySelected: technologies.includes(key)
  }));
  const assignments = getEntityAssignments('intake', [intake.id]);
  const linkedAssessments = all('SELECT id, type, status, invite_code FROM assessments WHERE intake_id = ? ORDER BY created_at DESC', [intake.id]);

  // Engine preview
  let engineDesc = intake.project_description || '';
  if (intake.interconnections) engineDesc += ' integration interconnect API ' + intake.interconnections;
  if (intake.mobile_access === 'yes') engineDesc += ' mobile byod';
  if (intake.external_users === 'yes') engineDesc += ' external public';

  const recommended = getRecommendedControls({
    dataClassification: intake.data_classification,
    confidentiality: intake.confidentiality_level || intake.data_classification,
    hostingType: intake.hosting_type,
    appType: intake.app_type, hasPII: intake.has_pii === 1,
    technologies, description: engineDesc,
    securityProfile: intake.security_profile || 'PBMM',
    isHVA: intake.is_hva === 1
  });

  const saaCheck = assessSAARequirement({
    dataClassification: intake.data_classification,
    confidentiality: intake.confidentiality_level || intake.data_classification,
    hasPII: intake.has_pii === 1,
    description: engineDesc, appType: intake.app_type
  });

  // Profile determination for display
  const confLevel = intake.confidentiality_level || intake.data_classification || 'protected-b';
  const intLevel = intake.integrity_level || 'medium';
  const avaLevel = intake.availability_level || 'medium';
  const profileResult = determineProfile({
    confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
    hasPII: intake.has_pii === 1, isHVA: intake.is_hva === 1,
    hasComplexity: detectComplexity(engineDesc)
  });
  const catLabel = categorizationLabel(confLevel, intLevel, avaLevel);
  const catFullLabel = categorizationFullLabel(confLevel, intLevel, avaLevel);

  res.render('admin/intake-review', {
    title: 'Review: ' + intake.project_name, isAdmin: true,
    user: req.user, intake, attachments, assignments, linkedAssessments,
    users: getAssignableUsers(),
    piiList: piiTypes.filter(p => p !== 'none').map(p => PII_LABELS[p] || p),
    techList: technologies.map(t => COMMON_TECHNOLOGIES[t]?.name || t),
    activityList: activities.map(a => ACTIVITY_LABELS[a] || a),
    allTechnologies,
    controlCount: recommended.length,
    p1Count: recommended.filter(c => c.priority === 'P1').length,
    p2Count: recommended.filter(c => c.priority === 'P2').length,
    p3Count: recommended.filter(c => c.priority === 'P3').length,
    inheritedCount: recommended.filter(c => c.isInherited).length,
    nonInheritedCount: recommended.filter(c => !c.isInherited).length,
    profileId: profileResult.profile.id,
    saaRequired: saaCheck.requiresSAA,
    saaReason: saaCheck.reason,
    catLabel, catFullLabel,
    profileName: profileResult.profile.name,
    profileShortName: profileResult.profile.shortName,
    profileReason: profileResult.reason,
    tailoringNotes: profileResult.tailoringNotes,
    profileColor: profileResult.profile.color
  });
});

router.post('/intakes/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

    const result = assignEntityFromRequest({
      req,
      entityType: 'intake',
      entityId: intake.id,
      entityName: intake.project_name
    });

    if (req.body.assign_linked_assessments === '1') {
      const linked = all('SELECT id FROM assessments WHERE intake_id = ?', [intake.id]);
      linked.forEach(a => assignEntityFromRequest({
        req,
        entityType: 'assessment',
        entityId: a.id,
        entityName: intake.project_name
      }));
    }

    req.flash('success', `Intake assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/intakes/${intake.id}`);
  } catch (err) {
    console.error('Intake assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/intakes/${req.params.id}`);
  }
});

// Update intake status
router.post('/intakes/:id/status', ensureAuthenticated, (req, res) => {
  const { status, declineReason } = req.body;
  if (declineReason) {
    run('UPDATE intake_submissions SET status = ?, decline_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, declineReason, req.params.id]);
  } else {
    run('UPDATE intake_submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]);
  }
  req.flash('success', 'Intake status updated to ' + status);
  res.redirect('/admin/intakes/' + req.params.id);
});

// Create project + assessment from intake
router.post('/intakes/:id/create-project', ensureAuthenticated, (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

    const submittedTech = JSON.parse(intake.technologies || '[]');
    const additionalTech = Array.isArray(req.body.additionalTech) ? req.body.additionalTech : (req.body.additionalTech ? [req.body.additionalTech] : []);
    const allTech = [...new Set([...submittedTech, ...additionalTech])];

    const classification = req.body.overrideClassification || intake.data_classification;
    const appType = req.body.overrideAppType || intake.app_type;
    const confLevel = req.body.overrideClassification || intake.confidentiality_level || classification;
    const intLevel = req.body.overrideIntegrity || intake.integrity_level || 'medium';
    const avaLevel = req.body.overrideAvailability || intake.availability_level || 'medium';
    const isHVA = req.body.overrideHVA ? 1 : (intake.is_hva || 0);

    // Determine profile using the full C/I/A engine (with any admin overrides)
    const profileResult = determineProfile({
      confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
      hasPII: intake.has_pii === 1, isHVA: isHVA === 1,
      hasComplexity: detectComplexity(intake.project_description || '')
    });
    const securityProfile = profileResult.profile.id;

    console.log('[Intake→Project] C/I/A:', confLevel, intLevel, avaLevel,
      'HVA:', isHVA, 'PII:', intake.has_pii,
      '→ Profile:', securityProfile, '(' + profileResult.reason + ')');

    let fullDescription = intake.project_description || '';
    if (intake.interconnections) fullDescription += '\nInterconnections: ' + intake.interconnections;
    if (intake.mobile_access === 'yes') fullDescription += '\nMobile/BYOD access required.';
    if (intake.external_users === 'yes') fullDescription += '\nExternal users will access the system.';
    if (req.body.assessorDescription) fullDescription += '\n' + req.body.assessorDescription;

    const slug = intake.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const projectId = run(
      `INSERT INTO projects (name, slug, description, data_classification,
        confidentiality_level, integrity_level, availability_level, security_profile, is_hva,
        hosting_type, app_type, has_pii, technologies, specifications,
        project_owner_name, project_owner_email,
        project_authority_name, project_authority_email, department, branch, status, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [intake.project_name, slug, fullDescription, classification,
        confLevel, intLevel, avaLevel, securityProfile, isHVA,
        intake.hosting_type, appType,
        intake.has_pii, JSON.stringify(allTech), intake.other_tech || '',
        intake.owner_name, intake.owner_email,
        intake.authority_name || '', intake.authority_email || '',
        intake.department || '', intake.branch || '', 'active', req.user.id]
    );

    // Check if SA&A is required
    const saaCheck = assessSAARequirement({
      dataClassification: classification, confidentiality: confLevel,
      hasPII: intake.has_pii === 1, description: fullDescription, appType
    });

    if (!saaCheck.requiresSAA) {
      // No SA&A needed — redirect to guidance report
      run(`UPDATE intake_submissions SET status = 'accepted', project_id = ?, assessor_notes = ?,
        assessor_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]);

      req.flash('success', `Project "${intake.project_name}" created. No formal SA&A required — a GC Web Guidance Report has been generated.`);
      return res.redirect('/admin/projects/' + projectId + '/guidance');
    }

    const recommended = getRecommendedControls({
      dataClassification: classification, confidentiality: confLevel,
      hostingType: intake.hosting_type, appType, hasPII: intake.has_pii === 1,
      technologies: allTech, description: fullDescription,
      securityProfile: securityProfile, isHVA: isHVA === 1
    });

    // Apply admin filtering options
    let filtered = recommended;
    if (req.body.excludeInherited === '1') {
      filtered = filtered.filter(c => !c.isInherited);
    }
    if (req.body.onlyP1P2 === '1') {
      filtered = filtered.filter(c => c.priority === 'P1' || c.priority === 'P2');
    }

    console.log('[Intake→Project] Profile:', securityProfile,
      'Recommended:', recommended.length,
      'After filters:', filtered.length,
      '(excludeInherited:', req.body.excludeInherited || 'no',
      'onlyP1P2:', req.body.onlyP1P2 || 'no', ')');

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentId = run(
      `INSERT INTO assessments (project_id, intake_id, type, status, invite_code, created_by) VALUES (?,?,?,?,?,?)`,
      [projectId, intake.id, req.body.assessmentType || 'initial', 'draft', inviteCode, req.user.id]
    );
    copyIntakeAssignmentsToAssessment(intake.id, assessmentId, req.user.id);

    const grouped = groupByFamily(filtered);
    grouped.forEach(family => {
      family.controls.forEach(control => {
        run(
          `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, description,
            tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority, risk_level
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [assessmentId, control.id, control.family, control.familyName, control.title, control.description,
            control.tailoredDescription, control.evidenceGuidance,
            control.isInherited ? 1 : 0, control.inheritedFrom.join(', '), 1, control.priority,
            computeRiskLevel(control)]
        );
      });
    });

    run(`UPDATE intake_submissions SET status = 'accepted', project_id = ?, assessor_notes = ?,
      assessor_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]);

    req.flash('success', `Project "${intake.project_name}" created with ${filtered.length} controls (profile: ${securityProfile}).`);
    res.redirect('/admin/assessments/' + assessmentId);
  } catch (err) {
    console.error('Create project from intake error:', err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/intakes/' + req.params.id);
  }
});

// Download intake attachment
router.get('/intakes/attachment/:id', ensureAuthenticated, (req, res) => {
  const attachment = get('SELECT * FROM intake_attachments WHERE id = ?', [req.params.id]);
  if (!attachment) { req.flash('error', 'Attachment not found'); return res.redirect('/admin/intakes'); }
  res.download(path.join(__dirname, '..', 'uploads', 'intakes', attachment.filename), attachment.original_name);
});

// ══════════════════════════════════════════════════════
// GC WEB GUIDANCE REPORT (no-assessment-required path)
// ══════════════════════════════════════════════════════

router.get('/projects/:projectId/guidance', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  // Get or create guidance report
  let report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  // Parse saved checklist responses
  let responses = {};
  if (report) {
    try { responses = JSON.parse(report.checklist_responses || '{}'); } catch(e) {}
  }

  // Merge responses into guidance items for display
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

  // Count submitted statuses
  let metCount = 0, inProgressCount = 0, naCount = 0, pendingCount = 0;
  Object.values(responses).forEach(r => {
    if (r.status === 'met') metCount++;
    else if (r.status === 'in-progress') inProgressCount++;
    else if (r.status === 'na') naCount++;
    else pendingCount++;
  });

  res.render('admin/guidance-report', {
    title: 'GC Web Guidance Report',
    isAdmin: true, isProjects: true,
    admin: req.user, project, report,
    guidance: guidanceWithResponses,
    totalRequired, totalRecommended,
    metCount, inProgressCount, naCount, pendingCount
  });
});

router.post('/projects/:projectId/guidance/send-invite', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  let report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);
  const inviteCode = uuidv4().substring(0, 8).toUpperCase();

  if (!report) {
    run(`INSERT INTO guidance_reports (project_id, invite_code, status, created_by) VALUES (?,?,?,?)`,
      [project.id, inviteCode, 'sent', req.user.id]);
  } else {
    run(`UPDATE guidance_reports SET invite_code = ?, status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [report.invite_code || inviteCode, report.id]);
  }

  report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);

  // Send email if owner email is available
  if (project.project_owner_email) {
    try {
      emailService.sendMail({
        to: project.project_owner_email,
        subject: `GC Web Guidance Checklist — ${project.name}`,
        text: `You have been invited to complete a GC Web Standards compliance checklist for "${project.name}".\n\nPlease use the following link to access and complete the checklist:\n\n${req.protocol}://${req.get('host')}/guidance/${report.invite_code}\n\nAccess Code: ${report.invite_code}`
      });
    } catch(e) { console.error('Email send error:', e); }
  }

  req.flash('success', `Guidance invite sent! Code: ${report.invite_code}` +
    (project.project_owner_email ? ` — email sent to ${project.project_owner_email}` : ''));
  res.redirect(`/admin/projects/${project.id}/guidance`);
});

router.post('/projects/:projectId/guidance/validate', ensureAuthenticated, (req, res) => {
  const report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [req.params.projectId]);
  if (!report) { req.flash('error', 'Guidance report not found'); return res.redirect('/admin/projects'); }

  const { action, reviewer_notes } = req.body;

  if (action === 'validate') {
    run(`UPDATE guidance_reports SET status = 'validated', reviewer_notes = ?, 
      validated_at = CURRENT_TIMESTAMP, validated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer_notes || '', req.user.id, report.id]);
    req.flash('success', 'Guidance checklist validated and approved.');
  } else if (action === 'return') {
    run(`UPDATE guidance_reports SET status = 'returned', reviewer_notes = ?, 
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer_notes || '', report.id]);
    req.flash('warning', 'Checklist returned to project owner for revision.');
  }

  res.redirect(`/admin/projects/${req.params.projectId}/guidance`);
});

router.post('/projects/:projectId/guidance-notes', ensureAuthenticated, (req, res) => {
  req.flash('success', 'Notes saved.');
  res.redirect(`/admin/projects/${req.params.projectId}/guidance`);
});

router.get('/projects/:projectId/guidance-pdf', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  // Generate simple text-based PDF
  let html = `<h1>${project.name}</h1>`;
  html += `<h2>GC Web Standards & Guidance Report</h2>`;
  html += `<p><strong>${GC_WEB_GUIDANCE.summary.title}</strong></p>`;
  html += `<p>${GC_WEB_GUIDANCE.summary.description}</p>`;
  html += `<p><strong>${totalRequired}</strong> required items | <strong>${totalRecommended}</strong> recommended items</p><hr>`;

  GC_WEB_GUIDANCE.categories.forEach(cat => {
    html += `<h3>${cat.title}</h3><p>${cat.description}</p><ul>`;
    cat.items.forEach(item => {
      const level = item.required ? '(REQUIRED)' : '(Recommended)';
      html += `<li>${level} ${item.text}</li>`;
    });
    html += '</ul>';
  });
  html += `<hr><p><em>${GC_WEB_GUIDANCE.summary.footer}</em></p>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-zA-Z0-9]/g,'-')}-GC-Web-Guidance.html"`);
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.name} - GC Web Guidance</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:2rem auto;line-height:1.6}
    h1{color:#26374A}h2,h3{color:#2B4380}ul{margin-bottom:1.5rem}li{margin-bottom:0.5rem}</style></head><body>${html}</body></html>`);
});

// ══════════════════════════════════════════════════════
// CONTROL MANAGEMENT (add/remove/update on assessments)
// ══════════════════════════════════════════════════════

router.get('/assessments/:id/manage-controls', ensureAuthenticated, (req, res) => {
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.data_classification, p.app_type
    FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
  `, [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  // Current controls in this assessment
  const currentControls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);
  const currentIds = new Set(currentControls.map(c => c.control_id));

  // Group current controls by family
  const currentGrouped = {};
  currentControls.forEach(c => {
    if (!currentGrouped[c.family]) {
      currentGrouped[c.family] = { code: c.family, name: c.family_name || CONTROL_FAMILIES[c.family], controls: [] };
    }
    currentGrouped[c.family].controls.push(c);
  });
  const currentFamilies = Object.values(currentGrouped);

  // All ITSG-33 controls grouped by family, marking which are already added
  const allControlsMarked = CONTROLS.map(c => ({
    ...c,
    familyName: CONTROL_FAMILIES[c.family],
    alreadyAdded: currentIds.has(c.id)
  }));
  const allGrouped = {};
  allControlsMarked.forEach(c => {
    if (!allGrouped[c.family]) {
      allGrouped[c.family] = { code: c.family, name: CONTROL_FAMILIES[c.family], controls: [] };
    }
    allGrouped[c.family].controls.push(c);
  });
  const allFamilies = Object.values(allGrouped);

  res.render('admin/manage-controls', {
    title: 'Manage Controls', isAdmin: true, isAssessments: true,
    admin: req.user, assessment,
    currentFamilies, currentCount: currentControls.length,
    allFamilies, availableCount: CONTROLS.length - currentIds.size
  });
});

// Add controls to an existing assessment
router.post('/assessments/:id/add-controls', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const addIds = req.body.add_control_ids || [];
  const idList = Array.isArray(addIds) ? addIds : [addIds];

  // Get existing control IDs to avoid duplicates
  const existing = new Set(all('SELECT control_id FROM assessment_controls WHERE assessment_id = ?', [assessment.id]).map(c => c.control_id));

  const statements = [];
  idList.forEach(cid => {
    if (existing.has(cid)) return; // skip duplicates
    const ctrl = CONTROLS.find(c => c.id === cid);
    if (!ctrl) return;
    const family = cid.split('-')[0];
    statements.push({
      sql: `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, 
        description, tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [assessment.id, cid, family, CONTROL_FAMILIES[family] || family,
        ctrl.title, ctrl.description, '', ctrl.evidenceGuidance || '', 0, '', 1, ctrl.priority]
    });
  });

  if (statements.length > 0) {
    runBatch(statements);
    req.flash('success', `Added ${statements.length} control(s) to the assessment.`);
  } else {
    req.flash('info', 'No new controls to add.');
  }
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

// Remove a control from an assessment
router.post('/assessments/:id/remove-control/:controlId', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const control = get('SELECT * FROM assessment_controls WHERE id = ? AND assessment_id = ?',
    [req.params.controlId, assessment.id]);
  if (!control) { req.flash('error', 'Control not found'); return res.redirect(`/admin/assessments/${assessment.id}/manage-controls`); }

  run('DELETE FROM assessment_controls WHERE id = ? AND assessment_id = ?', [req.params.controlId, assessment.id]);
  req.flash('success', `Removed ${control.control_id} — ${control.title}`);
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

// Update a control on an assessment (tailored description, guidance, applicability, inheritance)
router.post('/assessments/:id/update-control/:controlId', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const { tailored_description, evidence_guidance, is_applicable, is_inherited, inherited_from } = req.body;
  run(`UPDATE assessment_controls SET 
    tailored_description = ?, evidence_guidance = ?, is_applicable = ?, 
    is_inherited = ?, inherited_from = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND assessment_id = ?`,
    [tailored_description || '', evidence_guidance || '',
     is_applicable === '0' ? 0 : 1, is_inherited === '1' ? 1 : 0,
     inherited_from || '', req.params.controlId, assessment.id]);

  req.flash('success', 'Control updated.');
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

module.exports = router;
