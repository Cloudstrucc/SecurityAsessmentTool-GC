/**
 * ITSG-33 Security Controls Catalog
 * Based on Government of Canada ITSG-33 (Annex 3A) aligned with NIST SP 800-53
 * Profile: Protected B, Medium Integrity, Medium Availability (PBMM)
 * 
 * Each control includes:
 * - id: Unique control identifier
 * - family: Control family code
 * - familyName: Full family name
 * - title: Control title
 * - description: Standard control description
 * - priority: P1 (highest), P2, P3
 * - profile: Which profiles require this (PBMM, etc.)
 * - commonInheritance: Technologies that commonly satisfy this control
 * - evidenceGuidance: What evidence is typically required
 * - tags: Keywords for matching
 */

const CONTROL_FAMILIES = {
  AC: 'Access Control',
  AT: 'Awareness and Training',
  AU: 'Audit and Accountability',
  CA: 'Security Assessment and Authorization',
  CM: 'Configuration Management',
  CP: 'Contingency Planning',
  IA: 'Identification and Authentication',
  IR: 'Incident Response',
  MA: 'Maintenance',
  MP: 'Media Protection',
  PE: 'Physical and Environmental Protection',
  PL: 'Planning',
  PS: 'Personnel Security',
  RA: 'Risk Assessment',
  SA: 'System and Services Acquisition',
  SC: 'System and Communications Protection',
  SI: 'System and Information Integrity',
  PM: 'Program Management'
};

const COMMON_TECHNOLOGIES = {
  'active-directory': { name: 'Active Directory', vendor: 'Microsoft', type: 'identity' },
  'entra-id': { name: 'Microsoft Entra ID (Azure AD)', vendor: 'Microsoft', type: 'identity' },
  'azure': { name: 'Microsoft Azure', vendor: 'Microsoft', type: 'cloud' },
  'aws': { name: 'Amazon Web Services', vendor: 'Amazon', type: 'cloud' },
  'gcp': { name: 'Google Cloud Platform', vendor: 'Google', type: 'cloud' },
  'ibm-cloud': { name: 'IBM Cloud', vendor: 'IBM', type: 'cloud' },
  'ssc-dc': { name: 'SSC Data Centre', vendor: 'SSC', type: 'on-premises' },
  'gc-network': { name: 'GC Network (GCNet)', vendor: 'SSC', type: 'network' },
  'siem-splunk': { name: 'Splunk SIEM', vendor: 'Splunk', type: 'monitoring' },
  'siem-sentinel': { name: 'Microsoft Sentinel', vendor: 'Microsoft', type: 'monitoring' },
  'defender': { name: 'Microsoft Defender', vendor: 'Microsoft', type: 'endpoint' },
  'crowdstrike': { name: 'CrowdStrike Falcon', vendor: 'CrowdStrike', type: 'endpoint' },
  'intune': { name: 'Microsoft Intune', vendor: 'Microsoft', type: 'mdm' },
  'github': { name: 'GitHub Enterprise', vendor: 'GitHub', type: 'devops' },
  'azure-devops': { name: 'Azure DevOps', vendor: 'Microsoft', type: 'devops' },
  'key-vault': { name: 'Azure Key Vault', vendor: 'Microsoft', type: 'secrets' },
  'aws-kms': { name: 'AWS KMS', vendor: 'Amazon', type: 'secrets' },
  'waf': { name: 'Web Application Firewall', vendor: 'Various', type: 'network' },
  'ssl-tls': { name: 'TLS 1.2/1.3', vendor: 'Standard', type: 'encryption' },
  'mfa': { name: 'Multi-Factor Authentication', vendor: 'Various', type: 'identity' },
  'pim': { name: 'Privileged Identity Management', vendor: 'Microsoft', type: 'identity' },
  'backup-azure': { name: 'Azure Backup', vendor: 'Microsoft', type: 'backup' },
  'gc-cse': { name: 'CSE/CCCS Services', vendor: 'CSE', type: 'monitoring' }
};

const CONTROLS = [
  // ═══════════════════════════════════════
  // AC - ACCESS CONTROL
  // ═══════════════════════════════════════
  {
    id: 'AC-1',
    family: 'AC',
    title: 'Access Control Policy and Procedures',
    description: 'The organization develops, documents, and disseminates an access control policy and procedures that address purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['active-directory', 'entra-id'],
    evidenceGuidance: 'Provide the documented access control policy, evidence of review/approval cycle, and distribution records.',
    tags: ['policy', 'procedures', 'access-control', 'governance']
  },
  {
    id: 'AC-2',
    family: 'AC',
    title: 'Account Management',
    description: 'The organization manages information system accounts including identifying, creating, enabling, modifying, disabling, and removing accounts in accordance with organizational policy.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['active-directory', 'entra-id'],
    evidenceGuidance: 'Provide account provisioning/deprovisioning procedures, screenshots of account management workflows, evidence of periodic account reviews.',
    tags: ['accounts', 'provisioning', 'lifecycle', 'identity']
  },
  {
    id: 'AC-2(1)',
    family: 'AC',
    title: 'Account Management | Automated System Account Management',
    description: 'The organization employs automated mechanisms to support the management of information system accounts.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide screenshots/configuration of automated account lifecycle management, integration with HR systems, automated disable/removal workflows.',
    tags: ['automation', 'accounts', 'lifecycle']
  },
  {
    id: 'AC-2(4)',
    family: 'AC',
    title: 'Account Management | Automated Audit Actions',
    description: 'The information system automatically audits account creation, modification, enabling, disabling, and removal actions.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide audit log samples showing account lifecycle events, SIEM alert configurations for account changes.',
    tags: ['audit', 'accounts', 'monitoring', 'logging']
  },
  {
    id: 'AC-3',
    family: 'AC',
    title: 'Access Enforcement',
    description: 'The information system enforces approved authorizations for logical access to information and system resources in accordance with applicable access control policies.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory', 'azure', 'aws'],
    evidenceGuidance: 'Provide RBAC configuration, access control lists, group policy settings, application-level authorization configurations.',
    tags: ['rbac', 'authorization', 'enforcement', 'permissions']
  },
  {
    id: 'AC-4',
    family: 'AC',
    title: 'Information Flow Enforcement',
    description: 'The information system enforces approved authorizations for controlling the flow of information within the system and between interconnected systems.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'gc-network', 'waf'],
    evidenceGuidance: 'Provide network security group configurations, firewall rules, data flow diagrams showing enforcement points, DLP configurations.',
    tags: ['network', 'flow', 'firewall', 'segmentation', 'dlp']
  },
  {
    id: 'AC-5',
    family: 'AC',
    title: 'Separation of Duties',
    description: 'The organization separates duties of individuals as necessary, to prevent malevolent activity without collusion, and documents separation of duties.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory', 'pim'],
    evidenceGuidance: 'Provide role matrix showing separation of duties, evidence of incompatible role restrictions, PIM configuration for privileged roles.',
    tags: ['separation-of-duties', 'roles', 'privileged']
  },
  {
    id: 'AC-6',
    family: 'AC',
    title: 'Least Privilege',
    description: 'The organization employs the principle of least privilege, allowing only authorized accesses for users which are necessary to accomplish assigned tasks.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory', 'pim', 'azure'],
    evidenceGuidance: 'Provide evidence of least privilege implementation including role assignments, just-in-time access configurations, and privilege escalation procedures.',
    tags: ['least-privilege', 'roles', 'jit', 'privileged']
  },
  {
    id: 'AC-6(1)',
    family: 'AC',
    title: 'Least Privilege | Authorize Access to Security Functions',
    description: 'The organization explicitly authorizes access to security-relevant functions and security-relevant information.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'pim'],
    evidenceGuidance: 'Provide list of security functions, authorized personnel for each function, and access approval records.',
    tags: ['security-functions', 'authorization', 'privileged']
  },
  {
    id: 'AC-6(5)',
    family: 'AC',
    title: 'Least Privilege | Privileged Accounts',
    description: 'The organization restricts privileged accounts on the information system to a defined set of personnel or roles.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'pim', 'active-directory'],
    evidenceGuidance: 'Provide list of privileged accounts, role holders, approval records, and periodic review evidence.',
    tags: ['privileged-accounts', 'admin', 'restricted']
  },
  {
    id: 'AC-7',
    family: 'AC',
    title: 'Unsuccessful Logon Attempts',
    description: 'The information system enforces a limit of consecutive invalid logon attempts by a user during a defined time period and automatically locks the account or delays next logon prompt.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide lockout policy configuration screenshots, testing evidence of lockout behavior.',
    tags: ['lockout', 'logon', 'brute-force', 'authentication']
  },
  {
    id: 'AC-8',
    family: 'AC',
    title: 'System Use Notification',
    description: 'The information system displays an approved system use notification message or banner before granting access providing privacy and security notices.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide screenshots of login banners/notices, the approved banner text, and configuration evidence.',
    tags: ['banner', 'notification', 'login', 'warning']
  },
  {
    id: 'AC-11',
    family: 'AC',
    title: 'Session Lock',
    description: 'The information system prevents further access to the system by initiating a session lock after a defined period of inactivity.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: ['active-directory', 'intune'],
    evidenceGuidance: 'Provide session timeout configuration, group policy or MDM settings showing lock timeout values.',
    tags: ['session', 'timeout', 'lock', 'inactivity']
  },
  {
    id: 'AC-12',
    family: 'AC',
    title: 'Session Termination',
    description: 'The information system automatically terminates a user session after defined conditions.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'azure'],
    evidenceGuidance: 'Provide session management configuration, token lifetime policies, and idle timeout settings.',
    tags: ['session', 'termination', 'timeout']
  },
  {
    id: 'AC-14',
    family: 'AC',
    title: 'Permitted Actions Without Identification or Authentication',
    description: 'The organization identifies specific user actions that can be performed without identification or authentication and documents supporting rationale.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide documentation listing actions permitted without auth (e.g., public-facing pages) and justification.',
    tags: ['anonymous', 'unauthenticated', 'public']
  },
  {
    id: 'AC-17',
    family: 'AC',
    title: 'Remote Access',
    description: 'The organization establishes and documents usage restrictions, configuration requirements, and implementation guidance for each type of remote access allowed.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'gc-network'],
    evidenceGuidance: 'Provide remote access policy, VPN/conditional access configurations, MFA requirements for remote access.',
    tags: ['remote', 'vpn', 'telework', 'conditional-access']
  },
  {
    id: 'AC-17(1)',
    family: 'AC',
    title: 'Remote Access | Automated Monitoring / Control',
    description: 'The information system monitors and controls remote access methods.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'siem-sentinel', 'gc-network'],
    evidenceGuidance: 'Provide remote access monitoring configuration, alerting rules for anomalous remote access, conditional access policies.',
    tags: ['remote', 'monitoring', 'automated']
  },
  {
    id: 'AC-18',
    family: 'AC',
    title: 'Wireless Access',
    description: 'The organization establishes usage restrictions, configuration requirements, and implementation guidance for wireless access.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['gc-network'],
    evidenceGuidance: 'Provide wireless access policy, SSID configurations, encryption settings (WPA3/WPA2-Enterprise), and network segmentation evidence.',
    tags: ['wireless', 'wifi', 'network']
  },
  {
    id: 'AC-20',
    family: 'AC',
    title: 'Use of External Information Systems',
    description: 'The organization establishes terms and conditions for authorized individuals to access the system from external information systems.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id'],
    evidenceGuidance: 'Provide policy on BYOD/external systems, conditional access policies restricting external device access, device compliance requirements.',
    tags: ['external', 'byod', 'third-party']
  },
  {
    id: 'AC-22',
    family: 'AC',
    title: 'Publicly Accessible Content',
    description: 'The organization designates individuals authorized to post information onto a publicly accessible system and reviews the content for nonpublic information.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide list of authorized content publishers, content review procedures, and evidence of periodic review of public content.',
    tags: ['public-content', 'website', 'disclosure']
  },

  // ═══════════════════════════════════════
  // AT - AWARENESS AND TRAINING
  // ═══════════════════════════════════════
  {
    id: 'AT-1',
    family: 'AT',
    title: 'Security Awareness and Training Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a security awareness and training policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the documented security awareness policy, training plan, and evidence of approval.',
    tags: ['policy', 'training', 'awareness']
  },
  {
    id: 'AT-2',
    family: 'AT',
    title: 'Security Awareness Training',
    description: 'The organization provides basic security awareness training to information system users as part of initial training and when required by system changes.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide training completion records, training materials/curriculum, evidence of annual refresher training.',
    tags: ['training', 'awareness', 'users']
  },
  {
    id: 'AT-2(2)',
    family: 'AT',
    title: 'Security Awareness Training | Insider Threat',
    description: 'The organization includes security awareness training on recognizing and reporting potential indicators of insider threat.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide insider threat awareness training materials and completion records.',
    tags: ['insider-threat', 'training', 'awareness']
  },
  {
    id: 'AT-3',
    family: 'AT',
    title: 'Role-Based Security Training',
    description: 'The organization provides role-based security training to personnel with assigned security roles and responsibilities.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide role-specific training plans, completion records for security staff, developers, and administrators.',
    tags: ['role-based', 'training', 'specialized']
  },
  {
    id: 'AT-4',
    family: 'AT',
    title: 'Security Training Records',
    description: 'The organization documents and monitors individual information system security training activities.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide training tracking system screenshots, individual training records sample.',
    tags: ['records', 'training', 'tracking']
  },

  // ═══════════════════════════════════════
  // AU - AUDIT AND ACCOUNTABILITY
  // ═══════════════════════════════════════
  {
    id: 'AU-1',
    family: 'AU',
    title: 'Audit and Accountability Policy and Procedures',
    description: 'The organization develops, documents, and disseminates an audit and accountability policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the documented audit policy, log retention requirements, and evidence of approval.',
    tags: ['policy', 'audit', 'accountability']
  },
  {
    id: 'AU-2',
    family: 'AU',
    title: 'Audit Events',
    description: 'The organization determines that the information system is capable of auditing defined events including successful and unsuccessful logon attempts, privilege use, and data access.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'azure', 'aws'],
    evidenceGuidance: 'Provide list of auditable events, audit configuration screenshots, sample audit logs demonstrating event capture.',
    tags: ['events', 'logging', 'audit-trail']
  },
  {
    id: 'AU-3',
    family: 'AU',
    title: 'Content of Audit Records',
    description: 'The information system generates audit records containing information about the type of event, when it occurred, where it occurred, source, outcome, and identity of subjects/objects.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide sample audit records showing all required fields (who, what, when, where, outcome).',
    tags: ['audit-records', 'content', 'fields']
  },
  {
    id: 'AU-4',
    family: 'AU',
    title: 'Audit Storage Capacity',
    description: 'The organization allocates audit record storage capacity in accordance with audit record storage requirements.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'azure'],
    evidenceGuidance: 'Provide log storage configuration, retention policies, storage capacity planning documentation.',
    tags: ['storage', 'capacity', 'retention']
  },
  {
    id: 'AU-5',
    family: 'AU',
    title: 'Response to Audit Processing Failures',
    description: 'The information system alerts designated officials in the event of an audit processing failure and takes defined additional actions.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide alerting configuration for audit failures, escalation procedures, evidence of alert testing.',
    tags: ['alert', 'failure', 'audit-processing']
  },
  {
    id: 'AU-6',
    family: 'AU',
    title: 'Audit Review, Analysis, and Reporting',
    description: 'The organization reviews and analyzes information system audit records for indications of inappropriate or unusual activity and reports findings.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'gc-cse'],
    evidenceGuidance: 'Provide audit review procedures, SIEM dashboard screenshots, sample audit review reports, escalation evidence.',
    tags: ['review', 'analysis', 'reporting', 'siem']
  },
  {
    id: 'AU-6(1)',
    family: 'AU',
    title: 'Audit Review | Process Integration',
    description: 'The organization employs automated mechanisms to integrate audit review, analysis, and reporting into organizational processes.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide automated review/correlation configurations, SOAR playbook evidence, integrated dashboard screenshots.',
    tags: ['automated', 'integration', 'siem', 'soar']
  },
  {
    id: 'AU-8',
    family: 'AU',
    title: 'Time Stamps',
    description: 'The information system uses internal system clocks to generate time stamps for audit records.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'active-directory'],
    evidenceGuidance: 'Provide NTP configuration, time synchronization settings, sample timestamps from audit records.',
    tags: ['timestamps', 'ntp', 'synchronization']
  },
  {
    id: 'AU-9',
    family: 'AU',
    title: 'Protection of Audit Information',
    description: 'The information system protects audit information and audit tools from unauthorized access, modification, and deletion.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'azure'],
    evidenceGuidance: 'Provide access controls on log storage, immutability settings, encryption-at-rest evidence for logs.',
    tags: ['protection', 'integrity', 'audit-logs']
  },
  {
    id: 'AU-11',
    family: 'AU',
    title: 'Audit Record Retention',
    description: 'The organization retains audit records for a defined period to provide support for after-the-fact investigations and to meet regulatory retention requirements.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'azure'],
    evidenceGuidance: 'Provide retention policy documentation, log retention configuration showing minimum retention periods.',
    tags: ['retention', 'records', 'compliance']
  },
  {
    id: 'AU-12',
    family: 'AU',
    title: 'Audit Generation',
    description: 'The information system provides audit record generation capability for the auditable events and allows designated personnel to select which events are audited.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'siem-sentinel'],
    evidenceGuidance: 'Provide audit generation configuration, evidence of selectable event types, system-wide audit enablement proof.',
    tags: ['generation', 'events', 'configuration']
  },

  // ═══════════════════════════════════════
  // CA - SECURITY ASSESSMENT AND AUTHORIZATION
  // ═══════════════════════════════════════
  {
    id: 'CA-1',
    family: 'CA',
    title: 'Security Assessment and Authorization Policy and Procedures',
    description: 'The organization develops, documents, and disseminates security assessment and authorization policies and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the SA&A policy, assessment methodology document, and evidence of approval.',
    tags: ['policy', 'assessment', 'authorization']
  },
  {
    id: 'CA-2',
    family: 'CA',
    title: 'Security Assessments',
    description: 'The organization develops a security assessment plan, assesses security controls, produces an assessment report, and provides results to authorizing officials.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide security assessment plan, completed assessment report, and communication to authorizing official.',
    tags: ['assessment', 'plan', 'report']
  },
  {
    id: 'CA-3',
    family: 'CA',
    title: 'System Interconnections',
    description: 'The organization authorizes connections from the information system to other information systems through ISAs/MOUs and monitors compliance.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide interconnection security agreements (ISAs), MOUs, network diagrams showing all interconnections, and monitoring evidence.',
    tags: ['interconnections', 'isa', 'mou', 'interfaces']
  },
  {
    id: 'CA-5',
    family: 'CA',
    title: 'Plan of Action and Milestones',
    description: 'The organization develops a plan of action and milestones (POA&M) for the information system to document planned remedial actions.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the POA&M document showing identified weaknesses, planned remediation, responsible parties, and milestones.',
    tags: ['poam', 'remediation', 'milestones']
  },
  {
    id: 'CA-6',
    family: 'CA',
    title: 'Security Authorization',
    description: 'The organization assigns a senior official to authorize the information system for processing before commencing operations and updates the authorization periodically.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the ATO/iATO letter signed by the authorizing official, authorization boundary documentation.',
    tags: ['ato', 'iato', 'authorization', 'official']
  },
  {
    id: 'CA-7',
    family: 'CA',
    title: 'Continuous Monitoring',
    description: 'The organization develops a continuous monitoring strategy and program including establishing metrics, monitoring frequency, and ongoing assessments.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'gc-cse'],
    evidenceGuidance: 'Provide continuous monitoring strategy document, dashboard/tool configurations, periodic assessment schedule.',
    tags: ['continuous-monitoring', 'ongoing', 'metrics']
  },
  {
    id: 'CA-9',
    family: 'CA',
    title: 'Internal System Connections',
    description: 'The organization authorizes internal connections of information system components and documents the interface characteristics, security requirements, and nature of information communicated.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide internal connection documentation, interface specifications, and authorization records.',
    tags: ['internal-connections', 'components', 'interfaces']
  },

  // ═══════════════════════════════════════
  // CM - CONFIGURATION MANAGEMENT
  // ═══════════════════════════════════════
  {
    id: 'CM-1',
    family: 'CM',
    title: 'Configuration Management Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a configuration management policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the CM policy, change management procedures, and evidence of approval.',
    tags: ['policy', 'configuration', 'change-management']
  },
  {
    id: 'CM-2',
    family: 'CM',
    title: 'Baseline Configuration',
    description: 'The organization develops, documents, and maintains a current baseline configuration of the information system.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'intune'],
    evidenceGuidance: 'Provide baseline configuration documentation, system architecture diagrams, component inventory.',
    tags: ['baseline', 'configuration', 'inventory']
  },
  {
    id: 'CM-3',
    family: 'CM',
    title: 'Configuration Change Control',
    description: 'The organization determines the types of changes to the information system that are configuration-controlled, approves changes with explicit consideration for security impact.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure-devops', 'github'],
    evidenceGuidance: 'Provide change control board records, change request examples, approval workflow evidence, security impact analysis templates.',
    tags: ['change-control', 'ccb', 'approval']
  },
  {
    id: 'CM-4',
    family: 'CM',
    title: 'Security Impact Analysis',
    description: 'The organization analyzes changes to the information system to determine potential security impacts prior to change implementation.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide security impact analysis templates, completed analysis examples, integration with change management.',
    tags: ['impact-analysis', 'changes', 'security']
  },
  {
    id: 'CM-5',
    family: 'CM',
    title: 'Access Restrictions for Change',
    description: 'The organization defines, documents, approves, and enforces physical and logical access restrictions associated with changes to the information system.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure-devops', 'github', 'azure'],
    evidenceGuidance: 'Provide deployment pipeline access controls, approval gates, branch protection rules, environment separation evidence.',
    tags: ['access', 'change', 'deployment', 'pipeline']
  },
  {
    id: 'CM-6',
    family: 'CM',
    title: 'Configuration Settings',
    description: 'The organization establishes and documents configuration settings for IT products employed within the system using security configuration checklists.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['intune', 'azure', 'active-directory'],
    evidenceGuidance: 'Provide hardening baselines (CIS, STIG), configuration compliance scan results, GPO/Intune policy screenshots.',
    tags: ['hardening', 'settings', 'cis', 'stig']
  },
  {
    id: 'CM-7',
    family: 'CM',
    title: 'Least Functionality',
    description: 'The organization configures the information system to provide only essential capabilities and prohibits or restricts the use of non-essential functions, ports, protocols, and services.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'intune'],
    evidenceGuidance: 'Provide evidence of disabled unnecessary services/ports, allow-list configurations, and hardening scan results.',
    tags: ['least-functionality', 'ports', 'services', 'hardening']
  },
  {
    id: 'CM-8',
    family: 'CM',
    title: 'Information System Component Inventory',
    description: 'The organization develops and documents an inventory of information system components that accurately reflects the current system and is at a level of granularity deemed necessary for tracking.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'intune'],
    evidenceGuidance: 'Provide system component inventory, automated discovery tool outputs, CMDB screenshots.',
    tags: ['inventory', 'cmdb', 'assets', 'components']
  },

  // ═══════════════════════════════════════
  // CP - CONTINGENCY PLANNING
  // ═══════════════════════════════════════
  {
    id: 'CP-1',
    family: 'CP',
    title: 'Contingency Planning Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a contingency planning policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the contingency planning policy, BCP/DRP documentation, and evidence of approval.',
    tags: ['policy', 'contingency', 'bcp', 'drp']
  },
  {
    id: 'CP-2',
    family: 'CP',
    title: 'Contingency Plan',
    description: 'The organization develops a contingency plan that identifies essential missions and business functions, provides recovery objectives and restoration priorities.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the contingency plan including RTO/RPO, recovery procedures, roles/responsibilities, contact lists.',
    tags: ['contingency-plan', 'rto', 'rpo', 'recovery']
  },
  {
    id: 'CP-3',
    family: 'CP',
    title: 'Contingency Training',
    description: 'The organization provides contingency training to information system users consistent with assigned roles and responsibilities.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide contingency training records, exercise participation evidence.',
    tags: ['training', 'contingency', 'exercises']
  },
  {
    id: 'CP-4',
    family: 'CP',
    title: 'Contingency Plan Testing',
    description: 'The organization tests the contingency plan to determine effectiveness and documents results.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide DR test plans, test execution results, lessons learned, and remediation actions.',
    tags: ['testing', 'dr-test', 'exercise']
  },
  {
    id: 'CP-6',
    family: 'CP',
    title: 'Alternate Storage Site',
    description: 'The organization establishes an alternate storage site with necessary agreements to permit storage and retrieval of information system backup information.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'backup-azure'],
    evidenceGuidance: 'Provide alternate storage site details, geographic separation evidence, SLAs, and data replication configuration.',
    tags: ['alternate-site', 'storage', 'replication', 'geo-redundancy']
  },
  {
    id: 'CP-7',
    family: 'CP',
    title: 'Alternate Processing Site',
    description: 'The organization establishes an alternate processing site that permits the transfer and resumption of operations within defined time frames.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws'],
    evidenceGuidance: 'Provide alternate processing site details, failover configuration, recovery time evidence.',
    tags: ['alternate-site', 'processing', 'failover']
  },
  {
    id: 'CP-9',
    family: 'CP',
    title: 'Information System Backup',
    description: 'The organization conducts backups of user-level and system-level information at defined frequency and protects backup confidentiality, integrity, and availability.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['backup-azure', 'azure', 'aws'],
    evidenceGuidance: 'Provide backup policy, backup job configurations, successful backup reports, restoration test results.',
    tags: ['backup', 'restore', 'recovery']
  },
  {
    id: 'CP-10',
    family: 'CP',
    title: 'Information System Recovery and Reconstitution',
    description: 'The organization provides for the recovery and reconstitution of the information system to a known state after a disruption.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws'],
    evidenceGuidance: 'Provide recovery procedures, reconstitution checklists, evidence of successful recovery testing.',
    tags: ['recovery', 'reconstitution', 'restoration']
  },

  // ═══════════════════════════════════════
  // IA - IDENTIFICATION AND AUTHENTICATION
  // ═══════════════════════════════════════
  {
    id: 'IA-1',
    family: 'IA',
    title: 'Identification and Authentication Policy and Procedures',
    description: 'The organization develops, documents, and disseminates an identification and authentication policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the I&A policy, procedures, and evidence of approval.',
    tags: ['policy', 'identification', 'authentication']
  },
  {
    id: 'IA-2',
    family: 'IA',
    title: 'Identification and Authentication (Organizational Users)',
    description: 'The information system uniquely identifies and authenticates organizational users or processes acting on behalf of organizational users.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide user authentication configurations, unique identifier scheme, authentication mechanism details.',
    tags: ['authentication', 'users', 'identity']
  },
  {
    id: 'IA-2(1)',
    family: 'IA',
    title: 'Identification and Authentication | Multi-Factor Authentication to Privileged Accounts',
    description: 'The information system implements multi-factor authentication for network access to privileged accounts.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'mfa'],
    evidenceGuidance: 'Provide MFA configuration for privileged accounts, conditional access policies requiring MFA, MFA method configurations.',
    tags: ['mfa', 'privileged', 'two-factor']
  },
  {
    id: 'IA-2(2)',
    family: 'IA',
    title: 'Identification and Authentication | Multi-Factor Authentication to Non-Privileged Accounts',
    description: 'The information system implements multi-factor authentication for network access to non-privileged accounts.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'mfa'],
    evidenceGuidance: 'Provide MFA configuration for all user accounts, conditional access policies, MFA registration status reports.',
    tags: ['mfa', 'non-privileged', 'all-users']
  },
  {
    id: 'IA-3',
    family: 'IA',
    title: 'Device Identification and Authentication',
    description: 'The information system uniquely identifies and authenticates defined devices before establishing a connection.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'intune'],
    evidenceGuidance: 'Provide device registration/enrollment configuration, certificate-based device auth, conditional access device compliance policies.',
    tags: ['device', 'authentication', 'certificates']
  },
  {
    id: 'IA-4',
    family: 'IA',
    title: 'Identifier Management',
    description: 'The organization manages information system identifiers by receiving authorization, issuing, disabling after inactivity, and preventing reuse.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide identifier management procedures, inactive account policies, evidence of identifier lifecycle management.',
    tags: ['identifiers', 'management', 'lifecycle']
  },
  {
    id: 'IA-5',
    family: 'IA',
    title: 'Authenticator Management',
    description: 'The organization manages information system authenticators by verifying identity, establishing initial content, ensuring sufficient strength, distributing, storing, and refreshing authenticators.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide password policy configuration, authenticator strength requirements, token/certificate management procedures.',
    tags: ['authenticator', 'passwords', 'tokens', 'management']
  },
  {
    id: 'IA-5(1)',
    family: 'IA',
    title: 'Authenticator Management | Password-Based Authentication',
    description: 'The information system enforces minimum password complexity, password lifetime restrictions, and other password quality requirements.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide password policy screenshots showing complexity, length, history, and lockout settings.',
    tags: ['passwords', 'complexity', 'policy']
  },
  {
    id: 'IA-6',
    family: 'IA',
    title: 'Authenticator Feedback',
    description: 'The information system obscures feedback of authentication information during the authentication process to protect from exploitation.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: ['entra-id'],
    evidenceGuidance: 'Provide screenshots showing password masking, generic error messages on failed authentication.',
    tags: ['feedback', 'masking', 'authentication']
  },
  {
    id: 'IA-8',
    family: 'IA',
    title: 'Identification and Authentication (Non-Organizational Users)',
    description: 'The information system uniquely identifies and authenticates non-organizational users or processes acting on behalf of non-organizational users.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id'],
    evidenceGuidance: 'Provide guest/external user authentication configurations, B2B/B2C identity configurations.',
    tags: ['external-users', 'guest', 'b2b', 'authentication']
  },

  // ═══════════════════════════════════════
  // IR - INCIDENT RESPONSE
  // ═══════════════════════════════════════
  {
    id: 'IR-1',
    family: 'IR',
    title: 'Incident Response Policy and Procedures',
    description: 'The organization develops, documents, and disseminates an incident response policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the incident response policy, procedures, and evidence of approval.',
    tags: ['policy', 'incident-response']
  },
  {
    id: 'IR-2',
    family: 'IR',
    title: 'Incident Response Training',
    description: 'The organization provides incident response training to information system users consistent with assigned roles and responsibilities.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide incident response training records, tabletop exercise documentation.',
    tags: ['training', 'incident-response']
  },
  {
    id: 'IR-3',
    family: 'IR',
    title: 'Incident Response Testing',
    description: 'The organization tests the incident response capability using defined tests to determine effectiveness and documents results.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide incident response test plans, exercise results, after-action reports.',
    tags: ['testing', 'exercises', 'tabletop']
  },
  {
    id: 'IR-4',
    family: 'IR',
    title: 'Incident Handling',
    description: 'The organization implements an incident handling capability for security incidents that includes preparation, detection, analysis, containment, eradication, and recovery.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide incident handling procedures, incident ticket examples, playbook documentation.',
    tags: ['handling', 'containment', 'eradication', 'recovery']
  },
  {
    id: 'IR-5',
    family: 'IR',
    title: 'Incident Monitoring',
    description: 'The organization tracks and documents information system security incidents.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk'],
    evidenceGuidance: 'Provide incident tracking system screenshots, incident log/register, monitoring dashboard evidence.',
    tags: ['monitoring', 'tracking', 'incidents']
  },
  {
    id: 'IR-6',
    family: 'IR',
    title: 'Incident Reporting',
    description: 'The organization requires personnel to report suspected security incidents to the organizational incident response capability and reports incidents to defined authorities.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide incident reporting procedures, reporting templates, evidence of GC-CIRT/CCCS notification process.',
    tags: ['reporting', 'notification', 'gc-cirt', 'cccs']
  },
  {
    id: 'IR-7',
    family: 'IR',
    title: 'Incident Response Assistance',
    description: 'The organization provides an incident response support resource integral to the organizational incident response capability that offers advice and assistance.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: ['gc-cse'],
    evidenceGuidance: 'Provide incident response support contact information, escalation procedures, CCCS engagement evidence.',
    tags: ['assistance', 'support', 'helpdesk']
  },
  {
    id: 'IR-8',
    family: 'IR',
    title: 'Incident Response Plan',
    description: 'The organization develops an incident response plan that provides a roadmap for implementing the incident response capability.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the incident response plan, distribution list, review/update records.',
    tags: ['plan', 'irp', 'roadmap']
  },

  // ═══════════════════════════════════════
  // MA - MAINTENANCE
  // ═══════════════════════════════════════
  {
    id: 'MA-1',
    family: 'MA',
    title: 'System Maintenance Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a system maintenance policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the maintenance policy, scheduled maintenance procedures, and evidence of approval.',
    tags: ['policy', 'maintenance']
  },
  {
    id: 'MA-2',
    family: 'MA',
    title: 'Controlled Maintenance',
    description: 'The organization schedules, performs, documents, and reviews records of maintenance and repairs on information system components.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws'],
    evidenceGuidance: 'Provide maintenance schedules, maintenance logs/records, patching evidence.',
    tags: ['maintenance', 'patching', 'scheduling']
  },
  {
    id: 'MA-5',
    family: 'MA',
    title: 'Maintenance Personnel',
    description: 'The organization establishes a process for maintenance personnel authorization and maintains a list of authorized maintenance organizations or personnel.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide authorized maintenance personnel list, security clearance verification records.',
    tags: ['personnel', 'authorization', 'clearance']
  },

  // ═══════════════════════════════════════
  // MP - MEDIA PROTECTION
  // ═══════════════════════════════════════
  {
    id: 'MP-1',
    family: 'MP',
    title: 'Media Protection Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a media protection policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the media protection policy and procedures, evidence of approval.',
    tags: ['policy', 'media-protection']
  },
  {
    id: 'MP-2',
    family: 'MP',
    title: 'Media Access',
    description: 'The organization restricts access to defined types of digital and/or non-digital media to defined personnel or roles.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['intune', 'active-directory'],
    evidenceGuidance: 'Provide USB/removable media policies, DLP configurations, endpoint protection settings.',
    tags: ['media-access', 'usb', 'removable-media', 'dlp']
  },
  {
    id: 'MP-4',
    family: 'MP',
    title: 'Media Storage',
    description: 'The organization physically controls and securely stores digital and non-digital media within controlled areas.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc'],
    evidenceGuidance: 'Provide media storage procedures, physical security controls for media storage areas, encryption requirements.',
    tags: ['storage', 'physical', 'encryption']
  },
  {
    id: 'MP-6',
    family: 'MP',
    title: 'Media Sanitization',
    description: 'The organization sanitizes information system media prior to disposal, release out of organizational control, or release for reuse.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide media sanitization procedures, sanitization records/certificates, approved sanitization methods.',
    tags: ['sanitization', 'disposal', 'wiping']
  },

  // ═══════════════════════════════════════
  // PE - PHYSICAL AND ENVIRONMENTAL PROTECTION
  // ═══════════════════════════════════════
  {
    id: 'PE-1',
    family: 'PE',
    title: 'Physical and Environmental Protection Policy and Procedures',
    description: 'The organization develops, documents, and disseminates physical and environmental protection policies and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc'],
    evidenceGuidance: 'Provide physical security policy, environmental protection procedures.',
    tags: ['policy', 'physical', 'environmental']
  },
  {
    id: 'PE-2',
    family: 'PE',
    title: 'Physical Access Authorizations',
    description: 'The organization develops, approves, and maintains a list of individuals with authorized access to the facility where the information system resides.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc', 'azure', 'aws'],
    evidenceGuidance: 'Provide authorized access lists, access request/approval procedures. For cloud: CSP compliance documentation.',
    tags: ['physical-access', 'authorization', 'facility']
  },
  {
    id: 'PE-3',
    family: 'PE',
    title: 'Physical Access Control',
    description: 'The organization enforces physical access authorizations at defined entry/exit points to the facility by verifying access authorizations and controlling ingress/egress.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc', 'azure', 'aws'],
    evidenceGuidance: 'Provide physical access control configurations (badge readers, biometrics), access logs, visitor procedures. For cloud: CSP SOC 2/ISO 27001.',
    tags: ['physical-access', 'badge', 'entry-control']
  },
  {
    id: 'PE-6',
    family: 'PE',
    title: 'Monitoring Physical Access',
    description: 'The organization monitors physical access to the facility where the information system resides to detect and respond to physical security incidents.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc', 'azure', 'aws'],
    evidenceGuidance: 'Provide CCTV/monitoring configurations, physical access monitoring procedures, incident response for physical breaches.',
    tags: ['monitoring', 'cctv', 'physical-security']
  },
  {
    id: 'PE-8',
    family: 'PE',
    title: 'Visitor Access Records',
    description: 'The organization maintains visitor access records to the facility where the information system resides.',
    priority: 'P3',
    profile: 'PBMM',
    commonInheritance: ['ssc-dc'],
    evidenceGuidance: 'Provide visitor log samples, visitor management procedures.',
    tags: ['visitors', 'records', 'logs']
  },

  // ═══════════════════════════════════════
  // PL - PLANNING
  // ═══════════════════════════════════════
  {
    id: 'PL-1',
    family: 'PL',
    title: 'Security Planning Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a security planning policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the security planning policy and procedures, evidence of approval.',
    tags: ['policy', 'planning']
  },
  {
    id: 'PL-2',
    family: 'PL',
    title: 'System Security Plan',
    description: 'The organization develops a security plan for the information system that describes security controls in place or planned, rules of behavior, and is reviewed/updated.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the System Security Plan (SSP), review/approval records, and update history.',
    tags: ['ssp', 'security-plan', 'documentation']
  },
  {
    id: 'PL-4',
    family: 'PL',
    title: 'Rules of Behavior',
    description: 'The organization establishes and makes readily available rules that describe their responsibilities and expected behavior with regard to information system usage.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide rules of behavior/acceptable use policy, signed acknowledgement records.',
    tags: ['rules-of-behavior', 'acceptable-use', 'aup']
  },

  // ═══════════════════════════════════════
  // PS - PERSONNEL SECURITY
  // ═══════════════════════════════════════
  {
    id: 'PS-1',
    family: 'PS',
    title: 'Personnel Security Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a personnel security policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the personnel security policy and procedures, evidence of approval.',
    tags: ['policy', 'personnel-security']
  },
  {
    id: 'PS-2',
    family: 'PS',
    title: 'Position Risk Designation',
    description: 'The organization assigns a risk designation to all organizational positions, establishes screening criteria for individuals filling those positions.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide position risk designations, screening criteria matrix.',
    tags: ['risk-designation', 'screening', 'positions']
  },
  {
    id: 'PS-3',
    family: 'PS',
    title: 'Personnel Screening',
    description: 'The organization screens individuals prior to authorizing access to the information system and rescreens according to defined conditions.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide screening procedures, evidence of security clearance verification (Reliability Status / Secret as required).',
    tags: ['screening', 'clearance', 'reliability', 'background-check']
  },
  {
    id: 'PS-4',
    family: 'PS',
    title: 'Personnel Termination',
    description: 'The organization upon termination of individual employment disables access, terminates/revokes authenticators, conducts exit interviews, retrieves security-related property.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide termination procedures, checklist evidence, access revocation timeline records.',
    tags: ['termination', 'offboarding', 'access-revocation']
  },
  {
    id: 'PS-5',
    family: 'PS',
    title: 'Personnel Transfer',
    description: 'The organization reviews and confirms ongoing operational need for current logical and physical access authorizations when individuals are reassigned or transferred.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: ['entra-id', 'active-directory'],
    evidenceGuidance: 'Provide transfer procedures, access review during transfer evidence.',
    tags: ['transfer', 'reassignment', 'access-review']
  },

  // ═══════════════════════════════════════
  // RA - RISK ASSESSMENT
  // ═══════════════════════════════════════
  {
    id: 'RA-1',
    family: 'RA',
    title: 'Risk Assessment Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a risk assessment policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the risk assessment policy, methodology, and evidence of approval.',
    tags: ['policy', 'risk-assessment']
  },
  {
    id: 'RA-2',
    family: 'RA',
    title: 'Security Categorization',
    description: 'The organization categorizes information and the information system in accordance with applicable GC policies and documents the security categorization.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide security categorization assessment (using TBS guidelines), business impact analysis, data classification.',
    tags: ['categorization', 'classification', 'bia']
  },
  {
    id: 'RA-3',
    family: 'RA',
    title: 'Risk Assessment',
    description: 'The organization conducts an assessment of risk including the likelihood and magnitude of harm from unauthorized access, use, disclosure, disruption, modification, or destruction.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the threat and risk assessment (TRA), risk register, risk treatment plan.',
    tags: ['tra', 'risk-register', 'threat', 'vulnerability']
  },
  {
    id: 'RA-5',
    family: 'RA',
    title: 'Vulnerability Scanning',
    description: 'The organization scans for vulnerabilities in the information system at defined frequency and when new vulnerabilities are identified and reported.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['defender', 'crowdstrike', 'azure'],
    evidenceGuidance: 'Provide vulnerability scanning tool configurations, recent scan results, remediation tracking evidence.',
    tags: ['vulnerability-scanning', 'assessment', 'remediation']
  },

  // ═══════════════════════════════════════
  // SA - SYSTEM AND SERVICES ACQUISITION
  // ═══════════════════════════════════════
  {
    id: 'SA-1',
    family: 'SA',
    title: 'System and Services Acquisition Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a system and services acquisition policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the acquisition policy, security requirements in procurement process.',
    tags: ['policy', 'acquisition']
  },
  {
    id: 'SA-2',
    family: 'SA',
    title: 'Allocation of Resources',
    description: 'The organization determines information security requirements, determines/documents/allocates resources required to protect the system.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide resource allocation documentation, security budget, staffing plan.',
    tags: ['resources', 'budget', 'staffing']
  },
  {
    id: 'SA-3',
    family: 'SA',
    title: 'System Development Life Cycle',
    description: 'The organization manages the information system using a SDLC that incorporates information security considerations.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure-devops', 'github'],
    evidenceGuidance: 'Provide SDLC documentation showing security integration points, security requirements in sprints/phases.',
    tags: ['sdlc', 'development', 'lifecycle']
  },
  {
    id: 'SA-4',
    family: 'SA',
    title: 'Acquisition Process',
    description: 'The organization includes security functional requirements, design/implementation requirements, and required evidence in the acquisition contract.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide procurement templates with security clauses, vendor security assessment records.',
    tags: ['procurement', 'contracts', 'vendor-security']
  },
  {
    id: 'SA-8',
    family: 'SA',
    title: 'Security Engineering Principles',
    description: 'The organization applies information system security engineering principles in the specification, design, development, implementation, and modification of the system.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide security architecture document, threat modeling evidence, secure design review records.',
    tags: ['security-engineering', 'architecture', 'threat-modeling']
  },
  {
    id: 'SA-9',
    family: 'SA',
    title: 'External Information System Services',
    description: 'The organization requires providers of external system services to comply with organizational security requirements and employs defined monitoring methods.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide external service agreements, SLAs with security requirements, third-party security assessment results.',
    tags: ['external-services', 'third-party', 'sla']
  },
  {
    id: 'SA-11',
    family: 'SA',
    title: 'Developer Security Testing and Evaluation',
    description: 'The organization requires the developer to create a security assessment plan, perform testing/evaluation, and provide evidence.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure-devops', 'github'],
    evidenceGuidance: 'Provide SAST/DAST scan configurations, security testing results, code review evidence, penetration test reports.',
    tags: ['security-testing', 'sast', 'dast', 'pentest']
  },

  // ═══════════════════════════════════════
  // SC - SYSTEM AND COMMUNICATIONS PROTECTION
  // ═══════════════════════════════════════
  {
    id: 'SC-1',
    family: 'SC',
    title: 'System and Communications Protection Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a system and communications protection policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the SC policy and procedures, evidence of approval.',
    tags: ['policy', 'communications', 'protection']
  },
  {
    id: 'SC-5',
    family: 'SC',
    title: 'Denial of Service Protection',
    description: 'The information system protects against or limits the effects of denial of service attacks.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'waf'],
    evidenceGuidance: 'Provide DDoS protection configurations, WAF rules, rate limiting settings, CDN configurations.',
    tags: ['ddos', 'dos', 'protection', 'waf']
  },
  {
    id: 'SC-7',
    family: 'SC',
    title: 'Boundary Protection',
    description: 'The information system monitors and controls communications at the external boundary and at key internal boundaries.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'gc-network', 'waf'],
    evidenceGuidance: 'Provide network architecture diagrams showing boundaries, firewall/NSG configurations, DMZ configurations, IDS/IPS evidence.',
    tags: ['boundary', 'firewall', 'dmz', 'nsg', 'perimeter']
  },
  {
    id: 'SC-7(3)',
    family: 'SC',
    title: 'Boundary Protection | Access Points',
    description: 'The organization limits the number of external network connections to the information system.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'gc-network'],
    evidenceGuidance: 'Provide network diagrams showing limited access points, ingress/egress point inventory.',
    tags: ['access-points', 'network', 'ingress', 'egress']
  },
  {
    id: 'SC-8',
    family: 'SC',
    title: 'Transmission Confidentiality and Integrity',
    description: 'The information system protects the confidentiality and integrity of transmitted information.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssl-tls', 'azure', 'aws'],
    evidenceGuidance: 'Provide TLS configuration evidence, certificate management, encryption-in-transit configurations.',
    tags: ['encryption', 'tls', 'transit', 'confidentiality', 'integrity']
  },
  {
    id: 'SC-8(1)',
    family: 'SC',
    title: 'Transmission Confidentiality and Integrity | Cryptographic Protection',
    description: 'The information system implements cryptographic mechanisms to prevent unauthorized disclosure and detect changes to information during transmission.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssl-tls', 'azure', 'aws'],
    evidenceGuidance: 'Provide TLS version enforcement (1.2+), cipher suite configurations, CCCS-approved algorithm evidence.',
    tags: ['cryptographic', 'tls', 'ciphers', 'cccs-approved']
  },
  {
    id: 'SC-12',
    family: 'SC',
    title: 'Cryptographic Key Establishment and Management',
    description: 'The organization establishes and manages cryptographic keys for required cryptography using CCCS-approved key management technology and processes.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['key-vault', 'aws-kms'],
    evidenceGuidance: 'Provide key management procedures, key vault configurations, rotation policies, HSM usage evidence.',
    tags: ['key-management', 'cryptography', 'hsm', 'rotation']
  },
  {
    id: 'SC-13',
    family: 'SC',
    title: 'Cryptographic Protection',
    description: 'The information system implements CCCS-approved cryptography in accordance with applicable GC policies, legislation, and standards.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'ssl-tls'],
    evidenceGuidance: 'Provide list of cryptographic algorithms in use, CCCS compliance documentation, FIPS 140-2 validated module evidence.',
    tags: ['cryptography', 'fips', 'cccs', 'algorithms']
  },
  {
    id: 'SC-17',
    family: 'SC',
    title: 'Public Key Infrastructure Certificates',
    description: 'The organization issues public key certificates under an appropriate certificate policy or obtains public key certificates from an approved service provider.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'entra-id'],
    evidenceGuidance: 'Provide PKI/certificate management procedures, certificate inventory, CA configurations.',
    tags: ['pki', 'certificates', 'ca', 'public-key']
  },
  {
    id: 'SC-20',
    family: 'SC',
    title: 'Secure Name / Address Resolution Service',
    description: 'The information system provides additional data origin authentication and integrity verification artifacts along with the authoritative name resolution data the system returns in response to external resolution queries.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws'],
    evidenceGuidance: 'Provide DNSSEC configurations, DNS security settings.',
    tags: ['dns', 'dnssec', 'resolution']
  },
  {
    id: 'SC-23',
    family: 'SC',
    title: 'Session Authenticity',
    description: 'The information system protects the authenticity of communications sessions.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['ssl-tls', 'entra-id'],
    evidenceGuidance: 'Provide session management configurations, CSRF protection, secure cookie settings.',
    tags: ['session', 'csrf', 'cookies', 'authenticity']
  },
  {
    id: 'SC-28',
    family: 'SC',
    title: 'Protection of Information at Rest',
    description: 'The information system protects the confidentiality and integrity of information at rest.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'aws', 'key-vault', 'aws-kms'],
    evidenceGuidance: 'Provide encryption-at-rest configurations, disk encryption settings, database encryption evidence.',
    tags: ['encryption-at-rest', 'disk-encryption', 'database-encryption']
  },

  // ═══════════════════════════════════════
  // SI - SYSTEM AND INFORMATION INTEGRITY
  // ═══════════════════════════════════════
  {
    id: 'SI-1',
    family: 'SI',
    title: 'System and Information Integrity Policy and Procedures',
    description: 'The organization develops, documents, and disseminates a system and information integrity policy and procedures.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide the SI policy and procedures, evidence of approval.',
    tags: ['policy', 'integrity']
  },
  {
    id: 'SI-2',
    family: 'SI',
    title: 'Flaw Remediation',
    description: 'The organization identifies, reports, and corrects information system flaws, tests software/firmware updates, and installs security-relevant updates within defined time frames.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['intune', 'azure', 'defender'],
    evidenceGuidance: 'Provide patch management policy, patching timelines, patch compliance reports, vulnerability remediation evidence.',
    tags: ['patching', 'remediation', 'vulnerabilities', 'updates']
  },
  {
    id: 'SI-3',
    family: 'SI',
    title: 'Malicious Code Protection',
    description: 'The organization employs malicious code protection mechanisms at information system entry and exit points to detect and eradicate malicious code.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['defender', 'crowdstrike'],
    evidenceGuidance: 'Provide anti-malware configurations, update/signature management, real-time protection evidence, scan schedules.',
    tags: ['antimalware', 'antivirus', 'edr', 'protection']
  },
  {
    id: 'SI-4',
    family: 'SI',
    title: 'Information System Monitoring',
    description: 'The organization monitors the information system to detect attacks and indicators of potential attacks, unauthorized connections, and unauthorized use.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'siem-splunk', 'defender', 'gc-cse'],
    evidenceGuidance: 'Provide SIEM/monitoring tool configurations, alert rules, monitoring dashboard screenshots, detection rule evidence.',
    tags: ['monitoring', 'siem', 'detection', 'alerts']
  },
  {
    id: 'SI-4(4)',
    family: 'SI',
    title: 'Information System Monitoring | Inbound and Outbound Communications Traffic',
    description: 'The information system monitors inbound and outbound communications traffic for unusual or unauthorized activities.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['siem-sentinel', 'azure', 'gc-network'],
    evidenceGuidance: 'Provide network traffic monitoring configurations, anomaly detection rules, flow log analysis evidence.',
    tags: ['traffic-monitoring', 'network', 'anomaly']
  },
  {
    id: 'SI-5',
    family: 'SI',
    title: 'Security Alerts, Advisories, and Directives',
    description: 'The organization receives information system security alerts, advisories, and directives from designated external organizations on an ongoing basis.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['gc-cse'],
    evidenceGuidance: 'Provide CCCS alert subscription evidence, vendor advisory tracking, response procedures for advisories.',
    tags: ['alerts', 'advisories', 'cccs', 'cve']
  },
  {
    id: 'SI-7',
    family: 'SI',
    title: 'Software, Firmware, and Information Integrity',
    description: 'The organization employs integrity verification tools to detect unauthorized changes to software, firmware, and information.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['defender', 'azure'],
    evidenceGuidance: 'Provide file integrity monitoring configurations, code signing evidence, integrity verification procedures.',
    tags: ['integrity', 'fim', 'code-signing', 'verification']
  },
  {
    id: 'SI-10',
    family: 'SI',
    title: 'Information Input Validation',
    description: 'The information system checks the validity of defined information inputs.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide input validation code examples, WAF rules for injection prevention, OWASP compliance evidence.',
    tags: ['input-validation', 'injection', 'owasp', 'xss']
  },
  {
    id: 'SI-11',
    family: 'SI',
    title: 'Error Handling',
    description: 'The information system generates error messages that provide information necessary for corrective actions without revealing information that could be exploited.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide error handling code examples, custom error page screenshots, evidence that stack traces are not exposed.',
    tags: ['error-handling', 'messages', 'information-disclosure']
  },
  {
    id: 'SI-12',
    family: 'SI',
    title: 'Information Handling and Retention',
    description: 'The organization handles and retains information within the system and information output from the system in accordance with applicable laws and policies.',
    priority: 'P2',
    profile: 'PBMM',
    commonInheritance: [],
    evidenceGuidance: 'Provide data retention policies, data handling procedures, PII handling documentation, disposal schedules.',
    tags: ['retention', 'handling', 'pii', 'privacy']
  },
  {
    id: 'SI-16',
    family: 'SI',
    title: 'Memory Protection',
    description: 'The information system implements defined security safeguards to protect its memory from unauthorized code execution.',
    priority: 'P1',
    profile: 'PBMM',
    commonInheritance: ['azure', 'defender'],
    evidenceGuidance: 'Provide DEP/ASLR configurations, memory protection settings, exploit protection evidence.',
    tags: ['memory', 'dep', 'aslr', 'exploit-protection']
  }
];

/**
 * Get recommended controls based on project characteristics
 */
/**
 * GC Web Standards & Guidance Checklist
 * For low-risk / unclassified projects that don't require a full SA&A
 * but still need to meet Government of Canada web standards
 */
const GC_WEB_GUIDANCE = {
  categories: [
    {
      id: 'wcag',
      title: 'Web Accessibility — WCAG 2.1 Level AA',
      icon: 'universal-access',
      description: 'All GC web content must meet WCAG 2.1 Level AA per the Standard on Web Accessibility and the Accessible Canada Act.',
      items: [
        { id: 'wcag-1', text: 'All pages conform to WCAG 2.1 Level AA success criteria', required: true },
        { id: 'wcag-2', text: 'Automated accessibility testing has been performed (e.g. axe, WAVE, Pa11y)', required: true },
        { id: 'wcag-3', text: 'Manual keyboard navigation testing completed — all interactive elements reachable', required: true },
        { id: 'wcag-4', text: 'All images include meaningful alt text (or empty alt for decorative images)', required: true },
        { id: 'wcag-5', text: 'Colour contrast ratios meet 4.5:1 for normal text and 3:1 for large text', required: true },
        { id: 'wcag-6', text: 'Content is presented in both official languages (English and French)', required: true },
        { id: 'wcag-7', text: 'Forms include visible labels, error identification, and clear instructions', required: true },
        { id: 'wcag-8', text: 'Screen reader testing performed with NVDA, JAWS, or VoiceOver', recommended: true },
        { id: 'wcag-9', text: 'Pages function correctly at 200% zoom without horizontal scrolling', required: true },
        { id: 'wcag-10', text: 'Skip navigation links are provided on all pages', required: true }
      ]
    },
    {
      id: 'gc-web',
      title: 'GC Web Standards & Design',
      icon: 'layout-text-window',
      description: 'Compliance with the Standard on Web Interoperability, Standard on Web Usability, and Canada.ca design system.',
      items: [
        { id: 'gc-web-1', text: 'Follows Canada.ca design system (WET-BOEW) or GC Web theme', required: true },
        { id: 'gc-web-2', text: 'Official Government of Canada header with FIP signature displayed', required: true },
        { id: 'gc-web-3', text: 'Standard GC footer with required links (Terms, Privacy, etc.)', required: true },
        { id: 'gc-web-4', text: 'Privacy Notice Statement posted if any information is collected', required: true },
        { id: 'gc-web-5', text: 'Content is available in both official languages with equal quality', required: true },
        { id: 'gc-web-6', text: 'Uses responsive design — functional on mobile, tablet, and desktop', required: true },
        { id: 'gc-web-7', text: 'Web analytics implemented per GC Digital Analytics Program (e.g. Adobe Analytics)', recommended: true },
        { id: 'gc-web-8', text: 'Content follows Canada.ca Content Style Guide', recommended: true }
      ]
    },
    {
      id: 'hosting',
      title: 'Hosting & DNS Requirements',
      icon: 'hdd-network',
      description: 'All GC web assets must be hosted on approved infrastructure with agency-managed DNS.',
      items: [
        { id: 'host-1', text: 'Website is hosted through the department\'s approved hosting service or SSC', required: true },
        { id: 'host-2', text: 'DNS records are managed through the department\'s official DNS services', required: true },
        { id: 'host-3', text: 'Domain uses gc.ca or canada.ca namespace as appropriate', required: true },
        { id: 'host-4', text: 'All data resides in Canada (Canadian data residency requirement)', required: true },
        { id: 'host-5', text: 'TLS 1.2 or higher is enforced — HTTPS only, HTTP redirects to HTTPS', required: true },
        { id: 'host-6', text: 'HSTS (Strict-Transport-Security) header is configured', required: true },
        { id: 'host-7', text: 'Content Delivery Network (CDN), if used, is on the approved vendor list', recommended: true },
        { id: 'host-8', text: 'Hosting provider has a valid SOC 2 Type II or equivalent certification', recommended: true }
      ]
    },
    {
      id: 'web-security',
      title: 'Basic Web Security',
      icon: 'shield-check',
      description: 'Baseline security requirements for all public-facing GC web properties.',
      items: [
        { id: 'sec-1', text: 'Security headers configured: X-Content-Type-Options, X-Frame-Options, CSP', required: true },
        { id: 'sec-2', text: 'Web Application Firewall (WAF) or equivalent perimeter protection enabled', required: true },
        { id: 'sec-3', text: 'DDoS protection in place (CloudFlare, Azure Front Door, AWS Shield, or equivalent)', required: true },
        { id: 'sec-4', text: 'Vulnerability scan completed with no critical/high findings', required: true },
        { id: 'sec-5', text: 'Third-party libraries and CMS components are up to date', required: true },
        { id: 'sec-6', text: 'No sensitive data (API keys, credentials) exposed in client-side code or source', required: true },
        { id: 'sec-7', text: 'Admin / CMS login pages are restricted (IP allowlist, VPN, or MFA)', recommended: true },
        { id: 'sec-8', text: 'Regular patching schedule established for CMS / server components', recommended: true }
      ]
    },
    {
      id: 'forms-captcha',
      title: 'Forms, CAPTCHA & Bot Protection',
      icon: 'robot',
      description: 'Required when the site includes any user input (contact forms, feedback, search).',
      items: [
        { id: 'form-1', text: 'CAPTCHA or equivalent bot protection on all public-facing forms', required: true },
        { id: 'form-2', text: 'CAPTCHA solution is accessible (audio alternative or accessible challenge)', required: true },
        { id: 'form-3', text: 'Rate limiting applied to form submission endpoints', required: true },
        { id: 'form-4', text: 'Form input is validated and sanitized server-side to prevent XSS/injection', required: true },
        { id: 'form-5', text: 'Email/notification endpoints protected against abuse (spam relay)', recommended: true },
        { id: 'form-6', text: 'Privacy notice displayed before data collection per Privacy Act', required: true },
        { id: 'form-7', text: 'If collecting personal information, PIA screening completed', required: true }
      ]
    },
    {
      id: 'maintenance',
      title: 'Ongoing Maintenance & Monitoring',
      icon: 'graph-up',
      description: 'Operational requirements to maintain the site post-launch.',
      items: [
        { id: 'maint-1', text: 'Uptime monitoring configured with appropriate alerting', recommended: true },
        { id: 'maint-2', text: 'Broken link checking performed regularly', recommended: true },
        { id: 'maint-3', text: 'Content review schedule established (minimum annual)', recommended: true },
        { id: 'maint-4', text: 'Incident response contact identified for the web property', required: true },
        { id: 'maint-5', text: 'Backup and recovery procedures documented', recommended: true },
        { id: 'maint-6', text: 'SSL/TLS certificates monitored for expiry', required: true }
      ]
    }
  ],
  summary: {
    title: 'No Formal SA&A Required',
    description: 'Based on the project profile (unclassified data, no PII, limited scope), a full ITSG-33 Security Assessment & Authorization is not required. However, the project must still comply with the Government of Canada web standards and security baselines listed below before going live.',
    footer: 'This guidance report is provided in lieu of a formal SA&A assessment. If the project scope changes (e.g., PII collection begins, classification increases, or user authentication is added), a reassessment of SA&A requirements should be conducted.'
  }
};

/**
 * Determine if a project requires a full SA&A or just web guidance
 * Returns: { requiresSAA: boolean, reason: string }
 */
function assessSAARequirement(projectInfo) {
  const { dataClassification = '', hasPII = false, description = '', appType = '' } = projectInfo;
  const descLower = (description || '').toLowerCase();

  // Always requires SA&A
  if (dataClassification === 'protected-b' || dataClassification === 'protected-a') {
    return { requiresSAA: true, reason: 'Data classification is ' + dataClassification };
  }
  if (hasPII) {
    return { requiresSAA: true, reason: 'Project handles personal information (PII)' };
  }

  // Check for complexity indicators even for unclassified
  const complexityIndicators = [
    'authentication', 'login', 'user accounts', 'database', 'api',
    'integration', 'payment', 'transaction', 'interconnect', 'saas',
    'portal', 'application', 'app'
  ];
  const hasComplexity = complexityIndicators.some(kw => descLower.includes(kw));

  if (dataClassification === 'unclassified' && !hasComplexity) {
    return {
      requiresSAA: false,
      reason: 'Unclassified static/informational web content with no PII, authentication, or system integrations'
    };
  }

  // Unclassified but with complexity still gets SA&A with minimal baseline controls
  return { requiresSAA: true, reason: 'Unclassified with application complexity' };
}

function getRecommendedControls(projectInfo) {
  const {
    dataClassification = 'protected-b',
    hostingType = '',       // azure, aws, gcp, ibm, on-premises
    appType = '',           // internal, external, hybrid
    hasPII = false,
    technologies = [],      // array of tech keys from COMMON_TECHNOLOGIES
    description = ''
  } = projectInfo;

  const descLower = (description || '').toLowerCase();
  const allTags = [];

  // Add tags based on project characteristics
  if (appType === 'external' || descLower.includes('public') || descLower.includes('external')) {
    allTags.push('public-content', 'external', 'waf', 'ddos', 'boundary');
  }
  if (hasPII || descLower.includes('pii') || descLower.includes('personal information')) {
    allTags.push('pii', 'privacy', 'retention', 'handling');
  }
  if (descLower.includes('api') || descLower.includes('integration') || descLower.includes('interconnect')) {
    allTags.push('interconnections', 'interfaces', 'isa');
  }
  if (descLower.includes('mobile') || descLower.includes('byod')) {
    allTags.push('device', 'byod', 'external');
  }

  // For unclassified projects: use a minimal baseline of essential web security controls
  const isUnclassified = dataClassification === 'unclassified';

  // Essential control IDs for any web-facing project (even unclassified)
  const BASIC_WEB_CONTROLS = [
    'AC-1',   // Access Control Policy
    'CA-1',   // Security Assessment Policy
    'CM-1',   // Configuration Management Policy
    'CM-6',   // Configuration Settings
    'IR-1',   // Incident Response Policy
    'IR-6',   // Incident Reporting
    'PL-1',   // Security Planning Policy
    'RA-1',   // Risk Assessment Policy
    'RA-5',   // Vulnerability Scanning
    'SA-1',   // System Acquisition Policy
    'SA-9',   // External Information System Services
    'SC-1',   // System Communications Policy
    'SC-5',   // Denial of Service Protection
    'SC-7',   // Boundary Protection
    'SC-8',   // Transmission Confidentiality (TLS)
    'SC-13',  // Cryptographic Protection
    'SC-20',  // Secure Name Resolution
    'SI-1',   // System Integrity Policy
    'SI-2',   // Flaw Remediation (patching)
    'SI-3',   // Malicious Code Protection
    'SI-5',   // Security Alerts
    'SI-10',  // Information Input Validation
  ];

  return CONTROLS.map(control => {
    let relevanceScore = 0;
    let techTagMatches = 0;
    let inheritedFrom = [];
    let tailoredDescription = control.description;

    // Check for technology inheritance
    technologies.forEach(tech => {
      if (control.commonInheritance.includes(tech)) {
        inheritedFrom.push(COMMON_TECHNOLOGIES[tech]?.name || tech);
        relevanceScore += 1;
        techTagMatches++;
      }
    });

    // Check tag relevance
    allTags.forEach(tag => {
      if (control.tags.includes(tag)) {
        relevanceScore += 2;
        techTagMatches++;
      }
    });

    // Profile match
    const profileMatch =
      (dataClassification === 'protected-b' && control.profile === 'PBMM') ||
      (dataClassification === 'protected-a' && (control.profile === 'PBMM' || control.profile === 'LOW'));
    if (profileMatch) {
      relevanceScore += 2;
    }

    // Priority bonus
    if (control.priority === 'P1') relevanceScore += 3;
    else if (control.priority === 'P2') relevanceScore += 2;
    else relevanceScore += 1;

    // Inclusion rules:
    let include;
    if (isUnclassified) {
      // For unclassified: include the basic web security baseline,
      // plus any controls matched by tech/tag (for projects with some complexity)
      include =
        BASIC_WEB_CONTROLS.includes(control.id) ||
        techTagMatches >= 1;
    } else {
      // Protected A/B: existing logic
      include =
        (control.priority === 'P1' && profileMatch) ||
        (control.priority === 'P2' && profileMatch && techTagMatches > 0) ||
        (control.priority === 'P3' && techTagMatches >= 2);
    }

    return {
      ...control,
      familyName: CONTROL_FAMILIES[control.family],
      relevanceScore,
      inheritedFrom,
      isInherited: inheritedFrom.length > 0,
      tailoredDescription,
      _include: include
    };
  }).filter(c => c._include)
    .sort((a, b) => {
      if (a.family !== b.family) return a.family.localeCompare(b.family);
      return a.id.localeCompare(b.id);
    });
}

/**
 * Group controls by family
 */
function groupByFamily(controls) {
  const grouped = {};
  controls.forEach(control => {
    if (!grouped[control.family]) {
      grouped[control.family] = {
        code: control.family,
        name: CONTROL_FAMILIES[control.family],
        controls: []
      };
    }
    grouped[control.family].controls.push(control);
  });
  return Object.values(grouped);
}

module.exports = {
  CONTROL_FAMILIES,
  COMMON_TECHNOLOGIES,
  CONTROLS,
  GC_WEB_GUIDANCE,
  getRecommendedControls,
  assessSAARequirement,
  groupByFamily
};
