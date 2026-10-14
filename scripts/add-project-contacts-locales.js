#!/usr/bin/env node
/**
 * Add the "edit project contacts" keys (pc.*) to all 8 locale files.
 * Idempotent: an existing key is left alone so hand edits survive a re-run.
 *
 *   node scripts/add-project-contacts-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'pc.edit': 'Edit contacts',
    'pc.title': 'Edit project contacts',
    'pc.intro': 'Correct a name, email or organizational placement. Nothing else about the project is changed.',
    'pc.ownerName': 'Project owner / architect',
    'pc.ownerEmail': 'Project owner email',
    'pc.authorityName': 'Project authority',
    'pc.authorityEmail': 'Project authority email',
    'pc.cioName': 'CIO / delegated authority',
    'pc.cioEmail': 'CIO email',
    'pc.department': 'Department / agency',
    'pc.branch': 'Branch / directorate',
    'pc.save': 'Save contacts',
    'pc.cancel': 'Cancel',
    'pc.saved': 'Project contacts updated.',
    'pc.notFound': 'Project not found'
  },
  fr: {
    'pc.edit': 'Modifier les personnes-ressources',
    'pc.title': 'Modifier les personnes-ressources du projet',
    'pc.intro': "Corrigez un nom, un courriel ou le rattachement organisationnel. Rien d'autre n'est modifié dans le projet.",
    'pc.ownerName': 'Responsable / architecte du projet',
    'pc.ownerEmail': 'Courriel du responsable du projet',
    'pc.authorityName': 'Autorité du projet',
    'pc.authorityEmail': "Courriel de l'autorité du projet",
    'pc.cioName': 'DPI / autorité déléguée',
    'pc.cioEmail': 'Courriel du DPI',
    'pc.department': 'Ministère / organisme',
    'pc.branch': 'Direction générale',
    'pc.save': 'Enregistrer',
    'pc.cancel': 'Annuler',
    'pc.saved': 'Personnes-ressources du projet mises à jour.',
    'pc.notFound': 'Projet introuvable'
  },
  es: {
    'pc.edit': 'Editar contactos',
    'pc.title': 'Editar los contactos del proyecto',
    'pc.intro': 'Corrija un nombre, un correo electrónico o la ubicación organizativa. No se modifica nada más del proyecto.',
    'pc.ownerName': 'Responsable / arquitecto del proyecto',
    'pc.ownerEmail': 'Correo del responsable del proyecto',
    'pc.authorityName': 'Autoridad del proyecto',
    'pc.authorityEmail': 'Correo de la autoridad del proyecto',
    'pc.cioName': 'CIO / autoridad delegada',
    'pc.cioEmail': 'Correo del CIO',
    'pc.department': 'Departamento / organismo',
    'pc.branch': 'Dirección / área',
    'pc.save': 'Guardar contactos',
    'pc.cancel': 'Cancelar',
    'pc.saved': 'Contactos del proyecto actualizados.',
    'pc.notFound': 'Proyecto no encontrado'
  },
  de: {
    'pc.edit': 'Kontakte bearbeiten',
    'pc.title': 'Projektkontakte bearbeiten',
    'pc.intro': 'Korrigieren Sie einen Namen, eine E-Mail-Adresse oder die organisatorische Zuordnung. Am Projekt wird sonst nichts geändert.',
    'pc.ownerName': 'Projektverantwortliche Person / Architektur',
    'pc.ownerEmail': 'E-Mail der projektverantwortlichen Person',
    'pc.authorityName': 'Projektautorität',
    'pc.authorityEmail': 'E-Mail der Projektautorität',
    'pc.cioName': 'CIO / delegierte Autorität',
    'pc.cioEmail': 'E-Mail des CIO',
    'pc.department': 'Ministerium / Behörde',
    'pc.branch': 'Abteilung / Bereich',
    'pc.save': 'Kontakte speichern',
    'pc.cancel': 'Abbrechen',
    'pc.saved': 'Projektkontakte aktualisiert.',
    'pc.notFound': 'Projekt nicht gefunden'
  },
  pt: {
    'pc.edit': 'Editar contactos',
    'pc.title': 'Editar os contactos do projeto',
    'pc.intro': 'Corrija um nome, um e-mail ou a colocação organizacional. Mais nada do projeto é alterado.',
    'pc.ownerName': 'Responsável / arquiteto do projeto',
    'pc.ownerEmail': 'E-mail do responsável do projeto',
    'pc.authorityName': 'Autoridade do projeto',
    'pc.authorityEmail': 'E-mail da autoridade do projeto',
    'pc.cioName': 'CIO / autoridade delegada',
    'pc.cioEmail': 'E-mail do CIO',
    'pc.department': 'Departamento / organismo',
    'pc.branch': 'Direção / área',
    'pc.save': 'Guardar contactos',
    'pc.cancel': 'Cancelar',
    'pc.saved': 'Contactos do projeto atualizados.',
    'pc.notFound': 'Projeto não encontrado'
  },
  it: {
    'pc.edit': 'Modifica contatti',
    'pc.title': 'Modifica i contatti del progetto',
    'pc.intro': "Correggi un nome, un'email o la collocazione organizzativa. Nient'altro del progetto viene modificato.",
    'pc.ownerName': 'Responsabile / architetto del progetto',
    'pc.ownerEmail': 'Email del responsabile del progetto',
    'pc.authorityName': 'Autorità del progetto',
    'pc.authorityEmail': "Email dell'autorità del progetto",
    'pc.cioName': 'CIO / autorità delegata',
    'pc.cioEmail': 'Email del CIO',
    'pc.department': 'Dipartimento / ente',
    'pc.branch': 'Direzione / area',
    'pc.save': 'Salva contatti',
    'pc.cancel': 'Annulla',
    'pc.saved': 'Contatti del progetto aggiornati.',
    'pc.notFound': 'Progetto non trovato'
  },
  nl: {
    'pc.edit': 'Contactpersonen bewerken',
    'pc.title': 'Contactpersonen van het project bewerken',
    'pc.intro': 'Corrigeer een naam, e-mailadres of organisatorische plaatsing. Er verandert verder niets aan het project.',
    'pc.ownerName': 'Projecteigenaar / architect',
    'pc.ownerEmail': 'E-mailadres van de projecteigenaar',
    'pc.authorityName': 'Projectautoriteit',
    'pc.authorityEmail': 'E-mailadres van de projectautoriteit',
    'pc.cioName': 'CIO / gedelegeerde autoriteit',
    'pc.cioEmail': 'E-mailadres van de CIO',
    'pc.department': 'Ministerie / instantie',
    'pc.branch': 'Directie / afdeling',
    'pc.save': 'Contactpersonen opslaan',
    'pc.cancel': 'Annuleren',
    'pc.saved': 'Contactpersonen van het project bijgewerkt.',
    'pc.notFound': 'Project niet gevonden'
  },
  ja: {
    'pc.edit': '連絡先を編集',
    'pc.title': 'プロジェクトの連絡先を編集',
    'pc.intro': '氏名、メールアドレス、所属組織を修正します。プロジェクトの他の情報は変更されません。',
    'pc.ownerName': 'プロジェクト責任者／アーキテクト',
    'pc.ownerEmail': 'プロジェクト責任者のメールアドレス',
    'pc.authorityName': 'プロジェクト権限者',
    'pc.authorityEmail': 'プロジェクト権限者のメールアドレス',
    'pc.cioName': 'CIO／委任権限者',
    'pc.cioEmail': 'CIO のメールアドレス',
    'pc.department': '省庁／機関',
    'pc.branch': '部門／局',
    'pc.save': '連絡先を保存',
    'pc.cancel': 'キャンセル',
    'pc.saved': 'プロジェクトの連絡先を更新しました。',
    'pc.notFound': 'プロジェクトが見つかりません'
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
