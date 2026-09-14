/**
 * Microsoft Graph mail transport (app-only / client-credentials).
 *
 * Sends mail as a specific mailbox via POST /users/{sender}/sendMail using an
 * Entra (Azure AD) app registration with the APPLICATION permission Mail.Send.
 * This is the modern-auth path for sending as a SHARED MAILBOX: no SMTP AUTH,
 * no user sign-in, no refresh token, and the shared mailbox needs no licence.
 *
 * Lock the app down in the tenant with an Application Access Policy so it can
 * only send as the one shared mailbox (see the setup runbook).
 *
 * Configured entirely from environment variables:
 *   GRAPH_TENANT_ID      – directory (tenant) ID of the Entra app
 *   GRAPH_CLIENT_ID      – application (client) ID
 *   GRAPH_CLIENT_SECRET  – a client secret value
 *   GRAPH_SENDER         – the mailbox to send as, e.g. contact-aegis-sa@vanguardcs.ca
 *   GRAPH_SAVE_TO_SENT   – optional "false" to skip saving to the mailbox Sent Items (default: save)
 *
 * When these are set, utils/emailService routes every message through here
 * (unless a tenant has its own SMTP override enabled).
 */

const AUTHORITY = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';

let _token = null;      // { value, expiresAt(ms) }

function graphConfigured() {
  return !!(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID &&
            process.env.GRAPH_CLIENT_SECRET && process.env.GRAPH_SENDER);
}

function sender() { return process.env.GRAPH_SENDER; }

/** Acquire (and cache) an app-only access token via client credentials. */
async function getToken() {
  const now = Date.now();
  if (_token && _token.expiresAt - 60_000 > now) return _token.value; // reuse until ~1 min before expiry

  const url = `${AUTHORITY}/${encodeURIComponent(process.env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = data.error_description || data.error || `${res.status}`;
    const e = new Error(`Graph token request failed: ${String(desc).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  _token = { value: data.access_token, expiresAt: now + (Number(data.expires_in || 3600) * 1000) };
  return _token.value;
}

/** Verify credentials + permission without sending a message (acquires a token). */
async function verifyGraph() {
  await getToken();
  return true;
}

// ── mailOptions → Graph message shape ───────────────────────────────────────
function toRecipients(v) {
  if (!v) return [];
  const list = Array.isArray(v) ? v : String(v).split(/[,;]/);
  return list
    .map(s => String(s).trim())
    .filter(Boolean)
    .map(s => {
      const m = s.match(/<([^>]+)>/);      // "Name <email>" → email
      const address = (m ? m[1] : s).trim();
      return { emailAddress: { address } };
    });
}

function toAttachments(atts) {
  if (!Array.isArray(atts) || !atts.length) return undefined;
  return atts.map(a => {
    let contentBytes;
    if (Buffer.isBuffer(a.content)) contentBytes = a.content.toString('base64');
    else if (a.encoding === 'base64') contentBytes = String(a.content || '');
    else contentBytes = Buffer.from(String(a.content || ''), 'utf-8').toString('base64');
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename || 'attachment',
      contentType: a.contentType || 'application/octet-stream',
      contentBytes
    };
  });
}

function buildMessage(mailOptions) {
  const message = {
    subject: mailOptions.subject || '',
    body: {
      contentType: mailOptions.html ? 'HTML' : 'Text',
      content: mailOptions.html || mailOptions.text || ''
    },
    toRecipients: toRecipients(mailOptions.to)
  };
  const cc = toRecipients(mailOptions.cc); if (cc.length) message.ccRecipients = cc;
  const bcc = toRecipients(mailOptions.bcc); if (bcc.length) message.bccRecipients = bcc;
  const replyTo = toRecipients(mailOptions.replyTo); if (replyTo.length) message.replyTo = replyTo;
  const attachments = toAttachments(mailOptions.attachments); if (attachments) message.attachments = attachments;
  return message;
}

/**
 * Send one message via Graph. Never throws — returns { sent, messageId? } or
 * { sent:false, error }. `from`/`sender` in mailOptions is ignored: Graph sends
 * as GRAPH_SENDER (the app is scoped to that mailbox by the access policy).
 */
async function sendViaGraph(mailOptions) {
  try {
    const token = await getToken();
    const saveToSentItems = String(process.env.GRAPH_SAVE_TO_SENT || 'true') !== 'false';
    const url = `${GRAPH}/users/${encodeURIComponent(sender())}/sendMail`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: buildMessage(mailOptions), saveToSentItems })
    });
    if (res.status === 202) {
      // Graph returns 202 Accepted with no body and no id.
      const messageId = res.headers.get('request-id') || `graph-${Date.now()}`;
      console.log(`[Email/Graph] Sent to ${mailOptions.to} as ${sender()} (${messageId})`);
      return { sent: true, messageId };
    }
    const body = await res.text().catch(() => '');
    const err = new Error(`Graph sendMail failed (${res.status}): ${body.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  } catch (err) {
    console.error(`[Email/Graph] Failed to send to ${mailOptions.to}:`, err.message);
    if (err.status === 401 || err.status === 403) {
      console.error('[Email/Graph] Auth/permission problem. Check that:');
      console.error('[Email/Graph]   • the client secret (GRAPH_CLIENT_SECRET) is current');
      console.error('[Email/Graph]   • the app has the APPLICATION permission Mail.Send with admin consent granted');
      console.error('[Email/Graph]   • an Application Access Policy permits sending as ' + sender());
    }
    return { sent: false, error: err.message };
  }
}

/** Send a test message to confirm the whole path works end to end. */
async function sendTestGraph(to) {
  return sendViaGraph({
    to,
    subject: 'Aegis SA — Microsoft Graph email test',
    html: `<div style="font-family:Inter,Arial,sans-serif">
      <p>✅ Microsoft Graph email is working.</p>
      <p>This test was sent as <strong>${sender()}</strong> using app-only Graph <code>Mail.Send</code>.</p>
    </div>`
  });
}

module.exports = { graphConfigured, getToken, verifyGraph, sendViaGraph, sendTestGraph, sender };
