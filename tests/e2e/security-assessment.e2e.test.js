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
const SADD_PATH = '/Users/frederickpearson/repos/nintex-dataverse/SADD.html';

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

test('admin without MFA is challenged to set up TOTP', async () => {
  const jar = new CookieJar();
  const response = await request(jar, 'POST', '/admin/login', {
    form: { email: USERS.needsMfa.email, password: USERS.needsMfa.password }
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/mfa-setup');
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

test('admin can create editable ATO records and manage linked POA&M items', async () => {
  const jar = await loginAdminWithTotp();
  const { projectId } = await createAdminProject(jar, 'E2E ATO POAM Project');
  const { assessmentPath, assessmentId } = await createSingleControlAssessment(jar, projectId);

  const atoCreate = await request(jar, 'POST', `/admin/projects/${projectId}/ato/new`, {
    form: {
      assessment_id: assessmentId,
      record_type: 'iato',
      title: 'E2E Interim Authorization',
      system_name: 'E2E ATO POAM Project',
      organization_name: 'E2E Department',
      authorizing_official: 'Authorizing Official',
      assessor: 'E2E Assessor',
      authorization_status: 'draft',
      executive_summary: 'Editable iATO summary.',
      system_description: 'Editable system description.',
      assessment_scope: 'Editable assessment scope.',
      risk_summary: 'Editable risk summary.',
      residual_risk_statement: 'Editable residual risk statement.',
      conditions_of_authorization: 'Editable authorization conditions.',
      security_control_summary: 'Editable control summary.',
      poam_summary: 'Editable POA&M summary.',
      assessor_notes: 'Editable assessor notes.'
    }
  });
  assert.equal(atoCreate.status, 302);
  const atoPath = atoCreate.headers.get('location');
  assert.match(atoPath, /^\/admin\/ato\/\d+$/);
  const atoId = atoPath.match(/(\d+)$/)[1];

  const atoPage = await getText(jar, atoPath);
  assert.match(atoPage.text, /E2E Interim Authorization/);
  assert.match(atoPage.text, /Editable iATO summary/);

  const addPoam = await request(jar, 'POST', `/admin/assessments/${assessmentId}/checklist/add`, {
    form: {
      ato_record_id: atoId,
      control_id: 'AC-2',
      description: 'E2E finding requiring remediation',
      risk_level: 'medium',
      deadline: '2026-12-31',
      assigned_to: 'Control Owner',
      remediation_plan: 'Initial mitigation plan',
      milestone: 'Initial milestone',
      residual_risk: 'Initial residual risk',
      assessor_notes: 'Initial POA&M assessor note'
    }
  });
  assert.equal(addPoam.status, 302);
  const poamPage = await getText(jar, assessmentPath);
  assert.match(poamPage.text, /E2E finding requiring remediation/);
  assert.match(poamPage.text, /Initial mitigation plan/);
  const itemId = poamPage.text.match(/\/admin\/assessments\/\d+\/poam\/(\d+)\/delete/)?.[1];
  assert.ok(itemId, 'POA&M item id should be visible in delete form');

  const updatePoam = await request(jar, 'POST', `/admin/assessments/${assessmentId}/poam/${itemId}/update`, {
    form: {
      description: 'E2E finding updated after review',
      status: 'in-progress',
      risk_level: 'high',
      deadline: '2026-11-30',
      assigned_to: 'Updated Owner',
      remediation_plan: 'Updated mitigation plan',
      milestone: 'Updated milestone note',
      residual_risk: 'Updated residual risk note',
      assessor_notes: 'Updated assessor POA&M note',
      ato_record_id: atoId
    }
  });
  assert.equal(updatePoam.status, 302);
  const updated = await getText(jar, assessmentPath);
  assert.match(updated.text, /E2E finding updated after review/);
  assert.match(updated.text, /Updated mitigation plan/);
  assert.match(updated.text, /Updated residual risk note/);
  assert.match(updated.text, /Updated assessor POA(?:&amp;|&)M note/);
});

test('admin can browse the security control catalog', async () => {
  const jar = await loginAdminWithTotp();
  const page = await getText(jar, '/admin/security-controls?q=account');
  assert.equal(page.response.status, 200);
  assert.match(page.text, /Security Control Catalog/);
  assert.match(page.text, /AC-2/);
  assert.match(page.text, /Account Management/);
});

test.skip('self-assessment creation flow', () => {
  // This main branch does not currently include /self-assessment routes.
  // Add executable coverage here when that feature lands on main.
});
