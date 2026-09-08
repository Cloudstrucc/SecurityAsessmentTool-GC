// Per-control evidence edit history + revert. Every meaningful change (a save, an
// AI draft, set-ready, reactivate, a review action, or a revert) writes a snapshot
// row so the provider can revert a control to any earlier state.
const { run, get, all } = require('../models/database');

// Who is acting, for the "edited by X (incl. AI)" banner and history rows.
function actor(req) {
  if (req.user) return { name: req.user.name || req.user.email || 'Assessor', type: 'assessor' };
  if (req.session && req.session.clientId) {
    const u = get('SELECT name, email FROM users WHERE id = ?', [req.session.clientId]);
    if (u) return { name: u.name || u.email || 'Project user', type: 'user' };
  }
  return { name: 'Someone', type: 'user' };
}

function record({ controlDbId, assessmentId, action, actorName, actorType, control, note }) {
  run(`INSERT INTO assessment_control_history
        (control_db_id, assessment_id, action, actor_name, actor_type, evidence_text, evidence_html, evidence_status, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    [controlDbId, assessmentId, action, actorName || '', actorType || '',
      (control && control.evidence_text) || '', (control && control.evidence_html) || '',
      (control && control.evidence_status) || '', note || '']);
}

function list(controlDbId, limit = 50) {
  return all('SELECT * FROM assessment_control_history WHERE control_db_id = ? ORDER BY id DESC LIMIT ?', [controlDbId, limit]);
}

module.exports = { actor, record, list };
