#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'config', 'framework-control-data.json');

const SOURCES = {
  nistFull: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog-min.json',
  nistLow: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_LOW-baseline-resolved-profile_catalog-min.json',
  nistModerate: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_MODERATE-baseline-resolved-profile_catalog-min.json',
  nistHigh: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_HIGH-baseline-resolved-profile_catalog-min.json',
  asdIsm: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/main/ISM_catalog.json'
};

const CIS_CONTROLS = [
  ['CIS-01', 'Inventory and Control of Enterprise Assets'],
  ['CIS-02', 'Inventory and Control of Software Assets'],
  ['CIS-03', 'Data Protection'],
  ['CIS-04', 'Secure Configuration of Enterprise Assets and Software'],
  ['CIS-05', 'Account Management'],
  ['CIS-06', 'Access Control Management'],
  ['CIS-07', 'Continuous Vulnerability Management'],
  ['CIS-08', 'Audit Log Management'],
  ['CIS-09', 'Email and Web Browser Protections'],
  ['CIS-10', 'Malware Defenses'],
  ['CIS-11', 'Data Recovery'],
  ['CIS-12', 'Network Infrastructure Management'],
  ['CIS-13', 'Network Monitoring and Defense'],
  ['CIS-14', 'Security Awareness and Skills Training'],
  ['CIS-15', 'Service Provider Management'],
  ['CIS-16', 'Application Software Security'],
  ['CIS-17', 'Incident Response Management'],
  ['CIS-18', 'Penetration Testing']
];

const ESSENTIAL_EIGHT = [
  ['E8-01', 'Application control'],
  ['E8-02', 'Patch applications'],
  ['E8-03', 'Configure Microsoft Office macro settings'],
  ['E8-04', 'User application hardening'],
  ['E8-05', 'Restrict administrative privileges'],
  ['E8-06', 'Patch operating systems'],
  ['E8-07', 'Multi-factor authentication'],
  ['E8-08', 'Regular backups']
];

const ISO_27001_CONTROLS = [
  ['A.5.1', 'Policies for information security', 'A.5 Organizational controls'],
  ['A.5.2', 'Information security roles and responsibilities', 'A.5 Organizational controls'],
  ['A.5.3', 'Segregation of duties', 'A.5 Organizational controls'],
  ['A.5.4', 'Management responsibilities', 'A.5 Organizational controls'],
  ['A.5.5', 'Contact with authorities', 'A.5 Organizational controls'],
  ['A.5.6', 'Contact with special interest groups', 'A.5 Organizational controls'],
  ['A.5.7', 'Threat intelligence', 'A.5 Organizational controls'],
  ['A.5.8', 'Information security in project management', 'A.5 Organizational controls'],
  ['A.5.9', 'Inventory of information and other associated assets', 'A.5 Organizational controls'],
  ['A.5.10', 'Acceptable use of information and other associated assets', 'A.5 Organizational controls'],
  ['A.5.11', 'Return of assets', 'A.5 Organizational controls'],
  ['A.5.12', 'Classification of information', 'A.5 Organizational controls'],
  ['A.5.13', 'Labelling of information', 'A.5 Organizational controls'],
  ['A.5.14', 'Information transfer', 'A.5 Organizational controls'],
  ['A.5.15', 'Access control', 'A.5 Organizational controls'],
  ['A.5.16', 'Identity management', 'A.5 Organizational controls'],
  ['A.5.17', 'Authentication information', 'A.5 Organizational controls'],
  ['A.5.18', 'Access rights', 'A.5 Organizational controls'],
  ['A.5.19', 'Information security in supplier relationships', 'A.5 Organizational controls'],
  ['A.5.20', 'Addressing information security within supplier agreements', 'A.5 Organizational controls'],
  ['A.5.21', 'Managing information security in the ICT supply chain', 'A.5 Organizational controls'],
  ['A.5.22', 'Monitoring, review and change management of supplier services', 'A.5 Organizational controls'],
  ['A.5.23', 'Information security for use of cloud services', 'A.5 Organizational controls'],
  ['A.5.24', 'Information security incident management planning and preparation', 'A.5 Organizational controls'],
  ['A.5.25', 'Assessment and decision on information security events', 'A.5 Organizational controls'],
  ['A.5.26', 'Response to information security incidents', 'A.5 Organizational controls'],
  ['A.5.27', 'Learning from information security incidents', 'A.5 Organizational controls'],
  ['A.5.28', 'Collection of evidence', 'A.5 Organizational controls'],
  ['A.5.29', 'Information security during disruption', 'A.5 Organizational controls'],
  ['A.5.30', 'ICT readiness for business continuity', 'A.5 Organizational controls'],
  ['A.5.31', 'Legal, statutory, regulatory and contractual requirements', 'A.5 Organizational controls'],
  ['A.5.32', 'Intellectual property rights', 'A.5 Organizational controls'],
  ['A.5.33', 'Protection of records', 'A.5 Organizational controls'],
  ['A.5.34', 'Privacy and protection of PII', 'A.5 Organizational controls'],
  ['A.5.35', 'Independent review of information security', 'A.5 Organizational controls'],
  ['A.5.36', 'Compliance with policies, rules and standards for information security', 'A.5 Organizational controls'],
  ['A.5.37', 'Documented operating procedures', 'A.5 Organizational controls'],
  ['A.6.1', 'Screening', 'A.6 People controls'],
  ['A.6.2', 'Terms and conditions of employment', 'A.6 People controls'],
  ['A.6.3', 'Information security awareness, education and training', 'A.6 People controls'],
  ['A.6.4', 'Disciplinary process', 'A.6 People controls'],
  ['A.6.5', 'Responsibilities after termination or change of employment', 'A.6 People controls'],
  ['A.6.6', 'Confidentiality or non-disclosure agreements', 'A.6 People controls'],
  ['A.6.7', 'Remote working', 'A.6 People controls'],
  ['A.6.8', 'Information security event reporting', 'A.6 People controls'],
  ['A.7.1', 'Physical security perimeters', 'A.7 Physical controls'],
  ['A.7.2', 'Physical entry', 'A.7 Physical controls'],
  ['A.7.3', 'Securing offices, rooms and facilities', 'A.7 Physical controls'],
  ['A.7.4', 'Physical security monitoring', 'A.7 Physical controls'],
  ['A.7.5', 'Protecting against physical and environmental threats', 'A.7 Physical controls'],
  ['A.7.6', 'Working in secure areas', 'A.7 Physical controls'],
  ['A.7.7', 'Clear desk and clear screen', 'A.7 Physical controls'],
  ['A.7.8', 'Equipment siting and protection', 'A.7 Physical controls'],
  ['A.7.9', 'Security of assets off-premises', 'A.7 Physical controls'],
  ['A.7.10', 'Storage media', 'A.7 Physical controls'],
  ['A.7.11', 'Supporting utilities', 'A.7 Physical controls'],
  ['A.7.12', 'Cabling security', 'A.7 Physical controls'],
  ['A.7.13', 'Equipment maintenance', 'A.7 Physical controls'],
  ['A.7.14', 'Secure disposal or re-use of equipment', 'A.7 Physical controls'],
  ['A.8.1', 'User endpoint devices', 'A.8 Technological controls'],
  ['A.8.2', 'Privileged access rights', 'A.8 Technological controls'],
  ['A.8.3', 'Information access restriction', 'A.8 Technological controls'],
  ['A.8.4', 'Access to source code', 'A.8 Technological controls'],
  ['A.8.5', 'Secure authentication', 'A.8 Technological controls'],
  ['A.8.6', 'Capacity management', 'A.8 Technological controls'],
  ['A.8.7', 'Protection against malware', 'A.8 Technological controls'],
  ['A.8.8', 'Management of technical vulnerabilities', 'A.8 Technological controls'],
  ['A.8.9', 'Configuration management', 'A.8 Technological controls'],
  ['A.8.10', 'Information deletion', 'A.8 Technological controls'],
  ['A.8.11', 'Data masking', 'A.8 Technological controls'],
  ['A.8.12', 'Data leakage prevention', 'A.8 Technological controls'],
  ['A.8.13', 'Information backup', 'A.8 Technological controls'],
  ['A.8.14', 'Redundancy of information processing facilities', 'A.8 Technological controls'],
  ['A.8.15', 'Logging', 'A.8 Technological controls'],
  ['A.8.16', 'Monitoring activities', 'A.8 Technological controls'],
  ['A.8.17', 'Clock synchronization', 'A.8 Technological controls'],
  ['A.8.18', 'Use of privileged utility programs', 'A.8 Technological controls'],
  ['A.8.19', 'Installation of software on operational systems', 'A.8 Technological controls'],
  ['A.8.20', 'Networks security', 'A.8 Technological controls'],
  ['A.8.21', 'Security of network services', 'A.8 Technological controls'],
  ['A.8.22', 'Segregation of networks', 'A.8 Technological controls'],
  ['A.8.23', 'Web filtering', 'A.8 Technological controls'],
  ['A.8.24', 'Use of cryptography', 'A.8 Technological controls'],
  ['A.8.25', 'Secure development life cycle', 'A.8 Technological controls'],
  ['A.8.26', 'Application security requirements', 'A.8 Technological controls'],
  ['A.8.27', 'Secure system architecture and engineering principles', 'A.8 Technological controls'],
  ['A.8.28', 'Secure coding', 'A.8 Technological controls'],
  ['A.8.29', 'Security testing in development and acceptance', 'A.8 Technological controls'],
  ['A.8.30', 'Outsourced development', 'A.8 Technological controls'],
  ['A.8.31', 'Separation of development, test and production environments', 'A.8 Technological controls'],
  ['A.8.32', 'Change management', 'A.8 Technological controls'],
  ['A.8.33', 'Test information', 'A.8 Technological controls'],
  ['A.8.34', 'Protection of information systems during audit testing', 'A.8 Technological controls']
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`GET ${url} failed with ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function cleanText(value, maxLength = 900) {
  if (!value) return '';
  let text = String(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\{\{\s*insert:\s*param,\s*([^}]+)\}\}/gi, '[$1]')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1).trim()}...`;
  return text;
}

function collectPartText(parts = [], targetNames = [], maxLength = 900) {
  const chunks = [];
  const target = new Set(targetNames);
  function visit(part, active) {
    const nextActive = active || target.has(part.name);
    if (nextActive && part.prose) chunks.push(part.prose);
    (part.parts || []).forEach(child => visit(child, nextActive));
  }
  parts.forEach(part => visit(part, false));
  return cleanText(chunks.join(' '), maxLength);
}

function propValues(item, name) {
  return (item.props || []).filter(prop => prop.name === name).map(prop => prop.value).filter(Boolean);
}

function labelFor(item) {
  return propValues(item, 'label')[0] || item.id || '';
}

function nistId(id) {
  return String(id || '')
    .toUpperCase()
    .replace(/^([A-Z]+)-0?(\d+)\.(\d+)$/, '$1-$2($3)')
    .replace(/^([A-Z]+)-0?(\d+)$/, '$1-$2');
}

function familyPrefix(controlId) {
  return String(controlId || '').split('-')[0];
}

function oscalRowsFromCatalog(catalog, options) {
  const rows = [];

  function visitGroup(group, stack = []) {
    const familyLabel = labelFor(group);
    const nextStack = group.title ? [...stack, cleanText(group.title, 120)] : stack;
    const family = options.familyForGroup ? options.familyForGroup(group, stack, familyLabel) : (familyLabel || nextStack[0] || '');
    const category = options.categoryForGroup ? options.categoryForGroup(group, nextStack) : nextStack.filter(Boolean).slice(-2).join(' / ');

    (group.controls || []).forEach(control => visitControl(control, { family, category, stack: nextStack }));
    (group.groups || []).forEach(child => visitGroup(child, nextStack));
  }

  function visitControl(control, context) {
    const rawId = options.controlId ? options.controlId(control) : (labelFor(control) || control.id);
    const controlId = cleanText(rawId, 80);
    if (!controlId) return;
    const title = cleanText(control.title || controlId, 220);
    const statement = collectPartText(control.parts, ['statement'], 1000);
    const guidance = collectPartText(control.parts, ['guidance', 'overview'], 1000);
    const applicability = propValues(control, 'applicability').join(', ');
    const row = {
      framework: options.framework,
      control_id: controlId,
      title,
      family: context.family || familyPrefix(controlId),
      description: statement || `${title}.`,
      guidance,
      definitions: options.definitions ? options.definitions(control) : `Source OSCAL id: ${control.id || controlId}`,
      related_controls: propValues(control, 'related').join(', '),
      baseline: options.baseline ? options.baseline(controlId, control) : '',
      category: context.category || '',
      applicability_notes: options.applicability
        ? options.applicability(controlId, control, applicability)
        : applicability,
      status: 'active'
    };
    rows.push(row);
    (control.controls || []).forEach(child => visitControl(child, context));
  }

  (catalog.groups || []).forEach(group => visitGroup(group, []));
  return rows;
}

function controlIdSet(catalog) {
  const ids = new Set();
  oscalRowsFromCatalog(catalog, {
    framework: 'tmp',
    controlId: control => nistId(control.id),
    familyForGroup: group => labelFor(group)
  }).forEach(row => ids.add(row.control_id));
  return ids;
}

function staticRows() {
  const cis = CIS_CONTROLS.map(([controlId, title]) => ({
    framework: 'CIS Controls v8',
    control_id: controlId,
    title,
    family: 'CIS Critical Security Controls',
    description: `${title}. CIS Controls v8 control-level catalog entry.`,
    guidance: 'Use the official CIS Controls safeguard guidance and Implementation Groups to tailor expected evidence.',
    definitions: 'Control-level CIS Controls v8 metadata; safeguards are referenced from the official CIS publication.',
    related_controls: '',
    baseline: 'Implementation Groups 1, 2, 3',
    category: 'Prioritized cybersecurity actions',
    applicability_notes: 'Commonly used across North America and globally for prioritized cyber hygiene programs.',
    status: 'active'
  }));

  const e8 = ESSENTIAL_EIGHT.map(([controlId, title]) => ({
    framework: 'ACSC Essential Eight',
    control_id: controlId,
    title,
    family: 'Essential Eight',
    description: `${title}. Essential Eight mitigation strategy catalog entry.`,
    guidance: 'Use ACSC maturity levels one through three to tailor evidence expectations for this mitigation strategy.',
    definitions: 'High-level Essential Eight mitigation strategy.',
    related_controls: '',
    baseline: 'Maturity Levels 1, 2, 3',
    category: 'Australian baseline cyber mitigation strategy',
    applicability_notes: 'Applicable to Australian organizations and other environments adopting ACSC guidance.',
    status: 'active'
  }));

  const iso = ISO_27001_CONTROLS.map(([controlId, title, family]) => ({
    framework: 'ISO/IEC 27001:2022 Annex A',
    control_id: controlId,
    title,
    family,
    description: `${title}. ISO/IEC 27001:2022 Annex A control identifier and title.`,
    guidance: 'Use the licensed ISO/IEC standard, statement of applicability, risk treatment plan, and internal procedures to determine exact control requirements and evidence.',
    definitions: 'Control identifier and title only; normative ISO text is not redistributed by this application.',
    related_controls: '',
    baseline: 'Annex A',
    category: family.replace(/^A\.\d+\s*/, ''),
    applicability_notes: 'Commonly used for information security management systems in Europe, North America, Australia, and global supply chains.',
    status: 'active'
  }));

  return [...cis, ...e8, ...iso];
}

async function main() {
  const [nistFull, nistLow, nistModerate, nistHigh, asdIsm] = await Promise.all([
    fetchJson(SOURCES.nistFull),
    fetchJson(SOURCES.nistLow),
    fetchJson(SOURCES.nistModerate),
    fetchJson(SOURCES.nistHigh),
    fetchJson(SOURCES.asdIsm)
  ]);

  const lowIds = controlIdSet(nistLow.catalog);
  const moderateIds = controlIdSet(nistModerate.catalog);
  const highIds = controlIdSet(nistHigh.catalog);

  const nistRows = oscalRowsFromCatalog(nistFull.catalog, {
    framework: 'NIST SP 800-53 Rev. 5',
    controlId: control => nistId(control.id),
    familyForGroup: group => `${labelFor(group)} - ${cleanText(group.title || labelFor(group), 120)}`,
    baseline: () => 'Full control catalog',
    applicability: () => 'U.S. federal and widely adopted North American security control catalog.',
    definitions: control => `Source: NIST OSCAL SP 800-53 Rev. 5; OSCAL id: ${control.id || ''}`
  });

  const fullRowById = new Map(nistRows.map(row => [row.control_id, row]));
  const fedrampRows = Array.from(highIds).sort().map(controlId => {
    const base = fullRowById.get(controlId) || {};
    const memberships = [];
    if (lowIds.has(controlId)) memberships.push('Low');
    if (moderateIds.has(controlId)) memberships.push('Moderate');
    if (highIds.has(controlId)) memberships.push('High');
    return {
      ...base,
      framework: 'FedRAMP Rev. 5',
      control_id: controlId,
      baseline: memberships.join(', '),
      category: base.category || 'FedRAMP security baseline',
      applicability_notes: 'FedRAMP Rev. 5 aligned baseline membership derived from NIST SP 800-53 Rev. 5 OSCAL low, moderate, and high baselines. Review FedRAMP-specific parameters and agency authorization guidance before use.',
      definitions: `FedRAMP baseline membership: ${memberships.join(', ')}; NIST OSCAL source control.`
    };
  });

  const ismRows = oscalRowsFromCatalog(asdIsm.catalog, {
    framework: 'ASD ISM',
    controlId: control => labelFor(control) || control.id,
    familyForGroup: (group, stack) => cleanText(stack[1] || group.title || 'ISM', 120),
    categoryForGroup: (group, stack) => stack.filter(Boolean).slice(-3).join(' / '),
    baseline: () => 'Full ISM catalog',
    applicability: (controlId, control, applicability) => applicability || 'Australian ISM applicability should be tailored by classification and risk context.',
    definitions: control => `Source: ACSC ISM OSCAL; OSCAL id: ${control.id || ''}`
  });

  const rows = [...staticRows(), ...nistRows, ...fedrampRows, ...ismRows]
    .map(row => ({
      framework: row.framework,
      control_id: row.control_id,
      title: cleanText(row.title, 240),
      family: cleanText(row.family, 160),
      description: cleanText(row.description, 1000),
      guidance: cleanText(row.guidance, 1000),
      definitions: cleanText(row.definitions, 500),
      related_controls: cleanText(row.related_controls, 500),
      baseline: cleanText(row.baseline, 160),
      category: cleanText(row.category, 240),
      applicability_notes: cleanText(row.applicability_notes, 500),
      status: row.status || 'active'
    }))
    .sort((a, b) => `${a.framework} ${a.control_id}`.localeCompare(`${b.framework} ${b.control_id}`));

  const unique = new Set();
  const duplicates = [];
  rows.forEach(row => {
    const key = `${row.framework}::${row.control_id}`;
    if (unique.has(key)) duplicates.push(key);
    unique.add(key);
  });
  if (duplicates.length) {
    throw new Error(`Duplicate framework controls generated: ${duplicates.slice(0, 5).join(', ')}`);
  }

  const output = {
    sources: SOURCES,
    notes: [
      'Generated from public machine-readable OSCAL sources where available.',
      'CIS and ISO entries intentionally include control identifiers/titles and conservative metadata only; consult official licensed publications for normative text.'
    ],
    controls: rows
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated ${rows.length} framework controls at ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
