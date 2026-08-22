/**
 * Collaboration — project-scoped discussion threads.
 *
 * Messages are polymorphic: each one records WHERE it was posted (project, intake,
 * assessment, decision package) but always carries `project_id`, so a whole
 * conversation can be read in one place while individual records keep their own
 * thread.
 *
 * PRIVACY: collaboration content is deliberately NEVER sent to the AI provider.
 * Chat can contain personal information and informal commentary, so it is excluded
 * from the assistant's context by design — documents remain the AI's context source.
 *
 * Mentions are always resolved SERVER-SIDE against the project's own people and
 * records; a client cannot mention a user or record outside the project by crafting
 * its own payload.
 */
const { get, all, run } = require('../models/database');

const ENTITY_TYPES = ['project', 'intake', 'assessment', 'decision_package'];
const MAX_BODY = 4000;

/**
 * Is collaboration available for this project? The org-level flag is a global
 * kill-switch that wins over the per-project setting. Both default to ON.
 */
function isEnabled(project, orgSettings) {
  const orgOn = !orgSettings || orgSettings.collaboration_enabled === null ||
    orgSettings.collaboration_enabled === undefined || Number(orgSettings.collaboration_enabled) === 1;
  if (!orgOn) return false;
  if (!project) return false;
  return project.collaboration_enabled === null || project.collaboration_enabled === undefined
    ? true : Number(project.collaboration_enabled) === 1;
}

/** People who may be @mentioned: users assigned to this project's records, plus its owner. */
function projectMembers(projectId) {
  const rows = all(`
    SELECT DISTINCT u.id, u.name, u.email, u.role
    FROM assessment_assignments aa
    JOIN users u ON u.id = aa.assigned_to
    WHERE aa.status != 'revoked' AND (
      (aa.entity_type = 'project'    AND aa.entity_id = ?) OR
      (aa.entity_type = 'assessment' AND aa.entity_id IN (SELECT id FROM assessments WHERE project_id = ?)) OR
      (aa.entity_type = 'intake'     AND aa.entity_id IN (SELECT id FROM intake_submissions WHERE project_id = ?))
    )`, [projectId, projectId, projectId]);
  const seen = new Set(rows.map(r => r.id));
  // The project creator can always take part in their own project's discussion.
  const creator = get(`SELECT u.id, u.name, u.email, u.role FROM projects p
                       JOIN users u ON u.id = p.created_by WHERE p.id = ?`, [projectId]);
  if (creator && !seen.has(creator.id)) rows.push(creator);
  return rows.filter(r => r && r.name);
}

/** Records that may be @mentioned — only ones belonging to this project. */
function projectRecords(projectId) {
  const out = [];
  all('SELECT id, ref_code, status FROM intake_submissions WHERE project_id = ? ORDER BY id DESC', [projectId])
    .forEach(r => out.push({ type: 'intake', id: r.id, label: r.ref_code || `Intake #${r.id}`, href: `/admin/intakes/${r.id}` }));
  all('SELECT id, type, status FROM assessments WHERE project_id = ? ORDER BY id DESC', [projectId])
    .forEach(r => out.push({ type: 'assessment', id: r.id, label: `Assessment #${r.id}`, href: `/admin/assessments/${r.id}` }));
  try {
    all('SELECT id, reference, title FROM decision_packages WHERE project_id = ? ORDER BY id DESC', [projectId])
      .forEach(r => out.push({ type: 'decision_package', id: r.id, label: r.reference || `DP #${r.id}`, href: `/admin/decision-packages/${r.id}` }));
  } catch (e) { /* table may not exist on an older database */ }
  return out;
}

/**
 * Resolve @mentions in a message body against the project's own people and records.
 * Unknown handles are simply not resolved — they stay as plain text rather than
 * silently linking somewhere unintended.
 */
function resolveMentions(body, projectId) {
  const text = String(body || '');
  const handles = (text.match(/@[\w.@+-]+/g) || []).map(h => h.slice(1).toLowerCase());
  if (!handles.length) return { users: [], records: [] };

  const members = projectMembers(projectId);
  const records = projectRecords(projectId);
  const users = [];
  const recs = [];

  handles.forEach(h => {
    const u = members.find(m =>
      String(m.email || '').toLowerCase() === h ||
      String(m.email || '').toLowerCase().split('@')[0] === h ||
      String(m.name || '').toLowerCase().replace(/\s+/g, '') === h.replace(/\s+/g, ''));
    if (u && !users.some(x => x.id === u.id)) { users.push({ id: u.id, name: u.name, email: u.email }); return; }
    const r = records.find(x => String(x.label || '').toLowerCase() === h ||
      String(x.label || '').toLowerCase().replace(/[^a-z0-9]/g, '') === h.replace(/[^a-z0-9]/g, ''));
    if (r && !recs.some(x => x.type === r.type && x.id === r.id)) recs.push(r);
  });
  return { users, records: recs };
}

/** Post a message. Returns the stored row. */
function postMessage({ projectId, entityType = 'project', entityId = null, user, body }) {
  const type = ENTITY_TYPES.includes(entityType) ? entityType : 'project';
  const text = String(body || '').trim().slice(0, MAX_BODY);
  if (!text) return null;
  const mentions = resolveMentions(text, projectId);
  const id = run(`INSERT INTO collab_messages
       (project_id, entity_type, entity_id, user_id, user_name, user_role, body, mentions_json)
       VALUES (?,?,?,?,?,?,?,?)`,
    [projectId, type, entityId || null, (user && user.id) || null,
     (user && (user.name || user.email)) || 'Unknown', (user && user.role) || null,
     text, JSON.stringify(mentions)]);
  const stored = get('SELECT * FROM collab_messages WHERE id = ?', [id]);

  // Tell the people who were actually mentioned. Never lets a notification
  // failure break the act of posting a message.
  try {
    const project = get('SELECT name FROM projects WHERE id = ?', [projectId]);
    require('./mention-notifications').notifyMentions({
      message: stored, mentions, author: user,
      projectName: project && project.name
    });
  } catch (e) { /* non-fatal */ }

  return stored;
}

/**
 * Read a thread. Without an entity filter this returns the whole project
 * conversation (every record rolled up); with one it returns just that record's.
 */
function listMessages(projectId, { entityType = null, entityId = null, limit = 100 } = {}) {
  const rows = (entityType)
    ? all(`SELECT * FROM collab_messages
           WHERE project_id = ? AND entity_type = ? AND (entity_id IS ? OR ? IS NULL) AND deleted_at IS NULL
           ORDER BY id ASC LIMIT ?`, [projectId, entityType, entityId || null, entityId || null, limit])
    : all(`SELECT * FROM collab_messages WHERE project_id = ? AND deleted_at IS NULL
           ORDER BY id ASC LIMIT ?`, [projectId, limit]);
  return rows.map(r => {
    let mentions = { users: [], records: [] };
    try { mentions = JSON.parse(r.mentions_json || '{}'); } catch (e) { /* ignore */ }
    return Object.assign({}, r, { mentions });
  });
}

function countMessages(projectId) {
  const r = get('SELECT COUNT(*) c FROM collab_messages WHERE project_id = ? AND deleted_at IS NULL', [projectId]);
  return (r && r.c) || 0;
}

/** Soft delete — the row is retained so the discussion stays auditable. */
function deleteMessage(id, projectId) {
  run('UPDATE collab_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?', [id, projectId]);
}

module.exports = {
  ENTITY_TYPES, MAX_BODY, isEnabled, projectMembers, projectRecords,
  resolveMentions, postMessage, listMessages, countMessages, deleteMessage
};
