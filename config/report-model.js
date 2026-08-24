/**
 * Report model (Phase A).
 *
 * A report is assembled ONCE into a format-agnostic model, then handed to a
 * renderer (HTML / PDF / DOCX / Markdown — see utils/report-render). CSV is left
 * exactly as it was and is not produced here.
 *
 * Every assembler is TENANT-SCOPED: it takes the requesting user's organization_id
 * and refuses to read a project or assessment that belongs to a different tenant.
 * A report built against a decision package reads the PINNED assessment version,
 * never live state, so the document is reproducible.
 *
 * Model shape (common):
 *   {
 *     type, title, subtitle, reportId, generatedAt, generatedBy, language,
 *     project, meta:{...}, sections:[ {id, heading, ...} ], immutable:bool
 *   }
 * Renderers walk `sections`; each section carries a `kind` a renderer knows how to
 * draw (kv, table, kpis, familyTable, findings, poam, signatures, flow, prose).
 */
const { get, all } = require('../models/database');
const decisionPackages = require('./decision-packages');
const poam = require('./poam');

// ── result vocabulary shared with the assessment UI ──
const RESULTS = ['satisfied', 'partial', 'failed'];
function normResult(r) {
  const v = String(r || '').toLowerCase();
  if (['satisfied', 'pass', 'compliant', 'met'].includes(v)) return 'satisfied';
  if (['partial', 'partially', 'partially-satisfied'].includes(v)) return 'partial';
  if (['failed', 'fail', 'not-satisfied', 'noncompliant', 'not-met'].includes(v)) return 'failed';
  return null; // pending / unaudited
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

// ── control statistics, grouped by family ──
function familyStats(controls) {
  const fam = new Map();
  let app = 0, s = 0, p = 0, f = 0, na = 0;
  controls.forEach(c => {
    const applicable = c.is_applicable === undefined ? true : !!c.is_applicable;
    const code = c.family || '—';
    if (!fam.has(code)) fam.set(code, { code, name: c.family_name || code, app: 0, s: 0, p: 0, f: 0, na: 0 });
    const row = fam.get(code);
    if (!applicable) { row.na++; na++; return; }
    row.app++; app++;
    const r = normResult(c.audit_result);
    if (r === 'satisfied') { row.s++; s++; }
    else if (r === 'partial') { row.p++; p++; }
    else if (r === 'failed') { row.f++; f++; }
  });
  const families = [...fam.values()].sort((a, b) => a.code.localeCompare(b.code));
  const score = app ? +(((s + p * 0.5) / app) * 100).toFixed(1) : 0;
  return { families, totals: { app, s, p, f, na }, score };
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
}

// ── tenant guards ──
// Fetch a project for report CONTENT. Access control (who may run the report) is
// enforced by the route (routes/reports.js), consistent with the rest of the admin
// app — the model must not second-guess it with its own org check, or an admin who
// can open a record's page would get a false "Report not found" on export.
function projectForOrg(projectId, _orgId) {
  return get('SELECT * FROM projects WHERE id = ?', [projectId]) || null;
}

function meta(kind, req) {
  const now = new Date();
  return {
    generatedAt: now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    generatedBy: (req && req.user && (req.user.name || req.user.email)) || 'System',
    language: (req && req.language) || 'en',
    reportKind: kind
  };
}

// ════════════════════════════════════════════════════════════════════════
// 1. ASSESSMENT REPORT
// ════════════════════════════════════════════════════════════════════════
function assessmentReport(assessmentId, { orgId, req } = {}) {
  const a = get('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
  if (!a) return null;
  const project = projectForOrg(a.project_id, orgId);
  if (!project) return null;
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessmentId]);
  const stats = familyStats(controls);
  const versions = all(`SELECT version, label, summary, created_by_name, created_at
                        FROM assessment_versions WHERE assessment_id = ? ORDER BY version DESC`, [assessmentId]);
  const findings = controls.filter(c => ['partial', 'failed'].includes(normResult(c.audit_result)))
    .map(c => ({
      control_id: c.control_id, family: c.family, title: c.title,
      result: normResult(c.audit_result),
      evidence: stripHtml(c.evidence_text || c.evidence_html), finding: stripHtml(c.audit_comments)
    }));

  return {
    type: 'assessment', immutable: true,
    title: 'Security assessment report', subject: project.name,
    subtitle: `${project.security_framework || 'ITSG-33'} · ${project.security_profile || 'PBMM'} · ${a.type || 'initial'} assessment`,
    reportId: `ASR-${String(assessmentId).padStart(4, '0')}-v${a.version || 1}`,
    project, meta: meta('assessment', req),
    assessment: {
      id: a.id, type: a.type, status: a.status, result: a.result, version: a.version || 1,
      score: a.overall_score != null ? +Number(a.overall_score).toFixed(1) : stats.score,
      ato_type: a.ato_type, submitted_at: fmtDate(a.submitted_at),
      audit_started_at: fmtDate(a.audit_started_at), audit_completed_at: fmtDate(a.audit_completed_at),
      ato_generated_at: fmtDate(a.ato_generated_at), ato_expiry_date: fmtDate(a.ato_expiry_date),
      assessor_signed_at: fmtDate(a.assessor_signed_at), authority_signed_at: fmtDate(a.authority_signed_at),
      cio_signed_at: fmtDate(a.cio_signed_at)
    },
    stats, controls: controls.map(c => ({
      control_id: c.control_id, family: c.family, title: c.title, priority: c.priority,
      is_inherited: !!c.is_inherited, inherited_from: c.inherited_from,
      result: normResult(c.audit_result), evidence_status: c.evidence_status,
      evidence: stripHtml(c.evidence_text || c.evidence_html), finding: stripHtml(c.audit_comments)
    })),
    findings, versions
  };
}

// ════════════════════════════════════════════════════════════════════════
// 2. DECISION PACKAGE  (reads the PINNED assessment version)
// ════════════════════════════════════════════════════════════════════════
function decisionPackage(packageId, { orgId, req } = {}) {
  const dp = get('SELECT * FROM decision_packages WHERE id = ?', [packageId]);
  if (!dp) return null;
  const project = projectForOrg(dp.project_id, orgId);
  if (!project) return null;

  // Pinned snapshot: prefer the assessment_versions row the package points at.
  let snapControls = [];
  let pinnedFrom = 'live';
  if (dp.assessment_version_id) {
    const ver = get('SELECT * FROM assessment_versions WHERE id = ?', [dp.assessment_version_id]);
    if (ver && ver.snapshot_json) {
      try {
        const snap = JSON.parse(ver.snapshot_json);
        snapControls = snap.controls || snap.assessment_controls || [];
        pinnedFrom = 'snapshot';
      } catch (e) { /* fall through to live */ }
    }
  }
  if (!snapControls.length && dp.assessment_id) {
    snapControls = all('SELECT * FROM assessment_controls WHERE assessment_id = ?', [dp.assessment_id]);
  }
  const stats = familyStats(snapControls);
  const items = poam.listForPackage(packageId);
  const promotion = poam.promotionCheck(packageId);
  const versions = decisionPackages.listVersions(packageId);

  return {
    type: 'decision-package', immutable: ['issued', 'expired', 'revoked'].includes(dp.state),
    title: 'Authorization decision package', subject: project.name,
    subtitle: dp.title || `${(dp.decision_type || 'ato').toUpperCase()} — ${project.name}`,
    reportId: `${dp.reference || 'DP-' + dp.id}`,
    project, meta: meta('decision-package', req),
    decision: {
      reference: dp.reference, decision_type: dp.decision_type, state: dp.state,
      assessment_version: dp.assessment_version, assessment_version_id: dp.assessment_version_id,
      assessment_id: dp.assessment_id, pinnedFrom,
      authorizing_official: dp.authorizing_official, assessor: dp.assessor,
      recommended_by: dp.recommended_by, recommended_at: fmtDate(dp.recommended_at),
      decided_by: dp.decided_by, decided_at: fmtDate(dp.decided_at),
      issued_at: fmtDate(dp.issued_at), expires_at: fmtDate(dp.expires_at),
      executive_summary: stripHtml(dp.executive_summary),
      residual_risk_statement: stripHtml(dp.residual_risk_statement),
      decision_rationale: stripHtml(dp.decision_rationale),
      conditions: stripHtml(dp.conditions)
    },
    stats, poam: items, promotion, versions
  };
}

// ════════════════════════════════════════════════════════════════════════
// 3. POA&M REGISTER
// ════════════════════════════════════════════════════════════════════════
function poamRegister(packageId, { orgId, req } = {}) {
  const dp = get('SELECT * FROM decision_packages WHERE id = ?', [packageId]);
  if (!dp) return null;
  const project = projectForOrg(dp.project_id, orgId);
  if (!project) return null;
  const items = poam.listForPackage(packageId);
  const summary = poam.summary(packageId);
  const promotion = poam.promotionCheck(packageId);
  return {
    type: 'poam', immutable: false,
    title: 'Plan of action & milestones register', subject: project.name,
    subtitle: `Decision package ${dp.reference || 'DP-' + dp.id}`,
    reportId: `POAM-${dp.reference || dp.id}`,
    project, meta: meta('poam', req),
    decision: { reference: dp.reference, decision_type: dp.decision_type, state: dp.state,
      issued_at: fmtDate(dp.issued_at), expires_at: fmtDate(dp.expires_at) },
    poam: items, summary, promotion
  };
}

// ════════════════════════════════════════════════════════════════════════
// 4. PROJECT ROLLUP
// ════════════════════════════════════════════════════════════════════════
function projectRollup(projectId, { orgId, req } = {}) {
  const project = projectForOrg(projectId, orgId);
  if (!project) return null;
  const assessments = all('SELECT * FROM assessments WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  const decisions = decisionPackages.listForProject(projectId) || [];
  const documents = all('SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  // Outstanding conditions across the project's issued packages.
  let conditions = [];
  decisions.forEach(dp => {
    poam.listForPackage(dp.id).forEach(i => conditions.push({ ...i, package_ref: dp.reference }));
  });
  const active = assessments.find(a => !['archived', 'superseded'].includes(a.status)) || assessments[0] || null;

  return {
    type: 'project', immutable: false,
    title: 'Project rollup report', subject: project.name,
    subtitle: project.description ? stripHtml(project.description) : '',
    reportId: `PRJ-${String(projectId).padStart(4, '0')}`,
    project, meta: meta('project', req),
    assessments: assessments.map(a => ({
      id: a.id, type: a.type, status: a.status, version: a.version || 1,
      score: a.overall_score != null ? +Number(a.overall_score).toFixed(1) : null,
      result: a.result, updated_at: fmtDate(a.updated_at)
    })),
    decisions: decisions.map(d => ({
      reference: d.reference, decision_type: d.decision_type, state: d.state,
      assessment_version: d.assessment_version, issued_at: fmtDate(d.issued_at), expires_at: fmtDate(d.expires_at)
    })),
    conditions, documents, active
  };
}

// ════════════════════════════════════════════════════════════════════════
// 5. ORG PORTFOLIO SUMMARY
// ════════════════════════════════════════════════════════════════════════
function portfolioSummary({ orgId, orgName, req } = {}) {
  const projects = orgId
    ? all('SELECT * FROM projects WHERE organization_id = ? AND archived_at IS NULL ORDER BY name', [orgId])
    : all('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY name');
  const rows = projects.map(p => {
    const a = get(`SELECT * FROM assessments WHERE project_id = ? ORDER BY version DESC, created_at DESC LIMIT 1`, [p.id]);
    const dps = decisionPackages.listForProject(p.id) || [];
    const active = dps.find(d => ['issued'].includes(d.state)) || dps[0] || null;
    let openConds = 0, overdue = 0;
    dps.forEach(d => poam.listForPackage(d.id).forEach(i => {
      if (!['accepted', 'deferred'].includes(i.state)) openConds++;
      if (i.overdue) overdue++;
    }));
    return {
      name: p.name, classification: p.data_classification, profile: p.security_profile,
      score: a && a.overall_score != null ? +Number(a.overall_score).toFixed(1) : null,
      decision_type: active ? active.decision_type : null,
      state: active ? active.state : (a ? 'in assessment' : 'no assessment'),
      expires_at: active ? fmtDate(active.expires_at) : '—',
      open_conditions: openConds, overdue
    };
  });
  const scored = rows.filter(r => r.score != null);
  const mean = scored.length ? +(scored.reduce((s, r) => s + r.score, 0) / scored.length).toFixed(1) : 0;
  return {
    type: 'portfolio', immutable: false,
    title: 'Organization portfolio summary', subject: orgName || 'Your organization',
    subtitle: `${rows.length} systems`,
    reportId: `PORT-${new Date().toISOString().slice(0, 7)}`,
    project: null, meta: meta('portfolio', req),
    rows, summary: {
      total: rows.length,
      authorized: rows.filter(r => ['issued'].includes(r.state)).length,
      inAssessment: rows.filter(r => r.state === 'in assessment').length,
      openConditions: rows.reduce((s, r) => s + r.open_conditions, 0),
      overdue: rows.reduce((s, r) => s + r.overdue, 0),
      meanScore: mean
    }
  };
}

// ════════════════════════════════════════════════════════════════════════
// 6. INTAKE (the pre-project submission — a single record)
// ════════════════════════════════════════════════════════════════════════
function parseList(v) {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function intakeReport(intakeId, { orgId, req } = {}) {
  const i = get('SELECT * FROM intake_submissions WHERE id = ?', [intakeId]);
  if (!i) return null;
  // Tenant scope: an intake linked to a project must belong to the caller's org.
  if (i.project_id) {
    const p = projectForOrg(i.project_id, orgId);
    if (!p) return null;
  }
  const attachments = all('SELECT * FROM intake_attachments WHERE intake_id = ? ORDER BY id', [intakeId]);
  const techs = parseList(i.technologies);
  if (i.other_tech) techs.push(i.other_tech);
  return {
    type: 'intake', immutable: false,
    title: 'Intake submission', subject: i.project_name || 'Intake',
    subtitle: `${i.security_framework || 'ITSG-33'} · ${i.security_profile || 'PBMM'} · ${i.status || 'pending'}`,
    reportId: i.ref_code || `INT-${String(intakeId).padStart(4, '0')}`,
    project: null, meta: meta('intake', req),
    intake: {
      ref_code: i.ref_code, status: i.status, project_name: i.project_name,
      description: stripHtml(i.project_description), department: i.department, branch: i.branch,
      target_date: i.target_date, user_count: i.user_count, app_type: i.app_type,
      data_classification: i.data_classification, confidentiality_level: i.confidentiality_level,
      integrity_level: i.integrity_level, availability_level: i.availability_level, is_hva: !!i.is_hva,
      security_profile: i.security_profile, security_framework: i.security_framework,
      framework_baseline: i.framework_baseline,
      has_pii: !!i.has_pii, pii_types: parseList(i.pii_types), atip_subject: i.atip_subject,
      pia_completed: i.pia_completed, hosting_type: i.hosting_type, hosting_region: i.hosting_region,
      technologies: techs, has_apis: i.has_apis, mobile_access: i.mobile_access,
      external_users: i.external_users, completed_activities: parseList(i.completed_activities),
      owner_name: i.owner_name, owner_email: i.owner_email, owner_title: i.owner_title,
      tech_lead_name: i.tech_lead_name, tech_lead_email: i.tech_lead_email, tech_lead_title: i.tech_lead_title,
      authority_name: i.authority_name, authority_email: i.authority_email, authority_title: i.authority_title,
      additional_notes: stripHtml(i.additional_notes), assessor_notes: stripHtml(i.assessor_notes),
      submitted_at: fmtDate(i.created_at)
    },
    attachments
  };
}

const BUILDERS = {
  intake: (id, o) => intakeReport(id, o),
  assessment: (id, o) => assessmentReport(id, o),
  'decision-package': (id, o) => decisionPackage(id, o),
  poam: (id, o) => poamRegister(id, o),
  project: (id, o) => projectRollup(id, o),
  portfolio: (id, o) => portfolioSummary(o)
};

/** Build any report type by name. Returns null if not found / not permitted. */
function build(type, id, opts = {}) {
  const fn = BUILDERS[type];
  if (!fn) return null;
  return fn(id, opts);
}

module.exports = {
  build, intakeReport, assessmentReport, decisionPackage, poamRegister, projectRollup, portfolioSummary,
  familyStats, normResult, RESULTS
};
