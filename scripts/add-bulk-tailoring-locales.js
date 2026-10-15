#!/usr/bin/env node
/**
 * Add the bulk control-selection keys (bk.*) to all 8 locale files.
 * Idempotent: an existing key is left alone so hand edits survive a re-run.
 *
 *   node scripts/add-bulk-tailoring-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'bk.barLabel': 'Bulk actions for the selected controls',
    'bk.selected': 'selected',
    'bk.tailorOutSelected': 'Tailor out selected',
    'bk.keepOnly': 'Keep only these',
    'bk.clear': 'Clear selection',
    'bk.selectFamily': 'Select family',
    'bk.tailorOutFamily': 'Tailor out family',
    'bk.reasonPh': 'Reason for tailoring out (optional)'
  },
  fr: {
    'bk.barLabel': 'Actions groupées sur les contrôles sélectionnés',
    'bk.selected': 'sélectionné(s)',
    'bk.tailorOutSelected': 'Retirer la sélection',
    'bk.keepOnly': 'Ne garder que ceux-ci',
    'bk.clear': 'Effacer la sélection',
    'bk.selectFamily': 'Sélectionner la famille',
    'bk.tailorOutFamily': 'Retirer la famille',
    'bk.reasonPh': 'Motif du retrait (facultatif)'
  },
  es: {
    'bk.barLabel': 'Acciones en lote sobre los controles seleccionados',
    'bk.selected': 'seleccionado(s)',
    'bk.tailorOutSelected': 'Excluir la selección',
    'bk.keepOnly': 'Conservar solo estos',
    'bk.clear': 'Borrar la selección',
    'bk.selectFamily': 'Seleccionar familia',
    'bk.tailorOutFamily': 'Excluir familia',
    'bk.reasonPh': 'Motivo de la exclusión (opcional)'
  },
  de: {
    'bk.barLabel': 'Sammelaktionen für die ausgewählten Massnahmen',
    'bk.selected': 'ausgewählt',
    'bk.tailorOutSelected': 'Auswahl herausnehmen',
    'bk.keepOnly': 'Nur diese behalten',
    'bk.clear': 'Auswahl aufheben',
    'bk.selectFamily': 'Familie auswählen',
    'bk.tailorOutFamily': 'Familie herausnehmen',
    'bk.reasonPh': 'Grund für das Herausnehmen (optional)'
  },
  pt: {
    'bk.barLabel': 'Ações em lote sobre os controlos selecionados',
    'bk.selected': 'selecionado(s)',
    'bk.tailorOutSelected': 'Retirar a seleção',
    'bk.keepOnly': 'Manter apenas estes',
    'bk.clear': 'Limpar seleção',
    'bk.selectFamily': 'Selecionar família',
    'bk.tailorOutFamily': 'Retirar família',
    'bk.reasonPh': 'Motivo da retirada (opcional)'
  },
  it: {
    'bk.barLabel': 'Azioni in blocco sui controlli selezionati',
    'bk.selected': 'selezionato/i',
    'bk.tailorOutSelected': 'Escludi la selezione',
    'bk.keepOnly': 'Tieni solo questi',
    'bk.clear': 'Annulla selezione',
    'bk.selectFamily': 'Seleziona famiglia',
    'bk.tailorOutFamily': 'Escludi famiglia',
    'bk.reasonPh': 'Motivo dell\u2019esclusione (facoltativo)'
  },
  nl: {
    'bk.barLabel': 'Bulkacties voor de geselecteerde maatregelen',
    'bk.selected': 'geselecteerd',
    'bk.tailorOutSelected': 'Selectie buiten scope plaatsen',
    'bk.keepOnly': 'Alleen deze behouden',
    'bk.clear': 'Selectie wissen',
    'bk.selectFamily': 'Familie selecteren',
    'bk.tailorOutFamily': 'Familie buiten scope plaatsen',
    'bk.reasonPh': 'Reden voor uitsluiting (optioneel)'
  },
  ja: {
    'bk.barLabel': '選択した管理策の一括操作',
    'bk.selected': '件を選択中',
    'bk.tailorOutSelected': '選択を対象範囲から除外',
    'bk.keepOnly': 'これらのみ残す',
    'bk.clear': '選択を解除',
    'bk.selectFamily': 'ファミリーを選択',
    'bk.tailorOutFamily': 'ファミリーを除外',
    'bk.reasonPh': '除外する理由（任意）'
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
