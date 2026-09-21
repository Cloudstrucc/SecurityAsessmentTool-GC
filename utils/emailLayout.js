/**
 * Shared HTML email layout — one consistent, responsive, email-client-safe
 * template every notification renders through, so all mail looks the same.
 *
 * Deliberately brand-neutral (no country- or government-specific wording) per
 * the project's internationalization/neutrality rules. Table-based with inline
 * styles for Outlook/Gmail compatibility; a hidden preheader; a bulletproof CTA
 * button; and an optional code "pill".
 */

const BRAND = 'Aegis SA';
const TAGLINE = 'Security Assessment & Authorization';
const HEADER_BG = '#16233a';
const DEFAULT_ACCENT = '#2f80cf';
const TEXT = '#2b2f36';
const MUTED = '#6b7280';
const CARD_BG = '#ffffff';
const PAGE_BG = '#eef1f5';

/** Escape a value for safe interpolation into HTML. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Bulletproof (table-based) CTA button. */
function button(url, label, accent = DEFAULT_ACCENT) {
  if (!url || !label) return '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
    <tr><td align="center" bgcolor="${accent}" style="border-radius:8px">
      <a href="${esc(url)}" target="_blank"
         style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
        ${esc(label)}
      </a>
    </td></tr>
  </table>`;
}

/** A big monospace "pill" for things like an invite/access code. */
function codePill(code, accent = DEFAULT_ACCENT) {
  if (!code) return '';
  return `
  <div style="margin:18px 0;padding:16px;text-align:center;border:2px solid ${accent};border-radius:10px;background:#f8fafc;
              font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:5px;color:${TEXT}">
    ${esc(code)}
  </div>`;
}

/**
 * Render a full HTML email.
 * @param {object} o
 * @param {string} o.title      main heading in the body
 * @param {string} [o.preheader] hidden inbox-preview text
 * @param {string[]} [o.intro]  paragraphs (HTML allowed; escape dynamic values with esc())
 * @param {string} [o.code]     optional access/invite code shown as a pill
 * @param {{url:string,label:string}} [o.button] optional CTA
 * @param {string} [o.bodyHtml] extra HTML inserted after intro/code/button
 * @param {string} [o.note]     small muted note under the body (HTML allowed)
 * @param {string} [o.footerLink] optional {url,label} for a footer link (e.g. preferences)
 * @param {string} [o.accent]   accent colour
 */
function renderEmail(o = {}) {
  const accent = o.accent || DEFAULT_ACCENT;
  // Brand mark: only when the app knows its public URL (email clients need a hosted image).
  const base = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const markImg = base
    ? `<img src="${base}/images/aegis-shield-64.png" width="28" height="31" alt="" style="vertical-align:middle;margin-right:10px;border:0">`
    : '';
  const preheader = o.preheader || '';
  const intro = (o.intro || []).map(p => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const btn = o.button ? button(o.button.url, o.button.label, accent) : '';
  const pill = o.code ? codePill(o.code, accent) : '';
  const note = o.note
    ? `<p style="margin:22px 0 0;color:${MUTED};font-size:13px;line-height:1.5">${o.note}</p>`
    : '';
  const footerLink = o.footerLink
    ? ` · <a href="${esc(o.footerLink.url)}" style="color:${MUTED};text-decoration:underline">${esc(o.footerLink.label)}</a>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(o.title || BRAND)}</title></head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG}">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="width:100%;max-width:600px;background:${CARD_BG};border-radius:12px;overflow:hidden;border:1px solid #e3e8ee">
        <!-- header -->
        <tr><td style="background:${HEADER_BG};padding:22px 28px">
          <table role="presentation" width="100%"><tr>
            <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#fff;font-size:20px;font-weight:700;letter-spacing:.2px">${markImg}${BRAND}</td>
            <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#aebacb;font-size:12px">${TAGLINE}</td>
          </tr></table>
        </td></tr>
        <tr><td style="height:3px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
        <!-- body -->
        <tr><td style="padding:30px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TEXT};font-size:15px;line-height:1.6">
          ${o.title ? `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT}">${esc(o.title)}</h1>` : ''}
          ${intro}
          ${pill}
          ${btn}
          ${o.bodyHtml || ''}
          ${note}
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:18px 28px;background:#f6f8fb;border-top:1px solid #e3e8ee;
                       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${MUTED};font-size:12px;line-height:1.5">
          ${BRAND} · ${TAGLINE}${footerLink}<br>
          This is an automated message — please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { renderEmail, button, codePill, esc, BRAND, TAGLINE, DEFAULT_ACCENT };
