#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const { generateSecret } = require('otplib');
const { initDatabase, get, run } = require('../models/database');

const DEFAULT_TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/manage-users.js list
  node scripts/manage-users.js admin --email <email> --password <password> [--name <name>] [--organization <org>]
  node scripts/manage-users.js break-glass --email <email> --password <password> [--name <name>]
  node scripts/manage-users.js test-assessor [--email <email>] [--password <password>] [--totp-secret <secret>]
  node scripts/manage-users.js test-client [--email <email>] [--password <password>] [--totp-secret <secret>]

Environment:
  DB_PATH=/path/to/sa-tool.db can target a specific database, which the test suite uses.
`);
}

function requireValue(args, key) {
  if (!args[key]) throw new Error(`Missing required --${key}`);
  return String(args[key]);
}

function upsertUser({ email, password, name, role, title, organization, mfaEnabled, totpSecret, mfaMode, isBreakGlass }) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  const passwordHash = bcrypt.hashSync(password, 12);

  if (existing) {
    run(
      `UPDATE users SET password = ?, name = ?, role = ?, title = ?, organization = ?,
        is_active = 1, totp_secret = ?, mfa_enabled = ?, mfa_mode = ?,
        is_break_glass = ?
       WHERE id = ?`,
      [
        passwordHash,
        name,
        role,
        title || '',
        organization || '',
        totpSecret || null,
        mfaEnabled ? 1 : 0,
        mfaMode || 'totp',
        isBreakGlass ? 1 : 0,
        existing.id
      ]
    );
    return { id: existing.id, created: false };
  }

  const id = run(
    `INSERT INTO users
      (email, password, name, role, title, organization, is_active, totp_secret, mfa_enabled, mfa_mode, is_break_glass)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      normalizedEmail,
      passwordHash,
      name,
      role,
      title || '',
      organization || '',
      totpSecret || null,
      mfaEnabled ? 1 : 0,
      mfaMode || 'totp',
      isBreakGlass ? 1 : 0
    ]
  );
  return { id, created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    printUsage();
    return;
  }

  await initDatabase();

  if (command === 'list') {
    const users = require('../models/database').all(
      `SELECT id, email, name, role, organization, is_active, mfa_enabled, mfa_mode, is_break_glass, created_at
       FROM users ORDER BY role, email`
    );
    console.table(users);
    return;
  }

  if (command === 'admin') {
    const email = requireValue(args, 'email');
    const password = requireValue(args, 'password');
    const secret = args['totp-secret'] || generateSecret();
    const result = upsertUser({
      email,
      password,
      name: args.name || 'Security Assessor',
      role: 'assessor',
      title: args.title || 'Security Assessor',
      organization: args.organization || 'Security Team',
      mfaEnabled: args['disable-mfa'] ? 0 : 1,
      totpSecret: args['disable-mfa'] ? null : secret,
      mfaMode: args['disable-mfa'] ? 'none' : 'totp',
      isBreakGlass: 0
    });
    console.log(`${result.created ? 'Created' : 'Updated'} admin assessor: ${email}`);
    if (!args['disable-mfa']) console.log(`TOTP secret: ${secret}`);
    return;
  }

  if (command === 'break-glass') {
    const email = requireValue(args, 'email');
    const password = requireValue(args, 'password');
    const result = upsertUser({
      email,
      password,
      name: args.name || 'Break Glass Administrator',
      role: 'assessor',
      title: args.title || 'Break Glass Administrator',
      organization: args.organization || 'Security Operations',
      mfaEnabled: 0,
      totpSecret: null,
      mfaMode: 'none',
      isBreakGlass: 1
    });
    console.log(`${result.created ? 'Created' : 'Updated'} break-glass admin: ${email}`);
    console.log('This account bypasses TOTP/passkey and should be stored offline and monitored.');
    return;
  }

  if (command === 'test-assessor' || command === 'test-client') {
    const isAssessor = command === 'test-assessor';
    const email = args.email || (isAssessor ? 'e2e.assessor@example.test' : 'e2e.client@example.test');
    const password = args.password || 'TestPassword123!';
    const secret = args['totp-secret'] || DEFAULT_TEST_TOTP_SECRET;
    const result = upsertUser({
      email,
      password,
      name: args.name || (isAssessor ? 'E2E Assessor' : 'E2E Client'),
      role: isAssessor ? 'assessor' : 'client',
      title: isAssessor ? 'Test Assessor' : 'Evidence Provider',
      organization: args.organization || 'E2E Test Organization',
      mfaEnabled: 1,
      totpSecret: secret,
      mfaMode: 'totp',
      isBreakGlass: 0
    });
    console.log(`${result.created ? 'Created' : 'Updated'} ${isAssessor ? 'test assessor' : 'test client'}: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`TOTP secret: ${secret}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch(err => {
  console.error(err.message);
  printUsage();
  process.exit(1);
});
node scripts/manage-users.js break-glass \
  --email admin+2@vanguardcs.ca \
  --password "$BG_PASS" \
  --name "Administrator" \
  --organization "VCS"

node scripts/manage-users.js admin \
  --email admin+1@vcs.com \
  --password "$ADMIN_PASS" \
  --name "Security Assessor" \
  --organization "VCS"
node scripts/manage-users.js admin \
  --email admin+1@vcs.com \
  --password "$ADMIN_PASS" \
  --name "Security Assessor" \
  --organization "VCS"


  Created admin assessor: admin+1@vcs.com
TOTP secret: C7PT6G6BL7O4KBC4VS4CSQ53G4D2FN74


cd /home/site/wwwroot

read -s BG_PASS
export BG_PASS="$BG_PASS"

node - <<'NODE'
const bcrypt = require('bcryptjs');
const { initDatabase, get } = require('./models/database');

(async () => {
  await initDatabase();

  const email = 'breakglass-admin@.com'.toLowerCase();

  const user = get(
    `SELECT id, email, password, role, is_active, mfa_enabled, mfa_mode, is_break_glass
     FROM users
     WHERE email = ?`,
    [email]
  );

  if (!user) {
    console.log('USER NOT FOUND IN THIS DATABASE');
    process.exit(1);
  }

  console.log({
    id: user.id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    mfa_enabled: user.mfa_enabled,
    mfa_mode: user.mfa_mode,
    is_break_glass: user.is_break_glass,
    has_password_hash: !!user.password
  });

  const ok = bcrypt.compareSync(process.env.BG_PASS, user.password);
  console.log('PASSWORD_MATCH:', ok);
})();
NODE