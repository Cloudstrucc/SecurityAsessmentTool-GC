const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, runBatch, all, get } = require('../models/database');
const { passport, ensureAuthenticated, mfaEnabled } = require('../config/passport');
const { determineProfile, detectComplexity, categorizationLabel, categorizationFullLabel, SECURITY_PROFILES, CONFIDENTIALITY_LEVELS, INTEGRITY_LEVELS, AVAILABILITY_LEVELS } = require('../config/security-profiles');
const { getRecommendedControls, assessSAARequirement, groupByFamily, COMMON_TECHNOLOGIES, CONTROL_FAMILIES, CONTROLS, GC_WEB_GUIDANCE, computeRiskLevel } = require('../config/itsg33-controls');
const {
  normalizeFramework,
  isItsgFramework,
  frameworkMetadata,
  frameworkOptions,
  defaultBaseline,
  defaultCategory,
  buildFrameworkSummary
} = require('../config/security-frameworks');
const { countryNames, govLevelNames, sensitivityNames } = require('../config/framework-map');
const emailService = require('../utils/emailService');
const pdfExport = require('../utils/pdfExport');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const billing = require('../config/billing');
const access = require('../config/access');
const orgSettings = require('../config/org-settings');
const { createNotification } = require('../config/notify');
const { generateSecret: otpGenerateSecret, generateURI: otpGenerateURI, verifySync: otpVerify } = require('otplib');
const QRCode = require('qrcode');
const {
  INTAKE_UPLOAD_DIR: intakeUploadDir,
  PROJECT_UPLOAD_DIR: projectUploadDir,
  BRANDING_UPLOAD_DIR: brandingUploadDir,
  ensureUploadDirs
} = require('../config/storage');

ensureUploadDirs();

// ── Practitioner access control (RBAC) ──────────────────────────────────────
// Invited members/collaborators get a scoped experience. Admins/assessors pass
// through untouched; unauthenticated requests fall through to per-route guards.
const PRACTITIONER_BLOCKED_PREFIXES = [
  '/projects', '/teams', '/security-controls', '/self-assessments',
  '/organization', '/licensing', '/comp-codes', '/users'
];
router.use((req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || access.isAdmin(req.user)) return next();
  const p = req.path;
  const deny = (msg) => {
    if (req.method === 'GET') { req.flash('error', msg); return res.redirect('/admin/dashboard'); }
    return res.status(403).json ? res.status(403).json({ error: msg }) : res.status(403).send(msg);
  };
  // Admin-only sections
  if (PRACTITIONER_BLOCKED_PREFIXES.some(b => p === b || p.startsWith(b + '/'))) {
    return deny("You don't have access to that area.");
  }
  // Full lists are admin-only; practitioners see their own on the dashboard.
  if (p === '/assessments' || p === '/intakes') return res.redirect('/admin/dashboard');
  // Per-action RBAC on an assessment: assessor-only actions are blocked even for
  // the assigned practitioner. They keep view, report downloads and comments.
  if (/^\/assessments\/\d+\/(tailoring|send-invite|assign|start-audit|audit-control|complete-audit|checklist|poam|reactivate|generate-ato|delete|manage-controls|add-controls|remove-control|update-control|ai\/)/.test(p)) {
    return deny('Only an assessor can perform that action.');
  }
  // Scope assessment/intake detail to the practitioner's own assignments.
  let m = p.match(/^\/assessments\/(\d+)(\/|$)/);
  if (m) {
    const a = get('SELECT assigned_to_user_id FROM assessments WHERE id = ?', [m[1]]);
    if (!a || a.assigned_to_user_id !== req.user.id) return deny('That assessment is not assigned to you.');
  }
  m = p.match(/^\/intakes\/(\d+)(\/|$)/);
  if (m) {
    const i = get('SELECT assigned_to_user_id FROM intake_submissions WHERE id = ?', [m[1]]);
    if (!i || i.assigned_to_user_id !== req.user.id) return deny('That intake is not assigned to you.');
  }
  next();
});

const intakeUpload = multer({
  dest: intakeUploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});
const projectUpload = multer({
  dest: projectUploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }
});
const brandingUpload = multer({
  dest: brandingUploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function makeSlug(name) {
  const base = slugBase(name);
  let slug = base;
  let i = 2;
  while (get('SELECT id FROM projects WHERE slug = ?', [slug])) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function slugBase(name) {
  return (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
}

function findProjectForIntake(body) {
  const name = (body.name || body.projectName || '').trim();
  if (!name) return null;

  const slug = slugBase(name);
  const existingProject = get(
    `SELECT * FROM projects
     WHERE slug = ? OR LOWER(name) = LOWER(?)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [slug, name]
  );
  if (existingProject) return existingProject;

  return get(
    `SELECT p.*
     FROM intake_submissions i
     JOIN projects p ON p.id = i.project_id
     WHERE LOWER(i.project_name) = LOWER(?)
     ORDER BY i.updated_at DESC
     LIMIT 1`,
    [name]
  );
}

function getSecurityProfileFromBody(body, hasPII) {
  if (body.security_profile) return body.security_profile;
  const confLevel = body.confidentiality_level || body.data_classification || 'protected-b';
  const intLevel = body.integrity_level || 'medium';
  const avaLevel = body.availability_level || 'medium';
  const profileResult = determineProfile({
    confidentiality: confLevel,
    integrity: intLevel,
    availability: avaLevel,
    hasPII: hasPII === 1,
    isHVA: body.is_hva === '1' || body.is_hva === 'on',
    hasComplexity: detectComplexity(body.description || body.project_description || '')
  });
  return profileResult.profile.id;
}

function getFrameworkFields(body = {}, fallback = {}) {
  const framework = normalizeFramework(
    body.security_framework ||
    body.securityFramework ||
    fallback.security_framework ||
    fallback.securityFramework
  );
  return {
    securityFramework: framework,
    frameworkBaseline: body.framework_baseline || body.frameworkBaseline || fallback.framework_baseline || defaultBaseline(framework),
    frameworkCategory: body.framework_category || body.frameworkCategory || fallback.framework_category || defaultCategory(framework),
    frameworkApplicability: body.framework_applicability || body.frameworkApplicability || fallback.framework_applicability || ''
  };
}

function getAvailableFrameworkOptions() {
  const frameworks = all('SELECT DISTINCT framework FROM security_control_catalog ORDER BY framework');
  return frameworkOptions(frameworks);
}

function rowToCatalogControl(row) {
  const family = row.family || String(row.control_id || '').split(/[.\-(]/)[0] || row.framework;
  const id = row.control_id;
  return {
    id,
    family,
    familyName: row.category || row.family || row.framework,
    title: row.title,
    description: row.description || row.guidance || '',
    evidenceGuidance: row.guidance || row.applicability_notes || '',
    controlGuidance: row.guidance || '',
    priority: row.baseline && /high|ig3|ml3|secret|protected/i.test(row.baseline) ? 'P1' : 'P2',
    riskLevel: row.baseline && /high|ig3|ml3|secret|protected/i.test(row.baseline) ? 'high' : 'medium',
    framework: row.framework,
    baseline: row.baseline || '',
    category: row.category || ''
  };
}

function filterCatalogControls(projectInfo, documents = [], includeAll = false) {
  const framework = normalizeFramework(projectInfo.securityFramework || projectInfo.security_framework);
  const baseline = projectInfo.frameworkBaseline || projectInfo.framework_baseline || defaultBaseline(framework);
  const category = projectInfo.frameworkCategory || projectInfo.framework_category || defaultCategory(framework);
  const params = [framework];
  let where = 'framework = ?';

  if (baseline && !['Full control catalog', 'annex-a', 'risk-treatment', 'soa-custom'].includes(baseline)) {
    const baselineAliases = [baseline, `%${baseline}%`];
    if (/^IG[123]$/.test(baseline)) baselineAliases.push(`%Implementation Group ${baseline.slice(2)}%`, `%Implementation Groups ${baseline.slice(2)}%`);
    if (/^ML[123]$/.test(baseline)) baselineAliases.push(`%Maturity Level ${baseline.slice(2)}%`);
    where += ` AND (baseline = ? OR baseline LIKE ?${baselineAliases.slice(2).map(() => ' OR baseline LIKE ?').join('')} OR baseline = "" OR baseline IS NULL)`;
    params.push(...baselineAliases);
  }
  if (category && category !== 'all' && !category.startsWith('fips-') && !category.includes('custom') && !category.includes('agency') && !category.includes('cloud-service') && !category.includes('federal-')) {
    where += ' AND (category = ? OR category LIKE ? OR family = ? OR family LIKE ?)';
    params.push(category, `%${category}%`, category, `%${category}%`);
  }

  const rows = all(`
    SELECT * FROM security_control_catalog
    WHERE ${where}
    ORDER BY family, control_id
  `, params);
  const controls = rows.map(rowToCatalogControl);
  if (includeAll) return controls;

  const context = [
    projectInfo.description || '',
    projectInfo.appType || projectInfo.app_type || '',
    projectInfo.hostingType || projectInfo.hosting_type || '',
    projectInfo.technologies || '',
    projectInfo.frameworkApplicability || projectInfo.framework_applicability || '',
    documents.map(d => `${d.original_name || ''} ${d.ai_summary || ''}`).join(' ')
  ].join(' ').toLowerCase();

  const coreTerms = ['access', 'identity', 'asset', 'inventory', 'logging', 'monitoring', 'incident', 'risk', 'vulnerability', 'configuration', 'encryption', 'backup', 'policy'];
  let selected = controls.filter(control => {
    const haystack = `${control.id} ${control.title} ${control.description} ${control.evidenceGuidance} ${control.familyName}`.toLowerCase();
    if (coreTerms.some(term => haystack.includes(term))) return true;
    if (projectInfo.hasPII && /privacy|personal|data protection|information protection|pii/i.test(haystack)) return true;
    if (context.includes('cloud') && /cloud|configuration|identity|logging|network|encryption/i.test(haystack)) return true;
    if (context.includes('api') && /api|interface|authentication|authorization|input|web/i.test(haystack)) return true;
    return false;
  });

  if (selected.length < Math.min(25, controls.length)) {
    selected = controls.slice(0, Math.min(60, controls.length));
  }
  return selected.slice(0, 120);
}

function groupCatalogControls(controls) {
  const groups = {};
  controls.forEach(control => {
    if (!groups[control.family]) groups[control.family] = { code: control.family, name: control.familyName || control.family, controls: [] };
    groups[control.family].controls.push(control);
  });
  return Object.values(groups);
}

function getAssessmentControlsForProject(project, documents = [], includeAll = false) {
  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}
  const framework = normalizeFramework(project.security_framework);
  const commonInfo = {
    dataClassification: project.data_classification,
    confidentiality: project.confidentiality_level || project.data_classification,
    hostingType: project.hosting_type,
    appType: project.app_type,
    hasPII: !!project.has_pii,
    technologies: techs,
    description: project.description,
    securityProfile: project.security_profile || 'PBMM',
    isHVA: !!project.is_hva,
    securityFramework: framework,
    frameworkBaseline: project.framework_baseline || defaultBaseline(framework),
    frameworkCategory: project.framework_category || defaultCategory(framework),
    frameworkApplicability: project.framework_applicability || ''
  };

  if (isItsgFramework(framework)) {
    const normalizeItsgControl = control => ({
      ...control,
      familyName: CONTROL_FAMILIES[control.family] || control.family,
      controlGuidance: control.controlGuidance || control.evidenceGuidance || '',
      riskLevel: computeRiskLevel({ family: control.family, priority: control.priority || 'P1' }),
      framework: 'ITSG-33'
    });
    const baselineControls = getRecommendedControls(commonInfo).map(normalizeItsgControl);
    const tailoredControls = selectRelevantControls(commonInfo, documents).map(normalizeItsgControl);
    return {
      framework,
      projectInfo: commonInfo,
      baselineControls,
      controls: includeAll ? baselineControls : tailoredControls,
      families: groupByFamily(includeAll ? baselineControls : tailoredControls),
      saaCheck: assessSAARequirement(commonInfo)
    };
  }

  const baselineControls = filterCatalogControls(commonInfo, documents, true);
  const controls = filterCatalogControls(commonInfo, documents, includeAll);
  return {
    framework,
    projectInfo: commonInfo,
    baselineControls,
    controls,
    families: groupCatalogControls(controls),
    saaCheck: { requiresSAA: true, reason: `${frameworkMetadata(framework).label} assessment selected for this project.` }
  };
}

function createProjectIntake({ projectId, body, createdBy, files = [], status = 'in-review' }) {
  const refCode = 'INT-' + uuidv4().substring(0, 8).toUpperCase();
  const technologies = asArray(body.technologies);
  const piiTypes = asArray(body.piiTypes);
  const activities = asArray(body.completedActivities);
  const hasPII = body.has_pii || (piiTypes.length > 0 && !piiTypes.includes('none')) ? 1 : 0;
  const confLevel = body.confidentiality_level || body.data_classification || 'protected-b';
  const intLevel = body.integrity_level || 'medium';
  const avaLevel = body.availability_level || 'medium';
  const frameworkFields = getFrameworkFields(body);
  const securityProfile = isItsgFramework(frameworkFields.securityFramework)
    ? getSecurityProfileFromBody(body, hasPII)
    : (frameworkFields.frameworkBaseline || getSecurityProfileFromBody(body, hasPII));

  const intakeId = run(
    `INSERT INTO intake_submissions (
      ref_code, status, project_name, project_description, department, branch,
      target_date, user_count, app_type, data_classification,
      confidentiality_level, integrity_level, availability_level, is_hva,
      security_profile, security_framework, framework_baseline, framework_category, framework_applicability,
      pii_types, has_pii, atip_subject, pia_completed,
      hosting_type, hosting_region, technologies, other_tech,
      has_apis, gc_interconnections, interconnections, mobile_access, external_users,
      completed_activities, owner_name, owner_email, owner_title,
      tech_lead_name, tech_lead_email, tech_lead_title,
      authority_name, authority_email, authority_title,
      additional_notes, project_id, created_by_assessor_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      refCode, status, body.name || body.projectName || '', body.description || body.projectDescription || '',
      body.department || '', body.branch || '',
      body.targetDate || body.target_date || '', body.userCount || body.user_count || '', body.app_type || '',
      confLevel, confLevel, intLevel, avaLevel, body.is_hva ? 1 : 0,
      securityProfile, frameworkFields.securityFramework, frameworkFields.frameworkBaseline,
      frameworkFields.frameworkCategory, frameworkFields.frameworkApplicability,
      JSON.stringify(piiTypes), hasPII,
      body.atipSubject || body.atip_subject || '', body.piaCompleted || body.pia_completed || '',
      body.hosting_type || body.hostingType || '', body.hostingRegion || body.hosting_region || '',
      JSON.stringify(technologies), body.otherTech || body.other_tech || body.specifications || '',
      body.hasAPIs || body.has_apis || '', body.gcInterconnections || body.gc_interconnections || '',
      body.interconnections || '', body.mobileAccess || body.mobile_access || '', body.externalUsers || body.external_users || '',
      JSON.stringify(activities),
      body.project_owner_name || body.ownerName || '', normalizeEmail(body.project_owner_email || body.ownerEmail), body.ownerTitle || '',
      body.techLeadName || '', normalizeEmail(body.techLeadEmail), body.techLeadTitle || '',
      body.project_authority_name || body.authorityName || '', normalizeEmail(body.project_authority_email || body.authorityEmail), body.authorityTitle || '',
      body.additional_notes || body.additionalNotes || '', projectId, createdBy
    ]
  );

  files.forEach(file => {
    run(
      `INSERT INTO intake_attachments (intake_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?)`,
      [intakeId, file.filename, file.originalname, file.mimetype, file.size]
    );
  });

  return intakeId;
}

function recordProjectDocuments({ projectId, intakeId, files = [], user }) {
  files.forEach(file => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '') || 'document';
    run(
      `INSERT INTO project_documents
        (project_id, intake_id, filename, original_name, document_type, mime_type, size, uploaded_by_user_id, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        intakeId || null,
        file.filename,
        file.originalname,
        ext,
        file.mimetype || '',
        file.size || 0,
        user?.id || null,
        user?.name || ''
      ]
    );
  });
}

function getProjectDocuments(projectId) {
  return all(`
    SELECT d.*, p.name AS project_name
    FROM project_documents d
    JOIN projects p ON p.id = d.project_id
    WHERE d.project_id = ? AND d.status != 'deleted'
    ORDER BY d.created_at DESC, d.id DESC
  `, [projectId]);
}

function getProjectBranding(projectId) {
  return get(`
    SELECT *
    FROM report_branding
    WHERE project_id = ?
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `, [projectId]) || {};
}

function getProjectControlOptions(projectId, assessmentId) {
  const params = [projectId];
  let assessmentFilter = '';
  if (assessmentId) {
    assessmentFilter = 'AND ac.assessment_id = ?';
    params.push(assessmentId);
  }
  return all(`
    SELECT ac.control_id, ac.title, ac.family, ac.assessment_id, a.invite_code
    FROM assessment_controls ac
    JOIN assessments a ON a.id = ac.assessment_id
    WHERE a.project_id = ? ${assessmentFilter}
    ORDER BY ac.family, ac.control_id
  `, params);
}

function getAtoPoamItems(ato) {
  if (!ato?.id) return [];
  return all(`
    SELECT ic.*, ac.title AS control_title, ac.family AS control_family, a.invite_code AS assessment_invite_code
    FROM iato_checklist ic
    LEFT JOIN assessments a ON a.id = ic.assessment_id
    LEFT JOIN assessment_controls ac ON ac.assessment_id = ic.assessment_id AND ac.control_id = ic.control_id
    WHERE ic.ato_record_id = ?
    ORDER BY CASE ic.risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      COALESCE(ic.deadline, ic.updated_at, ic.created_at)
  `, [ato.id]);
}

function resolveProjectDocumentPath(document) {
  const candidates = [
    path.join(projectUploadDir, document.filename),
    path.join(intakeUploadDir, document.filename)
  ];
  return candidates.find(p => fs.existsSync(p));
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

function catalogFilterParts(query = {}) {
  const filters = [];
  const params = [];
  const framework = query.framework || '';
  const family = query.family || '';
  const keyword = (query.q || '').trim().toLowerCase();
  const baseline = query.baseline || '';
  const category = query.category || '';
  const applicability = query.applicability || '';
  const status = query.status || '';

  if (framework) { filters.push('framework = ?'); params.push(framework); }
  if (family) { filters.push('family = ?'); params.push(family); }
  if (baseline) { filters.push('baseline LIKE ?'); params.push(`%${baseline}%`); }
  if (category) { filters.push('category = ?'); params.push(category); }
  if (applicability) { filters.push('applicability_notes LIKE ?'); params.push(`%${applicability}%`); }
  if (status) { filters.push('status = ?'); params.push(status); }
  if (keyword) {
    filters.push('(LOWER(control_id) LIKE ? OR LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(guidance) LIKE ? OR LOWER(definitions) LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  return {
    where: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params,
    filters: { framework, family, q: query.q || '', baseline, category, applicability, status }
  };
}

function projectSlugName(name) {
  return (name || 'project').replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'project';
}

function readDocumentText(document) {
  const filePath = resolveProjectDocumentPath(document);
  if (!filePath) return '';
  const ext = path.extname(document.original_name || document.filename).toLowerCase();
  if (['.txt', '.md', '.html', '.htm', '.csv', '.json', '.xml'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8').slice(0, 60000);
  }
  return `[${document.original_name}] is a binary document (${document.mime_type || 'unknown type'}).`;
}

function selectRelevantControls(projectInfo, documents = []) {
  const baseline = getRecommendedControls(projectInfo);
  const context = [
    projectInfo.description || '',
    projectInfo.technologies || '',
    projectInfo.hostingType || '',
    projectInfo.appType || '',
    documents.map(d => `${d.original_name || ''} ${d.ai_summary || ''}`).join(' ')
  ].join(' ').toLowerCase();

  const essentialFamilies = new Set(['AC', 'AU', 'CA', 'CM', 'IA', 'IR', 'PL', 'RA', 'SC', 'SI']);
  const selected = baseline.filter(control => {
    if (control.priority === 'P1' && essentialFamilies.has(control.family)) return true;
    if (projectInfo.hasPII && ['AP', 'DM', 'UL'].includes(control.family)) return true;
    if (projectInfo.isHVA && control.priority === 'P1') return true;
    const tags = (control.tags || []).join(' ').toLowerCase();
    if (tags && context.split(/\W+/).some(word => word.length > 3 && tags.includes(word))) return true;
    if (context.includes('azure') && ['CA', 'CM', 'SC', 'SI', 'IA'].includes(control.family)) return true;
    if (context.includes('api') && ['AC', 'IA', 'SC', 'SI'].includes(control.family)) return true;
    if (context.includes('document') && ['MP', 'PL', 'RA'].includes(control.family)) return true;
    return false;
  });

  const seen = new Set();
  return selected.filter(control => {
    if (seen.has(control.id)) return false;
    seen.add(control.id);
    return true;
  });
}

function getPrimaryIntakeForProject(projectId) {
  return get('SELECT * FROM intake_submissions WHERE project_id = ? ORDER BY created_at ASC LIMIT 1', [projectId]);
}

function ensureProjectIntake(project, createdBy) {
  const existing = getPrimaryIntakeForProject(project.id);
  if (existing) return existing.id;

  return createProjectIntake({
    projectId: project.id,
    createdBy,
    status: 'in-review',
    body: {
      name: project.name,
      description: project.description,
      data_classification: project.data_classification,
      confidentiality_level: project.confidentiality_level || project.data_classification,
      integrity_level: project.integrity_level || 'medium',
      availability_level: project.availability_level || 'medium',
      security_profile: project.security_profile || 'PBMM',
      security_framework: project.security_framework || 'ITSG-33',
      framework_baseline: project.framework_baseline || '',
      framework_category: project.framework_category || '',
      framework_applicability: project.framework_applicability || '',
      is_hva: project.is_hva ? '1' : '',
      hosting_type: project.hosting_type,
      app_type: project.app_type,
      has_pii: project.has_pii ? '1' : '',
      technologies: JSON.parse(project.technologies || '[]'),
      specifications: project.specifications,
      project_owner_name: project.project_owner_name,
      project_owner_email: project.project_owner_email,
      project_authority_name: project.project_authority_name,
      project_authority_email: project.project_authority_email,
      department: project.department,
      branch: project.branch
    }
  });
}

function getAssignableUsers() {
  return all(`
    SELECT id, name, email, role, organization
    FROM users
    WHERE is_active = 1 AND role IN ('client','assessor')
    ORDER BY role, name, email
  `);
}

function getEntityAssignments(entityType, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all(
    `SELECT aa.*, u.name AS assignee_name, u.email AS user_email, u.role AS user_role
     FROM assessment_assignments aa
     LEFT JOIN users u ON u.id = aa.assigned_to
     WHERE aa.entity_type = ? AND aa.entity_id IN (${placeholders}) AND aa.status != 'revoked'
     ORDER BY aa.created_at DESC`,
    [entityType, ...ids]
  );
}

function createInvitation({ type, email, name, organization, message, invitedBy, req, entityType, entityId }) {
  const inviteCode = uuidv4().substring(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitationId = run(
    `INSERT INTO invitations (type, email, name, organization, invite_code, invited_by, expires_at, message, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [type, email, name || '', organization || '', inviteCode, invitedBy, expiresAt, message || '', entityType || '', entityId || null]
  );

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  emailService.sendUserInvitation({
    to: email,
    recipientName: name || '',
    inviteCode,
    invitedByName: req.user.name,
    role: type,
    organization: organization || req.user.organization || '',
    baseUrl,
    message: message || ''
  }).catch(err => console.error('[Email] Invitation failed:', err.message));

  return { invitationId, inviteCode };
}

function upsertEntityAssignment({ entityType, entityId, user, email, assigneeRole, assignedBy, invitationId, notes }) {
  const existing = user
    ? get(
      `SELECT id FROM assessment_assignments
       WHERE entity_type = ? AND entity_id = ? AND assigned_to = ? AND status != 'revoked'`,
      [entityType, entityId, user.id]
    )
    : get(
      `SELECT id FROM assessment_assignments
       WHERE entity_type = ? AND entity_id = ? AND LOWER(assignee_email) = ? AND status != 'revoked'`,
      [entityType, entityId, email]
    );

  if (existing) return existing.id;

  return run(
    `INSERT INTO assessment_assignments
      (entity_type, entity_id, assigned_to, assignee_email, assignee_role, assigned_by, invitation_id, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, user?.id || null, email || user?.email || '', assigneeRole, assignedBy, invitationId || null, user ? 'active' : 'pending', notes || '']
  );
}

function updateAssignmentColumns(entityType, entityId, user, email, role) {
  if (entityType === 'intake') {
    run(
      `UPDATE intake_submissions SET assigned_to_user_id = ?, assigned_to_email = ?, assigned_to_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user?.id || null, email || user?.email || '', role, entityId]
    );
  }
  if (entityType === 'assessment') {
    run(
      `UPDATE assessments SET assigned_to_user_id = ?, assigned_to_email = ?, assigned_to_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user?.id || null, email || user?.email || '', role, entityId]
    );
  }
}

function entityLink(entityType, entityId) {
  if (entityType === 'assessment') return `/admin/assessments/${entityId}`;
  if (entityType === 'intake') return `/admin/intakes/${entityId}`;
  if (entityType === 'project') return `/admin/projects/${entityId}`;
  return '/admin/dashboard';
}
function assignEntityFromRequest({ req, entityType, entityId, entityName }) {
  const mode = req.body.assignment_mode || 'existing';
  const assigneeRole = req.body.assignee_role || 'client';
  const notes = req.body.assignment_notes || '';

  if (mode === 'existing') {
    const user = get(
      `SELECT * FROM users WHERE id = ? AND role IN ('client','assessor') AND is_active = 1`,
      [req.body.assignee_user_id]
    );
    if (!user) throw new Error('Selected user was not found.');

    upsertEntityAssignment({ entityType, entityId, user, assigneeRole: user.role, assignedBy: req.user.id, notes });
    updateAssignmentColumns(entityType, entityId, user, user.email, user.role);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = entityLink(entityType, entityId);
    createNotification(user.id, {
      type: 'assignment',
      title: `You were assigned to a ${entityType}`,
      body: entityName, link
    });
    emailService.sendAssignmentNotification({
      to: user.email,
      recipientName: user.name,
      entityType,
      entityName,
      assignedByName: req.user.name,
      baseUrl, link,
      message: notes,
      smtpConfig: orgSettings.orgSmtp(req.user.organization_id)
    }).catch(err => console.error('[Email] Assignment notification failed:', err.message));

    return { email: user.email, name: user.name, pending: false };
  }

  const email = normalizeEmail(req.body.invite_email);
  if (!email) throw new Error('Email is required to invite a new user.');

  const existingUser = get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
  if (existingUser) {
    upsertEntityAssignment({ entityType, entityId, user: existingUser, assigneeRole: existingUser.role, assignedBy: req.user.id, notes });
    updateAssignmentColumns(entityType, entityId, existingUser, existingUser.email, existingUser.role);
    return { email: existingUser.email, name: existingUser.name, pending: false };
  }

  let invitation = get(
    `SELECT * FROM invitations WHERE LOWER(email) = ? AND type = ? AND status = 'pending'`,
    [email, assigneeRole]
  );
  let inviteCode = invitation?.invite_code;
  if (!invitation) {
    const created = createInvitation({
      type: assigneeRole,
      email,
      name: req.body.invite_name || '',
      organization: req.body.invite_organization || '',
      message: req.body.invite_message || '',
      invitedBy: req.user.id,
      req,
      entityType,
      entityId
    });
    invitation = { id: created.invitationId };
    inviteCode = created.inviteCode;
  }

  upsertEntityAssignment({
    entityType,
    entityId,
    email,
    assigneeRole,
    assignedBy: req.user.id,
    invitationId: invitation.id,
    notes
  });
  updateAssignmentColumns(entityType, entityId, null, email, assigneeRole);

  return { email, name: req.body.invite_name || email, pending: true, inviteCode };
}

function copyIntakeAssignmentsToAssessment(intakeId, assessmentId, assignedBy) {
  const assignments = all(
    `SELECT * FROM assessment_assignments
     WHERE entity_type = 'intake' AND entity_id = ? AND status != 'revoked'`,
    [intakeId]
  );
  assignments.forEach(a => {
    upsertEntityAssignment({
      entityType: 'assessment',
      entityId: assessmentId,
      user: a.assigned_to ? { id: a.assigned_to, email: a.assignee_email } : null,
      email: a.assignee_email,
      assigneeRole: a.assignee_role || 'client',
      assignedBy: assignedBy || a.assigned_by,
      invitationId: a.invitation_id,
      notes: a.notes || 'Copied from linked intake'
    });
    if (a.assigned_to) {
      const user = get('SELECT id, email, role FROM users WHERE id = ?', [a.assigned_to]);
      if (user) updateAssignmentColumns('assessment', assessmentId, user, user.email, user.role);
    } else if (a.assignee_email) {
      updateAssignmentColumns('assessment', assessmentId, null, a.assignee_email, a.assignee_role || 'client');
    }
  });
}

// ── AUTH ──
router.get('/login', (req, res) => {
  if (req.isAuthenticated() && req.session.adminMfaVerified) return res.redirect('/admin/dashboard');
  // MFA globally off → already-authenticated users go straight to the dashboard (no QR).
  if (req.isAuthenticated() && !mfaEnabled()) {
    req.session.adminMfaVerified = true;
    return res.redirect('/admin/dashboard');
  }
  if (req.isAuthenticated()) {
    const user = get('SELECT mfa_enabled, totp_secret, webauthn_credential_id, is_break_glass FROM users WHERE id = ?', [req.user.id]);
    if (user?.is_break_glass) {
      req.session.adminMfaVerified = true;
      return res.redirect('/admin/dashboard');
    }
    if (!user?.mfa_enabled || !user?.totp_secret) return res.redirect('/admin/mfa-setup');
    return res.render('admin/login', {
      title: 'Verify MFA',
      layout: 'main',
      mfaStep: true,
      userId: req.user.id,
      hasWebAuthn: !!user.webauthn_credential_id
    });
  }
  res.render('admin/login', { title: 'Assessor Login', layout: 'main', prefillEmail: req.query.email || '' });
});

router.post('/login', (req, res, next) => {
  if (req.body._mfa_step && req.isAuthenticated()) {
    const user = get('SELECT id, totp_secret, mfa_enabled, webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.mfa_enabled || !user.totp_secret) return res.redirect('/admin/mfa-setup');

    const isValid = otpVerify({ secret: user.totp_secret, token: req.body.token, window: 1 }).valid;
    if (!isValid) {
      req.flash('error', 'Invalid authentication code. Please try again.');
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: user.id,
        hasWebAuthn: !!user.webauthn_credential_id
      });
    }

    req.session.adminMfaVerified = true;
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    return res.redirect('/admin/dashboard');
  }

  if (req.body._webauthn_step && req.isAuthenticated()) {
    const { consumeToken } = require('../config/mfa-signature');
    const tokenUserId = consumeToken(req.body._sig_token);
    if (!tokenUserId || tokenUserId !== req.user.id) {
      req.flash('error', 'Passkey verification failed. Please try again or use TOTP.');
      const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: req.user.id,
        hasWebAuthn: !!user?.webauthn_credential_id
      });
    }
    req.session.adminMfaVerified = true;
    run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);
    return res.redirect('/admin/dashboard');
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info?.message || 'Invalid credentials');
      return res.redirect('/admin/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const dbUser = get('SELECT mfa_enabled, totp_secret, webauthn_credential_id, is_break_glass FROM users WHERE id = ?', [user.id]);
      // MFA globally off, or break-glass → straight to the dashboard.
      if (!mfaEnabled() || dbUser?.is_break_glass) {
        req.session.adminMfaVerified = true;
        return res.redirect('/admin/dashboard');
      }
      if (!dbUser?.mfa_enabled || !dbUser?.totp_secret) {
        // MFA is optional — do not force setup. The user can enable TOTP/passkey
        // from settings if they choose.
        req.session.adminMfaVerified = true;
        return res.redirect('/admin/dashboard');
      }

      req.session.adminMfaVerified = false;
      return res.render('admin/login', {
        title: 'Verify MFA',
        layout: 'main',
        mfaStep: true,
        userId: user.id,
        hasWebAuthn: !!dbUser.webauthn_credential_id
      });
    });
  })(req, res, next);
});

router.get('/logout', (req, res) => {
  delete req.session.adminMfaVerified;
  req.logout(() => res.redirect('/admin/login'));
});

router.get('/mfa-setup', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  const user = get('SELECT id, email, totp_secret, mfa_enabled FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.redirect('/admin/login');

  let secret = user.totp_secret;
  if (!secret) {
    secret = otpGenerateSecret();
    run('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, user.id]);
  }

  const otpauth = otpGenerateURI({ issuer: 'Aegis SA Platform', label: user.email, secret });
  try {
    const qrCodeUrl = await QRCode.toDataURL(otpauth);
    res.render('admin/login', {
      title: 'MFA Setup',
      layout: 'main',
      mfaSetup: true,
      qrCodeUrl,
      secret,
      mfaAlreadyEnabled: user.mfa_enabled === 1
    });
  } catch (err) {
    console.error('QR code error:', err);
    req.flash('error', 'Failed to generate QR code.');
    res.redirect('/admin/login');
  }
});

router.post('/mfa-setup', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  const user = get('SELECT id, totp_secret FROM users WHERE id = ?', [req.user.id]);
  if (!user || !user.totp_secret) {
    req.flash('error', 'MFA setup failed. Please try again.');
    return res.redirect('/admin/mfa-setup');
  }

  const isValid = otpVerify({ secret: user.totp_secret, token: req.body.token, window: 1 }).valid;
  if (!isValid) {
    req.flash('error', 'Invalid code. Please try again.');
    return res.redirect('/admin/mfa-setup');
  }

  run('UPDATE users SET mfa_enabled = 1, must_reenroll_mfa = 0 WHERE id = ?', [user.id]);
  req.session.adminMfaVerified = true;
  req.flash('success', 'MFA enabled. You can optionally register a passkey; TOTP will remain available.');
  res.redirect('/admin/passkey-setup');
});

router.get('/passkey-setup', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/admin/login');
  if (!req.session.adminMfaVerified) return res.redirect('/admin/login');
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [req.user.id]);
  res.render('admin/passkey-setup', {
    title: 'Register Passkey',
    layout: 'main',
    hasWebAuthn: !!user?.webauthn_credential_id
  });
});

router.get('/register', (req, res) => {
  const inviteCode = req.query.invite || '';
  let formData = {};
  if (inviteCode) {
    const invite = get("SELECT email, name, organization FROM invitations WHERE invite_code = ? AND status = 'pending'", [inviteCode.trim().toUpperCase()]);
    if (invite) formData = { email: invite.email, name: invite.name, organization: invite.organization };
  }
  res.render('admin/register', {
    title: 'Assessor Registration',
    layout: 'main',
    inviteCode,
    formData
  });
});

router.post('/register', (req, res) => {
  try {
    const { name, email, organization, password, confirmPassword, invite_code } = req.body;
    if (!name || !email || !password || !invite_code) {
      req.flash('error', 'Name, email, password, and invitation code are required.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (password.length < 10) {
      req.flash('error', 'Password must be at least 10 characters.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }

    const invite = get(
      "SELECT * FROM invitations WHERE invite_code = ? AND type = 'assessor' AND status = 'pending'",
      [invite_code.trim().toUpperCase()]
    );
    if (!invite || new Date(invite.expires_at) < new Date()) {
      req.flash('error', 'Invalid or expired invitation code.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (normalizeEmail(email) !== normalizeEmail(invite.email)) {
      req.flash('error', `Please register with the invited email address (${invite.email}).`);
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }
    if (get('SELECT id FROM users WHERE email = ?', [normalizeEmail(email)])) {
      req.flash('error', 'An account with this email already exists.');
      return res.render('admin/register', { title: 'Assessor Registration', layout: 'main', inviteCode: invite_code, formData: req.body });
    }

    const userId = run(
      `INSERT INTO users (email, password, name, role, organization, totp_secret, mfa_enabled, is_active)
       VALUES (?, ?, ?, 'assessor', ?, ?, 0, 1)`,
      [normalizeEmail(email), bcrypt.hashSync(password, 12), name, organization || invite.organization || '', otpGenerateSecret()]
    );
    run("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ? WHERE id = ?", [userId, invite.id]);
    run("UPDATE assessment_assignments SET assigned_to = ?, status = 'active', accepted_at = CURRENT_TIMESTAMP WHERE invitation_id = ?", [userId, invite.id]);
    run("UPDATE assessments SET assigned_to_user_id = ? WHERE LOWER(assigned_to_email) = ?", [userId, normalizeEmail(email)]);
    run("UPDATE intake_submissions SET assigned_to_user_id = ? WHERE LOWER(assigned_to_email) = ?", [userId, normalizeEmail(email)]);

    req.flash('success', 'Account created. Please sign in and set up MFA.');
    res.redirect('/admin/login');
  } catch (err) {
    console.error('Assessor registration error:', err);
    req.flash('error', 'Registration failed: ' + err.message);
    res.redirect('/admin/register');
  }
});

// ── DASHBOARD ──
router.get('/dashboard', ensureAuthenticated, (req, res) => {
  const projects = all('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 10');
  const assessments = all(`
    SELECT a.*, p.name as project_name
    FROM assessments a JOIN projects p ON a.project_id = p.id
    WHERE a.archived_at IS NULL AND p.archived_at IS NULL
    ORDER BY a.updated_at DESC LIMIT 10
  `);
  const recentIntakes = all(`SELECT * FROM intake_submissions WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 5`);

  const stats = {
    totalProjects: get('SELECT COUNT(*) as c FROM projects WHERE archived_at IS NULL')?.c || 0,
    activeAssessments: get("SELECT COUNT(*) as c FROM assessments WHERE archived_at IS NULL AND status NOT IN ('completed','closed')")?.c || 0,
    pendingAudits: get("SELECT COUNT(*) as c FROM assessments WHERE archived_at IS NULL AND status = 'submitted'")?.c || 0,
    activeATOs: get("SELECT COUNT(*) as c FROM assessments WHERE archived_at IS NULL AND ato_type = 'ato' AND result = 'ato'")?.c || 0,
    activeIATOs: get("SELECT COUNT(*) as c FROM assessments WHERE archived_at IS NULL AND ato_type = 'iato' AND result = 'iato'")?.c || 0,
    pendingIntakes: get("SELECT COUNT(*) as c FROM intake_submissions WHERE archived_at IS NULL AND status IN ('pending','in-review')")?.c || 0,
    pendingSelfAssessments: (get("SELECT COUNT(*) as c FROM self_assessments WHERE status = 'submitted'")?.c || 0) +
      (get("SELECT COUNT(*) as c FROM sa_access_requests WHERE status = 'pending'")?.c || 0)
  };
  const pendingInviteCount = get("SELECT COUNT(*) as c FROM invitations WHERE invited_by = ? AND status = 'pending'", [req.user.id])?.c || 0;

  // Practitioners (invited members/collaborators) get a slimmed, scoped dashboard.
  if (!access.isAdmin(req.user)) {
    const myAssessments = all(`
      SELECT a.*, p.name AS project_name, p.project_owner_name, p.project_authority_name
      FROM assessments a JOIN projects p ON p.id = a.project_id
      WHERE a.assigned_to_user_id = ? AND a.archived_at IS NULL
      ORDER BY a.updated_at DESC`, [req.user.id]);
    const myIntakes = all(`
      SELECT * FROM intake_submissions
      WHERE assigned_to_user_id = ? AND archived_at IS NULL
      ORDER BY created_at DESC`, [req.user.id]);
    // Project hierarchy for the systems they're involved in.
    const projectIds = [...new Set([...myAssessments.map(a => a.project_id), ...myIntakes.map(i => i.project_id)].filter(Boolean))];
    const myProjects = projectIds.length
      ? all(`SELECT id, name, project_owner_name, project_owner_email, project_authority_name, security_framework
             FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`, projectIds)
      : [];
    const atoRecords = projectIds.length
      ? all(`SELECT * FROM ato_records WHERE project_id IN (${projectIds.map(() => '?').join(',')}) ORDER BY updated_at DESC`, projectIds)
      : [];
    return res.render('admin/dashboard-practitioner', {
      title: 'My Dashboard', isDashboard: true,
      admin: req.user, myAssessments, myIntakes, myProjects, atoRecords
    });
  }

  const dashOrg = billing.orgForUser(req.user);
  const tokenStatus = billing.tokenStatus(dashOrg);
  const aiProvider = dashOrg ? (orgSettings.getSettings(dashOrg.id)?.ai_provider || 'oob') : 'oob';
  res.render('admin/dashboard', {
    title: 'Dashboard',
    isAdmin: true, isDashboard: true,
    admin: req.user, projects, assessments, recentIntakes, stats, pendingInviteCount,
    tokenStatus, aiProvider, isRootAdmin: access.isRootAdmin(req.user)
  });
});

// ── PROJECTS ──
router.get('/projects', ensureAuthenticated, (req, res) => {
  const showArchived = req.query.archived === '1';
  const projects = showArchived
    ? all('SELECT * FROM projects WHERE archived_at IS NOT NULL ORDER BY archived_at DESC')
    : all('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC');
  const archivedCount = get('SELECT COUNT(*) as c FROM projects WHERE archived_at IS NOT NULL')?.c || 0;
  res.render('admin/projects', {
    title: 'Projects', isAdmin: true, isProjects: true,
    admin: req.user, projects, showArchived, archivedCount
  });
});

router.get('/security-controls', ensureAuthenticated, (req, res) => {
  const { where, params, filters } = catalogFilterParts(req.query);
  const controls = all(`SELECT * FROM security_control_catalog ${where} ORDER BY framework, family, control_id`, params);
  const frameworks = all('SELECT DISTINCT framework FROM security_control_catalog ORDER BY framework');
  const families = all('SELECT DISTINCT family, category FROM security_control_catalog ORDER BY family');
  const categories = all('SELECT DISTINCT category FROM security_control_catalog WHERE category IS NOT NULL AND category != \'\' ORDER BY category');
  const statuses = all('SELECT DISTINCT status FROM security_control_catalog WHERE status IS NOT NULL AND status != \'\' ORDER BY status');
  res.render('admin/security-controls', {
    title: 'Security Control Catalog',
    isAdmin: true,
    isControls: true,
    admin: req.user,
    controls,
    frameworks,
    families,
    categories,
    statuses,
    filters
  });
});

router.get('/security-controls.csv', ensureAuthenticated, (req, res) => {
  const { where, params } = catalogFilterParts(req.query);
  const controls = all(`SELECT * FROM security_control_catalog ${where} ORDER BY framework, family, control_id`, params);
  const rows = [[
    'Framework', 'Control ID', 'Control Title', 'Family', 'Description', 'Guidance',
    'Definitions', 'Related Controls', 'Baseline', 'Category', 'Applicability Notes', 'Status', 'Last Updated'
  ]];
  controls.forEach(c => rows.push([
    c.framework, c.control_id, c.title, c.family, c.description, c.guidance,
    c.definitions, c.related_controls, c.baseline, c.category, c.applicability_notes, c.status, c.updated_at
  ]));
  sendCsv(res, 'security-control-catalog.csv', rows);
});

router.get('/help', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'docs', 'client-assessor-guide.html'));
});

router.get('/assets/guide/:file', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'docs', 'assets', 'guide', path.basename(req.params.file)));
});

router.get('/projects/new', ensureAuthenticated, (req, res) => {
  res.render('admin/project-new', {
    title: 'New Project', isAdmin: true, isProjects: true,
    admin: req.user,
    technologies: COMMON_TECHNOLOGIES,
    users: getAssignableUsers(),
    frameworkOptions: getAvailableFrameworkOptions(),
    frameworkOptionsJSON: JSON.stringify(getAvailableFrameworkOptions())
  });
});

router.post('/projects/new', ensureAuthenticated, intakeUpload.fields([{ name: 'attachments', maxCount: 10 }, { name: 'reference_document', maxCount: 1 }]), (req, res) => {
  try {
    const { name, description, data_classification, hosting_type, app_type, has_pii,
      technologies, specifications, project_owner_name, project_owner_email,
      project_authority_name, project_authority_email, cio_name, cio_email,
      department, branch, confidentiality_level, integrity_level, availability_level,
      security_profile, is_hva } = req.body;

    const techArray = asArray(technologies);
    const piiTypes = asArray(req.body.piiTypes);
    const hasPII = has_pii || (piiTypes.length > 0 && !piiTypes.includes('none')) ? 1 : 0;
    const frameworkFields = getFrameworkFields(req.body);
    const confLevel = confidentiality_level || data_classification || 'protected-b';
    const intLevel = integrity_level || 'medium';
    const avaLevel = availability_level || 'medium';
    const profile = isItsgFramework(frameworkFields.securityFramework)
      ? (security_profile || getSecurityProfileFromBody(req.body, hasPII))
      : (frameworkFields.frameworkBaseline || security_profile || 'custom');
    const existingProject = findProjectForIntake(req.body);
    let projectId;

    // Enforce per-plan project limits for orgs that have one (legacy/no-org users are unlimited).
    const userOrg = billing.orgForUser(req.user);
    if (!existingProject && userOrg) {
      const gate = billing.canAddProject(userOrg);
      if (!gate.ok) {
        req.flash('error', gate.reason + ' Manage your plan under billing.');
        return res.redirect('/admin/projects/new');
      }
    }

    if (existingProject) {
      projectId = existingProject.id;
      run(`UPDATE projects SET
        name = ?, description = ?, data_classification = ?,
        confidentiality_level = ?, integrity_level = ?, availability_level = ?, security_profile = ?,
        security_framework = ?, framework_baseline = ?, framework_category = ?, framework_applicability = ?, is_hva = ?,
        hosting_type = ?, app_type = ?, has_pii = ?, technologies = ?, specifications = ?,
        project_owner_name = ?, project_owner_email = ?, project_authority_name = ?, project_authority_email = ?,
        cio_name = ?, cio_email = ?, department = ?, branch = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [name, description || '', data_classification || confLevel || 'protected-b',
          confLevel, intLevel, avaLevel, profile, frameworkFields.securityFramework, frameworkFields.frameworkBaseline,
          frameworkFields.frameworkCategory, frameworkFields.frameworkApplicability, is_hva ? 1 : 0,
          hosting_type || '', app_type || '', hasPII, JSON.stringify(techArray), specifications || '',
          project_owner_name || '', normalizeEmail(project_owner_email), project_authority_name || '', normalizeEmail(project_authority_email),
          cio_name || '', normalizeEmail(cio_email), department || '', branch || '', projectId]);
    } else {
      const slug = makeSlug(name);
      projectId = run(`INSERT INTO projects (name, slug, description, data_classification,
        confidentiality_level, integrity_level, availability_level, security_profile,
        security_framework, framework_baseline, framework_category, framework_applicability, is_hva,
        hosting_type, app_type, has_pii, technologies, specifications, project_owner_name, project_owner_email,
        project_authority_name, project_authority_email, cio_name, cio_email, department, branch, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [name, slug, description || '', data_classification || confLevel || 'protected-b',
          confLevel, intLevel, avaLevel, profile, frameworkFields.securityFramework, frameworkFields.frameworkBaseline,
          frameworkFields.frameworkCategory, frameworkFields.frameworkApplicability, is_hva ? 1 : 0,
          hosting_type || '', app_type || '', hasPII, JSON.stringify(techArray), specifications || '',
          project_owner_name || '', normalizeEmail(project_owner_email), project_authority_name || '', normalizeEmail(project_authority_email),
          cio_name || '', normalizeEmail(cio_email), department || '', branch || '', req.user.id]);
      if (userOrg) run('UPDATE projects SET organization_id = ? WHERE id = ?', [userOrg.id, projectId]);
    }

    // req.files is now an object: { attachments: [...], reference_document: [...] }.
    // The AI reference document (used to pre-fill the project) is captured here so
    // it is saved as a project document — recorded LAST so it sorts first in the list.
    const attachmentFiles = (req.files && req.files.attachments) || [];
    const referenceFiles = (req.files && req.files.reference_document) || [];
    const intakeId = createProjectIntake({
      projectId,
      body: req.body,
      createdBy: req.user.id,
      files: [...attachmentFiles, ...referenceFiles],
      status: 'in-review'
    });
    recordProjectDocuments({ projectId, intakeId, files: [...attachmentFiles, ...referenceFiles], user: req.user });

    const assignmentMode = req.body.assignment_mode;
    if (assignmentMode === 'existing' || assignmentMode === 'invite') {
      const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [intakeId]);
      assignEntityFromRequest({
        req,
        entityType: 'intake',
        entityId: intakeId,
        entityName: intake?.project_name || name
      });
    }

    req.flash('success', `${existingProject ? 'Project updated' : 'Project created'} and associated intake ${get('SELECT ref_code FROM intake_submissions WHERE id = ?', [intakeId])?.ref_code || ''} created successfully`);
    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/projects/new');
  }
});

router.get('/projects/:id', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  const assessments = all(`
    SELECT a.*, i.ref_code AS intake_ref_code
    FROM assessments a
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
  `, [project.id]);
  const intakes = all('SELECT * FROM intake_submissions WHERE project_id = ? ORDER BY created_at DESC', [project.id]);
  const intakeAssignments = getEntityAssignments('intake', intakes.map(i => i.id));
  const assessmentAssignments = getEntityAssignments('assessment', assessments.map(a => a.id));
  const documents = getProjectDocuments(project.id).map(d => ({ ...d, display_size: formatBytes(d.size) }));
  const branding = getProjectBranding(project.id);
  const atoRecords = all('SELECT * FROM ato_records WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC', [project.id]);
  const projectPoamItems = all(`
    SELECT ic.*, ac.title AS control_title
    FROM iato_checklist ic
    LEFT JOIN assessment_controls ac ON ac.assessment_id = ic.assessment_id AND ac.control_id = ic.control_id
    WHERE ic.project_id = ? OR ic.assessment_id IN (SELECT id FROM assessments WHERE project_id = ?)
    ORDER BY CASE ic.risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, ic.deadline
  `, [project.id, project.id]);
  let techs = [];
  try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}

  // Assessments that would be permanently lost on delete (anything not in draft).
  const nonDraftAssessments = assessments.filter(a => a.status !== 'draft');

  res.render('admin/project-detail', {
    title: project.name, isAdmin: true, isProjects: true,
    admin: req.user, project, assessments, intakes,
    intakeAssignments, assessmentAssignments, documents, branding, atoRecords, projectPoamItems,
    nonDraftAssessments,
    hasNonDraftAssessments: nonDraftAssessments.length > 0,
    isArchived: !!project.archived_at,
    users: getAssignableUsers(),
    techNames: techs.map(t => COMMON_TECHNOLOGIES[t]?.name || t)
  });
});

router.post('/projects/:id/documents', ensureAuthenticated, projectUpload.array('documents', 10), (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    recordProjectDocuments({ projectId: project.id, files: req.files || [], user: req.user });
    req.flash('success', `Uploaded ${(req.files || []).length} document(s) to ${project.name}.`);
    res.redirect(`/admin/projects/${project.id}#documentation`);
  } catch (err) {
    console.error('Project document upload error:', err);
    req.flash('error', 'Failed to upload documents: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.get('/projects/:id/documents/:docId/download', ensureAuthenticated, (req, res) => {
  const document = get('SELECT * FROM project_documents WHERE id = ? AND project_id = ? AND status != \'deleted\'', [req.params.docId, req.params.id]);
  if (!document) { req.flash('error', 'Document not found'); return res.redirect(`/admin/projects/${req.params.id}`); }
  const filePath = resolveProjectDocumentPath(document);
  if (!filePath) { req.flash('error', 'Document file is missing from storage.'); return res.redirect(`/admin/projects/${req.params.id}`); }
  res.download(filePath, document.original_name);
});

router.post('/projects/:id/documents/:docId/delete', ensureAuthenticated, (req, res) => {
  const document = get('SELECT * FROM project_documents WHERE id = ? AND project_id = ?', [req.params.docId, req.params.id]);
  if (!document) { req.flash('error', 'Document not found'); return res.redirect(`/admin/projects/${req.params.id}`); }
  run(`UPDATE project_documents SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`,
    [req.params.docId, req.params.id]);
  req.flash('success', 'Document reference removed.');
  res.redirect(`/admin/projects/${req.params.id}#documentation`);
});

router.post('/projects/:id/branding', ensureAuthenticated, brandingUpload.single('logo'), (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const existing = getProjectBranding(project.id);
    const logoFilename = req.file?.filename || existing.logo_filename || '';
    const logoOriginalName = req.file?.originalname || existing.logo_original_name || '';
    const logoMimeType = req.file?.mimetype || existing.logo_mime_type || '';

    if (existing.id) {
      run(`UPDATE report_branding SET organization_name = ?, logo_filename = ?, logo_original_name = ?,
        logo_mime_type = ?, report_subtitle = ?, classification_label = ?, assessor_company_name = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.body.organization_name || '', logoFilename, logoOriginalName, logoMimeType,
          req.body.report_subtitle || '', req.body.classification_label || '', req.body.assessor_company_name || '',
          existing.id]);
    } else {
      run(`INSERT INTO report_branding
        (scope_type, project_id, organization_name, logo_filename, logo_original_name, logo_mime_type,
          report_subtitle, classification_label, assessor_company_name, created_by)
        VALUES ('project', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [project.id, req.body.organization_name || '', logoFilename, logoOriginalName, logoMimeType,
          req.body.report_subtitle || '', req.body.classification_label || '', req.body.assessor_company_name || '', req.user.id]);
    }

    req.flash('success', 'Report branding saved.');
    res.redirect(`/admin/projects/${project.id}#reporting`);
  } catch (err) {
    console.error('Branding save error:', err);
    req.flash('error', 'Failed to save branding: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.get('/projects/:id/controls.csv', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
  const rows = [[
    'Control ID', 'Control Title', 'Control Family', 'Framework', 'Description', 'Guidance',
    'Evidence Guidance', 'Evidence Collected', 'Assessor Notes', 'Assessment Status',
    'Applicability', 'Risk Level', 'POA&M Reference', 'Last Updated'
  ]];
  const controls = all(`
    SELECT ac.*, a.status AS assessment_status
    FROM assessment_controls ac
    JOIN assessments a ON a.id = ac.assessment_id
    WHERE a.project_id = ?
    ORDER BY ac.family, ac.control_id
  `, [project.id]);
  controls.forEach(control => {
    const poam = get(`
      SELECT id FROM iato_checklist
      WHERE (assessment_id = ? OR project_id = ?) AND control_id = ?
      ORDER BY id LIMIT 1
    `, [control.assessment_id, project.id, control.control_id]);
    rows.push([
      control.control_id, control.title, control.family_name || control.family, control.framework || 'ITSG-33',
      control.description, control.control_guidance || '', control.evidence_guidance || '',
      control.evidence_text || control.evidence_html || '', control.assessor_notes || control.audit_comments || '',
      control.audit_result || control.evidence_status || control.assessment_status || '',
      control.is_applicable ? 'Applicable' : 'Not Applicable', control.risk_level || '',
      poam ? `POAM-${poam.id}` : '', control.updated_at || ''
    ]);
  });
  sendCsv(res, `${projectSlugName(project.name)}-controls.csv`, rows);
});

router.get('/projects/:id/controls.pdf', ensureAuthenticated, async (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const controls = all(`
      SELECT ac.*, a.status AS assessment_status, a.invite_code
      FROM assessment_controls ac
      JOIN assessments a ON a.id = ac.assessment_id
      WHERE a.project_id = ?
      ORDER BY ac.family, ac.control_id
    `, [project.id]);
    const branding = getProjectBranding(project.id);
    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `project-controls-${project.id}-${Date.now()}.pdf`);
    await pdfExport.generateControlsReport(project, controls, outputPath, { branding, logoDir: brandingUploadDir });
    res.download(outputPath);
  } catch (err) {
    console.error('Control PDF export error:', err);
    req.flash('error', 'Failed to export controls PDF: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.get('/projects/:id/report.pdf', ensureAuthenticated, async (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const assessments = all('SELECT * FROM assessments WHERE project_id = ? ORDER BY created_at DESC', [project.id]);
    const controls = all(`
      SELECT ac.*, a.status AS assessment_status
      FROM assessment_controls ac JOIN assessments a ON a.id = ac.assessment_id
      WHERE a.project_id = ? ORDER BY ac.family, ac.control_id
    `, [project.id]);
    const documents = getProjectDocuments(project.id);
    const poamItems = all(`SELECT * FROM iato_checklist WHERE project_id = ? OR assessment_id IN (SELECT id FROM assessments WHERE project_id = ?)`, [project.id, project.id]);
    const atoRecords = all('SELECT * FROM ato_records WHERE project_id = ? ORDER BY updated_at DESC', [project.id]);
    const branding = getProjectBranding(project.id);
    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `project-report-${project.id}-${Date.now()}.pdf`);
    await pdfExport.generateFullProjectReport(project, { assessments, controls, documents, poamItems, atoRecords, branding, logoDir: brandingUploadDir }, outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error('Project report export error:', err);
    req.flash('error', 'Failed to export project report: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.get('/projects/:projectId/ato/new', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
  const assessments = all('SELECT * FROM assessments WHERE project_id = ? ORDER BY created_at DESC', [project.id]);
  const branding = getProjectBranding(project.id);
  const controlOptions = getProjectControlOptions(project.id, req.query.assessment_id || null);
  res.render('admin/ato-edit', {
    title: 'New ATO/iATO',
    isAdmin: true,
    isProjects: true,
    admin: req.user,
    project,
    assessments,
    controlOptions,
    poamItems: [],
    branding,
    ato: {
      record_type: req.query.type === 'iato' ? 'iato' : 'ato',
      title: req.query.type === 'iato' ? `Interim Authority to Operate - ${project.name}` : `Authority to Operate - ${project.name}`,
      system_name: project.name,
      organization_name: branding.organization_name || project.department || '',
      assessor: req.user.name,
      authorization_status: 'draft',
      system_description: project.description || ''
    }
  });
});

router.post('/projects/:projectId/ato/new', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const atoId = run(`INSERT INTO ato_records
      (project_id, assessment_id, record_type, title, system_name, organization_name, authorizing_official,
        assessor, authorization_status, authorization_date, expiry_date, executive_summary, system_description,
        assessment_scope, risk_summary, residual_risk_statement, conditions_of_authorization,
        security_control_summary, poam_summary, assessor_notes, static_sections, custom_sections, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id, req.body.assessment_id || null, req.body.record_type || 'ato', req.body.title || '',
        req.body.system_name || project.name, req.body.organization_name || '', req.body.authorizing_official || '',
        req.body.assessor || req.user.name, req.body.authorization_status || 'draft', req.body.authorization_date || '',
        req.body.expiry_date || '', req.body.executive_summary || '', req.body.system_description || '',
        req.body.assessment_scope || '', req.body.risk_summary || '', req.body.residual_risk_statement || '',
        req.body.conditions_of_authorization || '', req.body.security_control_summary || '',
        req.body.poam_summary || '', req.body.assessor_notes || '', req.body.static_sections || '',
        req.body.custom_sections || '', req.user.id
      ]);
    req.flash('success', 'ATO/iATO record created.');
    res.redirect(`/admin/ato/${atoId}`);
  } catch (err) {
    console.error('ATO create error:', err);
    req.flash('error', 'Failed to create ATO/iATO: ' + err.message);
    res.redirect(`/admin/projects/${req.params.projectId}`);
  }
});

router.get('/ato/:id', ensureAuthenticated, (req, res) => {
  const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
  if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
  const project = get('SELECT * FROM projects WHERE id = ?', [ato.project_id]);
  const assessments = all('SELECT * FROM assessments WHERE project_id = ? ORDER BY created_at DESC', [ato.project_id]);
  const poamItems = getAtoPoamItems(ato);
  const controlOptions = getProjectControlOptions(ato.project_id, ato.assessment_id);
  const branding = getProjectBranding(ato.project_id);
  res.render('admin/ato-edit', {
    title: ato.title || 'ATO/iATO',
    isAdmin: true,
    isProjects: true,
    admin: req.user,
    ato,
    project,
    assessments,
    controlOptions,
    poamItems,
    branding
  });
});

router.post('/ato/:id', ensureAuthenticated, (req, res) => {
  try {
    const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
    if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
    run(`UPDATE ato_records SET
      assessment_id = ?, record_type = ?, title = ?, system_name = ?, organization_name = ?,
      authorizing_official = ?, assessor = ?, authorization_status = ?, authorization_date = ?,
      expiry_date = ?, executive_summary = ?, system_description = ?, assessment_scope = ?,
      risk_summary = ?, residual_risk_statement = ?, conditions_of_authorization = ?,
      security_control_summary = ?, poam_summary = ?, assessor_notes = ?, static_sections = ?,
      custom_sections = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        req.body.assessment_id || null, req.body.record_type || 'ato', req.body.title || '',
        req.body.system_name || '', req.body.organization_name || '', req.body.authorizing_official || '',
        req.body.assessor || '', req.body.authorization_status || 'draft', req.body.authorization_date || '',
        req.body.expiry_date || '', req.body.executive_summary || '', req.body.system_description || '',
        req.body.assessment_scope || '', req.body.risk_summary || '', req.body.residual_risk_statement || '',
        req.body.conditions_of_authorization || '', req.body.security_control_summary || '',
        req.body.poam_summary || '', req.body.assessor_notes || '', req.body.static_sections || '',
        req.body.custom_sections || '', ato.id
      ]);
    req.flash('success', 'ATO/iATO record saved.');
    res.redirect(`/admin/ato/${ato.id}`);
  } catch (err) {
    console.error('ATO update error:', err);
    req.flash('error', 'Failed to save ATO/iATO: ' + err.message);
    res.redirect(`/admin/ato/${req.params.id}`);
  }
});

router.post('/ato/:id/poam/add', ensureAuthenticated, (req, res) => {
  try {
    const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
    if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
    const assessmentId = req.body.assessment_id || ato.assessment_id || null;
    run(`INSERT INTO iato_checklist (project_id, assessment_id, ato_record_id, control_id, description, risk_level,
      original_finding, remediation_plan, milestone, deadline, status, assigned_to, residual_risk, assessor_notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ato.project_id,
        assessmentId,
        ato.id,
        req.body.control_id || '',
        req.body.description || 'Risk remediation item',
        req.body.risk_level || 'medium',
        req.body.original_finding || '',
        req.body.remediation_plan || '',
        req.body.milestone || '',
        req.body.deadline || '',
        req.body.status || 'open',
        req.body.assigned_to || '',
        req.body.residual_risk || '',
        req.body.assessor_notes || '',
        req.user.id
      ]);
    req.flash('success', 'Risk remediation item added.');
    res.redirect(`/admin/ato/${ato.id}#poam-section`);
  } catch (err) {
    console.error('ATO POA&M add error:', err);
    req.flash('error', 'Failed to add risk remediation item: ' + err.message);
    res.redirect(`/admin/ato/${req.params.id}`);
  }
});

router.post('/ato/:id/poam/:itemId/update', ensureAuthenticated, (req, res) => {
  try {
    const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
    if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
    const item = get('SELECT * FROM iato_checklist WHERE id = ? AND ato_record_id = ?', [req.params.itemId, ato.id]);
    if (!item) { req.flash('error', 'Risk remediation item not found for this ATO/iATO.'); return res.redirect(`/admin/ato/${ato.id}#poam-section`); }

    run(`UPDATE iato_checklist SET
        assessment_id = ?, control_id = ?, description = ?, risk_level = ?, original_finding = ?,
        remediation_plan = ?, milestone = ?, deadline = ?, status = ?, assigned_to = ?,
        residual_risk = ?, assessor_notes = ?,
        completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
        verified_at = CASE WHEN ? = 'verified' THEN COALESCE(verified_at, CURRENT_TIMESTAMP) ELSE verified_at END,
        verified_by = CASE WHEN ? = 'verified' THEN ? ELSE verified_by END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ato_record_id = ?`,
      [
        req.body.assessment_id || ato.assessment_id || null,
        req.body.control_id || '',
        req.body.description || '',
        req.body.risk_level || 'medium',
        req.body.original_finding || '',
        req.body.remediation_plan || '',
        req.body.milestone || '',
        req.body.deadline || '',
        req.body.status || 'open',
        req.body.assigned_to || '',
        req.body.residual_risk || '',
        req.body.assessor_notes || '',
        req.body.status || 'open',
        req.body.status || 'open',
        req.body.status || 'open',
        req.user.id,
        req.params.itemId,
        ato.id
      ]);
    req.flash('success', 'Risk remediation item updated.');
    res.redirect(`/admin/ato/${ato.id}#poam-section`);
  } catch (err) {
    console.error('ATO POA&M update error:', err);
    req.flash('error', 'Failed to update risk remediation item: ' + err.message);
    res.redirect(`/admin/ato/${req.params.id}#poam-section`);
  }
});

router.post('/ato/:id/poam/:itemId/delete', ensureAuthenticated, (req, res) => {
  const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
  if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
  run('DELETE FROM iato_checklist WHERE id = ? AND ato_record_id = ?', [req.params.itemId, ato.id]);
  req.flash('success', 'Risk remediation item removed.');
  res.redirect(`/admin/ato/${ato.id}#poam-section`);
});

router.get('/ato/:id/export-pdf', ensureAuthenticated, async (req, res) => {
  try {
    const ato = get('SELECT * FROM ato_records WHERE id = ?', [req.params.id]);
    if (!ato) { req.flash('error', 'ATO/iATO record not found'); return res.redirect('/admin/projects'); }
    const project = get('SELECT * FROM projects WHERE id = ?', [ato.project_id]);
    const assessment = ato.assessment_id ? get('SELECT * FROM assessments WHERE id = ?', [ato.assessment_id]) : null;
    const controls = assessment
      ? all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id])
      : all(`SELECT ac.* FROM assessment_controls ac JOIN assessments a ON a.id = ac.assessment_id WHERE a.project_id = ? ORDER BY ac.family, ac.control_id`, [project.id]);
    const poamItems = getAtoPoamItems(ato);
    const branding = getProjectBranding(project.id);
    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `ato-record-${ato.id}-${Date.now()}.pdf`);
    await pdfExport.generateATORecordReport(ato, project, { assessment, controls, poamItems, branding, logoDir: brandingUploadDir }, outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error('ATO record export error:', err);
    req.flash('error', 'Failed to export ATO/iATO PDF: ' + err.message);
    res.redirect(`/admin/ato/${req.params.id}`);
  }
});

router.post('/projects/:id/intake/create', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

    const existing = getPrimaryIntakeForProject(project.id);
    if (existing) {
      req.flash('info', `This project already has intake ${existing.ref_code}.`);
      return res.redirect(`/admin/projects/${project.id}`);
    }

    const intakeId = ensureProjectIntake(project, req.user.id);
    const intake = get('SELECT ref_code FROM intake_submissions WHERE id = ?', [intakeId]);
    req.flash('success', `Created intake ${intake?.ref_code || ''} for this project.`);
    res.redirect(`/admin/projects/${project.id}`);
  } catch (err) {
    console.error('Create project intake error:', err);
    req.flash('error', 'Failed to create intake: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.post('/projects/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

    const target = req.body.assign_target || 'all';
    const targets = [];
    if (target === 'all' || target.startsWith('intake:')) {
      const intakeIds = target.startsWith('intake:')
        ? [parseInt(target.split(':')[1])]
        : all('SELECT id FROM intake_submissions WHERE project_id = ?', [project.id]).map(i => i.id);
      intakeIds.forEach(id => targets.push({ entityType: 'intake', entityId: id }));
    }
    if (target === 'all' || target.startsWith('assessment:')) {
      const assessmentIds = target.startsWith('assessment:')
        ? [parseInt(target.split(':')[1])]
        : all('SELECT id FROM assessments WHERE project_id = ?', [project.id]).map(a => a.id);
      assessmentIds.forEach(id => targets.push({ entityType: 'assessment', entityId: id }));
    }

    if (!targets.length) {
      req.flash('error', 'There is no intake or assessment to assign yet.');
      return res.redirect(`/admin/projects/${project.id}`);
    }

    let result;
    targets.forEach(t => {
      result = assignEntityFromRequest({
        req,
        entityType: t.entityType,
        entityId: t.entityId,
        entityName: project.name
      });
    });

    req.flash('success', `${target === 'all' ? 'Project intake and assessments' : 'Selected item'} assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/projects/${project.id}`);
  } catch (err) {
    console.error('Project assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/projects/${req.params.id}`);
  }
});

router.post('/projects/:id/ai/suggest-controls', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    let techs = [];
    try { techs = JSON.parse(project.technologies || '[]'); } catch(e) {}
    const documentIds = asArray(req.body.document_ids);
    const documents = documentIds.length
      ? all(`SELECT * FROM project_documents WHERE project_id = ? AND status != 'deleted' AND id IN (${documentIds.map(() => '?').join(',')})`, [project.id, ...documentIds])
      : getProjectDocuments(project.id);
    const controlSelection = getAssessmentControlsForProject(project, documents, false);
    const controls = controlSelection.controls;
    res.json({
      success: true,
      controlIds: controls.map(c => c.id),
      controls: controls.map(c => ({ id: c.id, title: c.title, family: c.family, reason: 'Matched project profile, technology, or documentation context.' }))
    });
  } catch (err) {
    console.error('Project AI control suggestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── ASSESSMENTS ──
router.get('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  // ── Assessment-time control-profile override ──
  // The assessor can retune integrity / availability (confidentiality stays the
  // formal baseline) to change the resolved profile and the recommended control
  // set for THIS assessment, without altering the project's intake record.
  const LEVELS = ['low', 'medium', 'high'];
  const q = req.query;
  const projItsg = isItsgFramework(normalizeFramework(project.security_framework));
  const baseConf = project.confidentiality_level || project.data_classification || 'protected-b';
  const ovConf = (q.confidentiality && CONFIDENTIALITY_LEVELS[q.confidentiality]) ? q.confidentiality : baseConf;
  const ovInt = (q.integrity && LEVELS.includes(q.integrity)) ? q.integrity : (project.integrity_level || 'medium');
  const ovAva = (q.availability && LEVELS.includes(q.availability)) ? q.availability : (project.availability_level || 'medium');
  const profileOverridden = !!(q.integrity || q.availability || q.confidentiality);
  let effectiveProfile = project.security_profile;
  let profileTailoringNotes = [];
  if (projItsg) {
    const det = determineProfile({
      confidentiality: ovConf, integrity: ovInt, availability: ovAva,
      hasPII: !!project.has_pii, isHVA: !!project.is_hva,
      hasComplexity: detectComplexity(project.description || '')
    });
    effectiveProfile = det.profile.id;
    profileTailoringNotes = det.tailoringNotes || [];
  }
  const effectiveProject = {
    ...project,
    confidentiality_level: ovConf,
    integrity_level: ovInt,
    availability_level: ovAva,
    security_profile: effectiveProfile
  };

  const intake = getPrimaryIntakeForProject(project.id);
  const documents = getProjectDocuments(project.id);
  const selection = getAssessmentControlsForProject(effectiveProject, documents, req.query.all === '1');
  const saaCheck = selection.saaCheck;
  if (!saaCheck.requiresSAA && !req.query.force) {
    // Redirect to guidance report instead
    return res.redirect(`/admin/projects/${project.id}/guidance`);
  }

  const baselineControls = selection.baselineControls;
  const controls = selection.controls;
  const families = selection.families;

  // Check for reusable templates
  const templates = all(`SELECT DISTINCT control_id, tailored_description, evidence_guidance, example_evidence 
    FROM control_templates WHERE hosting_type = ? ORDER BY usage_count DESC`, [project.hosting_type]);
  const templateMap = {};
  templates.forEach(t => { templateMap[t.control_id] = t; });

  // Apply templates where available
  families.forEach(fam => {
    fam.controls.forEach(ctrl => {
      if (templateMap[ctrl.id]) {
        ctrl.tailoredDescription = templateMap[ctrl.id].tailored_description || ctrl.tailoredDescription;
        ctrl.evidenceGuidance = templateMap[ctrl.id].evidence_guidance || ctrl.evidenceGuidance;
        ctrl.hasTemplate = true;
      }
    });
  });

  res.render('admin/assessment-new', {
    title: 'New Assessment', isAdmin: true, isProjects: true,
    admin: req.user, project, intake, families, controlCount: controls.length,
    baselineCount: baselineControls.length,
    usingTailoredRecommendation: req.query.all !== '1',
    documents,
    saaReason: saaCheck.reason,
    framework: frameworkMetadata(selection.framework),
    frameworkSummary: buildFrameworkSummary(effectiveProject),
    isItsgFramework: isItsgFramework(selection.framework),
    // Control-profile override UI + values to persist on the assessment
    profile: {
      confidentiality: ovConf,
      integrity: ovInt,
      availability: ovAva,
      id: effectiveProfile,
      overridden: profileOverridden,
      isBaseline: !profileOverridden,
      tailoringNotes: profileTailoringNotes
    },
    levelOptions: LEVELS,
    allParam: req.query.all === '1',
    showProfileCard: projItsg
  });
});

router.post('/projects/:projectId/assessments/new', ensureAuthenticated, (req, res) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }
    const intakeId = ensureProjectIntake(project, req.user.id);

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const frameworkFields = getFrameworkFields(project);
    // Control-profile the assessor confirmed on the New Assessment screen (may
    // retune integrity/availability vs. the project's intake categorization).
    const aProfile = req.body.security_profile || project.security_profile || null;
    const aConf = req.body.confidentiality_level || project.confidentiality_level || project.data_classification || null;
    const aInt = req.body.integrity_level || project.integrity_level || null;
    const aAva = req.body.availability_level || project.availability_level || null;
    const assessmentId = run(`INSERT INTO assessments
      (project_id, intake_id, type, status, invite_code, security_framework, framework_baseline, framework_category, framework_applicability,
       security_profile, confidentiality_level, integrity_level, availability_level, created_by)
      VALUES (?, ?, 'initial', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project.id, intakeId, inviteCode, frameworkFields.securityFramework, frameworkFields.frameworkBaseline,
        frameworkFields.frameworkCategory, frameworkFields.frameworkApplicability,
        aProfile, aConf, aInt, aAva, req.user.id]);
    copyIntakeAssignmentsToAssessment(intakeId, assessmentId, req.user.id);

    console.log('[Assessment] Created assessment ID:', assessmentId, 'invite:', inviteCode);

    // Insert controls via batch (avoids last_insert_rowid issues)
    const controlIds = req.body.control_ids || [];
    const tailored = req.body.tailored || {};
    const guidance = req.body.guidance || {};
    const inherited = req.body.inherited || {};
    const inheritedFrom = req.body.inherited_from || {};
    const applicable = req.body.applicable || {};

    const controlList = Array.isArray(controlIds) ? controlIds : [controlIds];
    const statements = controlList.map(cid => {
      const family = req.body[`family_${cid}`] || cid.split('-')[0];
      const framework = req.body[`framework_${cid}`] || frameworkFields.securityFramework || 'ITSG-33';
      const familyName = req.body[`family_name_${cid}`] || CONTROL_FAMILIES[family] || family;
      const priority = req.body[`priority_${cid}`] || 'P1';
      return {
        sql: `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, 
          description, control_guidance, tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority, risk_level, framework, guidance_source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [assessmentId, cid, family, familyName,
          req.body[`title_${cid}`] || cid,
          req.body[`desc_${cid}`] || '',
          req.body[`control_guidance_${cid}`] || '',
          tailored[cid] || req.body[`tailored_${cid}`] || '',
          guidance[cid] || req.body[`guidance_${cid}`] || '',
          inherited[cid] ? 1 : 0,
          inheritedFrom[cid] || '',
          applicable[cid] !== '0' ? 1 : 0,
          priority,
          req.body[`risk_${cid}`] || computeRiskLevel({ family, priority }),
          framework,
          guidance[cid] || req.body[`guidance_${cid}`] ? 'manual' : 'catalog'
        ]
      };
    });

    if (statements.length > 0) {
      runBatch(statements);
      console.log('[Assessment] Inserted', statements.length, 'controls for assessment', assessmentId);
    }

    // Baseline version 1 — the starting point the assessor can always revert to.
    createAssessmentVersion(assessmentId, {
      label: 'Created', summary: `Baseline — ${statements.length} control(s)`, user: req.user
    });

    req.flash('success', `Assessment created with ${statements.length} controls. You can now review and send the invite.`);
    res.redirect(`/admin/assessments/${assessmentId}`);
  } catch (err) {
    console.error('Assessment creation error:', err);
    req.flash('error', 'Failed to create assessment: ' + err.message);
    res.redirect(`/admin/projects/${req.params.projectId}`);
  }
});

// ── Assessment versioning (audit history + revert) ────────────────────────────
// A "version" is a point-in-time snapshot of the assessment's tailored control set
// plus its profile fields. Snapshots are captured at meaningful commit points
// (creation, AI-applied changes, manual checkpoints) and on every revert, giving a
// full audit trail the assessor can roll back to. Reverting never destroys data:
// the current live state is snapshotted first, then the chosen version is restored
// into a brand-new active version.

// Fields we preserve/restore alongside the control set (not status/invite/signatures).
function pickAssessmentSnapshotFields(a) {
  return {
    security_framework: a.security_framework, framework_baseline: a.framework_baseline,
    framework_category: a.framework_category, framework_applicability: a.framework_applicability,
    security_profile: a.security_profile, confidentiality_level: a.confidentiality_level,
    integrity_level: a.integrity_level, availability_level: a.availability_level
  };
}

// Snapshot the current live state as the next version. Returns the new version number.
function createAssessmentVersion(assessmentId, { label = '', summary = '', user = null } = {}) {
  const a = get('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
  if (!a) return null;
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY id', [assessmentId]);
  const maxV = get('SELECT MAX(version) v FROM assessment_versions WHERE assessment_id = ?', [assessmentId]);
  const version = ((maxV && maxV.v) || 0) + 1;
  const snapshot = JSON.stringify({ assessment: pickAssessmentSnapshotFields(a), controls });
  run(`INSERT INTO assessment_versions (assessment_id, version, label, summary, created_by, created_by_name, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [assessmentId, version, label || ('Version ' + version), summary || '',
     (user && user.id) || null, (user && user.name) || '', snapshot]);
  run('UPDATE assessments SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [version, assessmentId]);
  return version;
}

// Replace an assessment's controls with the rows captured in a snapshot.
function restoreControlsFromSnapshot(assessmentId, controls) {
  run('DELETE FROM assessment_controls WHERE assessment_id = ?', [assessmentId]);
  (controls || []).forEach(c => {
    const row = Object.assign({}, c);
    delete row.id;
    row.assessment_id = assessmentId;
    const keys = Object.keys(row);
    run(`INSERT INTO assessment_controls (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      keys.map(k => row[k]));
  });
}

// Manual checkpoint — assessor saves a named version of the current state.
router.post('/assessments/:id/checkpoint', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const a = get('SELECT id FROM assessments WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const label = String(req.body.label || 'Checkpoint').trim().slice(0, 80) || 'Checkpoint';
    const version = createAssessmentVersion(a.id, { label, summary: 'Manual checkpoint', user: req.user });
    res.json({ success: true, version });
  } catch (err) {
    console.error('checkpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Revert to a prior version. Preserves the current state in history, restores the
// chosen snapshot, and records the restored state as a new active version.
router.post('/assessments/:id/revert/:version', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const a = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const target = get('SELECT * FROM assessment_versions WHERE assessment_id = ? AND version = ?',
      [a.id, req.params.version]);
    if (!target) return res.status(404).json({ error: 'Version not found' });
    let snap;
    try { snap = JSON.parse(target.snapshot_json || '{}'); }
    catch (e) { return res.status(500).json({ error: 'Snapshot is corrupted and cannot be restored' }); }

    // 1) Preserve the current live state so nothing is lost.
    createAssessmentVersion(a.id, {
      label: 'Superseded state', summary: `Auto-saved before reverting to version ${target.version}`, user: req.user
    });
    // 2) Restore the chosen version's controls and profile fields.
    restoreControlsFromSnapshot(a.id, snap.controls || []);
    const sa = snap.assessment || {};
    run(`UPDATE assessments SET security_profile = ?, confidentiality_level = ?, integrity_level = ?,
         availability_level = ?, framework_baseline = ?, framework_category = ?, framework_applicability = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sa.security_profile != null ? sa.security_profile : a.security_profile,
       sa.confidentiality_level != null ? sa.confidentiality_level : a.confidentiality_level,
       sa.integrity_level != null ? sa.integrity_level : a.integrity_level,
       sa.availability_level != null ? sa.availability_level : a.availability_level,
       sa.framework_baseline != null ? sa.framework_baseline : a.framework_baseline,
       sa.framework_category != null ? sa.framework_category : a.framework_category,
       sa.framework_applicability != null ? sa.framework_applicability : a.framework_applicability,
       a.id]);
    // 3) Record the restored state as the new active version.
    const newVersion = createAssessmentVersion(a.id, {
      label: `Reverted to version ${target.version}`,
      summary: `Restored from version ${target.version}` + (target.label ? ` (${target.label})` : ''),
      user: req.user
    });
    res.json({ success: true, version: newVersion, restoredFrom: target.version });
  } catch (err) {
    console.error('revert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Summary of what changed in a version (diffed against the previous version).
router.get('/assessments/:id/versions/:version/summary', ensureAuthenticated, (req, res) => {
  try {
    const a = get('SELECT id FROM assessments WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const cur = get('SELECT * FROM assessment_versions WHERE assessment_id = ? AND version = ?', [a.id, req.params.version]);
    if (!cur) return res.status(404).json({ error: 'Version not found' });
    const prev = get('SELECT * FROM assessment_versions WHERE assessment_id = ? AND version < ? ORDER BY version DESC LIMIT 1', [a.id, req.params.version]);
    const parse = (row) => { try { return JSON.parse((row && row.snapshot_json) || '{}'); } catch (e) { return {}; } };
    const curSnap = parse(cur);
    const prevSnap = prev ? parse(prev) : null;
    const curControls = Array.isArray(curSnap.controls) ? curSnap.controls : [];
    const byId = (arr) => { const m = {}; (arr || []).forEach(c => { m[c.control_id] = c; }); return m; };
    const curMap = byId(curControls);
    const prevMap = prevSnap ? byId(prevSnap.controls) : {};
    const added = [], removed = [], changed = [], profileChanges = [];
    if (prevSnap) {
      Object.keys(curMap).forEach(cid => { if (!(cid in prevMap)) added.push(cid); });
      Object.keys(prevMap).forEach(cid => { if (!(cid in curMap)) removed.push(cid); });
      Object.keys(curMap).forEach(cid => {
        if (cid in prevMap) {
          const cc = curMap[cid], pc = prevMap[cid];
          const fields = ['tailored_description', 'is_applicable', 'priority', 'evidence_status', 'audit_result'];
          const diffs = fields.filter(f => String(cc[f] == null ? '' : cc[f]) !== String(pc[f] == null ? '' : pc[f]));
          if (diffs.length) changed.push({ control_id: cid, fields: diffs });
        }
      });
      const pf = ['security_profile', 'confidentiality_level', 'integrity_level', 'availability_level', 'framework_baseline', 'framework_category', 'framework_applicability'];
      const ca = curSnap.assessment || {}, pa = prevSnap.assessment || {};
      pf.forEach(f => { if (String(ca[f] || '') !== String(pa[f] || '')) profileChanges.push({ field: f, from: pa[f] || '—', to: ca[f] || '—' }); });
    }
    res.json({
      success: true,
      version: cur.version, label: cur.label, summary: cur.summary,
      author: cur.created_by_name || 'System', created_at: cur.created_at,
      previousVersion: prev ? prev.version : null,
      isBaseline: !prev,
      controlCount: curControls.length,
      added: added.sort(), removed: removed.sort(),
      changed: changed.sort((x, y) => x.control_id.localeCompare(y.control_id)),
      profileChanges
    });
  } catch (err) {
    console.error('version summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Apply AI-proposed control changes to an existing assessment (Aegis SA Assistant, review mode).
router.post('/assessments/:id/apply-ai-actions', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const actions = Array.isArray(req.body.actions) ? req.body.actions : [];
    const framework = assessment.security_framework || 'ITSG-33';
    let applied = 0;
    actions.forEach(a => {
      const op = String(a.op || '').toLowerCase();
      (Array.isArray(a.controlIds) ? a.controlIds : []).forEach(rawId => {
        const cid = String(rawId || '').trim();
        if (!cid) return;
        if (op === 'remove') {
          run('DELETE FROM assessment_controls WHERE assessment_id = ? AND control_id = ?', [assessment.id, cid]);
          applied++;
        } else if (op === 'tailor') {
          if (a.tailoring) {
            run('UPDATE assessment_controls SET tailored_description = ?, updated_at = CURRENT_TIMESTAMP WHERE assessment_id = ? AND control_id = ?',
              [a.tailoring, assessment.id, cid]);
            applied++;
          }
        } else if (op === 'add') {
          const exists = get('SELECT id FROM assessment_controls WHERE assessment_id = ? AND control_id = ?', [assessment.id, cid]);
          if (!exists) {
            const cat = get('SELECT title, family, category FROM security_control_catalog WHERE framework = ? AND control_id = ?', [framework, cid]) || {};
            const family = cat.family || (cid.split(/[.\-(]/)[0]) || cid;
            const familyName = cat.category || CONTROL_FAMILIES[family] || family;
            run(`INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, description, is_applicable, priority, framework, guidance_source)
                 VALUES (?, ?, ?, ?, ?, ?, 1, 'P1', ?, 'ai')`,
              [assessment.id, cid, family, familyName, cat.title || cid, a.reason || '', framework]);
            applied++;
          }
        }
      });
    });
    run('UPDATE assessments SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [assessment.id]);
    if (applied > 0) {
      createAssessmentVersion(assessment.id, {
        label: 'AI-applied changes',
        summary: `${applied} change(s) applied via the Aegis SA Assistant`, user: req.user
      });
    }
    res.json({ success: true, applied });
  } catch (err) {
    console.error('apply-ai-actions error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/assessments', ensureAuthenticated, (req, res) => {
  const filter = req.query.filter;
  let where = 'a.archived_at IS NULL AND p.archived_at IS NULL';
  let heading = null, blurb = null;
  if (filter === 'audit') {
    where += " AND a.status IN ('submitted','audit')";
    heading = 'Pending Audits';
    blurb = 'Assessments that have been submitted and are awaiting (or undergoing) assessor audit.';
  } else if (filter === 'ato') {
    where += " AND a.result IN ('ato','iato')";
    heading = 'Active ATOs / iATOs';
    blurb = 'Assessments that have been granted an Authority to Operate (ATO) or interim ATO (iATO).';
  }
  const assessments = all(`
    SELECT a.*, p.name as project_name, i.ref_code as intake_ref_code
    FROM assessments a JOIN projects p ON a.project_id = p.id
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    WHERE ${where}
    ORDER BY a.updated_at DESC
  `);
  res.render('admin/assessments', {
    title: heading || 'Assessments', isAdmin: true, isAssessments: true,
    admin: req.user, assessments, heading, blurb, filter
  });
});

router.get('/assessments/:id', ensureAuthenticated, (req, res) => {
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.project_owner_name, p.project_owner_email,
      p.data_classification, p.hosting_type, p.app_type,
      p.description as project_description, p.technologies, p.confidentiality_level,
      p.integrity_level, p.availability_level, p.security_profile,
      p.security_framework as project_security_framework, p.framework_baseline as project_framework_baseline,
      p.framework_category as project_framework_category, p.framework_applicability as project_framework_applicability,
      i.ref_code as intake_ref_code, i.status as intake_status
    FROM assessments a
    JOIN projects p ON a.project_id = p.id
    LEFT JOIN intake_submissions i ON i.id = a.intake_id
    WHERE a.id = ?
  `, [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  let controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);

  // Read-only "view a past version" mode: ?version=N renders the same UI populated
  // from that version's snapshot instead of the live control set.
  let viewingVersion = null;
  if (req.query.version) {
    const vrow = get('SELECT * FROM assessment_versions WHERE assessment_id = ? AND version = ?', [assessment.id, req.query.version]);
    if (vrow) {
      try {
        const snap = JSON.parse(vrow.snapshot_json || '{}');
        if (Array.isArray(snap.controls)) {
          controls = snap.controls.slice().sort((a, b) =>
            (a.family || '').localeCompare(b.family || '') || (a.control_id || '').localeCompare(b.control_id || ''));
          viewingVersion = vrow.version;
        }
      } catch (e) { /* fall back to live controls */ }
    }
  }

  const families = {};
  controls.forEach(c => {
    if (!families[c.family]) families[c.family] = { code: c.family, name: c.family_name, controls: [] };
    families[c.family].controls.push(c);
  });

  const stats = {
    total: controls.length,
    applicable: controls.filter(c => c.is_applicable).length,
    inherited: controls.filter(c => c.is_inherited).length,
    evidenceProvided: controls.filter(c => c.evidence_status === 'provided').length,
    met: controls.filter(c => c.audit_result === 'met').length,
    partiallyMet: controls.filter(c => c.audit_result === 'partially-met').length,
    notMet: controls.filter(c => c.audit_result === 'not-met').length,
    pending: controls.filter(c => !c.audit_result || c.audit_result === 'pending').length,
    highRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'high').length,
    mediumRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'medium').length,
    lowRisk: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'low').length,
    highRiskNotMet: controls.filter(c => (c.risk_level || computeRiskLevel(c)) === 'high' && (c.audit_result === 'not-met' || c.audit_result === 'partially-met')).length
  };
  stats.score = stats.applicable > 0 ? Math.round((stats.met + stats.partiallyMet * 0.5) / stats.applicable * 100) : 0;

  // Compute risk level for controls that don't have one
  controls.forEach(c => { if (!c.risk_level) c.risk_level = computeRiskLevel(c); });

  const checklistItems = all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY CASE risk_level WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, deadline', [assessment.id]);
  const assignments = getEntityAssignments('assessment', [assessment.id]);
  const documents = getProjectDocuments(assessment.project_id).map(d => ({ ...d, display_size: formatBytes(d.size) }));
  const atoRecords = all('SELECT id, record_type, title, authorization_status FROM ato_records WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC', [assessment.project_id]);
  const poamStats = {
    total: checklistItems.length,
    open: checklistItems.filter(i => i.status === 'open').length,
    inProgress: checklistItems.filter(i => i.status === 'in-progress').length,
    completed: checklistItems.filter(i => i.status === 'completed').length,
    verified: checklistItems.filter(i => i.status === 'verified').length,
    overdue: checklistItems.filter(i => i.status !== 'completed' && i.status !== 'verified' && i.deadline && new Date(i.deadline) < new Date()).length,
    highCount: checklistItems.filter(i => i.risk_level === 'high').length,
    mediumCount: checklistItems.filter(i => i.risk_level === 'medium').length,
    lowCount: checklistItems.filter(i => i.risk_level === 'low').length
  };

  // Version history (audit trail). Assessments created before this feature have no
  // snapshots yet — lazily capture the current state as a baseline so it's revertable.
  let versions = all('SELECT id, version, label, summary, created_by_name, created_at FROM assessment_versions WHERE assessment_id = ? ORDER BY version DESC', [assessment.id]);
  if (versions.length === 0 && !viewingVersion) {
    createAssessmentVersion(assessment.id, { label: 'Baseline', summary: 'Current state captured', user: req.user });
    assessment.version = 1;
    versions = all('SELECT id, version, label, summary, created_by_name, created_at FROM assessment_versions WHERE assessment_id = ? ORDER BY version DESC', [assessment.id]);
  }

  res.render('admin/assessment-detail', {
    title: viewingVersion ? `Assessment v${viewingVersion}: ${assessment.project_name}` : `Assessment: ${assessment.project_name}`,
    isAdmin: true, isAssessments: true,
    admin: req.user, assessment, assignments, users: getAssignableUsers(), versions, viewingVersion,
    families: Object.values(families), controls, stats, checklistItems, poamStats, documents, atoRecords,
    tailorMode: req.query.tailor === '1' && !viewingVersion,
    projectContextJSON: JSON.stringify({
      name: assessment.project_name,
      description: assessment.project_description || '',
      technologies: assessment.technologies || '',
      hosting_type: assessment.hosting_type || '',
      confidentiality_level: assessment.confidentiality_level || 'protected-b',
      integrity_level: assessment.integrity_level || 'medium',
      availability_level: assessment.availability_level || 'medium',
      security_profile: assessment.security_profile || 'PBMM',
      security_framework: assessment.security_framework || assessment.project_security_framework || 'ITSG-33',
      framework_summary: buildFrameworkSummary({
        security_framework: assessment.security_framework || assessment.project_security_framework,
        framework_baseline: assessment.framework_baseline || assessment.project_framework_baseline,
        framework_category: assessment.framework_category || assessment.project_framework_category,
        framework_applicability: assessment.framework_applicability || assessment.project_framework_applicability,
        security_profile: assessment.security_profile,
        confidentiality_level: assessment.confidentiality_level,
        integrity_level: assessment.integrity_level,
        availability_level: assessment.availability_level
      })
    })
  });
});

router.post('/assessments/:id/tailoring', ensureAuthenticated, (req, res) => {
  try {
    const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
    if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

    const controlIds = asArray(req.body.control_db_ids);
    const removeIds = new Set(asArray(req.body.remove_control_ids).map(String));

    controlIds.forEach(controlDbId => {
      if (removeIds.has(String(controlDbId))) {
        run('DELETE FROM assessment_controls WHERE id = ? AND assessment_id = ?', [controlDbId, assessment.id]);
        return;
      }
      const guidanceSource = req.body[`guidance_source_${controlDbId}`] || 'manual';
      run(`UPDATE assessment_controls SET
          title = ?, description = ?, control_guidance = ?, tailored_description = ?,
          evidence_guidance = ?, evidence_text = ?, evidence_status = ?,
          assessor_notes = ?, audit_comments = ?, audit_result = ?, is_applicable = ?,
          is_inherited = ?, inherited_from = ?, priority = ?, risk_level = ?,
          guidance_source = CASE WHEN evidence_guidance != ? THEN 'edited-after-ai' ELSE ? END,
          guidance_edited_at = CASE WHEN evidence_guidance != ? THEN CURRENT_TIMESTAMP ELSE guidance_edited_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND assessment_id = ?`,
        [
          req.body[`title_${controlDbId}`] || '',
          req.body[`description_${controlDbId}`] || '',
          req.body[`control_guidance_${controlDbId}`] || '',
          req.body[`tailored_description_${controlDbId}`] || '',
          req.body[`evidence_guidance_${controlDbId}`] || '',
          req.body[`evidence_text_${controlDbId}`] || '',
          req.body[`evidence_status_${controlDbId}`] || 'pending',
          req.body[`assessor_notes_${controlDbId}`] || '',
          req.body[`audit_comments_${controlDbId}`] || '',
          req.body[`audit_result_${controlDbId}`] || '',
          req.body[`is_applicable_${controlDbId}`] === '0' ? 0 : 1,
          req.body[`is_inherited_${controlDbId}`] === '1' ? 1 : 0,
          req.body[`inherited_from_${controlDbId}`] || '',
          req.body[`priority_${controlDbId}`] || 'P1',
          req.body[`risk_level_${controlDbId}`] || 'medium',
          req.body[`evidence_guidance_${controlDbId}`] || '',
          guidanceSource,
          req.body[`evidence_guidance_${controlDbId}`] || '',
          controlDbId,
          assessment.id
        ]);
    });

    req.flash('success', 'Tailoring changes saved.');
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error('Tailoring save error:', err);
    req.flash('error', 'Failed to save tailoring changes: ' + err.message);
    res.redirect(`/admin/assessments/${req.params.id}?tailor=1`);
  }
});

router.post('/assessments/:id/ai/document-guidance', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    const assessment = get(`
      SELECT a.*, p.name AS project_name, p.description AS project_description, p.technologies,
        p.hosting_type, p.confidentiality_level, p.integrity_level, p.availability_level, p.security_profile
      FROM assessments a JOIN projects p ON p.id = a.project_id
      WHERE a.id = ?
    `, [req.params.id]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const documentIds = asArray(req.body.document_ids);
    const controlDbIds = asArray(req.body.control_db_ids);
    if (!documentIds.length) return res.status(400).json({ error: 'Select at least one project document.' });
    if (!controlDbIds.length) return res.status(400).json({ error: 'Select at least one control.' });

    const placeholders = documentIds.map(() => '?').join(',');
    const documents = all(
      `SELECT * FROM project_documents WHERE project_id = ? AND status != 'deleted' AND id IN (${placeholders})`,
      [assessment.project_id, ...documentIds]
    );
    const documentText = documents.map(d => `DOCUMENT: ${d.original_name}\n${readDocumentText(d)}`).join('\n\n').slice(0, 90000);
    const controlPlaceholders = controlDbIds.map(() => '?').join(',');
    const controls = all(
      `SELECT * FROM assessment_controls WHERE assessment_id = ? AND id IN (${controlPlaceholders}) ORDER BY family, control_id`,
      [assessment.id, ...controlDbIds]
    );

    const ai = require('../config/ai-service');
    if (!ai.isConfigured() && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    }
    const aiGate = access.canUseAI(req.user, 'evidence-guidance');
    if (!aiGate.ok) return res.status(403).json({ error: aiGate.reason, needsLicense: !!aiGate.needsLicense });

    const projectContext = {
      name: assessment.project_name,
      description: assessment.project_description || '',
      technologies: assessment.technologies || '',
      hosting_type: assessment.hosting_type || '',
      confidentiality_level: assessment.confidentiality_level || 'protected-b',
      integrity_level: assessment.integrity_level || 'medium',
      availability_level: assessment.availability_level || 'medium',
      security_profile: assessment.security_profile || 'PBMM',
      documents: documentText
    };

    const guidance = [];
    for (const control of controls) {
      let text;
      if (!ai.isConfigured() && process.env.NODE_ENV === 'test') {
        text = [
          `Provide the sections of the selected project documentation that describe ${control.control_id} - ${control.title}.`,
          'Provide screenshots, configuration exports, or policy excerpts that prove the described design is implemented.',
          'Identify document version, owner, approval date, and any gaps requiring assessor follow-up.'
        ].join('\n');
      } else {
        text = await ai.generateEvidenceGuidance({
          control_id: control.control_id,
          title: control.title,
          description: `${control.description || ''}\n\nProject document excerpts:\n${documentText.slice(0, 12000)}`
        }, projectContext);
      }
      guidance.push({
        controlDbId: control.id,
        controlId: control.control_id,
        title: control.title,
        currentGuidance: control.evidence_guidance || '',
        guidance: text,
        sourceDocuments: documents.map(d => d.original_name)
      });
    }

    access.recordAiUse(req.user, 'evidence-guidance');
    res.json({ success: true, guidance });
  } catch (err) {
    console.error('Document guidance AI error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/assessments/:id/ai/document-guidance/save', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    let saved = 0;
    items.forEach(item => {
      if (!item.controlDbId || !item.guidance) return;
      const existing = get('SELECT evidence_guidance FROM assessment_controls WHERE id = ? AND assessment_id = ?', [item.controlDbId, assessment.id]);
      if (!existing) return;
      if (existing.evidence_guidance && !item.confirmOverwrite) return;
      run(`UPDATE assessment_controls SET evidence_guidance = ?, guidance_source = 'ai-generated',
        ai_generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND assessment_id = ?`,
        [item.guidance, item.controlDbId, assessment.id]);
      saved++;
    });
    res.json({ success: true, saved });
  } catch (err) {
    console.error('Save document guidance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── SEND INVITE ──
router.post('/assessments/:id/send-invite', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`
      SELECT a.*, p.project_owner_name, p.project_owner_email, p.name as project_name
      FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
    `, [req.params.id]);

    if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    run(`UPDATE assessments SET status = 'evidence-gathering', invite_sent_at = CURRENT_TIMESTAMP, 
      invite_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [expiresAt.toISOString(), assessment.id]);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const recipientEmail = assessment.assigned_to_email || assessment.project_owner_email;
    const recipientName = assessment.assigned_to_user_id
      ? (get('SELECT name FROM users WHERE id = ?', [assessment.assigned_to_user_id])?.name || assessment.project_owner_name)
      : assessment.project_owner_name;
    if (!recipientEmail) {
      req.flash('error', 'No assigned user or project owner email is available for this assessment.');
      return res.redirect(`/admin/assessments/${assessment.id}`);
    }
    const emailResult = await emailService.sendInvite({
      to: recipientEmail,
      recipientName,
      projectName: assessment.project_name,
      inviteCode: assessment.invite_code,
      expiresAt: expiresAt.toISOString(),
      assessorName: req.user.name,
      baseUrl,
      // Use the tenant's own SMTP when configured, otherwise the platform default.
      smtpConfig: orgSettings.orgSmtp(req.user.organization_id)
    });

    if (emailResult.sent) {
      req.flash('success', `Invite emailed to ${recipientEmail} with code: ${assessment.invite_code}`);
    } else {
      req.flash('success', `Assessment activated with code: ${assessment.invite_code}. Email could not be sent (${emailResult.error || 'not configured'}) — share the code manually.`);
    }
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to send invite: ' + err.message);
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

router.post('/assessments/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const assessment = get(`
      SELECT a.*, p.name AS project_name
      FROM assessments a JOIN projects p ON p.id = a.project_id
      WHERE a.id = ?
    `, [req.params.id]);
    if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

    const result = assignEntityFromRequest({
      req,
      entityType: 'assessment',
      entityId: assessment.id,
      entityName: assessment.project_name
    });

    if (assessment.intake_id) {
      assignEntityFromRequest({
        req,
        entityType: 'intake',
        entityId: assessment.intake_id,
        entityName: assessment.project_name
      });
    }

    req.flash('success', `Assessment${assessment.intake_id ? ' and linked intake' : ''} assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/assessments/${assessment.id}`);
  } catch (err) {
    console.error('Assessment assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

// ── AUDIT ──
router.post('/assessments/:id/start-audit', ensureAuthenticated, (req, res) => {
  run(`UPDATE assessments SET status = 'audit', audit_started_at = CURRENT_TIMESTAMP, 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
  req.flash('success', 'Audit started');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/audit-control/:controlId', ensureAuthenticated, (req, res) => {
  const { result, comments } = req.body;
  run(`UPDATE assessment_controls SET audit_result = ?, audit_comments = ?, 
    audit_reviewed_at = CURRENT_TIMESTAMP, audit_reviewed_by = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND assessment_id = ?`,
    [result, comments, req.user.id, req.params.controlId, req.params.id]);
  res.json({ success: true });
});

router.post('/assessments/:id/complete-audit', ensureAuthenticated, (req, res) => {
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? AND is_applicable = 1', [req.params.id]);
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  const project = assessment ? get('SELECT * FROM projects WHERE id = ?', [assessment.project_id]) : null;
  if (!assessment || !project) {
    req.flash('error', 'Assessment or project not found.');
    return res.redirect(`/admin/assessments/${req.params.id}`);
  }
  const met = controls.filter(c => c.audit_result === 'met').length;
  const partial = controls.filter(c => c.audit_result === 'partially-met').length;
  const notMet = controls.filter(c => c.audit_result === 'not-met').length;
  const total = controls.length;
  const score = total > 0 ? Math.round((met + partial * 0.5) / total * 100) : 0;

  // Assessor can override the result or let the engine decide
  let result = req.body.overrideResult || null;
  let atoType = null;

  if (!result) {
    // GC scoring: 100% met = ATO, >=80% with no critical = iATO, <80% = denied
    // TBS additional check: any HIGH risk not-met controls = cannot grant full ATO
    const highRiskNotMet = controls.filter(c =>
      (c.audit_result === 'not-met') &&
      (c.risk_level === 'high' || computeRiskLevel(c) === 'high'));

    if (met === total) {
      result = 'ato'; atoType = 'ato';
    } else if (score >= 80 && highRiskNotMet.length === 0) {
      result = 'ato'; atoType = 'ato';
    } else if (score >= 60) {
      result = 'iato'; atoType = 'iato';
    } else {
      result = 'denied'; atoType = null;
    }
  } else {
    atoType = (result === 'ato') ? 'ato' : (result === 'iato') ? 'iato' : null;
  }

  // Set expiry for iATO (default 90 days if not specified)
  let expiryDate = null;
  if (atoType === 'iato') {
    if (req.body.atoExpiryDate) {
      expiryDate = req.body.atoExpiryDate;
    } else {
      const d = new Date(); d.setDate(d.getDate() + 90);
      expiryDate = d.toISOString().split('T')[0];
    }
  }

  run(`UPDATE assessments SET status = 'completed', audit_completed_at = CURRENT_TIMESTAMP, 
    overall_score = ?, result = ?, ato_type = ?, ato_expiry_date = ?,
    risk_acceptance_statement = ?, poam_notes = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [score, result, atoType, expiryDate,
     req.body.riskAcceptance || '', req.body.poamNotes || '',
     req.params.id]);

  // Auto-populate POA&M items for not-met/partially-met controls
  const findings = controls.filter(c => c.audit_result === 'not-met' || c.audit_result === 'partially-met');
  if (atoType === 'iato' && findings.length > 0) {
    const existing = all('SELECT control_id FROM iato_checklist WHERE assessment_id = ?', [req.params.id]);
    const existingIds = new Set(existing.map(e => e.control_id));

    findings.forEach(c => {
      if (!existingIds.has(c.control_id)) {
        const riskLevel = c.risk_level || computeRiskLevel(c);
        const defaultDeadline = new Date();
        defaultDeadline.setDate(defaultDeadline.getDate() + (riskLevel === 'high' ? 30 : riskLevel === 'medium' ? 60 : 90));

        run(`INSERT INTO iato_checklist (project_id, assessment_id, control_id, description, risk_level,
          original_finding, deadline, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
          [project.id, req.params.id, c.control_id,
           `Remediate ${c.control_id} — ${c.title} (${c.audit_result === 'not-met' ? 'Not Met' : 'Partially Met'})`,
           riskLevel,
           c.audit_comments || `Control ${c.audit_result}: ${c.title}`,
           defaultDeadline.toISOString().split('T')[0],
           req.user.id]);
      }
    });
  }

  // Save templates for reuse
  controls.filter(c => c.audit_result === 'met' && c.evidence_text).forEach(c => {
    const existing = get('SELECT id FROM control_templates WHERE control_id = ? AND hosting_type = ?',
      [c.control_id, project.hosting_type]);
    if (!existing) {
      run(`INSERT INTO control_templates (control_id, hosting_type, technologies, tailored_description, 
        evidence_guidance, example_evidence, source_project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.control_id, project.hosting_type, project.technologies, c.tailored_description,
          c.evidence_guidance, c.evidence_text, project.id]);
    } else {
      run('UPDATE control_templates SET usage_count = usage_count + 1 WHERE id = ?', [existing.id]);
    }
  });

  req.flash('success', `Audit completed. Score: ${score}%. Result: ${(result || '').toUpperCase()}.${atoType === 'iato' ? ' POA&M items auto-generated for ' + findings.length + ' findings.' : ''}`);
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── POA&M MANAGEMENT ──
router.post('/assessments/:id/checklist/add', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }
  const { description, deadline, control_id, assigned_to, risk_level, remediation_plan, milestone, residual_risk, assessor_notes, ato_record_id } = req.body;
  run(`INSERT INTO iato_checklist (project_id, assessment_id, ato_record_id, control_id, description, risk_level,
    remediation_plan, milestone, deadline, assigned_to, residual_risk, assessor_notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [assessment.project_id, req.params.id, ato_record_id || null, control_id, description, risk_level || 'medium',
     remediation_plan || '', milestone || '', deadline, assigned_to, residual_risk || '', assessor_notes || '', req.user.id]);
  req.flash('success', 'POA&M item added');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/:itemId/update', ensureAuthenticated, (req, res) => {
  const { status, risk_level, assigned_to, deadline, remediation_plan, milestone, evidence_text, residual_risk, assessor_notes, ato_record_id, description, original_finding } = req.body;
  const updates = [];
  const params = [];

  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (original_finding !== undefined) { updates.push('original_finding = ?'); params.push(original_finding); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (risk_level) { updates.push('risk_level = ?'); params.push(risk_level); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
  if (deadline) { updates.push('deadline = ?'); params.push(deadline); }
  if (remediation_plan !== undefined) { updates.push('remediation_plan = ?'); params.push(remediation_plan); }
  if (milestone !== undefined) { updates.push('milestone = ?'); params.push(milestone); }
  if (evidence_text !== undefined) { updates.push('evidence_text = ?'); params.push(evidence_text); }
  if (residual_risk !== undefined) { updates.push('residual_risk = ?'); params.push(residual_risk); }
  if (assessor_notes !== undefined) { updates.push('assessor_notes = ?'); params.push(assessor_notes); }
  if (ato_record_id !== undefined) { updates.push('ato_record_id = ?'); params.push(ato_record_id || null); }

  if (status === 'completed') {
    updates.push('completed_at = CURRENT_TIMESTAMP');
  }
  if (status === 'verified') {
    updates.push('verified_at = CURRENT_TIMESTAMP');
    updates.push('verified_by = ?'); params.push(req.user.id);
  }

  if (updates.length) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.itemId, req.params.id);
    run(`UPDATE iato_checklist SET ${updates.join(', ')} WHERE id = ? AND assessment_id = ?`, params);
  }
  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.json({ success: true });
  }
  req.flash('success', 'POA&M item updated');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/:itemId/delete', ensureAuthenticated, (req, res) => {
  run('DELETE FROM iato_checklist WHERE id = ? AND assessment_id = ?', [req.params.itemId, req.params.id]);
  req.flash('success', 'POA&M item removed');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

router.post('/assessments/:id/poam/auto-populate', ensureAuthenticated, (req, res) => {
  const controls = all(`SELECT * FROM assessment_controls WHERE assessment_id = ? AND is_applicable = 1 
    AND (audit_result = 'not-met' OR audit_result = 'partially-met')`, [req.params.id]);
  const existing = all('SELECT control_id FROM iato_checklist WHERE assessment_id = ?', [req.params.id]);
  const existingIds = new Set(existing.map(e => e.control_id));
  let added = 0;

  controls.forEach(c => {
    if (!existingIds.has(c.control_id)) {
      const riskLevel = c.risk_level || computeRiskLevel(c);
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + (riskLevel === 'high' ? 30 : riskLevel === 'medium' ? 60 : 90));
      const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
      run(`INSERT INTO iato_checklist (project_id, assessment_id, control_id, description, risk_level,
        original_finding, deadline, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        [assessment?.project_id || null, req.params.id, c.control_id,
         `Remediate ${c.control_id} — ${c.title}`,
         riskLevel, c.audit_comments || `${c.audit_result}: ${c.title}`,
         defaultDeadline.toISOString().split('T')[0], req.user.id]);
      added++;
    }
  });
  req.flash('success', `Auto-populated ${added} POA&M items from ${controls.length} findings (${existing.length} already existed).`);
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── REACTIVATE SUBMISSION ──
router.post('/assessments/:id/reactivate', ensureAuthenticated, (req, res) => {
  run(`UPDATE assessments SET status = 'evidence-gathering', submitted_at = NULL, 
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
  run(`UPDATE assessment_controls SET evidence_status = 'pending' WHERE assessment_id = ?`, [req.params.id]);
  req.flash('success', 'Submission reactivated for updates');
  res.redirect(`/admin/assessments/${req.params.id}`);
});

// ── PDF EXPORT ──
router.get('/assessments/:id/export-pdf', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`SELECT a.*, p.* FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?`, [req.params.id]);
    const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);

    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `sa-report-${assessment.id}-${Date.now()}.pdf`);

    await pdfExport.generateAssessmentReport(assessment, controls, assessment, outputPath);
    res.download(outputPath);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to generate PDF');
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

router.get('/assessments/:id/generate-ato', ensureAuthenticated, async (req, res) => {
  try {
    const assessment = get(`SELECT a.*, p.* FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?`, [req.params.id]);
    const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);

    const outputDir = path.join(__dirname, '..', 'data', 'exports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const atoType = assessment.ato_type || 'ato';
    const outputPath = path.join(outputDir, `${atoType}-${assessment.id}-${Date.now()}.pdf`);

    await pdfExport.generateATODocument(assessment, assessment, atoType, controls, outputPath, {
      poamItems: all('SELECT * FROM iato_checklist WHERE assessment_id = ? ORDER BY CASE risk_level WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, deadline', [assessment.id]),
      riskAcceptance: assessment.risk_acceptance_statement || '',
      poamNotes: assessment.poam_notes || ''
    });
    
    run(`UPDATE assessments SET ato_generated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assessment.id]);
    res.download(outputPath);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to generate ATO document');
    res.redirect(`/admin/assessments/${req.params.id}`);
  }
});

// ── DELETE ASSESSMENT (Draft only) ──
router.post('/assessments/:id/delete', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }
  if (assessment.status !== 'draft') {
    req.flash('error', 'Only draft assessments can be deleted. This assessment is currently in "' + assessment.status + '" status.');
    return res.redirect(`/admin/assessments/${assessment.id}`);
  }

  // Cascade delete related data
  run('DELETE FROM comments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [assessment.id]);
  run('DELETE FROM attachments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [assessment.id]);
  run('DELETE FROM iato_checklist WHERE assessment_id = ?', [assessment.id]);
  run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'assessment' AND entity_id = ?", [assessment.id]);
  run('DELETE FROM assessment_controls WHERE assessment_id = ?', [assessment.id]);
  run('DELETE FROM assessments WHERE id = ?', [assessment.id]);

  req.flash('success', 'Draft assessment deleted successfully');
  res.redirect(req.body.return_to || '/admin/assessments');
});

// ── ARCHIVE PROJECT (reversible soft-archive) ──
// Sets the project and all its assessments + intakes to 'archived' status while
// preserving their prior status, so they can be restored later. Archived records
// are hidden from the dashboard and the main list views but not deleted.
router.post('/projects/:id/archive', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  if (project.archived_at) {
    req.flash('error', 'Project is already archived.');
    return res.redirect(`/admin/projects/${project.id}`);
  }

  // Only stash the prior status the first time a record is archived.
  run(`UPDATE assessments SET status_before_archive = status, status = 'archived',
       archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE project_id = ? AND archived_at IS NULL`, [project.id]);
  run(`UPDATE intake_submissions SET status_before_archive = status, status = 'archived',
       archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE project_id = ? AND archived_at IS NULL`, [project.id]);
  run(`UPDATE projects SET status_before_archive = status, status = 'archived',
       archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [project.id]);

  req.flash('success', `Project "${project.name}" and its assessments and intakes were archived. They are hidden from the dashboard but not deleted.`);
  res.redirect('/admin/projects');
});

// ── UNARCHIVE PROJECT (restore) ──
router.post('/projects/:id/unarchive', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  if (!project.archived_at) {
    req.flash('error', 'Project is not archived.');
    return res.redirect(`/admin/projects/${project.id}`);
  }

  // Restore only the records archived as part of this project's archive action.
  run(`UPDATE assessments SET status = COALESCE(status_before_archive, 'draft'),
       status_before_archive = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE project_id = ? AND archived_at IS NOT NULL`, [project.id]);
  run(`UPDATE intake_submissions SET status = COALESCE(status_before_archive, 'pending'),
       status_before_archive = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE project_id = ? AND archived_at IS NOT NULL`, [project.id]);
  run(`UPDATE projects SET status = COALESCE(status_before_archive, 'draft'),
       status_before_archive = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [project.id]);

  req.flash('success', `Project "${project.name}" was restored from the archive.`);
  res.redirect(`/admin/projects/${project.id}`);
});

// ── DELETE PROJECT (permanent purge) ──
// GitHub-style danger action: requires the exact project name to be typed. Purges
// the project and ALL its related assessments (any status) and intakes.
router.post('/projects/:id/delete', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  // Require the typed confirmation name to exactly match the project name.
  const typed = (req.body.confirm_name || '').trim();
  if (typed !== project.name) {
    req.flash('error', 'Deletion cancelled — the project name you typed did not match. The project was not deleted.');
    return res.redirect(`/admin/projects/${project.id}`);
  }

  // Delete ALL assessments (any status) and their related data.
  const assessments = all('SELECT id FROM assessments WHERE project_id = ?', [project.id]);
  assessments.forEach(a => {
    run('DELETE FROM comments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [a.id]);
    run('DELETE FROM attachments WHERE assessment_control_id IN (SELECT id FROM assessment_controls WHERE assessment_id = ?)', [a.id]);
    run('DELETE FROM iato_checklist WHERE assessment_id = ?', [a.id]);
    run('DELETE FROM assessment_controls WHERE assessment_id = ?', [a.id]);
    run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'assessment' AND entity_id = ?", [a.id]);
    run('DELETE FROM assessments WHERE id = ?', [a.id]);
  });

  const projectIntakes = all('SELECT id FROM intake_submissions WHERE project_id = ?', [project.id]);
  projectIntakes.forEach(i => {
    run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'intake' AND entity_id = ?", [i.id]);
  });
  run('DELETE FROM intake_attachments WHERE intake_id IN (SELECT id FROM intake_submissions WHERE project_id = ?)', [project.id]);
  run('DELETE FROM intake_submissions WHERE project_id = ?', [project.id]);
  run("UPDATE assessment_assignments SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE entity_type = 'project' AND entity_id = ?", [project.id]);

  // Delete the project itself
  run('DELETE FROM projects WHERE id = ?', [project.id]);

  req.flash('success', `Project "${project.name}" and ${assessments.length} assessment(s) were permanently deleted.`);
  res.redirect('/admin/projects');
});

// ── SELF-ASSESSMENTS (pre-intake submissions) ──
router.get('/self-assessments', ensureAuthenticated, (req, res) => {
  const assessments = all('SELECT * FROM self_assessments ORDER BY created_at DESC');
  const accessRequests = all('SELECT * FROM sa_access_requests ORDER BY created_at DESC');
  const stats = {
    total: assessments.length,
    submitted: assessments.filter(a => a.status === 'submitted').length,
    reviewed: assessments.filter(a => a.status === 'reviewed').length,
    intakeCreated: assessments.filter(a => a.status === 'intake-created').length,
    pendingAccessRequests: accessRequests.filter(r => r.status === 'pending').length
  };
  res.render('admin/self-assessments', {
    title: 'Self-Assessments',
    isAdmin: true,
    isSelfAssessments: true,
    admin: req.user,
    assessments,
    accessRequests,
    stats
  });
});

router.get('/self-assessments/:id', ensureAuthenticated, (req, res) => {
  const sa = get('SELECT * FROM self_assessments WHERE id = ?', [req.params.id]);
  if (!sa) { req.flash('error', 'Self-assessment not found.'); return res.redirect('/admin/self-assessments'); }

  let report = {}, frameworks = {}, questions = [], answers = {};
  try { report = JSON.parse(sa.report_json || '{}'); } catch(e) {}
  try { frameworks = JSON.parse(sa.frameworks_json || '{}'); } catch(e) {}
  try { questions = JSON.parse(sa.questions_json || '[]'); } catch(e) {}
  try { answers = JSON.parse(sa.answers_json || '{}'); } catch(e) {}

  const linkedIntake = sa.intake_id ? get('SELECT id, ref_code, status FROM intake_submissions WHERE id = ?', [sa.intake_id]) : null;
  const existingUser = sa.submitter_email ? get('SELECT id, email, role FROM users WHERE LOWER(email) = ?', [normalizeEmail(sa.submitter_email)]) : null;

  res.render('admin/self-assessment-review', {
    title: `Self-Assessment ${sa.ref_code}`,
    isAdmin: true,
    isSelfAssessments: true,
    admin: req.user,
    sa,
    report,
    frameworks,
    questions,
    answers,
    linkedIntake,
    existingUser,
    countryName: countryNames[sa.country] || sa.country,
    govLevelName: govLevelNames[sa.gov_level] || sa.gov_level,
    sensitivityName: sensitivityNames[sa.data_sensitivity] || sa.data_sensitivity
  });
});

router.post('/self-assessments/:id/review', ensureAuthenticated, (req, res) => {
  run(
    `UPDATE self_assessments
     SET status = CASE WHEN status = 'submitted' THEN 'reviewed' ELSE status END,
         reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [req.user.id, req.body.admin_notes || '', req.params.id]
  );
  req.flash('success', 'Self-assessment review notes saved.');
  res.redirect(`/admin/self-assessments/${req.params.id}`);
});

router.post('/self-assessments/:id/create-intake', ensureAuthenticated, (req, res) => {
  try {
    const sa = get('SELECT * FROM self_assessments WHERE id = ?', [req.params.id]);
    if (!sa) { req.flash('error', 'Self-assessment not found.'); return res.redirect('/admin/self-assessments'); }
    if (sa.intake_id) {
      req.flash('info', 'This self-assessment already has a linked intake.');
      return res.redirect(`/admin/self-assessments/${sa.id}`);
    }

    let frameworks = {}, report = {};
    try { frameworks = JSON.parse(sa.frameworks_json || '{}'); } catch(e) {}
    try { report = JSON.parse(sa.report_json || '{}'); } catch(e) {}
    const primaryFramework = frameworks.primary || frameworks.all?.[0] || 'ITSG-33';
    const selectedFramework = primaryFramework.includes('FedRAMP') ? 'FedRAMP Rev. 5'
      : primaryFramework.includes('NIST') ? 'NIST SP 800-53 Rev. 5'
      : primaryFramework.includes('CIS') ? 'CIS Controls v8'
      : primaryFramework.includes('ISO') ? 'ISO/IEC 27001:2022 Annex A'
      : primaryFramework.includes('ISM') ? 'ASD ISM'
      : primaryFramework.includes('Essential Eight') ? 'ACSC Essential Eight'
      : 'ITSG-33';

    const body = {
      projectName: req.body.project_name || `${sa.submitter_org || 'Client'} ${sa.system_type || 'System'} Assessment`,
      projectDescription: req.body.project_description || sa.system_description || '',
      department: req.body.department || sa.submitter_org || '',
      branch: req.body.branch || '',
      appType: req.body.app_type || (sa.system_type === 'web-app' ? 'external' : 'internal'),
      data_classification: req.body.data_classification || (sa.data_sensitivity === 'high' ? 'protected-b' : 'protected-a'),
      confidentiality_level: req.body.confidentiality_level || (sa.data_sensitivity === 'high' ? 'protected-b' : 'protected-a'),
      integrity_level: req.body.integrity_level || 'medium',
      availability_level: req.body.availability_level || 'medium',
      security_framework: selectedFramework,
      framework_baseline: req.body.framework_baseline || defaultBaseline(selectedFramework),
      framework_category: req.body.framework_category || defaultCategory(selectedFramework),
      framework_applicability: req.body.framework_applicability || `Converted from self-assessment ${sa.ref_code}. Score: ${report.score || sa.score || 0}%.`,
      has_pii: ['medium', 'high', 'classified'].includes(sa.data_sensitivity) ? '1' : '',
      hosting_type: req.body.hosting_type || '',
      additionalNotes: `Self-assessment ${sa.ref_code}. Critical: ${sa.critical_count || 0}; warnings: ${sa.warning_count || 0}; secure: ${sa.secure_count || 0}.`,
      ownerName: sa.submitter_name || '',
      ownerEmail: sa.submitter_email || ''
    };

    const intakeId = createProjectIntake({ projectId: null, body, createdBy: req.user.id, status: 'draft' });
    run('UPDATE intake_submissions SET self_assessment_id = ? WHERE id = ?', [sa.id, intakeId]);
    run("UPDATE self_assessments SET status = 'intake-created', intake_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [intakeId, sa.id]);
    req.flash('success', 'Draft intake created from the self-assessment.');
    res.redirect(`/admin/self-assessments/${sa.id}`);
  } catch (err) {
    console.error('Create intake from self-assessment error:', err);
    req.flash('error', 'Failed to create intake: ' + err.message);
    res.redirect(`/admin/self-assessments/${req.params.id}`);
  }
});

router.post('/self-assessments/:id/invite-client', ensureAuthenticated, (req, res) => {
  try {
    const sa = get('SELECT * FROM self_assessments WHERE id = ?', [req.params.id]);
    if (!sa) { req.flash('error', 'Self-assessment not found.'); return res.redirect('/admin/self-assessments'); }
    const email = normalizeEmail(sa.submitter_email);
    const existing = get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existing) {
      req.flash('info', `${email} already has an account. Assign their intake or assessment from the project dashboard.`);
      return res.redirect(`/admin/self-assessments/${sa.id}`);
    }
    const created = createInvitation({
      type: 'client',
      email,
      name: sa.submitter_name || '',
      organization: sa.submitter_org || '',
      message: `Your preliminary self-assessment ${sa.ref_code} has been reviewed. Please register to continue the full intake.`,
      invitedBy: req.user.id,
      req,
      entityType: 'self-assessment',
      entityId: sa.id
    });
    req.flash('success', `Client invitation created for ${email}. Code: ${created.inviteCode}`);
    res.redirect(`/admin/self-assessments/${sa.id}`);
  } catch (err) {
    console.error('Self-assessment client invite error:', err);
    req.flash('error', 'Failed to invite client: ' + err.message);
    res.redirect(`/admin/self-assessments/${req.params.id}`);
  }
});

router.post('/self-assessment-requests/:id/approve', ensureAuthenticated, (req, res) => {
  try {
    const request = get('SELECT * FROM sa_access_requests WHERE id = ?', [req.params.id]);
    if (!request) { req.flash('error', 'Access request not found.'); return res.redirect('/admin/self-assessments'); }
    const code = uuidv4().substring(0, 8).toUpperCase();
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    run(
      "UPDATE sa_access_requests SET status = 'approved', access_code = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?",
      [code, req.user.id, expiry, request.id]
    );
    emailService.sendMail({
      to: request.email,
      subject: 'Security self-assessment access code',
      text: `Hello ${request.name || ''},\n\nYour access code is ${code}.\n\nStart here: ${req.protocol}://${req.get('host')}/self-assessment?code=${code}\n\nThis code expires in 30 days.`
    }).catch(err => console.error('[Email] self-assessment code failed:', err.message));
    req.flash('success', `Access request approved. Code: ${code}`);
    res.redirect('/admin/self-assessments');
  } catch (err) {
    console.error('Approve self-assessment access request error:', err);
    req.flash('error', 'Failed to approve request: ' + err.message);
    res.redirect('/admin/self-assessments');
  }
});

router.post('/self-assessment-requests/:id/deny', ensureAuthenticated, (req, res) => {
  run("UPDATE sa_access_requests SET status = 'denied' WHERE id = ?", [req.params.id]);
  req.flash('success', 'Access request denied.');
  res.redirect('/admin/self-assessments');
});

// ── TEAMS / INVITATIONS ──
router.get(['/teams', '/invitations'], ensureAuthenticated, (req, res) => {
  const clientInvites = all(
    `SELECT i.*, u.name AS accepted_name FROM invitations i
     LEFT JOIN users u ON u.id = i.accepted_by_user_id
     WHERE i.type = 'client' AND i.invited_by = ?
     ORDER BY i.created_at DESC`,
    [req.user.id]
  );
  const assessorInvites = all(
    `SELECT i.*, u.name AS accepted_name FROM invitations i
     LEFT JOIN users u ON u.id = i.accepted_by_user_id
     WHERE i.type = 'assessor' AND i.invited_by = ?
     ORDER BY i.created_at DESC`,
    [req.user.id]
  );
  const activeUsers = all(`
    SELECT id, name, email, role, organization, is_active, mfa_enabled, mfa_mode, is_break_glass, created_at, last_login
    FROM users
    WHERE role IN ('client','assessor')
    ORDER BY role, name, email
  `);
  res.render('admin/teams', {
    title: 'Teams',
    isAdmin: true,
    isTeams: true,
    admin: req.user,
    clientInvites,
    assessorInvites,
    activeUsers
  });
});

router.post(['/teams/client', '/invitations/client'], ensureAuthenticated, (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) throw new Error('Email address is required.');
    if (get('SELECT id FROM users WHERE LOWER(email) = ?', [email])) throw new Error(`A user with ${email} already exists.`);
    if (get("SELECT id FROM invitations WHERE LOWER(email) = ? AND type = 'client' AND status = 'pending'", [email])) throw new Error(`A pending client invitation already exists for ${email}.`);
    const created = createInvitation({
      type: 'client',
      email,
      name: req.body.name || '',
      organization: req.body.organization || '',
      message: req.body.message || '',
      invitedBy: req.user.id,
      req
    });
    req.flash('success', `Client invitation created for ${email}. Code: ${created.inviteCode}`);
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/admin/teams');
});

router.post(['/teams/assessor', '/invitations/assessor'], ensureAuthenticated, (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) throw new Error('Email address is required.');
    if (get('SELECT id FROM users WHERE LOWER(email) = ?', [email])) throw new Error(`A user with ${email} already exists.`);
    if (get("SELECT id FROM invitations WHERE LOWER(email) = ? AND type = 'assessor' AND status = 'pending'", [email])) throw new Error(`A pending assessor invitation already exists for ${email}.`);
    const created = createInvitation({
      type: 'assessor',
      email,
      name: req.body.name || '',
      organization: req.body.organization || '',
      message: req.body.message || '',
      invitedBy: req.user.id,
      req
    });
    req.flash('success', `Assessor invitation created for ${email}. Code: ${created.inviteCode}`);
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/admin/teams');
});

router.post(['/teams/:id/revoke', '/invitations/:id/revoke'], ensureAuthenticated, (req, res) => {
  const invite = get('SELECT * FROM invitations WHERE id = ? AND invited_by = ?', [req.params.id, req.user.id]);
  if (!invite) req.flash('error', 'Invitation not found.');
  else {
    run("UPDATE invitations SET status = 'revoked' WHERE id = ?", [invite.id]);
    req.flash('success', `Invitation to ${invite.email} revoked.`);
  }
  res.redirect('/admin/teams');
});

router.post(['/teams/:id/resend', '/invitations/:id/resend'], ensureAuthenticated, (req, res) => {
  const invite = get('SELECT * FROM invitations WHERE id = ? AND invited_by = ?', [req.params.id, req.user.id]);
  if (!invite || invite.status !== 'pending') {
    req.flash('error', 'Invitation not found or not pending.');
    return res.redirect('/admin/teams');
  }
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  run('UPDATE invitations SET expires_at = ? WHERE id = ?', [newExpiry, invite.id]);
  emailService.sendUserInvitation({
    to: invite.email,
    recipientName: invite.name || '',
    inviteCode: invite.invite_code,
    invitedByName: req.user.name,
    role: invite.type,
    organization: invite.organization || req.user.organization || '',
    baseUrl: `${req.protocol}://${req.get('host')}`,
    message: invite.message || ''
  }).catch(err => console.error('[Email] Invitation resend failed:', err.message));
  req.flash('success', `Invitation re-sent to ${invite.email}.`);
  res.redirect('/admin/teams');
});

// ── SETTINGS ──
router.get('/settings', ensureAuthenticated, (req, res) => {
  res.render('admin/settings', {
    title: 'Settings', isAdmin: true, isSettings: true, admin: req.user
  });
});

// Self-service password change (any signed-in user).
router.post('/settings/password', ensureAuthenticated, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const user = get('SELECT id, password FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password || '', user.password)) {
    req.flash('error', 'Your current password is incorrect.');
    return res.redirect('/admin/settings');
  }
  if (!new_password || new_password.length < 10) {
    req.flash('error', 'New password must be at least 10 characters.');
    return res.redirect('/admin/settings');
  }
  if (new_password !== confirm_password) {
    req.flash('error', 'The new passwords do not match.');
    return res.redirect('/admin/settings');
  }
  run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(new_password, 12), user.id]);
  req.flash('success', 'Your password has been updated.');
  res.redirect('/admin/settings');
});

// ── NOTIFICATIONS ──
router.get('/notifications', ensureAuthenticated, (req, res) => {
  const notifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  res.render('admin/notifications', {
    title: 'Notifications', isAdmin: true, admin: req.user, notifications
  });
});

// ── INTAKE MANAGEMENT ──

const PII_LABELS = {
  'name-address': 'Name, Address & Contact Info',
  'sin': 'Social Insurance Number (SIN)',
  'financial': 'Financial Information',
  'health': 'Health / Medical Records',
  'biometric': 'Biometric Data',
  'employment': 'Employment / HR Records',
  'immigration': 'Immigration / Citizenship',
  'law-enforcement': 'Law Enforcement / Criminal Records',
  'indigenous': 'Indigenous / Treaty Data'
};

const ACTIVITY_LABELS = {
  'tra': 'Threat & Risk Assessment (TRA)',
  'pia': 'Privacy Impact Assessment (PIA)',
  'ssp': 'System Security Plan (SSP)',
  'vapt': 'Vulnerability Assessment / Pen Test',
  'network-diagram': 'Network / Architecture Diagram',
  'previous-sa': 'Previous SA&A / ATO'
};

// List all intakes
router.get('/intakes', ensureAuthenticated, (req, res) => {
  const intakes = all('SELECT * FROM intake_submissions WHERE archived_at IS NULL ORDER BY created_at DESC');
  const pending = all("SELECT COUNT(*) as c FROM intake_submissions WHERE archived_at IS NULL AND status = 'pending'")[0]?.c || 0;
  const accepted = all("SELECT COUNT(*) as c FROM intake_submissions WHERE archived_at IS NULL AND status = 'accepted'")[0]?.c || 0;
  const inReview = all("SELECT COUNT(*) as c FROM intake_submissions WHERE archived_at IS NULL AND status = 'in-review'")[0]?.c || 0;

  res.render('admin/intakes', {
    title: 'Intake Submissions', isAdmin: true, isIntakes: true,
    admin: req.user, intakes,
    stats: { total: intakes.length, pending, accepted, inReview }
  });
});

// Review a single intake
router.get('/intakes/:id', ensureAuthenticated, (req, res) => {
  const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
  if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

  const piiTypes = JSON.parse(intake.pii_types || '[]');
  const technologies = JSON.parse(intake.technologies || '[]');
  const activities = JSON.parse(intake.completed_activities || '[]');

  const attachments = all('SELECT * FROM intake_attachments WHERE intake_id = ?', [intake.id]);
  attachments.forEach(a => {
    a.size_display = a.size > 1048576 ? (a.size / 1048576).toFixed(1) + ' MB' : (a.size / 1024).toFixed(0) + ' KB';
  });

  const allTechnologies = Object.entries(COMMON_TECHNOLOGIES).map(([key, val]) => ({
    key, name: val.name, alreadySelected: technologies.includes(key)
  }));
  const assignments = getEntityAssignments('intake', [intake.id]);
  const linkedAssessments = all('SELECT id, type, status, invite_code FROM assessments WHERE intake_id = ? ORDER BY created_at DESC', [intake.id]);

  // Engine preview
  let engineDesc = intake.project_description || '';
  if (intake.interconnections) engineDesc += ' integration interconnect API ' + intake.interconnections;
  if (intake.mobile_access === 'yes') engineDesc += ' mobile byod';
  if (intake.external_users === 'yes') engineDesc += ' external public';

  const recommended = getRecommendedControls({
    dataClassification: intake.data_classification,
    confidentiality: intake.confidentiality_level || intake.data_classification,
    hostingType: intake.hosting_type,
    appType: intake.app_type, hasPII: intake.has_pii === 1,
    technologies, description: engineDesc,
    securityProfile: intake.security_profile || 'PBMM',
    isHVA: intake.is_hva === 1
  });

  const saaCheck = assessSAARequirement({
    dataClassification: intake.data_classification,
    confidentiality: intake.confidentiality_level || intake.data_classification,
    hasPII: intake.has_pii === 1,
    description: engineDesc, appType: intake.app_type
  });

  // Profile determination for display
  const confLevel = intake.confidentiality_level || intake.data_classification || 'protected-b';
  const intLevel = intake.integrity_level || 'medium';
  const avaLevel = intake.availability_level || 'medium';
  const profileResult = determineProfile({
    confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
    hasPII: intake.has_pii === 1, isHVA: intake.is_hva === 1,
    hasComplexity: detectComplexity(engineDesc)
  });
  const catLabel = categorizationLabel(confLevel, intLevel, avaLevel);
  const catFullLabel = categorizationFullLabel(confLevel, intLevel, avaLevel);

  res.render('admin/intake-review', {
    title: 'Review: ' + intake.project_name, isAdmin: true,
    user: req.user, intake, attachments, assignments, linkedAssessments,
    users: getAssignableUsers(),
    piiList: piiTypes.filter(p => p !== 'none').map(p => PII_LABELS[p] || p),
    techList: technologies.map(t => COMMON_TECHNOLOGIES[t]?.name || t),
    activityList: activities.map(a => ACTIVITY_LABELS[a] || a),
    allTechnologies,
    controlCount: recommended.length,
    p1Count: recommended.filter(c => c.priority === 'P1').length,
    p2Count: recommended.filter(c => c.priority === 'P2').length,
    p3Count: recommended.filter(c => c.priority === 'P3').length,
    inheritedCount: recommended.filter(c => c.isInherited).length,
    nonInheritedCount: recommended.filter(c => !c.isInherited).length,
    profileId: profileResult.profile.id,
    saaRequired: saaCheck.requiresSAA,
    saaReason: saaCheck.reason,
    catLabel, catFullLabel,
    profileName: profileResult.profile.name,
    profileShortName: profileResult.profile.shortName,
    profileReason: profileResult.reason,
    tailoringNotes: profileResult.tailoringNotes,
    profileColor: profileResult.profile.color
  });
});

router.post('/intakes/:id/assign', ensureAuthenticated, (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

    const result = assignEntityFromRequest({
      req,
      entityType: 'intake',
      entityId: intake.id,
      entityName: intake.project_name
    });

    if (req.body.assign_linked_assessments === '1') {
      const linked = all('SELECT id FROM assessments WHERE intake_id = ?', [intake.id]);
      linked.forEach(a => assignEntityFromRequest({
        req,
        entityType: 'assessment',
        entityId: a.id,
        entityName: intake.project_name
      }));
    }

    req.flash('success', `Intake assigned to ${result.name || result.email}${result.pending ? ` (invitation code ${result.inviteCode})` : ''}.`);
    res.redirect(`/admin/intakes/${intake.id}`);
  } catch (err) {
    console.error('Intake assignment error:', err);
    req.flash('error', 'Assignment failed: ' + err.message);
    res.redirect(`/admin/intakes/${req.params.id}`);
  }
});

// Update intake status
router.post('/intakes/:id/status', ensureAuthenticated, (req, res) => {
  const { status, declineReason } = req.body;
  if (declineReason) {
    run('UPDATE intake_submissions SET status = ?, decline_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, declineReason, req.params.id]);
  } else {
    run('UPDATE intake_submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]);
  }
  req.flash('success', 'Intake status updated to ' + status);
  res.redirect('/admin/intakes/' + req.params.id);
});

// Create project + assessment from intake
router.post('/intakes/:id/create-project', ensureAuthenticated, (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) { req.flash('error', 'Intake not found'); return res.redirect('/admin/intakes'); }

    const submittedTech = JSON.parse(intake.technologies || '[]');
    const additionalTech = Array.isArray(req.body.additionalTech) ? req.body.additionalTech : (req.body.additionalTech ? [req.body.additionalTech] : []);
    const allTech = [...new Set([...submittedTech, ...additionalTech])];

    const classification = req.body.overrideClassification || intake.data_classification;
    const appType = req.body.overrideAppType || intake.app_type;
    const confLevel = req.body.overrideClassification || intake.confidentiality_level || classification;
    const intLevel = req.body.overrideIntegrity || intake.integrity_level || 'medium';
    const avaLevel = req.body.overrideAvailability || intake.availability_level || 'medium';
    const isHVA = req.body.overrideHVA ? 1 : (intake.is_hva || 0);

    // Determine profile using the full C/I/A engine (with any admin overrides)
    const profileResult = determineProfile({
      confidentiality: confLevel, integrity: intLevel, availability: avaLevel,
      hasPII: intake.has_pii === 1, isHVA: isHVA === 1,
      hasComplexity: detectComplexity(intake.project_description || '')
    });
    const securityProfile = profileResult.profile.id;

    console.log('[Intake→Project] C/I/A:', confLevel, intLevel, avaLevel,
      'HVA:', isHVA, 'PII:', intake.has_pii,
      '→ Profile:', securityProfile, '(' + profileResult.reason + ')');

    let fullDescription = intake.project_description || '';
    if (intake.interconnections) fullDescription += '\nInterconnections: ' + intake.interconnections;
    if (intake.mobile_access === 'yes') fullDescription += '\nMobile/BYOD access required.';
    if (intake.external_users === 'yes') fullDescription += '\nExternal users will access the system.';
    if (req.body.assessorDescription) fullDescription += '\n' + req.body.assessorDescription;

    const slug = intake.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const projectId = run(
      `INSERT INTO projects (name, slug, description, data_classification,
        confidentiality_level, integrity_level, availability_level, security_profile, is_hva,
        hosting_type, app_type, has_pii, technologies, specifications,
        project_owner_name, project_owner_email,
        project_authority_name, project_authority_email, department, branch, status, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [intake.project_name, slug, fullDescription, classification,
        confLevel, intLevel, avaLevel, securityProfile, isHVA,
        intake.hosting_type, appType,
        intake.has_pii, JSON.stringify(allTech), intake.other_tech || '',
        intake.owner_name, intake.owner_email,
        intake.authority_name || '', intake.authority_email || '',
        intake.department || '', intake.branch || '', 'active', req.user.id]
    );

    // Check if SA&A is required
    const saaCheck = assessSAARequirement({
      dataClassification: classification, confidentiality: confLevel,
      hasPII: intake.has_pii === 1, description: fullDescription, appType
    });

    if (!saaCheck.requiresSAA) {
      // No SA&A needed — redirect to guidance report
      run(`UPDATE intake_submissions SET status = 'accepted', project_id = ?, assessor_notes = ?,
        assessor_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]);

      req.flash('success', `Project "${intake.project_name}" created. No formal SA&A required — a GC Web Guidance Report has been generated.`);
      return res.redirect('/admin/projects/' + projectId + '/guidance');
    }

    const recommended = getRecommendedControls({
      dataClassification: classification, confidentiality: confLevel,
      hostingType: intake.hosting_type, appType, hasPII: intake.has_pii === 1,
      technologies: allTech, description: fullDescription,
      securityProfile: securityProfile, isHVA: isHVA === 1
    });

    // Apply admin filtering options
    let filtered = recommended;
    if (req.body.excludeInherited === '1') {
      filtered = filtered.filter(c => !c.isInherited);
    }
    if (req.body.onlyP1P2 === '1') {
      filtered = filtered.filter(c => c.priority === 'P1' || c.priority === 'P2');
    }

    console.log('[Intake→Project] Profile:', securityProfile,
      'Recommended:', recommended.length,
      'After filters:', filtered.length,
      '(excludeInherited:', req.body.excludeInherited || 'no',
      'onlyP1P2:', req.body.onlyP1P2 || 'no', ')');

    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentId = run(
      `INSERT INTO assessments (project_id, intake_id, type, status, invite_code, created_by) VALUES (?,?,?,?,?,?)`,
      [projectId, intake.id, req.body.assessmentType || 'initial', 'draft', inviteCode, req.user.id]
    );
    copyIntakeAssignmentsToAssessment(intake.id, assessmentId, req.user.id);

    const grouped = groupByFamily(filtered);
    grouped.forEach(family => {
      family.controls.forEach(control => {
        run(
          `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, description,
            tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority, risk_level
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [assessmentId, control.id, control.family, control.familyName, control.title, control.description,
            control.tailoredDescription, control.evidenceGuidance,
            control.isInherited ? 1 : 0, control.inheritedFrom.join(', '), 1, control.priority,
            computeRiskLevel(control)]
        );
      });
    });

    run(`UPDATE intake_submissions SET status = 'accepted', project_id = ?, assessor_notes = ?,
      assessor_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]);

    req.flash('success', `Project "${intake.project_name}" created with ${filtered.length} controls (profile: ${securityProfile}).`);
    res.redirect('/admin/assessments/' + assessmentId);
  } catch (err) {
    console.error('Create project from intake error:', err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/intakes/' + req.params.id);
  }
});

// Download intake attachment
router.get('/intakes/attachment/:id', ensureAuthenticated, (req, res) => {
  const attachment = get('SELECT * FROM intake_attachments WHERE id = ?', [req.params.id]);
  if (!attachment) { req.flash('error', 'Attachment not found'); return res.redirect('/admin/intakes'); }
  res.download(path.join(__dirname, '..', 'uploads', 'intakes', attachment.filename), attachment.original_name);
});

// ══════════════════════════════════════════════════════
// GC WEB GUIDANCE REPORT (no-assessment-required path)
// ══════════════════════════════════════════════════════

router.get('/projects/:projectId/guidance', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  // Get or create guidance report
  let report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  // Parse saved checklist responses
  let responses = {};
  if (report) {
    try { responses = JSON.parse(report.checklist_responses || '{}'); } catch(e) {}
  }

  // Merge responses into guidance items for display
  const guidanceWithResponses = {
    ...GC_WEB_GUIDANCE,
    categories: GC_WEB_GUIDANCE.categories.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({
        ...item,
        status: responses[item.id]?.status || 'pending',
        notes: responses[item.id]?.notes || ''
      }))
    }))
  };

  // Count submitted statuses
  let metCount = 0, inProgressCount = 0, naCount = 0, pendingCount = 0;
  Object.values(responses).forEach(r => {
    if (r.status === 'met') metCount++;
    else if (r.status === 'in-progress') inProgressCount++;
    else if (r.status === 'na') naCount++;
    else pendingCount++;
  });

  res.render('admin/guidance-report', {
    title: 'GC Web Guidance Report',
    isAdmin: true, isProjects: true,
    admin: req.user, project, report,
    guidance: guidanceWithResponses,
    totalRequired, totalRecommended,
    metCount, inProgressCount, naCount, pendingCount
  });
});

router.post('/projects/:projectId/guidance/send-invite', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  let report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);
  const inviteCode = uuidv4().substring(0, 8).toUpperCase();

  if (!report) {
    run(`INSERT INTO guidance_reports (project_id, invite_code, status, created_by) VALUES (?,?,?,?)`,
      [project.id, inviteCode, 'sent', req.user.id]);
  } else {
    run(`UPDATE guidance_reports SET invite_code = ?, status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [report.invite_code || inviteCode, report.id]);
  }

  report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [project.id]);

  // Send email if owner email is available
  if (project.project_owner_email) {
    try {
      emailService.sendMail({
        to: project.project_owner_email,
        subject: `GC Web Guidance Checklist — ${project.name}`,
        text: `You have been invited to complete a GC Web Standards compliance checklist for "${project.name}".\n\nPlease use the following link to access and complete the checklist:\n\n${req.protocol}://${req.get('host')}/guidance/${report.invite_code}\n\nAccess Code: ${report.invite_code}`
      });
    } catch(e) { console.error('Email send error:', e); }
  }

  req.flash('success', `Guidance invite sent! Code: ${report.invite_code}` +
    (project.project_owner_email ? ` — email sent to ${project.project_owner_email}` : ''));
  res.redirect(`/admin/projects/${project.id}/guidance`);
});

router.post('/projects/:projectId/guidance/validate', ensureAuthenticated, (req, res) => {
  const report = get('SELECT * FROM guidance_reports WHERE project_id = ?', [req.params.projectId]);
  if (!report) { req.flash('error', 'Guidance report not found'); return res.redirect('/admin/projects'); }

  const { action, reviewer_notes } = req.body;

  if (action === 'validate') {
    run(`UPDATE guidance_reports SET status = 'validated', reviewer_notes = ?, 
      validated_at = CURRENT_TIMESTAMP, validated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer_notes || '', req.user.id, report.id]);
    req.flash('success', 'Guidance checklist validated and approved.');
  } else if (action === 'return') {
    run(`UPDATE guidance_reports SET status = 'returned', reviewer_notes = ?, 
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer_notes || '', report.id]);
    req.flash('warning', 'Checklist returned to project owner for revision.');
  }

  res.redirect(`/admin/projects/${req.params.projectId}/guidance`);
});

router.post('/projects/:projectId/guidance-notes', ensureAuthenticated, (req, res) => {
  req.flash('success', 'Notes saved.');
  res.redirect(`/admin/projects/${req.params.projectId}/guidance`);
});

router.get('/projects/:projectId/guidance-pdf', ensureAuthenticated, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
  if (!project) { req.flash('error', 'Project not found'); return res.redirect('/admin/projects'); }

  let totalRequired = 0, totalRecommended = 0;
  GC_WEB_GUIDANCE.categories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.required) totalRequired++;
      else totalRecommended++;
    });
  });

  // Generate simple text-based PDF
  let html = `<h1>${project.name}</h1>`;
  html += `<h2>GC Web Standards & Guidance Report</h2>`;
  html += `<p><strong>${GC_WEB_GUIDANCE.summary.title}</strong></p>`;
  html += `<p>${GC_WEB_GUIDANCE.summary.description}</p>`;
  html += `<p><strong>${totalRequired}</strong> required items | <strong>${totalRecommended}</strong> recommended items</p><hr>`;

  GC_WEB_GUIDANCE.categories.forEach(cat => {
    html += `<h3>${cat.title}</h3><p>${cat.description}</p><ul>`;
    cat.items.forEach(item => {
      const level = item.required ? '(REQUIRED)' : '(Recommended)';
      html += `<li>${level} ${item.text}</li>`;
    });
    html += '</ul>';
  });
  html += `<hr><p><em>${GC_WEB_GUIDANCE.summary.footer}</em></p>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-zA-Z0-9]/g,'-')}-GC-Web-Guidance.html"`);
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.name} - GC Web Guidance</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:2rem auto;line-height:1.6}
    h1{color:#26374A}h2,h3{color:#2B4380}ul{margin-bottom:1.5rem}li{margin-bottom:0.5rem}</style></head><body>${html}</body></html>`);
});

// ══════════════════════════════════════════════════════
// CONTROL MANAGEMENT (add/remove/update on assessments)
// ══════════════════════════════════════════════════════

router.get('/assessments/:id/manage-controls', ensureAuthenticated, (req, res) => {
  const assessment = get(`
    SELECT a.*, p.name as project_name, p.data_classification, p.app_type
    FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
  `, [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  // Current controls in this assessment
  const currentControls = all('SELECT * FROM assessment_controls WHERE assessment_id = ? ORDER BY family, control_id', [assessment.id]);
  const currentIds = new Set(currentControls.map(c => c.control_id));

  // Group current controls by family
  const currentGrouped = {};
  currentControls.forEach(c => {
    if (!currentGrouped[c.family]) {
      currentGrouped[c.family] = { code: c.family, name: c.family_name || CONTROL_FAMILIES[c.family], controls: [] };
    }
    currentGrouped[c.family].controls.push(c);
  });
  const currentFamilies = Object.values(currentGrouped);

  // All ITSG-33 controls grouped by family, marking which are already added
  const allControlsMarked = CONTROLS.map(c => ({
    ...c,
    familyName: CONTROL_FAMILIES[c.family],
    alreadyAdded: currentIds.has(c.id)
  }));
  const allGrouped = {};
  allControlsMarked.forEach(c => {
    if (!allGrouped[c.family]) {
      allGrouped[c.family] = { code: c.family, name: CONTROL_FAMILIES[c.family], controls: [] };
    }
    allGrouped[c.family].controls.push(c);
  });
  const allFamilies = Object.values(allGrouped);

  res.render('admin/manage-controls', {
    title: 'Manage Controls', isAdmin: true, isAssessments: true,
    admin: req.user, assessment,
    currentFamilies, currentCount: currentControls.length,
    allFamilies, availableCount: CONTROLS.length - currentIds.size
  });
});

// Add controls to an existing assessment
router.post('/assessments/:id/add-controls', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const addIds = req.body.add_control_ids || [];
  const idList = Array.isArray(addIds) ? addIds : [addIds];

  // Get existing control IDs to avoid duplicates
  const existing = new Set(all('SELECT control_id FROM assessment_controls WHERE assessment_id = ?', [assessment.id]).map(c => c.control_id));

  const statements = [];
  idList.forEach(cid => {
    if (existing.has(cid)) return; // skip duplicates
    const ctrl = CONTROLS.find(c => c.id === cid);
    if (!ctrl) return;
    const family = cid.split('-')[0];
    statements.push({
      sql: `INSERT INTO assessment_controls (assessment_id, control_id, family, family_name, title, 
        description, control_guidance, tailored_description, evidence_guidance, is_inherited, inherited_from, is_applicable, priority, risk_level, framework, guidance_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [assessment.id, cid, family, CONTROL_FAMILIES[family] || family,
        ctrl.title, ctrl.description, ctrl.evidenceGuidance || '', '', ctrl.evidenceGuidance || '', 0, '', 1, ctrl.priority,
        computeRiskLevel({ family, priority: ctrl.priority || 'P1' }), 'ITSG-33', 'catalog']
    });
  });

  if (statements.length > 0) {
    runBatch(statements);
    req.flash('success', `Added ${statements.length} control(s) to the assessment.`);
  } else {
    req.flash('info', 'No new controls to add.');
  }
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

// Remove a control from an assessment
router.post('/assessments/:id/remove-control/:controlId', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const control = get('SELECT * FROM assessment_controls WHERE id = ? AND assessment_id = ?',
    [req.params.controlId, assessment.id]);
  if (!control) { req.flash('error', 'Control not found'); return res.redirect(`/admin/assessments/${assessment.id}/manage-controls`); }

  run('DELETE FROM assessment_controls WHERE id = ? AND assessment_id = ?', [req.params.controlId, assessment.id]);
  req.flash('success', `Removed ${control.control_id} — ${control.title}`);
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

// Update a control on an assessment (tailored description, guidance, applicability, inheritance)
router.post('/assessments/:id/update-control/:controlId', ensureAuthenticated, (req, res) => {
  const assessment = get('SELECT * FROM assessments WHERE id = ?', [req.params.id]);
  if (!assessment) { req.flash('error', 'Assessment not found'); return res.redirect('/admin/assessments'); }

  const { tailored_description, evidence_guidance, control_guidance, assessor_notes, is_applicable, is_inherited, inherited_from, risk_level } = req.body;
  run(`UPDATE assessment_controls SET 
    tailored_description = ?, evidence_guidance = ?, control_guidance = ?, assessor_notes = ?, is_applicable = ?, 
    is_inherited = ?, inherited_from = ?, risk_level = ?, guidance_source = CASE WHEN guidance_source = 'ai-generated' THEN 'edited-after-ai' ELSE guidance_source END,
    guidance_edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND assessment_id = ?`,
    [tailored_description || '', evidence_guidance || '', control_guidance || '', assessor_notes || '',
     is_applicable === '0' ? 0 : 1, is_inherited === '1' ? 1 : 0,
     inherited_from || '', risk_level || 'medium', req.params.controlId, assessment.id]);

  req.flash('success', 'Control updated.');
  res.redirect(`/admin/assessments/${assessment.id}/manage-controls`);
});

module.exports = router;
