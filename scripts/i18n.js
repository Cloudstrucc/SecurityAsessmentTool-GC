#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// i18n.js — Unified localization script for GC SA&A Tool
//
// Commands:
//   node scripts/i18n.js --dry-run     Preview extractions (no changes)
//   node scripts/i18n.js --apply        Extract + replace + repair en.json + backup
//   node scripts/i18n.js --translate    Translate en → all languages via Anthropic API
//   node scripts/i18n.js --status       Show translation coverage per language
//
// Workflow for new features:
//   1. Build your feature with hardcoded English
//   2. node scripts/i18n.js --apply
//   3. node scripts/i18n.js --translate
//   4. Test: npm start → /?lang=fr
//
// What --apply does (in order):
//   a) Scans all .hbs files for hardcoded English text
//   b) Generates locale keys and replaces text with {{t 'key'}}
//   c) Scans route files for req.flash() strings and wraps with req.t()
//   d) REPAIR: scans all {{t 'key'}} calls and ensures every key exists in en.json
//   e) Creates backups in _i18n_backup/
// ═══════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ── Config ──
const ROOT = path.resolve(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const ROUTES = path.join(ROOT, 'routes');
const LOCALES = path.join(ROOT, 'locales');
const BACKUP = path.join(ROOT, '_i18n_backup');

const LANGUAGES = [
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
];

const MODE = process.argv[2];
if (!['--dry-run', '--apply', '--translate', '--status'].includes(MODE)) {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║   GC SA&A Tool — i18n Script                                ║
  ╚══════════════════════════════════════════════════════════════╝

  Usage:
    node scripts/i18n.js --dry-run      Preview what will be extracted
    node scripts/i18n.js --apply         Extract + replace + repair en.json
    node scripts/i18n.js --translate     Translate en → all languages via API
    node scripts/i18n.js --status        Show translation coverage

  Workflow after adding a new feature:
    1. node scripts/i18n.js --apply
    2. node scripts/i18n.js --translate
  `);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function findFiles(dir, ext) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r = r.concat(findFiles(f, ext));
    else if (e.name.endsWith(ext)) r.push(f);
  }
  return r;
}

function filePrefix(f) {
  return path.relative(VIEWS, f).replace(/\.hbs$/, '').replace(/\\/g, '/')
    .replace('layouts/', 'layout.').replace('public/', '').replace('partials/', 'partial.')
    .replace(/\//g, '.').replace(/-/g, '_');
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

function backup(filePath) {
  const rel = path.relative(ROOT, filePath);
  const bp = path.join(BACKUP, rel);
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  fs.copyFileSync(filePath, bp);
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 5).join('_') || 'x';
}

function keyToEnglish(key) {
  const last = key.split('.').pop();
  let text = last
    .replace(/_(\d+)$/, '')       // strip _2 suffix
    .replace(/_/g, ' ')           // underscores to spaces
    .replace(/\bamp\b/g, '&');    // amp → &

  // Split known compound words that lost their separator during slugification
  const compounds = {
    'selfassessment': 'Self-Assessment', 'selfassessments': 'Self-Assessments',
    'preassessment': 'Pre-Assessment', 'preassessments': 'Pre-Assessments',
    'preintake': 'Pre-Intake', 'prefill': 'Pre-fill', 'prepopulate': 'Pre-populate',
    'autopopulate': 'Auto-populate', 'autofill': 'Auto-fill', 'autogenerate': 'Auto-generate',
    'multifactor': 'Multi-Factor', 'multiframework': 'Multi-Framework',
    'multitenant': 'Multi-Tenant', 'multijurisdiction': 'Multi-Jurisdiction',
    'golive': 'Go-Live', 'reenter': 'Re-enter', 'reenroll': 'Re-enroll',
    'reregister': 'Re-register', 'reactivate': 'Reactivate',
    'onprem': 'On-Prem', 'byod': 'BYOD',
    'username': 'Username', 'timestamp': 'Timestamp', 'workflow': 'Workflow',
    'checkbox': 'Checkbox', 'dropdown': 'Dropdown', 'readonly': 'Read-only',
    'signup': 'Sign Up', 'signin': 'Sign In', 'signout': 'Sign Out',
    'login': 'Login', 'logout': 'Logout',
    'saampa': 'SA&A', 'poam': 'POA&M', 'iato': 'iATO',
    'webapp': 'Web App', 'webauthn': 'WebAuthn',
    'gcnet': 'GCNet', 'gccase': 'GCCase', 'gcdocs': 'GCDocs',
    'projectspecific': 'Project-specific',
    'statelocal': 'State/Local', 'stateramp': 'StateRAMP',
    '6digit': '6-digit', '14day': '14-day', '10characters': '10 characters',
  };
  text = text.replace(/\b\w+\b/g, word => compounds[word.toLowerCase()] || word);

  // Title case remaining words (skip already-cased compound replacements)
  return text.replace(/\b([a-z])(\w*)\b/g, (m, first, rest) => first.toUpperCase() + rest);
}

function shouldSkip(t) {
  t = t.trim();
  if (t.length < 2 || t.length > 250) return true;
  if (/^\{\{/.test(t)) return true;
  if (/^[^a-zA-Z]*$/.test(t)) return true;
  if (/^[a-z0-9_.@:\/\-]+$/.test(t)) return true;
  if (/^\d/.test(t)) return true;
  if (/^(ITSG|NIST|ISO|GDPR|NIS2|HIPAA|FedRAMP|SOC|PCI|CMMC|NCSC|ASD|ISM|DORA|PBMM|CIS|MFA|TOTP|TLS|HTTPS|WAF|API|CSV|PDF|JSON|HTML|CSS|SSO|WebAuthn)/.test(t)) return true;
  if ((t.match(/\{\{/g) || []).length > 0) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 1: EXTRACT — Find hardcoded English in .hbs files
// ═══════════════════════════════════════════════════════════════════════════════

function extractView(content, prefix) {
  const results = [];
  const usedPat = new Set();
  const usedKey = new Set();

  // Strip script/style/title/meta for analysis
  const clean = content
    .replace(/<script[\s\S]*?<\/script>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/<title[\s\S]*?<\/title>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/<meta[^>]*>/gi, '');

  function mk(cat, text) {
    let k = `${prefix}.${cat}.${slug(text)}`;
    let n = 1;
    while (usedKey.has(k)) k = `${prefix}.${cat}.${slug(text)}_${++n}`;
    usedKey.add(k);
    return k;
  }

  function addSimple(cat, fullMatch, textInMatch, text) {
    if (usedPat.has(fullMatch) || shouldSkip(text)) return;
    const openTag = fullMatch.substring(0, fullMatch.indexOf('>') + 1);
    if (/\{\{/.test(openTag)) return;
    usedPat.add(fullMatch);
    const key = mk(cat, text);
    results.push({ key, text: text.trim(), pattern: fullMatch, replacement: fullMatch.replace(textInMatch, `{{t '${key}'}}`), category: cat });
  }

  function addIconText(cat, fullMatch, iconPart, textPart) {
    const t = textPart.trim();
    if (usedPat.has(fullMatch) || shouldSkip(t)) return;
    const openTag = fullMatch.substring(0, fullMatch.indexOf('>') + 1);
    if (/\{\{/.test(openTag)) return;
    usedPat.add(fullMatch);
    const key = mk(cat, t);
    results.push({ key, text: t, pattern: fullMatch, replacement: fullMatch.replace(textPart, `{{t '${key}'}}`), category: cat });
  }

  let m;

  // Simple text in tags
  for (const tag of ['h1','h2','h3','h4','h5','h6','th','label','legend','small','strong','em','li']) {
    const re = new RegExp(`<${tag}\\b[^>]*>([^<{\\n]+)</${tag}>`, 'gi');
    while ((m = re.exec(clean)) !== null) addSimple(tag, m[0], m[1], m[1].trim());
  }

  // Paragraphs
  const pRe = /<p\b[^>]*>([^<{]+)<\/p>/gi;
  while ((m = pRe.exec(clean)) !== null) { if (m[1].trim().length >= 5) addSimple('p', m[0], m[1], m[1].trim()); }

  // Simple anchors
  const aSimple = /<a\b[^>]*>([^<{]+)<\/a>/gi;
  while ((m = aSimple.exec(clean)) !== null) { const t = m[1].trim(); if (t.length >= 3 && !/^(#|http|javascript)/.test(t)) addSimple('link', m[0], m[1], t); }

  // Anchors with icon
  const aIcon = /<a\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/a>/gi;
  while ((m = aIcon.exec(clean)) !== null) addIconText('link', m[0], m[1], m[2]);

  // Buttons simple
  const btnSimple = /<button\b[^>]*>([^<{]+)<\/button>/gi;
  while ((m = btnSimple.exec(clean)) !== null) addSimple('btn', m[0], m[1], m[1].trim());

  // Buttons with icon
  const btnIcon = /<button\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/button>/gi;
  while ((m = btnIcon.exec(clean)) !== null) addIconText('btn', m[0], m[1], m[2]);

  // Buttons with span
  const btnSpan = /<button\b[^>]*>(\s*<span\b[^>]*>[^<]*<\/span>\s*)([^<{]+)<\/button>/gi;
  while ((m = btnSpan.exec(clean)) !== null) addIconText('btn', m[0], m[1], m[2]);

  // Spans with class
  const spanSimple = /<span\b[^>]*class="[^"]*"[^>]*>([^<{]+)<\/span>/gi;
  while ((m = spanSimple.exec(clean)) !== null) { if (m[1].trim().length >= 3) addSimple('span', m[0], m[1], m[1].trim()); }

  // Spans with icon
  const spanIcon = /<span\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/span>/gi;
  while ((m = spanIcon.exec(clean)) !== null) addIconText('span', m[0], m[1], m[2]);

  // Stat labels
  const stat = /<div\s+class="stat-label"[^>]*>([^<{]+)<\/div>/gi;
  while ((m = stat.exec(clean)) !== null) addSimple('stat', m[0], m[1], m[1].trim());

  // Card headers with icon
  const cardH = /<div\s+class="card-header[^"]*"[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/div>/gi;
  while ((m = cardH.exec(clean)) !== null) addIconText('card', m[0], m[1], m[2]);

  // Placeholders
  const ph = /placeholder="([^"{]+)"/gi;
  while ((m = ph.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 4 && !shouldSkip(t)) {
      const key = mk('ph', t);
      if (!usedPat.has(m[0])) { usedPat.add(m[0]); results.push({ key, text: t, pattern: m[0], replacement: `placeholder="{{t '${key}'}}"`, category: 'ph' }); }
    }
  }

  // Title attributes
  const tattr = /title="([^"{]+)"/gi;
  while ((m = tattr.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 4 && !shouldSkip(t) && /[A-Z]/.test(t)) {
      const key = mk('tattr', t);
      if (!usedPat.has(m[0])) { usedPat.add(m[0]); results.push({ key, text: t, pattern: m[0], replacement: `title="{{t '${key}'}}"`, category: 'tattr' }); }
    }
  }

  // Divs with text classes
  const divText = /<div\b[^>]*class="[^"]*(?:fw-|cap-title|cap-desc|text-muted|small|ri-title|ri-detail|q-hint|label|value)[^"]*"[^>]*>([^<{]+)<\/div>/gi;
  while ((m = divText.exec(clean)) !== null) { if (m[1].trim().length >= 4) addSimple('div', m[0], m[1], m[1].trim()); }

  return results;
}

function extractFlash(content, file) {
  const ex = [], prefix = path.basename(file, '.js'), used = new Set();
  const re = /req\.flash\(\s*'(\w+)'\s*,\s*'([^']{5,})'\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (/req\.t\(/.test(m[2]) || used.has(m[0])) continue;
    used.add(m[0]);
    const k = `flash.${prefix}.${slug(m[2])}`;
    ex.push({ key: k, text: m[2], pattern: m[0], replacement: `req.flash('${m[1]}', req.t('${k}'))`, category: 'flash' });
  }
  return ex;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 2: REPAIR — Find all {{t 'key'}} and ensure keys exist in en.json
// ═══════════════════════════════════════════════════════════════════════════════

function repairLocale(en) {
  const flatEn = flat(en);
  const allKeys = new Set();
  let added = 0;
  let fixed = 0;

  // Scan .hbs for {{t 'key'}}
  for (const f of findFiles(VIEWS, '.hbs')) {
    const content = fs.readFileSync(f, 'utf-8');
    for (const m of content.matchAll(/\{\{t\s+'([^']+)'\s*\}\}/g)) allKeys.add(m[1]);
  }

  // Scan routes for req.t('key')
  for (const rn of ['admin.js', 'public.js', 'api.js']) {
    const f = path.join(ROUTES, rn);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf-8');
    for (const m of content.matchAll(/req\.t\(\s*'([^']+)'\s*\)/g)) allKeys.add(m[1]);
  }

  // Helper: what the OLD bad keyToEnglish would have produced
  function oldKeyToEnglish(key) {
    return key.split('.').pop().replace(/_(\d+)$/, '').replace(/_/g, ' ').replace(/\bamp\b/g, '&').replace(/\b\w/g, c => c.toUpperCase());
  }

  for (const key of allKeys) {
    const existing = flatEn[key];
    if (!existing) {
      // Missing — add it
      setNested(en, key, keyToEnglish(key));
      added++;
    } else {
      // Check if the existing value looks like a bad auto-generated one
      // (matches what old keyToEnglish would produce but differs from improved version)
      const oldVal = oldKeyToEnglish(key);
      const newVal = keyToEnglish(key);
      if (existing === oldVal && oldVal !== newVal) {
        // Overwrite with improved value
        const p = key.split('.');
        let c = en;
        for (let i = 0; i < p.length - 1; i++) c = c[p[i]];
        c[p[p.length - 1]] = newVal;
        fixed++;
      }
    }
  }

  return { total: allKeys.size, existing: allKeys.size - added, added, fixed };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PHASE 3: TRANSLATE — en → all languages via Anthropic API
// ═══════════════════════════════════════════════════════════════════════════════

async function translateLocale(src, tgt, name) {
  const srcData = JSON.parse(fs.readFileSync(path.join(LOCALES, `${src}.json`), 'utf-8'));
  let tgtData = {};
  const tgtPath = path.join(LOCALES, `${tgt}.json`);
  if (fs.existsSync(tgtPath)) tgtData = JSON.parse(fs.readFileSync(tgtPath, 'utf-8'));
  const fSrc = flat(srcData), fTgt = flat(tgtData);
  const missing = {};
  for (const [k, v] of Object.entries(fSrc)) { if (!fTgt[k] && typeof v === 'string') missing[k] = v; }
  const mc = Object.keys(missing).length;
  if (mc === 0) { console.log(`  ✓ ${tgt.toUpperCase()} (${name}) — complete`); return { lang: tgt, translated: 0, total: Object.keys(fSrc).length }; }
  console.log(`  → ${tgt.toUpperCase()} (${name}) — translating ${mc} keys...`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`    ERROR: ANTHROPIC_API_KEY not set`);
    fs.writeFileSync(path.join(LOCALES, `${tgt}_missing.json`), JSON.stringify(missing, null, 2));
    return { lang: tgt, translated: 0, total: mc, error: 'No API key' };
  }

  const entries = Object.entries(missing);
  const chunks = [];
  for (let i = 0; i < entries.length; i += 50) chunks.push(entries.slice(i, i + 50));

  const translated = {};
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = Object.fromEntries(chunks[ci]);
    process.stdout.write(`    Batch ${ci + 1}/${chunks.length} (${chunks[ci].length} keys)...`);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: `Translate these UI strings from English to ${name}. Return ONLY a JSON object with the same keys and translated values. Keep technical terms (ITSG-33, NIST, MFA, ATO, POA&M, TOTP, WebAuthn, SaaS, Azure, etc.) untranslated. Keep HTML tags and {{variables}} intact.\n\n${JSON.stringify(chunk, null, 2)}` }]
        })
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      Object.assign(translated, parsed);
      console.log(` ✓`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  for (const [k, v] of Object.entries(translated)) setNested(tgtData, k, v);
  for (const [k, v] of Object.entries(fTgt)) setNested(tgtData, k, v);
  if (fs.existsSync(tgtPath)) backup(tgtPath);
  fs.writeFileSync(tgtPath, JSON.stringify(tgtData, null, 2), 'utf-8');
  return { lang: tgt, translated: Object.keys(translated).length, total: mc };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  APPLY REPLACEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function applyReps(file, exs) {
  let content = fs.readFileSync(file, 'utf-8');
  let n = 0;
  const sorted = [...exs].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const ex of sorted) {
    if (content.includes(ex.pattern)) { content = content.replace(ex.pattern, ex.replacement); n++; }
  }
  if (n > 0) { backup(file); fs.writeFileSync(file, content); }
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  GC SA&A Tool — i18n`);
  console.log(`  Mode: ${MODE.replace('--', '').toUpperCase()}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── STATUS ──
  if (MODE === '--status') {
    const enPath = path.join(LOCALES, 'en.json');
    if (!fs.existsSync(enPath)) { console.log('  No en.json found.'); return; }
    const enCount = Object.keys(flat(JSON.parse(fs.readFileSync(enPath, 'utf-8')))).length;
    console.log(`  EN (English) — ${enCount} keys (source)\n`);
    for (const { code, name } of LANGUAGES) {
      const f = path.join(LOCALES, `${code}.json`);
      if (!fs.existsSync(f)) { console.log(`  ${code.toUpperCase()} (${name}) — not created`); continue; }
      const count = Object.keys(flat(JSON.parse(fs.readFileSync(f, 'utf-8')))).length;
      const pct = Math.round(count / enCount * 100);
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      console.log(`  ${code.toUpperCase()} (${name.padEnd(12)}) ${bar} ${count}/${enCount} (${pct}%)`);
    }
    console.log('');
    return;
  }

  // ── TRANSLATE ──
  if (MODE === '--translate') {
    try { require('dotenv').config({ path: path.join(ROOT, fs.existsSync(path.join(ROOT, '.env.dev')) ? '.env.dev' : '.env') }); } catch (e) {}
    console.log('[translate] Translating missing keys via Anthropic API...\n');
    const results = [];
    for (const { code, name } of LANGUAGES) {
      const r = await translateLocale('en', code, name);
      results.push(r);
    }
    console.log('\n  Summary:');
    for (const r of results) {
      if (r.error) console.log(`    ${r.lang.toUpperCase()}: ERROR — ${r.error}`);
      else console.log(`    ${r.lang.toUpperCase()}: ${r.translated}/${r.total} translated`);
    }
    console.log('\n  Run: node scripts/i18n.js --status\n');
    return;
  }

  // ── DRY-RUN / APPLY ──
  const allKeys = {};
  const allEx = [];
  let total = 0;

  // Phase 1: Extract from .hbs files
  const files = findFiles(VIEWS, '.hbs');
  console.log(`[extract] Scanning ${files.length} .hbs files...\n`);
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const content = fs.readFileSync(f, 'utf-8');
    const exs = extractView(content, filePrefix(f));
    if (exs.length) {
      allEx.push({ file: f, rel, exs });
      total += exs.length;
      exs.forEach(e => allKeys[e.key] = e.text);
    }
  }

  // Phase 1b: Extract flash messages from routes
  for (const rn of ['admin.js', 'public.js']) {
    const f = path.join(ROUTES, rn);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf-8');
    const exs = extractFlash(content, f);
    if (exs.length) {
      allEx.push({ file: f, rel: `routes/${rn}`, exs });
      total += exs.length;
      exs.forEach(e => allKeys[e.key] = e.text);
    }
  }

  // Report
  const byCat = {};
  allEx.forEach(({ exs }) => exs.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + 1));

  console.log(`${'─'.repeat(60)}`);
  console.log(`  New extractions: ${total} across ${allEx.length} files`);
  if (total > 0) {
    console.log(`  ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join('  ')}`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  if (total > 0) {
    for (const { rel, exs } of allEx) {
      console.log(`  ${rel} (${exs.length}):`);
      exs.slice(0, 4).forEach(e => {
        const t = e.text.length > 40 ? e.text.substring(0, 37) + '...' : e.text;
        console.log(`    ${e.category.padEnd(10)} "${t}"`);
      });
      if (exs.length > 4) console.log(`    ... +${exs.length - 4} more`);
    }
    console.log('');
  }

  if (MODE === '--dry-run') {
    // Phase 2 preview: repair check
    const enPath = path.join(LOCALES, 'en.json');
    const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
    // Temporarily add new keys for repair count
    for (const [k, v] of Object.entries(allKeys)) setNested(en, k, v);
    const repair = repairLocale(en);

    console.log(`[repair preview]`);
    console.log(`  {{t}} keys found in templates: ${repair.total}`);
    console.log(`  Already in en.json: ${repair.existing}`);
    console.log(`  Would add: ${repair.added}, Would fix: ${repair.fixed}`);
    console.log(`\n  DRY RUN — no files changed.`);
    console.log(`  Run: node scripts/i18n.js --apply\n`);
    return;
  }

  // ── APPLY ──
  console.log('[apply] Writing changes...\n');
  fs.mkdirSync(BACKUP, { recursive: true });

  // Write extractions to files
  let modFiles = 0, modTotal = 0;
  for (const { file, rel, exs } of allEx) {
    const n = applyReps(file, exs);
    if (n) { modFiles++; modTotal += n; console.log(`  ✓ ${rel}: ${n} replacements`); }
  }
  if (modTotal === 0 && total === 0) console.log('  No new strings to extract.');

  // Update en.json with extracted keys
  const enPath = path.join(LOCALES, 'en.json');
  let en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
  let newKeys = 0;
  for (const [k, v] of Object.entries(allKeys)) {
    const parts = k.split('.');
    let existing = en;
    let found = true;
    for (const p of parts) {
      if (existing && typeof existing === 'object' && p in existing) existing = existing[p];
      else { found = false; break; }
    }
    if (!found) { setNested(en, k, v); newKeys++; }
  }

  // Phase 2: Repair — ensure ALL {{t}} keys exist in en.json
  const repair = repairLocale(en);

  backup(enPath);
  fs.writeFileSync(enPath, JSON.stringify(en, null, 2));

  const totalEnKeys = Object.keys(flat(en)).length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  DONE`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Replacements: ${modTotal} in ${modFiles} files`);
  console.log(`  en.json: +${newKeys} extracted, +${repair.added} repaired, ${repair.fixed} fixed`);
  console.log(`  en.json total: ${totalEnKeys} keys`);
  console.log(`  Backups: _i18n_backup/`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Next: node scripts/i18n.js --translate`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });