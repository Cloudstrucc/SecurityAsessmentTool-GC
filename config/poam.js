/**
 * Plan of Action & Milestones (POA&M).
 *
 * A POA&M item is a CONDITION attached to a conditional authorization (iATO): the
 * work a project team must complete before the authorization can become a full,
 * unconditional ATO. Items therefore belong to a decision package, not to an
 * assessment — they only have meaning once a decision has been made.
 *
 * Each item runs its own small review loop: the team submits evidence, the assessor
 * accepts, rejects (with feedback) or defers it to a successor package.
 */
const { get, all, run } = require('../models/database');

const STATES = ['open', 'in-progress', 'evidence-submitted', 'accepted', 'rejected', 'deferred'];

/** Allowed item transitions. Anything else is refused server-side. */
const TRANSITIONS = {
  'open':               ['in-progress', 'evidence-submitted', 'deferred'],
  'in-progress':        ['evidence-submitted', 'deferred'],
  'evidence-submitted': ['accepted', 'rejected', 'deferred'],
  'rejected':           ['in-progress', 'evidence-submitted', 'deferred'],
  'accepted':           [],           // closed
  'deferred':           []            // carried into a successor package
};

/** States that still count as outstanding work on the package. */
const OPEN_STATES = ['open', 'in-progress', 'evidence-submitted', 'rejected'];

function canTransition(from, to) {
  return (TRANSITIONS[String(from || 'open')] || []).includes(String(to));
}

function listForPackage(packageId) {
  return all(`SELECT * FROM iato_checklist WHERE decision_package_id = ?
              ORDER BY CASE risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                       deadline IS NULL, deadline, id`, [packageId]).map(decorate);
}

function getItem(id) {
  const row = get('SELECT * FROM iato_checklist WHERE id = ?', [id]);
  return row ? decorate(row) : null;
}

/** An item is overdue when its current deadline has passed and it is still open. */
function isOverdue(item) {
  if (!item || !item.deadline) return false;
  if (!OPEN_STATES.includes(String(item.state || 'open'))) return false;
  const d = new Date(item.deadline);
  if (isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function decorate(item) {
  return Object.assign({}, item, {
    state: item.state || 'open',
    overdue: isOverdue(item),
    isOpen: OPEN_STATES.includes(String(item.state || 'open')),
    extended: Number(item.deadline_changes || 0) > 0
  });
}

/** Summary used by the package UI and the promotion gate. */
function summary(packageId) {
  const items = listForPackage(packageId);
  const accepted = items.filter(i => i.state === 'accepted').length;
  const deferred = items.filter(i => i.state === 'deferred').length;
  const open = items.filter(i => i.isOpen).length;
  const overdue = items.filter(i => i.overdue).length;
  const awaitingReview = items.filter(i => i.state === 'evidence-submitted').length;
  return {
    total: items.length, accepted, deferred, open, overdue, awaitingReview,
    allAccepted: items.length > 0 && accepted === items.length,
    hasOutstanding: open > 0 || deferred > 0
  };
}

/**
 * May this package be promoted to a full, unconditional ATO?
 *
 * Every condition must be accepted. Deferred items block promotion (they must be
 * carried into a successor package first), and an overdue item blocks it until the
 * assessor sets a realistic new due date — an authorization should not be upgraded
 * on the back of a commitment that has already slipped unacknowledged.
 */
function promotionCheck(packageId) {
  const s = summary(packageId);
  if (s.total === 0) return { ok: true, reason: null, summary: s };
  if (s.overdue > 0) return { ok: false, reason: 'overdue', summary: s };
  if (s.deferred > 0) return { ok: false, reason: 'deferred', summary: s };
  if (!s.allAccepted) return { ok: false, reason: 'outstanding', summary: s };
  return { ok: true, reason: null, summary: s };
}

/** Create a condition on a package, seeding the due-date history. */
function addItem(packageId, projectId, fields = {}, user = null) {
  const deadline = fields.deadline || null;
  return run(`INSERT INTO iato_checklist
      (decision_package_id, project_id, assessment_id, control_id, description, risk_level,
       original_finding, remediation_plan, milestone, deadline, deadline_original,
       deadline_changes, assigned_to, state, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?, 'open', ?)`,
    [packageId, projectId || null, fields.assessment_id || null, fields.control_id || null,
     (fields.description || '').trim(), fields.risk_level || 'medium',
     fields.original_finding || null, fields.remediation_plan || null,
     fields.milestone || null, deadline, deadline,
     fields.assigned_to || null, (user && user.id) || null]);
}

/**
 * Change an item's due date, keeping the history the auditor will ask for:
 * the original commitment, the previous value, and how many times it has moved.
 */
function changeDeadline(itemId, newDeadline, reason) {
  const item = get('SELECT deadline, deadline_original, deadline_changes FROM iato_checklist WHERE id = ?', [itemId]);
  if (!item) return null;
  run(`UPDATE iato_checklist
       SET deadline_previous = deadline,
           deadline = ?,
           deadline_original = COALESCE(deadline_original, deadline),
           deadline_changes = COALESCE(deadline_changes, 0) + 1,
           deadline_change_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [newDeadline || null, (reason || '').trim() || null, itemId]);
  return getItem(itemId);
}

/** The project team claims a condition is met. */
function submitEvidence(itemId, evidenceText, user) {
  const item = getItem(itemId);
  if (!item) return { ok: false, error: 'not-found' };
  if (!canTransition(item.state, 'evidence-submitted')) {
    return { ok: false, error: 'invalid-transition', from: item.state };
  }
  run(`UPDATE iato_checklist SET state = 'evidence-submitted', evidence_text = ?,
       evidence_submitted_at = CURRENT_TIMESTAMP, evidence_submitted_by = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [String(evidenceText || '').trim(), (user && (user.name || user.email)) || null, itemId]);
  return { ok: true, item: getItem(itemId) };
}

/** The assessor accepts, rejects or defers a submitted condition. */
function review(itemId, decision, notes, user) {
  const item = getItem(itemId);
  if (!item) return { ok: false, error: 'not-found' };
  const target = decision === 'accept' ? 'accepted'
    : decision === 'reject' ? 'rejected'
    : decision === 'defer' ? 'deferred' : null;
  if (!target) return { ok: false, error: 'unknown-decision' };
  if (!canTransition(item.state, target)) {
    return { ok: false, error: 'invalid-transition', from: item.state };
  }
  const who = (user && (user.name || user.email)) || null;
  run(`UPDATE iato_checklist SET state = ?, review_decision = ?, review_notes = ?,
       reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?,
       completed_at = CASE WHEN ? = 'accepted' THEN CURRENT_TIMESTAMP ELSE completed_at END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [target, decision, (notes || '').trim() || null, who, target, itemId]);
  return { ok: true, item: getItem(itemId) };
}

/**
 * Carry every unfinished condition into a successor package. Originals are marked
 * deferred and point at where they went, so the trail across authorization periods
 * stays intact.
 */
function carryForward(fromPackageId, toPackageId, projectId, user) {
  const items = all(`SELECT * FROM iato_checklist WHERE decision_package_id = ? AND state != 'accepted'`,
    [fromPackageId]);
  let carried = 0;
  items.forEach(i => {
    const newId = run(`INSERT INTO iato_checklist
        (decision_package_id, project_id, assessment_id, control_id, description, risk_level,
         original_finding, remediation_plan, milestone, deadline, deadline_original,
         deadline_previous, deadline_changes, assigned_to, state, carried_from_item_id, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'open', ?, ?)`,
      [toPackageId, projectId || i.project_id, i.assessment_id, i.control_id, i.description,
       i.risk_level, i.original_finding, i.remediation_plan, i.milestone,
       i.deadline, i.deadline_original || i.deadline, i.deadline_previous,
       i.deadline_changes || 0, i.assigned_to, i.id, (user && user.id) || null]);
    run(`UPDATE iato_checklist SET state = 'deferred', deferred_to_package_id = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [toPackageId, i.id]);
    carried++;
  });
  return carried;
}

/** Seed conditions from the failed controls of the version this package pinned. */
function generateFromSnapshot(packageId, projectId, snapshotControls, user) {
  const existing = new Set(all('SELECT control_id FROM iato_checklist WHERE decision_package_id = ?',
    [packageId]).map(r => r.control_id));
  let added = 0;
  (snapshotControls || []).forEach(c => {
    const failed = ['not-met', 'partially-met'].includes(String(c.audit_result || ''));
    if (!failed || existing.has(c.control_id)) return;
    const risk = c.risk_level || 'medium';
    const days = risk === 'high' ? 30 : risk === 'medium' ? 60 : 90;
    const due = new Date(); due.setDate(due.getDate() + days);
    addItem(packageId, projectId, {
      control_id: c.control_id,
      description: `Remediate ${c.control_id}: ${c.title || ''}`.trim(),
      risk_level: risk,
      original_finding: c.audit_comments || c.tailored_description || null,
      deadline: due.toISOString().slice(0, 10),
      assessment_id: c.assessment_id || null
    }, user);
    added++;
  });
  return added;
}

module.exports = {
  STATES, TRANSITIONS, OPEN_STATES, canTransition,
  listForPackage, getItem, summary, promotionCheck, isOverdue,
  addItem, changeDeadline, submitEvidence, review, carryForward, generateFromSnapshot
};
