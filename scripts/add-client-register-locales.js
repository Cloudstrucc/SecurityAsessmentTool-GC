/** Add client-register form (crf.*) keys to all 8 locales. Idempotent. */
const fs=require('fs'),path=require('path');
const L=path.join(__dirname,'..','locales'),langs=['en','fr','es','de','pt','it','nl','ja'];
const T={
  'crf.title':['Create your account','Créer votre compte','Cree su cuenta','Konto erstellen','Crie sua conta','Crea il tuo account','Maak je account','アカウントを作成'],
  'crf.intro':["Register to submit a security assessment intake. You'll set up multi-factor authentication (MFA) next.",
    "Inscrivez-vous pour soumettre une admission d'évaluation de sécurité. Vous configurerez ensuite l'authentification multifacteur (MFA).",
    'Regístrese para enviar una admisión de evaluación de seguridad. Luego configurará la autenticación multifactor (MFA).',
    'Registrieren Sie sich, um eine Sicherheitsbewertung einzureichen. Anschließend richten Sie die Multi-Faktor-Authentifizierung (MFA) ein.',
    'Cadastre-se para enviar uma admissão de avaliação de segurança. Em seguida, você configurará a autenticação multifator (MFA).',
    "Registrati per inviare un'ammissione di valutazione della sicurezza. Successivamente configurerai l'autenticazione a più fattori (MFA).",
    'Registreer je om een beveiligingsbeoordeling in te dienen. Daarna stel je multifactorauthenticatie (MFA) in.',
    'セキュリティ評価のインテークを送信するには登録してください。次に多要素認証（MFA）を設定します。'],
  'crf.fullName':['Full name','Nom complet','Nombre completo','Vollständiger Name','Nome completo','Nome completo','Volledige naam','氏名'],
  'crf.fullNamePh':['e.g. Jane Doe','p. ex. Jean Dupont','p. ej. Juan Pérez','z. B. Max Mustermann','ex.: João Silva','es. Mario Rossi','bijv. Jan Jansen','例：山田 太郎'],
  'crf.emailHint':['Use your department or agency email address.',"Utilisez l'adresse courriel de votre ministère ou organisme.",'Use el correo de su departamento u organismo.','Verwenden Sie die E-Mail-Adresse Ihrer Abteilung oder Behörde.','Use o e-mail do seu departamento ou órgão.',"Usa l'indirizzo email del tuo dipartimento o ente.",'Gebruik het e-mailadres van je afdeling of organisatie.','所属部署または機関のメールアドレスを使用してください。'],
  'crf.org':['Department / organization','Ministère / organisation','Departamento / organización','Abteilung / Organisation','Departamento / organização','Dipartimento / organizzazione','Afdeling / organisatie','部署 / 組織'],
  'crf.passwordPh':['At least 10 characters','Au moins 10 caractères','Al menos 10 caracteres','Mindestens 10 Zeichen','Pelo menos 10 caracteres','Almeno 10 caratteri','Minimaal 10 tekens','10文字以上'],
  'crf.passwordHint':['At least 10 characters, mixing upper/lowercase, numbers and symbols.','Au moins 10 caractères, avec majuscules/minuscules, chiffres et symboles.','Al menos 10 caracteres, con mayúsculas/minúsculas, números y símbolos.','Mindestens 10 Zeichen mit Groß-/Kleinschreibung, Zahlen und Symbolen.','Pelo menos 10 caracteres, com maiúsculas/minúsculas, números e símbolos.','Almeno 10 caratteri, con maiuscole/minuscole, numeri e simboli.','Minimaal 10 tekens met hoofd-/kleine letters, cijfers en symbolen.','大文字・小文字・数字・記号を含む10文字以上。'],
  'crf.confirmPassword':['Confirm password','Confirmer le mot de passe','Confirmar contraseña','Passwort bestätigen','Confirmar senha','Conferma password','Bevestig wachtwoord','パスワードの確認'],
  'crf.inviteCode':['Invitation code (optional)',"Code d'invitation (facultatif)",'Código de invitación (opcional)','Einladungscode (optional)','Código de convite (opcional)',"Codice d'invito (facoltativo)",'Uitnodigingscode (optioneel)','招待コード（任意）'],
  'crf.continue':['Continue to MFA setup',"Continuer vers la configuration MFA",'Continuar a la configuración de MFA','Weiter zur MFA-Einrichtung','Continuar para a configuração de MFA','Continua alla configurazione MFA','Doorgaan naar MFA-instelling','MFA設定へ進む'],
  'crf.haveAccount':['Already have an account?','Vous avez déjà un compte ?','¿Ya tiene una cuenta?','Sie haben bereits ein Konto?','Já tem uma conta?','Hai già un account?','Heb je al een account?','すでにアカウントをお持ちですか？']
};
const f={}; langs.forEach(l=>f[l]=JSON.parse(fs.readFileSync(path.join(L,l+'.json'),'utf8')));
Object.entries(T).forEach(([k,v])=>langs.forEach((l,i)=>f[l][k]=v[i]));
langs.forEach(l=>fs.writeFileSync(path.join(L,l+'.json'),JSON.stringify(f[l],null,2)+'\n'));
console.log('added',Object.keys(T).length,'crf.* keys to',langs.length,'locales');
