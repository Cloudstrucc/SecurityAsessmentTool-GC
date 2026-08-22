const nodemailer = require('nodemailer');

let transporter = null;
let emailConfigured = false;

function initialize() {
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
  } else {
    console.log('[Email] No SMTP_HOST configured — emails will be logged to console.');
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
    html: `<div style="font-family:Inter,Arial,sans-serif">
      <p>✅ Your custom SMTP configuration works.</p>
      <p>This test message was sent from Aegis SA using your organization's mail server.</p>
    </div>`
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
    subject: `Security Assessment Evidence Request – ${projectName}`,
    html: `
      <div style="font-family: 'Noto Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #26374a; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin:0;">GC Security Assessment Portal</h2>
        </div>
        <div style="padding: 24px; background: #f8f9fa; border: 1px solid #e0e0e0;">
          <p>Dear ${recipientName},</p>
          <p>You have been invited to provide security evidence for the <strong>${projectName}</strong> project as part of the Security Assessment &amp; Authorization (SA&amp;A) process.</p>
          <p><strong>Your Access Code:</strong></p>
          <div style="background: white; border: 2px solid #2b4380; border-radius: 8px; padding: 16px; text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">
            ${inviteCode}
          </div>
          <p><a href="${url}" style="display: inline-block; background: #2b4380; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Access Assessment Portal</a></p>
          <p style="color: #6c757d; font-size: 14px;">This invitation expires on ${new Date(expiresAt).toLocaleDateString('en-CA')}.</p>
          <p>If you have questions, please contact ${assessorName}.</p>
        </div>
        <div style="padding: 16px; text-align: center; color: #6c757d; font-size: 12px;">
          Government of Canada – Aegis SA
        </div>
      </div>
    `
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
    html: `
      <div style="font-family: 'Noto Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #26374a; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin:0;">GC Security Assessment Portal</h2>
        </div>
        <div style="padding: 24px; background: #f8f9fa; border: 1px solid #e0e0e0;">
          <p>Dear ${recipientName || 'colleague'},</p>
          <p>${invitedByName || 'An assessor'} has invited you to join the portal as a <strong>${roleLabel}</strong>${organization ? ` for <strong>${organization}</strong>` : ''}.</p>
          ${message ? `<p>${message}</p>` : ''}
          <p><strong>Your invitation code:</strong></p>
          <div style="background: white; border: 2px solid #2b4380; border-radius: 8px; padding: 16px; text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">
            ${inviteCode}
          </div>
          <p><a href="${url}" style="display: inline-block; background: #2b4380; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Create Account</a></p>
        </div>
      </div>
    `
  });
}

async function sendAssignmentNotification({ to, recipientName, entityType, entityName, assignedByName, baseUrl, message, link, smtpConfig }) {
  const url = link ? `${baseUrl}${link}` : `${baseUrl}/admin/dashboard`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Assigned to ${entityType}: ${entityName}`,
    html: `
      <div style="font-family:'Noto Sans',Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0a1626;color:#fff;padding:20px;border-radius:8px 8px 0 0"><h2 style="margin:0">Aegis SA</h2></div>
        <div style="padding:22px;background:#f8f9fa;border:1px solid #e0e0e0">
          <p>Dear ${recipientName || 'colleague'},</p>
          <p>${assignedByName || 'An assessor'} assigned you to the ${entityType} <strong>${entityName}</strong>.</p>
          ${message ? `<p>${message}</p>` : ''}
          <p><a href="${url}" style="display:inline-block;background:#2f80cf;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open the ${entityType}</a></p>
          <p style="color:#6c757d;font-size:13px">Or paste this link: ${url}</p>
        </div>
      </div>`
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
    ? `<div style="margin:14px 0;padding:12px;background:#f5f7fa;border-left:3px solid #0f766e;border-radius:4px;color:#333">
         ${excerpts.map(e => `<p style="margin:0 0 8px">${String(e).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</p>`).join('')}
       </div>`
    : '';
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0f766e;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">Aegis SA — you were mentioned</h2>
        </div>
        <div style="padding:22px;background:#f8f9fa;border:1px solid #e0e0e0">
          <p>Hello ${recipientName || ''},</p>
          <p><strong>${who}</strong> mentioned you in the discussion for <strong>${projectName}</strong>${count > 1 ? ` (${count} mentions)` : ''}.</p>
          ${excerptHtml}
          <p style="margin-top:18px">
            <a href="${link}" style="display:inline-block;background:#0f766e;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open the discussion</a>
          </p>
          <p style="color:#6c757d;font-size:12px;margin-top:20px">
            You are receiving this because you were mentioned by name.
            <a href="${baseUrl}/admin/notifications/preferences">Change your notification preferences</a>.
          </p>
        </div>
      </div>`
  });
}

async function sendMail(mailOptions) {
  return safeSend(mailOptions);
}

async function sendSubmissionNotification({ assessorEmail, projectName, submitterName }) {
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: assessorEmail,
    subject: `Evidence Submitted – ${projectName}`,
    html: `<p>${submitterName} has submitted evidence for <strong>${projectName}</strong>. Please review the submission in the Aegis SA portal.</p>`
  });
}

async function sendATONotification({ to, projectName, atoType, message }) {
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `${atoType} – ${projectName}`,
    html: `<p>${message}</p>`
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
  verifyTransport
};
