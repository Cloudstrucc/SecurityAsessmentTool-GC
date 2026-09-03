/**
 * Access control — RBAC (root admin vs admin vs member vs collaborator),
 * AI feature gating (with trial-tier caps), licensing/seat accounting, and
 * break-glass tenant-recovery accounts.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { get, all, run } = require('../models/database');
const billing = require('./billing');

// ── Roles ─────────────────────────────────────────────────────────────────────
function isRootAdmin(user) { return !!(user && user.is_root_admin); }
function isCollaborator(user) { return !!(user && user.account_type === 'collaborator'); }
function isAdmin(user) {
  // Root admins and users designated as admins; legacy assessors (no account_type) count as admins.
  return !!(user && (user.is_root_admin || user.account_type === 'admin' || user.account_type === 'owner' ||
    (!user.account_type && user.role === 'assessor')));
}

/** Middleware: only the tenant's root admin(s) may reach global admin features. */
function ensureRootAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && isRootAdmin(req.user)) return next();
  req.flash('error', 'That area is restricted to the primary (root) administrator.');
  return res.redirect('/admin/dashboard');
}

/** Middleware: any admin (root, designated admin, owner, or legacy assessor). */
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && isAdmin(req.user)) return next();
  req.flash('error', 'Administrator access is required for that action.');
  return res.redirect('/admin/dashboard');
}

// ── AI gating ───────────────────────────────────────────────────────────────
const AI_BANNER = 'AI assistance is a licensed feature. Register for a licensed account, or ask your administrator to assign you a license.';
const DEFAULT_TRIAL_LIMIT = 2;
const TRIAL_AI_LIMITS = {
  controls: 2, 'evidence-guidance': 2, narrative: 2, 'bulk-evidence': 1,
  'intake-parse': 2, 'intake-review': 2, audit: 1
};

function getAiUse(userId, workType) {
  return get('SELECT count FROM ai_usage WHERE user_id = ? AND work_type = ?', [userId, workType])?.count || 0;
}
function recordAiUse(user, workType) {
  if (!user) return;
  const org = user.organization_id || null;
  run(`INSERT INTO ai_usage (user_id, organization_id, work_type, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, work_type) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    [user.id, org, workType]);
}

/**
 * Can this user run an AI action of `workType`?
 * - No org (legacy/seeded users): allowed (keeps existing behaviour intact).
 * - Collaborators / unlicensed members: blocked (banner).
 * - Paid/comped org, or licensed user: unlimited.
 * - Trial owners/admins: capped per work type (test-drive allowance).
 * Returns { ok, limited?, remaining?, reason?, needsLicense? }.
 */
function canUseAI(user, workType) {
  if (!user) return { ok: false, reason: 'Please sign in to use AI features.' };
  const org = billing.orgForUser(user);
  if (!org) return { ok: true };                                   // legacy / no tenant

  if (isCollaborator(user) || (!isRootAdmin(user) && !user.is_licensed && user.account_type === 'member')) {
    return { ok: false, reason: AI_BANNER, needsLicense: true };
  }

  const paid = ['active', 'comped'].includes(org.status) && org.plan !== 'trial';
  if (paid || user.is_licensed) return { ok: true };

  // Trial owner/admin — strict per-work-type allowance so they can test AI.
  const limit = TRIAL_AI_LIMITS[workType] ?? DEFAULT_TRIAL_LIMIT;
  const used = getAiUse(user.id, workType);
  if (used >= limit) {
    return { ok: false, limited: true,
      reason: `You've used the trial AI allowance for this feature (${limit}). Upgrade to a paid plan for unlimited AI.` };
  }
  return { ok: true, limited: true, remaining: limit - used };
}

/** Summary for banners/UI: is AI available at all, and is it trial-limited? */
function aiStatus(user) {
  const probe = canUseAI(user, 'controls');
  return { available: probe.ok, limited: !!probe.limited, needsLicense: !!probe.needsLicense, banner: probe.ok ? null : probe.reason };
}

// ── Licensing / seats ─────────────────────────────────────────────────────────
// Admin caps per plan (licenses cost the same for admins and users; caps limit
// how many licensed users may be admins).
const ADMIN_SEATS = { trial: 1, basic: 999, team: 2, business: 5, enterprise: 999, payg: 5 };

function adminSeatsForPlan(plan) { return ADMIN_SEATS[plan] ?? 2; }
function countAdmins(orgId) {
  return get("SELECT COUNT(*) c FROM users WHERE organization_id = ? AND is_active = 1 AND (is_root_admin = 1 OR account_type IN ('owner','admin'))", [orgId])?.c || 0;
}
function countLicensed(orgId) {
  return get('SELECT COUNT(*) c FROM users WHERE organization_id = ? AND is_active = 1 AND is_licensed = 1', [orgId])?.c || 0;
}
function canAddAdmin(org) {
  if (!org) return { ok: true };
  const cap = org.admin_seats_limit != null ? org.admin_seats_limit : adminSeatsForPlan(org.plan);
  return countAdmins(org.id) < cap ? { ok: true } : { ok: false, reason: `Your plan allows ${cap} admin(s). Upgrade to add more.` };
}
function canAddLicense(org) {
  if (!org || org.seats_limit == null) return { ok: true };
  return countLicensed(org.id) < org.seats_limit ? { ok: true } : { ok: false, reason: `All ${org.seats_limit} licensed seats are in use. Purchase more seats to add users.` };
}

// ── Break-glass (tenant recovery) ─────────────────────────────────────────────
function generatePassword(len = 20) {
  // Readable but strong: base64url of random bytes.
  return crypto.randomBytes(len).toString('base64').replace(/[+/=]/g, '').slice(0, len) + 'Aa1!';
}

/**
 * Create a break-glass recovery account for a tenant. Returns the plaintext
 * password ONCE (never stored in the clear) so the UI can show it to the owner.
 */
function createBreakGlassForOrg(org, ownerEmail) {
  const domain = (String(ownerEmail).split('@')[1] || 'breakglass.local').toLowerCase();
  let email = `breakglass+org${org.id}@${domain}`;
  if (get('SELECT id FROM users WHERE email = ?', [email])) {
    email = `breakglass+org${org.id}-${crypto.randomBytes(3).toString('hex')}@${domain}`;
  }
  const password = generatePassword(20);
  run(`INSERT INTO users (email, password, name, role, organization, organization_id, account_type, is_root_admin, is_break_glass, mfa_enabled, is_active)
       VALUES (?, ?, ?, 'assessor', ?, ?, 'owner', 1, 1, 0, 1)`,
    [email, bcrypt.hashSync(password, 12), `Break-glass (${org.name})`, org.name, org.id]);
  return { email, password };
}

// Managing your OWN workspace (org settings, licensing/seats) is an org-owner
// function, not a platform-operator one. Requires an admin who belongs to an org.
function ensureOrgAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && isAdmin(req.user) &&
      (req.user.organization_id || req.user.is_root_admin)) return next();
  if (req.flash) req.flash('error', 'You do not have permission to manage a workspace.');
  return res.redirect('/admin/dashboard');
}

// ── Tenant data scoping ───────────────────────────────────────────────────
// Every workspace (organization) may see only its OWN projects and the data that
// hangs off them (assessments, intakes, decision packages, POA&M, reports).
// Root admins (platform operators) see everything. Projects carry organization_id;
// child records inherit scope through their project.
function orgId(user) { return user && user.organization_id ? Number(user.organization_id) : null; }

/**
 * SQL WHERE fragment scoping a query to the projects the user may see.
 * @param {object} user
 * @param {string} col - fully-qualified organization_id column (e.g. 'p.organization_id')
 * @returns {{clause:string, params:Array}} — always safe to AND into a WHERE.
 */
function projectScope(user, col = 'organization_id') {
  if (isRootAdmin(user)) return { clause: '1=1', params: [] };
  const id = orgId(user);
  // Legacy / single-tenant admins have no organization — they see the un-orged
  // (NULL) pool, preserving prior behaviour, while org users stay isolated.
  if (!id) return { clause: `${col} IS NULL`, params: [] };
  return { clause: `${col} = ?`, params: [id] };
}

/** Whether `user` may access a specific project row (already fetched). */
function canAccessProject(user, project) {
  if (!project) return false;
  if (isRootAdmin(user)) return true;
  const id = orgId(user);
  if (!id) return project.organization_id == null;   // legacy admin → un-orged pool
  return Number(project.organization_id) === id;
}

/** WHERE fragment scoping an `assessments` query to the user's workspace (via its project). */
function assessmentScope(user, col = 'project_id') {
  if (isRootAdmin(user)) return { clause: '1=1', params: [] };
  const id = orgId(user);
  if (!id) return { clause: `${col} IN (SELECT id FROM projects WHERE organization_id IS NULL)`, params: [] };
  return { clause: `${col} IN (SELECT id FROM projects WHERE organization_id = ?)`, params: [id] };
}

/** WHERE fragment scoping an `intake_submissions` query: its project is in the org, or an org member submitted/created it. */
function intakeScope(user) {
  if (isRootAdmin(user)) return { clause: '1=1', params: [] };
  const id = orgId(user);
  if (!id) return { clause: '(project_id IN (SELECT id FROM projects WHERE organization_id IS NULL) OR project_id IS NULL)', params: [] };
  return {
    clause: '(project_id IN (SELECT id FROM projects WHERE organization_id = ?) OR submitted_by_user_id IN (SELECT id FROM users WHERE organization_id = ?) OR created_by_assessor_id IN (SELECT id FROM users WHERE organization_id = ?))',
    params: [id, id, id]
  };
}

module.exports = {
  isRootAdmin, isAdmin, isCollaborator, ensureRootAdmin, ensureAdmin,
  AI_BANNER, canUseAI, recordAiUse, aiStatus, getAiUse,
  adminSeatsForPlan, countAdmins, countLicensed, canAddAdmin, canAddLicense,
  generatePassword, createBreakGlassForOrg, ensureOrgAdmin,
  orgId, projectScope, canAccessProject, assessmentScope, intakeScope
};
