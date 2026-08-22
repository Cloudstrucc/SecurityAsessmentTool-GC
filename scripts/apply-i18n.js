#!/usr/bin/env node
/**
 * Apply translations to locales/*.json.
 *
 * Input: a JSON file mapping ENGLISH STRING -> { fr, es, de, pt, it, nl, ja }.
 * Keying by English (not by key name) means one translation covers every key that
 * shares the same copy, which is how the extractor deduped in the first place.
 */
const fs = require('fs');
const LANGS = ['fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
const batchFile = process.argv[2];
if (!batchFile) { console.error('usage: apply-i18n.js <batch.json>'); process.exit(1); }

const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const en = JSON.parse(fs.readFileSync('locales/en.json', 'utf8'));

// English string -> [keys]
const keysByText = {};
for (const [k, v] of Object.entries(en)) {
  if (!k.startsWith('ui.') && !k.startsWith('ux.')) continue;
  const t = String(v).trim().replace(/\s+/g, ' ');
  (keysByText[t] = keysByText[t] || []).push(k);
}

const counts = {}; let unmatched = 0;
LANGS.forEach(l => counts[l] = 0);

const files = {};
LANGS.forEach(l => files[l] = JSON.parse(fs.readFileSync(`locales/${l}.json`, 'utf8')));

for (const [text, tr] of Object.entries(batch)) {
  const norm = text.trim().replace(/\s+/g, ' ');
  const keys = keysByText[norm];
  if (!keys) { unmatched++; console.warn('  no key for:', JSON.stringify(norm.slice(0, 60))); continue; }
  LANGS.forEach(l => {
    if (!tr[l]) return;
    keys.forEach(k => { files[l][k] = tr[l]; });
    counts[l] += keys.length;
  });
}

LANGS.forEach(l => fs.writeFileSync(`locales/${l}.json`, JSON.stringify(files[l], null, 2) + '\n'));
console.log('applied:', LANGS.map(l => `${l}:${counts[l]}`).join(' '), unmatched ? `| unmatched:${unmatched}` : '');
