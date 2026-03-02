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
async function safeSend(mailOptions) {
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

async function sendInvite({ to, recipientName, projectName, inviteCode, expiresAt, assessorName, baseUrl }) {
  const url = `${baseUrl}/respond/${inviteCode}`;
  return safeSend({
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
          Government of Canada – SA&A Tool
        </div>
      </div>
    `
  });
}

async function sendSubmissionNotification({ assessorEmail, projectName, submitterName }) {
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: assessorEmail,
    subject: `Evidence Submitted – ${projectName}`,
    html: `<p>${submitterName} has submitted evidence for <strong>${projectName}</strong>. Please review the submission in the SA&A portal.</p>`
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

module.exports = { initialize, sendInvite, sendSubmissionNotification, sendATONotification };
