#!/usr/bin/env node
/**
 * Add the tailoring scope-counter / bulk-feedback / per-control AI keys (bk.*)
 * to all 8 locale files. Idempotent: an existing key is left alone.
 *
 *   node scripts/add-tailoring-feedback-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'bk.ofInScope': 'of {{total}} controls in scope',
    'bk.tailoredOutLabel': 'tailored out',
    'bk.flashTailoredOut': '{n} control(s) tailored out',
    'bk.flashKeptOnly': 'Kept {n} control(s) in scope',
    'bk.generateGuidance': 'Generate with AI',
    'bk.aiWorking': 'Working…',
    'bk.aiFailed': 'The AI request could not be completed.'
  },
  fr: {
    'bk.ofInScope': 'de {{total}} contrôles dans la portée',
    'bk.tailoredOutLabel': 'retirés',
    'bk.flashTailoredOut': '{n} contrôle(s) retiré(s) de la portée',
    'bk.flashKeptOnly': '{n} contrôle(s) conservé(s) dans la portée',
    'bk.generateGuidance': "Générer avec l'IA",
    'bk.aiWorking': 'En cours…',
    'bk.aiFailed': "La demande à l'IA n'a pas pu aboutir."
  },
  es: {
    'bk.ofInScope': 'de {{total}} controles en el alcance',
    'bk.tailoredOutLabel': 'excluidos',
    'bk.flashTailoredOut': '{n} control(es) excluido(s) del alcance',
    'bk.flashKeptOnly': 'Se mantuvieron {n} control(es) en el alcance',
    'bk.generateGuidance': 'Generar con IA',
    'bk.aiWorking': 'Procesando…',
    'bk.aiFailed': 'No se pudo completar la solicitud a la IA.'
  },
  de: {
    'bk.ofInScope': 'von {{total}} Kontrollen im Geltungsbereich',
    'bk.tailoredOutLabel': 'ausgeschlossen',
    'bk.flashTailoredOut': '{n} Kontrolle(n) aus dem Geltungsbereich entfernt',
    'bk.flashKeptOnly': '{n} Kontrolle(n) im Geltungsbereich behalten',
    'bk.generateGuidance': 'Mit KI erzeugen',
    'bk.aiWorking': 'Wird bearbeitet…',
    'bk.aiFailed': 'Die KI-Anfrage konnte nicht abgeschlossen werden.'
  },
  pt: {
    'bk.ofInScope': 'de {{total}} controlos no âmbito',
    'bk.tailoredOutLabel': 'excluídos',
    'bk.flashTailoredOut': '{n} controlo(s) excluído(s) do âmbito',
    'bk.flashKeptOnly': '{n} controlo(s) mantido(s) no âmbito',
    'bk.generateGuidance': 'Gerar com IA',
    'bk.aiWorking': 'A processar…',
    'bk.aiFailed': 'Não foi possível concluir o pedido à IA.'
  },
  it: {
    'bk.ofInScope': 'di {{total}} controlli nel perimetro',
    'bk.tailoredOutLabel': 'esclusi',
    'bk.flashTailoredOut': '{n} controllo/i escluso/i dal perimetro',
    'bk.flashKeptOnly': '{n} controllo/i mantenuto/i nel perimetro',
    'bk.generateGuidance': "Genera con l'IA",
    'bk.aiWorking': 'In corso…',
    'bk.aiFailed': "Non è stato possibile completare la richiesta all'IA."
  },
  nl: {
    'bk.ofInScope': 'van {{total}} maatregelen binnen de scope',
    'bk.tailoredOutLabel': 'buiten scope',
    'bk.flashTailoredOut': '{n} maatregel(en) buiten de scope geplaatst',
    'bk.flashKeptOnly': '{n} maatregel(en) binnen de scope gehouden',
    'bk.generateGuidance': 'Genereren met AI',
    'bk.aiWorking': 'Bezig…',
    'bk.aiFailed': 'Het AI-verzoek kon niet worden voltooid.'
  },
  ja: {
    'bk.ofInScope': '／ {{total}} 件の管理策が対象範囲',
    'bk.tailoredOutLabel': '対象外',
    'bk.flashTailoredOut': '{n} 件の管理策を対象外にしました',
    'bk.flashKeptOnly': '{n} 件の管理策を対象範囲に残しました',
    'bk.generateGuidance': 'AI で生成',
    'bk.aiWorking': '処理中…',
    'bk.aiFailed': 'AI への要求を完了できませんでした。'
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
