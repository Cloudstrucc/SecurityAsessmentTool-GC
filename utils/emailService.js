const nodemailer = require('nodemailer');

let transporter = null;

function initialize() {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
}

async function sendInvite({ to, recipientName, projectName, inviteCode, expiresAt, assessorName, baseUrl }) {
  if (!transporter) { console.log('[Email Mock] Invite to:', to, 'Code:', inviteCode); return; }
  const url = `${baseUrl}/respond/${inviteCode}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Security Assessment Evidence Request – ${projectName}`,
    html: `
      <div style="font-family: 'Open Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2c3e50; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin:0;">GC Security Assessment Portal</h2>
        </div>
        <div style="padding: 24px; background: #f8f9fa; border: 1px solid #e0e0e0;">
          <p>Dear ${recipientName},</p>
          <p>You have been invited to provide security evidence for the <strong>${projectName}</strong> project as part of the Security Assessment & Authorization (SA&A) process.</p>
          <p><strong>Your Access Code:</strong></p>
          <div style="background: white; border: 2px solid #3498db; border-radius: 8px; padding: 16px; text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">
            ${inviteCode}
          </div>
          <p><a href="${url}" style="display: inline-block; background: #3498db; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Access Assessment Portal</a></p>
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
  if (!transporter) { console.log('[Email Mock] Submission notification for:', projectName); return; }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: assessorEmail,
    subject: `Evidence Submitted – ${projectName}`,
    html: `<p>${submitterName} has submitted evidence for <strong>${projectName}</strong>. Please review the submission in the SA&A portal.</p>`
  });
}

async function sendATONotification({ to, projectName, atoType, message }) {
  if (!transporter) { console.log('[Email Mock] ATO notification:', atoType, 'for', projectName); return; }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `${atoType} – ${projectName}`,
    html: `<p>${message}</p>`
  });
}

module.exports = { initialize, sendInvite, sendSubmissionNotification, sendATONotification };
