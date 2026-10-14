#!/usr/bin/env node
/**
 * Organization / plan administration.
 *
 *   node scripts/manage-org.js list
 *   node scripts/manage-org.js set-plan --org 1 --plan basic
 *   node scripts/manage-org.js set-plan --org "Cloudstrucc" --plan basic
 *   node scripts/manage-org.js root-admin --email someone@example.com --on
 *
 * Environment:
 *   DB_PATH=/path/to/sa-tool.db targets a specific database.
 *   On Azure App Service that is /home/site/data/sa-tool.db (the default there).
 *
 * IMPORTANT — the app holds the database in memory (sql.js) and rewrites the
 * whole file when it saves. A change made by this script while the app is
 * running can be overwritten by the next request that writes. Restart the app
 * immediately after running this, and do not use the app in between:
 *
 *   az webapp restart --name vanguard-saa-dev --resource-group gc-sa-tool-dev-rg
 */

const path = require('path');
const { initDatabase, saveDatabase, all, get, run } = require('../models/database');
const billing = require('../config/billing');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i++; }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/manage-org.js list
  node scripts/manage-org.js set-plan --org <id|name> --plan <${billing.planList().map(p => p.key).join('|')}> [--status active]
  node scripts/manage-org.js root-admin --email <email> [--on|--off]

Environment:
  DB_PATH=/path/to/sa-tool.db  (Azure App Service: /home/site/data/sa-tool.db)

After any change, restart the app so it reloads the file:
  az webapp restart --name <app> --resource-group <rg>
`);
}

/** Resolve an org by numeric id or by (case-insensitive) exact name. */
function findOrg(ref) {
  if (/^\d+$/.test(String(ref))) {
    return get('SELECT * FROM organizations WHERE id = ?', [Number(ref)]);
  }
  return get('SELECT * FROM organizations WHERE LOWER(name) = LOWER(?)', [String(ref).trim()]);
}

function listOrgs() {
  const orgs = all(`SELECT o.*,
      (SELECT COUNT(*) FROM projects p WHERE p.organization_id = o.id AND p.archived_at IS NULL) AS projects_used,
      (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS members
    FROM organizations o ORDER BY o.id`);
  if (!orgs.length) { console.log('No organizations.'); return; }
  console.table(orgs.map(o => ({
    id: o.id,
    name: o.name,
    plan: o.plan,
    status: o.status,
    projects: `${o.projects_used} / ${o.projects_limit == null ? '∞' : o.projects_limit}`,
    seats: `${o.members} / ${o.seats_limit == null ? '∞' : o.seats_limit}`,
    trial_ends: o.trial_ends_at ? String(o.trial_ends_at).slice(0, 10) : '—'
  })));

  const roots = all("SELECT id, email, name, account_type FROM users WHERE is_root_admin = 1 ORDER BY id");
  console.log('\nPlatform root admins (can reach /admin/comp-codes):');
  console.table(roots.length ? roots : [{ note: 'none — set ADMIN_EMAIL and restart, or use root-admin below' }]);

  console.log('\nPlans:');
  console.table(billing.planList().map(p => ({
    key: p.key, label: p.label,
    seats: p.seats == null ? '∞' : p.seats,
    projects: p.projects == null ? '∞' : p.projects,
    tokens: p.tokens == null ? '∞' : p.tokens
  })));
}

function setPlan(args) {
  const ref = args.org;
  if (!ref || ref === true) throw new Error('Missing --org <id|name>');
  const planKey = args.plan;
  if (!planKey || planKey === true) throw new Error('Missing --plan <key>');
  if (!billing.isValidPlan(planKey)) {
    throw new Error(`Unknown plan "${planKey}". Valid: ${billing.planList().map(p => p.key).join(', ')}`);
  }
  const org = findOrg(ref);
  if (!org) throw new Error(`No organization matching "${ref}". Run "list" to see them.`);

  const plan = billing.getPlan(planKey);
  // 'active' is the right status for a comped/manual upgrade: 'pending' would
  // keep the org gated waiting on a Stripe webhook that will never arrive.
  const status = (args.status && args.status !== true) ? String(args.status) : 'active';

  const before = `${org.plan}/${org.status} · projects ${org.projects_limit == null ? '∞' : org.projects_limit}`;
  run(`UPDATE organizations
         SET plan = ?, status = ?, seats_limit = ?, projects_limit = ?,
             trial_ends_at = CASE WHEN ? = 'trial' THEN trial_ends_at ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [plan.key, status, plan.seats, plan.projects, plan.key, org.id]);

  const after = get('SELECT * FROM organizations WHERE id = ?', [org.id]);
  console.log(`Organization #${org.id} "${org.name}"`);
  console.log(`  before: ${before}`);
  console.log(`  after:  ${after.plan}/${after.status} · projects ${after.projects_limit == null ? '∞' : after.projects_limit}`
    + ` · seats ${after.seats_limit == null ? '∞' : after.seats_limit}`);
}

function setRootAdmin(args) {
  const email = args.email;
  if (!email || email === true) throw new Error('Missing --email <email>');
  const on = args.off ? 0 : 1;
  const user = get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [String(email).trim()]);
  if (!user) throw new Error(`No user with email ${email}`);

  run('UPDATE users SET is_root_admin = ? WHERE id = ?', [on, user.id]);
  console.log(`${on ? 'Granted' : 'Revoked'} platform root admin for ${user.email} (id ${user.id}).`);

  // Startup runs a corrective backfill that demotes root admins who own an org,
  // so this does not survive a restart for an org owner. Say so loudly rather
  // than let it look like a flaky change.
  if (on && user.account_type === 'owner' && user.organization_id) {
    console.log('\n  ⚠  This will be REVERTED on the next app start.');
    console.log('     models/database.js demotes is_root_admin for users whose account_type is');
    console.log('     "owner" and who belong to an organization. For a durable platform admin,');
    console.log('     set ADMIN_EMAIL to this address in the environment and restart, or use');
    console.log('     "set-plan" instead if all you need is a higher project limit.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) { printUsage(); return; }

  await initDatabase();
  console.log(`Database: ${process.env.DB_PATH || '(default)'}\n`);

  if (command === 'list') { listOrgs(); return; }
  if (command === 'set-plan') { setPlan(args); }
  else if (command === 'root-admin') { setRootAdmin(args); }
  else { throw new Error(`Unknown command: ${command}`); }

  saveDatabase();
  console.log('\nSaved. Restart the app so it reloads the file:');
  console.log('  az webapp restart --name vanguard-saa-dev --resource-group gc-sa-tool-dev-rg');
}

main().catch(err => {
  console.error('\nError: ' + err.message);
  printUsage();
  process.exit(1);
});
