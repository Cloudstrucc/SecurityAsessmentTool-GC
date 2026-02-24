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

module.exports = router;
