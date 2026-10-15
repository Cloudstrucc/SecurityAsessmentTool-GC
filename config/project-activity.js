/**
 * Project-wide contributor trail.
 *
 * `assessment_control_history` already snapshots evidence edits, but it is
 * scoped to one control and written only by the evidence editor — it cannot
 * answer "who attached this file", "who changed the authorizing official" or
 * "who tailored this control out". This log answers those: every mutation that
 * a person (or the model) makes against a project or one of its records.
 *
 * Deliberately NOT a general audit log of reads. It records who contributed
 * what, which is what the Contributors report is for.
 */
const { run, all, get } = require('../models/database');

/**
 * Who is acting. Separates the model from a person: an AI-drafted value that
 * nobody accepted must not be credited to the last human who opened the page.
 */
function actor(req, override) {
  if (override) return override;
  if (req && req.user) {
    return { name: req.user.name || req.user.email || 'Assessor', email: req.user.email || '', type: 'assessor' };
  }
  if (req && req.session && req.session.clientId) {
    const u = get('SELECT name, email FROM users WHERE id = ?', [req.session.clientId]);
    if (u) return { name: u.name || u.email || 'Project user', email: u.email || '', type: 'provider' };
  }
  return { name: 'Someone', email: '', type: 'provider' };
}

const AI_ACTOR = { name: 'Aegis AI', email: '', type: 'ai' };
const SYSTEM_ACTOR = { name: 'System', email: '', type: 'system' };

/**
 * Record one contribution. Never throws: an audit write must not be able to
 * fail the user action it is describing.
 *
 * @param {object} e
 * @param {number} e.projectId
 * @param {string} e.entityType  project|intake|assessment|control|slot|attachment|decision
 * @param {number} [e.entityId]
 * @param {string} [e.entityRef] human handle — AC-2, INT-1234, DP-0001
 * @param {string} e.action      created|updated|removed|filled|attached|…
 * @param {string} [e.field]
 * @param {string} [e.detail]    short summary; never a whole document
 * @param {object} [e.actor]     from actor(req), or AI_ACTOR / SYSTEM_ACTOR
 */
function record(e) {
  try {
    if (!e || !e.projectId) return;
    const a = e.actor || SYSTEM_ACTOR;
    run(`INSERT INTO project_activity
      (project_id, entity_type, entity_id, entity_ref, action, field, detail,
       actor_name, actor_email, actor_type)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [e.projectId, e.entityType || 'project', e.entityId || null, e.entityRef || null,
      e.action, e.field || null, String(e.detail || '').slice(0, 500),
      a.name || '', a.email || '', a.type || 'provider']);
  } catch (err) {
    console.error('[activity] could not record:', err.message);
  }
}

/** Resolve the project behind an assessment, so callers need not pass it. */
function projectForAssessment(assessmentId) {
  const r = get('SELECT project_id FROM assessments WHERE id = ?', [assessmentId]);
  return r ? r.project_id : null;
}

/** Resolve the project behind a control. */
function projectForControl(controlDbId) {
  const r = get(`SELECT a.project_id FROM assessment_controls c
                 JOIN assessments a ON a.id = c.assessment_id WHERE c.id = ?`, [controlDbId]);
  return r ? r.project_id : null;
}

/** The full trail for a project, newest first. */
function listForProject(projectId, limit = 2000) {
  return all(`SELECT * FROM project_activity WHERE project_id = ?
              ORDER BY id DESC LIMIT ?`, [projectId, limit]);
}

/**
 * One row per contributor: who they are, what they did (counts by kind) and
 * when they were first and last active. This is the Contributors chapter —
 * a summary, not the log.
 */
function contributors(projectId) {
  const rows = all(`
    SELECT actor_name, actor_email, actor_type,
           COUNT(*) AS actions,
           MIN(created_at) AS first_at,
           MAX(created_at) AS last_at
    FROM project_activity WHERE project_id = ?
    GROUP BY actor_name, actor_email, actor_type
    ORDER BY actions DESC, actor_name
  `, [projectId]);

  return rows.map(r => {
    const byKind = all(`
      SELECT entity_type, action, COUNT(*) AS n
      FROM project_activity
      WHERE project_id = ? AND actor_name = ? AND actor_type = ?
      GROUP BY entity_type, action ORDER BY n DESC
    `, [projectId, r.actor_name, r.actor_type]);
    return {
      ...r,
      // A short "what they contributed" line rather than a raw action dump.
      summary: byKind.slice(0, 6).map(k => `${k.n}× ${k.action} ${k.entity_type}`).join(', '),
      breakdown: byKind
    };
  });
}

/** Totals for the report header. */
function summary(projectId) {
  const t = get('SELECT COUNT(*) AS actions FROM project_activity WHERE project_id = ?', [projectId]);
  const people = get(`SELECT COUNT(*) AS n FROM (
      SELECT DISTINCT actor_name, actor_type FROM project_activity
      WHERE project_id = ? AND actor_type <> 'system'
    )`, [projectId]);
  const span = get(`SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at
                    FROM project_activity WHERE project_id = ?`, [projectId]);
  return {
    actions: (t && t.actions) || 0,
    contributors: (people && people.n) || 0,
    first_at: span && span.first_at, last_at: span && span.last_at
  };
}

module.exports = {
  actor, record, listForProject, contributors, summary,
  projectForAssessment, projectForControl, AI_ACTOR, SYSTEM_ACTOR
};
