/**
 * Mention notifications for project collaboration.
 *
 * Two channels, deliberately different:
 *   - IN-APP is immediate (it costs the reader nothing to have it waiting).
 *   - EMAIL is BATCHED — one digest per user per record per window. A busy thread
 *     that emailed on every message would simply get muted, and the feature would
 *     die. Mentions are queued here and flushed by a sweeper.
 *
 * PRIVACY: the email is LINK-ONLY by default. Collaboration can contain personal
 * information, so the message text is not put into inboxes and mail logs unless a
 * tenant explicitly opts in (org_settings.notify_mention_excerpt).
 *
 * Scope is @mentions only — not all activity on a project.
 */
const { get, all, run } = require('../models/database');

const BATCH_WINDOW_MINUTES = 15;

function orgPolicy(orgId) {
  if (!orgId) return { enabled: true, excerpt: false };
  const s = get('SELECT notify_mentions_enabled, notify_mention_excerpt FROM org_settings WHERE organization_id = ?', [orgId]);
  if (!s) return { enabled: true, excerpt: false };
  return {
    enabled: s.notify_mentions_enabled === null || s.notify_mentions_enabled === undefined
      ? true : Number(s.notify_mentions_enabled) === 1,
    excerpt: Number(s.notify_mention_excerpt) === 1
  };
}

function userPrefs(userId) {
  const u = get('SELECT notify_mentions_inapp, notify_mentions_email, organization_id, email, name FROM users WHERE id = ?', [userId]);
  if (!u) return null;
  const on = v => (v === null || v === undefined) ? true : Number(v) === 1;
  return {
    inapp: on(u.notify_mentions_inapp),
    email: on(u.notify_mentions_email),
    orgId: u.organization_id, address: u.email, name: u.name
  };
}

/** Where a mention points, so both channels link to the same place. */
function linkFor(entityType, entityId, projectId) {
  switch (entityType) {
    case 'assessment': return `/admin/assessments/${entityId}`;
    case 'intake': return `/admin/intakes/${entityId}`;
    case 'decision_package': return `/admin/decision-packages/${entityId}`;
    default: return `/admin/projects/${projectId}`;
  }
}

/**
 * Notify the people mentioned in a message. The author is never notified for
 * their own mention. Returns what was actually dispatched, for tests and logging.
 */
function notifyMentions({ message, mentions, author, projectName }) {
  const result = { inapp: 0, queued: 0, skipped: 0 };
  const users = (mentions && mentions.users) || [];
  if (!users.length) return result;

  const link = linkFor(message.entity_type, message.entity_id, message.project_id);
  const where = projectName || 'a project';

  users.forEach(u => {
    // Never notify someone about their own message.
    if (author && Number(u.id) === Number(author.id)) { result.skipped++; return; }
    const prefs = userPrefs(u.id);
    if (!prefs) { result.skipped++; return; }
    const policy = orgPolicy(prefs.orgId);
    if (!policy.enabled) { result.skipped++; return; }

    if (prefs.inapp) {
      try {
        run(`INSERT INTO notifications (user_id, type, title, body, link)
             VALUES (?, 'mention', ?, ?, ?)`,
          [u.id, `${(author && (author.name || author.email)) || 'Someone'} mentioned you`,
           `In ${where}`, link]);
        result.inapp++;
      } catch (e) { /* never let a notification break the post */ }
    }

    if (prefs.email && prefs.address) {
      try {
        run(`INSERT INTO mention_email_queue
             (user_id, project_id, entity_type, entity_id, message_id, author_name, excerpt, link)
             VALUES (?,?,?,?,?,?,?,?)`,
          [u.id, message.project_id, message.entity_type, message.entity_id, message.id,
           (author && (author.name || author.email)) || 'Someone',
           policy.excerpt ? String(message.body || '').slice(0, 300) : null,
           link]);
        result.queued++;
      } catch (e) { /* queueing is best-effort */ }
    }
  });
  return result;
}

/** Queued mentions whose batch window has elapsed, grouped per user+record. */
function dueBatches(windowMinutes = BATCH_WINDOW_MINUTES) {
  return all(`SELECT user_id, project_id, entity_type, entity_id,
                     COUNT(*) AS mention_count,
                     MIN(created_at) AS first_at,
                     MAX(link) AS link
              FROM mention_email_queue
              WHERE sent_at IS NULL
                AND created_at <= datetime('now', '-${Number(windowMinutes)} minutes')
              GROUP BY user_id, project_id, entity_type, entity_id`);
}

function batchRows(batch) {
  return all(`SELECT * FROM mention_email_queue
              WHERE sent_at IS NULL AND user_id = ? AND project_id = ?
                AND entity_type IS ? AND (entity_id IS ? OR ? IS NULL)`,
    [batch.user_id, batch.project_id, batch.entity_type, batch.entity_id, batch.entity_id]);
}

function markSent(ids) {
  if (!ids.length) return;
  run(`UPDATE mention_email_queue SET sent_at = CURRENT_TIMESTAMP
       WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}

/**
 * Send one digest per due batch. Safe to call repeatedly; already-sent rows are
 * never re-sent. Returns how many emails went out.
 */
async function flushDue({ baseUrl = '', windowMinutes = BATCH_WINDOW_MINUTES } = {}) {
  const emailService = require('../utils/emailService');
  const batches = dueBatches(windowMinutes);
  let sent = 0;
  for (const b of batches) {
    const rows = batchRows(b);
    if (!rows.length) continue;
    const prefs = userPrefs(b.user_id);
    if (!prefs || !prefs.email || !prefs.address) { markSent(rows.map(r => r.id)); continue; }
    const project = get('SELECT name FROM projects WHERE id = ?', [b.project_id]);
    const policy = orgPolicy(prefs.orgId);
    const excerpts = policy.excerpt ? rows.filter(r => r.excerpt).map(r => r.excerpt) : [];
    try {
      await emailService.sendMentionNotification({
        to: prefs.address,
        recipientName: prefs.name || '',
        projectName: (project && project.name) || 'a project',
        count: rows.length,
        authors: [...new Set(rows.map(r => r.author_name).filter(Boolean))],
        link: baseUrl + (rows[rows.length - 1].link || ''),
        excerpts,
        baseUrl
      });
      sent++;
    } catch (e) { /* keep going; the rows are marked so we do not loop forever */ }
    markSent(rows.map(r => r.id));
  }
  return sent;
}

module.exports = {
  BATCH_WINDOW_MINUTES, orgPolicy, userPrefs, linkFor,
  notifyMentions, dueBatches, flushDue
};
