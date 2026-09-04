#!/usr/bin/env node
// Adds evidence-ownership + portal "my work" keys to all 8 locales.
const fs = require('fs');
const path = require('path');

const T = {
  en: {
    'ev.openEvidenceFlow': 'Open evidence flow',
    'ev.openReadOnly': 'Open the evidence flow (read-only — assigned to someone else)',
    'ev.takeOwnership': 'Take ownership',
    'ev.takeOwnershipConfirm': "Take ownership of this assessment's evidence? It will be reassigned to you so you can edit it, and the current assignee keeps read-only access until you re-assign it.",
    'ev.roOwner': 'Read-only: this assessment is assigned to someone else. Take ownership from the assessment page to make changes.',
    'ev.roPast': 'Read-only: you are no longer assigned to this assessment.',
    'ev.roSave': 'Read-only: you are not the current owner of this assessment.',
    'ev.roSubmit': 'Only the current owner of this assessment can submit it.',
    'portal.myWork': 'My work',
    'portal.myAssessments': 'Assessments',
    'portal.myIntakes': 'Intakes',
    'portal.readOnly': 'Read-only',
    'portal.openWork': 'Open',
    'portal.viewWork': 'View'
  },
  fr: {
    'ev.openEvidenceFlow': 'Ouvrir le flux de preuves',
    'ev.openReadOnly': 'Ouvrir le flux de preuves (lecture seule — attribué à une autre personne)',
    'ev.takeOwnership': 'Prendre en charge',
    'ev.takeOwnershipConfirm': 'Prendre en charge les preuves de cette évaluation ? Elle vous sera réattribuée pour que vous puissiez la modifier, et la personne actuellement attribuée conservera un accès en lecture seule jusqu’à ce que vous la réattribuiez.',
    'ev.roOwner': 'Lecture seule : cette évaluation est attribuée à une autre personne. Prenez-la en charge depuis la page de l’évaluation pour la modifier.',
    'ev.roPast': 'Lecture seule : vous n’êtes plus attribué à cette évaluation.',
    'ev.roSave': 'Lecture seule : vous n’êtes pas le responsable actuel de cette évaluation.',
    'ev.roSubmit': 'Seul le responsable actuel de cette évaluation peut la soumettre.',
    'portal.myWork': 'Mes dossiers',
    'portal.myAssessments': 'Évaluations',
    'portal.myIntakes': 'Demandes d’admission',
    'portal.readOnly': 'Lecture seule',
    'portal.openWork': 'Ouvrir',
    'portal.viewWork': 'Consulter'
  },
  es: {
    'ev.openEvidenceFlow': 'Abrir el flujo de evidencias',
    'ev.openReadOnly': 'Abrir el flujo de evidencias (solo lectura: asignado a otra persona)',
    'ev.takeOwnership': 'Tomar propiedad',
    'ev.takeOwnershipConfirm': '¿Tomar propiedad de las evidencias de esta evaluación? Se te reasignará para que puedas editarla, y la persona asignada actualmente conservará acceso de solo lectura hasta que la reasignes.',
    'ev.roOwner': 'Solo lectura: esta evaluación está asignada a otra persona. Toma su propiedad desde la página de la evaluación para hacer cambios.',
    'ev.roPast': 'Solo lectura: ya no estás asignado a esta evaluación.',
    'ev.roSave': 'Solo lectura: no eres el propietario actual de esta evaluación.',
    'ev.roSubmit': 'Solo el propietario actual de esta evaluación puede enviarla.',
    'portal.myWork': 'Mi trabajo',
    'portal.myAssessments': 'Evaluaciones',
    'portal.myIntakes': 'Solicitudes',
    'portal.readOnly': 'Solo lectura',
    'portal.openWork': 'Abrir',
    'portal.viewWork': 'Ver'
  },
  de: {
    'ev.openEvidenceFlow': 'Nachweis-Workflow öffnen',
    'ev.openReadOnly': 'Nachweis-Workflow öffnen (schreibgeschützt – jemand anderem zugewiesen)',
    'ev.takeOwnership': 'Verantwortung übernehmen',
    'ev.takeOwnershipConfirm': 'Die Verantwortung für die Nachweise dieser Bewertung übernehmen? Sie wird Ihnen neu zugewiesen, damit Sie sie bearbeiten können; die aktuell zugewiesene Person behält schreibgeschützten Zugriff, bis Sie sie neu zuweisen.',
    'ev.roOwner': 'Schreibgeschützt: Diese Bewertung ist jemand anderem zugewiesen. Übernehmen Sie die Verantwortung auf der Bewertungsseite, um Änderungen vorzunehmen.',
    'ev.roPast': 'Schreibgeschützt: Sie sind dieser Bewertung nicht mehr zugewiesen.',
    'ev.roSave': 'Schreibgeschützt: Sie sind nicht der aktuelle Verantwortliche dieser Bewertung.',
    'ev.roSubmit': 'Nur der aktuelle Verantwortliche dieser Bewertung kann sie einreichen.',
    'portal.myWork': 'Meine Aufgaben',
    'portal.myAssessments': 'Bewertungen',
    'portal.myIntakes': 'Anfragen',
    'portal.readOnly': 'Schreibgeschützt',
    'portal.openWork': 'Öffnen',
    'portal.viewWork': 'Ansehen'
  },
  pt: {
    'ev.openEvidenceFlow': 'Abrir o fluxo de evidências',
    'ev.openReadOnly': 'Abrir o fluxo de evidências (somente leitura — atribuído a outra pessoa)',
    'ev.takeOwnership': 'Assumir a propriedade',
    'ev.takeOwnershipConfirm': 'Assumir a propriedade das evidências desta avaliação? Ela será reatribuída a você para que possa editá-la, e a pessoa atualmente atribuída manterá acesso somente leitura até você reatribuí-la.',
    'ev.roOwner': 'Somente leitura: esta avaliação está atribuída a outra pessoa. Assuma a propriedade na página da avaliação para fazer alterações.',
    'ev.roPast': 'Somente leitura: você não está mais atribuído a esta avaliação.',
    'ev.roSave': 'Somente leitura: você não é o proprietário atual desta avaliação.',
    'ev.roSubmit': 'Somente o proprietário atual desta avaliação pode enviá-la.',
    'portal.myWork': 'Meu trabalho',
    'portal.myAssessments': 'Avaliações',
    'portal.myIntakes': 'Solicitações',
    'portal.readOnly': 'Somente leitura',
    'portal.openWork': 'Abrir',
    'portal.viewWork': 'Ver'
  },
  it: {
    'ev.openEvidenceFlow': 'Apri il flusso delle prove',
    'ev.openReadOnly': "Apri il flusso delle prove (sola lettura — assegnato a un'altra persona)",
    'ev.takeOwnership': 'Assumi la titolarità',
    'ev.takeOwnershipConfirm': "Assumere la titolarità delle prove di questa valutazione? Verrà riassegnata a te per poterla modificare e la persona attualmente assegnata manterrà l'accesso in sola lettura finché non la riassegni.",
    'ev.roOwner': "Sola lettura: questa valutazione è assegnata a un'altra persona. Assumine la titolarità dalla pagina della valutazione per apportare modifiche.",
    'ev.roPast': 'Sola lettura: non sei più assegnato a questa valutazione.',
    'ev.roSave': 'Sola lettura: non sei il titolare attuale di questa valutazione.',
    'ev.roSubmit': 'Solo il titolare attuale di questa valutazione può inviarla.',
    'portal.myWork': 'Il mio lavoro',
    'portal.myAssessments': 'Valutazioni',
    'portal.myIntakes': 'Richieste',
    'portal.readOnly': 'Sola lettura',
    'portal.openWork': 'Apri',
    'portal.viewWork': 'Visualizza'
  },
  nl: {
    'ev.openEvidenceFlow': 'Bewijsstroom openen',
    'ev.openReadOnly': 'Bewijsstroom openen (alleen-lezen — aan iemand anders toegewezen)',
    'ev.takeOwnership': 'Eigenaarschap overnemen',
    'ev.takeOwnershipConfirm': 'Het eigenaarschap van het bewijs van deze beoordeling overnemen? De beoordeling wordt aan jou toegewezen zodat je deze kunt bewerken, en de huidige toegewezen persoon behoudt alleen-lezentoegang totdat je deze opnieuw toewijst.',
    'ev.roOwner': 'Alleen-lezen: deze beoordeling is aan iemand anders toegewezen. Neem het eigenaarschap over via de beoordelingspagina om wijzigingen aan te brengen.',
    'ev.roPast': 'Alleen-lezen: je bent niet langer aan deze beoordeling toegewezen.',
    'ev.roSave': 'Alleen-lezen: je bent niet de huidige eigenaar van deze beoordeling.',
    'ev.roSubmit': 'Alleen de huidige eigenaar van deze beoordeling kan deze indienen.',
    'portal.myWork': 'Mijn werk',
    'portal.myAssessments': 'Beoordelingen',
    'portal.myIntakes': 'Aanvragen',
    'portal.readOnly': 'Alleen-lezen',
    'portal.openWork': 'Openen',
    'portal.viewWork': 'Bekijken'
  },
  ja: {
    'ev.openEvidenceFlow': '証跡フローを開く',
    'ev.openReadOnly': '証跡フローを開く（読み取り専用 — 他の担当者に割り当て済み）',
    'ev.takeOwnership': '担当を引き継ぐ',
    'ev.takeOwnershipConfirm': 'この評価の証跡の担当を引き継ぎますか？編集できるようにあなたに再割り当てされ、現在の担当者は再割り当てするまで読み取り専用アクセスを保持します。',
    'ev.roOwner': '読み取り専用: この評価は他の担当者に割り当てられています。変更するには評価ページで担当を引き継いでください。',
    'ev.roPast': '読み取り専用: あなたはこの評価の担当ではなくなりました。',
    'ev.roSave': '読み取り専用: あなたはこの評価の現在の担当者ではありません。',
    'ev.roSubmit': 'この評価を提出できるのは現在の担当者のみです。',
    'portal.myWork': 'マイタスク',
    'portal.myAssessments': '評価',
    'portal.myIntakes': '受付申請',
    'portal.readOnly': '読み取り専用',
    'portal.openWork': '開く',
    'portal.viewWork': '表示'
  }
};

for (const [lang, keys] of Object.entries(T)) {
  const file = path.join(__dirname, '..', 'locales', `${lang}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const [k, v] of Object.entries(keys)) { if (json[k] === undefined) added++; json[k] = v; }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`${lang}: ${added} added, ${Object.keys(keys).length} total`);
}
