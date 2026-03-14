#!/usr/bin/env node
// apply-i18n.js — Automated i18n transformation for GC SA&A Tool
// Usage:
//   node scripts/apply-i18n.js --dry-run     Preview changes
//   node scripts/apply-i18n.js --apply        Apply changes + backups
//   node scripts/apply-i18n.js --translate    Translate en→fr/es via Anthropic API

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const ROUTES = path.join(ROOT, 'routes');
const LOCALES = path.join(ROOT, 'locales');
const BACKUP = path.join(ROOT, '_i18n_backup');
const DRY = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const TRANS = process.argv.includes('--translate');

if (!DRY && !APPLY && !TRANS) {
  console.log('Usage:\n  --dry-run   Preview\n  --apply     Apply + backup\n  --translate Translate en→fr/es via API');
  process.exit(0);
}

function findHbs(dir) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r = r.concat(findHbs(f));
    else if (e.name.endsWith('.hbs')) r.push(f);
  }
  return r;
}

function filePrefix(f) {
  return path.relative(VIEWS, f).replace(/\.hbs$/, '').replace(/\\/g, '/')
    .replace('layouts/', 'layout.').replace('public/', '').replace('partials/', 'partial.')
    .replace(/\//g, '.').replace(/-/g, '_');
}

const SKIP = [/^\{\{/, /^[^a-zA-Z]*$/, /^[\s]*$/, /^[a-z0-9_.@:\/\-]+$/, /^\d/];
const MIN = 3, MAX = 200;
function skip(t) {
  t = t.trim();
  return t.length < MIN || t.length > MAX || SKIP.some(p => p.test(t)) || (t.match(/\{\{/g)||[]).length > 0;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 4).join('_') || 'text';
}

function extractView(content, prefix) {
  const ex = [], used = new Set();
  // Strip script/style for analysis
  const clean = content.replace(/<script[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length));

  function addEx(cat, pat, repl, text, key) {
    if (used.has(pat)) return;
    used.add(pat);
    ex.push({ key, text, pattern: pat, replacement: repl, category: cat });
  }

  function mk(cat, text) {
    let k = `${prefix}.${cat}.${slug(text)}`;
    let n = 1;
    while (used.has(k)) { k = `${prefix}.${cat}.${slug(text)}_${++n}`; }
    return k;
  }

  // Headings h1-h6 (simple text only)
  let m;
  const hRe = /<(h[1-6])\b[^>]*>([^<{]+)<\/\1>/gi;
  while ((m = hRe.exec(clean)) !== null) {
    const t = m[2].trim();
    if (!skip(t)) { const k = mk('title', t); addEx('heading', m[0], m[0].replace(t, `{{t '${k}'}}`), t, k); }
  }

  // Table headers
  const thRe = /<th\b[^>]*>([^<{]+)<\/th>/gi;
  while ((m = thRe.exec(clean)) !== null) {
    const t = m[1].trim();
    if (!skip(t) && t.length >= 2) { const k = mk('th', t); addEx('th', m[0], m[0].replace(t, `{{t '${k}'}}`), t, k); }
  }

  // Labels (simple text)
  const lRe = /<label\b[^>]*>([^<{]+)<\/label>/gi;
  while ((m = lRe.exec(clean)) !== null) {
    const t = m[1].trim();
    if (!skip(t)) { const k = mk('label', t); addEx('label', m[0], m[0].replace(t, `{{t '${k}'}}`), t, k); }
  }

  // Stat labels
  const slRe = /<div\s+class="stat-label"[^>]*>([^<{]+)<\/div>/gi;
  while ((m = slRe.exec(clean)) !== null) {
    const t = m[1].trim();
    if (!skip(t)) { const k = mk('stat', t); addEx('stat', m[0], m[0].replace(t, `{{t '${k}'}}`), t, k); }
  }

  // Placeholders
  const phRe = /placeholder="([^"{]+)"/gi;
  while ((m = phRe.exec(clean)) !== null) {
    const t = m[1].trim();
    if (!skip(t) && t.length >= 5) { const k = mk('ph', t); addEx('placeholder', m[0], `placeholder="{{t '${k}'}}"`, t, k); }
  }

  return ex;
}

function extractFlash(content, file) {
  const ex = [], prefix = path.basename(file, '.js');
  const re = /req\.flash\(\s*'(\w+)'\s*,\s*'([^']{5,})'\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const t = m[2];
    if (/req\.t\(/.test(t)) continue;
    const k = `flash.${prefix}.${slug(t)}`;
    ex.push({ key: k, text: t, pattern: m[0], replacement: `req.flash('${m[1]}', req.t('${k}'))`, category: 'flash' });
  }
  return ex;
}

function setNested(obj, key, val) {
  const p = key.split('.');
  let c = obj;
  for (let i = 0; i < p.length - 1; i++) { if (!c[p[i]] || typeof c[p[i]] !== 'object') c[p[i]] = {}; c = c[p[i]]; }
  if (!c[p[p.length-1]]) c[p[p.length-1]] = val;
}

function backup(f) {
  const rel = path.relative(ROOT, f);
  const bp = path.join(BACKUP, rel);
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  fs.copyFileSync(f, bp);
}

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

async function translateLocale(src, tgt, name) {
  const srcData = JSON.parse(fs.readFileSync(path.join(LOCALES, `${src}.json`), 'utf-8'));
  let tgtData = {};
  const tgtPath = path.join(LOCALES, `${tgt}.json`);
  if (fs.existsSync(tgtPath)) tgtData = JSON.parse(fs.readFileSync(tgtPath, 'utf-8'));

  function flat(o, pre = '') {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      const key = pre ? `${pre}.${k}` : k;
      if (typeof v === 'object' && v !== null) Object.assign(r, flat(v, key));
      else r[key] = v;
    }
    return r;
  }
  const fSrc = flat(srcData), fTgt = flat(tgtData);
  const missing = {};
  for (const [k, v] of Object.entries(fSrc)) { if (!fTgt[k] && typeof v === 'string') missing[k] = v; }
  const mc = Object.keys(missing).length;
  if (mc === 0) { console.log(`  [${tgt}] Complete`); return; }
  console.log(`  [${tgt}] Translating ${mc} keys...`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error(`  ERROR: ANTHROPIC_API_KEY not set`); fs.writeFileSync(path.join(LOCALES, `${tgt}_missing.json`), JSON.stringify(missing, null, 2)); return; }

  const entries = Object.entries(missing);
  const chunks = [];
  for (let i = 0; i < entries.length; i += 50) chunks.push(entries.slice(i, i + 50));

  const translated = {};
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = Object.fromEntries(chunks[ci]);
    console.log(`  [${tgt}] Batch ${ci+1}/${chunks.length} (${chunks[ci].length} keys)...`);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514', max_tokens: 4000,
          messages: [{ role: 'user', content: `Translate these UI strings from English to ${name}. Return ONLY a JSON object with same keys and translated values. Keep technical terms (ITSG-33, NIST, MFA, ATO, POA&M, etc.) untranslated. Keep HTML tags and {{variables}} intact.\n\n${JSON.stringify(chunk, null, 2)}` }]
        })
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      Object.assign(translated, JSON.parse(text.replace(/```json|```/g, '').trim()));
    } catch (err) { console.error(`  Batch ${ci+1} error:`, err.message); }
  }

  for (const [k, v] of Object.entries(translated)) setNested(tgtData, k, v);
  for (const [k, v] of Object.entries(fTgt)) setNested(tgtData, k, v);
  if (fs.existsSync(tgtPath)) backup(tgtPath);
  fs.writeFileSync(tgtPath, JSON.stringify(tgtData, null, 2), 'utf-8');
  console.log(`  [${tgt}] Done: ${Object.keys(translated).length}/${mc}`);
}

async function main() {
  console.log(`\n${'═'.repeat(60)}\n  GC SA&A Tool — i18n Transformation\n  Mode: ${DRY ? 'DRY RUN' : TRANS ? 'TRANSLATE' : 'APPLY'}\n${'═'.repeat(60)}\n`);

  if (TRANS) {
    try { require('dotenv').config({ path: path.join(ROOT, fs.existsSync(path.join(ROOT, '.env.dev')) ? '.env.dev' : '.env') }); } catch(e) {}
    await translateLocale('en', 'fr', 'French');
    await translateLocale('en', 'es', 'Spanish');
    console.log('\nDone!');
    return;
  }

  const allKeys = {}, allEx = [];
  let total = 0;

  // Views
  const files = findHbs(VIEWS);
  console.log(`[scan] ${files.length} .hbs files`);
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const content = fs.readFileSync(f, 'utf-8');
    if ((content.match(/\{\{t\s+'/g)||[]).length > 5) { console.log(`  [skip] ${rel} (already i18n'd)`); continue; }
    const exs = extractView(content, filePrefix(f));
    if (exs.length) { allEx.push({ file: f, rel, exs }); total += exs.length; exs.forEach(e => allKeys[e.key] = e.text); }
  }

  // Routes (flash messages)
  for (const rn of ['admin.js', 'public.js']) {
    const f = path.join(ROUTES, rn);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf-8');
    const exs = extractFlash(content, f);
    if (exs.length) { allEx.push({ file: f, rel: `routes/${rn}`, exs }); total += exs.length; exs.forEach(e => allKeys[e.key] = e.text); }
  }

  // Report
  const byCat = {};
  allEx.forEach(({ exs }) => exs.forEach(e => byCat[e.category] = (byCat[e.category]||0) + 1));
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Files: ${allEx.length} | Replacements: ${total} | New keys: ${Object.keys(allKeys).length}`);
  console.log(`  Categories: ${Object.entries(byCat).map(([c,n]) => `${c}:${n}`).join(' ')}`);
  console.log(`${'─'.repeat(60)}\n`);

  for (const { rel, exs } of allEx) {
    console.log(`  ${rel} (${exs.length}):`);
    exs.slice(0, 5).forEach(e => {
      const t = e.text.length > 45 ? e.text.substring(0, 42) + '...' : e.text;
      console.log(`    ${e.category.padEnd(12)} "${t}"`);
    });
    if (exs.length > 5) console.log(`    ... +${exs.length - 5} more`);
  }

  if (DRY) {
    const pf = path.join(ROOT, '_i18n_preview.json');
    fs.writeFileSync(pf, JSON.stringify(allKeys, null, 2));
    console.log(`\n  DRY RUN — no files changed. Preview: _i18n_preview.json\n  Run --apply to execute.\n`);
    return;
  }

  // Apply
  console.log('\n[apply] Writing changes...');
  fs.mkdirSync(BACKUP, { recursive: true });

  // Update en.json
  const enPath = path.join(LOCALES, 'en.json');
  let en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf-8')) : {};
  let added = 0;
  for (const [k, v] of Object.entries(allKeys)) { setNested(en, k, v); added++; }
  backup(enPath);
  fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
  console.log(`  en.json: +${added} keys`);

  let modFiles = 0, modTotal = 0;
  for (const { file, rel, exs } of allEx) {
    const n = applyReps(file, exs);
    if (n) { modFiles++; modTotal += n; console.log(`  ${rel}: ${n} applied`); }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  DONE: ${modTotal} replacements in ${modFiles} files`);
  console.log(`  Backups: _i18n_backup/`);
  console.log(`  Next: node scripts/apply-i18n.js --translate`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
