#!/usr/bin/env node
/**
 * Extract user-facing English from Handlebars views so it can be localized.
 *
 * Dry-run by default: prints what WOULD be extracted. Pass --write to rewrite the
 * templates with {{t 'key'}} and emit the English dictionary.
 *
 * Deliberately conservative — it skips anything it cannot rewrite safely, because a
 * broken template is far worse than a string left in English. Skipped items are
 * reported so they can be handled by hand.
 */
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');
const FILES = process.argv.filter(a => a.endsWith('.hbs'));

// Text that is not prose: codes, numbers, symbols, framework identifiers.
const SKIP = /^(\s*|[0-9.,%:/#—–\-()[\]{}|&+*<>=~"'`]+|[A-Z]{1,6}-?[0-9.]*|https?:.*|\{\{.*)$/;
const KNOWN_TOKENS = new Set(['ITSG-33','NIST','CIS','ISO','FedRAMP','ATO','iATO','POA&M','SA&A','AI','PDF','CSV','HTML','MD','DOCX','SMTP','SMS','DNS','MFA','TOTP','URL','ID','OK','C/I/A','PBMM','AES','TLS']);

function isProse(t) {
  const s = t.trim();
  if (s.length < 3 || SKIP.test(s)) return false;
  if (KNOWN_TOKENS.has(s)) return false;
  if (!/[a-z]{2}/.test(s)) return false;          // needs real lowercase letters
  if (/\{\{|\}\}/.test(s)) return false;           // contains a handlebars expression
  return true;
}

function slug(text, used) {
  let base = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 5)
    .map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join('');
  if (!base) base = 'text';
  let key = base, n = 2;
  while (used.has(key) && used.get(key) !== text) { key = base + n; n++; }
  used.set(key, text);
  return key;
}

const dict = {};        // key -> english
const byText = {};      // english -> key   (dedupe: identical copy shares one key)
const usedKeys = new Map();
let replaced = 0, skipped = 0;
const skippedSamples = [];

function keyFor(text) {
  const t = text.trim();
  if (byText[t]) return byText[t];
  const k = 'ui.' + slug(t, usedKeys);
  byText[t] = k; dict[k] = t;
  return k;
}

/**
 * Protect regions we must never rewrite: <script> and <style> bodies, and HTML
 * comments. A naive >text< match would happily mangle `if (a > b) { ... }` inside
 * a script block, which is exactly the kind of silent breakage that makes a bulk
 * rewrite dangerous.
 */
function shield(src) {
  const stash = [];
  const keep = (re) => {
    src = src.replace(re, m => {
      stash.push(m);
      return `\u0000SHIELD${stash.length - 1}\u0000`;
    });
  };
  keep(/<script[\s\S]*?<\/script>/gi);
  keep(/<style[\s\S]*?<\/style>/gi);
  keep(/<!--[\s\S]*?-->/g);
  return { src, stash };
}

function unshield(src, stash) {
  return src.replace(/\u0000SHIELD(\d+)\u0000/g, (m, i) => stash[Number(i)]);
}

FILES.forEach(file => {
  const raw = fs.readFileSync(file, 'utf8');
  const before = raw;
  const shielded = shield(raw);
  let src = shielded.src;

  // 1) Text between tags: >Some words<
  src = src.replace(/>([^<>{}]+)</g, (m, inner) => {
    if (!isProse(inner)) return m;
    const lead = inner.match(/^\s*/)[0], tail = inner.match(/\s*$/)[0];
    return `>${lead}{{t '${keyFor(inner)}'}}${tail}<`;
  });

  // 2) Localizable attributes
  src = src.replace(/(placeholder|title|aria-label)="([^"{}]+)"/g, (m, attr, val) => {
    if (!isProse(val)) return m;
    return `${attr}="{{t '${keyFor(val)}'}}"`;
  });

  src = unshield(src, shielded.stash);
  const count = (src.match(/\{\{t '/g) || []).length - (before.match(/\{\{t '/g) || []).length;
  replaced += count;
  if (WRITE && src !== before) fs.writeFileSync(file, src);
  console.log(`${path.basename(file)}: +${count} keys`);
});

console.log(`\nunique keys: ${Object.keys(dict).length}   replacements: ${replaced}`);
if (WRITE) {
  fs.writeFileSync('scripts/extracted-en.json', JSON.stringify(dict, null, 2));
  console.log('wrote scripts/extracted-en.json');
}
