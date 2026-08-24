/**
 * Add the intake-report + report-catalog rf.* keys to all 8 locales.
 * Idempotent. Order: en, fr, es, de, pt, it, nl, ja.
 */
const fs = require('fs');
const path = require('path');
const LOCALES = path.join(__dirname, '..', 'locales');
const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];

const T = {
  // intake fields
  'rf.submitted': ['Submitted', 'Soumis', 'Enviado', 'Eingereicht', 'Enviado', 'Inviato', 'Ingediend', '提出'],
  'rf.intakeUsers': ['Users', 'Utilisateurs', 'Usuarios', 'Benutzer', 'Usuários', 'Utenti', 'Gebruikers', '利用者'],
  'rf.intakeExternalUsers': ['External users', 'Utilisateurs externes', 'Usuarios externos', 'Externe Benutzer', 'Usuários externos', 'Utenti esterni', 'Externe gebruikers', '外部利用者'],
  'rf.intakeDepartment': ['Department', 'Ministère', 'Departamento', 'Abteilung', 'Departamento', 'Dipartimento', 'Afdeling', '部門'],
  'rf.intakeTargetDate': ['Target date', 'Date cible', 'Fecha objetivo', 'Zieldatum', 'Data-alvo', 'Data prevista', 'Streefdatum', '目標日'],
  'rf.intakeTechLead': ['Technical lead', 'Responsable technique', 'Líder técnico', 'Technische Leitung', 'Líder técnico', 'Responsabile tecnico', 'Technisch verantwoordelijke', '技術リード'],
  'rf.intakeNotes': ['Additional notes', 'Notes supplémentaires', 'Notas adicionales', 'Zusätzliche Hinweise', 'Notas adicionais', 'Note aggiuntive', 'Aanvullende notities', '補足事項'],

  // catalog / hub UI
  'rf.catalogTitle': ['Report templates', 'Modèles de rapport', 'Plantillas de informe', 'Berichtvorlagen', 'Modelos de relatório', 'Modelli di rapporto', 'Rapportsjablonen', 'レポートテンプレート'],
  'rf.catalogNoAi': ['No AI required', 'Sans IA', 'Sin IA', 'Keine KI nötig', 'Sem IA', 'Nessuna IA', 'Geen AI nodig', 'AI 不要'],
  'rf.catalogIntro': ['Every entity has a built-in report you can export as PDF, Word, HTML or Markdown — a straight, deterministic render of the record, no AI. Custom AI reports come later.',
    'Chaque entité dispose d\'un rapport intégré exportable en PDF, Word, HTML ou Markdown — un rendu direct et déterministe de l\'enregistrement, sans IA. Les rapports IA personnalisés viendront plus tard.',
    'Cada entidad tiene un informe integrado que puede exportar como PDF, Word, HTML o Markdown: una representación directa y determinista del registro, sin IA. Los informes de IA personalizados llegarán después.',
    'Jede Entität hat einen integrierten Bericht, den Sie als PDF, Word, HTML oder Markdown exportieren können — eine direkte, deterministische Darstellung des Datensatzes, ohne KI. Benutzerdefinierte KI-Berichte folgen später.',
    'Cada entidade tem um relatório integrado que você pode exportar como PDF, Word, HTML ou Markdown — uma renderização direta e determinística do registro, sem IA. Relatórios de IA personalizados virão depois.',
    'Ogni entità ha un rapporto integrato esportabile in PDF, Word, HTML o Markdown: una resa diretta e deterministica del record, senza IA. I rapporti IA personalizzati arriveranno in seguito.',
    'Elke entiteit heeft een ingebouwd rapport dat je als PDF, Word, HTML of Markdown kunt exporteren — een directe, deterministische weergave van het record, zonder AI. Aangepaste AI-rapporten volgen later.',
    '各エンティティには PDF・Word・HTML・Markdown で出力できる組み込みレポートがあります。AI を使わず、レコードをそのまま決定的に描画します。カスタム AI レポートは後日提供します。'],
  'rf.byRecord': ['Reports by record', 'Rapports par enregistrement', 'Informes por registro', 'Berichte nach Datensatz', 'Relatórios por registro', 'Rapporti per record', 'Rapporten per record', 'レコード別レポート'],
  'rf.design': ['Design', 'Concevoir', 'Diseñar', 'Gestalten', 'Projetar', 'Progetta', 'Ontwerpen', 'デザイン'],
  'rf.designSoon': ['Editing report designs is coming with the report designer.', 'La modification de la conception des rapports arrivera avec le concepteur de rapports.', 'La edición del diseño de informes llegará con el diseñador de informes.', 'Das Bearbeiten von Berichtsdesigns kommt mit dem Bericht-Designer.', 'A edição do design de relatórios chegará com o designer de relatórios.', 'La modifica del design dei rapporti arriverà con il designer di rapporti.', 'Het bewerken van rapportontwerpen komt met de rapportontwerper.', 'レポートデザインの編集はレポートデザイナーで提供予定です。'],

  // catalog entries — labels + descriptions
  'rf.catIntake': ['Intake submission', 'Soumission d\'admission', 'Solicitud de admisión', 'Aufnahmeantrag', 'Submissão de admissão', 'Modulo di richiesta', 'Aanmelding', 'インテーク申請'],
  'rf.catIntakeDesc': ['The submitted pre-project profile — classification, PII, hosting, contacts.', 'Le profil de préprojet soumis — classification, RP, hébergement, contacts.', 'El perfil de preproyecto enviado: clasificación, información personal, alojamiento, contactos.', 'Das eingereichte Vorprojekt-Profil — Klassifizierung, personenbezogene Daten, Hosting, Kontakte.', 'O perfil de pré-projeto enviado — classificação, dados pessoais, hospedagem, contatos.', 'Il profilo pre-progetto inviato: classificazione, dati personali, hosting, contatti.', 'Het ingediende pre-projectprofiel — classificatie, persoonsgegevens, hosting, contacten.', '提出された事前プロファイル — 分類、個人情報、ホスティング、連絡先。'],
  'rf.catAssessment': ['Assessment report', 'Rapport d\'évaluation', 'Informe de evaluación', 'Bewertungsbericht', 'Relatório de avaliação', 'Rapporto di valutazione', 'Beoordelingsrapport', '評価レポート'],
  'rf.catAssessmentDesc': ['The full SA&A record — scored control posture, findings, signatures.', 'Le dossier SA&A complet — posture des contrôles notée, constats, signatures.', 'El registro SA&A completo: estado de controles puntuado, hallazgos, firmas.', 'Der vollständige SA&A-Datensatz — bewerteter Kontrollstatus, Feststellungen, Unterschriften.', 'O registro SA&A completo — postura de controles pontuada, constatações, assinaturas.', 'Il record SA&A completo: stato dei controlli con punteggio, rilievi, firme.', 'Het volledige SA&A-record — gescoorde controlestatus, bevindingen, handtekeningen.', '完全な SA&A 記録 — スコア化したコントロール状況、所見、署名。'],
  'rf.catDecision': ['Decision package', 'Dossier de décision', 'Paquete de decisión', 'Entscheidungspaket', 'Pacote de decisão', 'Pacchetto decisionale', 'Besluitpakket', '決定パッケージ'],
  'rf.catDecisionDesc': ['The authorization decision, rendered from the pinned assessment version.', 'La décision d\'autorisation, générée à partir de la version d\'évaluation figée.', 'La decisión de autorización, generada a partir de la versión de evaluación fijada.', 'Die Autorisierungsentscheidung, erstellt aus der fixierten Bewertungsversion.', 'A decisão de autorização, gerada a partir da versão de avaliação fixada.', 'La decisione di autorizzazione, generata dalla versione di valutazione bloccata.', 'Het autorisatiebesluit, weergegeven vanuit de vastgezette beoordelingsversie.', '固定された評価バージョンから生成する承認決定。'],
  'rf.catPoam': ['POA&M register', 'Registre PA&J', 'Registro PA&H', 'PA&M-Register', 'Registro PA&M', 'Registro PA&T', 'PA&M-register', '対応計画レジスタ'],
  'rf.catPoamDesc': ['The conditions on an authorization — status, owners, deadlines, history.', 'Les conditions d\'une autorisation — état, responsables, échéances, historique.', 'Las condiciones de una autorización: estado, responsables, plazos, historial.', 'Die Bedingungen einer Autorisierung — Status, Verantwortliche, Fristen, Verlauf.', 'As condições de uma autorização — status, responsáveis, prazos, histórico.', 'Le condizioni di un\'autorizzazione: stato, responsabili, scadenze, cronologia.', 'De voorwaarden van een autorisatie — status, eigenaren, deadlines, geschiedenis.', '承認の条件 — 状態、担当、期限、履歴。'],
  'rf.catProject': ['Project rollup', 'Synthèse du projet', 'Resumen del proyecto', 'Projektübersicht', 'Consolidado do projeto', 'Riepilogo progetto', 'Projectoverzicht', 'プロジェクト集計'],
  'rf.catProjectDesc': ['A management view of a project — assessments, decisions, conditions, documents.', 'Une vue de gestion d\'un projet — évaluations, décisions, conditions, documents.', 'Una vista de gestión de un proyecto: evaluaciones, decisiones, condiciones, documentos.', 'Eine Management-Sicht eines Projekts — Bewertungen, Entscheidungen, Bedingungen, Dokumente.', 'Uma visão de gestão de um projeto — avaliações, decisões, condições, documentos.', 'Una vista gestionale di un progetto: valutazioni, decisioni, condizioni, documenti.', 'Een managementweergave van een project — beoordelingen, besluiten, voorwaarden, documenten.', 'プロジェクトの管理ビュー — 評価、決定、条件、文書。'],
  'rf.catPortfolio': ['Portfolio summary', 'Synthèse du portefeuille', 'Resumen de la cartera', 'Portfolio-Übersicht', 'Resumo do portfólio', 'Riepilogo del portfolio', 'Portfolio-overzicht', 'ポートフォリオ概要'],
  'rf.catPortfolioDesc': ['Every system in the tenant — scores, expiry watchlist, open conditions.', 'Tous les systèmes de l\'organisation — scores, échéances, conditions ouvertes.', 'Todos los sistemas del inquilino: puntuaciones, vencimientos, condiciones abiertas.', 'Alle Systeme des Mandanten — Punktzahlen, Ablauffristen, offene Bedingungen.', 'Todos os sistemas do tenant — pontuações, expirações, condições abertas.', 'Tutti i sistemi del tenant: punteggi, scadenze, condizioni aperte.', 'Elk systeem in de tenant — scores, vervaldata, open voorwaarden.', 'テナント内の全システム — スコア、期限、未解決条件。'],

  // entity group labels
  'rf.entity_intake': ['Intake', 'Admission', 'Admisión', 'Aufnahme', 'Admissão', 'Richiesta', 'Aanmelding', 'インテーク'],
  'rf.entity_assessment': ['Assessment', 'Évaluation', 'Evaluación', 'Bewertung', 'Avaliação', 'Valutazione', 'Beoordeling', '評価'],
  'rf.entity_decisionPackage': ['Decision package', 'Dossier de décision', 'Paquete de decisión', 'Entscheidungspaket', 'Pacote de decisão', 'Pacchetto decisionale', 'Besluitpakket', '決定パッケージ'],
  'rf.entity_project': ['Project', 'Projet', 'Proyecto', 'Projekt', 'Projeto', 'Progetto', 'Project', 'プロジェクト'],
  'rf.entity_organization': ['Organization', 'Organisation', 'Organización', 'Organisation', 'Organização', 'Organizzazione', 'Organisatie', '組織']
};

const files = {};
LANGS.forEach(l => { files[l] = JSON.parse(fs.readFileSync(path.join(LOCALES, l + '.json'), 'utf8')); });
Object.entries(T).forEach(([key, vals]) => { LANGS.forEach((l, i) => { files[l][key] = vals[i]; }); });
LANGS.forEach(l => fs.writeFileSync(path.join(LOCALES, l + '.json'), JSON.stringify(files[l], null, 2) + '\n'));
console.log(`added/updated ${Object.keys(T).length} rf.* keys in ${LANGS.length} locales`);
