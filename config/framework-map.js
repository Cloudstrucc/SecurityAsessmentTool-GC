const frameworkMap = {
  'CA-federal': { primary: 'ITSG-33', others: ['CCCS Baseline', 'PBMM', 'TBS Directive on Security Management'] },
  'CA-state': { primary: 'Provincial security standards', others: ['CCCS Baseline', 'PIPEDA / provincial privacy acts'] },
  'CA-municipal': { primary: 'Municipal cyber policy', others: ['CCCS Baseline', 'PIPEDA'] },
  'CA-private': { primary: 'PIPEDA', others: ['CIS Controls v8', 'ISO/IEC 27001:2022 Annex A', 'SOC 2'] },
  'CA-health': { primary: 'Provincial health privacy law', others: ['CCCS Baseline', 'ISO/IEC 27001:2022 Annex A'] },
  'CA-finance': { primary: 'OSFI B-13', others: ['CIS Controls v8', 'ISO/IEC 27001:2022 Annex A'] },
  'US-federal': { primary: 'NIST SP 800-53 Rev. 5', others: ['FedRAMP Rev. 5', 'FISMA', 'FIPS 199/200'] },
  'US-state': { primary: 'NIST Cybersecurity Framework', others: ['CIS Controls v8', 'state privacy laws'] },
  'US-municipal': { primary: 'NIST Cybersecurity Framework', others: ['CIS Controls v8', 'state requirements'] },
  'US-private': { primary: 'CIS Controls v8', others: ['NIST Cybersecurity Framework', 'SOC 2', 'ISO/IEC 27001:2022 Annex A'] },
  'US-health': { primary: 'HIPAA Security Rule', others: ['NIST SP 800-66', 'CIS Controls v8'] },
  'US-finance': { primary: 'GLBA / FFIEC', others: ['NIST Cybersecurity Framework', 'CIS Controls v8'] },
  'UK-federal': { primary: 'NCSC CAF', others: ['Cyber Essentials Plus', 'UK GDPR'] },
  'UK-state': { primary: 'NCSC CAF', others: ['Cyber Essentials', 'UK GDPR'] },
  'UK-municipal': { primary: 'Cyber Essentials', others: ['NCSC guidance', 'UK GDPR'] },
  'UK-private': { primary: 'Cyber Essentials', others: ['ISO/IEC 27001:2022 Annex A', 'UK GDPR'] },
  'UK-health': { primary: 'NHS DSPT', others: ['NCSC CAF', 'UK GDPR'] },
  'UK-finance': { primary: 'FCA / PRA cyber expectations', others: ['DORA', 'ISO/IEC 27001:2022 Annex A'] },
  'AU-federal': { primary: 'ASD ISM', others: ['ACSC Essential Eight', 'PSPF', 'IRAP'] },
  'AU-state': { primary: 'ASD ISM', others: ['ACSC Essential Eight', 'state cyber policy'] },
  'AU-municipal': { primary: 'ACSC Essential Eight', others: ['ASD ISM', 'state cyber policy'] },
  'AU-private': { primary: 'ACSC Essential Eight', others: ['Privacy Act 1988', 'ISO/IEC 27001:2022 Annex A'] },
  'AU-health': { primary: 'ASD ISM', others: ['ACSC Essential Eight', 'My Health Records Act'] },
  'AU-finance': { primary: 'APRA CPS 234', others: ['ACSC Essential Eight', 'ASD ISM'] },
  'EU-federal': { primary: 'NIS2 Directive', others: ['GDPR', 'ISO/IEC 27001:2022 Annex A', 'ENISA guidance'] },
  'EU-state': { primary: 'NIS2 Directive', others: ['GDPR', 'national cyber strategy'] },
  'EU-municipal': { primary: 'NIS2 Directive', others: ['GDPR', 'national requirements'] },
  'EU-private': { primary: 'ISO/IEC 27001:2022 Annex A', others: ['GDPR', 'NIS2 where applicable', 'CIS Controls v8'] },
  'EU-health': { primary: 'GDPR health-data requirements', others: ['NIS2', 'ISO/IEC 27001:2022 Annex A'] },
  'EU-finance': { primary: 'DORA', others: ['GDPR', 'NIS2', 'ISO/IEC 27001:2022 Annex A'] },
  'OTHER-private': { primary: 'ISO/IEC 27001:2022 Annex A', others: ['CIS Controls v8', 'local privacy/security requirements'] }
};

const countryNames = {
  CA: 'Canada',
  US: 'United States',
  UK: 'United Kingdom',
  AU: 'Australia',
  EU: 'European Union',
  OTHER: 'International / Other'
};

const govLevelNames = {
  federal: 'Federal government',
  state: 'State / provincial',
  municipal: 'Municipal / local',
  private: 'Private sector',
  health: 'Healthcare',
  finance: 'Financial services'
};

const sensitivityNames = {
  public: 'Public / unclassified',
  low: 'Low sensitivity',
  medium: 'Medium sensitivity / personal information',
  high: 'High sensitivity / Protected B / regulated data',
  classified: 'Classified / secret'
};

const baselineQuestions = [
  {
    title: 'Identity and Access',
    icon: 'bi-key',
    frameworkRef: 'AC / IA',
    questions: [
      { type: 'checkbox', text: 'Users must sign in before accessing the system.', hint: 'Includes SSO, username/password, or federated sign-in.' },
      { type: 'checkbox', text: 'Multi-factor authentication is required for users.', hint: 'Authenticator app, passkey, security key, or equivalent.' },
      { type: 'checkbox', text: 'Administrative accounts have stronger protections than normal users.', hint: 'Separate admin accounts, privileged access workflows, or approvals.' },
      { type: 'checkbox', text: 'User access is reviewed periodically.', hint: 'Quarterly or annual reviews are typical.' }
    ]
  },
  {
    title: 'Data Protection and Privacy',
    icon: 'bi-lock',
    frameworkRef: 'SC / MP / Privacy',
    questions: [
      { type: 'checkbox', text: 'The system encrypts connections using HTTPS/TLS.', hint: 'Data is protected in transit.' },
      { type: 'checkbox', text: 'Sensitive data is encrypted while stored.', hint: 'Database, file storage, and backup encryption.' },
      { type: 'checkbox', text: 'Personal or regulated data elements are known and documented.', hint: 'Names, emails, health, financial, or other sensitive data.' },
      { type: 'select', text: 'Where is the data physically stored?', options: ['Same country only', 'Same country plus limited failover', 'Multiple countries', 'Unknown'] }
    ]
  },
  {
    title: 'System and Network Security',
    icon: 'bi-hdd-network',
    frameworkRef: 'CM / SI / SC',
    questions: [
      { type: 'checkbox', text: 'Software updates and security patches are applied on a defined schedule.', hint: 'Especially critical and high severity updates.' },
      { type: 'checkbox', text: 'Vulnerability scanning is performed regularly.', hint: 'Automated scanning, cloud posture scans, or penetration testing.' },
      { type: 'checkbox', text: 'Network or application-layer protections are in place.', hint: 'Firewall, WAF, private endpoints, segmentation, or equivalent.' },
      { type: 'select', text: 'Where is the system hosted?', options: ['Certified cloud', 'Managed SaaS', 'On premises', 'Hybrid', 'Unknown'] }
    ]
  },
  {
    title: 'Monitoring and Incident Response',
    icon: 'bi-activity',
    frameworkRef: 'AU / IR',
    questions: [
      { type: 'checkbox', text: 'Security-relevant events are logged.', hint: 'Authentication, admin actions, data access, configuration changes.' },
      { type: 'checkbox', text: 'Logs are reviewed or monitored for suspicious activity.', hint: 'SIEM, alerting, managed SOC, or manual review.' },
      { type: 'checkbox', text: 'An incident response plan exists.', hint: 'Roles, escalation contacts, containment steps, communications.' },
      { type: 'checkbox', text: 'Backups are performed and restore testing has been done.', hint: 'Useful for ransomware and availability recovery.' }
    ]
  },
  {
    title: 'Governance and Assurance',
    icon: 'bi-file-earmark-check',
    frameworkRef: 'PL / CA / RA',
    questions: [
      { type: 'checkbox', text: 'A security policy or acceptable-use policy exists.', hint: 'Policies are approved and communicated.' },
      { type: 'checkbox', text: 'Security roles and responsibilities are assigned.', hint: 'System owner, technical owner, assessor, operations support.' },
      { type: 'checkbox', text: 'Third-party vendors or integrations are assessed for risk.', hint: 'SaaS, APIs, hosting providers, managed services.' },
      { type: 'select', text: 'When was the last security assessment?', options: ['Never assessed', 'Over 12 months ago', 'Within the last 12 months', 'Currently authorized'] }
    ]
  }
];

const jurisdictionOverlays = {
  'CA-federal': [
    { group: 'Governance and Assurance', frameworkRef: 'ITSG-33 / TBS', questions: [
      { type: 'checkbox', text: 'An authorizing official or senior executive is accountable for risk acceptance.', hint: 'Required for a formal authorization decision.' },
      { type: 'checkbox', text: 'A Privacy Impact Assessment has been completed or formally triaged.', hint: 'Needed when personal information is processed.' }
    ] }
  ],
  'US-federal': [
    { group: 'Governance and Assurance', frameworkRef: 'FISMA / FedRAMP', questions: [
      { type: 'select', text: 'FIPS 199 impact level', options: ['Not categorized', 'Low', 'Moderate', 'High'] },
      { type: 'checkbox', text: 'A FedRAMP authorized cloud service is used for cloud hosting.', hint: 'Applicable to federal cloud services.' }
    ] }
  ],
  AU: [
    { group: 'System and Network Security', frameworkRef: 'Essential Eight', questions: [
      { type: 'select', text: 'Target Essential Eight maturity level', options: ['Not selected', 'Maturity Level 1', 'Maturity Level 2', 'Maturity Level 3'] },
      { type: 'checkbox', text: 'MFA is enforced for privileged users, remote access, and important repositories.', hint: 'Core Essential Eight expectation.' }
    ] }
  ],
  EU: [
    { group: 'Data Protection and Privacy', frameworkRef: 'GDPR / NIS2', questions: [
      { type: 'checkbox', text: 'A data protection impact assessment has been completed where required.', hint: 'Needed for high-risk processing.' },
      { type: 'checkbox', text: 'Incident notification responsibilities and timelines are documented.', hint: 'Relevant to GDPR and NIS2 obligations.' }
    ] }
  ]
};

function getFrameworks(country, govLevel, sensitivity) {
  const key = `${country}-${govLevel}`;
  const selected = frameworkMap[key] || frameworkMap[`${country}-private`] || frameworkMap['OTHER-private'];
  const all = [selected.primary, ...selected.others];
  if (sensitivity === 'high' || sensitivity === 'classified') {
    if (country === 'CA' && !all.includes('Protected B controls')) all.push('Protected B controls');
    if (country === 'US' && !all.includes('High impact baseline')) all.push('High impact baseline');
    if (country === 'AU' && !all.includes('IRAP')) all.push('IRAP');
  }
  return { primary: selected.primary, others: selected.others, all };
}

function mergeQuestions(country, govLevel) {
  const groups = JSON.parse(JSON.stringify(baselineQuestions));
  const overlays = [
    ...(jurisdictionOverlays[country] || []),
    ...(jurisdictionOverlays[`${country}-${govLevel}`] || [])
  ];
  overlays.forEach(overlay => {
    let group = groups.find(item => item.title === overlay.group);
    if (!group) {
      group = { title: overlay.group, icon: 'bi-list-check', frameworkRef: overlay.frameworkRef, questions: [] };
      groups.push(group);
    }
    group.questions.push(...overlay.questions.map(q => ({ ...q, frameworkRef: overlay.frameworkRef })));
  });
  return groups;
}

module.exports = {
  frameworkMap,
  countryNames,
  govLevelNames,
  sensitivityNames,
  baselineQuestions,
  jurisdictionOverlays,
  getFrameworks,
  mergeQuestions
};
