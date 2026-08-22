/**
 * Decision packages — the authorization decision for a project (ATO / iATO / denial).
 *
 * A decision package pins the EXACT assessment version it authorized. Assessment
 * versions are append-only snapshots (see assessment_versions), so the authorization
 * record is immutable by construction rather than by policy: the live assessment can
 * keep evolving without ever changing what was authorized.
 *
 * The version snapshot covers the tailored control set and security profile. It does
 * NOT cover POA&M items or uploaded documents, so at pin time we additionally capture
 * `snapshot_extra`: the POA&M rows plus a document manifest with SHA-256 hashes. The
 * hashes matter because files live on disk and could be replaced without the database
 * noticing — the hash proves the document that was authorized is the document on file.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { get, all, run } = require('../models/database');
const { PROJECT_UPLOAD_DIR } = require('./storage');

const DECISION_TYPES = ['ato', 'iato', 'denied'];

const STATES = ['draft', 'in-review', 'recommended', 'decided', 'issued', 'denied', 'expired', 'revoked'];

/** Allowed state transitions. Anything not listed here is rejected. */
const TRANSITIONS = {
  'draft':       ['in-review'],
  'in-review':   ['recommended', 'draft', 'denied'],
  'recommended': ['decided', 'in-review', 'denied'],
  'decided':     ['issued', 'denied'],
  'issued':      ['expired', 'revoked'],
  'denied':      ['draft'],
  'expired':     [],
  'revoked':     []
};

/** States in which the underlying assessment is locked against edits. */
const LOCKING_STATES = ['in-review', 'recommended', 'decided'];

function canTransition(from, to) {
  return (TRANSITIONS[String(from || 'draft')] || []).includes(String(to));
}

/** Next human reference for a project: DP-0001, DP-0002 … */
function nextReference(projectId) {
  const row = get('SELECT COUNT(*) c FROM decision_packages WHERE project_id = ?', [projectId]);
  return 'DP-' + String(((row && row.c) || 0) + 1).padStart(4, '0');
}

/** SHA-256 of a stored document, or null when the file is missing/unreadable. */
function hashDocument(filename) {
  if (!filename) return null;
  try {
    const full = path.join(PROJECT_UPLOAD_DIR, path.basename(filename));
    if (!fs.existsSync(full)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  } catch (e) {
    return null;
  }
}

/**
 * Capture what the assessment version snapshot does not: POA&M items and a
 * document manifest with content hashes.
 */
function buildSnapshotExtra(projectId, assessmentId) {
  const poam = all(`SELECT id, control_id, description, risk_level, status, deadline,
                           remediation_plan, milestone, assigned_to
                    FROM iato_checklist
                    WHERE project_id = ? OR assessment_id = ?
                    ORDER BY id`, [projectId, assessmentId || 0]);
  const docs = all(`SELECT id, filename, original_name, document_type, mime_type, size, created_at
                    FROM project_documents
                    WHERE project_id = ? AND status != 'deleted'
                    ORDER BY id`, [projectId]);
  return {
    capturedAt: new Date().toISOString(),
    poam,
    documents: docs.map(d => ({
      id: d.id,
      name: d.original_name || d.filename,
      type: d.document_type || null,
      mime: d.mime_type || null,
      size: d.size || null,
      uploadedAt: d.created_at || null,
      sha256: hashDocument(d.filename)
    }))
  };
}

/**
 * Is this assessment locked because a decision package that references it is
 * mid-decision? Locking stops the package shifting under the approver. Once the
 * decision is issued the lock is released — post-authorization work continues.
 */
function assessmentLock(assessmentId) {
  if (!assessmentId) return null;
  const row = get(`SELECT id, reference, state FROM decision_packages
                   WHERE assessment_id = ? AND state IN ('in-review','recommended','decided')
                   ORDER BY id DESC LIMIT 1`, [assessmentId]);
  return row || null;
}

/** The active (most recent) decision package for a project. */
function activeForProject(projectId) {
  return get('SELECT * FROM decision_packages WHERE project_id = ? ORDER BY id DESC LIMIT 1', [projectId]) || null;
}

function listForProject(projectId) {
  return all('SELECT * FROM decision_packages WHERE project_id = ? ORDER BY id DESC', [projectId]);
}

/**
 * One-time migration of legacy ato_records into decision_packages. Runs only for
 * rows that have not already been migrated (matched on project + title).
 */
function migrateLegacyAtoRecords() {
  let migrated = 0;
  let legacy = [];
  try { legacy = all('SELECT * FROM ato_records ORDER BY id'); } catch (e) { return 0; }
  legacy.forEach(r => {
    const exists = get(`SELECT id FROM decision_packages
                        WHERE project_id = ? AND title IS ? AND created_at IS ?`,
      [r.project_id, r.title || null, r.created_at || null]);
    if (exists) return;
    const status = String(r.authorization_status || 'draft').toLowerCase();
    const state = ['issued', 'granted', 'approved'].includes(status)
      ? 'issued'
      : (STATES.includes(status) ? status : 'draft');
    run(`INSERT INTO decision_packages
         (project_id, assessment_id, reference, title, decision_type, state,
          executive_summary, residual_risk_statement, conditions, authorizing_official,
          assessor, expires_at, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.project_id, r.assessment_id || null, nextReference(r.project_id),
       r.title || null, (r.record_type === 'iato' ? 'iato' : 'ato'), state,
       r.executive_summary || null, r.residual_risk_statement || null,
       r.conditions_of_authorization || null, r.authorizing_official || null,
       r.assessor || null, r.expiry_date || null, r.created_by || null,
       r.created_at || null, r.updated_at || null]);
    migrated++;
  });
  return migrated;
}

// ── Versioning (audit history + revert) ──────────────────────────────────────
// Only the package's own editorial fields are snapshotted. POA&M items and their
// review verdicts are deliberately excluded: reverting an editorial mistake must
// never erase an assessor's decision or a team's submitted evidence.
const VERSIONED_FIELDS = [
  'title', 'decision_type', 'executive_summary', 'residual_risk_statement',
  'decision_rationale', 'conditions', 'authorizing_official', 'assessor',
  'expires_at', 'assessment_id', 'assessment_version_id', 'assessment_version'
];

/** States in which reverting is refused — an issued decision is a record of fact. */
const NON_REVERTABLE_STATES = ['issued', 'expired', 'revoked'];

function pickVersionedFields(dp) {
  const out = {};
  VERSIONED_FIELDS.forEach(f => { out[f] = dp[f] === undefined ? null : dp[f]; });
  return out;
}

/** Snapshot the package's current editorial state as the next version. */
function createVersion(packageId, { label = '', summary = '', user = null } = {}) {
  const dp = get('SELECT * FROM decision_packages WHERE id = ?', [packageId]);
  if (!dp) return null;
  const maxV = get('SELECT MAX(version) v FROM decision_package_versions WHERE decision_package_id = ?', [packageId]);
  const version = ((maxV && maxV.v) || 0) + 1;
  run(`INSERT INTO decision_package_versions
       (decision_package_id, version, label, summary, created_by, created_by_name, snapshot_json)
       VALUES (?,?,?,?,?,?,?)`,
    [packageId, version, label || ('Version ' + version), summary || '',
     (user && user.id) || null, (user && (user.name || user.email)) || '',
     JSON.stringify(pickVersionedFields(dp))]);
  run('UPDATE decision_packages SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [version, packageId]);
  return version;
}

function listVersions(packageId) {
  return all(`SELECT id, version, label, summary, created_by_name, created_at
              FROM decision_package_versions WHERE decision_package_id = ?
              ORDER BY version DESC`, [packageId]);
}

/**
 * Restore an earlier editorial state as a NEW version. The current state is
 * snapshotted first so nothing is lost, and POA&M items are untouched.
 */
function revertToVersion(packageId, version, user) {
  const dp = get('SELECT * FROM decision_packages WHERE id = ?', [packageId]);
  if (!dp) return { ok: false, error: 'not-found' };
  if (NON_REVERTABLE_STATES.includes(String(dp.state))) {
    return { ok: false, error: 'not-revertable', state: dp.state };
  }
  const target = get('SELECT * FROM decision_package_versions WHERE decision_package_id = ? AND version = ?',
    [packageId, version]);
  if (!target) return { ok: false, error: 'version-not-found' };
  let snap;
  try { snap = JSON.parse(target.snapshot_json || '{}'); }
  catch (e) { return { ok: false, error: 'corrupt-snapshot' }; }

  createVersion(packageId, {
    label: 'Superseded state',
    summary: `Auto-saved before reverting to version ${target.version}`, user
  });
  const sets = VERSIONED_FIELDS.map(f => `${f} = ?`).join(', ');
  const vals = VERSIONED_FIELDS.map(f => (snap[f] === undefined ? null : snap[f]));
  vals.push(packageId);
  run(`UPDATE decision_packages SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, vals);
  const newVersion = createVersion(packageId, {
    label: `Reverted to version ${target.version}`,
    summary: `Restored from version ${target.version}. POA&M items and review decisions were not affected.`,
    user
  });
  return { ok: true, version: newVersion, restoredFrom: target.version };
}

module.exports = {
  VERSIONED_FIELDS, NON_REVERTABLE_STATES,
  createVersion, listVersions, revertToVersion,
  DECISION_TYPES, STATES, TRANSITIONS, LOCKING_STATES,
  canTransition, nextReference, buildSnapshotExtra, hashDocument,
  assessmentLock, activeForProject, listForProject, migrateLegacyAtoRecords
};
