/** Add compact-nav (navd.*) + record action-toolbar (ra.*) keys to all 8 locales. Idempotent. */
const fs = require('fs'); const path = require('path');
const LOCALES = path.join(__dirname, '..', 'locales');
const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'it', 'nl', 'ja'];
const T = {
  // ── Compact nav ──
  'navd.labels': ['Menu labels', 'Étiquettes du menu', 'Etiquetas del menú', 'Menübeschriftungen', 'Rótulos do menu', 'Etichette del menu', 'Menulabels', 'メニューのラベル'],
  'navd.iconsOnly': ['Icons only', 'Icônes seules', 'Solo iconos', 'Nur Symbole', 'Apenas ícones', 'Solo icone', 'Alleen pictogrammen', 'アイコンのみ'],
  'navd.iconText': ['Icon + title', 'Icône + titre', 'Icono + título', 'Symbol + Titel', 'Ícone + título', 'Icona + titolo', 'Pictogram + titel', 'アイコン + タイトル'],
  'navd.labelsShortcut': ['Shortcut: Ctrl / ⌘ + \\', 'Raccourci : Ctrl / ⌘ + \\', 'Atajo: Ctrl / ⌘ + \\', 'Tastenkürzel: Strg / ⌘ + \\', 'Atalho: Ctrl / ⌘ + \\', 'Scorciatoia: Ctrl / ⌘ + \\', 'Sneltoets: Ctrl / ⌘ + \\', 'ショートカット: Ctrl / ⌘ + \\'],
  'navd.expand': ['Expand / collapse', 'Développer / réduire', 'Expandir / contraer', 'Ein-/ausklappen', 'Expandir / recolher', 'Espandi / comprimi', 'Uitvouwen / inklappen', '展開 / 折りたたみ'],
  'navd.more': ['More', 'Plus', 'Más', 'Mehr', 'Mais', 'Altro', 'Meer', 'その他'],
  // ── Record action toolbar ──
  'ra.more': ['More', 'Plus', 'Más', 'Mehr', 'Mais', 'Altro', 'Meer', 'その他'],
  'ra.menu': ['Menu', 'Menu', 'Menú', 'Menü', 'Menu', 'Menu', 'Menu', 'メニュー'],
  'ra.dragToMove': ['Drag to move', 'Glisser pour déplacer', 'Arrastrar para mover', 'Zum Verschieben ziehen', 'Arraste para mover', 'Trascina per spostare', 'Sleep om te verplaatsen', 'ドラッグして移動'],
  'ra.dockHere': ['Dock here', 'Ancrer ici', 'Anclar aquí', 'Hier andocken', 'Encaixar aqui', 'Ancora qui', 'Hier vastzetten', 'ここに固定'],
  'ra.labelsHint': ['Ctrl / ⌘ + \\ toggles labels', 'Ctrl / ⌘ + \\ bascule les étiquettes', 'Ctrl / ⌘ + \\ alterna etiquetas', 'Strg / ⌘ + \\ schaltet Beschriftungen um', 'Ctrl / ⌘ + \\ alterna rótulos', 'Ctrl / ⌘ + \\ attiva/disattiva le etichette', 'Ctrl / ⌘ + \\ wisselt labels', 'Ctrl / ⌘ + \\ でラベルを切り替え'],
  'ra.collaboration': ['Collaboration', 'Collaboration', 'Colaboración', 'Zusammenarbeit', 'Colaboração', 'Collaborazione', 'Samenwerking', 'コラボレーション']
};
const files = {};
LANGS.forEach(l => files[l] = JSON.parse(fs.readFileSync(path.join(LOCALES, l + '.json'), 'utf8')));
Object.entries(T).forEach(([k, v]) => LANGS.forEach((l, i) => files[l][k] = v[i]));
LANGS.forEach(l => fs.writeFileSync(path.join(LOCALES, l + '.json'), JSON.stringify(files[l], null, 2) + '\n'));
console.log(`added ${Object.keys(T).length} keys to ${LANGS.length} locales`);
