/** Add ui.editEvidence / ui.viewEvidence to all 8 locales. Idempotent. */
const fs=require('fs'),path=require('path');
const L=path.join(__dirname,'..','locales'),langs=['en','fr','es','de','pt','it','nl','ja'];
const T={
  'ui.editEvidence':['Edit evidence','Modifier les preuves','Editar evidencia','Nachweise bearbeiten','Editar evidências','Modifica prove','Bewijs bewerken','証跡を編集'],
  'ui.viewEvidence':['View evidence','Voir les preuves','Ver evidencia','Nachweise ansehen','Ver evidências','Visualizza prove','Bewijs bekijken','証跡を表示']
};
const f={}; langs.forEach(l=>f[l]=JSON.parse(fs.readFileSync(path.join(L,l+'.json'),'utf8')));
Object.entries(T).forEach(([k,v])=>langs.forEach((l,i)=>f[l][k]=v[i]));
langs.forEach(l=>fs.writeFileSync(path.join(L,l+'.json'),JSON.stringify(f[l],null,2)+'\n'));
console.log('added',Object.keys(T).length,'keys to',langs.length,'locales');
