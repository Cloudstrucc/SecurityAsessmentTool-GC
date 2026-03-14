// ═══════════════════════════════════════════════════════════════════════════════
// Framework Mapping — Maps country + gov level to applicable security frameworks
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
  
  // Add sensitivity-based extras
  if (sensitivity === 'high' || sensitivity === 'classified') {
    if (country === 'CA' && !all.includes('Protected B Controls')) all.push('Protected B Controls');
    if (country === 'US' && !all.includes('FIPS 199 High')) all.push('FIPS 199 High');
    if (country === 'AU' && !all.includes('IRAP')) all.push('IRAP');
  }
  
  return { primary: fw.primary, others: fw.others, all };
}

module.exports = { frameworkMap, countryNames, govLevelNames, sensitivityNames, getFrameworks };
