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
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const API_KEY = () => process.env.ANTHROPIC_API_KEY || '';

function isConfigured() {
  return !!API_KEY();
}

/**
 * Core API call to Anthropic Messages API
 * userContent can be a string or an array of content blocks
 */
async function callClaude(system, userContent, { maxTokens = 4096, temperature = 0.3 } = {}) {
  if (!isConfigured()) {
    throw new Error('ANTHROPIC_API_KEY not configured. Set it in your environment variables or .env file.');
  }

  // Support both simple string and array of content blocks
  const content = typeof userContent === 'string'
    ? [{ type: 'text', text: userContent }]
    : userContent;

  const messages = [{ role: 'user', content }];

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY(),
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return data.content[0].text;
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
async function parseDocumentForIntake({ text, base64, mediaType, filename }) {
  const system = `You are a Government of Canada IT security specialist helping project owners fill out an SA&A (Security Assessment & Authorization) intake form. You extract information from project documents to pre-populate the intake form.

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
async function suggestFromDescription(description) {
  const system = `You are a Government of Canada IT security specialist. Given a plain-language project description, suggest appropriate values for ALL sections of an SA&A intake form. Consider data sensitivity, system complexity, GC classification requirements, and ITSG-33 profiles.

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
  const system = `You are a senior Government of Canada IT Security Assessor conducting an SA&A (Security Assessment & Authorization) review. You are reviewing an intake submission to determine readiness for assessment.

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
- Security Profile: ${intake.security_profile} ${securityProfileInfo || ''}
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

  return await callClaude(system, userContent, { maxTokens: 1024, temperature: 0.4 });
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

  const result = await callClaude(system, userContent, { maxTokens: 4096, temperature: 0.4 });
  return parseJSON(result);
}

module.exports = {
  isConfigured,
  callClaude,
  parseDocumentForIntake,
  suggestFromDescription,
  reviewIntake,
  suggestAdditionalControls,
  generateEvidenceNarrative,
  generateBulkEvidence
};
