/**
 * Extract readable text from Office Open XML files (.docx, .pptx, .xlsx).
 *
 * These are ZIP containers, so reading one with fs.readFileSync(path, 'utf-8')
 * yields binary noise. Sent to a model that way it simply declines ("I'm unable
 * to read this…"), which then fails JSON parsing far from the real cause.
 *
 * Uses jszip, which is already a dependency — no new package for this.
 */
const JSZip = require('jszip');

/** Strip XML tags, keeping paragraph and row breaks as newlines. */
function xmlToText(xml) {
  return String(xml)
    // Word paragraphs / line breaks, PowerPoint paragraphs, Excel rows.
    .replace(/<\/w:p>|<w:br\s*\/>|<\/a:p>|<\/row>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Which parts of the archive hold the body text, per format. */
const PARTS = {
  '.docx': z => Object.keys(z.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)),
  '.pptx': z => Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (+(a.match(/\d+/) || 0)) - (+(b.match(/\d+/) || 0))),
  '.xlsx': z => Object.keys(z.files).filter(n => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(n))
};

/** True for the extensions this module can handle. */
function isOfficeXml(ext) {
  return Object.prototype.hasOwnProperty.call(PARTS, String(ext).toLowerCase());
}

/**
 * @param {Buffer} buffer  the file's bytes
 * @param {string} ext     '.docx' | '.pptx' | '.xlsx'
 * @returns {Promise<string>} the document's text
 * @throws when the file is not a readable Office XML archive
 */
async function extractOfficeText(buffer, ext) {
  const key = String(ext).toLowerCase();
  const pick = PARTS[key];
  if (!pick) throw new Error(`Unsupported Office format: ${ext}`);

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    throw new Error(`That ${key} file could not be opened — it may be corrupt, password-protected, or saved in the older binary format (.doc/.ppt/.xls). Re-save it as ${key} and try again.`);
  }

  const names = pick(zip);
  if (!names.length) throw new Error(`No readable content was found inside that ${key} file.`);

  const parts = [];
  for (const name of names) {
    const xml = await zip.file(name).async('string');
    const text = xmlToText(xml);
    if (text) parts.push(text);
  }

  const out = parts.join('\n\n').trim();
  if (!out) throw new Error(`That ${key} file contains no extractable text — if it is a scan or images only, upload a PDF or paste the description instead.`);
  return out;
}

module.exports = { extractOfficeText, isOfficeXml, xmlToText };
