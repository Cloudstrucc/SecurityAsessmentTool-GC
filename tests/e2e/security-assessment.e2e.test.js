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

async function request(jar, method, url, { form, redirect = 'manual' } = {}) {
  const headers = {};
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
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

test.skip('self-assessment creation flow', () => {
  // This main branch does not currently include /self-assessment routes.
  // Add executable coverage here when that feature lands on main.
});
