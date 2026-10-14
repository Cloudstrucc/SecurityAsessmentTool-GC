#!/usr/bin/env node
/**
 * Add the full-project-report label keys (rf.*) to all 8 locale files.
 * These are the detail sections appended to the project rollup: the
 * authorization narrative, the controls with evidence, and the attachments.
 * Idempotent: an existing key is left alone.
 *
 *   node scripts/add-full-report-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'rf.authorizationDecision': 'Authorization decision',
    'rf.controlsAndEvidence': 'Controls and evidence',
    'rf.evidenceAttachments': 'Evidence attachments',
    'rf.field': 'Field',
    'rf.value': 'Value'
  },
  fr: {
    'rf.authorizationDecision': "Décision d'autorisation",
    'rf.controlsAndEvidence': 'Contrôles et preuves',
    'rf.evidenceAttachments': 'Pièces jointes des preuves',
    'rf.field': 'Champ',
    'rf.value': 'Valeur'
  },
  es: {
    'rf.authorizationDecision': 'Decisión de autorización',
    'rf.controlsAndEvidence': 'Controles y evidencias',
    'rf.evidenceAttachments': 'Adjuntos de evidencia',
    'rf.field': 'Campo',
    'rf.value': 'Valor'
  },
  de: {
    'rf.authorizationDecision': 'Autorisierungsentscheidung',
    'rf.controlsAndEvidence': 'Kontrollen und Nachweise',
    'rf.evidenceAttachments': 'Nachweisanhänge',
    'rf.field': 'Feld',
    'rf.value': 'Wert'
  },
  pt: {
    'rf.authorizationDecision': 'Decisão de autorização',
    'rf.controlsAndEvidence': 'Controlos e provas',
    'rf.evidenceAttachments': 'Anexos de prova',
    'rf.field': 'Campo',
    'rf.value': 'Valor'
  },
  it: {
    'rf.authorizationDecision': 'Decisione di autorizzazione',
    'rf.controlsAndEvidence': 'Controlli ed evidenze',
    'rf.evidenceAttachments': 'Allegati delle evidenze',
    'rf.field': 'Campo',
    'rf.value': 'Valore'
  },
  nl: {
    'rf.authorizationDecision': 'Autorisatiebesluit',
    'rf.controlsAndEvidence': 'Maatregelen en bewijs',
    'rf.evidenceAttachments': 'Bewijsbijlagen',
    'rf.field': 'Veld',
    'rf.value': 'Waarde'
  },
  ja: {
    'rf.authorizationDecision': '認可判断',
    'rf.controlsAndEvidence': '管理策と証跡',
    'rf.evidenceAttachments': '証跡の添付ファイル',
    'rf.field': '項目',
    'rf.value': '値'
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
