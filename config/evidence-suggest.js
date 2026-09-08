// Helpers for AI-suggested "placeholder evidence" drafts. A draft is stored in the
// control's evidence_text/html with evidence_source='ai-suggested' and stays
// pending (uncounted) until the provider edits it. Placeholder tokens:
//   [[VALUE: hint]]     a value the provider must supply
//   [[ATTACH: desc]]    an artifact/screenshot to upload
const PLACEHOLDER_RE = /\[\[(?:VALUE|ATTACH):/i;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Turn already-escaped draft text into rich HTML: render **bold**, and wrap the
// [[VALUE:…]] / [[ATTACH:…]] tokens in colour-coded chips so the reader can see at
// a glance where their input is needed. The token TEXT stays inside the chip, so
// placeholder detection (and the submit-time warning) still works, and the provider
// can edit it in place. Shared by the server and mirrored client-side.
function decorateEscaped(escaped) {
  return String(escaped || '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[\s*VALUE\s*:([^\]]*)\]\]/gi, function (_m, hint) { return '<span class="ev-ph ev-ph-value" data-ph="value">[[VALUE:' + hint + ']]</span>'; })
    .replace(/\[\[\s*ATTACH\s*:([^\]]*)\]\]/gi, function (_m, hint) { return '<span class="ev-ph ev-ph-attach" data-ph="attach">[[ATTACH:' + hint + ']]</span>'; });
}

// Plain draft text (tokens + markdown + newlines) → safe, decorated HTML for the
// rich editor: escaped, with **bold** rendered and placeholder tokens colour-coded.
function suggestToHtml(text) {
  const parts = String(text || '').trim().split(/\n{2,}/);
  return parts.map(function (p) { return '<p>' + decorateEscaped(escapeHtml(p)).replace(/\n/g, '<br>') + '</p>'; }).join('');
}

function hasPlaceholders(s) { return PLACEHOLDER_RE.test(String(s || '')); }

module.exports = { escapeHtml, suggestToHtml, decorateEscaped, hasPlaceholders, PLACEHOLDER_RE };
