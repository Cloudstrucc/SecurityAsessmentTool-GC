#!/usr/bin/env node
/**
 * Add the intake archive / delete keys (ik.*) to all 8 locale files.
 * Idempotent: an existing key is left alone so hand edits survive a re-run.
 *
 *   node scripts/add-intake-archive-locales.js
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'locales');

const KEYS = {
  en: {
    'ik.archive': 'Archive',
    'ik.archiveHelp': 'Hide this intake from the lists without deleting it',
    'ik.restore': 'Restore',
    'ik.restoreHelp': 'Bring this intake back into the active list',
    'ik.delete': 'Delete',
    'ik.deleteHelp': 'Permanently delete this intake',
    'ik.deleteTitle': 'Delete this intake permanently?',
    'ik.deleteBody': 'This removes the intake and its attachments for good. It cannot be undone.',
    'ik.deleteArchiveHint': 'If you only want it out of the way, archive it instead — nothing is lost and you can restore it later.',
    'ik.deleteConfirm': 'Delete permanently',
    'ik.deleted': 'Intake {{ref}} deleted permanently.',
    'ik.deleteBlocked': 'That intake belongs to a project or assessment, so it cannot be deleted. Archive it instead — it will be hidden everywhere without breaking the record it belongs to.',
    'ik.archived': 'Intake {{ref}} archived. It is hidden from the lists but not deleted.',
    'ik.alreadyArchived': 'That intake is already archived.',
    'ik.restored': 'Intake restored.',
    'ik.notFound': 'Intake not found.',
    'ik.showActive': 'Active intakes'
  },
  fr: {
    'ik.archive': 'Archiver',
    'ik.archiveHelp': 'Masquer cette demande des listes sans la supprimer',
    'ik.restore': 'Restaurer',
    'ik.restoreHelp': 'Remettre cette demande dans la liste active',
    'ik.delete': 'Supprimer',
    'ik.deleteHelp': 'Supprimer définitivement cette demande',
    'ik.deleteTitle': 'Supprimer définitivement cette demande ?',
    'ik.deleteBody': 'Cela supprime la demande et ses pièces jointes de façon définitive. Cette action est irréversible.',
    'ik.deleteArchiveHint': "Si vous souhaitez seulement l'écarter, archivez-la plutôt — rien n'est perdu et vous pourrez la restaurer.",
    'ik.deleteConfirm': 'Supprimer définitivement',
    'ik.deleted': 'Demande {{ref}} supprimée définitivement.',
    'ik.deleteBlocked': "Cette demande appartient à un projet ou à une évaluation et ne peut donc pas être supprimée. Archivez-la plutôt : elle sera masquée partout sans compromettre l'enregistrement auquel elle appartient.",
    'ik.archived': 'Demande {{ref}} archivée. Elle est masquée des listes mais non supprimée.',
    'ik.alreadyArchived': 'Cette demande est déjà archivée.',
    'ik.restored': 'Demande restaurée.',
    'ik.notFound': 'Demande introuvable.',
    'ik.showActive': 'Demandes actives'
  },
  es: {
    'ik.archive': 'Archivar',
    'ik.archiveHelp': 'Ocultar esta solicitud de las listas sin eliminarla',
    'ik.restore': 'Restaurar',
    'ik.restoreHelp': 'Devolver esta solicitud a la lista activa',
    'ik.delete': 'Eliminar',
    'ik.deleteHelp': 'Eliminar definitivamente esta solicitud',
    'ik.deleteTitle': '¿Eliminar definitivamente esta solicitud?',
    'ik.deleteBody': 'Esto elimina la solicitud y sus adjuntos de forma permanente. No se puede deshacer.',
    'ik.deleteArchiveHint': 'Si solo quiere apartarla, archívela en su lugar: no se pierde nada y podrá restaurarla después.',
    'ik.deleteConfirm': 'Eliminar definitivamente',
    'ik.deleted': 'Solicitud {{ref}} eliminada definitivamente.',
    'ik.deleteBlocked': 'Esa solicitud pertenece a un proyecto o una evaluación, por lo que no se puede eliminar. Archívela en su lugar: quedará oculta en todas partes sin dañar el registro al que pertenece.',
    'ik.archived': 'Solicitud {{ref}} archivada. Queda oculta de las listas pero no se elimina.',
    'ik.alreadyArchived': 'Esa solicitud ya está archivada.',
    'ik.restored': 'Solicitud restaurada.',
    'ik.notFound': 'Solicitud no encontrada.',
    'ik.showActive': 'Solicitudes activas'
  },
  de: {
    'ik.archive': 'Archivieren',
    'ik.archiveHelp': 'Diesen Antrag aus den Listen ausblenden, ohne ihn zu löschen',
    'ik.restore': 'Wiederherstellen',
    'ik.restoreHelp': 'Diesen Antrag zurück in die aktive Liste holen',
    'ik.delete': 'Löschen',
    'ik.deleteHelp': 'Diesen Antrag endgültig löschen',
    'ik.deleteTitle': 'Diesen Antrag endgültig löschen?',
    'ik.deleteBody': 'Dadurch werden der Antrag und seine Anhänge dauerhaft entfernt. Das lässt sich nicht rückgängig machen.',
    'ik.deleteArchiveHint': 'Wenn Sie ihn nur aus dem Weg haben möchten, archivieren Sie ihn stattdessen — nichts geht verloren und Sie können ihn später wiederherstellen.',
    'ik.deleteConfirm': 'Endgültig löschen',
    'ik.deleted': 'Antrag {{ref}} endgültig gelöscht.',
    'ik.deleteBlocked': 'Dieser Antrag gehört zu einem Projekt oder einer Bewertung und kann daher nicht gelöscht werden. Archivieren Sie ihn stattdessen — er wird überall ausgeblendet, ohne den zugehörigen Datensatz zu beschädigen.',
    'ik.archived': 'Antrag {{ref}} archiviert. Er ist aus den Listen ausgeblendet, aber nicht gelöscht.',
    'ik.alreadyArchived': 'Dieser Antrag ist bereits archiviert.',
    'ik.restored': 'Antrag wiederhergestellt.',
    'ik.notFound': 'Antrag nicht gefunden.',
    'ik.showActive': 'Aktive Anträge'
  },
  pt: {
    'ik.archive': 'Arquivar',
    'ik.archiveHelp': 'Ocultar este pedido das listas sem o eliminar',
    'ik.restore': 'Restaurar',
    'ik.restoreHelp': 'Repor este pedido na lista ativa',
    'ik.delete': 'Eliminar',
    'ik.deleteHelp': 'Eliminar definitivamente este pedido',
    'ik.deleteTitle': 'Eliminar definitivamente este pedido?',
    'ik.deleteBody': 'Isto remove o pedido e os seus anexos de forma permanente. Não pode ser anulado.',
    'ik.deleteArchiveHint': 'Se apenas o quer afastar, arquive-o — nada se perde e pode restaurá-lo mais tarde.',
    'ik.deleteConfirm': 'Eliminar definitivamente',
    'ik.deleted': 'Pedido {{ref}} eliminado definitivamente.',
    'ik.deleteBlocked': 'Esse pedido pertence a um projeto ou a uma avaliação, pelo que não pode ser eliminado. Arquive-o — ficará oculto em todo o lado sem comprometer o registo a que pertence.',
    'ik.archived': 'Pedido {{ref}} arquivado. Fica oculto das listas mas não é eliminado.',
    'ik.alreadyArchived': 'Esse pedido já está arquivado.',
    'ik.restored': 'Pedido restaurado.',
    'ik.notFound': 'Pedido não encontrado.',
    'ik.showActive': 'Pedidos ativos'
  },
  it: {
    'ik.archive': 'Archivia',
    'ik.archiveHelp': 'Nascondi questa richiesta dagli elenchi senza eliminarla',
    'ik.restore': 'Ripristina',
    'ik.restoreHelp': "Riporta questa richiesta nell'elenco attivo",
    'ik.delete': 'Elimina',
    'ik.deleteHelp': 'Elimina definitivamente questa richiesta',
    'ik.deleteTitle': 'Eliminare definitivamente questa richiesta?',
    'ik.deleteBody': 'Questo rimuove la richiesta e i suoi allegati in modo permanente. Non è reversibile.',
    'ik.deleteArchiveHint': 'Se vuoi solo toglierla di mezzo, archiviala: non si perde nulla e potrai ripristinarla.',
    'ik.deleteConfirm': 'Elimina definitivamente',
    'ik.deleted': 'Richiesta {{ref}} eliminata definitivamente.',
    'ik.deleteBlocked': 'Questa richiesta appartiene a un progetto o a una valutazione e non può essere eliminata. Archiviala: sarà nascosta ovunque senza compromettere il record a cui appartiene.',
    'ik.archived': 'Richiesta {{ref}} archiviata. È nascosta dagli elenchi ma non eliminata.',
    'ik.alreadyArchived': 'Questa richiesta è già archiviata.',
    'ik.restored': 'Richiesta ripristinata.',
    'ik.notFound': 'Richiesta non trovata.',
    'ik.showActive': 'Richieste attive'
  },
  nl: {
    'ik.archive': 'Archiveren',
    'ik.archiveHelp': 'Verberg deze aanvraag uit de lijsten zonder hem te verwijderen',
    'ik.restore': 'Herstellen',
    'ik.restoreHelp': 'Zet deze aanvraag terug in de actieve lijst',
    'ik.delete': 'Verwijderen',
    'ik.deleteHelp': 'Verwijder deze aanvraag definitief',
    'ik.deleteTitle': 'Deze aanvraag definitief verwijderen?',
    'ik.deleteBody': 'Hiermee worden de aanvraag en de bijlagen definitief verwijderd. Dit kan niet ongedaan worden gemaakt.',
    'ik.deleteArchiveHint': 'Wilt u hem alleen uit het zicht hebben, archiveer hem dan — er gaat niets verloren en u kunt hem later herstellen.',
    'ik.deleteConfirm': 'Definitief verwijderen',
    'ik.deleted': 'Aanvraag {{ref}} definitief verwijderd.',
    'ik.deleteBlocked': 'Die aanvraag hoort bij een project of beoordeling en kan daarom niet worden verwijderd. Archiveer hem — hij wordt overal verborgen zonder het bijbehorende record te breken.',
    'ik.archived': 'Aanvraag {{ref}} gearchiveerd. Hij is verborgen in de lijsten maar niet verwijderd.',
    'ik.alreadyArchived': 'Die aanvraag is al gearchiveerd.',
    'ik.restored': 'Aanvraag hersteld.',
    'ik.notFound': 'Aanvraag niet gevonden.',
    'ik.showActive': 'Actieve aanvragen'
  },
  ja: {
    'ik.archive': 'アーカイブ',
    'ik.archiveHelp': '削除せずに一覧から非表示にします',
    'ik.restore': '復元',
    'ik.restoreHelp': 'この申請を有効な一覧に戻します',
    'ik.delete': '削除',
    'ik.deleteHelp': 'この申請を完全に削除します',
    'ik.deleteTitle': 'この申請を完全に削除しますか。',
    'ik.deleteBody': '申請と添付ファイルが完全に削除されます。元に戻すことはできません。',
    'ik.deleteArchiveHint': '一覧から外したいだけであれば、アーカイブをご利用ください。データは失われず、後から復元できます。',
    'ik.deleteConfirm': '完全に削除',
    'ik.deleted': '申請 {{ref}} を完全に削除しました。',
    'ik.deleteBlocked': 'この申請はプロジェクトまたは評価に紐づいているため削除できません。アーカイブしてください。紐づく記録を壊さずに、すべての画面から非表示になります。',
    'ik.archived': '申請 {{ref}} をアーカイブしました。一覧からは非表示になりますが削除はされていません。',
    'ik.alreadyArchived': 'この申請はすでにアーカイブされています。',
    'ik.restored': '申請を復元しました。',
    'ik.notFound': '申請が見つかりません。',
    'ik.showActive': '有効な申請'
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
