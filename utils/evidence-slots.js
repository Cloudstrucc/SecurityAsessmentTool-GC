/**
 * Evidence slots — turning an AI draft's [[VALUE:]] / [[ATTACH:]] markers into
 * first-class, countable records.
 *
 * Before this, the markers were plain text inside evidence_html. Nothing knew
 * how many there were or whether any had been filled, which is why a control
 * holding fourteen untouched placeholders still reported "provided": the only
 * thing being counted was whether someone pressed save.
 *
 * A slot is a row in `evidence_slots`. In the narrative it is represented by
 * `<span data-slot="s3" data-slot-type="value" contenteditable="false">`, which
 * the editor cannot accidentally mangle and the sanitiser preserves.
 *
 * This module is the single place markers become slots — used by both the AI
 * generation path and the one-time migration of existing drafts.
 */
const { run, all, get } = require('../models/database');
const { sanitizeHtml, htmlToText } = require('./html-sanitize');

const MARKER = /\[\[\s*(VALUE|ATTACH)\s*:([^\]]*)\]\]/gi;

/** Does this text still carry raw markers? */
function hasMarkers(s) {
  MARKER.lastIndex = 0;
  return MARKER.test(String(s || ''));
}

function slotSpan(key, type) {
  return `<span data-slot="${key}" data-slot-type="${type}" contenteditable="false"></span>`;
}

/**
 * Replace every marker in `html` with a slot span, creating the slot rows.
 * Idempotent per control: existing slot_keys are reused, so re-running does not
 * duplicate. Returns { html, created }.
 */
function materialize(controlId, html) {
  const src = String(html || '');
  if (!hasMarkers(src)) return { html: src, created: 0 };

  const existing = all('SELECT slot_key FROM evidence_slots WHERE assessment_control_id = ?', [controlId]);
  let n = existing.length;
  let created = 0;
  MARKER.lastIndex = 0;

  const out = src.replace(MARKER, (_m, kind, label) => {
    const type = String(kind).toLowerCase() === 'value' ? 'value' : 'attach';
    const key = (type === 'value' ? 's' : 'a') + (++n);
    run(`INSERT OR IGNORE INTO evidence_slots
         (assessment_control_id, slot_key, slot_type, label, position)
         VALUES (?, ?, ?, ?, ?)`,
    [controlId, key, type, String(label || '').trim().slice(0, 300), n]);
    created++;
    return slotSpan(key, type);
  });

  syncCounts(controlId);
  return { html: out, created };
}

/** Live slots for a control, with their attachment counts. */
function listSlots(controlId) {
  return all(`
    SELECT s.*, (
      SELECT COUNT(*) FROM attachments a WHERE a.slot_id = s.id
    ) AS file_count
    FROM evidence_slots s
    WHERE s.assessment_control_id = ? AND s.removed_at IS NULL
    ORDER BY s.position, s.id
  `, [controlId]);
}

/** A slot counts as filled when it has text, or at least one accepted file. */
function isFilled(slot) {
  return slot.slot_type === 'value'
    ? !!String(slot.value_text || '').trim()
    : Number(slot.file_count || 0) > 0;
}

/** Recompute the cached counters the progress UI and Mark ready read. */
function syncCounts(controlId) {
  const slots = listSlots(controlId);
  const total = slots.length;
  const filled = slots.filter(isFilled).length;
  run(`UPDATE assessment_controls SET slots_total = ?, slots_filled = ? WHERE id = ?`,
    [total, filled, controlId]);
  return { total, filled };
}

/** Counts plus the value/attachment split the header shows separately. */
function progress(controlId) {
  const slots = listSlots(controlId);
  const vals = slots.filter(s => s.slot_type === 'value');
  const atts = slots.filter(s => s.slot_type === 'attach');
  const total = slots.length;
  const filled = slots.filter(isFilled).length;
  return {
    total,
    filled,
    percent: total ? Math.round(filled / total * 100) : 0,
    values: { total: vals.length, filled: vals.filter(isFilled).length },
    attachments: { total: atts.length, filled: atts.filter(isFilled).length },
    complete: slots.length > 0 && slots.every(isFilled)
  };
}

/** Write a value slot. Returns the updated row, or null when not found. */
function setValue(controlId, slotKey, html, who) {
  const slot = get(`SELECT * FROM evidence_slots
                    WHERE assessment_control_id = ? AND slot_key = ? AND removed_at IS NULL`,
  [controlId, slotKey]);
  if (!slot) return null;
  const clean = sanitizeHtml(html, { allowSlots: false });
  const text = htmlToText(clean);
  run(`UPDATE evidence_slots SET value_html = ?, value_text = ?,
       filled_at = CASE WHEN ? <> '' THEN CURRENT_TIMESTAMP ELSE NULL END,
       filled_by = CASE WHEN ? <> '' THEN ? ELSE NULL END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  [clean, text, text, text, who || null, slot.id]);
  syncCounts(controlId);
  return get('SELECT * FROM evidence_slots WHERE id = ?', [slot.id]);
}

/**
 * Soft-remove a slot. The prose stays: the caller replaces the span with the
 * slot's own text so the narrative still reads as a sentence.
 */
function removeSlot(controlId, slotKey) {
  const slot = get(`SELECT * FROM evidence_slots
                    WHERE assessment_control_id = ? AND slot_key = ? AND removed_at IS NULL`,
  [controlId, slotKey]);
  if (!slot) return null;
  run('UPDATE evidence_slots SET removed_at = CURRENT_TIMESTAMP WHERE id = ?', [slot.id]);
  syncCounts(controlId);
  return slot;
}

/** Add a slot the AI did not ask for, from text the provider selected. */
function addSlot(controlId, type, label) {
  const t = type === 'attach' ? 'attach' : 'value';
  const n = get('SELECT COALESCE(MAX(position), 0) AS p FROM evidence_slots WHERE assessment_control_id = ?',
    [controlId]);
  const pos = Number(n && n.p || 0) + 1;
  // Keys must stay unique for the life of the control, including against
  // soft-removed rows, so a re-added slot never collides with an old one.
  let key, i = pos;
  do { key = (t === 'value' ? 's' : 'a') + i++; }
  while (get('SELECT 1 AS x FROM evidence_slots WHERE assessment_control_id = ? AND slot_key = ?', [controlId, key]));

  run(`INSERT INTO evidence_slots (assessment_control_id, slot_key, slot_type, label, position)
       VALUES (?, ?, ?, ?, ?)`,
  [controlId, key, t, String(label || '').trim().slice(0, 300) || (t === 'value' ? 'new value' : 'new attachment'), pos]);
  syncCounts(controlId);
  return get('SELECT * FROM evidence_slots WHERE assessment_control_id = ? AND slot_key = ?', [controlId, key]);
}

/**
 * Render the narrative for reading: each slot span replaced by its value, or by
 * a marked-empty span so the reader can see the holes.
 */
function renderForRead(html, slots, { emptyClass = 'ev-slot-empty' } = {}) {
  const bySlot = new Map(slots.map(s => [s.slot_key, s]));
  return String(html || '').replace(
    /<span([^>]*)data-slot="([A-Za-z0-9_-]+)"([^>]*)>\s*<\/span>/gi,
    (_m, _a, key) => {
      const s = bySlot.get(key);
      if (!s) return '';
      if (s.slot_type === 'value') {
        return String(s.value_text || '').trim()
          ? `<span class="ev-slot-val">${s.value_html || ''}</span>`
          : `<span class="${emptyClass}">[${s.label}]</span>`;
      }
      const n = Number(s.file_count || 0);
      return n ? `<span class="ev-slot-att">${n} file(s)</span>`
        : `<span class="${emptyClass}">[${s.label}]</span>`;
    });
}

module.exports = {
  MARKER, hasMarkers, materialize, listSlots, isFilled, syncCounts, progress,
  setValue, removeSlot, addSlot, renderForRead, slotSpan
};
