/**
 * In-app notifications helper. Used across routes to record events for a user
 * (assignments, invitations accepted, new messages). Never throws.
 */
const { run } = require('../models/database');

function createNotification(userId, { type, title, body, link } = {}) {
  if (!userId || !title) return;
  try {
    run('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
      [userId, type || null, title, body || null, link || null]);
  } catch (e) {
    console.error('[notify]', e.message);
  }
}

module.exports = { createNotification };
