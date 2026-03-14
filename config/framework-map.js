// ═══════════════════════════════════════════════════════════════════════════════
// Framework Mapping — Maps country + gov level to applicable security frameworks
// Also defines baseline self-assessment questions (static, no API needed)
// Used by self-assessment wizard and admin intake review
// ═══════════════════════════════════════════════════════════════════════════════

const frameworkMap = {
  'CA-federal':    { primary: 'ITSG-33', others: ['CCCS Baseline', 'PBMM', 'TBS Directives', 'Privacy Impact Assessment'] },
  'CA-state':      { primary: 'Provincial Standards', others: ['ITSG-33 (recommended)', 'CCCS Baseline', 'FIPPA / PIPEDA'] },
  'CA-municipal':  { primary: 'Municipal IT Policy', others: ['CCCS Baseline', 'PIPEDA', 'Provincial Privacy Act'] },
  'CA-private':    { primary: 'PIPEDA', others: ['CCCS Baseline', 'CIS Controls', 'SOC 2'] },
  'CA-health':     { primary: 'PHIPA / Provincial Health', others: ['ITSG-33 (recommended)', 'CCCS Baseline', 'PIPEDA'] },
  'CA-finance':    { primary: 'OSFI B-13', others: ['PIPEDA', 'CCCS Baseline', 'CIS Controls', 'SOC 2'] },
  'US-federal':    { primary: 'NIST SP 800-53', others: ['FedRAMP', 'FISMA', 'FIPS 199/200'] },
  'US-state':      { primary: 'NIST CSF', others: ['State Privacy Laws', 'CIS Controls', 'CJIS (if law enforcement)'] },
  'US-municipal':  { primary: 'NIST CSF', others: ['CIS Controls', 'State Requirements'] },
  'US-private':    { primary: 'NIST CSF', others: ['SOC 2', 'CCPA / State Privacy', 'CIS Controls'] },
  'US-health':     { primary: 'HIPAA Security Rule', others: ['NIST SP 800-66', 'HITECH', 'SOC 2'] },
  'US-finance':    { primary: 'FFIEC / GLBA', others: ['NIST CSF', 'SOC 2', 'PCI DSS (if card data)'] },
  'UK-federal':    { primary: 'NCSC CAF', others: ['Cyber Essentials Plus', 'UK GDPR', 'GDS Standards'] },
  'UK-state':      { primary: 'NCSC CAF', others: ['Cyber Essentials', 'UK GDPR'] },
  'UK-municipal':  { primary: 'Cyber Essentials', others: ['UK GDPR', 'NCSC Guidance'] },
  'UK-private':    { primary: 'Cyber Essentials', others: ['UK GDPR', 'ISO 27001', 'SOC 2'] },
  'UK-health':     { primary: 'NHS DSPT', others: ['NCSC CAF', 'UK GDPR', 'Cyber Essentials'] },
  'UK-finance':    { primary: 'FCA / PRA', others: ['DORA', 'UK GDPR', 'ISO 27001'] },
  'AU-federal':    { primary: 'ISM (ASD)', others: ['Essential Eight', 'PSPF', 'IRAP'] },
  'AU-state':      { primary: 'ISM (ASD)', others: ['Essential Eight', 'State Cyber Policy'] },
  'AU-municipal':  { primary: 'Essential Eight', others: ['ISM (ASD)', 'State Requirements'] },
  'AU-private':    { primary: 'Essential Eight', others: ['Privacy Act 1988', 'ISO 27001', 'CIS Controls'] },
  'AU-health':     { primary: 'ISM (ASD)', others: ['My Health Records Act', 'Essential Eight', 'IRAP'] },
  'AU-finance':    { primary: 'CPS 234 (APRA)', others: ['Essential Eight', 'ISM (ASD)', 'Privacy Act 1988'] },
  'EU-federal':    { primary: 'NIS2 Directive', others: ['GDPR', 'ISO 27001', 'ENISA Guidelines'] },
  'EU-state':      { primary: 'NIS2 Directive', others: ['GDPR', 'National Cyber Strategy'] },
  'EU-municipal':  { primary: 'NIS2 Directive', others: ['GDPR', 'National Requirements'] },
  'EU-private':    { primary: 'GDPR', others: ['NIS2 (if essential/important)', 'ISO 27001', 'SOC 2'] },
  'EU-health':     { primary: 'GDPR (Health Data)', others: ['NIS2', 'EHDS (proposed)', 'ISO 27001'] },
  'EU-finance':    { primary: 'DORA', others: ['GDPR', 'NIS2', 'EBA Guidelines', 'PSD2'] },
};

const countryNames = {
  CA: 'Canada', US: 'United States', UK: 'United Kingdom',
  AU: 'Australia', EU: 'European Union', OTHER: 'International'
};

const govLevelNames = {
  federal: 'Federal', state: 'State / Provincial', municipal: 'Municipal / Local',
  private: 'Private Sector', health: 'Healthcare', finance: 'Financial Services'
};

const sensitivityNames = {
  public: 'Public / Unclassified', low: 'Low Sensitivity',
  medium: 'Medium (Personal Info)', high: 'High (Protected B / PII)',
  classified: 'Classified / Secret'
};

function getFrameworks(country, govLevel, sensitivity) {
  const key = `${country}-${govLevel}`;
  const fw = frameworkMap[key] || frameworkMap[`${country}-private`] || { primary: 'ISO 27001', others: ['CIS Controls', 'Local Regulations'] };
  const all = [fw.primary, ...fw.others];
  if (sensitivity === 'high' || sensitivity === 'classified') {
    if (country === 'CA' && !all.includes('Protected B Controls')) all.push('Protected B Controls');
    if (country === 'US' && !all.includes('FIPS 199 High')) all.push('FIPS 199 High');
    if (country === 'AU' && !all.includes('IRAP')) all.push('IRAP');
  }
  return { primary: fw.primary, others: fw.others, all };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BASELINE SELF-ASSESSMENT QUESTIONS
//  These are served statically — no API call needed.
//  The AI is only called for system-specific delta questions.
// ═══════════════════════════════════════════════════════════════════════════════

// Universal baseline — applies to all jurisdictions/system types
const baselineQuestions = [
  {
    title: 'Identity & Access Management',
    icon: 'bi-key',
    frameworkRef: 'AC · IA',
    questions: [
      { type: 'checkbox', text: 'Users must sign in before accessing the system', hint: 'Login required with username/password or Single Sign-On' },
      { type: 'checkbox', text: 'Two-step verification (MFA) is required for users', hint: 'e.g. code from an app, text message, or security key' },
      { type: 'checkbox', text: 'Administrator accounts have additional protections', hint: 'Admins use MFA, separate accounts, or privileged access management' },
      { type: 'checkbox', text: 'Different users have different permission levels', hint: 'Not everyone has full admin access — roles are assigned' },
      { type: 'select', text: 'How strong is your password policy?', options: ['No policy', 'Basic (8+ characters)', 'Strong (12+ characters with complexity)', 'Passwordless (passkeys / certificates)'] },
      { type: 'checkbox', text: 'User access is reviewed periodically', hint: 'Quarterly or annual review of who has access and what permissions' },
    ]
  },
  {
    title: 'Data Protection & Privacy',
    icon: 'bi-lock',
    frameworkRef: 'SC · MP',
    questions: [
      { type: 'checkbox', text: 'Connections to the system are encrypted (HTTPS)', hint: 'The address bar shows a padlock — data can\'t be intercepted in transit' },
      { type: 'checkbox', text: 'Stored data is encrypted (database, files)', hint: 'Even if someone accesses the server, data is scrambled and unreadable' },
      { type: 'checkbox', text: 'You know which data fields contain personal information', hint: 'Names, emails, addresses, IDs, health info — each is identified and labelled' },
      { type: 'select', text: 'Where is the data physically stored?', options: ['Same country only', 'Same country + one other', 'Multiple countries', 'Unknown'] },
      { type: 'checkbox', text: 'There are rules for how long data is kept and when it\'s deleted', hint: 'A documented data retention and disposal policy' },
    ]
  },
  {
    title: 'System & Network Security',
    icon: 'bi-hdd-network',
    frameworkRef: 'SI · SC',
    questions: [
      { type: 'checkbox', text: 'A firewall or web application firewall protects the system', hint: 'Blocks malicious traffic before it reaches your application' },
      { type: 'checkbox', text: 'Software updates and security patches are applied regularly', hint: 'Critical patches installed within 30 days of release' },
      { type: 'checkbox', text: 'Automated security scanning checks for known vulnerabilities', hint: 'Scans run at least monthly to find weaknesses' },
      { type: 'select', text: 'Where is the system hosted?', options: ['On-premises (own data centre)', 'Shared hosting provider', 'Certified cloud (AWS/Azure/GCP)', 'Managed / Platform-as-a-Service', 'Unknown'] },
    ]
  },
  {
    title: 'Monitoring & Incident Response',
    icon: 'bi-graph-up',
    frameworkRef: 'AU · IR',
    questions: [
      { type: 'checkbox', text: 'The system records who does what and when (audit logs)', hint: 'Login attempts, data changes, admin actions are tracked' },
      { type: 'checkbox', text: 'Alerts are triggered when something suspicious happens', hint: 'e.g. failed login attempts, unusual data access, system changes' },
      { type: 'checkbox', text: 'There is a documented plan for responding to security incidents', hint: 'Who to contact, how to contain a breach, communication plan' },
      { type: 'checkbox', text: 'The incident response plan has been tested in the past year', hint: 'Tabletop exercise, simulation, or real incident review' },
      { type: 'checkbox', text: 'Backups are performed regularly and tested', hint: 'Automated backups with periodic restore testing' },
    ]
  },
  {
    title: 'Governance, Policy & Awareness',
    icon: 'bi-file-earmark-ruled',
    frameworkRef: 'PL · AT · SA',
    questions: [
      { type: 'checkbox', text: 'A security policy or acceptable use policy exists and is communicated', hint: '' },
      { type: 'checkbox', text: 'Staff receive security awareness training at least once a year', hint: 'Recognizing phishing, safe password practices, reporting incidents' },
      { type: 'checkbox', text: 'Third-party vendors and integrations are assessed for security risk', hint: 'Plugins, APIs, SaaS tools, hosting providers reviewed before use' },
      { type: 'select', text: 'When was the last security assessment?', options: ['Never assessed', 'Over 12 months ago', 'Within the last 12 months', 'Currently authorized'] },
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
//  JURISDICTION-SPECIFIC OVERLAY QUESTIONS
//  Added on top of the baseline when the user selects a specific jurisdiction.
//  Keyed by country or country-govLevel.
// ═══════════════════════════════════════════════════════════════════════════════

const jurisdictionOverlays = {
  // ── Canada ──
  'CA': [
    { group: 'Data Protection & Privacy', frameworkRef: 'PIA · Privacy Act',
      questions: [
        { type: 'checkbox', text: 'A Privacy Impact Assessment (PIA) has been completed', hint: 'Required under Canadian federal/provincial privacy legislation for systems handling personal data' },
      ]
    },
    { group: 'System & Network Security', frameworkRef: 'CCCS',
      questions: [
        { type: 'select', text: 'Where is the data physically stored?', replace: true, options: ['Canada only', 'Canada + US', 'Multiple countries', 'Unknown'] },
      ]
    },
  ],
  'CA-federal': [
    { group: 'System & Network Security', frameworkRef: 'ITSG-33 · PBMM',
      questions: [
        { type: 'checkbox', text: 'The system is on a GC-approved or certified cloud platform', hint: 'e.g. Azure Canada, AWS GovCloud Canada, or an accredited data centre' },
      ]
    },
    { group: 'Governance, Policy & Awareness', frameworkRef: 'ITSG-33 CA-6 · TBS',
      questions: [
        { type: 'checkbox', text: 'An Authorizing Official (AO) or senior executive is accountable for security', hint: 'Someone with authority has formally accepted the risk of operating this system' },
        { type: 'select', text: 'When was the last security assessment?', replace: true, options: ['Never assessed', 'Over 12 months ago', 'Within the last 12 months', 'Currently authorized (ATO)'] },
      ]
    },
  ],

  // ── United States ──
  'US-federal': [
    { group: 'Identity & Access Management', frameworkRef: 'NIST IA',
      questions: [
        { type: 'checkbox', text: 'PIV / CAC cards or FIDO2 tokens are used for privileged access', hint: 'HSPD-12 compliant identity verification for federal systems' },
      ]
    },
    { group: 'System & Network Security', frameworkRef: 'FedRAMP',
      questions: [
        { type: 'checkbox', text: 'The cloud provider has a FedRAMP authorization', hint: 'FedRAMP Authorized or In Process for the service used' },
      ]
    },
    { group: 'Governance, Policy & Awareness', frameworkRef: 'FISMA',
      questions: [
        { type: 'select', text: 'FISMA system categorization', options: ['Not categorized', 'Low', 'Moderate', 'High'] },
        { type: 'checkbox', text: 'An Authorizing Official (AO) has issued an ATO', hint: 'Formal risk acceptance by a senior official' },
      ]
    },
  ],
  'US-health': [
    { group: 'Data Protection & Privacy', frameworkRef: 'HIPAA',
      questions: [
        { type: 'checkbox', text: 'A HIPAA Security Risk Assessment has been completed', hint: 'Required annually for covered entities and business associates' },
        { type: 'checkbox', text: 'Business Associate Agreements (BAAs) are in place with all vendors', hint: 'Required for any vendor handling protected health information (PHI)' },
        { type: 'checkbox', text: 'Minimum necessary access is enforced for health records', hint: 'Staff only access the PHI needed for their job function' },
      ]
    },
  ],
  'US-finance': [
    { group: 'Data Protection & Privacy', frameworkRef: 'PCI DSS · GLBA',
      questions: [
        { type: 'checkbox', text: 'Payment card data is handled in a PCI-compliant environment', hint: 'PCI DSS applies if you store, process, or transmit cardholder data' },
        { type: 'checkbox', text: 'Customer financial data privacy notices are provided (GLBA)', hint: 'Gramm-Leach-Bliley Act requires privacy notices for financial institutions' },
      ]
    },
  ],

  // ── United Kingdom ──
  'UK': [
    { group: 'Data Protection & Privacy', frameworkRef: 'UK GDPR',
      questions: [
        { type: 'checkbox', text: 'A Data Protection Impact Assessment (DPIA) has been completed', hint: 'Required under UK GDPR for high-risk processing activities' },
        { type: 'checkbox', text: 'A Data Protection Officer (DPO) has been designated if required', hint: 'Mandatory for public authorities and certain types of processing' },
      ]
    },
  ],
  'UK-health': [
    { group: 'Governance, Policy & Awareness', frameworkRef: 'NHS DSPT',
      questions: [
        { type: 'checkbox', text: 'The organisation meets the NHS Data Security and Protection Toolkit standards', hint: 'Annual self-assessment required for NHS and social care organisations' },
      ]
    },
  ],
  'UK-finance': [
    { group: 'Governance, Policy & Awareness', frameworkRef: 'DORA · FCA',
      questions: [
        { type: 'checkbox', text: 'ICT risk management framework is documented and tested', hint: 'Required under DORA for financial entities in the UK/EU' },
        { type: 'checkbox', text: 'Critical third-party ICT providers are identified and monitored', hint: 'DORA requires oversight of cloud and IT service providers' },
      ]
    },
  ],

  // ── Australia ──
  'AU': [
    { group: 'System & Network Security', frameworkRef: 'Essential Eight',
      questions: [
        { type: 'select', text: 'Essential Eight maturity level for application control', options: ['Not implemented', 'Level 1', 'Level 2', 'Level 3'] },
        { type: 'checkbox', text: 'Macro execution is restricted in Microsoft Office', hint: 'Essential Eight mitigation strategy for malware prevention' },
      ]
    },
  ],
  'AU-federal': [
    { group: 'System & Network Security', frameworkRef: 'ISM · IRAP',
      questions: [
        { type: 'checkbox', text: 'The system has completed an IRAP assessment', hint: 'Independent assessment by an IRAP Assessor for government systems' },
        { type: 'checkbox', text: 'The cloud service is listed on the ASD Certified Cloud Services List', hint: 'Required for Australian Government classified workloads' },
      ]
    },
  ],
  'AU-health': [
    { group: 'Data Protection & Privacy', frameworkRef: 'My Health Records Act',
      questions: [
        { type: 'checkbox', text: 'My Health Record access controls comply with the Act', hint: 'Strict controls on who can access digital health records' },
      ]
    },
  ],

  // ── European Union ──
  'EU': [
    { group: 'Data Protection & Privacy', frameworkRef: 'GDPR',
      questions: [
        { type: 'checkbox', text: 'A Data Protection Impact Assessment (DPIA) has been completed', hint: 'Required under GDPR for high-risk processing of personal data' },
        { type: 'checkbox', text: 'Data processing agreements are in place with all processors', hint: 'Article 28 GDPR requires written contracts with data processors' },
        { type: 'checkbox', text: 'A Data Protection Officer (DPO) has been designated if required', hint: 'Mandatory for public authorities and large-scale processing' },
        { type: 'checkbox', text: 'Data subjects can exercise their rights (access, deletion, portability)', hint: 'GDPR Articles 15-22 require mechanisms for data subject requests' },
      ]
    },
  ],
  'EU-finance': [
    { group: 'Governance, Policy & Awareness', frameworkRef: 'DORA',
      questions: [
        { type: 'checkbox', text: 'ICT risk management framework is documented per DORA requirements', hint: 'Digital Operational Resilience Act applies to all EU financial entities' },
        { type: 'checkbox', text: 'ICT incident reporting procedures are in place', hint: 'DORA requires major ICT incidents to be reported to competent authorities' },
        { type: 'checkbox', text: 'Digital operational resilience testing is performed regularly', hint: 'Including threat-led penetration testing for significant entities' },
      ]
    },
  ],

  // ── Sensitivity overlays (applied on top) ──
  '_high-sensitivity': [
    { group: 'Data Protection & Privacy', frameworkRef: 'Enhanced Controls',
      questions: [
        { type: 'checkbox', text: 'Database-level or column-level encryption is applied to sensitive fields', hint: 'Beyond TLS in transit — data encrypted where it is stored' },
        { type: 'checkbox', text: 'Access to sensitive data is logged and auditable', hint: 'Who accessed what record and when — with tamper-proof logs' },
      ]
    },
    { group: 'Identity & Access Management', frameworkRef: 'Enhanced Controls',
      questions: [
        { type: 'checkbox', text: 'Privileged access requires approval workflow or just-in-time access', hint: 'Admin rights are not persistent — elevated only when needed' },
      ]
    },
  ],
};

/**
 * Build the complete question set for a given jurisdiction and sensitivity.
 * Returns the baseline questions merged with applicable overlays.
 * No API call needed.
 */
function getBaselineQuestions(country, govLevel, sensitivity) {
  // Deep clone the baseline
  const questions = JSON.parse(JSON.stringify(baselineQuestions));

  // Collect applicable overlays (most general → most specific)
  const overlayKeys = [];
  if (country) overlayKeys.push(country);                      // e.g. 'CA'
  if (country && govLevel) overlayKeys.push(`${country}-${govLevel}`); // e.g. 'CA-federal'
  if (sensitivity === 'high' || sensitivity === 'classified') {
    overlayKeys.push('_high-sensitivity');
  }

  // Apply each overlay
  overlayKeys.forEach(key => {
    const overlays = jurisdictionOverlays[key];
    if (!overlays) return;

    overlays.forEach(overlay => {
      // Find the matching group in baseline
      const group = questions.find(g => g.title === overlay.group);
      if (!group) return;

      // Update framework ref to include overlay's ref
      if (overlay.frameworkRef && !group.frameworkRef.includes(overlay.frameworkRef)) {
        group.frameworkRef += ' · ' + overlay.frameworkRef;
      }

      overlay.questions.forEach(oq => {
        if (oq.replace) {
          // Replace an existing question that matches (by text start)
          const idx = group.questions.findIndex(q => q.text.startsWith(oq.text.substring(0, 20)));
          if (idx >= 0) {
            group.questions[idx] = { ...group.questions[idx], ...oq };
            delete group.questions[idx].replace;
          } else {
            group.questions.push(oq);
          }
        } else {
          // Add if not already present (check by text)
          const exists = group.questions.some(q => q.text === oq.text);
          if (!exists) {
            group.questions.push(oq);
          }
        }
      });
    });
  });

  return questions;
}

module.exports = {
  frameworkMap, countryNames, govLevelNames, sensitivityNames,
  getFrameworks, getBaselineQuestions, baselineQuestions, jurisdictionOverlays
};