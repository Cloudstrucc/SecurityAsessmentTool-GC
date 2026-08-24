/**
 * Unified reporting routes (Phase A/B). Mounted at /admin/reports.
 *
 *   GET /admin/reports                     — report hub (what the user may run)
 *   GET /admin/reports/:type/:id           — on-screen report view + format picker
 *   GET /admin/reports/:type/:id.:format   — download in html|pdf|docx|md
 *
 * CSV keeps its existing per-object routes and is untouched here — the picker just
 * links to them.
 *
 * ACCESS (as agreed):
 *   • Organization admins may export any report in their tenant.
 *   • Everyone else may export only reports for assessments they are assigned to.
 *     For a decision package / POA&M register that means the pinned assessment
 *     (falling back to the project's assignments), mirroring POA&M participation.
 *   • Project rollup and portfolio are management views — admin only.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { get, all } = require('../models/database');
const { ensureAuthenticated } = require('../config/passport');
const access = require('../config/access');
const reportModel = require('../config/report-model');
const branding = require('../config/report-branding');
const render = require('../utils/report-render');
const { BRANDING_UPLOAD_DIR } = require('../config/storage');

const TYPES = ['assessment', 'decision-package', 'poam', 'project', 'portfolio'];

function assignedToAssessment(userId, assessmentId) {
  if (!userId || !assessmentId) return false;
  const rows = all(`SELECT 1 FROM assessment_assignments
    WHERE entity_type = 'assessment' AND entity_id = ? AND assigned_to = ? AND status != 'revoked'`,
    [assessmentId, userId]);
  return rows.length > 0;
}
function assignedToProject(userId, projectId) {
  if (!userId || !projectId) return false;
  const rows = all(`SELECT 1 FROM assessment_assignments
    WHERE entity_type = 'project' AND entity_id = ? AND assigned_to = ? AND status != 'revoked'`,
    [projectId, userId]);
  return rows.length > 0;
}

/** Does this user's org own this project? Prevents cross-tenant report reads. */
function sameTenant(user, project) {
  if (!project) return false;
  const orgId = user && user.organization_id;
  if (!orgId || !project.organization_id) return true; // single-tenant / legacy rows
  return Number(project.organization_id) === Number(orgId);
}

/**
 * Authorize a (type, id) request. Returns { ok, project } or { ok:false, code }.
 * Admins pass on tenant match alone; non-admins additionally need an assignment.
 */
function authorize(req, type, id) {
  const user = req.user;
  const admin = access.isAdmin(user);

  if (type === 'portfolio') {
    return admin ? { ok: true, project: null } : { ok: false, code: 403 };
  }
  if (type === 'project') {
    const project = get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!project || !sameTenant(user, project)) return { ok: false, code: 404 };
    if (admin) return { ok: true, project };
    return assignedToProject(user.id, id) ? { ok: true, project } : { ok: false, code: 403 };
  }
  if (type === 'assessment') {
    const a = get('SELECT * FROM assessments WHERE id = ?', [id]);
    if (!a) return { ok: false, code: 404 };
    const project = get('SELECT * FROM projects WHERE id = ?', [a.project_id]);
    if (!sameTenant(user, project)) return { ok: false, code: 404 };
    if (admin) return { ok: true, project };
    return assignedToAssessment(user.id, id) ? { ok: true, project } : { ok: false, code: 403 };
  }
  if (type === 'decision-package' || type === 'poam') {
    const dp = get('SELECT * FROM decision_packages WHERE id = ?', [id]);
    if (!dp) return { ok: false, code: 404 };
    const project = get('SELECT * FROM projects WHERE id = ?', [dp.project_id]);
    if (!sameTenant(user, project)) return { ok: false, code: 404 };
    if (admin) return { ok: true, project };
    const viaAssessment = dp.assessment_id && assignedToAssessment(user.id, dp.assessment_id);
    const viaProject = assignedToProject(user.id, dp.project_id);
    return (viaAssessment || viaProject) ? { ok: true, project } : { ok: false, code: 403 };
  }
  return { ok: false, code: 404 };
}

/** Resolve branding for a report and, if it has a logo, inline it as a data URI. */
function brandingFor(project, user) {
  const b = branding.resolve({
    projectId: project ? project.id : null,
    organizationId: user && user.organization_id
  });
  let logoDataUri = null;
  if (b.logo_filename) {
    try {
      const p = path.join(BRANDING_UPLOAD_DIR, b.logo_filename);
      if (fs.existsSync(p)) {
        const mime = b.logo_mime_type || 'image/png';
        logoDataUri = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
      }
    } catch (e) { /* fall back to wordmark */ }
  }
  return { b, logoDataUri };
}

function buildModel(type, id, req) {
  const opts = { orgId: req.user && req.user.organization_id, req };
  if (type === 'portfolio') opts.orgName = req.user && req.user.organization;
  return reportModel.build(type, id, opts);
}

// ── Report hub ────────────────────────────────────────────────────────────
router.get('/', ensureAuthenticated, (req, res) => {
  const admin = access.isAdmin(req.user);
  const orgId = req.user && req.user.organization_id;
  let projects;
  if (admin) {
    projects = orgId
      ? all('SELECT * FROM projects WHERE organization_id = ? AND archived_at IS NULL ORDER BY name', [orgId])
      : all('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY name');
  } else {
    // Only projects where the user is assigned (directly or via an assessment).
    projects = all(`SELECT DISTINCT p.* FROM projects p
      WHERE p.archived_at IS NULL AND (
        p.id IN (SELECT entity_id FROM assessment_assignments WHERE entity_type='project' AND assigned_to=? AND status!='revoked')
        OR p.id IN (SELECT a.project_id FROM assessments a
                    JOIN assessment_assignments aa ON aa.entity_type='assessment' AND aa.entity_id=a.id
                    WHERE aa.assigned_to=? AND aa.status!='revoked')
      ) ORDER BY p.name`, [req.user.id, req.user.id]);
  }
  const rows = projects.map(p => {
    const assessments = all('SELECT id, type, status, version, overall_score FROM assessments WHERE project_id = ? ORDER BY version DESC, created_at DESC', [p.id]);
    const decisions = all('SELECT id, reference, decision_type, state FROM decision_packages WHERE project_id = ? ORDER BY created_at DESC', [p.id]);
    return { project: p, assessments, decisions };
  });
  res.render('admin/reports-hub', {
    title: req.t ? req.t('rf.reportView') : 'Reports',
    isAdmin: true, admin: req.user, canPortfolio: admin, rows
  });
});

// ── Download / stream a specific format ───────────────────────────────────
// Registered BEFORE the view route: a bare ":id" with no extension falls through
// to next() and is handled by the view route below.
router.get('/:type/:idformat', ensureAuthenticated, async (req, res, next) => {
  const m = String(req.params.idformat).match(/^(.+)\.([a-z0-9]+)$/i);
  if (!m) return next(); // no ".ext" — this is a view request
  const type = req.params.type;
  const id = m[1], format = m[2].toLowerCase();
  if (!TYPES.includes(type)) return next();
  if (format === 'csv') return next(); // handled by existing per-object CSV routes
  if (!render.FORMATS[format]) { req.flash('error', 'Unsupported format.'); return res.redirect(`/admin/reports/${type}/${id}`); }

  const auth = authorize(req, type, id);
  if (!auth.ok) { req.flash('error', auth.code === 403 ? 'You do not have access to that report.' : 'Report not found.'); return res.redirect('/admin/reports'); }
  try {
    const model = buildModel(type, id, req);
    if (!model) { req.flash('error', 'Report not found.'); return res.redirect('/admin/reports'); }
    const { b, logoDataUri } = brandingFor(auth.project, req.user);
    const out = await render.render(model, format, { branding: b, req, logoDataUri });
    res.setHeader('Content-Type', out.contentType);
    // HTML views inline; everything else downloads.
    const disp = format === 'html' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disp}; filename="${out.filename}"`);
    res.send(out.buffer);
  } catch (err) {
    console.error('report render error:', err);
    req.flash('error', 'Could not generate the report: ' + err.message);
    res.redirect(`/admin/reports/${type}/${id}`);
  }
});

// ── On-screen report view with format picker ──────────────────────────────
router.get('/:type/:id', ensureAuthenticated, (req, res, next) => {
  const { type } = req.params;
  if (!TYPES.includes(type)) return next();
  const id = req.params.id;
  const auth = authorize(req, type, id);
  if (!auth.ok) { res.status(auth.code); req.flash('error', auth.code === 403 ? 'You do not have access to that report.' : 'Report not found.'); return res.redirect('/admin/reports'); }
  const model = buildModel(type, id, req);
  if (!model) { req.flash('error', 'Report not found.'); return res.redirect('/admin/reports'); }
  const { b } = brandingFor(auth.project, req.user);
  // CSV is unchanged — the picker links the existing per-object routes where they exist.
  let csvHref = null;
  if (type === 'assessment' && auth.project) csvHref = `/admin/projects/${auth.project.id}/controls.csv?assessment=${id}`;
  else if (type === 'project') csvHref = `/admin/projects/${id}/controls.csv`;
  res.render('admin/report-view', {
    title: `${model.title} — ${model.subject}`, isAdmin: true, admin: req.user,
    model, type, id, reportId: model.reportId, csvHref,
    previewHref: `/admin/reports/${type}/${id}.html`,
    formats: render.PICKER_FORMATS, brandingResolvedFrom: b.resolved_from
  });
});

module.exports = router;
