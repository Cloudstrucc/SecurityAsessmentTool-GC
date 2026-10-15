#!/usr/bin/env node
/**
 * Add the control-family header and description-expander keys (cf.*) to all
 * 8 locale files. Idempotent: an existing key is left alone so hand edits
 * survive a re-run.
 *
 *   node scripts/add-control-family-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'cf.familyCount': '{{n}} control(s)',
    'cf.descMore': 'Show more',
    'cf.descLess': 'Show less',
    'cf.descToggleAria': 'Show or hide the full control description'
  },
  fr: {
    'cf.familyCount': '{{n}} contrôle(s)',
    'cf.descMore': 'Afficher plus',
    'cf.descLess': 'Afficher moins',
    'cf.descToggleAria': 'Afficher ou masquer la description complète du contrôle'
  },
  es: {
    'cf.familyCount': '{{n}} control(es)',
    'cf.descMore': 'Mostrar más',
    'cf.descLess': 'Mostrar menos',
    'cf.descToggleAria': 'Mostrar u ocultar la descripción completa del control'
  },
  de: {
    'cf.familyCount': '{{n}} Kontrolle(n)',
    'cf.descMore': 'Mehr anzeigen',
    'cf.descLess': 'Weniger anzeigen',
    'cf.descToggleAria': 'Vollständige Kontrollbeschreibung ein- oder ausblenden'
  },
  pt: {
    'cf.familyCount': '{{n}} controlo(s)',
    'cf.descMore': 'Mostrar mais',
    'cf.descLess': 'Mostrar menos',
    'cf.descToggleAria': 'Mostrar ou ocultar a descrição completa do controlo'
  },
  it: {
    'cf.familyCount': '{{n}} controllo/i',
    'cf.descMore': 'Mostra di più',
    'cf.descLess': 'Mostra meno',
    'cf.descToggleAria': 'Mostra o nascondi la descrizione completa del controllo'
  },
  nl: {
    'cf.familyCount': '{{n}} maatregel(en)',
    'cf.descMore': 'Meer weergeven',
    'cf.descLess': 'Minder weergeven',
    'cf.descToggleAria': 'De volledige beschrijving van de maatregel weergeven of verbergen'
  },
  ja: {
    'cf.familyCount': '{{n}} 件の管理策',
    'cf.descMore': 'さらに表示',
    'cf.descLess': '表示を減らす',
    'cf.descToggleAria': '管理策の説明全文を表示または非表示にします'
  }
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
