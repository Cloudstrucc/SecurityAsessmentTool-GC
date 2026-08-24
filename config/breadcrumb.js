/**
 * Breadcrumb trail for signed-in /admin pages. Rendered under the app menu
 * (chip style — matches the approved mockup). The leaf is the page title; the
 * parent crumbs come from the URL. Section labels are localized via req.t.
 *
 * render(req, title) → HTML string (empty string when no breadcrumb applies).
 */
const SECTIONS = {
  dashboard:           { key: 'nav.dashboard',      href: '/admin/dashboard',         icon: 'bi-speedometer2' },
  projects:            { key: 'nav.projects',       href: '/admin/projects',          icon: 'bi-folder2-open' },
  assessments:         { key: 'nav.assessments',    href: '/admin/assessments',       icon: 'bi-clipboard-check' },
  intakes:             { key: 'nav.intakes',        href: '/admin/intakes',           icon: 'bi-inbox' },
  'self-assessments':  { key: 'nav.preAssessments', href: '/admin/self-assessments',  icon: 'bi-clipboard2-pulse' },
  teams:               { key: 'nav.team',           href: '/admin/teams',             icon: 'bi-people' },
  'security-controls': { key: 'nav.controls',       href: '/admin/security-controls', icon: 'bi-shield-check' },
  reports:             { key: 'navbar.reports',     href: '/admin/reports',           icon: 'bi-file-earmark-bar-graph' },
  'decision-packages': { key: 'dp.title',           href: null,                       icon: 'bi-award' },
  settings:            { key: 'nav.settings',       href: '/admin/settings',          icon: 'bi-gear' },
  organization:        { key: 'navbar.orgSettings', href: '/admin/organization',      icon: 'bi-sliders' },
  licensing:           { key: 'navbar.licensing',   href: '/admin/licensing',         icon: 'bi-person-badge' },
  'comp-codes':        { key: 'navbar.compCodes',   href: '/admin/comp-codes',        icon: 'bi-ticket-perforated' },
  notifications:       { key: 'navbar.notifications', href: '/admin/notifications',   icon: 'bi-bell' },
  help:                { key: 'nav.help',           href: '/admin/help',              icon: 'bi-question-circle' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(req, title) {
  if (!req) return '';
  // Inside the mounted /admin router req.path is stripped to e.g. "/dashboard";
  // req.originalUrl keeps the full "/admin/dashboard". Use it, minus any query.
  const path = String(req.originalUrl || req.path || '').split('?')[0].split('#')[0];
  if (!path.startsWith('/admin/')) return '';
  const t = (k) => (req.t ? req.t(k) : k);
  const segs = path.split('/').filter(Boolean); // ['admin', section, ...rest]
  const section = segs[1];
  const sec = SECTIONS[section];
  if (!sec) return ''; // unknown admin page → no breadcrumb (safe default)

  const sep = '<li class="sep" aria-hidden="true">›</li>';
  const home = `<li><a href="/admin/dashboard"><i class="bi bi-house-door" aria-hidden="true"></i> ${esc(t('navbar.home'))}</a></li>`;
  const crumbs = [home];

  const isDetail = segs.length > 2; // something after /admin/<section>
  const leafLabel = esc(title || t(sec.key));
  const leafIcon = sec.icon;

  if (section === 'dashboard') {
    // Dashboard is home — show a single leaf chip.
    return wrap(`<li class="cur"><i class="bi ${leafIcon}" aria-hidden="true"></i> ${leafLabel}</li>`);
  }

  if (isDetail) {
    // Home › Section(link) › Title(chip)
    const secCrumb = sec.href
      ? `<li><a href="${sec.href}"><i class="bi ${sec.icon}" aria-hidden="true"></i> ${esc(t(sec.key))}</a></li>`
      : `<li><i class="bi ${sec.icon}" aria-hidden="true"></i> ${esc(t(sec.key))}</li>`;
    crumbs.push(sep, secCrumb, sep,
      `<li class="cur"><i class="bi bi-file-earmark-text" aria-hidden="true"></i> ${leafLabel}</li>`);
  } else {
    // Home › Section(chip)  (a list page)
    crumbs.push(sep, `<li class="cur"><i class="bi ${sec.icon}" aria-hidden="true"></i> ${esc(t(sec.key))}</li>`);
  }
  return wrap(crumbs.join(''));
}

function wrap(inner) {
  return `<nav class="gc-breadcrumb" aria-label="Breadcrumb"><ol>${inner}</ol></nav>`;
}

module.exports = { render, SECTIONS };
