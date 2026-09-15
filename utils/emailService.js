const nodemailer = require('nodemailer');
const graphMailer = require('./graphMailer');
const { renderEmail, esc } = require('./emailLayout');
const { emailT, SUPPORTED_LANGS, DEFAULT_LANG } = require('./emailI18n');

/**
 * Resolve the language to send a message in. Explicit `lang` wins; otherwise
 * we look up the recipient's saved preference by email; otherwise English.
 */
function recipientLang(email, explicit) {
  if (explicit && SUPPORTED_LANGS.includes(explicit)) return explicit;
  try {
    const { get } = require('../models/database');
    const u = get('SELECT language FROM users WHERE lower(email) = lower(?)', [String(email || '')]);
    if (u && u.language && SUPPORTED_LANGS.includes(u.language)) return u.language;
  } catch (e) { /* fall back to default */ }
  return DEFAULT_LANG;
}

/** Localized entity noun for assignment emails; unknown types pass through. */
function entityLabel(tp, entityType) {
  const map = {
    'assessment': 'em.entityAssessment', 'project': 'em.entityProject',
    'decision package': 'em.entityDecisionPackage', 'poam': 'em.entityPoam', 'poa&m': 'em.entityPoam'
  };
  const key = map[String(entityType || '').toLowerCase()];
  return key ? tp(key) : String(entityType || '');
}

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
async function sendTestEmail(cfg, to, lang) {
  const { t, tp } = emailT(recipientLang(to, lang));
  return sendVia(cfg, {
    to,
    subject: tp('em.smtpTestSubject'),
    html: renderEmail({
      title: tp('em.smtpTestTitle'),
      preheader: tp('em.smtpTestBody1'),
      intro: [t('em.smtpTestBody1'), t('em.smtpTestBody2')]
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

async function sendInvite({ to, recipientName, projectName, inviteCode, expiresAt, assessorName, baseUrl, smtpConfig, lang }) {
  const url = `${baseUrl}/respond/${inviteCode}`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  const { t, tp } = emailT(recipientLang(to, lang));
  const date = new Date(expiresAt).toLocaleDateString('en-CA');
  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: tp('em.inviteSubject', { project: projectName }),
    html: renderEmail({
      title: tp('em.inviteTitle'),
      preheader: tp('em.invitePreheader', { project: projectName }),
      intro: [
        recipientName ? t('em.greetingDear', { name: recipientName }) : t('em.greetingColleague'),
        t('em.inviteBody', { project: projectName }),
        t('em.accessCode')
      ],
      code: inviteCode,
      button: { url, label: tp('em.openPortal') },
      note: t('em.inviteExpiry', { date, contact: assessorName })
    })
  });
}

async function sendUserInvitation({ to, recipientName, inviteCode, invitedByName, role, organization, baseUrl, message, smtpConfig, lang }) {
  const isAssessor = role === 'assessor';
  const path = isAssessor ? '/admin/register' : (role === 'member' ? '/redeem' : '/client/register');
  const url = role === 'member' ? `${baseUrl}/redeem/${inviteCode}` : `${baseUrl}${path}?invite=${inviteCode}`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  const { t, tp } = emailT(recipientLang(to, lang));
  const roleLabel = tp(role === 'member' ? 'em.roleMember' : (isAssessor ? 'em.roleAssessor' : 'em.roleClient'));
  const inviter = invitedByName || tp('em.someone');

  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: tp('em.userInviteSubject'),
    html: renderEmail({
      title: tp('em.userInviteTitle'),
      preheader: tp('em.userInvitePreheader', { role: roleLabel }),
      intro: [
        recipientName ? t('em.greetingDear', { name: recipientName }) : t('em.greetingColleague'),
        organization
          ? t('em.userInviteBodyOrg', { inviter, role: roleLabel, org: organization })
          : t('em.userInviteBody', { inviter, role: roleLabel }),
        ...(message ? [esc(message)] : []),
        t('em.invitationCode')
      ],
      code: inviteCode,
      button: { url, label: tp('em.createAccount') }
    })
  });
}

async function sendAssignmentNotification({ to, recipientName, entityType, entityName, assignedByName, baseUrl, message, link, smtpConfig, lang }) {
  const url = link ? `${baseUrl}${link}` : `${baseUrl}/admin/dashboard`;
  const send = smtpConfig ? (opts) => sendVia(smtpConfig, opts) : safeSend;
  const { t, tp } = emailT(recipientLang(to, lang));
  const entity = entityLabel(tp, entityType);
  const assigner = assignedByName || tp('em.someone');
  return send({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: tp('em.assignSubject', { entity, name: entityName }),
    html: renderEmail({
      title: tp('em.assignTitle', { entity }),
      preheader: tp('em.assignPreheader', { assigner, name: entityName }),
      intro: [
        recipientName ? t('em.greetingDear', { name: recipientName }) : t('em.greetingColleague'),
        t('em.assignBody', { assigner, entity, name: entityName }),
        ...(message ? [esc(message)] : [])
      ],
      button: { url, label: tp('em.openEntity', { entity }) },
      note: `${t('em.pasteLink')}<br><span style="word-break:break-all">${esc(url)}</span>`
    })
  });
}

/**
 * Batched mention digest. LINK-ONLY by design: collaboration can contain personal
 * information, so message text is included only when the tenant has explicitly
 * opted in (org_settings.notify_mention_excerpt).
 */
async function sendMentionNotification({ to, recipientName, projectName, count, authors, link, excerpts = [], baseUrl = '', lang }) {
  const { t, tp } = emailT(recipientLang(to, lang));
  const who = (authors && authors.length)
    ? (authors.length === 1 ? authors[0] : tp('em.whoOthers', { first: authors[0], n: authors.length - 1 }))
    : tp('em.someone');
  const subject = count > 1
    ? tp('em.mentionSubjectMany', { count, project: projectName })
    : tp('em.mentionSubjectOne', { who, project: projectName });
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
      title: tp('em.mentionTitle'),
      accent: '#0f766e',
      preheader: subject,
      intro: [
        recipientName ? t('em.greetingHello', { name: recipientName }) : t('em.greetingColleague'),
        count > 1
          ? t('em.mentionBodyMany', { who, project: projectName, count })
          : t('em.mentionBody', { who, project: projectName })
      ],
      bodyHtml: excerptHtml,
      button: { url: link, label: tp('em.openDiscussion') },
      note: t('em.mentionNote'),
      footerLink: { url: `${baseUrl}/admin/notifications/preferences`, label: tp('em.notificationPreferences') }
    })
  });
}

async function sendMail(mailOptions) {
  return safeSend(mailOptions);
}

async function sendPasswordReset({ to, name, url, lang }) {
  const { t, tp } = emailT(recipientLang(to, lang));
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: tp('em.resetSubject'),
    html: renderEmail({
      title: tp('em.resetTitle'),
      preheader: tp('em.resetPreheader'),
      intro: [
        name ? t('em.greetingDear', { name }) : t('em.greetingColleague'),
        t('em.resetBody')
      ],
      button: { url, label: tp('em.resetButton') },
      note: t('em.resetNote')
    })
  });
}

async function sendSubmissionNotification({ assessorEmail, projectName, submitterName, lang }) {
  const { t, tp } = emailT(recipientLang(assessorEmail, lang));
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: assessorEmail,
    subject: tp('em.submissionSubject', { project: projectName }),
    html: renderEmail({
      title: tp('em.submissionTitle'),
      preheader: tp('em.submissionSubject', { project: projectName }),
      intro: [
        t('em.submissionBody', { submitter: submitterName, project: projectName }),
        t('em.submissionReview')
      ]
    })
  });
}

async function sendATONotification({ to, projectName, atoType, message, lang }) {
  const { tp } = emailT(recipientLang(to, lang));
  return safeSend({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: tp('em.atoSubject', { atoType, project: projectName }),
    html: renderEmail({
      title: tp('em.atoTitle', { atoType, project: projectName }),
      preheader: tp('em.atoSubject', { atoType, project: projectName }),
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
  sendPasswordReset,
  sendMail,
  sendVia,
  sendRouted,
  ambientOrgSmtp,
  sendTestEmail,
  recipientLang,
  verifyTransport,
  // Microsoft Graph (app-only) sender
  graphConfigured: graphMailer.graphConfigured,
  verifyGraph: graphMailer.verifyGraph,
  sendTestGraph: graphMailer.sendTestGraph
};
