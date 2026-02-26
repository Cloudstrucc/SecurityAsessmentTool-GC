const express = require('express');
const router = express.Router();
const { run, all, get } = require('../models/database');
const { ensureAuthenticated } = require('../config/passport');

// Get comments for a control
router.get('/comments/:controlId', (req, res) => {
  const comments = all('SELECT * FROM comments WHERE assessment_control_id = ? ORDER BY created_at ASC', [req.params.controlId]);
  res.json({ success: true, comments });
});

// Add comment (authenticated)
router.post('/comments/:controlId', ensureAuthenticated, express.json(), (req, res) => {
  const { content, is_internal } = req.body;
  run(`INSERT INTO comments (assessment_control_id, user_id, user_name, user_role, content, is_internal)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.controlId, req.user.id, req.user.name, req.user.role, content, is_internal ? 1 : 0]);
  res.json({ success: true });
});

// Audit a control
router.post('/audit/:assessmentId/:controlId', ensureAuthenticated, express.json(), (req, res) => {
  const { result, comments } = req.body;
  run(`UPDATE assessment_controls SET audit_result = ?, audit_comments = ?, 
    audit_reviewed_at = CURRENT_TIMESTAMP, audit_reviewed_by = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND assessment_id = ?`,
    [result, comments, req.user.id, req.params.controlId, req.params.assessmentId]);
  res.json({ success: true });
});

// Update checklist item status
router.post('/checklist/:itemId/status', (req, res) => {
  const { status } = req.body;
  if (status === 'closed') {
    run('UPDATE iato_checklist SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.itemId]);
  } else {
    run('UPDATE iato_checklist SET status = ?, completed_at = NULL WHERE id = ?', [status, req.params.itemId]);
  }
  res.json({ success: true });
});

// Get assessment stats
router.get('/assessments/:id/stats', (req, res) => {
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ?', [req.params.id]);
  const applicable = controls.filter(c => c.is_applicable);
  res.json({
    total: controls.length,
    applicable: applicable.length,
    met: applicable.filter(c => c.audit_result === 'met').length,
    partiallyMet: applicable.filter(c => c.audit_result === 'partially-met').length,
    notMet: applicable.filter(c => c.audit_result === 'not-met').length,
    evidenceProvided: applicable.filter(c => c.evidence_status === 'provided').length
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI-ASSISTED FEATURES
// ═══════════════════════════════════════════════════════════════════════════════
const ai = require('../config/ai-service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload for AI doc parsing (temp storage)
const aiUpload = multer({
  dest: path.join(__dirname, '..', 'uploads', 'ai-temp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.txt','.md','.doc','.docx','.png','.jpg','.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Check if AI is configured
router.get('/ai/status', (req, res) => {
  res.json({ configured: ai.isConfigured() });
});

// ── Intake-side: Parse uploaded document ────────────────────────────────────
router.post('/ai/parse-document', aiUpload.single('document'), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = req.file.originalname;
    let result;

    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
      // Send as base64 document/image
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      const mimeMap = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      result = await ai.parseDocumentForIntake({ base64, mediaType: mimeMap[ext], filename });
    } else {
      // Send as text
      const text = fs.readFileSync(filePath, 'utf-8');
      result = await ai.parseDocumentForIntake({ text, filename });
    }

    // Clean up temp file
    fs.unlinkSync(filePath);

    res.json({ success: true, fields: result });
  } catch (err) {
    console.error('AI parse-document error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ── Intake-side: Suggest from plain language description ────────────────────
router.post('/ai/suggest-from-description', express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const { description } = req.body;
    if (!description || description.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide a project description of at least 20 characters.' });
    }
    const result = await ai.suggestFromDescription(description);
    res.json({ success: true, suggestions: result });
  } catch (err) {
    console.error('AI suggest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin-side: Full intake review analysis ─────────────────────────────────
router.post('/ai/review-intake/:id', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) return res.status(404).json({ error: 'Intake not found' });

    const profileInfo = intake.security_profile || '';
    const result = await ai.reviewIntake(intake, profileInfo);
    res.json({ success: true, review: result });
  } catch (err) {
    console.error('AI review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin-side: Suggest additional controls ─────────────────────────────────
router.post('/ai/suggest-controls/:id', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) return res.status(404).json({ error: 'Intake not found' });

    const { ITSG33_CONTROLS } = require('../config/itsg33-controls');
    const { recommendControls } = require('../config/security-profiles');

    const profile = intake.security_profile || 'PBMM';
    // Get current baseline controls
    const currentControls = recommendControls(profile, intake.confidentiality_level || 'protected-b', {
      description: intake.project_description || '',
      technologies: intake.technologies || '',
      appType: intake.app_type || 'internal'
    });
    const currentIds = currentControls.map(c => c.id);

    const result = await ai.suggestAdditionalControls(intake, currentIds, ITSG33_CONTROLS);
    res.json({ success: true, suggestions: result });
  } catch (err) {
    console.error('AI suggest-controls error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence narrative generation ───────────────────────────────────────────
router.post('/ai/evidence-narrative', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const { controlId, controlTitle, controlDescription, evidenceGuidance, projectContext } = req.body;
    if (!controlId) return res.status(400).json({ error: 'Control ID required' });

    const result = await ai.generateEvidenceNarrative(
      { control_id: controlId, title: controlTitle, description: controlDescription, evidence_guidance: evidenceGuidance },
      projectContext || {}
    );
    res.json({ success: true, narrative: result });
  } catch (err) {
    console.error('AI evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk evidence generation ────────────────────────────────────────────────
router.post('/ai/generate-bulk-evidence', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const { controls, projectContext } = req.body;
    if (!controls || !controls.length) return res.status(400).json({ error: 'Controls list required' });

    const result = await ai.generateBulkEvidence(controls, projectContext || {});
    res.json({ success: true, narratives: result });
  } catch (err) {
    console.error('AI bulk evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
