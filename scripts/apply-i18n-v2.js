#!/usr/bin/env node
// apply-i18n-v2.js — Comprehensive pass to catch ALL remaining English strings
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const ROUTES = path.join(ROOT, 'routes');
const LOCALES = path.join(ROOT, 'locales');
const BACKUP = path.join(ROOT, '_i18n_backup_v2');
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

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 5).join('_') || 'x';
}

function extractView(content, prefix) {
  const results = [];
  const usedPat = new Set();
  const usedKey = new Set();

  // Remove script/style/title/meta
  const clean = content
    .replace(/<script[\s\S]*?<\/script>/gi, m => '\n'.repeat((m.match(/\n/g)||[]).length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => '\n'.repeat((m.match(/\n/g)||[]).length))
    .replace(/<title[\s\S]*?<\/title>/gi, m => '\n'.repeat((m.match(/\n/g)||[]).length))
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
    // Skip if the opening tag contains handlebars (e.g. class="{{#if ...}}")
    const openTag = fullMatch.substring(0, fullMatch.indexOf('>') + 1);
    if (/\{\{/.test(openTag)) return;
    usedPat.add(fullMatch);
    const key = mk(cat, text);
    results.push({ key, text: text.trim(), pattern: fullMatch, replacement: fullMatch.replace(textInMatch, `{{t '${key}'}}`), category: cat });
  }

  function addIconText(cat, fullMatch, iconPart, textPart) {
    const t = textPart.trim();
    if (usedPat.has(fullMatch) || shouldSkip(t)) return;
    // Skip if the opening tag contains handlebars
    const openTag = fullMatch.substring(0, fullMatch.indexOf('>') + 1);
    if (/\{\{/.test(openTag)) return;
    usedPat.add(fullMatch);
    const key = mk(cat, t);
    results.push({ key, text: t, pattern: fullMatch, replacement: fullMatch.replace(textPart, `{{t '${key}'}}`), category: cat });
  }

  let m;

  // ── 1. Simple text in tags (no child elements, no handlebars) ──
  const simpleTags = ['h1','h2','h3','h4','h5','h6','th','label','legend','small','strong','em','li'];
  for (const tag of simpleTags) {
    const re = new RegExp(`<${tag}\\b[^>]*>([^<{\\n]+)</${tag}>`, 'gi');
    while ((m = re.exec(clean)) !== null) {
      addSimple(tag, m[0], m[1], m[1].trim());
    }
  }

  // ── 2. Paragraphs (any) ──
  const pRe = /<p\b[^>]*>([^<{]+)<\/p>/gi;
  while ((m = pRe.exec(clean)) !== null) {
    if (m[1].trim().length >= 5) addSimple('p', m[0], m[1], m[1].trim());
  }

  // ── 3. Simple anchors: <a ...>Text</a> ──
  const aSimple = /<a\b[^>]*>([^<{]+)<\/a>/gi;
  while ((m = aSimple.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 3 && !/^(#|http|javascript|\{\{)/.test(t)) addSimple('link', m[0], m[1], t);
  }

  // ── 4. Anchors with icon: <a ...><i class="..."></i>Text</a> ──
  const aIcon = /<a\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/a>/gi;
  while ((m = aIcon.exec(clean)) !== null) {
    addIconText('link', m[0], m[1], m[2]);
  }

  // ── 5. Anchors with icon + span: <a ...><i...></i><span...>Text</span>...</a> — skip complex ones

  // ── 6. Buttons simple: <button ...>Text</button> ──
  const btnSimple = /<button\b[^>]*>([^<{]+)<\/button>/gi;
  while ((m = btnSimple.exec(clean)) !== null) {
    addSimple('btn', m[0], m[1], m[1].trim());
  }

  // ── 7. Buttons with icon: <button ...><i ...></i> Text</button> ──
  const btnIcon = /<button\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/button>/gi;
  while ((m = btnIcon.exec(clean)) !== null) {
    addIconText('btn', m[0], m[1], m[2]);
  }

  // ── 8. Buttons with span: <button ...><span...>...</span> Text</button> ──
  const btnSpan = /<button\b[^>]*>(\s*<span\b[^>]*>[^<]*<\/span>\s*)([^<{]+)<\/button>/gi;
  while ((m = btnSpan.exec(clean)) !== null) {
    addIconText('btn', m[0], m[1], m[2]);
  }

  // ── 9. Spans with text: <span class="...">Text</span> (exclude badges with handlebars) ──
  const spanSimple = /<span\b[^>]*class="[^"]*"[^>]*>([^<{]+)<\/span>/gi;
  while ((m = spanSimple.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 3) addSimple('span', m[0], m[1], t);
  }

  // ── 10. Spans with icon: <span ...><i...></i>Text</span> ──
  const spanIcon = /<span\b[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/span>/gi;
  while ((m = spanIcon.exec(clean)) !== null) {
    addIconText('span', m[0], m[1], m[2]);
  }

  // ── 11. Stat labels ──
  const stat = /<div\s+class="stat-label"[^>]*>([^<{]+)<\/div>/gi;
  while ((m = stat.exec(clean)) !== null) {
    addSimple('stat', m[0], m[1], m[1].trim());
  }

  // ── 12. Card headers with icon ──
  const cardH = /<div\s+class="card-header[^"]*"[^>]*>(\s*<i\b[^>]*><\/i>\s*)([^<{]+)<\/div>/gi;
  while ((m = cardH.exec(clean)) !== null) {
    addIconText('card', m[0], m[1], m[2]);
  }

  // ── 13. Card headers with span+icon: <div class="card-header"><span><i...></i>Text</span>...</div>
  // Too complex — skip

  // ── 14. Placeholders ──
  const ph = /placeholder="([^"{]+)"/gi;
  while ((m = ph.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 4 && !shouldSkip(t)) {
      const key = mk('ph', t);
      if (!usedPat.has(m[0])) {
        usedPat.add(m[0]);
        results.push({ key, text: t, pattern: m[0], replacement: `placeholder="{{t '${key}'}}"`, category: 'ph' });
      }
    }
  }

  // ── 15. Title attributes ──
  const tattr = /title="([^"{]+)"/gi;
  while ((m = tattr.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 4 && !shouldSkip(t) && /[A-Z]/.test(t)) {
      const key = mk('tattr', t);
      if (!usedPat.has(m[0])) {
        usedPat.add(m[0]);
        results.push({ key, text: t, pattern: m[0], replacement: `title="{{t '${key}'}}"`, category: 'tattr' });
      }
    }
  }

  // ── 16. Divs with simple text (common pattern): <div class="...">Text</div> ──
  const divText = /<div\b[^>]*class="[^"]*(?:fw-|cap-title|cap-desc|text-muted|small|ri-title|ri-detail|q-hint|label|value)[^"]*"[^>]*>([^<{]+)<\/div>/gi;
  while ((m = divText.exec(clean)) !== null) {
    const t = m[1].trim();
    if (t.length >= 4) addSimple('div', m[0], m[1], t);
  }

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

function flat(o, pre = '') {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}.${k}` : k;
    if (typeof v === 'object' && v !== null) Object.assign(r, flat(v, key));
    else r[key] = v;
  }
  return r;
}

async function translateLocale(src, tgt, name) {
  const srcData = JSON.parse(fs.readFileSync(path.join(LOCALES, `${src}.json`), 'utf-8'));
  let tgtData = {};
  const tgtPath = path.join(LOCALES, `${tgt}.json`);
  if (fs.existsSync(tgtPath)) tgtData = JSON.parse(fs.readFileSync(tgtPath, 'utf-8'));
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
          messages: [{ role: 'user', content: `Translate these UI strings from English to ${name}. Return ONLY a JSON object with the same keys and translated values. Keep technical terms (ITSG-33, NIST, MFA, ATO, POA&M, TOTP, WebAuthn, etc.) untranslated. Keep HTML tags and {{variables}} intact.\n\n${JSON.stringify(chunk, null, 2)}` }]
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
  console.log(`\n${'═'.repeat(60)}\n  GC SA&A Tool — i18n v2 (comprehensive)\n  Mode: ${DRY ? 'DRY RUN' : TRANS ? 'TRANSLATE' : 'APPLY'}\n${'═'.repeat(60)}\n`);

  if (TRANS) {
    try { require('dotenv').config({ path: path.join(ROOT, fs.existsSync(path.join(ROOT, '.env.dev')) ? '.env.dev' : '.env') }); } catch(e) {}
    const targets = [
      ['fr', 'French'],
      ['es', 'Spanish'],
      ['de', 'German'],
      ['pt', 'Portuguese'],
      ['it', 'Italian'],
      ['nl', 'Dutch'],
      ['ja', 'Japanese'],
    ];
    for (const [code, name] of targets) {
      await translateLocale('en', code, name);
    }
    console.log('\nDone!');
    return;
  }

  const allKeys = {}, allEx = [];
  let total = 0;

  const files = findHbs(VIEWS);
  console.log(`[scan] ${files.length} .hbs files`);
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const content = fs.readFileSync(f, 'utf-8');
    const exs = extractView(content, filePrefix(f));
    if (exs.length) { allEx.push({ file: f, rel, exs }); total += exs.length; exs.forEach(e => allKeys[e.key] = e.text); }
    else console.log(`  [0] ${rel}`);
  }

  for (const rn of ['admin.js', 'public.js']) {
    const f = path.join(ROUTES, rn);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf-8');
    const exs = extractFlash(content, f);
    if (exs.length) { allEx.push({ file: f, rel: `routes/${rn}`, exs }); total += exs.length; exs.forEach(e => allKeys[e.key] = e.text); }
  }

  const byCat = {};
  allEx.forEach(({ exs }) => exs.forEach(e => byCat[e.category] = (byCat[e.category]||0) + 1));
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Files: ${allEx.length} | Replacements: ${total} | New keys: ${Object.keys(allKeys).length}`);
  console.log(`  ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}:${n}`).join('  ')}`);
  console.log(`${'─'.repeat(60)}\n`);

  for (const { rel, exs } of allEx) {
    console.log(`  ${rel} (${exs.length}):`);
    exs.slice(0, 6).forEach(e => {
      const t = e.text.length > 40 ? e.text.substring(0, 37) + '...' : e.text;
      console.log(`    ${e.category.padEnd(10)} "${t}"`);
    });
    if (exs.length > 6) console.log(`    ... +${exs.length - 6} more`);
  }

  if (DRY) {
    fs.writeFileSync(path.join(ROOT, '_i18n_v2_preview.json'), JSON.stringify(allKeys, null, 2));
    console.log(`\n  DRY RUN — Preview: _i18n_v2_preview.json\n  Run --apply to execute.\n`);
    return;
  }

  console.log('\n[apply] Writing changes...');
  fs.mkdirSync(BACKUP, { recursive: true });

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
  console.log(`  Backups: _i18n_backup_v2/`);
  console.log(`  Next: node scripts/apply-i18n-v2.js --translate`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
