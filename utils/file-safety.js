/**
 * Content-safety validation for evidence attachments.
 *
 * SCOPE — read this before trusting the badge it produces.
 * This is NOT malware scanning. The app runs on the built-in Azure App Service
 * Node runtime: no root, no apt-get, no sidecars, so there is no ClamAV binary
 * to shell out to and no clamd to reach. Every Node "antivirus" package is a
 * wrapper around one of those two things, and there is no WASM build. See
 * docs/EVIDENCE-SLOTS-PLAN.md §3.3.
 *
 * What this DOES do, in-process and synchronously:
 *   - the real content must match the claimed extension (magic bytes)
 *   - an explicit allow-list; archives, executables and macro-enabled Office
 *     are refused, and SVG is refused outright (it carries script)
 *   - active-content inspection: PDF /JavaScript, /OpenAction, /Launch,
 *     /EmbeddedFile; OOXML vbaProject.bin and external relationship targets
 *   - EICAR, so the control is demonstrably testable
 *
 * A file that passes is reported as "Checked", never "Clean". The scanner hook
 * below is where a real backend plugs in later without changing the UI.
 */
const path = require('path');

const MAX_FILE_BYTES = 25 * 1024 * 1024;        // per file
const MAX_FILES_PER_SLOT = 5;
const MAX_BYTES_PER_CONTROL = 100 * 1024 * 1024;

/** Extension → the sniffed types that are allowed to back it. */
const ALLOWED = {
  '.pdf':  ['pdf'],
  '.docx': ['ooxml'], '.xlsx': ['ooxml'], '.pptx': ['ooxml'],
  '.csv':  ['text'], '.txt': ['text'], '.md': ['text'],
  '.json': ['text'], '.xml': ['text'],
  '.png':  ['png'], '.jpg': ['jpeg'], '.jpeg': ['jpeg'], '.gif': ['gif']
};

// Refused by extension regardless of content, so the error can be specific.
const REFUSED = {
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz'],
  executable: ['.exe', '.dll', '.com', '.bat', '.cmd', '.msi', '.scr', '.jar',
    '.js', '.mjs', '.vbs', '.ps1', '.sh', '.app', '.deb', '.rpm'],
  macro: ['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm'],
  svg: ['.svg', '.svgz']
};

/** Sniff a content family from the leading bytes. Null when unrecognised. */
function sniff(buf) {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  const hex = (...n) => n.every((v, i) => b[i] === v);
  if (hex(0x25, 0x50, 0x44, 0x46)) return 'pdf';                       // %PDF
  if (hex(0x89, 0x50, 0x4e, 0x47)) return 'png';
  if (hex(0xff, 0xd8, 0xff)) return 'jpeg';
  if (hex(0x47, 0x49, 0x46, 0x38)) return 'gif';                       // GIF8
  if (hex(0x50, 0x4b, 0x03, 0x04) || hex(0x50, 0x4b, 0x05, 0x06)) return 'zip'; // incl. OOXML
  if (hex(0xd0, 0xcf, 0x11, 0xe0)) return 'ole';                       // legacy .doc/.xls
  if (hex(0x4d, 0x5a)) return 'exe';                                   // MZ
  if (hex(0x7f, 0x45, 0x4c, 0x46)) return 'elf';
  // Text if it is valid UTF-8 with no NULs and few control characters.
  const sample = b.subarray(0, Math.min(b.length, 4096));
  if (!sample.includes(0)) {
    const ctrl = sample.filter(c => c < 9 || (c > 13 && c < 32)).length;
    if (ctrl / sample.length < 0.02) return 'text';
  }
  return null;
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** PDF constructs that execute or pull in other content. */
function pdfActiveContent(buf) {
  const s = buf.toString('latin1');
  const hits = [];
  [['/JavaScript', 'JavaScript'], ['/JS', 'JavaScript'], ['/OpenAction', 'auto-run action'],
    ['/AA', 'additional action'], ['/Launch', 'launch action'], ['/EmbeddedFile', 'embedded file']]
    .forEach(([needle, human]) => { if (s.includes(needle) && !hits.includes(human)) hits.push(human); });
  return hits;
}

/** OOXML macros and remote relationship targets. */
async function ooxmlActiveContent(buf) {
  const JSZip = require('jszip');
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch (e) { return ['unreadable archive']; }
  const hits = [];
  const names = Object.keys(zip.files);
  if (names.some(n => /vbaProject\.bin$/i.test(n))) hits.push('macros');
  if (names.some(n => /\.(exe|dll|js|vbs|ps1|bat|cmd|scr)$/i.test(n))) hits.push('executable inside the document');
  for (const n of names.filter(n => /_rels\/.*\.rels$/i.test(n))) {
    const xml = await zip.file(n).async('string');
    if (/TargetMode\s*=\s*"External"/i.test(xml) && /Target\s*=\s*"(https?|file|ms-msdt):/i.test(xml)) {
      hits.push('external reference'); break;
    }
  }
  return hits;
}

/** A filename safe to echo back and store as metadata. */
function safeName(original) {
  const base = path.basename(String(original || 'file'));
  return base.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').replace(/^\.+/, '').slice(0, 160) || 'file';
}

/**
 * @param {Buffer} buffer the uploaded bytes
 * @param {string} originalName as supplied by the client
 * @returns {Promise<{ok:boolean, reason?:string, detail?:string, ext?:string, sniffed?:string, status?:string}>}
 *   `status` is 'checked' on success — never 'clean', because nothing scanned
 *   this for malware.
 */
async function inspect(buffer, originalName) {
  const name = safeName(originalName);
  const ext = path.extname(name).toLowerCase();

  if (!buffer || !buffer.length) return { ok: false, reason: 'empty', detail: name };
  if (buffer.length > MAX_FILE_BYTES) return { ok: false, reason: 'tooLarge', detail: name };

  for (const [kind, list] of Object.entries(REFUSED)) {
    if (list.includes(ext)) return { ok: false, reason: kind, detail: ext };
  }
  if (!ALLOWED[ext]) return { ok: false, reason: 'extension', detail: ext || '(none)' };

  if (buffer.subarray(0, 1024).toString('latin1').includes(EICAR)) {
    return { ok: false, reason: 'eicar', detail: name };
  }

  const sniffed = sniff(buffer);
  const expected = ALLOWED[ext];
  // OOXML is a zip; everything else must match its family exactly.
  const matches = expected.includes(sniffed)
    || (expected.includes('ooxml') && sniffed === 'zip')
    || (expected.includes('text') && sniffed === 'text');
  if (!matches) {
    return { ok: false, reason: 'mismatch', detail: `${ext} ≠ ${sniffed || 'unrecognised'}`, sniffed };
  }

  if (sniffed === 'pdf') {
    const hits = pdfActiveContent(buffer);
    if (hits.length) return { ok: false, reason: 'activeContent', detail: hits.join(', '), sniffed };
  }
  if (expected.includes('ooxml')) {
    const hits = await ooxmlActiveContent(buffer);
    if (hits.length) return { ok: false, reason: 'activeContent', detail: hits.join(', '), sniffed };
  }

  return { ok: true, ext, sniffed, status: 'checked', name };
}

/** Content-Type we are willing to serve, from the allow-list — never the client's. */
const SERVE_TYPE = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv', '.txt': 'text/plain', '.md': 'text/plain',
  '.json': 'application/json', '.xml': 'application/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif'
};
function serveType(name) {
  return SERVE_TYPE[path.extname(String(name || '')).toLowerCase()] || 'application/octet-stream';
}

const MAX_REF_LENGTH = 500;

/**
 * Validate an "external system reference" — a link into a document management
 * system, or a plain record identifier when it is not a URL at all.
 *
 * This is rendered as a clickable link in the ASSESSOR's page, from a value an
 * external evidence provider supplied, so the scheme allow-list is the whole
 * point: `javascript:`, `data:`, `vbscript:` and `file:` are all refused. Only
 * http and https become links; anything else is kept as plain text and shown
 * without a href, so a reference like "DMS-12345" still works but cannot be
 * turned into a navigation target.
 *
 * The URL is never fetched by the server — storing it must not become an SSRF
 * primitive against the host's own network.
 *
 * @returns {{ok:boolean, reason?:string, kind?:'url'|'text', value?:string}}
 */
function inspectReference(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return { ok: false, reason: 'refEmpty' };
  if (value.length > MAX_REF_LENGTH) return { ok: false, reason: 'refTooLong' };
  // Control characters would let a reference break out of the context it is
  // rendered in, and are never legitimate in a link or an identifier.
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, reason: 'refInvalid' };

  // Looks like it is trying to be a URL? Then it must be a safe one.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch (e) { return { ok: false, reason: 'refInvalid' }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'refScheme' };
    }
    return { ok: true, kind: 'url', value: parsed.href };
  }
  // Protocol-relative (//evil.com) resolves to a URL in a browser — treat it
  // as a URL attempt rather than as text.
  if (value.startsWith('//')) return { ok: false, reason: 'refScheme' };

  return { ok: true, kind: 'text', value };
}

module.exports = {
  inspect, inspectReference, MAX_REF_LENGTH, safeName, serveType, sniff,
  MAX_FILE_BYTES, MAX_FILES_PER_SLOT, MAX_BYTES_PER_CONTROL,
  ALLOWED_EXTENSIONS: Object.keys(ALLOWED), EICAR
};
