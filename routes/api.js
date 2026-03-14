const express = require('express');
const router = express.Router();
const { run, all, get } = require('../models/database');
const { ensureAuthenticated } = require('../config/passport');
const { verifyMfaAndIssueToken, issueToken, getUserMfaMode, storeChallenge, getChallenge } = require('../config/mfa-signature');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

// WebAuthn config — set in .env for production
const RP_NAME = 'GC SA&A Tool';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

function getAuthUserId(req) {
  if (req.user) return req.user.id;
  if (req.session?.clientId) return req.session.clientId;
  return null;
}

// ── MFA SIGNATURE VERIFICATION (TOTP) ───────────────────────────────────────
router.post('/verify-mfa', express.json(), (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { token } = req.body;
  if (!token || token.length !== 6) return res.status(400).json({ error: 'Please enter a 6-digit code' });
  const result = verifyMfaAndIssueToken(userId, token);
  if (!result.valid) return res.status(403).json({ error: result.error || 'Invalid code' });
  res.json({ success: true, sig_token: result.token });
});

// ── MFA MODE ────────────────────────────────────────────────────────────────
router.get('/mfa-mode', (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const mode = getUserMfaMode(userId);
  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
  res.json({ mfa_mode: mode, has_webauthn: !!user?.webauthn_credential_id });
});

router.post('/mfa-mode', express.json(), (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const { mode } = req.body;
  if (!['totp', 'push', 'none'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  if (mode === 'push') {
    const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
    if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'Register a passkey first.' });
  }
  run('UPDATE users SET mfa_mode = ? WHERE id = ?', [mode, userId]);
  res.json({ success: true, mfa_mode: mode });
});

// ── WEBAUTHN REGISTRATION ───────────────────────────────────────────────────
router.post('/webauthn/register-options', express.json(), async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = get('SELECT id, email, name FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const opts = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userName: user.email, userDisplayName: user.name || user.email,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestationType: 'none',
    });
    storeChallenge(userId, opts.challenge);
    res.json(opts);
  } catch (err) {
    console.error('[WebAuthn] Reg options error:', err);
    res.status(500).json({ error: 'Failed to generate registration options: ' + err.message });
  }
});

router.post('/webauthn/register-verify', express.json(), async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  const expectedChallenge = getChallenge(userId);
  if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired. Please try again.' });

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body, expectedChallenge,
      expectedOrigin: ORIGIN, expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      // credential.id = base64url string, credential.publicKey = Uint8Array
      const pubKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);
      run('UPDATE users SET webauthn_credential_id = ?, webauthn_public_key = ?, webauthn_counter = ?, mfa_mode = ? WHERE id = ?',
        [credential.id, pubKeyB64, credential.counter, 'push', userId]);
      res.json({ success: true, verified: true });
    } else {
      res.status(400).json({ error: 'Verification failed' });
    }
  } catch (err) {
    console.error('[WebAuthn] Reg verify error:', err);
    res.status(400).json({ error: err.message || 'Registration verification failed' });
  }
});

// ── WEBAUTHN AUTHENTICATION (for signature + login) ─────────────────────────
router.post('/webauthn/auth-options', express.json(), async (req, res) => {
  // Can pass userId in body for login flow (before session exists)
  let userId = getAuthUserId(req);
  if (!userId && req.body.userId) userId = req.body.userId;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const user = get('SELECT webauthn_credential_id FROM users WHERE id = ?', [userId]);
  if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'No passkey registered. Use TOTP instead.' });

  try {
    // v11: allowCredentials[].id is a base64url string
    const opts = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: [{ id: user.webauthn_credential_id }],
      userVerification: 'required',
    });
    storeChallenge(userId, opts.challenge);
    res.json(opts);
  } catch (err) {
    console.error('[WebAuthn] Auth options error:', err);
    res.status(500).json({ error: 'Failed to generate authentication options: ' + err.message });
  }
});

router.post('/webauthn/auth-verify', express.json(), async (req, res) => {
  let userId = getAuthUserId(req);
  if (!userId && req.body._userId) userId = parseInt(req.body._userId);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const expectedChallenge = getChallenge(userId);
  if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired' });

  const user = get('SELECT webauthn_credential_id, webauthn_public_key, webauthn_counter FROM users WHERE id = ?', [userId]);
  if (!user?.webauthn_credential_id) return res.status(400).json({ error: 'No passkey registered' });

  try {
    // v11: credential.id = base64url string, credential.publicKey = Uint8Array
    const pubKeyBytes = isoBase64URL.toBuffer(user.webauthn_public_key);

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: user.webauthn_credential_id,
        publicKey: pubKeyBytes,
        counter: user.webauthn_counter || 0,
      },
    });

    if (verification.verified) {
      run('UPDATE users SET webauthn_counter = ? WHERE id = ?', [verification.authenticationInfo.newCounter, userId]);
      const sigToken = issueToken(userId);
      res.json({ success: true, sig_token: sigToken, verified: true });
    } else {
      res.status(403).json({ error: 'Biometric verification failed' });
    }
  } catch (err) {
    console.error('[WebAuthn] Auth verify error:', err);
    res.status(400).json({ error: err.message || 'Authentication failed' });
  }
});

// ── Comments, Audit, AI, etc. ───────────────────────────────────────────────
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
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload for AI doc parsing (temp storage)
const aiUpload = multer({
  dest: path.join(__dirname, '..', 'uploads', 'ai-temp'),
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
    let result;

    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
      // Send as base64 document/image
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      const mimeMap = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      result = await ai.parseDocumentForIntake({ base64, mediaType: mimeMap[ext], filename });
    } else {
      // Send as text
      const text = fs.readFileSync(filePath, 'utf-8');
      result = await ai.parseDocumentForIntake({ text, filename });
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
    const { description } = req.body;
    if (!description || description.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide a project description of at least 20 characters.' });
    }
    const result = await ai.suggestFromDescription(description);
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
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) return res.status(404).json({ error: 'Intake not found' });

    const profileInfo = intake.security_profile || '';
    const result = await ai.reviewIntake(intake, profileInfo);
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
    const { controlId, controlTitle, controlDescription, evidenceGuidance, projectContext } = req.body;
    if (!controlId) return res.status(400).json({ error: 'Control ID required' });

    const result = await ai.generateEvidenceNarrative(
      { control_id: controlId, title: controlTitle, description: controlDescription, evidence_guidance: evidenceGuidance },
      projectContext || {}
    );
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
    const { controlId, controlTitle, controlDescription, projectContext } = req.body;
    if (!controlId) return res.status(400).json({ error: 'Control ID required' });

    const result = await ai.generateEvidenceGuidance(
      { control_id: controlId, title: controlTitle, description: controlDescription },
      projectContext || {}
    );
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
    run('UPDATE assessment_controls SET evidence_guidance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
    const { controls, projectContext } = req.body;
    if (!controls || !controls.length) return res.status(400).json({ error: 'Controls list required' });

    const result = await ai.generateBulkEvidence(controls, projectContext || {});
    res.json({ success: true, narratives: result });
  } catch (err) {
    console.error('AI bulk evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});



// Middleware: allow either admin (passport) or client (session) auth
function ensureAnyAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.session?.clientId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ── AI Text Elaboration (available to both assessors and clients) ────────────
router.post('/ai/elaborate', ensureAnyAuth, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const { text, context } = req.body;
    if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Please type at least a few words before using AI elaboration.' });
    const role = req.user ? 'assessor' : 'client';
    const result = await ai.elaborateText(text, { ...context, role });
    res.json({ success: true, elaborated: result });
  } catch (err) {
    console.error('AI elaborate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Evidence Pre-Review (assessor triggers after client submits) ──────────
router.post('/ai/review-evidence/:assessmentId', ensureAuthenticated, express.json(), async (req, res) => {
  try {
    if (!ai.isConfigured()) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY.' });
    const assessmentId = req.params.assessmentId;
    const { all: dbAll, get: dbGet, run: dbRun } = require('../models/database');

    const assessment = dbGet(`
      SELECT a.*, p.name as project_name, p.data_classification
      FROM assessments a JOIN projects p ON a.project_id = p.id WHERE a.id = ?
    `, [assessmentId]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const controls = dbAll(`
      SELECT * FROM assessment_controls 
      WHERE assessment_id = ? AND is_applicable = 1 AND evidence_status = 'provided'
      ORDER BY family, control_id
    `, [assessmentId]);

    if (!controls.length) return res.status(400).json({ error: 'No submitted evidence to review.' });

    const reviews = await ai.reviewSubmittedEvidence(controls, {
      name: assessment.project_name,
      classification: assessment.data_classification
    });

    if (!Array.isArray(reviews)) return res.status(500).json({ error: 'AI returned invalid response format.' });

    let updated = 0;
    reviews.forEach(r => {
      if (r.controlDbId && r.result && r.comments) {
        dbRun(`UPDATE assessment_controls SET ai_review_result = ?, ai_review_comments = ?, ai_reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND assessment_id = ?`,
          [r.result, r.comments, r.controlDbId, assessmentId]);
        updated++;
      }
    });

    res.json({ success: true, reviewed: updated, total: controls.length, reviews });
  } catch (err) {
    console.error('AI evidence review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SELF-ASSESSMENT (Pre-Intake) API Endpoints
// ══════════════════════════════════════════════════════════════════════════════
const { getFrameworks, getBaselineQuestions, countryNames, govLevelNames } = require('../config/framework-map');
const { langNames } = require('../config/i18n');

// Helper: build AI language instruction
function aiLangInstruction(req) {
  const lang = req.language || 'en';
  if (lang === 'en') return '';
  const name = langNames[lang] || lang;
  return `\nIMPORTANT: Respond entirely in ${name}. All text, titles, hints, recommendations must be in ${name}.`;
}

// Generate tailored security questions: baseline (static) + AI delta (system-specific)
router.post('/self-assessment/questions', async (req, res) => {
  try {
    const { systemType, country, govLevel, sensitivity, description, frameworks } = req.body;
    const lang = req.language || req.body.lang || 'en';
    const scopeCountry = countryNames[country] || country;
    const scopeLevel = govLevelNames[govLevel] || govLevel;
    const fw = frameworks || getFrameworks(country, govLevel, sensitivity);
    const fwLabel = fw.all ? fw.all.join(', ') : fw.primary;
    const scopeText = `Scope: <strong>${scopeCountry} — ${scopeLevel}</strong> · ${sensitivity} sensitivity · Applicable: ${fwLabel}`;

    // Step 1: Get baseline questions (static, no API call)
    const questions = getBaselineQuestions(country, govLevel, sensitivity, req.t);

    // Step 2: If description is substantive, call AI for system-specific extras only
    const desc = (description || '').trim();
    if (desc.length >= 30 && ai.isConfigured()) {
      try {
        // Summarize what we already cover so AI doesn't repeat
        const existingTopics = questions.map(g =>
          g.title + ': ' + g.questions.map(q => q.text.substring(0, 50)).join('; ')
        ).join('\n');

        const system = `You are a security assessment expert. Given a specific system description, generate ONLY additional security questions that are NOT already covered by the standard baseline below.

System type: ${systemType || 'general IT system'}
Country: ${scopeCountry}, Level: ${scopeLevel}, Sensitivity: ${sensitivity}
Frameworks: ${fwLabel}

EXISTING BASELINE QUESTIONS (do NOT repeat these):
${existingTopics}

Based on the specific system description, generate 3-8 ADDITIONAL questions that address risks unique to this particular system. Focus on technology-specific, architecture-specific, or use-case-specific concerns.

Return a JSON array of question objects. Each has: group (which existing group title to add to, or "System-Specific" for a new group), type ("checkbox" or "select"), text (plain language), hint (optional), and for select type: options array.

Keep questions non-technical and understandable by a business owner.
Return ONLY valid JSON array, no markdown, no backticks.${aiLangInstruction(req)}`;

        const result = await ai.callClaude(system, `System description: ${desc}`, { maxTokens: 1500, temperature: 0.3 });
        const cleaned = result.replace(/```json|```/g, '').trim();
        const extraQuestions = JSON.parse(cleaned);

        // Merge AI extras into the baseline
        if (Array.isArray(extraQuestions)) {
          let systemSpecificGroup = null;

          extraQuestions.forEach(eq => {
            const targetGroup = eq.group || 'System-Specific';
            const existing = questions.find(g => g.title === targetGroup);

            if (existing) {
              // Add to existing group if not duplicate
              const isDupe = existing.questions.some(q =>
                q.text.toLowerCase().includes(eq.text.substring(0, 30).toLowerCase())
              );
              if (!isDupe) {
                existing.questions.push({
                  type: eq.type || 'checkbox',
                  text: eq.text,
                  hint: eq.hint || '',
                  options: eq.options,
                  aiGenerated: true
                });
              }
            } else {
              // Create new "System-Specific" group
              if (!systemSpecificGroup) {
                systemSpecificGroup = {
                  title: 'System-Specific Considerations',
                  icon: 'bi-cpu',
                  frameworkRef: 'AI-Generated',
                  questions: []
                };
                questions.push(systemSpecificGroup);
              }
              systemSpecificGroup.questions.push({
                type: eq.type || 'checkbox',
                text: eq.text,
                hint: eq.hint || '',
                options: eq.options,
                aiGenerated: true
              });
            }
          });

          console.log(`[SA] Baseline: ${questions.reduce((n, g) => n + g.questions.length, 0) - extraQuestions.length} static + ${extraQuestions.length} AI delta questions`);
        }
      } catch (aiErr) {
        // AI failed — that's OK, baseline questions still work
        console.warn('[SA] AI delta questions failed (baseline still served):', aiErr.message);
      }
    } else {
      console.log(`[SA] Serving ${questions.reduce((n, g) => n + g.questions.length, 0)} baseline questions only (no AI call — description too short or AI not configured)`);
    }

    res.json({ questions, scopeText, frameworksLabel: fwLabel });
  } catch (err) {
    console.error('Self-assessment questions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate security report from answers
router.post('/self-assessment/report', async (req, res) => {
  try {
    const { systemType, country, govLevel, sensitivity, description, frameworks, questions, answers } = req.body;
    const scopeCountry = countryNames[country] || country;
    const scopeLevel = govLevelNames[govLevel] || govLevel;
    const fw = frameworks || getFrameworks(country, govLevel, sensitivity);
    const fwLabel = fw.all ? fw.all.join(', ') : fw.primary;

    // Build a readable summary of questions + answers
    let answerSummary = '';
    if (questions && answers) {
      questions.forEach((group, gi) => {
        answerSummary += `\n## ${group.title}\n`;
        group.questions.forEach((q, qi) => {
          const key = `${gi}_${qi}`;
          const answer = answers[key];
          if (q.type === 'checkbox') {
            answerSummary += `- ${q.text}: ${answer ? 'YES' : 'NO'}\n`;
          } else if (q.type === 'select' && answer) {
            answerSummary += `- ${q.text}: ${answer}\n`;
          } else {
            answerSummary += `- ${q.text}: NOT ANSWERED\n`;
          }
        });
      });
    }

    const system = `You are a security assessment expert. Analyze the self-assessment answers and generate a preliminary security report.

System: ${systemType || 'general'} — ${description}
Country: ${scopeCountry}, Level: ${scopeLevel}, Sensitivity: ${sensitivity}
Frameworks: ${fwLabel}

Return a JSON object with:
- score: number 0-100 (overall security posture percentage)
- scopeLabel: string (e.g. "Web App · Canada Federal · ITSG-33")
- critical: array of findings (immediate action needed). Each finding: { title, detail, recommendation, framework }
- warnings: array of findings (needs improvement)
- secure: array of findings (what's already in place — mark with framework refs)
- nextSteps: array of strings (prioritized action items, reference framework controls)

Be specific about which framework controls apply. Keep language accessible to non-technical users.
For "secure" items, note these are self-reported assumptions that need verification.
Return ONLY valid JSON, no markdown, no backticks.${aiLangInstruction(req)}`;

    const result = await ai.callClaude(system, `Assessment answers:\n${answerSummary}`, { maxTokens: 4000, temperature: 0.3 });

    let report;
    try {
      const cleaned = result.replace(/```json|```/g, '').trim();
      report = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse AI report:', e.message);
      return res.status(500).json({ error: 'Failed to generate report. Please try again.' });
    }

    res.json(report);
  } catch (err) {
    console.error('Self-assessment report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit self-assessment for intake review
router.post('/self-assessment/submit', (req, res) => {
  try {
    const { name, email, organization, systemType, country, govLevel, sensitivity,
            description, frameworks, questions, answers, report } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required' });

    const crypto = require('crypto');
    const refCode = 'SA-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    run(`INSERT INTO self_assessments
      (ref_code, submitter_name, submitter_email, submitter_org, system_type, system_description,
       country, gov_level, data_sensitivity, frameworks_json, questions_json, answers_json, report_json,
       score, secure_count, warning_count, critical_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [refCode, name || '', email, organization || '', systemType || '',
       description || '', country || '', govLevel || '', sensitivity || '',
       JSON.stringify(frameworks || {}), JSON.stringify(questions || []),
       JSON.stringify(answers || {}), JSON.stringify(report || {}),
       report?.score || 0, report?.secure?.length || 0,
       report?.warnings?.length || 0, report?.critical?.length || 0]
    );

    res.json({ success: true, refCode });
  } catch (err) {
    console.error('Self-assessment submit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: AI pre-populate intake from self-assessment
router.post('/self-assessment/:id/generate-intake', async (req, res) => {
  try {
    const sa = get('SELECT * FROM self_assessments WHERE id = ?', [req.params.id]);
    if (!sa) return res.status(404).json({ error: 'Self-assessment not found' });

    const report = JSON.parse(sa.report_json || '{}');
    const frameworks = JSON.parse(sa.frameworks_json || '{}');

    const system = `You are a security assessment intake specialist. Based on a preliminary self-assessment, pre-populate intake form fields for a formal Security Assessment & Authorization engagement.

Self-assessment details:
- System type: ${sa.system_type}
- Description: ${sa.system_description}
- Country: ${sa.country}, Level: ${sa.gov_level}, Sensitivity: ${sa.data_sensitivity}
- Frameworks: ${frameworks.all ? frameworks.all.join(', ') : frameworks.primary || 'Unknown'}
- Score: ${sa.score}%
- Critical gaps: ${sa.critical_count}, Warnings: ${sa.warning_count}, Secure: ${sa.secure_count}

Return a JSON object with these intake fields (use reasonable defaults where info is missing):
{
  "project_name": "string",
  "project_description": "string",
  "department": "string or empty",
  "app_type": "web|internal|cloud|mobile|data|network",
  "data_classification": "unclassified|protected-a|protected-b|secret",
  "confidentiality_level": "low|medium|high",
  "integrity_level": "low|medium|high",
  "availability_level": "low|medium|high",
  "has_pii": true/false,
  "pia_completed": "yes|no|unknown",
  "hosting_type": "on-premises|shared|cloud-certified|managed",
  "hosting_region": "string",
  "security_profile": "PBMM|standard|high",
  "additional_notes": "string with key findings summary"
}

Return ONLY valid JSON.`;

    const result = await ai.callClaude(system, 'Generate intake fields', { maxTokens: 2000, temperature: 0.2 });
    let intakeData;
    try {
      intakeData = JSON.parse(result.replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate intake data' });
    }

    res.json({ success: true, intakeData });
  } catch (err) {
    console.error('Generate intake error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
