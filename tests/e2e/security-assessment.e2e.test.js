const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateSync: generateTotp } = require('otplib');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-e2e-'));
const PORT = String(43000 + Math.floor(Math.random() * 1000));
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(TMP, 'data', 'sa-tool.db');
const TEST_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
// Portable, repo-bundled fixture (was a hardcoded developer-local path).
const SADD_PATH = path.join(__dirname, 'fixtures', 'SADD.html');

const USERS = {
  assessor: { email: 'e2e.assessor@example.test', password: 'TestPassword123!' },
  client: { email: 'e2e.client@example.test', password: 'TestPassword123!' },
  needsMfa: { email: 'e2e.needs-mfa@example.test', password: 'TestPassword123!' },
  breakGlass: { email: 'e2e.breakglass@example.test', password: 'BreakGlassPassword123!' }
};

let server;
let serverOutput = '';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(response) {
    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    setCookies.forEach(cookie => {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    });
  }

  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

function env() {
  return {
    ...process.env,
    NODE_ENV: 'test',
    PORT,
    DB_PATH,
    DATA_DIR: path.dirname(DB_PATH),
    SESSION_SECRET: 'e2e-session-secret',
    // The suite exercises the full TOTP/passkey sign-in flow, so turn MFA on for
    // the test server. (App default is MFA_ENABLED off — the global kill-switch.)
    MFA_ENABLED: 'true',
    ADMIN_EMAIL: 'seed.admin@example.test',
    ADMIN_PASSWORD: 'SeedAdminPassword123!',
    SMTP_HOST: '',
    ANTHROPIC_API_KEY: ''
  };
}

function runUserScript(args) {
  execFileSync('node', ['scripts/manage-users.js', ...args], {
    cwd: ROOT,
    env: env(),
    stdio: 'pipe'
  });
}

async function request(jar, method, url, { form, json, body: rawBody, headers: extraHeaders, redirect = 'manual' } = {}) {
  const headers = { ...(extraHeaders || {}) };
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (json) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (rawBody) {
    body = rawBody;
  }
  const cookie = jar?.header();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(BASE_URL + url, { method, headers, body, redirect });
  jar?.store(response);
  return response;
}

async function getText(jar, url) {
  const response = await request(jar, 'GET', url, { redirect: 'follow' });
  return { response, text: await response.text() };
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (err) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Server did not start in time.\n${serverOutput}`);
}

async function loginAdminWithTotp() {
  const jar = new CookieJar();
  const step1 = await request(jar, 'POST', '/admin/login', {
    form: { email: USERS.assessor.email, password: USERS.assessor.password }
  });
  const step1Text = await step1.text();
  assert.match(step1Text, /Verify MFA|Authentication Code/);

  const step2 = await request(jar, 'POST', '/admin/login', {
    form: { _mfa_step: '1', token: generateTotp({ secret: TEST_SECRET }) }
  });
  assert.equal(step2.status, 302);
  assert.equal(step2.headers.get('location'), '/admin/dashboard');
  return jar;
}

async function loginClientWithTotp() {
  const jar = new CookieJar();
  const step1 = await request(jar, 'POST', '/client/login', {
    form: { email: USERS.client.email, password: USERS.client.password }
  });
  const step1Text = await step1.text();
  assert.match(step1Text, /Verify MFA|Authentication Code/);

  const step2 = await request(jar, 'POST', '/client/login/mfa', {
    form: { token: generateTotp({ secret: TEST_SECRET }) }
  });
  assert.equal(step2.status, 302);
  return jar;
}

async function createAdminProject(jar, name = 'E2E Workflow Project') {
  const response = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name,
      description: 'A protected B Azure case management system with APIs, audit logging, identity controls, and supporting documentation.',
      department: 'E2E Department',
      branch: 'Security Testing',
      data_classification: 'protected-b',
      confidentiality_level: 'protected-b',
      integrity_level: 'medium',
      availability_level: 'medium',
      hosting_type: 'azure',
      app_type: 'internal',
      has_pii: '1',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test',
      technologies: 'azure'
    }
  });
  assert.equal(response.status, 302);
  const projectPath = response.headers.get('location');
  assert.match(projectPath, /^\/admin\/projects\/\d+$/);
  return { projectPath, projectId: projectPath.match(/(\d+)$/)[1] };
}

async function createSingleControlAssessment(jar, projectId) {
  const response = await request(jar, 'POST', `/admin/projects/${projectId}/assessments/new`, {
    form: {
      control_ids: 'AC-2',
      'title_AC-2': 'Account Management',
      'desc_AC-2': 'Access Control: Account Management',
      'control_guidance_AC-2': 'Review account lifecycle governance, approvals, and monitoring.',
      'priority_AC-2': 'P1',
      'tailored[AC-2]': 'Tailored account-management control.',
      'guidance[AC-2]': 'Provide account inventory and lifecycle evidence.',
      'applicable[AC-2]': '1'
    }
  });
  assert.equal(response.status, 302);
  const assessmentPath = response.headers.get('location');
  assert.match(assessmentPath, /^\/admin\/assessments\/\d+$/);
  return { assessmentPath, assessmentId: assessmentPath.match(/(\d+)$/)[1] };
}

async function uploadSaddDocument(jar, projectId) {
  assert.ok(fs.existsSync(SADD_PATH), `SADD test document missing at ${SADD_PATH}`);
  const formData = new FormData();
  formData.append('documents', new Blob([fs.readFileSync(SADD_PATH)], { type: 'text/html' }), 'SADD.html');
  const upload = await request(jar, 'POST', `/admin/projects/${projectId}/documents`, { body: formData });
  assert.equal(upload.status, 302);
  const detail = await getText(jar, `/admin/projects/${projectId}`);
  assert.match(detail.text, /SADD\.html/);
  const docId = detail.text.match(/\/admin\/projects\/\d+\/documents\/(\d+)\/download/)?.[1];
  assert.ok(docId, 'uploaded document id should be present in project dashboard');
  return docId;
}

async function assertPdfDownload(jar, url, label) {
  const response = await request(jar, 'GET', url, { redirect: 'manual' });
  assert.equal(response.status, 200, `${label} should download`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF', `${label} should be a PDF`);
  assert.ok(buffer.length > 1500, `${label} should have report content`);
  const pageCount = (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  assert.ok(pageCount >= 1, `${label} should have at least one page`);
  assert.ok(pageCount < 25, `${label} should not generate excessive blank pages for the one-control fixture`);
  return buffer;
}

test.before(async () => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  runUserScript(['test-assessor', '--email', USERS.assessor.email, '--password', USERS.assessor.password, '--totp-secret', TEST_SECRET]);
  runUserScript(['test-client', '--email', USERS.client.email, '--password', USERS.client.password, '--totp-secret', TEST_SECRET]);
  runUserScript(['admin', '--email', USERS.needsMfa.email, '--password', USERS.needsMfa.password, '--disable-mfa']);
  runUserScript(['break-glass', '--email', USERS.breakGlass.email, '--password', USERS.breakGlass.password]);

  server = spawn('node', ['app.js'], {
    cwd: ROOT,
    env: env(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  await waitForServer();
});

test.after(() => {
  if (server && !server.killed) server.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('admin without MFA signs in directly (MFA is optional)', async () => {
  const jar = new CookieJar();
  const response = await request(jar, 'POST', '/admin/login', {
    form: { email: USERS.needsMfa.email, password: USERS.needsMfa.password }
  });
  assert.equal(response.status, 302);
  // MFA is no longer forced — a user without MFA lands on the dashboard.
  assert.equal(response.headers.get('location'), '/admin/dashboard');
  const dashboard = await getText(jar, '/admin/dashboard');
  assert.equal(dashboard.response.status, 200);
  assert.match(dashboard.text, /Dashboard/);
});

test('break-glass admin can sign in with password only', async () => {
  const jar = new CookieJar();
  const response = await request(jar, 'POST', '/admin/login', {
    form: { email: USERS.breakGlass.email, password: USERS.breakGlass.password }
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/dashboard');

  const dashboard = await getText(jar, '/admin/dashboard');
  assert.equal(dashboard.response.status, 200);
  assert.match(dashboard.text, /Dashboard/);
});

test('MFA-enabled assessor sees passkey setup while TOTP remains available', async () => {
  const jar = await loginAdminWithTotp();
  const page = await getText(jar, '/admin/passkey-setup');
  assert.equal(page.response.status, 200);
  assert.match(page.text, /Register a Passkey/);
  assert.match(page.text, /TOTP remains available/);
});

test('authenticated users can open the help guide', async () => {
  const adminJar = await loginAdminWithTotp();
  const adminHelp = await getText(adminJar, '/admin/help');
  assert.equal(adminHelp.response.status, 200);
  assert.match(adminHelp.text, /Security Assessment &amp; Authorization Tool Guide/);
  assert.match(adminHelp.text, /Guide Pages/);

  const clientJar = await loginClientWithTotp();
  const clientHelp = await getText(clientJar, '/help');
  assert.equal(clientHelp.response.status, 200);
  assert.match(clientHelp.text, /Client Evidence Workflow/);
});

test('client can create an intake after TOTP login', async () => {
  const jar = await loginClientWithTotp();
  const response = await request(jar, 'POST', '/intake', {
    form: {
      projectName: 'E2E Client Intake',
      projectDescription: 'A protected B case management system for end-to-end intake testing.',
      department: 'E2E Department',
      branch: 'Security Testing',
      appType: 'internal',
      confidentialityLevel: 'protected-b',
      integrityLevel: 'medium',
      availabilityLevel: 'medium',
      hostingType: 'azure',
      ownerName: 'E2E Client',
      ownerEmail: USERS.client.email
    },
    redirect: 'follow'
  });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /Intake Submitted|INT-/);
});

test('admin can create a project and associated project intake', async () => {
  const jar = await loginAdminWithTotp();
  const newProjectPage = await getText(jar, '/admin/projects/new');
  assert.match(newProjectPage.text, /AI-Assisted Project Intake/);
  assert.match(newProjectPage.text, /aiDocUpload/);
  assert.match(newProjectPage.text, /aiPlainDesc/);

  const response = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name: 'E2E Admin Project',
      description: 'A protected B administrative project used for integration testing.',
      department: 'E2E Department',
      branch: 'Security Testing',
      data_classification: 'protected-b',
      confidentiality_level: 'protected-b',
      integrity_level: 'medium',
      availability_level: 'medium',
      hosting_type: 'azure',
      app_type: 'internal',
      has_pii: '1',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test',
      technologies: 'azure'
    }
  });
  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  assert.match(location, /^\/admin\/projects\/\d+$/);

  const detail = await getText(jar, location);
  assert.match(detail.text, /E2E Admin Project/);
  assert.match(detail.text, /Project Intake/);
  assert.match(detail.text, /INT-/);
});

test('admin project intake updates an existing project instead of creating a duplicate', async () => {
  const jar = await loginAdminWithTotp();
  const first = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name: 'E2E Duplicate Project',
      description: 'Initial project intake description.',
      data_classification: 'protected-b',
      confidentiality_level: 'protected-b',
      integrity_level: 'medium',
      availability_level: 'medium',
      hosting_type: 'azure',
      hosting_region: 'canada-only',
      app_type: 'internal',
      has_pii: '1',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test',
      technologies: 'azure'
    }
  });
  const firstLocation = first.headers.get('location');
  assert.match(firstLocation, /^\/admin\/projects\/\d+$/);

  const second = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name: 'E2E Duplicate Project',
      description: 'Updated project intake description from a second intake.',
      data_classification: 'protected-b',
      confidentiality_level: 'protected-b',
      integrity_level: 'high',
      availability_level: 'medium',
      hosting_type: 'azure',
      hosting_region: 'canada-only',
      app_type: 'internal',
      has_pii: '1',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test',
      technologies: 'azure'
    }
  });
  const secondLocation = second.headers.get('location');
  assert.equal(secondLocation, firstLocation);

  const detail = await getText(jar, secondLocation);
  assert.match(detail.text, /Updated project intake description/);
  assert.match(detail.text, /Project Intake/);
});

test('admin can create an assessment linked to the project intake', async () => {
  const jar = await loginAdminWithTotp();
  const projectCreate = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name: 'E2E Assessment Project',
      description: 'A protected B project used for assessment package integration testing.',
      data_classification: 'protected-b',
      confidentiality_level: 'protected-b',
      integrity_level: 'medium',
      availability_level: 'medium',
      hosting_type: 'azure',
      app_type: 'internal',
      has_pii: '1',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test',
      technologies: 'azure'
    }
  });
  const projectPath = projectCreate.headers.get('location');
  const projectId = projectPath.match(/(\d+)$/)[1];

  const assessmentCreate = await request(jar, 'POST', `/admin/projects/${projectId}/assessments/new`, {
    form: {
      control_ids: 'AC-2',
      'title_AC-2': 'Account Management',
      'desc_AC-2': 'Access Control: Account Management',
      'priority_AC-2': 'P1',
      'tailored[AC-2]': 'Tailored account-management control.',
      'guidance[AC-2]': 'Provide account inventory and lifecycle evidence.',
      'applicable[AC-2]': '1'
    }
  });
  assert.equal(assessmentCreate.status, 302);
  const assessmentPath = assessmentCreate.headers.get('location');
  assert.match(assessmentPath, /^\/admin\/assessments\/\d+$/);

  const assessmentDetail = await getText(jar, assessmentPath);
  assert.match(assessmentDetail.text, /E2E Assessment Project/);
  assert.match(assessmentDetail.text, /Intake/);
  assert.match(assessmentDetail.text, /INT-/);
  assert.match(assessmentDetail.text, /AC-2/);
});

test('admin can upload SADD documentation to a project and download it later', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E SADD Documentation Project');
  const docId = await uploadSaddDocument(jar, projectId);

  const download = await request(jar, 'GET', `/admin/projects/${projectId}/documents/${docId}/download`, { redirect: 'manual' });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /SADD\.html/);
  assert.match(await download.text(), /SADD.*ESign Elections Canada/i);
});

test('admin can tailor assessment controls and persist rich control fields', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Tailoring Project');
  const { assessmentPath } = await createSingleControlAssessment(jar, projectId);

  const tailorPage = await getText(jar, `${assessmentPath}?tailor=1`);
  assert.equal(tailorPage.response.status, 200);
  assert.match(tailorPage.text, /Tailoring mode enabled/);
  const controlDbId = tailorPage.text.match(/name="control_db_ids" value="(\d+)"/)?.[1];
  assert.ok(controlDbId, 'control db id should be present in tailoring form');

  const save = await request(jar, 'POST', `${assessmentPath}/tailoring`, {
    form: {
      control_db_ids: controlDbId,
      [`title_${controlDbId}`]: 'Account Management - Tailored',
      [`description_${controlDbId}`]: 'Tailored description for account lifecycle governance.',
      [`control_guidance_${controlDbId}`]: 'Assess account request, approval, review, and disablement practices.',
      [`tailored_description_${controlDbId}`]: 'Apply account governance to project administrators and privileged service accounts.',
      [`evidence_guidance_${controlDbId}`]: 'Provide SSO group exports, joiner mover leaver records, and quarterly access review evidence.',
      [`evidence_text_${controlDbId}`]: 'Evidence collected from identity governance export.',
      [`evidence_status_${controlDbId}`]: 'provided',
      [`assessor_notes_${controlDbId}`]: 'Assessor note persisted from tailoring mode.',
      [`audit_comments_${controlDbId}`]: 'Audit comment persisted from tailoring mode.',
      [`audit_result_${controlDbId}`]: 'partially-met',
      [`is_applicable_${controlDbId}`]: '1',
      [`is_inherited_${controlDbId}`]: '0',
      [`inherited_from_${controlDbId}`]: '',
      [`priority_${controlDbId}`]: 'P1',
      [`risk_level_${controlDbId}`]: 'high',
      [`guidance_source_${controlDbId}`]: 'manual'
    }
  });
  assert.equal(save.status, 302);

  const refreshed = await getText(jar, assessmentPath);
  assert.match(refreshed.text, /Account Management - Tailored/);
  assert.match(refreshed.text, /Tailored description for account lifecycle governance/);
  assert.match(refreshed.text, /Provide SSO group exports/);
  assert.match(refreshed.text, /Evidence collected from identity governance export/);
  assert.match(refreshed.text, /Assessor note persisted from tailoring mode/);
  assert.match(refreshed.text, /partially-met/);
});

test('admin can generate previewed AI evidence guidance from uploaded SADD documentation', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E AI Guidance Project');
  const docId = await uploadSaddDocument(jar, projectId);
  const { assessmentPath, assessmentId } = await createSingleControlAssessment(jar, projectId);

  const detail = await getText(jar, assessmentPath);
  const controlDbId = detail.text.match(/id="ai-ev-btn-(\d+)"/)?.[1];
  assert.ok(controlDbId, 'control db id should be present for AI guidance');

  const preview = await request(jar, 'POST', `/admin/assessments/${assessmentId}/ai/document-guidance`, {
    json: { document_ids: [docId], control_db_ids: [controlDbId] }
  });
  assert.equal(preview.status, 200);
  const previewData = await preview.json();
  assert.equal(previewData.success, true);
  assert.equal(previewData.guidance.length, 1);
  assert.match(previewData.guidance[0].guidance, /selected project documentation/);

  const save = await request(jar, 'POST', `/admin/assessments/${assessmentId}/ai/document-guidance/save`, {
    json: {
      items: [{
        controlDbId,
        guidance: previewData.guidance[0].guidance + '\nSaved during E2E AI guidance test.',
        confirmOverwrite: true
      }]
    }
  });
  assert.equal(save.status, 200);
  const saveData = await save.json();
  assert.equal(saveData.success, true);
  assert.equal(saveData.saved, 1);

  const refreshed = await getText(jar, assessmentPath);
  assert.match(refreshed.text, /Saved during E2E AI guidance test/);
  assert.match(refreshed.text, /ai-generated/);
});

test('admin can export assessment, controls and full project PDFs', async () => {
  // Authorization PDFs now come from decision packages (covered by their own test);
  // the legacy /admin/ato editor and its export were retired with ato_records.
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E PDF Export Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  await assertPdfDownload(jar, `/admin/assessments/${assessmentId}/export-pdf`, 'assessment PDF');
  await assertPdfDownload(jar, `/admin/projects/${projectId}/controls.pdf`, 'controls PDF');
  await assertPdfDownload(jar, `/admin/projects/${projectId}/report.pdf`, 'full project PDF');
});

test('unified reporting: hub, per-format downloads and branding all work', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Reporting Engine Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  // Report hub lists the project.
  const hub = (await getText(jar, '/admin/reports')).text;
  assert.ok(hub.includes('E2E Reporting Engine Project'), 'hub lists the project');

  // On-screen view renders and points its iframe at the .html route.
  const view = (await getText(jar, `/admin/reports/assessment/${assessmentId}`)).text;
  assert.ok(view.includes(`/admin/reports/assessment/${assessmentId}.html`), 'view embeds the html preview');

  // HTML download.
  const htmlRes = await request(jar, 'GET', `/admin/reports/assessment/${assessmentId}.html`, { redirect: 'manual' });
  assert.equal(htmlRes.status, 200, 'html report downloads');
  assert.ok((htmlRes.headers.get('content-type') || '').includes('text/html'));
  const htmlBody = await htmlRes.text();
  assert.ok(/<!doctype html>/i.test(htmlBody), 'html report is a full document');

  // PDF download.
  await assertPdfDownload(jar, `/admin/reports/assessment/${assessmentId}.pdf`, 'reporting assessment PDF');

  // DOCX download — a .docx is a ZIP, so it starts with the PK signature.
  const docxRes = await request(jar, 'GET', `/admin/reports/assessment/${assessmentId}.docx`, { redirect: 'manual' });
  assert.equal(docxRes.status, 200, 'docx downloads');
  const docxBuf = Buffer.from(await docxRes.arrayBuffer());
  assert.equal(docxBuf.subarray(0, 2).toString('latin1'), 'PK', 'docx is a zip/OOXML file');

  // Markdown download.
  const mdRes = await request(jar, 'GET', `/admin/reports/assessment/${assessmentId}.md`, { redirect: 'manual' });
  assert.equal(mdRes.status, 200, 'markdown downloads');
  const mdBody = await mdRes.text();
  assert.ok(mdBody.includes('# '), 'markdown has a heading');

  // Portfolio (admin-only) renders as PDF.
  await assertPdfDownload(jar, '/admin/reports/portfolio/all.pdf', 'portfolio PDF');

  // Project-level branding: set an accent colour + footer, then the HTML report
  // must carry them (exercises the project → org → platform resolution chain).
  await request(jar, 'POST', `/admin/projects/${projectId}/branding`, {
    form: { organization_name: 'E2E Health Group', primary_color: '#1f4d4a', accent_color: '#2f8f86', footer_text: 'E2E footer' }
  });
  const branded = (await getText(jar, `/admin/reports/assessment/${assessmentId}.html`)).text;
  assert.ok(branded.includes('#2f8f86'), 'report picks up project accent colour');
  assert.ok(branded.includes('E2E footer'), 'report picks up project footer text');
});

test('reporting access: an unassigned client cannot download another tenant report', async () => {
  const admin = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(admin, 'E2E Reporting Access Project');
  const { assessmentId } = await createSingleControlAssessment(admin, projectId);

  const client = await loginClientWithTotp();
  const res = await request(client, 'GET', `/admin/reports/assessment/${assessmentId}.pdf`, { redirect: 'manual' });
  // Not a 200 PDF: unassigned users are redirected away.
  assert.notEqual(res.status, 200, 'unassigned client is refused the report');
});

test('the retired legacy ATO editor is gone', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Retired ATO Editor Project');
  for (const url of [`/admin/projects/${projectId}/ato/new`, '/admin/ato/1']) {
    const res = await request(jar, 'GET', url, { redirect: 'manual' });
    assert.equal(res.status, 404, `${url} should no longer exist`);
  }
});
test('admin can browse the security control catalog', async () => {
  const jar = await loginAdminWithTotp();
  const page = await getText(jar, '/admin/security-controls?q=account');
  assert.equal(page.response.status, 200);
  assert.match(page.text, /Security Control Catalog/);
  assert.match(page.text, /AC-2/);
  assert.match(page.text, /Account Management/);
});

test('security control catalog includes major non-ITSG frameworks', async () => {
  const jar = await loginAdminWithTotp();
  const checks = [
    ['/admin/security-controls?framework=CIS%20Controls%20v8', /Inventory and Control of Enterprise Assets/],
    ['/admin/security-controls?framework=ISO%2FIEC%2027001%3A2022%20Annex%20A&q=A.5.1', /Policies for information security/],
    ['/admin/security-controls?framework=FedRAMP%20Rev.%205&q=AC-2', /FedRAMP Rev\. 5/],
    ['/admin/security-controls?framework=NIST%20SP%20800-53%20Rev.%205&q=AC-2', /NIST SP 800-53 Rev\. 5/],
    ['/admin/security-controls?framework=ASD%20ISM&q=GOV-01', /Executive cyber security accountability/],
    ['/admin/security-controls?framework=ACSC%20Essential%20Eight', /Multi-factor authentication/]
  ];

  for (const [url, expected] of checks) {
    const page = await getText(jar, url);
    assert.equal(page.response.status, 200);
    assert.match(page.text, expected);
  }

  const csv = await request(jar, 'GET', '/admin/security-controls.csv?framework=ISO%2FIEC%2027001%3A2022%20Annex%20A');
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /A\.5\.1/);
});

test('pre-assessments require sign-in and a signed-in user can complete one', async () => {
  const adminJar = await loginAdminWithTotp();

  // Anonymous access to the pre-assessment is now gated → redirect to register.
  const anon = await request(new CookieJar(), 'GET', '/self-assessment', { redirect: 'manual' });
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location'), /\/register/);

  // A signed-in user loads the wizard directly (no access code).
  const wizard = await getText(adminJar, '/self-assessment');
  assert.equal(wizard.response.status, 200);
  assert.match(wizard.text, /Generate Questions/);

  const questions = await request(adminJar, 'POST', '/api/self-assessment/questions', {
    json: {
      systemType: 'web-app',
      country: 'CA',
      govLevel: 'federal',
      sensitivity: 'high',
      description: 'A cloud web application that collects personal information and exposes APIs.'
    }
  });
  assert.equal(questions.status, 200);
  const questionData = await questions.json();
  assert.equal(questionData.success, true);
  assert.ok(questionData.questions.length >= 5);

  const answers = {};
  questionData.questions.forEach((group, gi) => {
    group.questions.forEach((q, qi) => {
      answers[`q_${gi}_${qi}`] = q.type === 'select' ? (q.options?.[0] || 'Selected') : qi % 2 === 0;
    });
  });

  const report = await request(adminJar, 'POST', '/api/self-assessment/report', {
    json: {
      systemType: 'web-app',
      country: 'CA',
      govLevel: 'federal',
      sensitivity: 'high',
      description: 'A cloud web application that collects personal information and exposes APIs.',
      frameworks: questionData.frameworks,
      questions: questionData.questions,
      answers
    }
  });
  assert.equal(report.status, 200);
  const reportData = await report.json();
  assert.ok(Number.isInteger(reportData.score));
  assert.ok(Array.isArray(reportData.critical));
  assert.ok(Array.isArray(reportData.warnings));
  assert.ok(Array.isArray(reportData.secure));

  const submit = await request(adminJar, 'POST', '/api/self-assessment/submit', {
    json: {
      name: 'Self Assessment User',
      email: 'self.assessment@example.test',
      organization: 'Self Assessment Org',
      systemType: 'web-app',
      country: 'CA',
      govLevel: 'federal',
      sensitivity: 'high',
      description: 'A cloud web application that collects personal information and exposes APIs.',
      frameworks: questionData.frameworks,
      questions: questionData.questions,
      answers,
      report: reportData,
      reviewerEmail: 'reviewer@example.test'
    }
  });
  assert.equal(submit.status, 200);
  const submitData = await submit.json();
  assert.equal(submitData.success, true);
  assert.match(submitData.refCode, /^SA-/);

  const updatedQueue = await getText(adminJar, '/admin/self-assessments');
  assert.match(updatedQueue.text, new RegExp(submitData.refCode));
  const reviewPath = updatedQueue.text.match(new RegExp(`/admin/self-assessments/(\\d+)`))?.[0];
  assert.ok(reviewPath, 'review path should be available');
  const review = await getText(adminJar, reviewPath);
  assert.match(review.text, /Critical Gaps|Warnings|Green/);

  const convert = await request(adminJar, 'POST', `${reviewPath}/create-intake`);
  assert.equal(convert.status, 302);
  const convertedReview = await getText(adminJar, reviewPath);
  assert.match(convertedReview.text, /Linked Intake/);
});

test('admin can manage Teams invitations and view users', async () => {
  const jar = await loginAdminWithTotp();
  const teams = await getText(jar, '/admin/teams');
  assert.equal(teams.response.status, 200);
  assert.match(teams.text, /Invite a Client/);
  assert.match(teams.text, /Invite an Assessor/);
  assert.match(teams.text, /Active Users/);

  const invite = await request(jar, 'POST', '/admin/teams/client', {
    form: {
      email: 'team.client@example.test',
      name: 'Team Client',
      organization: 'Team Client Org',
      message: 'Please join the assessment portal.'
    }
  });
  assert.equal(invite.status, 302);
  const afterInvite = await getText(jar, '/admin/teams');
  assert.match(afterInvite.text, /team\.client@example\.test/);
});

test('project and assessment creation can use non-ITSG framework controls', async () => {
  const jar = await loginAdminWithTotp();
  const newProject = await getText(jar, '/admin/projects/new');
  assert.match(newProject.text, /Security Framework/);
  assert.match(newProject.text, /CIS Controls v8/);

  const create = await request(jar, 'POST', '/admin/projects/new', {
    form: {
      name: 'E2E CIS Framework Project',
      description: 'A private sector cloud application aligned to CIS Controls v8 implementation group one.',
      security_framework: 'CIS Controls v8',
      framework_baseline: 'IG1',
      framework_category: 'all',
      framework_applicability: 'Use CIS IG1 as the initial scope with assessor override.',
      department: 'E2E Organization',
      branch: 'Security Testing',
      data_classification: 'unclassified',
      hosting_type: 'azure',
      app_type: 'external',
      project_owner_name: 'E2E Owner',
      project_owner_email: 'owner@example.test'
    }
  });
  assert.equal(create.status, 302);
  const projectPath = create.headers.get('location');
  const projectId = projectPath.match(/(\d+)$/)[1];

  const detail = await getText(jar, projectPath);
  assert.match(detail.text, /CIS Controls v8/);
  assert.match(detail.text, /IG1/);

  const assessmentNew = await getText(jar, `/admin/projects/${projectId}/assessments/new`);
  assert.equal(assessmentNew.response.status, 200);
  assert.match(assessmentNew.text, /Select &amp; tailor CIS Controls v8 controls/);
  assert.match(assessmentNew.text, /Inventory and Control of Enterprise Assets/);
  assert.doesNotMatch(assessmentNew.text, /View GC Web Guidance Report Instead/);

  const assessmentCreate = await request(jar, 'POST', `/admin/projects/${projectId}/assessments/new`, {
    form: {
      control_ids: 'CIS-01',
      'title_CIS-01': 'Inventory and Control of Enterprise Assets',
      'desc_CIS-01': 'CIS asset inventory control.',
      'control_guidance_CIS-01': 'Use CIS evidence guidance.',
      'priority_CIS-01': 'P2',
      'risk_CIS-01': 'medium',
      'family_CIS-01': 'CIS Critical Security Controls',
      'family_name_CIS-01': 'Prioritized cybersecurity actions',
      'framework_CIS-01': 'CIS Controls v8',
      'tailored[CIS-01]': 'Tailored CIS asset inventory requirement.',
      'guidance[CIS-01]': 'Provide asset inventory evidence.',
      'applicable[CIS-01]': '1'
    }
  });
  assert.equal(assessmentCreate.status, 302);
  const assessmentDetail = await getText(jar, assessmentCreate.headers.get('location'));
  assert.match(assessmentDetail.text, /CIS Controls v8/);
  assert.match(assessmentDetail.text, /CIS-01/);
});

test('admin can archive a project and restore it, hiding it from the dashboard lists', async () => {
  const jar = await loginAdminWithTotp();
  const name = 'E2E Archive Lifecycle Project';
  const { projectId } = await createAdminProject(jar, name);

  // Assert against the table row link (a flash banner may echo the name, but never this href).
  const rowLink = new RegExp(`href="/admin/projects/${projectId}"`);

  // Archive hides the project from the active projects list...
  const archive = await request(jar, 'POST', `/admin/projects/${projectId}/archive`);
  assert.equal(archive.status, 302);

  const activeList = await getText(jar, '/admin/projects');
  assert.doesNotMatch(activeList.text, rowLink);

  // ...but it remains reachable in the archived view.
  const archivedList = await getText(jar, '/admin/projects?archived=1');
  assert.match(archivedList.text, rowLink);

  // The detail page shows it is archived and offers Restore.
  const detail = await getText(jar, `/admin/projects/${projectId}`);
  assert.match(detail.text, /archived/i);
  assert.match(detail.text, /unarchive/);

  // Restore brings it back to the active list.
  const restore = await request(jar, 'POST', `/admin/projects/${projectId}/unarchive`);
  assert.equal(restore.status, 302);
  const restoredList = await getText(jar, '/admin/projects');
  assert.match(restoredList.text, rowLink);
});

test('archiving a project archives its non-draft assessments and restore returns their status', async () => {
  const jar = await loginAdminWithTotp();
  const name = 'E2E Archive With Assessment Project';
  const { projectId } = await createAdminProject(jar, name);
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  // Move the assessment out of draft so archive (not delete) is the safe path.
  const invite = await request(jar, 'POST', `/admin/assessments/${assessmentId}/send-invite`);
  assert.equal(invite.status, 302);

  // Archive the project; its assessment should disappear from the assessments list.
  const archive = await request(jar, 'POST', `/admin/projects/${projectId}/archive`);
  assert.equal(archive.status, 302);
  const assessmentsList = await getText(jar, '/admin/assessments');
  // Assert on the assessment row link (a flash banner may echo the project name, not this href).
  assert.doesNotMatch(assessmentsList.text, new RegExp(`href="/admin/assessments/${assessmentId}"`));

  // Restore returns the assessment to its pre-archive (evidence-gathering) status.
  const restore = await request(jar, 'POST', `/admin/projects/${projectId}/unarchive`);
  assert.equal(restore.status, 302);
  const assessmentDetail = await getText(jar, `/admin/assessments/${assessmentId}`);
  assert.match(assessmentDetail.text, /Evidence Gathering|evidence-gathering/i);
});

test('deleting a project requires the exact name and then purges it with its assessments', async () => {
  const jar = await loginAdminWithTotp();
  const name = 'E2E Danger Zone Delete Project';
  const { projectId } = await createAdminProject(jar, name);
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  // Make the assessment non-draft to prove delete purges it too (unlike the old block).
  const invite = await request(jar, 'POST', `/admin/assessments/${assessmentId}/send-invite`);
  assert.equal(invite.status, 302);

  // A wrong confirmation name must NOT delete the project.
  const wrong = await request(jar, 'POST', `/admin/projects/${projectId}/delete`, {
    form: { confirm_name: 'not the right name' }
  });
  assert.equal(wrong.status, 302);
  const stillThere = await request(jar, 'GET', `/admin/projects/${projectId}`, { redirect: 'manual' });
  assert.equal(stillThere.status, 200, 'project should survive a mismatched confirmation');

  // The exact name permanently deletes the project and its assessment.
  const del = await request(jar, 'POST', `/admin/projects/${projectId}/delete`, {
    form: { confirm_name: name }
  });
  assert.equal(del.status, 302);
  assert.equal(del.headers.get('location'), '/admin/projects');

  const gone = await request(jar, 'GET', `/admin/projects/${projectId}`, { redirect: 'manual' });
  assert.equal(gone.status, 302, 'deleted project detail should redirect away');
  const assessmentGone = await request(jar, 'GET', `/admin/assessments/${assessmentId}`, { redirect: 'manual' });
  assert.equal(assessmentGone.status, 302, 'purged assessment should no longer be viewable');
});

test('public can view the pricing and registration pages', async () => {
  const jar = new CookieJar();
  const pricing = await getText(jar, '/pricing');
  assert.equal(pricing.response.status, 200);
  assert.match(pricing.text, /Pick a plan/);
  assert.match(pricing.text, /Pay as you go/);

  const register = await getText(jar, '/register?plan=business');
  assert.equal(register.response.status, 200);
  assert.match(register.text, /Create your account/);
  assert.match(register.text, /Business/);
});

test('public registration on the trial plan creates a workspace and signs in', async () => {
  const jar = new CookieJar();
  const email = `trial.owner.${Date.now()}@example.test`;
  const res = await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Trial', last_name: 'Owner',
      organization: 'E2E Trial Org', email, password: 'TrialPassword123!', agree: '1'
    }
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/billing/welcome', 'trial signup goes to the recovery-key screen first');

  // The welcome screen reveals the auto-created break-glass recovery key once.
  const welcome = await getText(jar, '/billing/welcome');
  assert.equal(welcome.response.status, 200);
  assert.match(welcome.text, /break-glass|recovery key/i);
  assert.match(welcome.text, /breakglass\+org/i, 'shows the generated break-glass account');
});

test('root admin can create, verify and delete organization settings (CRUD)', async () => {
  // Registering a workspace makes this user its root admin, so the org console is reachable.
  const jar = new CookieJar();
  const email = `org.crud.${Date.now()}@example.test`;
  const reg = await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Org', last_name: 'Crud',
      organization: 'E2E Org CRUD', email, password: 'TrialPassword123!', agree: '1'
    }
  });
  assert.equal(reg.status, 302);

  // ── Custom domain: create → verify → delete ──
  await request(jar, 'POST', '/admin/organization/domain', { form: { custom_domain: 'assess.e2e.test' } });
  let page = await getText(jar, '/admin/organization');
  assert.match(page.text, /assess\.e2e\.test/, 'domain is saved and shown');
  assert.match(page.text, /Delete domain/, 'a delete control is offered once a domain exists');

  // Verification performs a real DNS lookup, so a domain with no records stays
  // unverified. (The DNS-gating itself is covered by its own test below.)
  await request(jar, 'POST', '/admin/organization/domain/verify', { form: {} });
  page = await getText(jar, '/admin/organization');
  assert.match(page.text, /DNS not verified/, 'verification reports the missing DNS records');

  await request(jar, 'POST', '/admin/organization/domain/delete', { form: {} });
  page = await getText(jar, '/admin/organization');
  assert.doesNotMatch(page.text, /assess\.e2e\.test/, 'deleting removes the custom domain');

  // ── SMTP: create → delete (credentials must be cleared, not just hidden) ──
  await request(jar, 'POST', '/admin/organization/smtp', {
    form: { smtp_host: 'smtp.e2e.test', smtp_port: '587', smtp_user: 'u@e2e.test', smtp_password: 'secret', smtp_enabled: '1' }
  });
  page = await getText(jar, '/admin/organization');
  assert.match(page.text, /smtp\.e2e\.test/);
  await request(jar, 'POST', '/admin/organization/smtp/delete', { form: {} });
  page = await getText(jar, '/admin/organization');
  assert.doesNotMatch(page.text, /smtp\.e2e\.test/, 'deleting clears SMTP settings');

  // ── SMS: create → delete ──
  await request(jar, 'POST', '/admin/organization/sms', {
    form: { sms_provider: 'twilio', sms_account_sid: 'ACe2etest', sms_auth_token: 'tok', sms_from: '+15551234567', sms_enabled: '1' }
  });
  page = await getText(jar, '/admin/organization');
  assert.match(page.text, /ACe2etest/);
  await request(jar, 'POST', '/admin/organization/sms/delete', { form: {} });
  page = await getText(jar, '/admin/organization');
  assert.doesNotMatch(page.text, /ACe2etest/, 'deleting clears SMS settings');

  // ── AI provider: bring-your-own → delete falls back to the platform default ──
  await request(jar, 'POST', '/admin/organization/ai', {
    form: { ai_provider: 'openai', ai_api_key: 'sk-e2e-test', ai_model: 'gpt-4o' }
  });
  page = await getText(jar, '/admin/organization');
  assert.match(page.text, /Delete custom AI provider/, 'a BYO provider can be deleted');
  await request(jar, 'POST', '/admin/organization/ai/delete', { form: {} });
  page = await getText(jar, '/admin/organization');
  assert.match(page.text, /Using platform default/, 'deleting the AI provider restores the platform default');
});

test('a project shows the four-stage business process flow with a derived current stage', async () => {
  const jar = await loginAdminWithTotp();
  const { projectPath } = await createAdminProject(jar, 'E2E Process Flow Project');

  const page = await getText(jar, projectPath);
  assert.equal(page.response.status, 200);

  // Four chevrons: Intake -> Security assessment -> Decision package -> Authorized.
  const chevrons = (page.text.match(/class="pf-chev /g) || []).length;
  assert.equal(chevrons, 4, 'the master flow renders four stages');
  assert.match(page.text, /Stage \d of 4/, 'the stage counter is shown');

  // Exactly one stage is current, and a next step is offered.
  const current = (page.text.match(/pf-chev pf-current/g) || []).length;
  assert.equal(current, 1, 'exactly one stage is current');
  assert.match(page.text, /Next step:/, 'the next action is surfaced');

  // Stage checklists link back to the underlying records.
  assert.match(page.text, /Project created/);
  assert.match(page.text, /Assessment created/);
});

test('the project header no longer duplicates the assessment create action', async () => {
  const jar = await loginAdminWithTotp();
  const { projectPath, projectId } = await createAdminProject(jar, 'E2E No Dup Button Project');
  const page = await getText(jar, projectPath);
  // The header button is gone; creating an assessment stays with the Assessments table.
  assert.doesNotMatch(page.text, /New Assessment/, 'the duplicate header button is removed');
  assert.match(page.text, new RegExp(`/admin/projects/${projectId}/assessments/new`),
    'the create action is still reachable from the assessments section');
});

test('the process flow is localized in every supported language', async () => {
  const jar = await loginAdminWithTotp();
  const { projectPath } = await createAdminProject(jar, 'E2E Flow i18n Project');
  const expected = {
    fr: ['Progression du projet', 'Évaluation de sécurité', 'Étape'],
    es: ['Progreso del proyecto', 'Evaluación de seguridad', 'Etapa'],
    de: ['Projektfortschritt', 'Sicherheitsbewertung', 'Phase'],
    pt: ['Progresso do projeto', 'Avaliação de segurança', 'Etapa'],
    it: ['Avanzamento del progetto', 'Valutazione della sicurezza', 'Fase'],
    nl: ['Voortgang van het project', 'Beveiligingsbeoordeling', 'Fase'],
    ja: ['プロジェクトの進捗', 'セキュリティ評価', 'ステージ']
  };
  for (const [lang, phrases] of Object.entries(expected)) {
    const page = await getText(jar, `${projectPath}?lang=${lang}`);
    for (const phrase of phrases) {
      assert.ok(page.text.includes(phrase), `${lang} flow should render "${phrase}"`);
    }
  }
});

test('status badges are localized rather than hardcoded English', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Status Badge Project');
  const { assessmentPath } = await createSingleControlAssessment(jar, projectId);

  const en = await getText(jar, assessmentPath);
  assert.match(en.text, /badge bg-secondary">Draft</, 'English still reads Draft');

  const expected = { fr: 'Brouillon', es: 'Borrador', de: 'Entwurf', pt: 'Rascunho',
                     it: 'Bozza', nl: 'Concept', ja: '下書き' };
  for (const [lang, word] of Object.entries(expected)) {
    const page = await getText(jar, `${assessmentPath}?lang=${lang}`);
    assert.ok(page.text.includes(word), `${lang} status badge should read "${word}"`);
    assert.ok(!page.text.includes('badge bg-secondary">Draft<'),
      `${lang} must not fall back to the English badge`);
  }
});

test('a decision package exports a PDF built from the pinned version', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E DP Export Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  const buffer = await assertPdfDownload(jar, `${dp.path}/export-pdf`, 'decision package');
  assert.ok(buffer.length > 1500, 'the exported package has real content');

  const page = await getText(jar, dp.path);
  assert.match(page.text, /export-pdf/, 'the export action is offered on the package');
});

test('the retired assessment ATO route no longer exists', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Retired ATO Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const res = await request(jar, 'GET', `/admin/assessments/${assessmentId}/generate-ato`, { redirect: 'manual' });
  assert.equal(res.status, 404, 'authorization now lives only in decision packages');
});

// ── Mention notifications ───────────────────────────────────────────────────
test('a mention notifies the mentioned user in-app, and never the author', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Mention Notify Project');

  const listed = await (await request(jar, 'GET', `/admin/projects/${projectId}/collab`)).json();
  const me = listed.members.find(m => m.email === USERS.assessor.email);
  assert.ok(me, 'the signed-in assessor is a member of their own project');

  const before = await getText(jar, '/admin/notifications');
  const beforeCount = (before.text.match(/mentioned you/g) || []).length;

  // Mentioning YOURSELF must not generate a notification.
  const handle = me.email.split('@')[0];
  await request(jar, 'POST', `/admin/projects/${projectId}/collab`, {
    json: { body: `@${handle} note to self`, entityType: 'project' }
  });

  const after = await getText(jar, '/admin/notifications');
  const afterCount = (after.text.match(/mentioned you/g) || []).length;
  assert.equal(afterCount, beforeCount, 'the author is never notified about their own mention');
});

test('notification preferences can be changed and are respected', async () => {
  const jar = await loginAdminWithTotp();

  const page = await getText(jar, '/admin/notifications/preferences');
  assert.equal(page.response.status, 200);
  assert.match(page.text, /Show mentions in the app/);
  assert.match(page.text, /Emails are batched/, 'the batching behaviour is explained to the user');

  // Turn email off, leave in-app on.
  const save = await request(jar, 'POST', '/admin/notifications/preferences', {
    form: { notify_mentions_inapp: '1' }
  });
  assert.equal(save.status, 302);

  const reloaded = await getText(jar, '/admin/notifications/preferences');
  assert.match(reloaded.text, /id="npInapp"[^>]*checked/, 'in-app stays on');
  assert.doesNotMatch(reloaded.text, /id="npEmail"[^>]*checked/, 'email was turned off');

  // Restore.
  await request(jar, 'POST', '/admin/notifications/preferences', {
    form: { notify_mentions_inapp: '1', notify_mentions_email: '1' }
  });
});

test('mention emails are link-only unless the tenant opts into excerpts', async () => {
  const jar = new CookieJar();
  const email = `notif.policy.${Date.now()}@example.test`;
  await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Notif', last_name: 'Policy',
      organization: 'E2E Notif Org', email, password: 'TrialPassword123!', agree: '1'
    }
  });

  const settings = await getText(jar, '/admin/organization');
  assert.match(settings.text, /Mention notifications/, 'the tenant policy is exposed');
  assert.match(settings.text, /emails contain only a link/i, 'the privacy default is stated');
  // Excerpts are OFF by default — discussion text stays out of inboxes.
  assert.doesNotMatch(settings.text, /id="ntExcerpt"[^>]*checked/,
    'including message text is opt-in, not the default');

  const save = await request(jar, 'POST', '/admin/organization/notifications', {
    form: { notify_mentions_enabled: '1', notify_mention_excerpt: '1' }
  });
  assert.equal(save.status, 302);
  const after = await getText(jar, '/admin/organization');
  assert.match(after.text, /id="ntExcerpt"[^>]*checked/, 'the tenant can opt in');
});

// ── POA&M as conditions on a decision package ───────────────────────────────
async function addCondition(jar, dpPath, fields = {}) {
  const res = await request(jar, 'POST', `${dpPath}/poam/add`, {
    form: Object.assign({ description: 'E2E condition', risk_level: 'medium' }, fields)
  });
  assert.equal(res.status, 302);
}

async function poamPage(jar, dpPath) { return getText(jar, `${dpPath}/poam`); }

/** The newest condition id on a package, read back from its POA&M page. */
function lastConditionId(text) {
  const ids = [...text.matchAll(/\/poam\/(\d+)\/(?:evidence|review)/g)].map(m => Number(m[1]));
  return ids.length ? Math.max(...ids) : null;
}

test('POA&M has moved off the assessment and onto the decision package', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E POAM Move Project');
  const { assessmentId, assessmentPath } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  const assessment = await getText(jar, assessmentPath);
  assert.doesNotMatch(assessment.text, /Plan of Action/i, 'the assessment no longer shows POA&M');
  assert.doesNotMatch(assessment.text, /poam\/auto-populate/, 'the assessment POA&M actions are gone');

  const page = await poamPage(jar, dp.path);
  assert.equal(page.response.status, 200);
  assert.match(page.text, /Plan of Action &amp; Milestones|Plan of Action & Milestones/);
});

test('a condition runs the evidence-then-review loop', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E POAM Loop Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });
  await addCondition(jar, dp.path, { description: 'Encrypt backups', deadline: '2030-01-01' });

  let page = await poamPage(jar, dp.path);
  const itemId = lastConditionId(page.text);
  assert.ok(itemId, 'the condition is listed with its actions');

  await request(jar, 'POST', `${dp.path}/poam/${itemId}/evidence`, { form: { evidence_text: 'AES-256 enabled' } });
  page = await poamPage(jar, dp.path);
  assert.match(page.text, /Awaiting review/, 'submitted evidence moves the item to review');

  await request(jar, 'POST', `${dp.path}/poam/${itemId}/review`, { form: { decision: 'accept', review_notes: 'Verified' } });
  page = await poamPage(jar, dp.path);
  assert.match(page.text, /1 of 1 conditions met/, 'an accepted condition counts as met');
});

test('a full ATO cannot be granted while conditions are outstanding or overdue', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E POAM Gate Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId, type: 'iato' });

  // An overdue condition blocks promotion outright.
  await addCondition(jar, dp.path, { description: 'Overdue work', deadline: '2020-01-01' });
  let page = await poamPage(jar, dp.path);
  assert.match(page.text, /Overdue/, 'the overdue condition is flagged');

  await request(jar, 'POST', `${dp.path}/promote`, { form: {} });
  let detail = await getText(jar, dp.path);
  assert.match(detail.text, /value="iato" selected/, 'the package is still a conditional iATO');
  const pkg = await poamPage(jar, dp.path);
  assert.match(pkg.text, /new due date|accepted before a full ATO/i, 'the block is explained');

  // Fixing the date is not enough — the condition must actually be accepted.
  const itemId = lastConditionId(pkg.text);
  await request(jar, 'POST', `${dp.path}/poam/${itemId}/deadline`,
    { form: { deadline: '2030-01-01', reason: 'Vendor slipped' } });
  page = await poamPage(jar, dp.path);
  assert.match(page.text, /Due date changed 1 time/, 'the due-date change is recorded with its history');

  await request(jar, 'POST', `${dp.path}/poam/${itemId}/evidence`, { form: { evidence_text: 'Done' } });
  await request(jar, 'POST', `${dp.path}/poam/${itemId}/review`, { form: { decision: 'accept' } });
  await request(jar, 'POST', `${dp.path}/promote`, { form: {} });
  detail = await getText(jar, dp.path);
  assert.match(detail.text, /value="ato" selected/,
    'promotion succeeds once every condition is accepted');
});

test('extending an authorization carries unfinished conditions into the successor', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E POAM Extend Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId, type: 'iato' });
  await addCondition(jar, dp.path, { description: 'Unfinished work item', deadline: '2030-06-30' });

  const res = await request(jar, 'POST', `${dp.path}/extend`,
    { form: { extension_reason: 'More time needed', expires_at: '2031-01-01' } });
  assert.equal(res.status, 302);
  const successor = res.headers.get('location');
  assert.match(successor, /^\/admin\/decision-packages\/\d+\/poam$/, 'lands on the successor POA&M');

  const carried = await getText(jar, successor);
  assert.match(carried.text, /Unfinished work item/, 'the condition was carried forward');
  assert.match(carried.text, /Carried forward/, 'and is marked as carried');

  const original = await poamPage(jar, dp.path);
  assert.match(original.text, /Deferred/, 'the original condition is now deferred');
});

// ── Decision package versioning ─────────────────────────────────────────────
test('decision package edits are versioned and revert restores the earlier fields', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E DP Version Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  await request(jar, 'POST', dp.path, { form: { title: 'Renamed package', decision_type: 'iato' } });
  let page = await getText(jar, dp.path);
  assert.match(page.text, /Renamed package/);
  assert.match(page.text, /v1 Created|Created/, 'the baseline version is recorded');
  assert.match(page.text, /Edited/, 'the edit is recorded as its own version');

  const revert = await request(jar, 'POST', `${dp.path}/revert/1`, { json: {} });
  assert.equal(revert.status, 200);
  const body = await revert.json();
  assert.equal(body.success, true);

  page = await getText(jar, dp.path);
  assert.doesNotMatch(page.text, /value="Renamed package"/, 'the earlier title was restored');
});

test('reverting never touches POA&M verdicts, and an issued package cannot be reverted', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E DP Revert Guard Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });
  await addCondition(jar, dp.path, { description: 'Reviewed condition', deadline: '2030-01-01' });

  let page = await poamPage(jar, dp.path);
  const itemId = lastConditionId(page.text);
  await request(jar, 'POST', `${dp.path}/poam/${itemId}/evidence`, { form: { evidence_text: 'Evidence' } });
  await request(jar, 'POST', `${dp.path}/poam/${itemId}/review`, { form: { decision: 'accept' } });

  // Revert the package's editorial fields...
  await request(jar, 'POST', dp.path, { form: { title: 'Changed', decision_type: 'iato' } });
  await request(jar, 'POST', `${dp.path}/revert/1`, { json: {} });

  // ...the accepted verdict must survive it.
  page = await poamPage(jar, dp.path);
  assert.match(page.text, /1 of 1 conditions met/, 'review verdicts survive an editorial revert');

  // Once issued, revert is refused outright.
  for (const state of ['in-review', 'recommended', 'decided', 'issued']) {
    await request(jar, 'POST', `${dp.path}/transition`, { form: { state } });
  }
  const refused = await request(jar, 'POST', `${dp.path}/revert/1`, { json: {} });
  assert.equal(refused.status, 400, 'an issued authorization cannot be reverted');
  const err = await refused.json();
  assert.match(err.error, /issued authorization cannot be reverted/i);
});

// ── Phase 4: assistant consolidation ─────────────────────────────────────────
test('the Aegis SA Assistant is the single chat surface on every major record', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E Assistant Surface Project');
  const { assessmentPath, assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });
  const intakeId = await findIntakeIdByName(jar, 'E2E Assistant Surface Project');

  for (const [label, url] of [
    ['project', projectPath],
    ['assessment', assessmentPath],
    ['intake', `/admin/intakes/${intakeId}`],
    ['decision package', dp.path]
  ]) {
    const page = await getText(jar, url);
    assert.match(page.text, /aiaLaunch/, `${label} offers the Aegis SA Assistant`);
    assert.match(page.text, /AIAssistConfig/, `${label} configures the assistant`);
  }
});

test('the assistant offers context-aware starter prompts per record type', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E Assistant Prompts Project');
  const { assessmentPath } = await createSingleControlAssessment(jar, projectId);

  const project = await getText(jar, projectPath);
  assert.match(project.text, /suggestions:/, 'the project assistant has starter prompts');
  assert.match(project.text, /next step for this project/i, 'prompts are project-specific');

  const assessment = await getText(jar, assessmentPath);
  assert.match(assessment.text, /lack evidence/i, 'prompts are assessment-specific');

  // Prompts are localized like everything else.
  const fr = await getText(jar, `${projectPath}?lang=fr`);
  assert.ok(fr.text.includes('prochaine étape'), 'starter prompts are localized');
});

test('the legacy AI panel is no longer a chat entry point', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Legacy Panel Project');
  const { assessmentPath } = await createSingleControlAssessment(jar, projectId);

  const assessment = await getText(jar, assessmentPath);
  assert.doesNotMatch(assessment.text, /aiTriggerBtn/,
    'the assessment no longer loads the legacy AI panel at all');

  // Where the panel is still needed as a result viewer, its floating trigger is hidden.
  const intakeId = await findIntakeIdByName(jar, 'E2E Legacy Panel Project');
  const intake = await getText(jar, `/admin/intakes/${intakeId}`);
  if (intake.text.includes('aiTriggerBtn')) {
    assert.match(intake.text, /id="aiTriggerBtn"[^>]*style="display:none"/,
      'the legacy trigger is hidden where the panel is kept as a result viewer');
  }
});

// ── Residual item 1: decision package flow on the project page ───────────────
test('the project page shows the active decision package flow', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E DP Flow On Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  const before = await getText(jar, projectPath);
  assert.doesNotMatch(before.text, /pfdpproj-st-/, 'no decision flow before a package exists');

  await createDecisionPackage(jar, projectId, { assessmentId });
  const after = await getText(jar, projectPath);
  assert.match(after.text, /pfdpproj-st-/, 'the decision package flow appears on the project');
});

// ── Residual item 3: evidence submission requires an account ─────────────────
test('the evidence portal requires an account and returns to the invite after sign-in', async () => {
  const admin = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(admin, 'E2E Evidence Auth Project');
  const { assessmentPath } = await createSingleControlAssessment(admin, projectId);
  const detail = await getText(admin, assessmentPath);
  const code = detail.text.match(/[A-F0-9]{8}/i);
  assert.ok(code, 'the assessment exposes an invite code');

  // Anonymous access is refused and routed to sign-in.
  const anon = new CookieJar();
  const res = await request(anon, 'GET', `/respond/${code[0]}`, { redirect: 'manual' });
  assert.equal(res.status, 302, 'anonymous evidence access is refused');
  assert.equal(res.headers.get('location'), '/client/login');

  // Anonymous writes are refused too, not just the page view.
  const write = await request(anon, 'POST', `/respond/${code[0]}/submit`, { form: {} });
  assert.equal(write.status, 302, 'anonymous submission is refused');

  // A signed-in client can reach it.
  const client = await loginClientWithTotp();
  const ok = await request(client, 'GET', `/respond/${code[0]}`, { redirect: 'manual' });
  assert.notEqual(ok.status, 302, 'a signed-in user is not bounced to sign-in');
});

// ── Intake acceptance ────────────────────────────────────────────────────────
async function submitClientIntake(jar, projectName) {
  const res = await request(jar, 'POST', '/intake', {
    form: {
      projectName,
      projectDescription: 'A protected B system submitted directly by a client, with no project yet.',
      department: 'E2E Department', branch: 'Security Testing', appType: 'internal',
      confidentialityLevel: 'protected-b', integrityLevel: 'medium', availabilityLevel: 'medium',
      hostingType: 'azure', ownerName: 'E2E Client', ownerEmail: USERS.client.email
    },
    redirect: 'follow'
  });
  assert.equal(res.status, 200);
  return res;
}

/** Find an intake row id by the project name it was submitted under. */
async function findIntakeIdByName(adminJar, projectName) {
  const list = await getText(adminJar, '/admin/intakes');
  const rows = list.text.split(/<tr/).filter(r => r.includes(projectName));
  assert.ok(rows.length, `intake for "${projectName}" should be listed`);
  const id = rows[0].match(/\/admin\/intakes\/(\d+)/);
  assert.ok(id, 'intake row should link to its record');
  return id[1];
}

test('accepting an intake that already has a project does not create another project or assessment', async () => {
  const jar = await loginAdminWithTotp();
  // Creating a project as an assessor also creates its linked intake.
  const { projectId } = await createAdminProject(jar, 'E2E Accept Existing Project');
  const before = await getText(jar, '/admin/projects');
  const projectsBefore = (before.text.match(/\/admin\/projects\/\d+/g) || []).length;

  const intakeId = await findIntakeIdByName(jar, 'E2E Accept Existing Project');
  const accept = await request(jar, 'POST', `/admin/intakes/${intakeId}/accept`, { form: {} });

  // It returns to the EXISTING project — no new project is spun up.
  assert.equal(accept.status, 302);
  assert.equal(accept.headers.get('location'), `/admin/projects/${projectId}`);

  const after = await getText(jar, '/admin/projects');
  const projectsAfter = (after.text.match(/\/admin\/projects\/\d+/g) || []).length;
  assert.equal(projectsAfter, projectsBefore, 'no additional project is created');

  // No assessment is ever created by accepting an intake.
  const project = await getText(jar, `/admin/projects/${projectId}`);
  assert.doesNotMatch(project.text, /\/admin\/assessments\/\d+/,
    'accepting an intake must not create an assessment');

  // The intake itself is now accepted.
  const intake = await getText(jar, `/admin/intakes/${intakeId}`);
  assert.match(intake.text, /Accepted|accepted/);
});

test('accepting a standalone intake creates a project (but no assessment) and opens it', async () => {
  const clientJar = await loginClientWithTotp();
  await submitClientIntake(clientJar, 'E2E Standalone Intake');

  const jar = await loginAdminWithTotp();
  const intakeId = await findIntakeIdByName(jar, 'E2E Standalone Intake');

  const accept = await request(jar, 'POST', `/admin/intakes/${intakeId}/accept`, { form: {} });
  assert.equal(accept.status, 302);
  const loc = accept.headers.get('location');
  // A project is created and we are taken to it — never to an assessment.
  assert.match(loc, /^\/admin\/projects\/\d+$/, 'acceptance lands on the new project');

  const project = await getText(jar, loc);
  assert.equal(project.response.status, 200);
  assert.match(project.text, /E2E Standalone Intake/);
  assert.doesNotMatch(project.text, /\/admin\/assessments\/\d+/,
    'no assessment is created from the intake');
});

test('accepting an intake advances the project process flow to the assessment stage', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E Stage Advance Project');
  const intakeId = await findIntakeIdByName(jar, 'E2E Stage Advance Project');

  await request(jar, 'POST', `/admin/intakes/${intakeId}/accept`, { form: {} });

  const page = await getText(jar, projectPath);
  // Intake stage complete, assessment stage now current, and the next action named.
  assert.match(page.text, /pf-chev pf-complete/, 'the intake stage reads complete');
  assert.match(page.text, /pf-chev pf-current/, 'a later stage becomes current');
  assert.match(page.text, /Next step:[\s\S]{0,120}Assessment created/,
    'the next step is to create the assessment');
});

// ── Decision packages (Phase 2) ──────────────────────────────────────────────
async function createDecisionPackage(jar, projectId, { assessmentId = null, type = 'ato' } = {}) {
  const res = await request(jar, 'POST', `/admin/projects/${projectId}/decision-packages`, {
    form: { assessment_id: assessmentId || '', decision_type: type }
  });
  assert.equal(res.status, 302);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/admin\/decision-packages\/\d+$/, 'creation redirects to the new package');
  return { path: loc, id: loc.match(/(\d+)$/)[1] };
}

test('creating a decision package pins an immutable assessment version and captures a snapshot', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Decision Pin Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId, type: 'iato' });

  const page = await getText(jar, dp.path);
  assert.equal(page.response.status, 200);
  // The package records the exact version it authorized and links to that snapshot.
  assert.match(page.text, /Authorized assessment version/);
  assert.match(page.text, new RegExp(`/admin/assessments/${assessmentId}\\?version=\\d+`),
    'links to the pinned read-only version');
  // Its own five-stage flow renders.
  assert.equal((page.text.match(/class="pf-chev /g) || []).length, 5);

  // The pinned version is a real, immutable snapshot in the assessment's history.
  const history = await getText(jar, `/admin/assessments/${assessmentId}`);
  assert.match(history.text, /Pinned for decision package/);
});

test('the decision package state machine rejects invalid jumps and allows the full path', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Decision States Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  // draft -> issued is not a legal transition.
  await request(jar, 'POST', `${dp.path}/transition`, { form: { state: 'issued' } });
  let page = await getText(jar, dp.path);
  assert.doesNotMatch(page.text, /badge bg-dark ms-1">Issued/, 'an illegal jump must not take effect');

  // The legal path does work, one step at a time.
  for (const state of ['in-review', 'recommended', 'decided', 'issued']) {
    await request(jar, 'POST', `${dp.path}/transition`, { form: { state } });
  }
  page = await getText(jar, dp.path);
  assert.match(page.text, /badge bg-dark ms-1">Issued/, 'the package reaches Issued via legal steps');
});

test('an issued decision package cannot be deleted', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Decision Delete Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });
  for (const state of ['in-review', 'recommended', 'decided', 'issued']) {
    await request(jar, 'POST', `${dp.path}/transition`, { form: { state } });
  }
  const del = await request(jar, 'POST', `${dp.path}/delete`, { form: {} });
  assert.equal(del.status, 302);
  const still = await request(jar, 'GET', dp.path, { redirect: 'manual' });
  assert.equal(still.status, 200, 'an issued package survives a delete attempt');
});

test('an assessment is locked while a decision is under review and released once issued', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Lock Project');
  const { assessmentId, assessmentPath } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  await request(jar, 'POST', `${dp.path}/transition`, { form: { state: 'in-review' } });
  let page = await getText(jar, assessmentPath);
  assert.match(page.text, /Assessment locked/, 'locked while the decision is under review');

  for (const state of ['recommended', 'decided', 'issued']) {
    await request(jar, 'POST', `${dp.path}/transition`, { form: { state } });
  }
  page = await getText(jar, assessmentPath);
  assert.doesNotMatch(page.text, /Assessment locked/, 'the lock is released once the decision is issued');
});

test('authorization has moved off the assessment into decision packages', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E ATO Moved Project');
  const { assessmentPath } = await createSingleControlAssessment(jar, projectId);

  const assessment = await getText(jar, assessmentPath);
  assert.doesNotMatch(assessment.text, /generate-ato/, 'the Generate ATO action is gone');
  assert.doesNotMatch(assessment.text, /Related ATO\/iATO/, 'the ATO pickers are gone');

  const project = await getText(jar, projectPath);
  assert.match(project.text, /Decision packages/, 'the project owns the decision package section');
});

// ── Collaboration (Phase 3) ──────────────────────────────────────────────────
test('collaboration threads roll up to the project and filter by record', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Collab Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  await request(jar, 'POST', `/admin/projects/${projectId}/collab`, {
    json: { body: 'Project level note', entityType: 'project' }
  });
  await request(jar, 'POST', `/admin/projects/${projectId}/collab`, {
    json: { body: 'Assessment level note', entityType: 'assessment', entityId: Number(assessmentId) }
  });

  const all = await (await request(jar, 'GET', `/admin/projects/${projectId}/collab`)).json();
  assert.equal(all.success, true);
  assert.equal(all.messages.length, 2, 'the project thread rolls up every record');

  const scoped = await (await request(jar, 'GET',
    `/admin/projects/${projectId}/collab?entityType=assessment&entityId=${assessmentId}`)).json();
  assert.equal(scoped.messages.length, 1, 'a record thread shows only its own messages');
  assert.match(scoped.messages[0].body, /Assessment level note/);
});

test('collaboration mentions resolve only project members and project records', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Mentions Project');
  await createSingleControlAssessment(jar, projectId);

  const listed = await (await request(jar, 'GET', `/admin/projects/${projectId}/collab`)).json();
  const record = (listed.records || [])[0];
  assert.ok(record, 'the project offers at least one mentionable record');

  const posted = await (await request(jar, 'POST', `/admin/projects/${projectId}/collab`, {
    json: { body: `@${record.label} and @definitely-not-a-member and @DP-9999` }
  })).json();

  const labels = posted.message.mentions.records.map(r => r.label);
  assert.ok(labels.includes(record.label), "the project's own record resolves");
  assert.ok(!labels.includes('DP-9999'), 'a record outside the project never resolves');
  assert.ok(!posted.message.mentions.users.some(u => /definitely-not-a-member/.test(u.email || '')),
    'a non-member is never resolved into a mention');
});

test('collaboration can be turned off per project and blocks posting when off', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E Collab Toggle Project');

  await request(jar, 'POST', `/admin/projects/${projectId}/collaboration-toggle`, { form: {} });
  const blocked = await request(jar, 'POST', `/admin/projects/${projectId}/collab`, {
    json: { body: 'should not be stored' }
  });
  assert.equal(blocked.status, 403, 'posting is refused while collaboration is off');

  const page = await getText(jar, projectPath);
  assert.match(page.text, /Collaboration is turned off/);

  // Turning it back on restores posting.
  await request(jar, 'POST', `/admin/projects/${projectId}/collaboration-toggle`, { form: {} });
  const ok = await request(jar, 'POST', `/admin/projects/${projectId}/collab`, { json: { body: 'back on' } });
  assert.equal(ok.status, 200);
});

test('decision packages and collaboration are localized in every supported language', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId, projectPath } = await createAdminProject(jar, 'E2E DP i18n Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);
  const dp = await createDecisionPackage(jar, projectId, { assessmentId });

  const expected = {
    fr: ['Dossiers de décision', 'Collaboration'],
    es: ['Expedientes de decisión', 'Colaboración'],
    de: ['Entscheidungsdossiers', 'Zusammenarbeit'],
    pt: ['Pacotes de decisão', 'Colaboração'],
    it: ['Fascicoli di decisione', 'Collaborazione'],
    nl: ['Besluitdossiers', 'Samenwerking'],
    ja: ['決定パッケージ', 'コラボレーション']
  };
  for (const [lang, phrases] of Object.entries(expected)) {
    const page = await getText(jar, `${projectPath}?lang=${lang}`);
    for (const phrase of phrases) {
      assert.ok(page.text.includes(phrase), `${lang} project page should render "${phrase}"`);
    }
  }
  // The package page localizes its pinned-version panel too.
  // NB: assert on apostrophe-free copy — Handlebars escapes ' to &#x27; in the HTML.
  const fr = await getText(jar, `${dp.path}?lang=fr`);
  assert.ok(fr.text.includes('Type de décision'), 'fr decision package page is localized');
  assert.ok(fr.text.includes('Autorité approbatrice'), 'fr decision package fields are localized');
});

test('a custom domain is only verified when its DNS records really resolve', async () => {
  const jar = new CookieJar();
  const email = `dns.check.${Date.now()}@example.test`;
  await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Dns', last_name: 'Check',
      organization: 'E2E DNS Org', email, password: 'TrialPassword123!', agree: '1'
    }
  });

  // .invalid is reserved (RFC 2606) so this can never resolve — no DNS records exist.
  await request(jar, 'POST', '/admin/organization/domain', { form: { custom_domain: 'e2e-not-real.invalid' } });
  await request(jar, 'POST', '/admin/organization/domain/verify', { form: {} });

  const page = await getText(jar, '/admin/organization');
  assert.doesNotMatch(page.text, /badge bg-success ms-2">Verified/,
    'a domain with no DNS records must NOT be marked verified');
  assert.match(page.text, /DNS not verified/, 'the failure names the missing records');
  // The attempt is recorded in the 24h check log.
  assert.match(page.text, /Last valid check/, 'the validation status panel is shown');
});

test('each integration exposes a re-validate action that records check history', async () => {
  const jar = new CookieJar();
  const email = `checks.${Date.now()}@example.test`;
  await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Checks', last_name: 'User',
      organization: 'E2E Checks Org', email, password: 'TrialPassword123!', agree: '1'
    }
  });

  // Unconfigured integrations validate without any outbound call and report why.
  for (const feature of ['smtp', 'sms', 'ai']) {
    const res = await request(jar, 'POST', `/admin/organization/${feature}/validate`, { form: {} });
    assert.equal(res.status, 302, `${feature} re-validate should redirect back`);
    assert.match(res.headers.get('location'), new RegExp(`#${feature}$`));
  }

  const page = await getText(jar, '/admin/organization');
  assert.match(page.text, /is not configured/, 'an unconfigured integration reports the reason');
  assert.match(page.text, /History is kept for 24 hours|No checks recorded/, 'the 24h log panel renders');

  // An unknown integration is rejected rather than logged.
  const bogus = await request(jar, 'POST', '/admin/organization/notreal/validate', { form: {} });
  assert.equal(bogus.status, 302);
  assert.equal(bogus.headers.get('location'), '/admin/organization');
});

test('integration validation is restricted to root administrators', async () => {
  const jar = await loginAdminWithTotp();
  for (const feature of ['smtp', 'sms', 'domain', 'ai']) {
    const res = await request(jar, 'POST', `/admin/organization/${feature}/validate`, { form: {} });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/dashboard', `${feature} validation is root-admin only`);
  }
});

test('organization settings deletes are restricted to root administrators', async () => {
  // The seeded assessor is not a tenant root admin — every delete must bounce.
  const jar = await loginAdminWithTotp();
  for (const path of ['/organization/domain/delete', '/organization/smtp/delete',
                      '/organization/sms/delete', '/organization/ai/delete']) {
    const res = await request(jar, 'POST', `/admin${path}`, { form: {} });
    assert.equal(res.status, 302, `${path} should redirect a non-root admin`);
    assert.equal(res.headers.get('location'), '/admin/dashboard', `${path} is root-admin only`);
  }
});

test('root-admin console is restricted to root administrators', async () => {
  // The seeded assessor is not a tenant root admin, so the org console is blocked.
  const jar = await loginAdminWithTotp();
  for (const path of ['/admin/organization', '/admin/licensing']) {
    const res = await request(jar, 'GET', path, { redirect: 'manual' });
    assert.equal(res.status, 302, `${path} should redirect`);
    assert.equal(res.headers.get('location'), '/admin/dashboard', `${path} is root-admin only`);
  }
});

test('passwordless registration creates a workspace without a password', async () => {
  const jar = new CookieJar();
  const email = `passkey.owner.${Date.now()}@example.test`;
  const res = await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Passkey', last_name: 'Owner',
      organization: 'E2E Passkey Org', email, agree: '1', passwordless: '1'
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.match(data.next, /\/billing\/welcome/);
});

test('passkey sign-in exposes usernameless WebAuthn options', async () => {
  const jar = new CookieJar();
  const res = await request(jar, 'POST', '/api/webauthn/login-options', { json: {} });
  assert.equal(res.status, 200);
  const opts = await res.json();
  assert.ok(opts.challenge, 'authentication options include a challenge');
});

test('signed-in user can view notifications and self-change password', async () => {
  const jar = await loginAdminWithTotp();
  const notif = await getText(jar, '/admin/notifications');
  assert.equal(notif.response.status, 200);
  assert.match(notif.text, /Notifications/);
  // A wrong current password is rejected (redirects back to settings).
  const bad = await request(jar, 'POST', '/admin/settings/password', {
    form: { current_password: 'definitely-wrong', new_password: 'NewPassword123!', confirm_password: 'NewPassword123!' }
  });
  assert.equal(bad.status, 302);
  assert.equal(bad.headers.get('location'), '/admin/settings');
});

test('redeeming an invalid invitation shows a not-found page', async () => {
  const jar = new CookieJar();
  const res = await getText(jar, '/redeem/NOPE12345');
  assert.equal(res.response.status, 200);
  assert.match(res.text, /Invitation not found/i);
});

test('registration with an unknown comp code is rejected', async () => {
  const jar = new CookieJar();
  const email = `comp.reject.${Date.now()}@example.test`;
  const res = await request(jar, 'POST', '/register', {
    form: {
      plan: 'trial', first_name: 'Comp', last_name: 'Reject',
      organization: 'E2E Comp Org', email, password: 'TrialPassword123!',
      agree: '1', comp_code: 'DOES-NOT-EXIST'
    }
  });
  // Invalid comp code re-renders the form (200) rather than creating an account.
  assert.equal(res.status, 200);
  assert.match(await res.text(), /not valid/i);
});

test('assessment creation captures a baseline version and supports manual checkpoints', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Versioning Project');
  const { assessmentId, assessmentPath } = await createSingleControlAssessment(jar, projectId);

  // The detail page shows the version UI and the current-version badge.
  const detail = await getText(jar, assessmentPath);
  assert.match(detail.text, /Version history/);
  assert.match(detail.text, /Current assessment version">v\d+/);

  // A manual checkpoint saves the current state as the next version.
  const cp = await request(jar, 'POST', `/admin/assessments/${assessmentId}/checkpoint`, {
    json: { label: 'E2E manual checkpoint' }
  });
  assert.equal(cp.status, 200);
  const cpData = await cp.json();
  assert.equal(cpData.success, true);
  assert.ok(cpData.version >= 2, 'a checkpoint should create a new version beyond the baseline');

  // The checkpoint appears in the rendered version history.
  const after = await getText(jar, assessmentPath);
  assert.match(after.text, /E2E manual checkpoint/);
});

test('reverting an assessment restores the prior control set as a new active version', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Revert Project');
  const { assessmentId, assessmentPath } = await createSingleControlAssessment(jar, projectId);

  // Probe presence via the "add" endpoint: it only reports applied>0 when the
  // control was ABSENT, so it doubles as a deterministic presence check.
  const add = (cid) => request(jar, 'POST', `/admin/assessments/${assessmentId}/apply-ai-actions`, {
    json: { actions: [{ op: 'add', controlIds: [cid], reason: 'e2e' }] }
  }).then(r => r.json());

  // Baseline v1 (from creation) has only AC-2. Adding AC-3 is a real change (applied 1).
  assert.equal((await add('AC-3')).applied, 1, 'AC-3 was absent in the baseline');
  assert.equal((await add('AC-3')).applied, 0, 'AC-3 is now present');

  // Revert to the baseline (version 1) — should restore the AC-2-only control set.
  const revert = await request(jar, 'POST', `/admin/assessments/${assessmentId}/revert/1`, { json: {} });
  assert.equal(revert.status, 200);
  const revertData = await revert.json();
  assert.equal(revertData.success, true);
  assert.equal(revertData.restoredFrom, 1);

  // After the revert: AC-3 is gone again (add reports a change), AC-2 is preserved.
  assert.equal((await add('AC-3')).applied, 1, 'revert should have removed AC-3');
  assert.equal((await add('AC-2')).applied, 0, 'revert should have preserved AC-2');

  // The revert is recorded in the audit history.
  const detail = await getText(jar, assessmentPath);
  assert.match(detail.text, /Reverted to version 1/);
});

test('the legacy sa-tool-overview.html path redirects to the live overview route', async () => {
  const jar = new CookieJar();
  const redirect = await request(jar, 'GET', '/sa-tool-overview.html', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/sa-tool-overview');

  const overview = await getText(jar, '/sa-tool-overview');
  assert.equal(overview.response.status, 200);
  assert.match(overview.text, /Aegis SA/);
  assert.doesNotMatch(overview.text, /Vanguard SA(&amp;|&)A/);
});

test('a version summary reports the controls added since the previous version', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Version Summary Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  // Baseline v1 = AC-2 (from creation). Add AC-3 → v2.
  const apply = await request(jar, 'POST', `/admin/assessments/${assessmentId}/apply-ai-actions`, {
    json: { actions: [{ op: 'add', controlIds: ['AC-3'], reason: 'e2e' }] }
  });
  assert.equal((await apply.json()).success, true);

  const s = await (await request(jar, 'GET', `/admin/assessments/${assessmentId}/versions/2/summary`)).json();
  assert.equal(s.success, true);
  assert.equal(s.previousVersion, 1);
  assert.ok(s.added.includes('AC-3'), 'AC-3 should be reported as added in v2');

  const base = await (await request(jar, 'GET', `/admin/assessments/${assessmentId}/versions/1/summary`)).json();
  assert.equal(base.isBaseline, true);
});

test('viewing a past version renders a read-only snapshot without the assistant', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E Version View Project');
  const { assessmentId } = await createSingleControlAssessment(jar, projectId);

  const view = await getText(jar, `/admin/assessments/${assessmentId}?version=1`);
  assert.equal(view.response.status, 200);
  assert.match(view.text, /read-only snapshot of version 1/);
  assert.doesNotMatch(view.text, /AIAssistConfig/, 'the assistant must not load on a read-only version view');
});
