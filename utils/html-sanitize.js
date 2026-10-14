/**
 * Conservative allow-list sanitiser for evidence rich text.
 *
 * Evidence HTML arrives from the evidence provider — an EXTERNAL party — and is
 * rendered with a triple-stache into the assessor's authenticated admin page
 * (views/admin/assessment-detail.hbs) and back into the respond page. Storing it
 * raw is stored XSS against the assessor's session, so everything written to
 * evidence_html / slot value_html goes through here first.
 *
 * Deliberately not a general-purpose sanitiser and deliberately not a
 * dependency: the allow-list is tiny and explicit, which is easier to audit than
 * a library's default configuration. Anything not named below is dropped,
 * including every attribute — so no href, no style, no event handlers, no
 * data: URLs, and no way to smuggle script through an attribute.
 */

// Inline + block formatting an evidence narrative legitimately needs, including
// tables because providers paste them out of spreadsheets.
const ALLOWED = new Set([
  'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'h3', 'h4', 'h5', 'code', 'pre', 'blockquote'
]);

// Dropped WITH their contents — a <script> whose tags are stripped would leave
// the code behind as text that a later innerHTML could revive.
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math']);

/**
 * The one exception to "no attributes": the slot marker. A slot is identified
 * by data-slot / data-slot-type and must survive a round trip through the
 * editor. The values are re-validated against the slot record on save, so a
 * forged marker cannot create or retarget a slot.
 */
const SLOT_ATTRS = ['data-slot', 'data-slot-type'];

function escapeText(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * @param {string} html untrusted HTML
 * @param {{ allowSlots?: boolean }} [opts] keep data-slot markers (evidence body)
 * @returns {string} sanitised HTML safe to render unescaped
 */
function sanitizeHtml(html, opts = {}) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  const allowSlots = opts.allowSlots !== false;

  let out = '';
  let i = 0;
  // Tags we are inside and are discarding wholesale (script/style/…).
  let dropDepth = 0;

  const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(src)) !== null) {
    const text = src.slice(i, m.index);
    if (!dropDepth) out += escapeText(text);
    i = m.index + m[0].length;

    const closing = m[0][1] === '/';
    const name = m[1].toLowerCase();
    const attrs = m[2] || '';

    if (DROP_CONTENT.has(name)) {
      if (closing) { if (dropDepth) dropDepth--; }
      else if (!/\/\s*$/.test(attrs)) dropDepth++;
      continue;
    }
    if (dropDepth) continue;
    if (!ALLOWED.has(name)) continue;          // unknown tag: drop the tag, keep its text

    if (closing) { out += `</${name}>`; continue; }

    // Rebuild the tag with only the attributes we permit.
    let kept = '';
    if (allowSlots && name === 'span') {
      SLOT_ATTRS.forEach(a => {
        const re = new RegExp(a + '\\s*=\\s*"([^"]*)"', 'i');
        const v = re.exec(attrs);
        // Slot ids and types are simple tokens; anything else is not a slot.
        if (v && /^[A-Za-z0-9_-]{1,40}$/.test(v[1])) kept += ` ${a}="${v[1]}"`;
      });
      if (kept) kept += ' contenteditable="false"';
    }
    const selfClosing = name === 'br';
    out += `<${name}${kept}${selfClosing ? '' : ''}>`;
  }
  if (!dropDepth) out += escapeText(src.slice(i));
  return out;
}

/** Plain text projection, for evidence_text / search / reports. */
function htmlToText(html) {
  return String(html == null ? '' : html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { sanitizeHtml, htmlToText, ALLOWED };
