#!/usr/bin/env node
/**
 * Add the stateful review-action keys (rv.isReviewed / rv.reopen / rv.pReopen)
 * to all 8 locale files. Idempotent: an existing key is left alone.
 *
 *   node scripts/add-review-state-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: { 'rv.isReviewed': 'Reviewed', 'rv.reopen': 'Reopen', 'rv.pReopen': 'Reopening the control…' },
  fr: { 'rv.isReviewed': 'Examiné', 'rv.reopen': 'Rouvrir', 'rv.pReopen': 'Réouverture du contrôle…' },
  es: { 'rv.isReviewed': 'Revisado', 'rv.reopen': 'Reabrir', 'rv.pReopen': 'Reabriendo el control…' },
  de: { 'rv.isReviewed': 'Geprüft', 'rv.reopen': 'Erneut öffnen', 'rv.pReopen': 'Kontrolle wird wieder geöffnet…' },
  pt: { 'rv.isReviewed': 'Revisto', 'rv.reopen': 'Reabrir', 'rv.pReopen': 'A reabrir o controlo…' },
  it: { 'rv.isReviewed': 'Esaminato', 'rv.reopen': 'Riapri', 'rv.pReopen': 'Riapertura del controllo…' },
  nl: { 'rv.isReviewed': 'Beoordeeld', 'rv.reopen': 'Heropenen', 'rv.pReopen': 'Maatregel wordt heropend…' },
  ja: { 'rv.isReviewed': 'レビュー済み', 'rv.reopen': '再オープン', 'rv.pReopen': '管理策を再オープンしています…' }
};

let changed = 0;
Object.entries(KEYS).forEach(([lang, keys]) => {
  const file = path.join(LOCALES, `${lang}.json`);
  if (!fs.existsSync(file)) { console.error(`! missing ${file}`); return; }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  Object.entries(keys).forEach(([k, v]) => { if (!(k in json)) { json[k] = v; added++; } });
  if (added) { fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n'); changed += added; }
  console.log(`${lang}: +${added} (total ${Object.keys(json).length})`);
});
console.log(`\nAdded ${changed} key(s). Restart the app — i18next preloads locales at startup.`);
