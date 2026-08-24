/** Add the help-centre (hf.*) keys to all 8 locales. Idempotent. */
const fs = require('fs'); const path = require('path');
const LOCALES = path.join(__dirname, '..', 'locales');
const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
const T = {
  'hf.title': ['Help', 'Aide', 'Ayuda', 'Hilfe', 'Ajuda', 'Aiuto', 'Help', 'ヘルプ'],
  'hf.intro': ['How Aegis SA works — from intake to authorization, reports and settings.',
    'Comment fonctionne Aegis SA — de l\'admission à l\'autorisation, aux rapports et aux paramètres.',
    'Cómo funciona Aegis SA: de la admisión a la autorización, los informes y la configuración.',
    'So funktioniert Aegis SA — von der Aufnahme über die Autorisierung bis zu Berichten und Einstellungen.',
    'Como o Aegis SA funciona — da admissão à autorização, relatórios e configurações.',
    'Come funziona Aegis SA — dall\'ammissione all\'autorizzazione, ai rapporti e alle impostazioni.',
    'Hoe Aegis SA werkt — van aanmelding tot autorisatie, rapporten en instellingen.',
    'Aegis SA の使い方 — インテークから承認、レポート、設定まで。'],
  'hf.contents': ['Contents', 'Sommaire', 'Contenido', 'Inhalt', 'Conteúdo', 'Contenuto', 'Inhoud', '目次'],
  'hf.new': ['New', 'Nouveau', 'Nuevo', 'Neu', 'Novo', 'Nuovo', 'Nieuw', '新機能'],
  'hf.sGettingStarted': ['Getting started', 'Démarrage', 'Introducción', 'Erste Schritte', 'Primeiros passos', 'Per iniziare', 'Aan de slag', 'はじめに'],
  'hf.sProjects': ['Projects & intake', 'Projets et admission', 'Proyectos y admisión', 'Projekte & Aufnahme', 'Projetos e admissão', 'Progetti e ammissione', 'Projecten & aanmelding', 'プロジェクトとインテーク'],
  'hf.sAssessments': ['Assessments', 'Évaluations', 'Evaluaciones', 'Bewertungen', 'Avaliações', 'Valutazioni', 'Beoordelingen', '評価'],
  'hf.sEvidence': ['Evidence & AI guidance', 'Preuves et aide IA', 'Evidencia y guía de IA', 'Nachweise & KI-Hilfe', 'Evidências e orientação de IA', 'Prove e guida IA', 'Bewijs & AI-hulp', '証跡と AI ガイド'],
  'hf.sDecisions': ['Decision packages', 'Dossiers de décision', 'Paquetes de decisión', 'Entscheidungspakete', 'Pacotes de decisão', 'Pacchetti decisionali', 'Besluitpakketten', '決定パッケージ'],
  'hf.sPoam': ['POA&M', 'PA&J', 'PA&H', 'PA&M', 'PA&M', 'PA&T', 'PA&M', '対応計画'],
  'hf.sReports': ['Reports & exports', 'Rapports et exports', 'Informes y exportaciones', 'Berichte & Exporte', 'Relatórios e exportações', 'Rapporti ed esportazioni', 'Rapporten & exports', 'レポートとエクスポート'],
  'hf.sSettings': ['Organization settings', 'Paramètres de l\'organisation', 'Configuración de la organización', 'Organisationseinstellungen', 'Configurações da organização', 'Impostazioni organizzazione', 'Organisatie-instellingen', '組織設定'],
  'hf.sNavigation': ['Navigation & menu', 'Navigation et menu', 'Navegación y menú', 'Navigation & Menü', 'Navegação e menu', 'Navigazione e menu', 'Navigatie & menu', 'ナビゲーションとメニュー'],
  'hf.sAssistant': ['The Aegis SA Assistant', 'L\'assistant Aegis SA', 'El asistente Aegis SA', 'Der Aegis SA-Assistent', 'O assistente Aegis SA', 'L\'assistente Aegis SA', 'De Aegis SA-assistent', 'Aegis SA アシスタント'],
  'hf.sTrouble': ['Troubleshooting', 'Dépannage', 'Solución de problemas', 'Fehlerbehebung', 'Solução de problemas', 'Risoluzione dei problemi', 'Probleemoplossing', 'トラブルシューティング'],
  'hf.tReportNotFound': ['“Report not found” on export:', '« Rapport introuvable » à l\'export :', '«Informe no encontrado» al exportar:', '„Bericht nicht gefunden" beim Export:', '“Relatório não encontrado” ao exportar:', '«Rapporto non trovato» durante l\'esportazione:', '"Rapport niet gevonden" bij export:', 'エクスポート時の「レポートが見つかりません」：'],
  'hf.tReportNotFoundBody': ['make sure you\'re on a record you can open; reports follow the same access as the record\'s page.',
    'assurez-vous d\'être sur un enregistrement accessible ; les rapports suivent les mêmes accès que la page de l\'enregistrement.',
    'asegúrese de estar en un registro que pueda abrir; los informes siguen el mismo acceso que la página del registro.',
    'stellen Sie sicher, dass Sie einen Datensatz geöffnet haben, auf den Sie zugreifen dürfen; Berichte folgen demselben Zugriff wie die Datensatzseite.',
    'verifique se você está em um registro que pode abrir; os relatórios seguem o mesmo acesso da página do registro.',
    'assicurati di essere su un record che puoi aprire; i rapporti seguono lo stesso accesso della pagina del record.',
    'zorg dat je op een record zit dat je kunt openen; rapporten volgen dezelfde toegang als de recordpagina.',
    '開けるレコードにいることを確認してください。レポートはそのレコードのページと同じアクセス権に従います。'],
  'hf.tMfa': ['MFA / sign-in issues:', 'Problèmes de MFA / connexion :', 'Problemas de MFA / inicio de sesión:', 'MFA-/Anmeldeprobleme:', 'Problemas de MFA / login:', 'Problemi di MFA / accesso:', 'MFA-/aanmeldproblemen:', 'MFA・サインインの問題：'],
  'hf.tMfaBody': ['use the passkey option or contact your organization administrator to reset multi-factor authentication.',
    'utilisez l\'option de clé d\'accès ou contactez l\'administrateur de votre organisation pour réinitialiser l\'authentification multifacteur.',
    'use la opción de clave de acceso o contacte al administrador de su organización para restablecer la autenticación multifactor.',
    'nutzen Sie die Passkey-Option oder wenden Sie sich an Ihren Organisationsadministrator, um die Multi-Faktor-Authentifizierung zurückzusetzen.',
    'use a opção de chave de acesso ou contate o administrador da sua organização para redefinir a autenticação multifator.',
    'usa l\'opzione passkey o contatta l\'amministratore della tua organizzazione per reimpostare l\'autenticazione a più fattori.',
    'gebruik de passkey-optie of neem contact op met je organisatiebeheerder om multifactorauthenticatie te resetten.',
    'パスキーを使うか、組織管理者に連絡して多要素認証をリセットしてください。'],
  'hf.footerNote': ['Still stuck? Ask the Aegis SA Assistant on any record page, or contact your administrator.',
    'Toujours bloqué ? Interrogez l\'assistant Aegis SA sur n\'importe quelle page d\'enregistrement, ou contactez votre administrateur.',
    '¿Sigue con dudas? Pregunte al asistente Aegis SA en cualquier página de registro o contacte a su administrador.',
    'Immer noch nicht weiter? Fragen Sie den Aegis SA-Assistenten auf einer beliebigen Datensatzseite oder wenden Sie sich an Ihren Administrator.',
    'Ainda com dúvidas? Pergunte ao assistente Aegis SA em qualquer página de registro ou contate seu administrador.',
    'Ancora bloccato? Chiedi all\'assistente Aegis SA in qualsiasi pagina di record o contatta il tuo amministratore.',
    'Nog steeds vast? Vraag het de Aegis SA-assistent op elke recordpagina of neem contact op met je beheerder.',
    'まだ解決しませんか？ 任意のレコードページで Aegis SA アシスタントに尋ねるか、管理者に連絡してください。']
};
const files = {};
LANGS.forEach(l => files[l] = JSON.parse(fs.readFileSync(path.join(LOCALES, l + '.json'), 'utf8')));
Object.entries(T).forEach(([k, v]) => LANGS.forEach((l, i) => files[l][k] = v[i]));
LANGS.forEach(l => fs.writeFileSync(path.join(LOCALES, l + '.json'), JSON.stringify(files[l], null, 2) + '\n'));
console.log(`added ${Object.keys(T).length} hf.* keys to ${LANGS.length} locales`);
