/**
 * GC SA&A Tool — AI Service Layer
 * 
 * Wraps the Anthropic Messages API with specialized prompt functions
 * for intake parsing, review summarization, control recommendations,
 * evidence narrative generation, and question generation.
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OOB_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const OOB_KEY = () => process.env.ANTHROPIC_API_KEY || '';

const { getAiContext } = require('./ai-context');

// Sensible default models per provider when the tenant didn't specify one.
const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  grok: 'grok-2-latest',
  gemini: 'gemini-1.5-pro',
  custom: 'gpt-4o'
};

/** True when *some* AI is available — either the OOB key or the tenant's own. */
function isConfigured() {
  const ctx = getAiContext();
  // A BYO custom/on-prem endpoint may be keyless (auth at the network layer), so a
  // base URL alone counts as configured; hosted BYO providers need a key.
  if (ctx && ctx.isByo) return !!(ctx.apiKey || ctx.baseUrl);
  return !!OOB_KEY();
}

// ── Content converters (Anthropic block format is our canonical input) ────────
function toBlocks(userContent) {
  return typeof userContent === 'string' ? [{ type: 'text', text: userContent }] : userContent;
}
function toOpenAIContent(userContent) {
  const blocks = toBlocks(userContent);
  return blocks.map(b => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'image' && b.source) return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
    return { type: 'text', text: '' };
  });
}
function toGeminiParts(userContent) {
  const blocks = toBlocks(userContent);
  return blocks.map(b => {
    if (b.type === 'text') return { text: b.text };
    if (b.type === 'image' && b.source) return { inline_data: { mime_type: b.source.media_type, data: b.source.data } };
    return { text: '' };
  });
}

async function fetchJson(url, options, providerLabel) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 30000);
      console.log(`[AI] ${providerLabel} rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`${providerLabel} API error (${response.status}): ${errBody.slice(0, 500)}`);
    }
    return response.json();
  }
  throw new Error(`${providerLabel} rate limit exceeded after retries.`);
}

async function callAnthropic({ apiKey, model, system, userContent, maxTokens }) {
  const data = await fetchJson(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: toBlocks(userContent) }] })
  }, 'Anthropic');
  const u = data.usage || {};
  return { text: (data.content && data.content[0] && data.content[0].text) || '', usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, total: (u.input_tokens || 0) + (u.output_tokens || 0) } };
}

async function callOpenAICompatible({ apiKey, model, baseUrl, system, userContent, maxTokens, label }) {
  const url = `${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
  // Only send Authorization when a key is set — keyless on-prem endpoints reject a
  // bogus "Bearer null".
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: toOpenAIContent(userContent) }] })
  }, label || 'OpenAI');
  const u = data.usage || {};
  return { text: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '', usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || ((u.prompt_tokens || 0) + (u.completion_tokens || 0)) } };
}

async function callGemini({ apiKey, model, system, userContent, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: toGeminiParts(userContent) }],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  }, 'Gemini');
  const cand = data.candidates && data.candidates[0];
  const text = (cand && cand.content && cand.content.parts || []).map(p => p.text || '').join('');
  const m = data.usageMetadata || {};
  return { text, usage: { input: m.promptTokenCount || 0, output: m.candidatesTokenCount || 0, total: m.totalTokenCount || 0 } };
}

function recordTokenUsage(ctx, usage) {
  try {
    const { run, get } = require('../models/database');
    const orgId = ctx && ctx.orgId ? ctx.orgId : null;
    const billedOob = ctx && ctx.isByo ? 0 : 1;
    run('INSERT INTO ai_token_usage (organization_id, user_id, provider, work_type, input_tokens, output_tokens, total_tokens, billed_oob) VALUES (?,?,?,?,?,?,?,?)',
      [orgId, ctx && ctx.userId || null, ctx && ctx.provider || 'oob', ctx && ctx.workType || null, usage.input || 0, usage.output || 0, usage.total || 0, billedOob]);
    // Only OOB usage counts against the tenant's monthly allowance.
    if (orgId && billedOob) {
      const billing = require('./billing');
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      const org = get('SELECT plan, token_limit, token_period, tokens_used, tokens_extra FROM organizations WHERE id = ?', [orgId]);
      if (org) {
        const plan = billing.getPlan(org.plan) || {};
        const base = org.token_limit != null ? org.token_limit : plan.tokens; // null = unlimited
        // Monthly counter resets when the stored period is an earlier month.
        const rolledUsed = (org.token_period === period) ? (org.tokens_used || 0) : 0;
        const t = usage.total || 0;
        if (base == null) {
          // Unlimited plan — meter for reporting only; never touch the top-up balance.
          run('UPDATE organizations SET token_period = ?, tokens_used = ? WHERE id = ?', [period, rolledUsed + t, orgId]);
        } else {
          // Consume the monthly base first; any overflow draws down the one-time
          // top-up balance (tokens_extra) so a purchased pack is spent once, not
          // re-granted every month. tokens_used is capped at base.
          const baseRemaining = Math.max(0, base - rolledUsed);
          const fromBase = Math.min(t, baseRemaining);
          const fromExtra = t - fromBase;
          const newUsed = rolledUsed + fromBase;
          const newExtra = Math.max(0, (org.tokens_extra || 0) - fromExtra);
          run('UPDATE organizations SET token_period = ?, tokens_used = ?, tokens_extra = ? WHERE id = ?',
            [period, newUsed, newExtra, orgId]);
        }
      }
    }
  } catch (e) { console.error('[ai usage]', e.message); }
}

/**
 * Core AI call. Routes to the tenant's configured provider (or the OOB default)
 * based on the per-request AI context. Returns the response text (all callers
 * expect a string) and records token usage.
 */
async function callClaude(system, userContent, { maxTokens = 4096 } = {}) {
  const ctx = getAiContext() || {};
  let result;
  if (ctx.isByo) {
    const model = ctx.model || DEFAULT_MODELS[ctx.provider] || 'gpt-4o';
    if (ctx.provider === 'anthropic')      result = await callAnthropic({ apiKey: ctx.apiKey, model, system, userContent, maxTokens });
    else if (ctx.provider === 'gemini')    result = await callGemini({ apiKey: ctx.apiKey, model, system, userContent, maxTokens });
    else if (ctx.provider === 'grok')      result = await callOpenAICompatible({ apiKey: ctx.apiKey, model, baseUrl: ctx.baseUrl || 'https://api.x.ai/v1', system, userContent, maxTokens, label: 'Grok (xAI)' });
    else                                    result = await callOpenAICompatible({ apiKey: ctx.apiKey, model, baseUrl: ctx.baseUrl, system, userContent, maxTokens, label: ctx.provider === 'custom' ? 'Custom LLM' : 'OpenAI' });
  } else {
    if (!OOB_KEY()) throw new Error('AI not configured. Set ANTHROPIC_API_KEY or configure your own AI provider under Admin → Organization settings.');
    result = await callAnthropic({ apiKey: OOB_KEY(), model: OOB_MODEL(), system, userContent, maxTokens });
  }
  recordTokenUsage(ctx, result.usage || {});
  return result.text;
}

/**
 * Parse a JSON response from Claude, handling markdown fences
 */
function parseJSON(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTAKE-SIDE AI FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse an uploaded document and extract intake form fields.
 * Supports text content or base64-encoded documents (PDF, images).
 * @param {object} opts
 * @param {string} opts.text - Plain text content (for .txt, .md, .docx-extracted)
 * @param {string} opts.base64 - Base64-encoded file content (for PDF, images)
 * @param {string} opts.mediaType - MIME type (e.g., 'application/pdf', 'image/png')
 * @param {string} opts.filename - Original filename
 */
async function parseDocumentForIntake({ text, base64, mediaType, filename, securityFramework = 'ITSG-33' }) {
  const system = `You are an IT security specialist helping project owners fill out a security assessment intake form. You extract information from project documents to pre-populate the intake form.

The assessor-selected framework is: ${securityFramework}. When the selected framework is not ITSG-33, recommend framework-specific baseline/category fields and do not force Government of Canada C/I/A categories unless the document clearly supports them.

You must respond ONLY with a JSON object (no markdown, no explanation) with these fields. Use null for anything you cannot determine from the document:

{
  "projectName": "string",
  "projectDescription": "string (2-3 sentence summary)",
  "department": "string (GC department name)",
  "branch": "string",
  "userCount": "1-50|51-500|501-5000|5001+",
  "appType": "internal|external|hybrid",

  "confidentialityLevel": "unclassified|protected-a|protected-b|protected-c|confidential|secret|top-secret",
  "integrityLevel": "low|medium|high",
  "availabilityLevel": "low|medium|high",
  "isHVA": false,
  "securityFramework": "ITSG-33|CIS Controls v8|ISO/IEC 27001:2022 Annex A|FedRAMP Rev. 5|NIST SP 800-53 Rev. 5|ASD ISM|ACSC Essential Eight",
  "frameworkBaseline": "string",
  "frameworkCategory": "string",
  "frameworkApplicability": "string",
  "piiTypes": ["name-address","sin","financial","health","biometric","employment","immigration","law-enforcement","indigenous","none"],
  "atipSubject": "yes|no|unsure",
  "piaCompleted": "yes|in-progress|no|not-required",

  "hostingType": "azure|aws|gcp|ssc|hybrid|saas|other",
  "hostingRegion": "canada-only|canada-primary|north-america|global|unsure",
  "technologies": ["azure","aws","gcp","active-directory","entra-id","mfa","siem-sentinel","siem-splunk","defender","crowdstrike","intune","key-vault","aws-kms","waf","ssl-tls","pim","backup-azure","github","azure-devops","gc-cse","gc-network","ssc-dc"],
  "otherTech": "string (tech not in list above)",

  "hasAPIs": "exposes|consumes|both|no",
  "gcInterconnections": "yes|no|planned",
  "interconnections": "string (describe interconnections)",
  "mobileAccess": "yes|no|planned",
  "externalUsers": "yes|no|contractors",

  "completedActivities": ["tra","pia","ssp","vapt","network-diagram","previous-sa"],

  "reasoning": "string (brief explanation of your classification rationale)"
}

For piiTypes and technologies, only include values that apply. For completedActivities, include any that are mentioned or implied in the document. Be conservative with classification — only suggest higher levels when the document clearly warrants it.`;

  // Build content blocks — either text or document
  const contentBlocks = [];

  if (base64 && mediaType) {
    if (mediaType === 'application/pdf') {
      contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } });
    } else if (mediaType.startsWith('image/')) {
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
    }
    contentBlocks.push({ type: 'text', text: `Extract SA&A intake form fields from this document (${filename}).` });
  } else if (text) {
    contentBlocks.push({ type: 'text', text: `Extract SA&A intake form fields from this document (${filename}):\n\n${text}` });
  } else {
    throw new Error('No document content provided');
  }

  const result = await callClaude(system, contentBlocks, { maxTokens: 2048 });
  return parseJSON(result);
}

/**
 * From a plain-language project description, suggest form field values.
 */
async function suggestFromDescription(description, securityFramework = 'ITSG-33') {
  const system = `You are an IT security specialist. Given a plain-language project description, suggest appropriate values for ALL sections of a security assessment intake form.

The assessor-selected framework is: ${securityFramework}. For non-ITSG-33 projects, focus on framework-specific baseline/category/applicability and do not default to ITSG-33 or PBMM language unless the project is Canadian federal/GC.

Respond ONLY with a JSON object (no markdown, no explanation). Use null for fields you cannot infer:

{
  "projectName": "string (infer a name if possible)",
  "projectDescription": "string (2-3 sentence summary in formal language)",
  "department": "string (GC department if mentioned)",
  "branch": "string",
  "userCount": "1-50|51-500|501-5000|5001+",
  "appType": "internal|external|hybrid",

  "confidentialityLevel": "unclassified|protected-a|protected-b|protected-c|confidential|secret|top-secret",
  "integrityLevel": "low|medium|high",
  "availabilityLevel": "low|medium|high",
  "isHVA": false,
  "securityFramework": "ITSG-33|CIS Controls v8|ISO/IEC 27001:2022 Annex A|FedRAMP Rev. 5|NIST SP 800-53 Rev. 5|ASD ISM|ACSC Essential Eight",
  "frameworkBaseline": "string",
  "frameworkCategory": "string",
  "frameworkApplicability": "string",
  "piiTypes": ["name-address","sin","financial","health","biometric","employment","immigration","law-enforcement","indigenous","none"],
  "atipSubject": "yes|no|unsure",
  "piaCompleted": "yes|in-progress|no|not-required",

  "hostingType": "azure|aws|gcp|ssc|hybrid|saas|other",
  "hostingRegion": "canada-only|canada-primary|north-america|global|unsure",
  "technologies": ["from: azure,aws,gcp,active-directory,entra-id,mfa,siem-sentinel,siem-splunk,defender,crowdstrike,intune,key-vault,aws-kms,waf,ssl-tls,pim,backup-azure,github,azure-devops,gc-cse,gc-network,ssc-dc"],
  "otherTech": "string (tech not in the list above)",

  "hasAPIs": "exposes|consumes|both|no",
  "gcInterconnections": "yes|no|planned",
  "interconnections": "string (describe any interconnections mentioned)",
  "mobileAccess": "yes|no|planned",
  "externalUsers": "yes|no|contractors",

  "completedActivities": ["tra","pia","ssp","vapt","network-diagram","previous-sa"],

  "reasoning": "2-3 sentences explaining why you chose these classifications and what you inferred"
}

Be thorough — infer values for ALL fields when possible. For PII, consider what data types the described system would logically handle. For technologies, suggest security tools that would typically be used for this type of GC system. For completedActivities, include any mentioned or implied. GC systems handling PII typically need PIA. If the description mentions cloud hosting in Canada, suggest canada-only for data residency.`;

  const result = await callClaude(system, description, { maxTokens: 2048 });
  return parseJSON(result);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN-SIDE AI FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a comprehensive review summary of an intake submission.
 * Returns risk analysis, considerations, and suggested questions.
 */
async function reviewIntake(intake, securityProfileInfo) {
  const system = `You are a senior security assessor conducting a security assessment readiness review. You are reviewing an intake submission to determine readiness for assessment under the selected framework.

Respond ONLY with a JSON object (no markdown):

{
  "summary": "3-4 sentence executive summary of the submission",
  "riskLevel": "low|medium|high|critical",
  "riskFactors": ["array of identified risk factors"],
  "strengths": ["array of positive aspects"],
  "concerns": ["array of concerns or gaps"],
  "profileAssessment": "1-2 sentences on whether the determined security profile seems appropriate",
  "suggestedOverrides": {
    "confidentiality": "null or suggested override value with reason",
    "integrity": "null or suggested override value with reason",
    "availability": "null or suggested override value with reason",
    "isHVA": "null or boolean with reason"
  },
  "questionsForSubmitter": [
    {"question": "string", "reason": "why this question matters"},
    {"question": "string", "reason": "why this question matters"}
  ],
  "recommendations": ["array of recommendations for the assessor"],
  "readinessScore": 1-10
}`;

  const intakeContext = `
INTAKE SUBMISSION:
- Project: ${intake.project_name}
- Description: ${intake.project_description}
- Department: ${intake.department} / ${intake.branch}
- Classification: ${intake.confidentiality_level} / ${intake.integrity_level} integrity / ${intake.availability_level} availability
- Framework / Baseline: ${securityProfileInfo || intake.security_profile || 'Not specified'}
- HVA: ${intake.is_hva ? 'Yes' : 'No'}
- App Type: ${intake.app_type}
- User Count: ${intake.user_count}
- Contains PII: ${intake.has_pii ? 'Yes (' + intake.pii_types + ')' : 'No'}
- Hosting: ${intake.hosting_type} (${intake.hosting_region})
- Technologies: ${intake.technologies}
- Other Tech: ${intake.other_tech || 'None listed'}
- APIs: ${intake.has_apis}
- GC Interconnections: ${intake.gc_interconnections} ${intake.interconnections ? '(' + intake.interconnections + ')' : ''}
- Mobile/BYOD: ${intake.mobile_access}
- External Users: ${intake.external_users}
- ATIP Subject: ${intake.atip_subject}
- PIA Status: ${intake.pia_completed}
- Completed Activities: ${intake.completed_activities}
- Additional Notes: ${intake.additional_notes || 'None'}
- Owner: ${intake.owner_name} (${intake.owner_email})
- Tech Lead: ${intake.tech_lead_name} (${intake.tech_lead_email})
- Authority: ${intake.authority_name || 'Not specified'}`;

  const result = await callClaude(system, intakeContext, { maxTokens: 3000 });
  return parseJSON(result);
}

/**
 * Suggest additional controls beyond the baseline profile.
 */
async function suggestAdditionalControls(intake, currentControlIds, availableControls) {
  const system = `You are a GC IT Security Assessor specializing in ITSG-33 control tailoring. Given a project's context and current control baseline, suggest additional controls from the available catalogue that should be added based on the project's specific risks.

Respond ONLY with a JSON object:

{
  "suggestedControls": [
    {
      "controlId": "e.g. AC-2(12)",
      "reason": "Why this control should be added given the project context",
      "priority": "P1|P2|P3"
    }
  ],
  "controlsToEmphasize": [
    {
      "controlId": "e.g. SC-8",
      "reason": "Why this existing control needs extra attention"
    }
  ],
  "tailoringNotes": "General tailoring guidance for this project"
}`;

  // Build a compact list of available but not-yet-selected controls
  const unselected = availableControls
    .filter(c => !currentControlIds.includes(c.id))
    .map(c => `${c.id}: ${c.title}`)
    .join('\n');

  const userContent = `
PROJECT CONTEXT:
- Name: ${intake.project_name}
- Description: ${intake.project_description}
- Classification: ${intake.confidentiality_level} / ${intake.integrity_level} / ${intake.availability_level}
- Profile: ${intake.security_profile}
- PII: ${intake.has_pii ? intake.pii_types : 'None'}
- APIs: ${intake.has_apis}, Interconnections: ${intake.gc_interconnections} ${intake.interconnections || ''}
- Mobile: ${intake.mobile_access}, External Users: ${intake.external_users}
- Tech: ${intake.technologies} ${intake.other_tech || ''}

CURRENT BASELINE (${currentControlIds.length} controls already selected):
${currentControlIds.join(', ')}

AVAILABLE CONTROLS NOT YET SELECTED:
${unselected}

Suggest controls from the "AVAILABLE" list that should be added. Only suggest controls that are genuinely relevant — do not suggest all of them.`;

  const result = await callClaude(system, userContent, { maxTokens: 2048 });
  return parseJSON(result);
}

/**
 * Generate evidence narrative text for a specific control.
 */
async function generateEvidenceNarrative(control, projectContext) {
  const system = `You are a GC IT Security practitioner writing evidence narratives for an SA&A (Security Assessment & Authorization) assessment. Generate a professional, specific evidence narrative for the given control based on the project context.

The narrative should:
- Be 2-4 paragraphs
- Reference specific technologies mentioned in the project
- Use formal GC security assessment language
- Include what evidence should be collected
- Reference specific configuration details where applicable
- Be ready for an assessor to review and refine

Respond with ONLY the narrative text (no JSON, no markdown headers). Write it as if populating a "Control Implementation Description" field.`;

  const userContent = `
CONTROL: ${control.control_id} — ${control.title}
Description: ${control.description}
Evidence Guidance: ${control.evidence_guidance}

PROJECT CONTEXT:
- Name: ${projectContext.name}
- Description: ${projectContext.description}
- Technologies: ${projectContext.technologies}
- Hosting: ${projectContext.hosting_type}
- Classification: ${projectContext.confidentiality_level} / ${projectContext.integrity_level} / ${projectContext.availability_level}
- Profile: ${projectContext.security_profile}

Write the evidence narrative for this control:`;

  return await callClaude(system, userContent, { maxTokens: 1024});
}

/**
 * Generate evidence narratives for multiple controls in batch.
 */
async function generateBulkEvidence(controls, projectContext) {
  const system = `You are a GC IT Security practitioner writing evidence narratives for an SA&A assessment. Generate a concise evidence narrative (2-3 sentences each) for each of the listed controls.

Respond ONLY with a JSON object mapping control IDs to narratives:
{
  "AC-1": "narrative text...",
  "AC-2": "narrative text..."
}`;

  const controlList = controls.map(c => `- ${c.control_id}: ${c.title} (${c.evidence_guidance})`).join('\n');

  const userContent = `
PROJECT: ${projectContext.name}
Tech: ${projectContext.technologies}
Hosting: ${projectContext.hosting_type}
Classification: ${projectContext.confidentiality_level}/${projectContext.integrity_level}/${projectContext.availability_level}

CONTROLS (generate evidence for each):
${controlList}`;

  const result = await callClaude(system, userContent, { maxTokens: 4096 });
  return parseJSON(result);
}

/**
 * Generate evidence guidance for a control — tells the CLIENT what they need to provide.
 * This is used by the assessor to populate the evidence_guidance field.
 */
async function generateEvidenceGuidance(control, projectContext) {
  const system = `You are a GC IT Security Assessor writing evidence guidance for a client who needs to provide evidence for an ITSG-33 SA&A assessment. Your job is to tell them EXACTLY what documentation, screenshots, configurations, or artifacts they need to provide to demonstrate compliance.

Write clear, actionable guidance that a non-security person can follow. Include:
- Specific documents or artifacts needed (e.g. "Provide the approved Access Control Policy document with version number and approval date")
- Screenshots or exports requested (e.g. "Export Azure AD Conditional Access policies showing MFA enforcement")
- Configuration evidence (e.g. "Provide screenshot of WAF rules from the cloud console")
- Process evidence (e.g. "Provide the incident response runbook and evidence of the last tabletop exercise")
- Reference the project's specific technologies where possible

Format as a concise bulleted list of 3-6 items. Start each with an action verb. Write at a professional but accessible level.
Do NOT write the evidence itself — write what the client needs to PROVIDE.
Respond with ONLY the guidance text, no JSON or markdown headers.`;

  const userContent = `
CONTROL: ${control.control_id} — ${control.title}
Description: ${control.description}

PROJECT CONTEXT:
- Name: ${projectContext.name || 'N/A'}
- Technologies: ${projectContext.technologies || 'N/A'}
- Hosting: ${projectContext.hosting_type || 'N/A'}
- Classification: ${projectContext.confidentiality_level || 'Protected B'} / ${projectContext.integrity_level || 'Medium'} / ${projectContext.availability_level || 'Medium'}
- Profile: ${projectContext.security_profile || 'PBMM'}
${projectContext.documents ? `\nSELECTED PROJECT DOCUMENT EXCERPTS:\n${projectContext.documents}` : ''}

Write evidence guidance for this control:`;

  return await callClaude(system, userContent, { maxTokens: 800 });
}

/** Round-trip test of the currently-bound provider (used by the admin console). */
async function testConnection() {
  const text = await callClaude('You are a connectivity test.', 'Reply with the single word: OK', { maxTokens: 16 });
  return (text || '').trim();
}

module.exports = {
  isConfigured,
  callClaude,
  testConnection,
  parseDocumentForIntake,
  suggestFromDescription,
  reviewIntake,
  suggestAdditionalControls,
  generateEvidenceNarrative,
  generateBulkEvidence,
  generateEvidenceGuidance
};
