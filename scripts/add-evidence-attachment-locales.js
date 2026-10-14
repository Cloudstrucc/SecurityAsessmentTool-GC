#!/usr/bin/env node
/**
 * Add the evidence-attachment keys (ea.*) to all 8 locale files.
 * Idempotent: an existing key is left alone so hand edits survive a re-run.
 *
 *   node scripts/add-evidence-attachment-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'ea.download': 'Download',
    'ea.notFound': 'Attachment not found',
    'ea.missingFile': 'That attachment is missing from storage.',
    'ea.evidenceSource': 'Evidence',
    'ea.projectSource': 'Project document',
    'ea.source': 'Source',
    'ea.forControl': 'Evidence for {{control}}',
    'ea.none': 'No evidence attachments yet.',
    'ea.heading': 'Evidence attachments',
    'ea.attachedFiles': 'Attached files'
  },
  fr: {
    'ea.download': 'Télécharger',
    'ea.notFound': 'Pièce jointe introuvable',
    'ea.missingFile': 'Cette pièce jointe est absente du stockage.',
    'ea.evidenceSource': 'Preuve',
    'ea.projectSource': 'Document de projet',
    'ea.source': 'Source',
    'ea.forControl': 'Preuve pour {{control}}',
    'ea.none': 'Aucune pièce jointe de preuve pour le moment.',
    'ea.heading': 'Pièces jointes des preuves',
    'ea.attachedFiles': 'Fichiers joints'
  },
  es: {
    'ea.download': 'Descargar',
    'ea.notFound': 'Adjunto no encontrado',
    'ea.missingFile': 'Ese adjunto no está en el almacenamiento.',
    'ea.evidenceSource': 'Evidencia',
    'ea.projectSource': 'Documento del proyecto',
    'ea.source': 'Origen',
    'ea.forControl': 'Evidencia de {{control}}',
    'ea.none': 'Todavía no hay adjuntos de evidencia.',
    'ea.heading': 'Adjuntos de evidencia',
    'ea.attachedFiles': 'Archivos adjuntos'
  },
  de: {
    'ea.download': 'Herunterladen',
    'ea.notFound': 'Anhang nicht gefunden',
    'ea.missingFile': 'Dieser Anhang fehlt im Speicher.',
    'ea.evidenceSource': 'Nachweis',
    'ea.projectSource': 'Projektdokument',
    'ea.source': 'Quelle',
    'ea.forControl': 'Nachweis für {{control}}',
    'ea.none': 'Noch keine Nachweisanhänge vorhanden.',
    'ea.heading': 'Nachweisanhänge',
    'ea.attachedFiles': 'Angehängte Dateien'
  },
  pt: {
    'ea.download': 'Transferir',
    'ea.notFound': 'Anexo não encontrado',
    'ea.missingFile': 'Esse anexo não está no armazenamento.',
    'ea.evidenceSource': 'Prova',
    'ea.projectSource': 'Documento do projeto',
    'ea.source': 'Origem',
    'ea.forControl': 'Prova para {{control}}',
    'ea.none': 'Ainda não existem anexos de prova.',
    'ea.heading': 'Anexos de prova',
    'ea.attachedFiles': 'Ficheiros anexados'
  },
  it: {
    'ea.download': 'Scarica',
    'ea.notFound': 'Allegato non trovato',
    'ea.missingFile': "Questo allegato non è presente nell'archivio.",
    'ea.evidenceSource': 'Evidenza',
    'ea.projectSource': 'Documento di progetto',
    'ea.source': 'Origine',
    'ea.forControl': 'Evidenza per {{control}}',
    'ea.none': 'Nessun allegato di evidenza al momento.',
    'ea.heading': 'Allegati delle evidenze',
    'ea.attachedFiles': 'File allegati'
  },
  nl: {
    'ea.download': 'Downloaden',
    'ea.notFound': 'Bijlage niet gevonden',
    'ea.missingFile': 'Deze bijlage ontbreekt in de opslag.',
    'ea.evidenceSource': 'Bewijs',
    'ea.projectSource': 'Projectdocument',
    'ea.source': 'Bron',
    'ea.forControl': 'Bewijs voor {{control}}',
    'ea.none': 'Nog geen bewijsbijlagen.',
    'ea.heading': 'Bewijsbijlagen',
    'ea.attachedFiles': 'Bijgevoegde bestanden'
  },
  ja: {
    'ea.download': 'ダウンロード',
    'ea.notFound': '添付ファイルが見つかりません',
    'ea.missingFile': 'この添付ファイルはストレージに存在しません。',
    'ea.evidenceSource': '証跡',
    'ea.projectSource': 'プロジェクト文書',
    'ea.source': '出所',
    'ea.forControl': '{{control}} の証跡',
    'ea.none': '証跡の添付ファイルはまだありません。',
    'ea.heading': '証跡の添付ファイル',
    'ea.attachedFiles': '添付ファイル'
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
