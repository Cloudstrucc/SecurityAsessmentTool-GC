/**
 * GC Security Categorization & Profiles Framework
 * 
 * Based on:
 *  - TBS Directive on Security Management, Appendix J (Standard on Security Categorization)
 *  - ITSG-33 Annex 4A Profile 1 (PBMM) and Profile 3 (SMMA)
 *  - CCCS Cloud Security Profiles (Low, Medium, PBHVA overlay)
 *  - ITSP.50.103 Guidance on Security Categorization of Cloud-Based Services
 *
 * Three independent dimensions: Confidentiality × Integrity × Availability
 */

// ══════════════════════════════════════════════════════════════
// CONFIDENTIALITY LEVELS (two tracks: non-national & national interest)
// ══════════════════════════════════════════════════════════════
const CONFIDENTIALITY_LEVELS = {
  'unclassified': {
    label: 'Unclassified',
    shortLabel: 'UC',
    track: 'non-national',
    injuryLevel: 'none',
    order: 0,
    description: 'Information approved for public release, or information where compromise would cause no injury.',
    examples: 'Published reports, public-facing web content, open data, general correspondence not containing sensitive information.',
    badge: 'secondary'
  },
  'protected-a': {
    label: 'Protected A',
    shortLabel: 'PA',
    track: 'non-national',
    injuryLevel: 'low',
    order: 1,
    description: 'Information that, if compromised, could cause limited or minor injury to an individual, organization, or government.',
    examples: 'Employee ID numbers, internal memos with low-sensitivity advice, routine performance feedback, travel claims.',
    badge: 'info'
  },
  'protected-b': {
    label: 'Protected B',
    shortLabel: 'PB',
    track: 'non-national',
    injuryLevel: 'medium',
    order: 2,
    description: 'Information that, if compromised, could cause serious injury to an individual, organization, or government. This is the most common classification for GC systems handling personal information.',
    examples: 'Social Insurance Numbers (SIN), medical records, tax information, immigration files, financial records, law enforcement data, personal information under the Privacy Act.',
    badge: 'warning'
  },
  'protected-c': {
    label: 'Protected C',
    shortLabel: 'PC',
    track: 'non-national',
    injuryLevel: 'high',
    order: 3,
    description: 'Information that, if compromised, could cause extremely grave injury to an individual, organization, or government. Rare — most systems use Protected B.',
    examples: 'Witness protection information, informant identities, information whose compromise could reasonably be expected to cause loss of life.',
    badge: 'danger'
  },
  'confidential': {
    label: 'Confidential',
    shortLabel: 'CONF',
    track: 'national',
    injuryLevel: 'low-national',
    order: 4,
    description: 'Classified information that, if compromised, could cause limited injury to the national interest.',
    examples: 'Diplomatic communications, certain military operational details, intelligence summaries at the lowest classification.',
    badge: 'dark'
  },
  'secret': {
    label: 'Secret',
    shortLabel: 'S',
    track: 'national',
    injuryLevel: 'medium-national',
    order: 5,
    description: 'Classified information that, if compromised, could cause serious injury to the national interest.',
    examples: 'Military plans, intelligence assessments, cryptographic material, covert operations information.',
    badge: 'dark'
  },
  'top-secret': {
    label: 'Top Secret',
    shortLabel: 'TS',
    track: 'national',
    injuryLevel: 'high-national',
    order: 6,
    description: 'Classified information that, if compromised, could cause exceptionally grave injury to the national interest.',
    examples: 'Strategic military intelligence, signals intelligence, information about covert agents, nuclear weapons information.',
    badge: 'dark'
  }
};

// ══════════════════════════════════════════════════════════════
// INTEGRITY & AVAILABILITY LEVELS
// (per TBS Appendix J — 4 levels; ITSG-33 profiles use L/M/H)
// ══════════════════════════════════════════════════════════════
const INTEGRITY_LEVELS = {
  'low': {
    label: 'Low',
    shortLabel: 'L',
    order: 0,
    description: 'A compromise of integrity could cause limited to moderate injury. Minor data corruption is tolerable with manual workarounds.',
    badge: 'success'
  },
  'medium': {
    label: 'Medium',
    shortLabel: 'M',
    order: 1,
    description: 'A compromise of integrity could cause moderate to serious injury. Data must be reliable; unauthorized modification could significantly impact operations or individuals.',
    badge: 'warning'
  },
  'high': {
    label: 'High',
    shortLabel: 'H',
    order: 2,
    description: 'A compromise of integrity could cause serious to very grave injury. Data accuracy is critical — corruption could endanger life, health, safety, or cause severe financial loss.',
    badge: 'danger'
  }
};

const AVAILABILITY_LEVELS = {
  'low': {
    label: 'Low',
    shortLabel: 'L',
    order: 0,
    description: 'Extended outages (days) are tolerable. The service is not time-critical and alternative processes exist.',
    badge: 'success'
  },
  'medium': {
    label: 'Medium',
    shortLabel: 'M',
    order: 1,
    description: 'Service disruptions of more than a few hours could cause moderate to serious injury. The system supports important but not life-critical operations.',
    badge: 'warning'
  },
  'high': {
    label: 'High',
    shortLabel: 'H',
    order: 2,
    description: 'Even brief outages (minutes) could cause serious to very grave injury. The system is mission-critical or supports life/safety functions. Near-continuous availability is required.',
    badge: 'danger'
  }
};

// ══════════════════════════════════════════════════════════════
// SECURITY PROFILES
// Maps categorization combinations to baseline control profiles
// ══════════════════════════════════════════════════════════════
const SECURITY_PROFILES = {
  'NONE': {
    id: 'NONE',
    name: 'No SA&A Required',
    shortName: 'Web Guidance Only',
    description: 'Unclassified static/informational web content with no PII, authentication, or system integrations. A GC Web Standards checklist is provided instead of a formal SA&A.',
    baselineSource: 'GC Web Standards & Security Baseline',
    approxControls: '~48 checklist items',
    requiresSAA: false,
    color: 'secondary'
  },
  'CCCS_LOW': {
    id: 'CCCS_LOW',
    name: 'CCCS Low Cloud Profile',
    shortName: 'PA/L/L',
    description: 'For systems handling Protected A information with low integrity and availability requirements. Previously known as Protected A / Low / Low.',
    baselineSource: 'CCCS Low Cloud Security Control Profile',
    approxControls: '~220 controls',
    requiresSAA: true,
    color: 'info'
  },
  'PBMM': {
    id: 'PBMM',
    name: 'ITSG-33 Profile 1 — Protected B / Medium / Medium',
    shortName: 'PB/M/M (PBMM)',
    description: 'The standard baseline for most GC systems handling Protected B information. This is the most commonly used profile across the Government of Canada. Also aligns with CCCS Medium Cloud Profile.',
    baselineSource: 'ITSG-33 Annex 4A Profile 1 / CCCS Medium Cloud Control Profile',
    approxControls: '~310 controls + enhancements',
    requiresSAA: true,
    color: 'warning'
  },
  'PBMM_HVA': {
    id: 'PBMM_HVA',
    name: 'PBMM + High Value Asset Overlay',
    shortName: 'PB/M/M + HVA',
    description: 'For nationally significant systems handling Protected B data at scale. Adds 69 additional controls on top of PBMM to enhance integrity and availability for high-value assets.',
    baselineSource: 'CCCS Medium + PBHVA Overlay (137 overlay controls, 69 new)',
    approxControls: '~380 controls + enhancements',
    requiresSAA: true,
    color: 'warning'
  },
  'PB_HIGH': {
    id: 'PB_HIGH',
    name: 'Protected B / High Integrity or High Availability',
    shortName: 'PB/H/H',
    description: 'For Protected B systems where integrity and/or availability requirements exceed medium. Starts from PBMM baseline and adds tailored controls for high I/A. Departments must tailor from PBMM — no published CSE profile exists for this combination.',
    baselineSource: 'ITSG-33 PBMM + departmental tailoring (upward)',
    approxControls: '~350+ (tailored)',
    requiresSAA: true,
    color: 'danger'
  },
  'PC_BASELINE': {
    id: 'PC_BASELINE',
    name: 'Protected C Baseline',
    shortName: 'PC (tailored)',
    description: 'For systems handling Protected C information. No published CSE profile — departments must tailor upward from PBMM with enhanced confidentiality controls. Requires departmental ITSC involvement.',
    baselineSource: 'ITSG-33 PBMM + confidentiality tailoring (upward)',
    approxControls: '~380+ (tailored)',
    requiresSAA: true,
    color: 'danger'
  },
  'SECRET_MM': {
    id: 'SECRET_MM',
    name: 'ITSG-33 Profile 3 — Secret / Medium / Medium',
    shortName: 'S/M/M (SMMA)',
    description: 'For systems handling classified Secret information. More restrictive than PBMM with additional controls for national interest protection. Mitigates threat agents up to Td5 level (state-sponsored).',
    baselineSource: 'ITSG-33 Annex 4A Profile 3',
    approxControls: '~380 controls + enhancements',
    requiresSAA: true,
    color: 'dark'
  },
  'CLASSIFIED_HIGH': {
    id: 'CLASSIFIED_HIGH',
    name: 'Classified (Confidential / Secret / Top Secret) — Custom',
    shortName: 'Classified',
    description: 'For classified systems (Confidential, Secret with high I/A, or Top Secret). Requires direct CSE/CCCS engagement. No public profiles exist — departmental security authorities must develop custom profiles with CSE guidance.',
    baselineSource: 'Custom — CSE/CCCS engagement required',
    approxControls: 'Custom',
    requiresSAA: true,
    color: 'dark'
  }
};

// ══════════════════════════════════════════════════════════════
// PROFILE DETERMINATION ENGINE
// Maps C × I × A combinations to the nearest applicable profile
// ══════════════════════════════════════════════════════════════

/**
 * Determine the applicable security profile based on categorization.
 *
 * @param {object} categorization
 * @param {string} categorization.confidentiality - key from CONFIDENTIALITY_LEVELS
 * @param {string} categorization.integrity - key from INTEGRITY_LEVELS
 * @param {string} categorization.availability - key from AVAILABILITY_LEVELS
 * @param {boolean} categorization.hasPII - whether PII is involved
 * @param {boolean} categorization.isHVA - whether this is a High Value Asset
 * @param {boolean} categorization.hasComplexity - whether the system has app complexity
 * @returns {object} { profile, reason, tailoringNotes[] }
 */
function determineProfile(categorization) {
  const {
    confidentiality = 'unclassified',
    integrity = 'medium',
    availability = 'medium',
    hasPII = false,
    isHVA = false,
    hasComplexity = false
  } = categorization;

  const confLevel = CONFIDENTIALITY_LEVELS[confidentiality];
  const intLevel = INTEGRITY_LEVELS[integrity];
  const avaLevel = AVAILABILITY_LEVELS[availability];
  const tailoringNotes = [];

  if (!confLevel || !intLevel || !avaLevel) {
    return { profile: SECURITY_PROFILES.PBMM, reason: 'Invalid categorization — defaulting to PBMM', tailoringNotes: ['Review categorization inputs'] };
  }

  // ── National interest (Classified) ──
  if (confLevel.track === 'national') {
    if (confidentiality === 'secret' && integrity === 'medium' && availability === 'medium') {
      return { profile: SECURITY_PROFILES.SECRET_MM, reason: `Secret / Medium / Medium maps to ITSG-33 Profile 3`, tailoringNotes };
    }
    // All other classified
    tailoringNotes.push('No published CSE profile for this classified combination. Contact CSE/CCCS for guidance.');
    tailoringNotes.push('Department must develop a custom security control profile with CSE involvement.');
    if (confidentiality === 'top-secret') {
      tailoringNotes.push('Top Secret systems require dedicated infrastructure with enhanced physical, personnel, and TEMPEST controls.');
    }
    return { profile: SECURITY_PROFILES.CLASSIFIED_HIGH, reason: `${confLevel.label} classification requires CSE engagement`, tailoringNotes };
  }

  // ── Protected C ──
  if (confidentiality === 'protected-c') {
    tailoringNotes.push('Start from PBMM baseline and tailor upward for enhanced confidentiality.');
    tailoringNotes.push('Add enhanced access controls (AC-3 enhancements), audit (AU-2 enhancements), and encryption (SC-12, SC-13 enhancements).');
    tailoringNotes.push('Consider enhanced personnel security screening (PS-3 enhancements).');
    if (intLevel.order >= 2 || avaLevel.order >= 2) {
      tailoringNotes.push('High integrity/availability combined with Protected C — significant additional controls required.');
    }
    return { profile: SECURITY_PROFILES.PC_BASELINE, reason: `Protected C requires tailored profile above PBMM`, tailoringNotes };
  }

  // ── Protected B ──
  if (confidentiality === 'protected-b') {
    // PB/M/M — standard PBMM
    if (integrity === 'medium' && availability === 'medium') {
      if (isHVA) {
        tailoringNotes.push('High Value Asset overlay adds 69 controls on top of PBMM for enhanced integrity and availability.');
        return { profile: SECURITY_PROFILES.PBMM_HVA, reason: 'Protected B / Medium / Medium + High Value Asset designation', tailoringNotes };
      }
      return { profile: SECURITY_PROFILES.PBMM, reason: 'Protected B / Medium / Medium — standard PBMM profile', tailoringNotes };
    }

    // PB with High I or A
    if (intLevel.order >= 2 || avaLevel.order >= 2) {
      tailoringNotes.push('Start from PBMM baseline and tailor upward for high integrity/availability.');
      if (intLevel.order >= 2) {
        tailoringNotes.push('High integrity: add enhanced input validation (SI-10 enhancements), data integrity checks (SI-7 enhancements), dual authorization (AC-3(2)).');
      }
      if (avaLevel.order >= 2) {
        tailoringNotes.push('High availability: add redundancy controls (CP-6, CP-7 enhancements), load balancing, automated failover (CP-10 enhancements), shorter RPO/RTO targets.');
      }
      return { profile: SECURITY_PROFILES.PB_HIGH, reason: `Protected B with ${intLevel.label} integrity / ${avaLevel.label} availability requires tailored PBMM`, tailoringNotes };
    }

    // PB with Low I or A — still use PBMM but note possible scoping down
    if (intLevel.order <= 0 || avaLevel.order <= 0) {
      tailoringNotes.push('Low integrity/availability with Protected B: PBMM is still the baseline, but some controls may be scoped down through tailoring.');
      tailoringNotes.push('Document justification for any controls removed or reduced from the PBMM baseline.');
      return { profile: SECURITY_PROFILES.PBMM, reason: `Protected B defaults to PBMM; low ${intLevel.order <= 0 ? 'integrity' : 'availability'} allows limited tailoring down`, tailoringNotes };
    }

    // Default PB
    return { profile: SECURITY_PROFILES.PBMM, reason: 'Protected B defaults to PBMM profile', tailoringNotes };
  }

  // ── Protected A ──
  if (confidentiality === 'protected-a') {
    if (integrity === 'low' && availability === 'low') {
      return { profile: SECURITY_PROFILES.CCCS_LOW, reason: 'Protected A / Low / Low — CCCS Low profile', tailoringNotes };
    }
    if (intLevel.order >= 1 || avaLevel.order >= 1) {
      tailoringNotes.push('Protected A with medium+ integrity/availability: use PBMM as baseline with potential confidentiality tailoring down.');
      tailoringNotes.push('The higher of the three dimensions drives profile selection.');
      return { profile: SECURITY_PROFILES.PBMM, reason: `Protected A but ${intLevel.label} integrity / ${avaLevel.label} availability elevates to PBMM baseline`, tailoringNotes };
    }
    return { profile: SECURITY_PROFILES.CCCS_LOW, reason: 'Protected A with low impact — CCCS Low profile', tailoringNotes };
  }

  // ── Unclassified ──
  if (confidentiality === 'unclassified') {
    // PII overrides to at minimum Protected A treatment
    if (hasPII) {
      tailoringNotes.push('PII present in unclassified system — automatically elevated to Protected A minimum treatment.');
      if (intLevel.order >= 1 || avaLevel.order >= 1) {
        return { profile: SECURITY_PROFILES.PBMM, reason: 'Unclassified with PII and medium+ I/A — PBMM baseline', tailoringNotes };
      }
      return { profile: SECURITY_PROFILES.CCCS_LOW, reason: 'Unclassified with PII — minimum CCCS Low profile', tailoringNotes };
    }

    // Complex unclassified apps still need SA&A
    if (hasComplexity) {
      if (intLevel.order >= 1 || avaLevel.order >= 1) {
        tailoringNotes.push('Unclassified but with application complexity and medium+ I/A — SA&A with reduced control set.');
        return { profile: SECURITY_PROFILES.CCCS_LOW, reason: 'Unclassified with application complexity and medium I/A', tailoringNotes };
      }
      tailoringNotes.push('Unclassified with some complexity — basic security controls apply.');
      return { profile: SECURITY_PROFILES.CCCS_LOW, reason: 'Unclassified with application complexity', tailoringNotes };
    }

    // Simple unclassified — no SA&A
    return { profile: SECURITY_PROFILES.NONE, reason: 'Unclassified with no PII, low impact, and no application complexity', tailoringNotes };
  }

  // Fallback
  return { profile: SECURITY_PROFILES.PBMM, reason: 'Defaulting to PBMM — review categorization', tailoringNotes: ['Unable to determine profile — defaulting to PBMM'] };
}

/**
 * Generate a short categorization label like "PB/M/M" from inputs
 */
function categorizationLabel(confidentiality, integrity, availability) {
  const conf = CONFIDENTIALITY_LEVELS[confidentiality];
  const int = INTEGRITY_LEVELS[integrity];
  const ava = AVAILABILITY_LEVELS[availability];
  if (!conf || !int || !ava) return 'Unknown';
  return `${conf.shortLabel}/${int.shortLabel}/${ava.shortLabel}`;
}

/**
 * Generate the full human-readable label
 */
function categorizationFullLabel(confidentiality, integrity, availability) {
  const conf = CONFIDENTIALITY_LEVELS[confidentiality];
  const int = INTEGRITY_LEVELS[integrity];
  const ava = AVAILABILITY_LEVELS[availability];
  if (!conf || !int || !ava) return 'Unknown';
  return `${conf.label} / ${int.label} Integrity / ${ava.label} Availability`;
}

/**
 * Detect application complexity from description
 */
function detectComplexity(description = '') {
  const descLower = description.toLowerCase();
  const indicators = [
    'authentication', 'login', 'user accounts', 'database', 'api',
    'integration', 'payment', 'transaction', 'interconnect', 'saas',
    'portal', 'application', 'app', 'microservices', 'oauth', 'sso',
    'ldap', 'active directory', 'sql', 'nosql', 'redis', 'queue',
    'message broker', 'webhook', 'rest api', 'graphql'
  ];
  return indicators.some(kw => descLower.includes(kw));
}

module.exports = {
  CONFIDENTIALITY_LEVELS,
  INTEGRITY_LEVELS,
  AVAILABILITY_LEVELS,
  SECURITY_PROFILES,
  determineProfile,
  categorizationLabel,
  categorizationFullLabel,
  detectComplexity
};
