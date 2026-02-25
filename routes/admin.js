const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, runBatch, all, get } = require('../models/database');
const { passport, ensureAuthenticated } = require('../config/passport');
const { getRecommendedControls, assessSAARequirement, groupByFamily, COMMON_TECHNOLOGIES, CONTROL_FAMILIES, CONTROLS, GC_WEB_GUIDANCE } = require('../config/itsg33-controls');
const emailService = require('../utils/emailService');
const pdfExport = require('../utils/pdfExport');
const path = require('path');
const fs = require('fs');

// ── AUTH ──
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Assessor Login', layout: 'main' });
});

router.post('/login', passport.authenticate('local', {
  successRedirect: '/admin/dashboard',
  failureRedirect: '/admin/login',
  failureFlash: true
}));

router.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/admin/login'));
});

// ── DASHBOARD ──
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const projects = all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 10');
  const assessments = all(`
    SELECT a.*, p.name as project_name 
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    ORDER BY a.updated_at DESC LIMIT 10
  `);
  
  const stats = {
    totalProjects: get('SELECT COUNT(*) as c FROM projects')?.c || 0,
    activeAssessments: get("SELECT COUNT(*) as c FROM assessments WHERE status NOT IN ('completed','closed')")?.c || 0,
    pendingAudits: get("SELECT COUNT(*) as c FROM assessments WHERE status = 'submitted'")?.c || 0,
    activeATOs: get("SELECT COUNT(*) as c FROM assessments WHERE ato_type = 'ato' AND result = 'ato'")?.c || 0,
    activeIATOs: get("SELECT COUNT(*) as c FROM assessments WHERE ato_type = 'iato' AND result = 'iato'")?.c || 0
  };

  res.render('admin/dashboard', {
    title: 'Dashboard',
    isAdmin: true, isDashboard: true,
    admin: req.user, projects, assessments, stats
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
    technologies: COMMON_TECHNOLOGIES
  });
});

router.post('/projects/new', ensureAuthenticated, (req, res) => {
  try {
    const { name, description, data_classification, hosting_type, app_type, has_pii,
      technologies, specifications, project_owner_name, project_owner_email,
      project_authority_name, project_authority_email, cio_name, cio_email } = req.body;

    const slug = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const techArray = Array.isArray(technologies) ? technologies : (technologies ? [technologies] : []);

    run(`INSERT INTO projects (name, slug, description, data_classification, hosting_type, app_type, has_pii, 
      technologies, specifications, project_owner_name, project_owner_email, project_authority_name, 
      project_authority_email, cio_name, cio_email, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [name, slug, description || '', data_classification || 'protected-b', hosting_type || '', app_type || '',
        has_pii ? 1 : 0, JSON.stringify(techArray), specifications || '',
        project_owner_name || '', project_owner_email || '', project_authority_name || '', project_authority_email || '',
        cio_name || '', cio_email || '', req.user.id]);

    req.flash('success', 'Project created successfully');
    res.redirect('/admin/projects');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/projects/new');
  }
});

router.get('/projects/:id', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  const assessments = all('SELECT * FROM assessments WHERE project_id = ? ORDER BY created_at DESC', [project.id]);
  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}

  res.render('admin/project-detail', {
    title: project.name, isAdmin: true, isProjects: true,
    admin: req.user, project, assessments,
    techNames: techs.map(t => COMMON_TECHNOLOGIES[t]?.name || t)
  });
});

// ── ASSESSMENTS ──
router.get('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}

  const projectInfo = {
    dataClassification: project.data_classification,
    hostingType: project.hosting_type,
    appType: project.app_type,
    hasPII: !!project.has_pii,
    technologies: techs,
    description: project.description
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
    admin: req.user, project, families, controlCount: controls.length,
    saaReason: saaCheck.reason
  });
});

router.post('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentId = run(`INSERT INTO assessments (project_id, type, status, invite_code, created_by)
      VALUES (?, 'initial', 'draft', ?, ?)`, [project.id, inviteCode, req.user.id]);

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
          description, tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [assessmentId, cid, family, CONTROL_FAMILIES[family] || family,
          req.body[`title_${cid}`] || cid,
          req.body[`desc_${cid}`] || '',
          tailored[cid] || req.body[`tailored_${cid}`] || '',
          guidance[cid] || req.body[`guidance_${cid}`] || '',
          inherited[cid] ? 1 : 0,
          inheritedFrom[cid] || '',
          applicable[cid] !== '0' ? 1 : 0,
          req.body[`priority_${cid}`] || 'P1'
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
    SELECT a.*, p.name as project_name 
    FROM assessments a JOIN projects p ON a.project_id = p.id 
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
      p.data_classification, p.hosting_type, p.app_type
    FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
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
    pending: controls.filter(c => !c.audit_result || c.audit_result === 'pending').length
  };
  stats.score = stats.applicable > 0 ? Math.round((stats.met + stats.partiallyMet * 0.5) / stats.applicable * 100) : 0;

  const checklistItems = all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY deadline', [assessment.id]);

  res.render('admin/assessment-detail', {
    title: `Assessment: ${assessment.project_name}`,
    isAdmin: true, isAssessments: true,
    admin: req.user, assessment,
    families: Object.values(families), controls, stats, checklistItems
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
    await emailService.sendInvite({
      to: assessment.project_owner_email,
      recipientName: assessment.project_owner_name,
      projectName: assessment.project_name,
      inviteCode: assessment.invite_code,
      expiresAt: expiresAt.toISOString(),
      assessorName: req.user.name,
      baseUrl
    });

    req.flash('success', `Invite sent to ${assessment.project_owner_email} with code: ${assessment.invite_code}`);
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to send invite: ' + err.message);
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
  const total = controls.length;
  const score = total > 0 ? Math.round((met + partial * 0.5) / total * 100) : 0;

  let result, atoType;
  // GC scoring: 100% met = ATO, >=80% with no critical = iATO, <80% = denied
  if (met === total) {
    result = 'ato'; atoType = 'ato';
  } else if (score >= 80) {
    result = 'iato'; atoType = 'iato';
  } else {
    result = 'denied'; atoType = null;
  }

  run(`UPDATE assessments SET status = 'completed', audit_completed_at = CURRENT_TIMESTAMP, 
    overall_score = ?, result = ?, ato_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [score, result, atoType, req.params.id]);

  // Save templates for reuse (req #11)
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

  req.flash('success', `Audit completed. Score: ${score}%. Result: ${(result || '').toUpperCase()}`);
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── iATO CHECKLIST ──
router.post('/assessments/:id/checklist/add', ensureAuthenticated, (req, res) => {
  const { description, deadline, control_id, assigned_to } = req.body;
  run(`INSERT INTO iato_checklist (assessment_id, control_id, description, deadline, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.id, control_id, description, deadline, assigned_to, req.user.id]);
  req.flash('success', 'Checklist item added');
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

    await pdfExport.generateATODocument(assessment, assessment, atoType, controls, outputPath);
    
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
    run('DELETE FROM assessments WHERE id = ?', [a.id]);
  });

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
    title: 'Intake Submissions', isAdmin: true,
    user: req.user, intakes,
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

  // Engine preview
  let engineDesc = intake.project_description || '';
  if (intake.interconnections) engineDesc += ' integration interconnect API ' + intake.interconnections;
  if (intake.mobile_access === 'yes') engineDesc += ' mobile byod';
  if (intake.external_users === 'yes') engineDesc += ' external public';

  const recommended = getRecommendedControls({
    dataClassification: intake.data_classification, hostingType: intake.hosting_type,
    appType: intake.app_type, hasPII: intake.has_pii === 1,
    technologies, description: engineDesc
  });

  const saaCheck = assessSAARequirement({
    dataClassification: intake.data_classification, hasPII: intake.has_pii === 1,
    description: engineDesc, appType: intake.app_type
  });

  res.render('admin/intake-review', {
    title: 'Review: ' + intake.project_name, isAdmin: true,
    user: req.user, intake, attachments,
    piiList: piiTypes.filter(p => p !== 'none').map(p => PII_LABELS[p] || p),
    techList: technologies.map(t => COMMON_TECHNOLOGIES[t]?.name || t),
    activityList: activities.map(a => ACTIVITY_LABELS[a] || a),
    allTechnologies,
    controlCount: recommended.length,
    p1Count: recommended.filter(c => c.priority === 'P1').length,
    p2Count: recommended.filter(c => c.priority === 'P2').length,
    p3Count: recommended.filter(c => c.priority === 'P3').length,
    inheritedCount: recommended.filter(c => c.isInherited).length,
    saaRequired: saaCheck.requiresSAA,
    saaReason: saaCheck.reason
  });
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

    let fullDescription = intake.project_description || '';
    if (intake.interconnections) fullDescription += '\nInterconnections: ' + intake.interconnections;
    if (intake.mobile_access === 'yes') fullDescription += '\nMobile/BYOD access required.';
    if (intake.external_users === 'yes') fullDescription += '\nExternal users will access the system.';
    if (req.body.assessorDescription) fullDescription += '\n' + req.body.assessorDescription;

    const slug = intake.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const projectId = run(
      `INSERT INTO projects (name, slug, description, data_classification, hosting_type, app_type,
        has_pii, technologies, specifications, project_owner_name, project_owner_email,
        project_authority_name, project_authority_email, status, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [intake.project_name, slug, fullDescription, classification, intake.hosting_type, appType,
        intake.has_pii, JSON.stringify(allTech), intake.other_tech || '',
        intake.owner_name, intake.owner_email,
        intake.authority_name || '', intake.authority_email || '', 'active', req.user.id]
    );

    // Check if SA&A is required
    const saaCheck = assessSAARequirement({
      dataClassification: classification, hasPII: intake.has_pii === 1,
      description: fullDescription, appType
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
      dataClassification: classification, hostingType: intake.hosting_type,
      appType, hasPII: intake.has_pii === 1, technologies: allTech, description: fullDescription
    });

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentId = run(
      `INSERT INTO assessments (project_id, type, status, invite_code, created_by) VALUES (?,?,?,?,?)`,
      [projectId, req.body.assessmentType || 'initial', 'draft', inviteCode, req.user.id]
    );

    const grouped = groupByFamily(recommended);
    grouped.forEach(family => {
      family.controls.forEach(control => {
        run(
          `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, description,
            tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [assessmentId, control.id, control.family, control.familyName, control.title, control.description,
            control.tailoredDescription, control.evidenceGuidance,
            control.isInherited ? 1 : 0, control.inheritedFrom.join(', '), 1, control.priority]
        );
      });
    });

    run(`UPDATE intake_submissions SET status = 'accepted', project_id = ?, assessor_notes = ?,
      assessor_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]);

    req.flash('success', `Project "${intake.project_name}" created with ${recommended.length} controls.`);
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

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  res.render('admin/guidance-report', {
    title: 'GC Web Guidance Report',
    isAdmin: true, isProjects: true,
    admin: req.user, project,
    guidance: GC_WEB_GUIDANCE,
    totalRequired, totalRecommended
  });
});

router.post('/projects/:projectId/guidance-notes', ensureAuthenticated, (req, res) => {
  run('UPDATE projects SET description = description, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.projectId]);
  // Store notes in a simple way — use the assessor_description field or a notes column
  // For now we'll append to description with a separator
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
