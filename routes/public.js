const express = require('express');
const router = express.Router();
const { run, all, get } = require('../models/database');
const emailService = require('../utils/emailService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
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
      p.project_owner_name, p.data_classification
    FROM assessments a JOIN projects p ON a.project_id = p.id 
    WHERE UPPER(TRIM(a.invite_code)) = ?
  `, [code]);

  if (!assessment) {
    console.log('[Public] No assessment found for code:', code);
    // Debug: check if any assessment has this code at all
    const raw = get('SELECT id, status, invite_code FROM assessments WHERE invite_code = ?', [code]);
    if (raw) {
      console.log('[Public] Found raw match:', raw);
    }
    return res.render('error', { title: 'Invalid Code', message: 'The access code is not valid. Please check the code and try again.', showAccessForm: true });
  }
  
  console.log('[Public] Found assessment ID:', assessment.id, 'status:', assessment.status);
  if (assessment.status === 'draft') {
    return res.render('error', { title: 'Not Ready', message: 'This assessment has not been activated yet.', showAccessForm: false });
  }
  if (assessment.invite_expires_at && new Date(assessment.invite_expires_at) < new Date()) {
    return res.render('error', { title: 'Expired', message: 'This invitation has expired.', showAccessForm: false });
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

  res.render('public/respond', {
    title: `Evidence Submission – ${assessment.project_name}`,
    assessment, inviteCode: code,
    clientName: assessment.project_owner_name,
    families: Object.values(families),
    controls, total, provided,
    progress: total > 0 ? Math.round(provided / total * 100) : 0,
    isSubmitted, isReadOnly
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
router.post('/respond/:code/submit', (req, res) => {
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
    });
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

module.exports = router;
