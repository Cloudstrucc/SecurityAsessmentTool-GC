const nodemailer = require('nodemailer');
const graphMailer = require('./graphMailer');
const { renderEmail, esc } = require('./emailLayout');

let transporter = null;
let emailConfigured = false;

function initialize() {
  // Microsoft Graph (app-only) is the preferred modern-auth sender when configured.
  // Verify credentials/permission at startup (non-blocking) so problems surface early.
  if (graphMailer.graphConfigured()) {
    graphMailer.verifyGraph()
      .then(() => console.log(`[Email] Microsoft Graph sender ready (${graphMailer.sender()}) ✓`))
      .catch(err => {
        console.warn('[Email] Microsoft Graph verification failed:', err.message);
        console.warn('[Email]   Check GRAPH_CLIENT_SECRET, the Mail.Send application permission + admin consent,');
        console.warn('[Email]   and the Application Access Policy scoping the app to ' + graphMailer.sender() + '.');
      });
  }

  if (process.env.SMTP_HOST) {
    const config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
    };

    // Support OAuth2 for Microsoft 365 (recommended) or basic auth / app password
    if (process.env.SMTP_OAUTH_CLIENT_ID) {
      config.auth = {
        type: 'OAuth2',
        user: process.env.SMTP_USER,
        clientId: process.env.SMTP_OAUTH_CLIENT_ID,
        clientSecret: process.env.SMTP_OAUTH_CLIENT_SECRET,
        refreshToken: process.env.SMTP_OAUTH_REFRESH_TOKEN,
        accessToken: process.env.SMTP_OAUTH_ACCESS_TOKEN
      };
    } else {
      config.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      };
    }

    transporter = nodemailer.createTransport(config);
    emailConfigured = true;

    // Verify connection on startup (non-blocking)
    transporter.verify().then(() => {
      console.log('[Email] SMTP connection verified ✓');
    }).catch(err => {
      console.warn('[Email] SMTP verification failed:', err.message);
      console.warn('[Email] Emails will be logged to console instead.');
      console.warn('[Email] For Microsoft 365: use an App Password (https://account.microsoft.com/security)');
      console.warn('[Email]   or configure OAuth2 with SMTP_OAUTH_CLIENT_ID, SMTP_OAUTH_CLIENT_SECRET, SMTP_OAUTH_REFRESH_TOKEN');
      emailConfigured = false;
    });
  } else if (!graphMailer.graphConfigured()) {
    console.log('[Email] No SMTP_HOST or Graph sender configured — emails will be logged to console.');
  }
}

/**
 * Safe send — never throws, always returns { sent: boolean, error?: string }
 */
/**
 * The tenant SMTP for the request in flight, or null to use the platform default.
 * Read from the ambient request context so EVERY message is tenant-routed without
 * each call site having to thread the config through.
 */
function ambientOrgSmtp() {
  try {
    const { getAiContext } = require('../config/ai-context');
    const orgId = (getAiContext() || {}).orgId;
    if (!orgId) return null;
    return require('../config/org-settings').orgSmtp(orgId);
  } catch (e) {
    return null;
  }
}

async function safeSend(mailOptions) {
  // Prefer the tenant's own mail server whenever one is configured and enabled.
  const orgCfg = ambientOrgSmtp();
  if (orgCfg) return sendVia(orgCfg, mailOptions);

  // Otherwise, Microsoft Graph (app-only) is the platform sender when configured.
  if (graphMailer.graphConfigured()) return graphMailer.sendViaGraph(mailOptions);

  if (!transporter || !emailConfigured) {
    console.log(`[Email Mock] To: ${mailOptions.to} | Subject: ${mailOptions.subject}`);
    return { sent: false, error: 'Email not configured' };
  }
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${mailOptions.to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email Error] Failed to send to ${mailOptions.to}:`, err.message);
    if (err.code === 'EAUTH') {
      console.error('[Email] Authentication failed. For Microsoft 365:');
      console.error('[Email]   1. Create an App Password at https://account.microsoft.com/security');
      console.error('[Email]   2. Set SMTP_PASSWORD to the App Password (not your regular password)');
      console.error('[Email]   3. Or use OAuth2 — see SMTP_OAUTH_* env vars');
      emailConfigured = false; // Don't keep trying
    }
    return { sent: false, error: err.message };
  }
}

/** Build a one-off nodemailer transport from a tenant SMTP config. */
function buildTransportFromConfig(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined
  });
}

/**
 * Validate a tenant SMTP config by opening a real connection and completing the
 * auth handshake, WITHOUT sending a message. Rejects with the server's error.
 */
async function verifyTransport(cfg) {
  const t = buildTransportFromConfig(cfg);
  await t.verify();
  return true;
}

/** Send using an explicit tenant SMTP config (bypasses the default transport). */
async function sendVia(cfg, mailOptions) {
  try {
    const t = buildTransportFromConfig(cfg);
    const opts = Object.assign({}, mailOptions, { from: cfg.from || mailOptions.from || cfg.user });
    const info = await t.sendMail(opts);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/** Validate a tenant SMTP config by sending a test message. */
async function sendTestEmail(cfg, to) {
  return sendVia(cfg, {
    to,
    subject: 'Aegis SA — SMTP test',
    html: renderEmail({
      title: 'SMTP test successful',
      preheader: 'Your custom SMTP configuration works.',
      intro: [
        '✅ Your custom SMTP configuration works.',
        "This test message was sent from Aegis SA using your organization's mail server."
      ]
    })
  });
}

/**
 * Route through the tenant's SMTP when one is provided, otherwise the default.
 * `smtpConfig` comes from config/org-settings.orgSmtp(orgId).
 */
async function sendRouted(smtpConfig, mailOptions) {
  if (smtpConfig) return sendVia(smtpConfig, mailOptions);
  return safeSend(mailOptions);
}

async function sendInvite({ to, recipientName, projectName, inviteCode, expiresAt, assessorName, baseUrl, smtpConfig }) {
  const url = `${baseUrl}/respond/${inviteCode}`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Security assessment evidence request – ${projectName}`,
    html: renderEmail({
      title: 'Evidence request',
      preheader: `Provide security evidence for ${projectName}.`,
      intro: [
        `Dear ${esc(recipientName)},`,
        `You have been invited to provide security evidence for <strong>${esc(projectName)}</strong> as part of the Security Assessment &amp; Authorization (SA&amp;A) process.`,
        `Your access code:`
      ],
      code: inviteCode,
      button: { url, label: 'Open the assessment portal' },
      note: `This invitation expires on ${esc(new Date(expiresAt).toLocaleDateString('en-CA'))}. If you have questions, please contact ${esc(assessorName)}.`
    })
  });
}

async function sendUserInvitation({ to, recipientName, inviteCode, invitedByName, role, organization, baseUrl, message, smtpConfig }) {
  const isAssessor = role === 'assessor';
  const path = isAssessor ? '/admin/register' : (role === 'member' ? '/redeem' : '/client/register');
  const url = role === 'member' ? `${baseUrl}/redeem/${inviteCode}` : `${baseUrl}${path}?invite=${inviteCode}`;
  const roleLabel = role === 'member' ? 'team member' : (isAssessor ? 'assessor' : 'client');
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;

  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Invitation to join the Security Assessment Portal`,
    html: renderEmail({
      title: 'You’re invited',
      preheader: `Join the Security Assessment Portal as a ${roleLabel}.`,
      intro: [
        `Dear ${esc(recipientName || 'colleague')},`,
        `${esc(invitedByName || 'An assessor')} has invited you to join the portal as a <strong>${esc(roleLabel)}</strong>${organization ? ` for <strong>${esc(organization)}</strong>` : ''}.`,
        ...(message ? [esc(message)] : []),
        `Your invitation code:`
      ],
      code: inviteCode,
      button: { url, label: 'Create your account' }
    })
  });
}

async function sendAssignmentNotification({ to, recipientName, entityType, entityName, assignedByName, baseUrl, message, link, smtpConfig }) {
  const url = link ? `${baseUrl}${link}` : `${baseUrl}/admin/dashboard`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Assigned to ${entityType}: ${entityName}`,
    html: renderEmail({
      title: `New ${esc(entityType)} assignment`,
      preheader: `${assignedByName || 'An assessor'} assigned you to ${entityName}.`,
      intro: [
        `Dear ${esc(recipientName || 'colleague')},`,
        `${esc(assignedByName || 'An assessor')} assigned you to the ${esc(entityType)} <strong>${esc(entityName)}</strong>.`,
        ...(message ? [esc(message)] : [])
      ],
      button: { url, label: `Open the ${esc(entityType)}` },
      note: `If the button doesn’t work, paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span>`
    })
  });
}

/**
 * Batched mention digest. LINK-ONLY by design: collaboration can contain personal
 * information, so message text is included only when the tenant has explicitly
 * opted in (org_settings.notify_mention_excerpt).
 */
async function sendMentionNotification({ to, recipientName, projectName, count, authors, link, excerpts = [], baseUrl = '' }) {
  const who = (authors && authors.length)
    ? (authors.length === 1 ? authors[0] : `${authors[0]} and ${authors.length - 1} other(s)`)
    : 'Someone';
  const subject = count > 1
    ? `You were mentioned ${count} times in ${projectName}`
    : `${who} mentioned you in ${projectName}`;
  const excerptHtml = (excerpts && excerpts.length)
    ? `<div style="margin:6px 0 4px;padding:12px 14px;background:#f0faf8;border-left:3px solid #0f766e;border-radius:6px;color:#334155">
         ${excerpts.map(e => `<p style="margin:0 0 8px">${esc(e)}</p>`).join('')}
       </div>`
    : '';
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html: renderEmail({
      title: 'You were mentioned',
      accent: '#0f766e',
      preheader: subject,
      intro: [
        `Hello ${esc(recipientName || '')},`,
        `<strong>${esc(who)}</strong> mentioned you in the discussion for <strong>${esc(projectName)}</strong>${count > 1 ? ` (${count} mentions)` : ''}.`
      ],
      bodyHtml: excerptHtml,
      button: { url: link, label: 'Open the discussion' },
      note: 'You are receiving this because you were mentioned by name.',
      footerLink: { url: `${baseUrl}/admin/notifications/preferences`, label: 'Notification preferences' }
    })
  });
}

async function sendMail(mailOptions) {
  return safeSend(mailOptions);
}

async function sendSubmissionNotification({ assessorEmail, projectName, submitterName }) {
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: assessorEmail,
    subject: `Evidence submitted – ${projectName}`,
    html: renderEmail({
      title: 'Evidence submitted',
      preheader: `${submitterName} submitted evidence for ${projectName}.`,
      intro: [
        `<strong>${esc(submitterName)}</strong> has submitted evidence for <strong>${esc(projectName)}</strong>.`,
        `Please review the submission in the Aegis SA portal.`
      ]
    })
  });
}

async function sendATONotification({ to, projectName, atoType, message }) {
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `${atoType} – ${projectName}`,
    html: renderEmail({
      title: `${esc(atoType)} — ${esc(projectName)}`,
      preheader: `${atoType} for ${projectName}.`,
      intro: [esc(message)]
    })
  });
}

module.exports = {
  initialize,
  sendInvite,
  sendUserInvitation,
  sendAssignmentNotification,
  sendSubmissionNotification,
  sendATONotification,
  sendMentionNotification,
  sendMail,
  sendVia,
  sendRouted,
  ambientOrgSmtp,
  sendTestEmail,
  verifyTransport,
  // Microsoft Graph (app-only) sender
  graphConfigured: graphMailer.graphConfigured,
  verifyGraph: graphMailer.verifyGraph,
  sendTestGraph: graphMailer.sendTestGraph
};
