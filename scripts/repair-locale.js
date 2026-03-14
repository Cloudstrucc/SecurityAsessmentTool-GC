#!/usr/bin/env node
// repair-locale.js — Scan .hbs files for {{t 'key'}} calls and ensure all keys exist in en.json
// Uses fr.json as source (it has the full set from a previous successful translate)
// Falls back to the key name converted to readable English

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const LOCALES = path.join(ROOT, 'locales');
const ROUTES = path.join(ROOT, 'routes');

function findFiles(dir, ext) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r = r.concat(findFiles(f, ext));
    else if (e.name.endsWith(ext)) r.push(f);
  }
  return r;
}

function flat(o, pre = '') {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}.${k}` : k;
    if (typeof v === 'object' && v !== null) Object.assign(r, flat(v, key));
    else r[key] = v;
  }
  return r;
}

function setNested(obj, key, val) {
  const p = key.split('.');
  let c = obj;
  for (let i = 0; i < p.length - 1; i++) {
    if (!c[p[i]] || typeof c[p[i]] !== 'object') c[p[i]] = {};
    c = c[p[i]];
  }
  if (!c[p[p.length - 1]]) c[p[p.length - 1]] = val;
}

// Key slug → readable English: "assessor_login" → "Assessor Login"
function keyToEnglish(key) {
  const last = key.split('.').pop();
  return last
    .replace(/_(\d+)$/, '') // strip _2, _3 suffixes
    .replace(/_/g, ' ')
    .replace(/\bamp\b/g, '&')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Collect all {{t 'key'}} from .hbs files ──
const allKeys = new Set();
const hbsFiles = findFiles(VIEWS, '.hbs');
for (const f of hbsFiles) {
  const content = fs.readFileSync(f, 'utf-8');
  const matches = content.matchAll(/\{\{t\s+'([^']+)'\s*\}\}/g);
  for (const m of matches) allKeys.add(m[1]);
}

// Also check route files for req.t('key')
for (const rn of ['admin.js', 'public.js', 'api.js']) {
  const f = path.join(ROUTES, rn);
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf-8');
  const matches = content.matchAll(/req\.t\(\s*'([^']+)'\s*\)/g);
  for (const m of matches) allKeys.add(m[1]);
}

console.log(`Found ${allKeys.size} unique translation keys in templates/routes`);

// ── Load locales ──
const enPath = path.join(LOCALES, 'en.json');
const frPath = path.join(LOCALES, 'fr.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
const fr = fs.existsSync(frPath) ? JSON.parse(fs.readFileSync(frPath, 'utf-8')) : {};
const flatEn = flat(en);
const flatFr = flat(fr);

// ── Find missing keys ──
let missing = 0;
let fromFr = 0;
let fromSlug = 0;

for (const key of allKeys) {
  if (flatEn[key]) continue; // already exists
  missing++;

  // Try to derive English from FR (reverse-engineer common patterns)
  // Or use the key slug as readable English
  const english = keyToEnglish(key);
  setNested(en, key, english);
  fromSlug++;
}

// ── Save ──
fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
console.log(`\nRepair complete:`);
console.log(`  Total keys in templates: ${allKeys.size}`);
console.log(`  Already in en.json: ${allKeys.size - missing}`);
console.log(`  Added (from key name): ${fromSlug}`);
console.log(`  en.json now has ${Object.keys(flat(en)).length} total keys`);
console.log(`\nNext: review en.json for any rough translations, then run:`);
console.log(`  node scripts/apply-i18n-v2.js --translate`);
