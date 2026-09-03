/** Add per-user Basic plan (pl.*) keys to all 8 locales. Idempotent. */
const fs = require('fs'); const path = require('path');
const LOCALES = path.join(__dirname, '..', 'locales');
const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
const T = {
  'pl.basic': ['Basic', 'Essentiel', 'Básico', 'Basic', 'Básico', 'Base', 'Basis', 'ベーシック'],
  'pl.perUser': ['per user / month', 'par utilisateur / mois', 'por usuario / mes', 'pro Benutzer / Monat', 'por usuário / mês', 'per utente / mese', 'per gebruiker / maand', 'ユーザーあたり / 月'],
  'pl.basicTag': ['Every feature, billed per user.', 'Toutes les fonctionnalités, facturé par utilisateur.', 'Todas las funciones, facturado por usuario.', 'Alle Funktionen, Abrechnung pro Benutzer.', 'Todos os recursos, cobrado por usuário.', 'Tutte le funzionalità, fatturato per utente.', 'Alle functies, gefactureerd per gebruiker.', '全機能、ユーザー単位の課金。'],
  'pl.basicCta': ['Start with Basic', 'Choisir Essentiel', 'Empezar con Básico', 'Mit Basic starten', 'Começar com Básico', 'Inizia con Base', 'Begin met Basis', 'ベーシックで始める'],
  'pl.basicF1': ['Unlimited users & projects', 'Utilisateurs et projets illimités', 'Usuarios y proyectos ilimitados', 'Unbegrenzte Benutzer & Projekte', 'Usuários e projetos ilimitados', 'Utenti e progetti illimitati', 'Onbeperkte gebruikers & projecten', 'ユーザー・プロジェクト無制限'],
  'pl.basicF2': ['Every feature included', 'Toutes les fonctionnalités incluses', 'Todas las funciones incluidas', 'Alle Funktionen enthalten', 'Todos os recursos incluídos', 'Tutte le funzionalità incluse', 'Alle functies inbegrepen', '全機能を含む'],
  'pl.basicF3': ['Generous monthly AI allowance', 'Allocation IA mensuelle généreuse', 'Asignación mensual de IA generosa', 'Großzügiges monatliches KI-Kontingent', 'Cota mensal de IA generosa', 'Ampia quota IA mensile', 'Royaal maandelijks AI-tegoed', '充実した月間 AI 利用枠']
};
const files = {};
LANGS.forEach(l => files[l] = JSON.parse(fs.readFileSync(path.join(LOCALES, l + '.json'), 'utf8')));
Object.entries(T).forEach(([k, v]) => LANGS.forEach((l, i) => files[l][k] = v[i]));
LANGS.forEach(l => fs.writeFileSync(path.join(LOCALES, l + '.json'), JSON.stringify(files[l], null, 2) + '\n'));
console.log(`added ${Object.keys(T).length} pl.* keys to ${LANGS.length} locales`);
