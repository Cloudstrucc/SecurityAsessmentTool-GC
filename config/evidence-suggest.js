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

// Plain draft text (tokens + newlines) → simple, safe HTML for the rich editor.
// Tokens are left as literal text so the editor can decorate them and they survive
// round-trips; no markup is injected around them here.
function suggestToHtml(text) {
  const parts = String(text || '').trim().split(/\n{2,}/);
  return parts.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function hasPlaceholders(s) { return PLACEHOLDER_RE.test(String(s || '')); }

module.exports = { escapeHtml, suggestToHtml, hasPlaceholders, PLACEHOLDER_RE };
