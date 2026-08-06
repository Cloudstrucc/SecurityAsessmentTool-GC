const express = require('express');
const router = express.Router();
const { run, all, get } = require('../models/database');
const { ensureAuthenticated } = require('../config/passport');
const { verifyMfaAndIssueToken, issueToken, getUserMfaMode, storeChallenge, getChallenge } = require('../config/mfa-signature');

let simpleWebAuthn = null;
let isoBase64URL = null;
try {
  simpleWebAuthn = require('@simplewebauthn/server');
  isoBase64URL = require('@simplewebauthn/server/helpers').isoBase64URL;
} catch (err) {
  simpleWebAuthn = null;
}

const RP_NAME = 'Vanguard SA&A Platform';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

function getAuthUserId(req) {
  if (req.user) return req.user.id;
  if (req.session?.clientId) return req.session.clientId;
  return null;
}

function requireWebAuthn(res) {
  if (simpleWebAuthn && isoBase64URL) return true;
  res.status(503).json({ error: 'Passkey support is not installed. Use TOTP instead.' });
  return false;
}

router.post('/verify-mfa', express.json(), (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { token } = req.body;
  if (!token || !/^\d{6}$/.test(token)) return res.status(400).json({ error: 'Please enter a 6-digit code.' });
  const result = verifyMfaAndIssueToken(userId, token);
  if (!result.valid) return res.status(403).json({ error: result.error || 'Invalid code.' });
  res.json({ success: true, sig_token: result.token });
});

router.get('/mfa-mode', (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
  res.json({ mfa_mode: getUserMfaMode(userId), has_webauthn: !!user?.webauthn_credential_id, totp_available: true });
});

router.post('/mfa-mode', express.json(), (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const mode = req.body.mode;
  if (!['totp', 'push', 'none'].includes(mode)) return res.status(400).json({ error: 'Invalid MFA mode.' });
  if (mode === 'push') {
    const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
    if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'Register a passkey first.' });
  }
  run('UPDATE users SET mfa_mode = ? WHERE id = ?', [mode, userId]);
  res.json({ success: true, mfa_mode: mode, totp_available: true });
});

router.post('/webauthn/register-options', express.json(), async (req, res) => {
  if (!requireWebAuthn(res)) return;
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = get('SELECT id, email, name FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const options = await simpleWebAuthn.generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userDisplayName: user.name || user.email,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestationType: 'none'
    });
    storeChallenge(userId, options.challenge);
    res.json(options);
  } catch (err) {
    console.error('[WebAuthn] register-options:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/webauthn/register-verify', express.json(), async (req, res) => {
  if (!requireWebAuthn(res)) return;
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const expectedChallenge = getChallenge(userId);
  if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired. Please try again.' });

  try {
    const verification = await simpleWebAuthn.verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed.' });
    }

    const { credential } = verification.registrationInfo;
    const publicKey = isoBase64URL.fromBuffer(credential.publicKey);
    run(
      `UPDATE users SET webauthn_credential_id = ?, webauthn_public_key = ?, webauthn_counter = ?, mfa_mode = 'push' WHERE id = ?`,
      [credential.id, publicKey, credential.counter || 0, userId]
    );
    res.json({ success: true, verified: true, totp_available: true });
  } catch (err) {
    console.error('[WebAuthn] register-verify:', err);
    res.status(400).json({ error: err.message || 'Passkey verification failed.' });
  }
});

router.post('/webauthn/auth-options', express.json(), async (req, res) => {
  if (!requireWebAuthn(res)) return;
  let userId = getAuthUserId(req);
  if (!userId && req.body.userId) userId = parseInt(req.body.userId);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
  if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'No passkey registered. Use TOTP instead.' });

  try {
    const options = await simpleWebAuthn.generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: [{ id: user.webauthn_credential_id }],
      userVerification: 'required'
    });
    storeChallenge(userId, options.challenge);
    res.json(options);
  } catch (err) {
    console.error('[WebAuthn] auth-options:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/webauthn/auth-verify', express.json(), async (req, res) => {
  if (!requireWebAuthn(res)) return;
  let userId = getAuthUserId(req);
  if (!userId && req.body._userId) userId = parseInt(req.body._userId);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const expectedChallenge = getChallenge(userId);
  if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired. Use TOTP or try passkey again.' });
  const user = get('SELECT webauthn_credential_id, webauthn_public_key, webauthn_counter FROM users WHERE id = ?', [userId]);
  if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'No passkey registered. Use TOTP instead.' });

  try {
    const verification = await simpleWebAuthn.verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: user.webauthn_credential_id,
        publicKey: isoBase64URL.toBuffer(user.webauthn_public_key),
        counter: user.webauthn_counter || 0
      }
    });

    if (!verification.verified) return res.status(403).json({ error: 'Passkey verification failed. Use TOTP instead.' });

    run('UPDATE users SET webauthn_counter = ? WHERE id = ?', [verification.authenticationInfo.newCounter, userId]);
    res.json({ success: true, sig_token: issueToken(userId), verified: true, totp_available: true });
  } catch (err) {
    console.error('[WebAuthn] auth-verify:', err);
    res.status(400).json({ error: err.message || 'Passkey verification failed. Use TOTP instead.' });
  }
});

// Get comments for a control
router.get('/comments/:controlId', (req, res) => {
  const comments = all('SELECT * FROM comments WHERE assessment_control_id = ? ORDER BY created_at ASC', [req.params.controlId]);
  res.json({ success: true, comments });
});

// Add comment (authenticated)
router.post('/comments/:controlId', ensureAuthenticated, express.json(), (req, res) => {
  const { content, is_internal } = req.body;
  run(`INSERT INTO comments (assessment_control_id, user_id, user_name, user_role, content, is_internal)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.controlId, req.user.id, req.user.name, req.user.role, content, is_internal ? 1 : 0]);
  res.json({ success: true });
});

// Audit a control
router.post('/audit/:assessmentId/:controlId', ensureAuthenticated, express.json(), (req, res) => {
  const { result, comments } = req.body;
  run(`UPDATE assessment_controls SET audit_result = ?, audit_comments = ?, 
    audit_reviewed_at = CURRENT_TIMESTAMP, audit_reviewed_by = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND assessment_id = ?`,
    [result, comments, req.user.id, req.params.controlId, req.params.assessmentId]);
  res.json({ success: true });
});

// Update checklist item status
router.post('/checklist/:itemId/status', (req, res) => {
  const { status } = req.body;
  if (status === 'closed') {
    run('UPDATE iato_checklist SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.itemId]);
  } else {
    run('UPDATE iato_checklist SET status = ?, completed_at = NULL WHERE id = ?', [status, req.params.itemId]);
  }
  res.json({ success: true });
});

// Get assessment stats
router.get('/assessments/:id/stats', (req, res) => {
  const controls = all('SELECT * FROM assessment_controls WHERE assessment_id = ?', [req.params.id]);
  const applicable = controls.filter(c => c.is_applicable);
  res.json({
    total: controls.length,
    applicable: applicable.length,
    met: applicable.filter(c => c.audit_result === 'met').length,
    partiallyMet: applicable.filter(c => c.audit_result === 'partially-met').length,
    notMet: applicable.filter(c => c.audit_result === 'not-met').length,
    evidenceProvided: applicable.filter(c => c.evidence_status === 'provided').length
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI-ASSISTED FEATURES
// ═══════════════════════════════════════════════════════════════════════════════
const ai = require('../config/ai-service');
const access = require('../config/access');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * AI license/allowance gate for authenticated AI routes. Returns true when the
 * request may proceed; otherwise sends a 403 and returns false. Records nothing
 * here — call access.recordAiUse(req.user, workType) after a successful call.
 */
function aiAllowed(req, res, workType) {
  const g = access.canUseAI(req.user, workType);
  if (!g.ok) { res.status(403).json({ error: g.reason, needsLicense: !!g.needsLicense, limited: !!g.limited }); return false; }
  return true;
}
const { AI_TEMP_UPLOAD_DIR: aiTempUploadDir, ensureUploadDirs } = require('../config/storage');
const { mergeQuestions, getFrameworks, countryNames, govLevelNames, sensitivityNames } = require('../config/framework-map');
const { buildFrameworkSummary } = require('../config/security-frameworks');

// File upload for AI doc parsing (temp storage)
ensureUploadDirs();
const aiUpload = multer({
  dest: aiTempUploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.txt','.md','.doc','.docx','.png','.jpg','.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Check if AI is configured
router.get('/ai/status', (req, res) => {
  res.json({ configured: ai.isConfigured() });
});

// ── Intake-side: Parse uploaded document ────────────────────────────────────
router.post('/ai/parse-document', aiUpload.single('document'), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = req.file.originalname;
    const securityFramework = req.body.securityFramework || req.body.security_framework || 'ITSG-33';
    let result;

    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
      // Send as base64 document/image
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      const mimeMap = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      result = await ai.parseDocumentForIntake({ base64, mediaType: mimeMap[ext], filename, securityFramework });
    } else {
      // Send as text
      const text = fs.readFileSync(filePath, 'utf-8');
      result = await ai.parseDocumentForIntake({ text, filename, securityFramework });
    }

    // Clean up temp file
    fs.unlinkSync(filePath);

    res.json({ success: true, fields: result });
  } catch (err) {
    console.error('AI parse-document error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ── Intake-side: Suggest from plain language description ────────────────────
router.post('/ai/suggest-from-description', express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const { description, securityFramework } = req.body;
    if (!description || description.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide a project description of at least 20 characters.' });
    }
    const result = await ai.suggestFromDescription(description, securityFramework || 'ITSG-33');
    res.json({ success: true, suggestions: result });
  } catch (err) {
    console.error('AI suggest error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin-side: Full intake review analysis ─────────────────────────────────
router.post('/ai/review-intake/:id', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!aiAllowed(req, res, 'intake-review')) return;
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) return res.status(404).json({ error: 'Intake not found' });

    const profileInfo = buildFrameworkSummary(intake);
    const result = await ai.reviewIntake(intake, profileInfo);
    access.recordAiUse(req.user, 'intake-review');
    res.json({ success: true, review: result });
  } catch (err) {
    console.error('AI review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin-side: Suggest additional controls ─────────────────────────────────
router.post('/ai/suggest-controls/:id', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!aiAllowed(req, res, 'controls')) return;
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) return res.status(404).json({ error: 'Intake not found' });

    const { CONTROLS, getRecommendedControls } = require('../config/itsg33-controls');

    let techs = [];
    try { techs = JSON.parse(intake.technologies || '[]'); } catch(e) {}

    // Get current baseline controls using the real recommendation engine
    const currentControls = getRecommendedControls({
      dataClassification: intake.data_classification,
      confidentiality: intake.confidentiality_level || intake.data_classification,
      hostingType: intake.hosting_type,
      appType: intake.app_type || 'internal',
      hasPII: intake.has_pii === 1,
      technologies: techs,
      description: intake.project_description || '',
      securityProfile: intake.security_profile || 'PBMM',
      isHVA: intake.is_hva === 1
    });
    const currentIds = currentControls.map(c => c.id);

    const result = await ai.suggestAdditionalControls(intake, currentIds, CONTROLS);
    access.recordAiUse(req.user, 'controls');
    res.json({ success: true, suggestions: result });
  } catch (err) {
    console.error('AI suggest-controls error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence narrative generation ───────────────────────────────────────────
router.post('/ai/evidence-narrative', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!aiAllowed(req, res, 'narrative')) return;
    const { controlId, controlTitle, controlDescription, evidenceGuidance, projectContext } = req.body;
    if (!controlId) return res.status(400).json({ error: 'Control ID required' });

    const result = await ai.generateEvidenceNarrative(
      { control_id: controlId, title: controlTitle, description: controlDescription, evidence_guidance: evidenceGuidance },
      projectContext || {}
    );
    access.recordAiUse(req.user, 'narrative');
    res.json({ success: true, narrative: result });
  } catch (err) {
    console.error('AI evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Evidence Guidance (assessor generates guidance for the client) ────────
router.post('/ai/evidence-guidance', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!aiAllowed(req, res, 'evidence-guidance')) return;
    const { controlId, controlTitle, controlDescription, projectContext } = req.body;
    if (!controlId) return res.status(400).json({ error: 'Control ID required' });

    const result = await ai.generateEvidenceGuidance(
      { control_id: controlId, title: controlTitle, description: controlDescription },
      projectContext || {}
    );
    access.recordAiUse(req.user, 'evidence-guidance');
    res.json({ success: true, guidance: result });
  } catch (err) {
    console.error('AI guidance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Save evidence guidance to a control ─────────────────────────────────────
router.post('/ai/save-guidance/:controlDbId', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    const { guidance } = req.body;
    const { run } = require('../models/database');
    run(`UPDATE assessment_controls SET evidence_guidance = ?, guidance_source = 'ai-generated',
      ai_generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [guidance, req.params.controlDbId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Save guidance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk evidence generation ────────────────────────────────────────────────
router.post('/ai/generate-bulk-evidence', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    if (!aiAllowed(req, res, 'bulk-evidence')) return;
    const { controls, projectContext } = req.body;
    if (!controls || !controls.length) return res.status(400).json({ error: 'Controls list required' });

    const result = await ai.generateBulkEvidence(controls, projectContext || {});
    access.recordAiUse(req.user, 'bulk-evidence');
    res.json({ success: true, narratives: result });
  } catch (err) {
    console.error('AI bulk evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Self-assessment wizard ──────────────────────────────────────────────────
router.post('/self-assessment/questions', express.json(), async (req, res) => {
  try {
    const { country, govLevel, sensitivity, description, frameworks } = req.body;
    const selectedFrameworks = frameworks || getFrameworks(country, govLevel, sensitivity);
    const questions = mergeQuestions(country, govLevel);

    if ((description || '').toLowerCase().includes('api')) {
      const group = questions.find(q => q.title === 'System and Network Security');
      group.questions.push({ type: 'checkbox', text: 'APIs require authentication and input validation.', hint: 'Applies to public and internal APIs.', frameworkRef: 'API security' });
    }
    if ((description || '').toLowerCase().includes('cloud')) {
      const group = questions.find(q => q.title === 'System and Network Security');
      group.questions.push({ type: 'checkbox', text: 'Cloud resources are configured from secure baselines.', hint: 'Infrastructure as code, policy, or configuration guardrails.', frameworkRef: 'Cloud security' });
    }

    res.json({
      success: true,
      questions,
      frameworks: selectedFrameworks,
      scopeLabel: `${countryNames[country] || country || 'Selected jurisdiction'} · ${govLevelNames[govLevel] || govLevel || 'sector'} · ${sensitivityNames[sensitivity] || sensitivity || 'sensitivity'}`
    });
  } catch (err) {
    console.error('Self-assessment questions error:', err);
    res.status(500).json({ error: err.message });
  }
});

function finding(title, detail, recommendation, framework) {
  return { title, detail, recommendation, framework };
}

function buildSelfAssessmentReport({ systemType, country, govLevel, sensitivity, description, frameworks, questions, answers }) {
  const fw = frameworks || getFrameworks(country, govLevel, sensitivity);
  const critical = [];
  const warnings = [];
  const secure = [];
  let total = 0;
  let positive = 0;

  (questions || []).forEach((group, groupIndex) => {
    (group.questions || []).forEach((question, qIndex) => {
      total++;
      const key = `q_${groupIndex}_${qIndex}`;
      const answer = answers?.[key];
      const title = question.text.replace(/\.$/, '');
      const ref = question.frameworkRef || group.frameworkRef || fw.primary;
      if (question.type === 'checkbox') {
        if (answer === true || answer === 'true' || answer === 'on') {
          positive++;
          secure.push(finding(title, 'Self-reported as implemented.', '', ref));
        } else if (/mfa|encrypt|incident|patch|log|backup|admin/i.test(question.text)) {
          critical.push(finding(title, 'This foundational safeguard was not reported as implemented.', 'Prioritize implementation and collect evidence before a formal assessment.', ref));
        } else {
          warnings.push(finding(title, 'This control area needs assessor follow-up.', 'Document current practice, owner, and planned remediation.', ref));
        }
      } else if (question.type === 'select') {
        const normalized = String(answer || '').toLowerCase();
        if (!answer || /unknown|not|never|no policy/.test(normalized)) {
          warnings.push(finding(title, `Selected answer: ${answer || 'not answered'}.`, 'Clarify this item during intake and define an accountable remediation owner.', ref));
        } else {
          positive++;
          secure.push(finding(title, `Selected answer: ${answer}.`, '', ref));
        }
      }
    });
  });

  const score = total ? Math.max(0, Math.min(100, Math.round((positive / total) * 100 - critical.length * 5))) : 0;
  const nextSteps = [
    'Request a full assessment when the system scope, owner, data sensitivity, and hosting model are ready.',
    'Collect policy, architecture, IAM, logging, backup, and vulnerability evidence for assessor review.',
    'Resolve critical gaps before seeking an ATO/iATO decision.'
  ];
  if (sensitivity === 'high' || sensitivity === 'classified') {
    nextSteps.unshift('Confirm regulatory, privacy, and authorization requirements for high-sensitivity data.');
  }

  return {
    score,
    scopeLabel: `${fw.primary}${fw.others?.length ? ' + ' + fw.others.length + ' related framework(s)' : ''}`,
    critical,
    warnings,
    secure,
    nextSteps,
    summary: `${systemType || 'System'} self-assessment for ${countryNames[country] || country || 'selected jurisdiction'} using ${fw.primary}. ${description ? 'The submitted description was considered when generating findings.' : ''}`
  };
}

router.post('/self-assessment/report', express.json({ limit: '2mb' }), (req, res) => {
  try {
    res.json(buildSelfAssessmentReport(req.body));
  } catch (err) {
    console.error('Self-assessment report error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/self-assessment/submit', express.json({ limit: '4mb' }), (req, res) => {
  try {
    const {
      name, email, organization, systemType, country, govLevel, sensitivity,
      description, frameworks, questions, answers, report
    } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail) return res.status(400).json({ error: 'Email is required.' });
    const finalReport = report || buildSelfAssessmentReport(req.body);
    const refCode = `SA-${require('crypto').randomBytes(4).toString('hex').toUpperCase()}`;
    run(`INSERT INTO self_assessments
      (ref_code, submitter_name, submitter_email, submitter_org, system_type, system_description,
       country, gov_level, data_sensitivity, frameworks_json, questions_json, answers_json, report_json,
       score, secure_count, warning_count, critical_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refCode,
        name || '',
        normalizedEmail,
        organization || '',
        systemType || '',
        description || '',
        country || '',
        govLevel || '',
        sensitivity || '',
        JSON.stringify(frameworks || getFrameworks(country, govLevel, sensitivity)),
        JSON.stringify(questions || []),
        JSON.stringify(answers || {}),
        JSON.stringify(finalReport),
        finalReport.score || 0,
        finalReport.secure?.length || 0,
        finalReport.warnings?.length || 0,
        finalReport.critical?.length || 0
      ]);
    res.json({ success: true, refCode });
  } catch (err) {
    console.error('Self-assessment submit error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/self-assessment/:id/generate-intake', ensureAuthenticated, express.json(), (req, res) => {
  try {
    const sa = get('SELECT * FROM self_assessments WHERE id = ?', [req.params.id]);
    if (!sa) return res.status(404).json({ error: 'Self-assessment not found.' });
    let frameworks = {};
    try { frameworks = JSON.parse(sa.frameworks_json || '{}'); } catch(e) {}
    res.json({
      success: true,
      intakeData: {
        projectName: `${sa.submitter_org || 'Client'} ${sa.system_type || 'System'} Assessment`,
        projectDescription: sa.system_description || '',
        department: sa.submitter_org || '',
        appType: sa.system_type === 'web-app' ? 'external' : 'internal',
        securityFramework: frameworks.primary || 'ITSG-33',
        dataClassification: sa.data_sensitivity === 'high' ? 'protected-b' : 'protected-a'
      }
    });
  } catch (err) {
    console.error('Self-assessment generate-intake error:', err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
