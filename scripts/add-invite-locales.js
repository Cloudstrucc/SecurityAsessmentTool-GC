#!/usr/bin/env node
// Adds the inv.* keys (invite banner + universal redeem modal) to all 8 locales.
const fs = require('fs');
const path = require('path');

const T = {
  en: {
    'inv.bannerSent': 'Invitation sent to',
    'inv.bannerShareLink': 'Share this link to redeem:',
    'inv.openRedeem': 'Open the redeem page in a new tab',
    'inv.codeRequired': 'Please enter an access code.',
    'inv.codeNotRecognized': 'That code was not recognized. Check it and try again.',
    'inv.codeExpired': 'This invitation has expired.',
    'inv.signInToRedeem': 'Please sign in to redeem this invitation.',
    'inv.wrongAccount': 'This invitation was sent to a different email address.',
    'inv.redeemedOk': 'Invitation redeemed.',
    'inv.redeemBtn': 'Redeem a code',
    'inv.redeemTitle': 'Redeem an invitation code',
    'inv.redeemHelp': "Enter the invitation or access code you received. We'll take you straight to the record.",
    'inv.codeLabel': 'Invitation / access code',
    'inv.redeemSubmit': 'Redeem & open',
    'inv.redeemCancel': 'Cancel'
  },
  fr: {
    'inv.bannerSent': 'Invitation envoyée à',
    'inv.bannerShareLink': 'Partagez ce lien pour l’activer :',
    'inv.openRedeem': 'Ouvrir la page d’activation dans un nouvel onglet',
    'inv.codeRequired': 'Veuillez saisir un code d’accès.',
    'inv.codeNotRecognized': 'Code non reconnu. Vérifiez-le et réessayez.',
    'inv.codeExpired': 'Cette invitation a expiré.',
    'inv.signInToRedeem': 'Veuillez vous connecter pour activer cette invitation.',
    'inv.wrongAccount': 'Cette invitation a été envoyée à une autre adresse courriel.',
    'inv.redeemedOk': 'Invitation activée.',
    'inv.redeemBtn': 'Utiliser un code',
    'inv.redeemTitle': 'Activer un code d’invitation',
    'inv.redeemHelp': 'Saisissez le code d’invitation ou d’accès reçu. Nous vous dirigeons directement vers l’enregistrement.',
    'inv.codeLabel': 'Code d’invitation / d’accès',
    'inv.redeemSubmit': 'Activer et ouvrir',
    'inv.redeemCancel': 'Annuler'
  },
  es: {
    'inv.bannerSent': 'Invitación enviada a',
    'inv.bannerShareLink': 'Comparte este enlace para canjearla:',
    'inv.openRedeem': 'Abrir la página de canje en una pestaña nueva',
    'inv.codeRequired': 'Introduce un código de acceso.',
    'inv.codeNotRecognized': 'Código no reconocido. Compruébalo e inténtalo de nuevo.',
    'inv.codeExpired': 'Esta invitación ha caducado.',
    'inv.signInToRedeem': 'Inicia sesión para canjear esta invitación.',
    'inv.wrongAccount': 'Esta invitación se envió a otra dirección de correo.',
    'inv.redeemedOk': 'Invitación canjeada.',
    'inv.redeemBtn': 'Canjear un código',
    'inv.redeemTitle': 'Canjear un código de invitación',
    'inv.redeemHelp': 'Introduce el código de invitación o de acceso que recibiste. Te llevaremos directamente al registro.',
    'inv.codeLabel': 'Código de invitación / acceso',
    'inv.redeemSubmit': 'Canjear y abrir',
    'inv.redeemCancel': 'Cancelar'
  },
  de: {
    'inv.bannerSent': 'Einladung gesendet an',
    'inv.bannerShareLink': 'Diesen Link zum Einlösen teilen:',
    'inv.openRedeem': 'Einlöseseite in neuem Tab öffnen',
    'inv.codeRequired': 'Bitte geben Sie einen Zugangscode ein.',
    'inv.codeNotRecognized': 'Code nicht erkannt. Bitte prüfen und erneut versuchen.',
    'inv.codeExpired': 'Diese Einladung ist abgelaufen.',
    'inv.signInToRedeem': 'Bitte melden Sie sich an, um diese Einladung einzulösen.',
    'inv.wrongAccount': 'Diese Einladung wurde an eine andere E-Mail-Adresse gesendet.',
    'inv.redeemedOk': 'Einladung eingelöst.',
    'inv.redeemBtn': 'Code einlösen',
    'inv.redeemTitle': 'Einladungscode einlösen',
    'inv.redeemHelp': 'Geben Sie den erhaltenen Einladungs- oder Zugangscode ein. Wir leiten Sie direkt zum Datensatz.',
    'inv.codeLabel': 'Einladungs-/Zugangscode',
    'inv.redeemSubmit': 'Einlösen und öffnen',
    'inv.redeemCancel': 'Abbrechen'
  },
  pt: {
    'inv.bannerSent': 'Convite enviado para',
    'inv.bannerShareLink': 'Compartilhe este link para resgatar:',
    'inv.openRedeem': 'Abrir a página de resgate em uma nova aba',
    'inv.codeRequired': 'Insira um código de acesso.',
    'inv.codeNotRecognized': 'Código não reconhecido. Verifique e tente novamente.',
    'inv.codeExpired': 'Este convite expirou.',
    'inv.signInToRedeem': 'Faça login para resgatar este convite.',
    'inv.wrongAccount': 'Este convite foi enviado para outro endereço de e-mail.',
    'inv.redeemedOk': 'Convite resgatado.',
    'inv.redeemBtn': 'Resgatar um código',
    'inv.redeemTitle': 'Resgatar um código de convite',
    'inv.redeemHelp': 'Insira o código de convite ou de acesso que você recebeu. Levaremos você diretamente ao registro.',
    'inv.codeLabel': 'Código de convite / acesso',
    'inv.redeemSubmit': 'Resgatar e abrir',
    'inv.redeemCancel': 'Cancelar'
  },
  it: {
    'inv.bannerSent': 'Invito inviato a',
    'inv.bannerShareLink': 'Condividi questo link per riscattarlo:',
    'inv.openRedeem': 'Apri la pagina di riscatto in una nuova scheda',
    'inv.codeRequired': 'Inserisci un codice di accesso.',
    'inv.codeNotRecognized': 'Codice non riconosciuto. Controllalo e riprova.',
    'inv.codeExpired': 'Questo invito è scaduto.',
    'inv.signInToRedeem': 'Accedi per riscattare questo invito.',
    'inv.wrongAccount': 'Questo invito è stato inviato a un altro indirizzo email.',
    'inv.redeemedOk': 'Invito riscattato.',
    'inv.redeemBtn': 'Riscatta un codice',
    'inv.redeemTitle': 'Riscatta un codice di invito',
    'inv.redeemHelp': 'Inserisci il codice di invito o di accesso ricevuto. Ti porteremo direttamente al record.',
    'inv.codeLabel': 'Codice di invito / accesso',
    'inv.redeemSubmit': 'Riscatta e apri',
    'inv.redeemCancel': 'Annulla'
  },
  nl: {
    'inv.bannerSent': 'Uitnodiging verzonden naar',
    'inv.bannerShareLink': 'Deel deze link om in te wisselen:',
    'inv.openRedeem': 'Open de inwisselpagina in een nieuw tabblad',
    'inv.codeRequired': 'Voer een toegangscode in.',
    'inv.codeNotRecognized': 'Code niet herkend. Controleer de code en probeer het opnieuw.',
    'inv.codeExpired': 'Deze uitnodiging is verlopen.',
    'inv.signInToRedeem': 'Meld je aan om deze uitnodiging in te wisselen.',
    'inv.wrongAccount': 'Deze uitnodiging is naar een ander e-mailadres verzonden.',
    'inv.redeemedOk': 'Uitnodiging ingewisseld.',
    'inv.redeemBtn': 'Een code inwisselen',
    'inv.redeemTitle': 'Een uitnodigingscode inwisselen',
    'inv.redeemHelp': 'Voer de ontvangen uitnodigings- of toegangscode in. We brengen je rechtstreeks naar het record.',
    'inv.codeLabel': 'Uitnodigings-/toegangscode',
    'inv.redeemSubmit': 'Inwisselen en openen',
    'inv.redeemCancel': 'Annuleren'
  },
  ja: {
    'inv.bannerSent': '招待の送信先:',
    'inv.bannerShareLink': '引き換え用のこのリンクを共有してください:',
    'inv.openRedeem': '引き換えページを新しいタブで開く',
    'inv.codeRequired': 'アクセスコードを入力してください。',
    'inv.codeNotRecognized': 'コードが認識されませんでした。確認して再度お試しください。',
    'inv.codeExpired': 'この招待は有効期限が切れています。',
    'inv.signInToRedeem': 'この招待を引き換えるにはサインインしてください。',
    'inv.wrongAccount': 'この招待は別のメールアドレス宛に送信されました。',
    'inv.redeemedOk': '招待を引き換えました。',
    'inv.redeemBtn': 'コードを引き換える',
    'inv.redeemTitle': '招待コードを引き換える',
    'inv.redeemHelp': '受け取った招待コードまたはアクセスコードを入力してください。該当のレコードへ直接ご案内します。',
    'inv.codeLabel': '招待 / アクセスコード',
    'inv.redeemSubmit': '引き換えて開く',
    'inv.redeemCancel': 'キャンセル'
  }
};

for (const [lang, keys] of Object.entries(T)) {
  const file = path.join(__dirname, '..', 'locales', `${lang}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const [k, v] of Object.entries(keys)) {
    if (json[k] === undefined) added++;
    json[k] = v;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`${lang}: ${added} added, ${Object.keys(keys).length} total inv.* keys`);
}
