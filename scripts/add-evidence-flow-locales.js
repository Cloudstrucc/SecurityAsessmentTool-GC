#!/usr/bin/env node
/**
 * Add the evidence-flow keys (ev.noFlow, ev.roDraft, ev.notReady*) to all 8
 * locale files. Idempotent: an existing key is left alone so hand edits survive.
 *
 *   node scripts/add-evidence-flow-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'ev.noFlow': 'No evidence flow yet',
    'ev.roDraft': 'Preview only: this assessment is still a draft. Use "Assign & send" on the assessment record to open it for evidence.',
    'ev.notReadyTitle': 'Not ready',
    'ev.notReadyMsg': 'This assessment has not been activated yet.'
  },
  fr: {
    'ev.noFlow': 'Aucun flux de preuves',
    'ev.roDraft': "Aperçu seulement : cette évaluation est encore un brouillon. Utilisez « Attribuer et envoyer » sur la fiche d'évaluation pour l'ouvrir aux preuves.",
    'ev.notReadyTitle': 'Pas encore prête',
    'ev.notReadyMsg': "Cette évaluation n'a pas encore été activée."
  },
  es: {
    'ev.noFlow': 'Aún no hay flujo de evidencia',
    'ev.roDraft': 'Solo vista previa: esta evaluación sigue en borrador. Use «Asignar y enviar» en el registro de la evaluación para abrirla a la evidencia.',
    'ev.notReadyTitle': 'No está lista',
    'ev.notReadyMsg': 'Esta evaluación todavía no se ha activado.'
  },
  de: {
    'ev.noFlow': 'Noch kein Nachweisprozess',
    'ev.roDraft': 'Nur Vorschau: Diese Bewertung ist noch ein Entwurf. Öffnen Sie sie über „Zuweisen und senden" im Bewertungsdatensatz für Nachweise.',
    'ev.notReadyTitle': 'Noch nicht bereit',
    'ev.notReadyMsg': 'Diese Bewertung wurde noch nicht aktiviert.'
  },
  pt: {
    'ev.noFlow': 'Ainda sem fluxo de evidência',
    'ev.roDraft': 'Apenas pré-visualização: esta avaliação ainda é um rascunho. Use «Atribuir e enviar» no registo da avaliação para a abrir à evidência.',
    'ev.notReadyTitle': 'Ainda não está pronta',
    'ev.notReadyMsg': 'Esta avaliação ainda não foi ativada.'
  },
  it: {
    'ev.noFlow': 'Nessun flusso di prove',
    'ev.roDraft': 'Solo anteprima: questa valutazione è ancora una bozza. Usa «Assegna e invia» nella scheda della valutazione per aprirla alle prove.',
    'ev.notReadyTitle': 'Non ancora pronta',
    'ev.notReadyMsg': 'Questa valutazione non è ancora stata attivata.'
  },
  nl: {
    'ev.noFlow': 'Nog geen bewijsstroom',
    'ev.roDraft': 'Alleen voorbeeld: deze beoordeling is nog een concept. Gebruik "Toewijzen en versturen" op het beoordelingsrecord om hem open te stellen voor bewijs.',
    'ev.notReadyTitle': 'Nog niet gereed',
    'ev.notReadyMsg': 'Deze beoordeling is nog niet geactiveerd.'
  },
  ja: {
    'ev.noFlow': '証跡フローはまだありません',
    'ev.roDraft': 'プレビューのみ: この評価はまだ下書きです。評価レコードの「割り当てて送信」から証跡の受付を開始してください。',
    'ev.notReadyTitle': '準備ができていません',
    'ev.notReadyMsg': 'この評価はまだ有効化されていません。'
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
