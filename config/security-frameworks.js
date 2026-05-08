const DEFAULT_FRAMEWORK = 'ITSG-33';

const FRAMEWORK_METADATA = {
  'ITSG-33': {
    label: 'ITSG-33 / GC SA&A',
    description: 'Government of Canada C/I/A categorization with ITSG-33 security profiles.',
    usesCia: true,
    baselineLabel: 'Security profile',
    categoryLabel: 'C/I/A categorization',
    applicabilityLabel: 'Tailoring context',
    baselineOptions: [
      { value: 'PBMM', label: 'PBMM - Protected B / Medium / Medium' },
      { value: 'CCCS_LOW', label: 'CCCS Low Cloud Profile' },
      { value: 'PBMM_HVA', label: 'PBMM + High Value Asset overlay' },
      { value: 'PB_HIGH', label: 'Protected B with high integrity or availability' },
      { value: 'PC_BASELINE', label: 'Protected C tailored baseline' },
      { value: 'SECRET_MM', label: 'Secret / Medium / Medium' },
      { value: 'CLASSIFIED_HIGH', label: 'Classified custom profile' },
      { value: 'NONE', label: 'No formal SA&A - GC web guidance only' }
    ],
    categoryOptions: [
      { value: 'cia', label: 'Use confidentiality / integrity / availability' }
    ]
  },
  'CIS Controls v8': {
    label: 'CIS Controls v8',
    description: 'Prioritized cyber hygiene controls organized by CIS Implementation Groups.',
    baselineLabel: 'Implementation Group',
    categoryLabel: 'Control emphasis',
    applicabilityLabel: 'Environment / override notes',
    baselineOptions: [
      { value: 'IG1', label: 'Implementation Group 1 - essential cyber hygiene' },
      { value: 'IG2', label: 'Implementation Group 2 - enterprise program' },
      { value: 'IG3', label: 'Implementation Group 3 - mature / high-risk enterprise' }
    ],
    categoryOptions: [
      { value: 'all', label: 'All CIS Controls' },
      { value: 'asset-management', label: 'Asset and software inventory' },
      { value: 'data-protection', label: 'Data protection and recovery' },
      { value: 'identity-access', label: 'Identity and access management' },
      { value: 'operations', label: 'Vulnerability, logging, monitoring, response' },
      { value: 'application-security', label: 'Application security and penetration testing' }
    ]
  },
  'ISO/IEC 27001:2022 Annex A': {
    label: 'ISO/IEC 27001:2022 Annex A',
    description: 'Information security management system controls grouped by Annex A domain.',
    baselineLabel: 'Statement of Applicability scope',
    categoryLabel: 'Annex A domain',
    applicabilityLabel: 'Risk treatment / SoA override notes',
    baselineOptions: [
      { value: 'annex-a', label: 'Full Annex A control set' },
      { value: 'risk-treatment', label: 'Risk-treatment selected controls' },
      { value: 'soa-custom', label: 'Custom Statement of Applicability' }
    ],
    categoryOptions: [
      { value: 'all', label: 'All Annex A domains' },
      { value: 'A.5 Organizational controls', label: 'A.5 Organizational controls' },
      { value: 'A.6 People controls', label: 'A.6 People controls' },
      { value: 'A.7 Physical controls', label: 'A.7 Physical controls' },
      { value: 'A.8 Technological controls', label: 'A.8 Technological controls' }
    ]
  },
  'FedRAMP Rev. 5': {
    label: 'FedRAMP Rev. 5',
    description: 'FedRAMP Rev. 5 low, moderate, and high baseline controls.',
    baselineLabel: 'FedRAMP baseline',
    categoryLabel: 'Authorization context',
    applicabilityLabel: 'Agency / cloud service override notes',
    baselineOptions: [
      { value: 'Low', label: 'Low baseline' },
      { value: 'Moderate', label: 'Moderate baseline' },
      { value: 'High', label: 'High baseline' }
    ],
    categoryOptions: [
      { value: 'agency-ato', label: 'Agency ATO' },
      { value: 'cloud-service-provider', label: 'Cloud service provider package' },
      { value: 'federal-moderate', label: 'Federal moderate impact system' },
      { value: 'federal-high', label: 'Federal high impact system' }
    ]
  },
  'NIST SP 800-53 Rev. 5': {
    label: 'NIST SP 800-53 Rev. 5',
    description: 'NIST control catalog with low, moderate, high, privacy, and custom tailoring support.',
    baselineLabel: 'Control baseline',
    categoryLabel: 'System impact / overlay',
    applicabilityLabel: 'Overlay and tailoring notes',
    baselineOptions: [
      { value: 'Low', label: 'Low impact baseline' },
      { value: 'Moderate', label: 'Moderate impact baseline' },
      { value: 'High', label: 'High impact baseline' },
      { value: 'Full control catalog', label: 'Full control catalog' },
      { value: 'Privacy', label: 'Privacy controls / overlay' }
    ],
    categoryOptions: [
      { value: 'fips-low', label: 'FIPS 199 Low' },
      { value: 'fips-moderate', label: 'FIPS 199 Moderate' },
      { value: 'fips-high', label: 'FIPS 199 High' },
      { value: 'privacy', label: 'Privacy program overlay' },
      { value: 'custom', label: 'Custom organizational overlay' }
    ]
  },
  'ASD ISM': {
    label: 'ASD Information Security Manual',
    description: 'Australian Signals Directorate ISM controls by classification and applicability.',
    baselineLabel: 'ISM classification',
    categoryLabel: 'Control area',
    applicabilityLabel: 'Classification / risk override notes',
    baselineOptions: [
      { value: 'NC', label: 'Non-classified' },
      { value: 'OS', label: 'Official: Sensitive' },
      { value: 'P', label: 'Protected' },
      { value: 'S', label: 'Secret' },
      { value: 'TS', label: 'Top Secret' }
    ],
    categoryOptions: [
      { value: 'all', label: 'All applicable ISM controls' },
      { value: 'Guidelines for Cyber Security Roles', label: 'Cyber security roles' },
      { value: 'Guidelines for Security Documentation', label: 'Security documentation' },
      { value: 'Guidelines for System Hardening', label: 'System hardening' },
      { value: 'Guidelines for Access Control', label: 'Access control' },
      { value: 'Guidelines for Cryptography', label: 'Cryptography' },
      { value: 'Guidelines for Operations Security', label: 'Operations security' }
    ]
  },
  'ACSC Essential Eight': {
    label: 'ACSC Essential Eight',
    description: 'Australian baseline mitigation strategies organized by maturity level.',
    baselineLabel: 'Target maturity level',
    categoryLabel: 'Mitigation focus',
    applicabilityLabel: 'Operating environment / exception notes',
    baselineOptions: [
      { value: 'ML1', label: 'Maturity Level 1' },
      { value: 'ML2', label: 'Maturity Level 2' },
      { value: 'ML3', label: 'Maturity Level 3' }
    ],
    categoryOptions: [
      { value: 'all', label: 'All Essential Eight strategies' },
      { value: 'prevent', label: 'Prevent malware delivery and execution' },
      { value: 'limit', label: 'Limit incident impact' },
      { value: 'recover', label: 'Recover data and availability' }
    ]
  }
};

function normalizeFramework(value) {
  if (!value) return DEFAULT_FRAMEWORK;
  const text = String(value).trim();
  return FRAMEWORK_METADATA[text] ? text : DEFAULT_FRAMEWORK;
}

function isItsgFramework(value) {
  return normalizeFramework(value) === DEFAULT_FRAMEWORK;
}

function frameworkMetadata(value) {
  const id = normalizeFramework(value);
  return { id, ...FRAMEWORK_METADATA[id] };
}

function frameworkOptions(availableFrameworks = []) {
  const available = availableFrameworks.map(item => typeof item === 'string' ? item : item.framework).filter(Boolean);
  const ids = Array.from(new Set([DEFAULT_FRAMEWORK, ...available.filter(id => FRAMEWORK_METADATA[id])]));
  return ids.map(id => frameworkMetadata(id));
}

function defaultBaseline(framework) {
  const meta = frameworkMetadata(framework);
  return meta.baselineOptions?.[0]?.value || '';
}

function defaultCategory(framework) {
  const meta = frameworkMetadata(framework);
  return meta.categoryOptions?.[0]?.value || '';
}

function buildFrameworkSummary(record = {}) {
  const framework = normalizeFramework(record.security_framework || record.securityFramework);
  if (isItsgFramework(framework)) {
    return `ITSG-33 profile ${record.security_profile || record.securityProfile || 'PBMM'}; C/I/A ${record.confidentiality_level || record.confidentialityLevel || record.data_classification || 'protected-b'} / ${record.integrity_level || record.integrityLevel || 'medium'} / ${record.availability_level || record.availabilityLevel || 'medium'}`;
  }
  const meta = frameworkMetadata(framework);
  return `${meta.label}; ${meta.baselineLabel}: ${record.framework_baseline || record.frameworkBaseline || defaultBaseline(framework)}; ${meta.categoryLabel}: ${record.framework_category || record.frameworkCategory || defaultCategory(framework)}; notes: ${record.framework_applicability || record.frameworkApplicability || record.framework_category_overrides || record.frameworkCategoryOverrides || 'none'}`;
}

module.exports = {
  DEFAULT_FRAMEWORK,
  FRAMEWORK_METADATA,
  normalizeFramework,
  isItsgFramework,
  frameworkMetadata,
  frameworkOptions,
  defaultBaseline,
  defaultCategory,
  buildFrameworkSummary
};
