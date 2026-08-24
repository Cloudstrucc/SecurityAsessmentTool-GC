/**
 * Report branding (Phase B).
 *
 * A rendered report resolves its branding in this order, most specific first:
 *
 *     project row  →  organization row  →  platform default
 *
 * Any field left blank at a more specific level falls through to the next, so an
 * org can set a logo and colours once and every project inherits them, while a
 * single project delivered for a different client can override just the logo.
 *
 * Branding is stored in `report_branding`: `scope_type` is 'project' (keyed by
 * project_id) or 'org' (keyed by organization_id). The platform default is the
 * Vanguard Cloud Services / Aegis SA palette and is never stored in the table.
 */
const { get, run } = require('../models/database');

// The platform default — used when neither the project nor the org has branding.
// Matches the Aegis SA app chrome (see views/layouts/main.hbs --cs-* tokens).
const PLATFORM_DEFAULT = {
  scope_type: 'platform',
  organization_name: 'Vanguard Cloud Services',
  product_name: 'Aegis SA',
  logo_filename: null,
  logo_original_name: null,
  logo_mime_type: null,
  report_subtitle: '',
  classification_label: '',
  assessor_company_name: '',
  primary_color: '#143453',   // --cs-blue (ink)
  accent_color: '#4d9fe0',    // --cs-accent
  header_text: '',
  footer_text: 'Vanguard Cloud Services · Aegis SA'
};

// Fields that fall through the resolution chain when blank.
const INHERIT = ['organization_name', 'logo_filename', 'logo_original_name', 'logo_mime_type',
  'report_subtitle', 'classification_label', 'assessor_company_name', 'primary_color',
  'accent_color', 'header_text', 'footer_text'];

const HEX = /^#[0-9a-fA-F]{6}$/;
function safeColor(value, fallback) {
  return (typeof value === 'string' && HEX.test(value.trim())) ? value.trim() : fallback;
}

function getProjectRow(projectId) {
  if (!projectId) return null;
  return get(`SELECT * FROM report_branding WHERE scope_type = 'project' AND project_id = ?
              ORDER BY updated_at DESC, created_at DESC LIMIT 1`, [projectId]) || null;
}

function getOrgRow(orgId) {
  if (!orgId) return null;
  return get(`SELECT * FROM report_branding WHERE scope_type = 'org' AND organization_id = ?
              ORDER BY updated_at DESC, created_at DESC LIMIT 1`, [orgId]) || null;
}

/**
 * Resolve the effective branding for a report.
 * @param {object} opts { projectId, organizationId }
 * @returns {object} a fully-populated branding object (never null)
 */
function resolve({ projectId, organizationId } = {}) {
  const project = getProjectRow(projectId) || {};
  const org = getOrgRow(organizationId) || {};
  const out = { ...PLATFORM_DEFAULT };
  // A logo is a set of three columns that must move together; treat it atomically.
  const takeLogo = (src) => {
    if (src && src.logo_filename) {
      out.logo_filename = src.logo_filename;
      out.logo_original_name = src.logo_original_name || null;
      out.logo_mime_type = src.logo_mime_type || null;
      out.logo_scope = src.scope_type;
      return true;
    }
    return false;
  };
  // Most specific logo wins; nothing means the platform (no logo → wordmark text).
  if (!takeLogo(project)) takeLogo(org);

  INHERIT.filter(f => !f.startsWith('logo_')).forEach(field => {
    const p = project[field], o = org[field];
    if (p !== undefined && p !== null && String(p).trim() !== '') out[field] = p;
    else if (o !== undefined && o !== null && String(o).trim() !== '') out[field] = o;
    // else keep platform default
  });

  out.primary_color = safeColor(out.primary_color, PLATFORM_DEFAULT.primary_color);
  out.accent_color = safeColor(out.accent_color, PLATFORM_DEFAULT.accent_color);
  // Where the effective branding came from — useful for the "using org defaults" hint.
  out.resolved_from = getProjectRow(projectId) ? 'project' : (getOrgRow(organizationId) ? 'org' : 'platform');
  return out;
}

/** Upsert branding for a scope. `scope` is 'project' or 'org'; `key` the id. */
function save(scope, key, fields, userId) {
  const col = scope === 'org' ? 'organization_id' : 'project_id';
  const existing = scope === 'org' ? getOrgRow(key) : getProjectRow(key);
  const vals = {
    organization_name: fields.organization_name || null,
    report_subtitle: fields.report_subtitle || null,
    classification_label: fields.classification_label || null,
    assessor_company_name: fields.assessor_company_name || null,
    primary_color: safeColor(fields.primary_color, null),
    accent_color: safeColor(fields.accent_color, null),
    header_text: fields.header_text || null,
    footer_text: fields.footer_text || null
  };
  // Logo columns are only touched when a new upload is supplied.
  const logo = fields.logo_filename ? {
    logo_filename: fields.logo_filename,
    logo_original_name: fields.logo_original_name || null,
    logo_mime_type: fields.logo_mime_type || null
  } : null;

  if (existing) {
    const sets = Object.keys(vals).map(k => `${k} = ?`);
    const params = Object.values(vals);
    if (logo) {
      sets.push('logo_filename = ?', 'logo_original_name = ?', 'logo_mime_type = ?');
      params.push(logo.logo_filename, logo.logo_original_name, logo.logo_mime_type);
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(existing.id);
    run(`UPDATE report_branding SET ${sets.join(', ')} WHERE id = ?`, params);
    return existing.id;
  }
  const cols = ['scope_type', col, ...Object.keys(vals), 'created_by'];
  const params = [scope === 'org' ? 'org' : 'project', key, ...Object.values(vals), userId || null];
  if (logo) {
    cols.splice(2, 0, 'logo_filename', 'logo_original_name', 'logo_mime_type');
    params.splice(2, 0, logo.logo_filename, logo.logo_original_name, logo.logo_mime_type);
  }
  return run(`INSERT INTO report_branding (${cols.join(', ')})
              VALUES (${cols.map(() => '?').join(', ')})`, params);
}

/** Clear branding for a scope (the "delete" in CRUD) — reverts to inherited/default. */
function clear(scope, key) {
  const col = scope === 'org' ? 'organization_id' : 'project_id';
  run(`DELETE FROM report_branding WHERE scope_type = ? AND ${col} = ?`,
    [scope === 'org' ? 'org' : 'project', key]);
}

/** Just remove the logo, keeping text/colour branding. */
function clearLogo(scope, key) {
  const col = scope === 'org' ? 'organization_id' : 'project_id';
  run(`UPDATE report_branding SET logo_filename = NULL, logo_original_name = NULL,
       logo_mime_type = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE scope_type = ? AND ${col} = ?`, [scope === 'org' ? 'org' : 'project', key]);
}

module.exports = {
  PLATFORM_DEFAULT, resolve, save, clear, clearLogo,
  getProjectRow, getOrgRow, safeColor
};
