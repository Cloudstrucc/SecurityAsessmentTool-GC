/**
 * Report render dispatcher (Phase A).
 *
 * One entry point for every output format. CSV is intentionally NOT here — it is
 * produced by the existing route helpers and left byte-for-byte unchanged.
 *
 *   render(model, 'pdf', { branding, req, logoDataUri }) -> { buffer, contentType, ext, filename }
 *
 * HTML and Markdown come back as strings; PDF and DOCX as Buffers. `filenameFor`
 * builds a safe, slugified download name from the model.
 */
const html = require('./html');
const markdown = require('./markdown');
const pdf = require('./pdf');
const docx = require('./docx');
const { makeT } = require('./labels');

const FORMATS = {
  html: { contentType: 'text/html; charset=utf-8', ext: 'html' },
  md: { contentType: 'text/markdown; charset=utf-8', ext: 'md' },
  pdf: { contentType: 'application/pdf', ext: 'pdf' },
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' }
};
// CSV is served by the existing routes, but list it so the format picker knows.
const PICKER_FORMATS = ['html', 'pdf', 'docx', 'md', 'csv'];

function slug(s) {
  return String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
}
function filenameFor(model, ext) {
  return `${slug(model.subject)}-${slug(model.type)}${ext ? '.' + ext : ''}`;
}

async function render(model, format, opts = {}) {
  const f = String(format || 'html').toLowerCase();
  const spec = FORMATS[f];
  if (!spec) throw new Error('unsupported report format: ' + format);
  const o = { ...opts, t: opts.t || makeT(opts.req) };
  let payload;
  if (f === 'html') payload = html.render(model, o);
  else if (f === 'md') payload = markdown.render(model, o);
  else if (f === 'pdf') payload = await pdf.render(model, o);
  else if (f === 'docx') payload = await docx.render(model, o);
  const isBuffer = Buffer.isBuffer(payload);
  return {
    [isBuffer ? 'buffer' : 'body']: payload,
    buffer: isBuffer ? payload : Buffer.from(payload, 'utf8'),
    body: isBuffer ? null : payload,
    contentType: spec.contentType,
    ext: spec.ext,
    filename: filenameFor(model, spec.ext)
  };
}

module.exports = { render, FORMATS, PICKER_FORMATS, filenameFor, slug, html, markdown, pdf, docx };
