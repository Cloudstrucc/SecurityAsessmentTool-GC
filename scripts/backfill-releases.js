#!/usr/bin/env node
// Backfill GitHub Releases from the curated list in config/releases.js.
// Creates one tag + release per version, anchored to its commit. Idempotent:
// releases that already exist are skipped. Requires an authenticated `gh` CLI.
//
//   node scripts/backfill-releases.js --dry-run   # print what it would do
//   node scripts/backfill-releases.js             # create the releases
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CURATED } = require('../config/releases');

const dryRun = process.argv.includes('--dry-run');
const newest = CURATED[0].version; // CURATED is newest-first
const ordered = [...CURATED].reverse(); // create oldest-first so "Latest" is correct

function gh(args, opts) { return execFileSync('gh', args, opts); }

let created = 0, skipped = 0;
for (const r of ordered) {
  const tag = 'v' + r.version;
  const title = `${tag} — ${r.name}`;
  const isLatest = r.version === newest;

  let exists = false;
  try { gh(['release', 'view', tag], { stdio: 'ignore' }); exists = true; } catch (e) { /* not found */ }
  if (exists) { console.log(`• skip (already exists): ${tag}`); skipped++; continue; }

  // GitHub's release API rejects short SHAs for target_commitish — resolve to full.
  let fullSha = r.commit;
  try { fullSha = execFileSync('git', ['rev-parse', r.commit], { encoding: 'utf8' }).trim(); } catch (e) {}

  const tmp = path.join(os.tmpdir(), `aegis-rel-${tag}.md`);
  fs.writeFileSync(tmp, r.body);
  const args = ['release', 'create', tag,
    '--target', fullSha,
    '--title', title,
    '--notes-file', tmp,
    `--latest=${isLatest ? 'true' : 'false'}`];

  if (dryRun) {
    console.log(`[dry-run] gh release create ${tag} --target ${r.commit} --title "${title}" --latest=${isLatest}`);
  } else {
    try { gh(args, { stdio: 'inherit' }); created++; console.log(`✓ created ${tag}`); }
    catch (e) { console.error(`✗ failed ${tag}: ${e.message}`); }
  }
  try { fs.unlinkSync(tmp); } catch (e) {}
}
console.log(`\n${dryRun ? '[dry-run] ' : ''}Done. ${created} created, ${skipped} skipped, ${CURATED.length} total.`);
