/**
 * ITSG-33 Security Controls Catalog — Full Profile Edition
 * 
 * Based on:
 *  - ITSG-33 Annex 3A Security Control Catalogue (923 total controls)
 *  - ITSG-33 Annex 4A Profile 1 (PBMM) — ~310 controls + enhancements  
 *  - ITSG-33 Annex 4A Profile 3 (Secret/M/M) — ~380 controls + enhancements
 *  - CCCS Low Cloud Security Profile — ~220 controls
 *  - CCCS PBHVA Overlay — 137 controls (69 new + 68 from CCCS Medium)
 *  - NIST SP 800-53 R4 Moderate/High baselines (98% overlap with ITSG-33)
 *
 * Profile tags on each control:
 *   CCCS_LOW  — Included in CCCS Low Cloud Profile
 *   PBMM     — Included in ITSG-33 Profile 1 (Protected B / Medium / Medium)
 *   PBMM_HVA — Included in PBHVA overlay
 *   SECRET_MM — Included in ITSG-33 Profile 3 (Secret / Medium / Medium)
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
  { id: 'AC-1', family: 'AC', title: 'Access Control Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Control Policy and Procedures', evidenceGuidance: 'Provide AC policy document, review schedule, and approval records.', tags: ['policy', 'documentation'], commonInheritance: [] },
  { id: 'AC-2', family: 'AC', title: 'Account Management', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management', evidenceGuidance: 'Provide user account inventory, provisioning/deprovisioning procedures, and review logs.', tags: ['accounts', 'provisioning', 'lifecycle'], commonInheritance: [] },
  { id: 'AC-2(1)', family: 'AC', title: 'Account Management | Automated System Account Management', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Automated System Account Management', evidenceGuidance: 'Show automated account management (e.g., Entra ID lifecycle workflows).', tags: ['accounts', 'automation'], commonInheritance: [] },
  { id: 'AC-2(2)', family: 'AC', title: 'Account Management | Removal of Temporary/Emergency Accounts', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Removal of Temporary/Emergency Accounts', evidenceGuidance: 'Show policy and automation for temporary account expiry.', tags: ['accounts', 'temporary'], commonInheritance: [] },
  { id: 'AC-2(3)', family: 'AC', title: 'Account Management | Disable Inactive Accounts', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Disable Inactive Accounts', evidenceGuidance: 'Show configuration for disabling accounts after inactivity (≤90 days).', tags: ['accounts', 'inactive'], commonInheritance: [] },
  { id: 'AC-2(4)', family: 'AC', title: 'Account Management | Automated Audit Actions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Automated Audit Actions', evidenceGuidance: 'Show automated alerts for account events.', tags: ['accounts', 'audit'], commonInheritance: [] },
  { id: 'AC-2(5)', family: 'AC', title: 'Account Management | Inactivity Logout', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Inactivity Logout', evidenceGuidance: 'Show session timeout after inactivity.', tags: ['accounts', 'timeout'], commonInheritance: [] },
  { id: 'AC-2(7)', family: 'AC', title: 'Account Management | Role-Based Schemes', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Role-Based Schemes', evidenceGuidance: 'Provide RBAC model documentation and role definitions.', tags: ['accounts', 'rbac', 'roles'], commonInheritance: [] },
  { id: 'AC-2(9)', family: 'AC', title: 'Account Management | Restrictions on Shared/Group Accounts', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Restrictions on Shared/Group Accounts', evidenceGuidance: 'Provide policy restricting shared/group accounts.', tags: ['accounts', 'shared'], commonInheritance: [] },
  { id: 'AC-2(10)', family: 'AC', title: 'Account Management | Shared Account Credential Termination', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Shared Account Credential Termination', evidenceGuidance: 'Show shared credential rotation on member change.', tags: ['accounts', 'credentials'], commonInheritance: [] },
  { id: 'AC-2(12)', family: 'AC', title: 'Account Management | Account Monitoring/Atypical Usage', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Account Monitoring/Atypical Usage', evidenceGuidance: 'Show monitoring for atypical account usage.', tags: ['accounts', 'monitoring', 'anomaly'], commonInheritance: [] },
  { id: 'AC-2(13)', family: 'AC', title: 'Account Management | Disable Accounts for High-Risk Individuals', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Account Management | Disable Accounts for High-Risk Individuals', evidenceGuidance: 'Show process for disabling high-risk accounts.', tags: ['accounts', 'risk'], commonInheritance: [] },
  { id: 'AC-3', family: 'AC', title: 'Access Enforcement', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Enforcement', evidenceGuidance: 'Provide access control configuration and RBAC evidence.', tags: ['authorization', 'enforcement'], commonInheritance: [] },
  { id: 'AC-3(2)', family: 'AC', title: 'Access Enforcement | Dual Authorization', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Enforcement | Dual Authorization', evidenceGuidance: 'Show dual authorization for critical operations.', tags: ['authorization', 'dual-auth'], commonInheritance: [] },
  { id: 'AC-4', family: 'AC', title: 'Information Flow Enforcement', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Information Flow Enforcement', evidenceGuidance: 'Provide network diagram with flow controls (firewalls, ACLs, security groups).', tags: ['network', 'flow', 'firewall'], commonInheritance: [] },
  { id: 'AC-4(21)', family: 'AC', title: 'Information Flow Enforcement | Physical/Logical Separation', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Information Flow Enforcement | Physical/Logical Separation', evidenceGuidance: 'Show physical or logical separation of information flows.', tags: ['network', 'separation'], commonInheritance: [] },
  { id: 'AC-5', family: 'AC', title: 'Separation of Duties', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Separation of Duties', evidenceGuidance: 'Provide duty separation matrix and role conflict analysis.', tags: ['duties', 'separation', 'roles'], commonInheritance: [] },
  { id: 'AC-6', family: 'AC', title: 'Least Privilege', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege', evidenceGuidance: 'Show least privilege implementation; document elevated access justification.', tags: ['privilege', 'least-privilege'], commonInheritance: [] },
  { id: 'AC-6(1)', family: 'AC', title: 'Least Privilege | Authorize Access to Security Functions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Authorize Access to Security Functions', evidenceGuidance: 'Show restricted access to security functions.', tags: ['privilege', 'security-functions'], commonInheritance: [] },
  { id: 'AC-6(2)', family: 'AC', title: 'Least Privilege | Non-Privileged Access for Non-Security Functions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Non-Privileged Access for Non-Security Functions', evidenceGuidance: 'Show separate non-privileged accounts for non-security work.', tags: ['privilege', 'non-privileged'], commonInheritance: [] },
  { id: 'AC-6(3)', family: 'AC', title: 'Least Privilege | Network Access to Privileged Commands', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Network Access to Privileged Commands', evidenceGuidance: 'Show restrictions on network-based privileged access.', tags: ['privilege', 'network', 'remote'], commonInheritance: [] },
  { id: 'AC-6(5)', family: 'AC', title: 'Least Privilege | Privileged Accounts', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Privileged Accounts', evidenceGuidance: 'Provide list of privileged accounts and access justification.', tags: ['privilege', 'admin'], commonInheritance: [] },
  { id: 'AC-6(9)', family: 'AC', title: 'Least Privilege | Auditing Use of Privileged Functions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Auditing Use of Privileged Functions', evidenceGuidance: 'Show audit logging of privileged function execution.', tags: ['privilege', 'audit'], commonInheritance: [] },
  { id: 'AC-6(10)', family: 'AC', title: 'Least Privilege | Prohibit Non-Privileged Users from Executing Privileged Functions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Least Privilege | Prohibit Non-Privileged Users from Executing Privileged Functions', evidenceGuidance: 'Show technical enforcement preventing privilege escalation.', tags: ['privilege', 'enforcement'], commonInheritance: [] },
  { id: 'AC-7', family: 'AC', title: 'Unsuccessful Logon Attempts', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Unsuccessful Logon Attempts', evidenceGuidance: 'Show account lockout configuration after failed attempts.', tags: ['authentication', 'lockout'], commonInheritance: [] },
  { id: 'AC-8', family: 'AC', title: 'System Use Notification', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: System Use Notification', evidenceGuidance: 'Provide login banner text and screenshot.', tags: ['banner', 'notification'], commonInheritance: [] },
  { id: 'AC-10', family: 'AC', title: 'Concurrent Session Control', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Concurrent Session Control', evidenceGuidance: 'Show concurrent session limit configuration.', tags: ['session', 'concurrent'], commonInheritance: [] },
  { id: 'AC-11', family: 'AC', title: 'Session Lock', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Session Lock', evidenceGuidance: 'Show screen lock configuration (≤15 min inactivity).', tags: ['session', 'lock', 'timeout'], commonInheritance: [] },
  { id: 'AC-11(1)', family: 'AC', title: 'Session Lock | Pattern-Hiding Displays', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Session Lock | Pattern-Hiding Displays', evidenceGuidance: 'Show pattern-hiding on lock screen.', tags: ['session', 'display'], commonInheritance: [] },
  { id: 'AC-12', family: 'AC', title: 'Session Termination', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Session Termination', evidenceGuidance: 'Show automatic session termination after defined period.', tags: ['session', 'termination'], commonInheritance: [] },
  { id: 'AC-14', family: 'AC', title: 'Permitted Actions Without Identification or Authentication', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Permitted Actions Without Identification or Authentication', evidenceGuidance: 'Document any actions permitted without authentication.', tags: ['authentication', 'anonymous'], commonInheritance: [] },
  { id: 'AC-17', family: 'AC', title: 'Remote Access', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access', evidenceGuidance: 'Provide remote access policy and VPN configuration.', tags: ['remote', 'vpn'], commonInheritance: [] },
  { id: 'AC-17(1)', family: 'AC', title: 'Remote Access | Automated Monitoring/Control', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access | Automated Monitoring/Control', evidenceGuidance: 'Show automated monitoring of remote sessions.', tags: ['remote', 'monitoring'], commonInheritance: [] },
  { id: 'AC-17(2)', family: 'AC', title: 'Remote Access | Protection of Confidentiality/Integrity Using Encryption', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access | Protection of Confidentiality/Integrity Using Encryption', evidenceGuidance: 'Show encryption for remote access (TLS, IPsec).', tags: ['remote', 'encryption'], commonInheritance: [] },
  { id: 'AC-17(3)', family: 'AC', title: 'Remote Access | Managed Access Control Points', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access | Managed Access Control Points', evidenceGuidance: 'Show limited, managed entry points for remote access.', tags: ['remote', 'access-points'], commonInheritance: [] },
  { id: 'AC-17(4)', family: 'AC', title: 'Remote Access | Privileged Commands/Access', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access | Privileged Commands/Access', evidenceGuidance: 'Document restrictions on remote privileged access.', tags: ['remote', 'privilege'], commonInheritance: [] },
  { id: 'AC-17(100)', family: 'AC', title: 'Remote Access | GC Remote Access (ITSG-33)', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Remote Access | GC Remote Access (ITSG-33)', evidenceGuidance: 'Provide GC-specific remote access authorization documentation.', tags: ['remote', 'gc-specific'], commonInheritance: [] },
  { id: 'AC-18', family: 'AC', title: 'Wireless Access', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Wireless Access', evidenceGuidance: 'Provide wireless access policy and security configuration.', tags: ['wireless'], commonInheritance: [] },
  { id: 'AC-18(1)', family: 'AC', title: 'Wireless Access | Authentication and Encryption', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Wireless Access | Authentication and Encryption', evidenceGuidance: 'Show wireless encryption (WPA3/WPA2-Enterprise) and 802.1X.', tags: ['wireless', 'encryption'], commonInheritance: [] },
  { id: 'AC-19', family: 'AC', title: 'Access Control for Mobile Devices', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Control for Mobile Devices', evidenceGuidance: 'Provide MDM policy and configuration (e.g., Intune).', tags: ['mobile', 'mdm', 'device'], commonInheritance: [] },
  { id: 'AC-19(5)', family: 'AC', title: 'Access Control for Mobile Devices | Full Device/Container Encryption', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Control for Mobile Devices | Full Device/Container Encryption', evidenceGuidance: 'Show mobile device encryption enforcement.', tags: ['mobile', 'encryption'], commonInheritance: [] },
  { id: 'AC-19(100)', family: 'AC', title: 'Access Control for Mobile Devices | GC Mobile (ITSG-33)', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Access Control for Mobile Devices | GC Mobile (ITSG-33)', evidenceGuidance: 'Provide GC-specific mobile device management evidence.', tags: ['mobile', 'gc-specific'], commonInheritance: [] },
  { id: 'AC-20', family: 'AC', title: 'Use of External Information Systems', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Use of External Information Systems', evidenceGuidance: 'Document approved external systems and interconnection agreements.', tags: ['external', 'interconnections'], commonInheritance: [] },
  { id: 'AC-20(1)', family: 'AC', title: 'Use of External Systems | Limits on Authorized Use', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Use of External Systems | Limits on Authorized Use', evidenceGuidance: 'Show limits on external user access.', tags: ['external', 'limits'], commonInheritance: [] },
  { id: 'AC-20(2)', family: 'AC', title: 'Use of External Systems | Portable Storage Devices', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Use of External Systems | Portable Storage Devices', evidenceGuidance: 'Show policy restricting portable storage on external systems.', tags: ['external', 'storage', 'usb'], commonInheritance: [] },
  { id: 'AC-21', family: 'AC', title: 'Information Sharing', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Information Sharing', evidenceGuidance: 'Provide information sharing agreements and access controls.', tags: ['sharing', 'agreements'], commonInheritance: [] },
  { id: 'AC-22', family: 'AC', title: 'Publicly Accessible Content', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Access Control: Publicly Accessible Content', evidenceGuidance: 'Show review/approval process for public content.', tags: ['public-content', 'review'], commonInheritance: [] },
  { id: 'AT-1', family: 'AT', title: 'Security Awareness and Training Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Awareness and Training: Security Awareness and Training Policy and Procedures', evidenceGuidance: 'Provide security awareness and training policy.', tags: ['policy', 'training'], commonInheritance: [] },
  { id: 'AT-2', family: 'AT', title: 'Security Awareness Training', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Awareness and Training: Security Awareness Training', evidenceGuidance: 'Provide training records, completion rates, curriculum.', tags: ['training', 'awareness'], commonInheritance: [] },
  { id: 'AT-2(2)', family: 'AT', title: 'Security Awareness Training | Insider Threat', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Awareness and Training: Security Awareness Training | Insider Threat', evidenceGuidance: 'Show insider threat awareness training.', tags: ['training', 'insider-threat'], commonInheritance: [] },
  { id: 'AT-3', family: 'AT', title: 'Role-Based Security Training', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Awareness and Training: Role-Based Security Training', evidenceGuidance: 'Provide role-specific training records.', tags: ['training', 'role-based'], commonInheritance: [] },
  { id: 'AT-4', family: 'AT', title: 'Security Training Records', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Awareness and Training: Security Training Records', evidenceGuidance: 'Provide training tracking system and retention policy.', tags: ['training', 'records'], commonInheritance: [] },
  { id: 'AU-1', family: 'AU', title: 'Audit and Accountability Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit and Accountability Policy and Procedures', evidenceGuidance: 'Provide audit policy with retention requirements.', tags: ['policy', 'audit'], commonInheritance: [] },
  { id: 'AU-2', family: 'AU', title: 'Audit Events', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Events', evidenceGuidance: 'Provide list of auditable events and configuration evidence.', tags: ['audit', 'events'], commonInheritance: [] },
  { id: 'AU-2(3)', family: 'AU', title: 'Audit Events | Reviews and Updates', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Events | Reviews and Updates', evidenceGuidance: 'Show periodic review/update of auditable events.', tags: ['audit', 'review'], commonInheritance: [] },
  { id: 'AU-3', family: 'AU', title: 'Content of Audit Records', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Content of Audit Records', evidenceGuidance: 'Show sample audit records with required fields.', tags: ['audit', 'content'], commonInheritance: [] },
  { id: 'AU-3(1)', family: 'AU', title: 'Content of Audit Records | Additional Audit Information', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Content of Audit Records | Additional Audit Information', evidenceGuidance: 'Show additional audit fields (source IP, object IDs).', tags: ['audit', 'content', 'extended'], commonInheritance: [] },
  { id: 'AU-4', family: 'AU', title: 'Audit Storage Capacity', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Storage Capacity', evidenceGuidance: 'Show audit log storage allocation and capacity.', tags: ['audit', 'storage'], commonInheritance: [] },
  { id: 'AU-5', family: 'AU', title: 'Response to Audit Processing Failures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Response to Audit Processing Failures', evidenceGuidance: 'Show alerting for audit processing failures.', tags: ['audit', 'failure', 'alerting'], commonInheritance: [] },
  { id: 'AU-5(1)', family: 'AU', title: 'Response to Audit Failures | Audit Storage Capacity', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Response to Audit Failures | Audit Storage Capacity', evidenceGuidance: 'Show automatic response when storage threshold reached.', tags: ['audit', 'storage', 'capacity'], commonInheritance: [] },
  { id: 'AU-5(2)', family: 'AU', title: 'Response to Audit Failures | Real-Time Alerts', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Response to Audit Failures | Real-Time Alerts', evidenceGuidance: 'Show real-time alerting for audit failures.', tags: ['audit', 'alerting', 'real-time'], commonInheritance: [] },
  { id: 'AU-6', family: 'AU', title: 'Audit Review, Analysis, and Reporting', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Review, Analysis, and Reporting', evidenceGuidance: 'Provide audit review schedule and sample reports.', tags: ['audit', 'review', 'analysis'], commonInheritance: [] },
  { id: 'AU-6(1)', family: 'AU', title: 'Audit Review | Process Integration', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Review | Process Integration', evidenceGuidance: 'Show audit review integrated with other security processes.', tags: ['audit', 'integration'], commonInheritance: [] },
  { id: 'AU-6(3)', family: 'AU', title: 'Audit Review | Correlate Audit Repositories', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Review | Correlate Audit Repositories', evidenceGuidance: 'Show SIEM correlation of audit data.', tags: ['audit', 'correlation', 'siem'], commonInheritance: [] },
  { id: 'AU-7', family: 'AU', title: 'Audit Reduction and Report Generation', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Reduction and Report Generation', evidenceGuidance: 'Show audit reduction and reporting capabilities.', tags: ['audit', 'reporting'], commonInheritance: [] },
  { id: 'AU-7(1)', family: 'AU', title: 'Audit Reduction | Automatic Processing', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Reduction | Automatic Processing', evidenceGuidance: 'Show automated audit processing and filtering.', tags: ['audit', 'automation'], commonInheritance: [] },
  { id: 'AU-8', family: 'AU', title: 'Time Stamps', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Time Stamps', evidenceGuidance: 'Show NTP configuration and time synchronization.', tags: ['audit', 'time', 'ntp'], commonInheritance: [] },
  { id: 'AU-8(1)', family: 'AU', title: 'Time Stamps | Synchronization with Authoritative Source', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Time Stamps | Synchronization with Authoritative Source', evidenceGuidance: 'Show sync with authoritative time source.', tags: ['audit', 'time', 'synchronization'], commonInheritance: [] },
  { id: 'AU-9', family: 'AU', title: 'Protection of Audit Information', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Protection of Audit Information', evidenceGuidance: 'Show audit log integrity protections.', tags: ['audit', 'protection', 'integrity'], commonInheritance: [] },
  { id: 'AU-9(2)', family: 'AU', title: 'Protection of Audit Info | Backup on Separate System', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Protection of Audit Info | Backup on Separate System', evidenceGuidance: 'Show audit logs backed up to separate system.', tags: ['audit', 'backup', 'separation'], commonInheritance: [] },
  { id: 'AU-9(4)', family: 'AU', title: 'Protection of Audit Info | Access by Subset of Privileged Users', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Protection of Audit Info | Access by Subset of Privileged Users', evidenceGuidance: 'Show audit access restricted to designated admins.', tags: ['audit', 'access', 'privilege'], commonInheritance: [] },
  { id: 'AU-10', family: 'AU', title: 'Non-Repudiation', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Non-Repudiation', evidenceGuidance: 'Show non-repudiation for critical transactions.', tags: ['audit', 'non-repudiation'], commonInheritance: [] },
  { id: 'AU-11', family: 'AU', title: 'Audit Record Retention', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Record Retention', evidenceGuidance: 'Show retention meeting GC requirements (≥2 years).', tags: ['audit', 'retention'], commonInheritance: [] },
  { id: 'AU-12', family: 'AU', title: 'Audit Generation', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Generation', evidenceGuidance: 'Show audit generation at all system components.', tags: ['audit', 'generation'], commonInheritance: [] },
  { id: 'AU-12(1)', family: 'AU', title: 'Audit Generation | System-Wide Time-Correlated Trail', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Audit and Accountability: Audit Generation | System-Wide Time-Correlated Trail', evidenceGuidance: 'Show system-wide correlated audit trail.', tags: ['audit', 'correlation'], commonInheritance: [] },
  { id: 'CA-1', family: 'CA', title: 'Security Assessment and Authorization Policies', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Security Assessment and Authorization Policies', evidenceGuidance: 'Provide SA&A policy and procedures.', tags: ['policy', 'assessment'], commonInheritance: [] },
  { id: 'CA-2', family: 'CA', title: 'Security Assessments', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Security Assessments', evidenceGuidance: 'Provide assessment plan, procedures, and results.', tags: ['assessment', 'testing'], commonInheritance: [] },
  { id: 'CA-2(1)', family: 'CA', title: 'Security Assessments | Independent Assessors', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Security Assessments | Independent Assessors', evidenceGuidance: 'Show independent assessor engagement.', tags: ['assessment', 'independent'], commonInheritance: [] },
  { id: 'CA-3', family: 'CA', title: 'System Interconnections', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: System Interconnections', evidenceGuidance: 'Provide ISAs and MoUs for interconnections.', tags: ['interconnections', 'isa', 'agreements'], commonInheritance: [] },
  { id: 'CA-3(5)', family: 'CA', title: 'System Interconnections | Restrictions on External Connections', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: System Interconnections | Restrictions on External Connections', evidenceGuidance: 'Show restrictions on external connections.', tags: ['interconnections', 'external', 'restrictions'], commonInheritance: [] },
  { id: 'CA-5', family: 'CA', title: 'Plan of Action and Milestones', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Plan of Action and Milestones', evidenceGuidance: 'Provide current POA&M document.', tags: ['poam', 'remediation'], commonInheritance: [] },
  { id: 'CA-6', family: 'CA', title: 'Security Authorization', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Security Authorization', evidenceGuidance: 'Provide ATO/iATO letter signed by authorizing official.', tags: ['authorization', 'ato'], commonInheritance: [] },
  { id: 'CA-7', family: 'CA', title: 'Continuous Monitoring', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Continuous Monitoring', evidenceGuidance: 'Provide continuous monitoring strategy and evidence.', tags: ['monitoring', 'continuous'], commonInheritance: [] },
  { id: 'CA-7(1)', family: 'CA', title: 'Continuous Monitoring | Independent Assessment', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Continuous Monitoring | Independent Assessment', evidenceGuidance: 'Show independent assessment in monitoring program.', tags: ['monitoring', 'independent'], commonInheritance: [] },
  { id: 'CA-8', family: 'CA', title: 'Penetration Testing', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Penetration Testing', evidenceGuidance: 'Provide penetration test report and remediation.', tags: ['testing', 'penetration'], commonInheritance: [] },
  { id: 'CA-9', family: 'CA', title: 'Internal System Connections', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Security Assessment and Authorization: Internal System Connections', evidenceGuidance: 'Document internal connections and authorizations.', tags: ['interconnections', 'internal'], commonInheritance: [] },
  { id: 'CM-1', family: 'CM', title: 'Configuration Management Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Configuration Management Policy and Procedures', evidenceGuidance: 'Provide CM policy document.', tags: ['policy', 'configuration'], commonInheritance: [] },
  { id: 'CM-2', family: 'CM', title: 'Baseline Configuration', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Baseline Configuration', evidenceGuidance: 'Provide baseline configuration for all components.', tags: ['baseline', 'configuration'], commonInheritance: [] },
  { id: 'CM-2(1)', family: 'CM', title: 'Baseline Configuration | Reviews and Updates', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Baseline Configuration | Reviews and Updates', evidenceGuidance: 'Show periodic baseline review/update (annual).', tags: ['baseline', 'review'], commonInheritance: [] },
  { id: 'CM-2(3)', family: 'CM', title: 'Baseline Configuration | Retention of Previous Configurations', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Baseline Configuration | Retention of Previous Configurations', evidenceGuidance: 'Show retention of previous baselines for rollback.', tags: ['baseline', 'retention', 'rollback'], commonInheritance: [] },
  { id: 'CM-2(7)', family: 'CM', title: 'Baseline Configuration | High-Risk Areas', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Baseline Configuration | High-Risk Areas', evidenceGuidance: 'Show hardened config for high-risk deployments.', tags: ['baseline', 'hardening'], commonInheritance: [] },
  { id: 'CM-3', family: 'CM', title: 'Configuration Change Control', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Configuration Change Control', evidenceGuidance: 'Provide change management process and records.', tags: ['change-management', 'control'], commonInheritance: [] },
  { id: 'CM-3(2)', family: 'CM', title: 'Change Control | Test/Validate/Document Changes', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Change Control | Test/Validate/Document Changes', evidenceGuidance: 'Show testing/validation before production.', tags: ['change-management', 'testing'], commonInheritance: [] },
  { id: 'CM-4', family: 'CM', title: 'Security Impact Analysis', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Security Impact Analysis', evidenceGuidance: 'Provide security impact analysis for recent changes.', tags: ['change-management', 'impact-analysis'], commonInheritance: [] },
  { id: 'CM-5', family: 'CM', title: 'Access Restrictions for Change', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Access Restrictions for Change', evidenceGuidance: 'Show restricted change access (dev/test vs production).', tags: ['change-management', 'access'], commonInheritance: [] },
  { id: 'CM-5(1)', family: 'CM', title: 'Access Restrictions for Change | Automated Enforcement', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Access Restrictions for Change | Automated Enforcement', evidenceGuidance: 'Show automated change access enforcement.', tags: ['change-management', 'automation'], commonInheritance: [] },
  { id: 'CM-6', family: 'CM', title: 'Configuration Settings', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Configuration Settings', evidenceGuidance: 'Provide security config standards (CIS, STIG) and compliance.', tags: ['configuration', 'hardening', 'benchmarks'], commonInheritance: [] },
  { id: 'CM-6(1)', family: 'CM', title: 'Configuration Settings | Automated Central Management', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Configuration Settings | Automated Central Management', evidenceGuidance: 'Show centralized config management (Azure Policy, AWS Config).', tags: ['configuration', 'automation'], commonInheritance: [] },
  { id: 'CM-7', family: 'CM', title: 'Least Functionality', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Least Functionality', evidenceGuidance: 'Show disabled unnecessary services, ports, protocols.', tags: ['configuration', 'hardening', 'least-functionality'], commonInheritance: [] },
  { id: 'CM-7(1)', family: 'CM', title: 'Least Functionality | Periodic Review', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Least Functionality | Periodic Review', evidenceGuidance: 'Show periodic review of enabled functions.', tags: ['configuration', 'review'], commonInheritance: [] },
  { id: 'CM-7(2)', family: 'CM', title: 'Least Functionality | Prevent Program Execution', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Least Functionality | Prevent Program Execution', evidenceGuidance: 'Show application whitelisting.', tags: ['configuration', 'whitelisting'], commonInheritance: [] },
  { id: 'CM-7(5)', family: 'CM', title: 'Least Functionality | Authorized Software Whitelisting', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Least Functionality | Authorized Software Whitelisting', evidenceGuidance: 'Show authorized software inventory and enforcement.', tags: ['configuration', 'whitelisting', 'inventory'], commonInheritance: [] },
  { id: 'CM-8', family: 'CM', title: 'Information System Component Inventory', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Information System Component Inventory', evidenceGuidance: 'Provide complete component inventory with owners.', tags: ['inventory', 'assets'], commonInheritance: [] },
  { id: 'CM-8(1)', family: 'CM', title: 'Component Inventory | Updates During Installations/Removals', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Component Inventory | Updates During Installations/Removals', evidenceGuidance: 'Show inventory updates on installations/removals.', tags: ['inventory', 'lifecycle'], commonInheritance: [] },
  { id: 'CM-8(3)', family: 'CM', title: 'Component Inventory | Automated Unauthorized Detection', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Component Inventory | Automated Unauthorized Detection', evidenceGuidance: 'Show automated detection of unauthorized components.', tags: ['inventory', 'detection'], commonInheritance: [] },
  { id: 'CM-8(5)', family: 'CM', title: 'Component Inventory | No Duplicate Accounting', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Component Inventory | No Duplicate Accounting', evidenceGuidance: 'Show prevention of duplicate component accounting.', tags: ['inventory', 'accuracy'], commonInheritance: [] },
  { id: 'CM-9', family: 'CM', title: 'Configuration Management Plan', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Configuration Management Plan', evidenceGuidance: 'Provide CM plan document.', tags: ['configuration', 'planning'], commonInheritance: [] },
  { id: 'CM-10', family: 'CM', title: 'Software Usage Restrictions', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Software Usage Restrictions', evidenceGuidance: 'Show software license compliance.', tags: ['software', 'licensing'], commonInheritance: [] },
  { id: 'CM-10(1)', family: 'CM', title: 'Software Usage | Open Source Software', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: Software Usage | Open Source Software', evidenceGuidance: 'Show open source governance.', tags: ['software', 'open-source'], commonInheritance: [] },
  { id: 'CM-11', family: 'CM', title: 'User-Installed Software', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Configuration Management: User-Installed Software', evidenceGuidance: 'Show restrictions on user-installed software.', tags: ['software', 'installation', 'restrictions'], commonInheritance: [] },
  { id: 'CP-1', family: 'CP', title: 'Contingency Planning Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Planning Policy and Procedures', evidenceGuidance: 'Provide contingency planning policy.', tags: ['policy', 'contingency', 'disaster-recovery'], commonInheritance: [] },
  { id: 'CP-2', family: 'CP', title: 'Contingency Plan', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Plan', evidenceGuidance: 'Provide contingency plan with BIA and recovery procedures.', tags: ['contingency', 'plan', 'bia'], commonInheritance: [] },
  { id: 'CP-2(1)', family: 'CP', title: 'Contingency Plan | Coordinate with Related Plans', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Plan | Coordinate with Related Plans', evidenceGuidance: 'Show coordination with COOP/DRP plans.', tags: ['contingency', 'coordination'], commonInheritance: [] },
  { id: 'CP-2(3)', family: 'CP', title: 'Contingency Plan | Resume Essential Functions', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Plan | Resume Essential Functions', evidenceGuidance: 'Show defined RTOs and recovery procedures.', tags: ['contingency', 'rto', 'recovery'], commonInheritance: [] },
  { id: 'CP-2(8)', family: 'CP', title: 'Contingency Plan | Identify Critical Assets', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Plan | Identify Critical Assets', evidenceGuidance: 'Show identification of critical assets.', tags: ['contingency', 'critical-assets'], commonInheritance: [] },
  { id: 'CP-3', family: 'CP', title: 'Contingency Training', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Training', evidenceGuidance: 'Provide contingency training records.', tags: ['contingency', 'training'], commonInheritance: [] },
  { id: 'CP-4', family: 'CP', title: 'Contingency Plan Testing', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Plan Testing', evidenceGuidance: 'Provide test results (annual minimum).', tags: ['contingency', 'testing'], commonInheritance: [] },
  { id: 'CP-4(1)', family: 'CP', title: 'Contingency Testing | Coordinate with Related Plans', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Contingency Testing | Coordinate with Related Plans', evidenceGuidance: 'Show coordinated testing.', tags: ['contingency', 'testing', 'coordination'], commonInheritance: [] },
  { id: 'CP-6', family: 'CP', title: 'Alternate Storage Site', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Storage Site', evidenceGuidance: 'Provide alternate storage site documentation.', tags: ['contingency', 'storage', 'alternate-site'], commonInheritance: [] },
  { id: 'CP-6(1)', family: 'CP', title: 'Alternate Storage Site | Separation from Primary', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Storage Site | Separation from Primary', evidenceGuidance: 'Show geographic separation.', tags: ['contingency', 'storage', 'separation'], commonInheritance: [] },
  { id: 'CP-6(3)', family: 'CP', title: 'Alternate Storage Site | Accessibility', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Storage Site | Accessibility', evidenceGuidance: 'Show alternate site accessibility.', tags: ['contingency', 'accessibility'], commonInheritance: [] },
  { id: 'CP-7', family: 'CP', title: 'Alternate Processing Site', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Processing Site', evidenceGuidance: 'Provide alternate processing site and failover procedures.', tags: ['contingency', 'processing', 'failover'], commonInheritance: [] },
  { id: 'CP-7(1)', family: 'CP', title: 'Alternate Processing | Separation from Primary', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Processing | Separation from Primary', evidenceGuidance: 'Show geographic separation.', tags: ['contingency', 'processing', 'separation'], commonInheritance: [] },
  { id: 'CP-7(2)', family: 'CP', title: 'Alternate Processing | Accessibility', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Processing | Accessibility', evidenceGuidance: 'Show accessibility during disruption.', tags: ['contingency', 'processing', 'accessibility'], commonInheritance: [] },
  { id: 'CP-7(3)', family: 'CP', title: 'Alternate Processing | Priority of Service', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Alternate Processing | Priority of Service', evidenceGuidance: 'Show priority of service provisions.', tags: ['contingency', 'priority'], commonInheritance: [] },
  { id: 'CP-8', family: 'CP', title: 'Telecommunications Services', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Telecommunications Services', evidenceGuidance: 'Provide alternate telecom documentation.', tags: ['contingency', 'telecommunications'], commonInheritance: [] },
  { id: 'CP-8(1)', family: 'CP', title: 'Telecommunications | Priority of Service', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Telecommunications | Priority of Service', evidenceGuidance: 'Show priority telecom agreements.', tags: ['contingency', 'telecommunications', 'priority'], commonInheritance: [] },
  { id: 'CP-8(2)', family: 'CP', title: 'Telecommunications | Single Points of Failure', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Telecommunications | Single Points of Failure', evidenceGuidance: 'Show SPOF analysis for telecom.', tags: ['contingency', 'telecommunications', 'spof'], commonInheritance: [] },
  { id: 'CP-9', family: 'CP', title: 'Information System Backup', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Information System Backup', evidenceGuidance: 'Provide backup policy, schedule, and test results.', tags: ['backup', 'recovery'], commonInheritance: [] },
  { id: 'CP-9(1)', family: 'CP', title: 'Backup | Testing for Reliability/Integrity', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Backup | Testing for Reliability/Integrity', evidenceGuidance: 'Show backup restoration testing.', tags: ['backup', 'testing'], commonInheritance: [] },
  { id: 'CP-9(3)', family: 'CP', title: 'Backup | Separate Storage for Critical Info', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Backup | Separate Storage for Critical Info', evidenceGuidance: 'Show separate storage for critical backups.', tags: ['backup', 'separation'], commonInheritance: [] },
  { id: 'CP-10', family: 'CP', title: 'Information System Recovery and Reconstitution', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Information System Recovery and Reconstitution', evidenceGuidance: 'Provide recovery procedures and test evidence.', tags: ['recovery', 'reconstitution'], commonInheritance: [] },
  { id: 'CP-10(2)', family: 'CP', title: 'Recovery | Transaction Recovery', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Contingency Planning: Recovery | Transaction Recovery', evidenceGuidance: 'Show transaction-level recovery.', tags: ['recovery', 'transaction'], commonInheritance: [] },
  { id: 'IA-1', family: 'IA', title: 'Identification and Authentication Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Identification and Authentication Policy and Procedures', evidenceGuidance: 'Provide I&A policy document.', tags: ['policy', 'authentication', 'identity'], commonInheritance: [] },
  { id: 'IA-2', family: 'IA', title: 'Identification and Authentication (Organizational Users)', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Identification and Authentication (Organizational Users)', evidenceGuidance: 'Show user I&A mechanism.', tags: ['authentication', 'users'], commonInheritance: [] },
  { id: 'IA-2(1)', family: 'IA', title: 'I&A | MFA for Privileged Network Access', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | MFA for Privileged Network Access', evidenceGuidance: 'Show MFA for privileged network access.', tags: ['authentication', 'mfa', 'privileged'], commonInheritance: [] },
  { id: 'IA-2(2)', family: 'IA', title: 'I&A | MFA for Non-Privileged Network Access', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | MFA for Non-Privileged Network Access', evidenceGuidance: 'Show MFA for non-privileged network access.', tags: ['authentication', 'mfa', 'network'], commonInheritance: [] },
  { id: 'IA-2(3)', family: 'IA', title: 'I&A | MFA for Local Privileged Access', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | MFA for Local Privileged Access', evidenceGuidance: 'Show MFA for local privileged access.', tags: ['authentication', 'mfa', 'local'], commonInheritance: [] },
  { id: 'IA-2(8)', family: 'IA', title: 'I&A | Replay-Resistant Privileged Authentication', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | Replay-Resistant Privileged Authentication', evidenceGuidance: 'Show replay-resistant auth for privileged access.', tags: ['authentication', 'replay'], commonInheritance: [] },
  { id: 'IA-2(11)', family: 'IA', title: 'I&A | Remote Access — Separate Device', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | Remote Access — Separate Device', evidenceGuidance: 'Show separate device for MFA remote access.', tags: ['authentication', 'mfa', 'remote'], commonInheritance: [] },
  { id: 'IA-2(12)', family: 'IA', title: 'I&A | Acceptance of PIV Credentials', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A | Acceptance of PIV Credentials', evidenceGuidance: 'Show PIV-equivalent credential acceptance (GC PKI).', tags: ['authentication', 'pki', 'piv'], commonInheritance: [] },
  { id: 'IA-3', family: 'IA', title: 'Device Identification and Authentication', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Device Identification and Authentication', evidenceGuidance: 'Show device authentication (802.1X, certificates).', tags: ['authentication', 'device'], commonInheritance: [] },
  { id: 'IA-4', family: 'IA', title: 'Identifier Management', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Identifier Management', evidenceGuidance: 'Show user ID management (unique, no reuse).', tags: ['identity', 'identifiers'], commonInheritance: [] },
  { id: 'IA-4(4)', family: 'IA', title: 'Identifier Management | Identify User Status', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Identifier Management | Identify User Status', evidenceGuidance: 'Show user status identification (contractor, employee).', tags: ['identity', 'status'], commonInheritance: [] },
  { id: 'IA-5', family: 'IA', title: 'Authenticator Management', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management', evidenceGuidance: 'Provide password policy and authenticator management.', tags: ['authentication', 'passwords', 'credentials'], commonInheritance: [] },
  { id: 'IA-5(1)', family: 'IA', title: 'Authenticator Management | Password-Based Authentication', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | Password-Based Authentication', evidenceGuidance: 'Show password complexity, history, and age config.', tags: ['authentication', 'passwords', 'complexity'], commonInheritance: [] },
  { id: 'IA-5(2)', family: 'IA', title: 'Authenticator Management | PKI-Based Authentication', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | PKI-Based Authentication', evidenceGuidance: 'Show PKI certificate management and validation.', tags: ['authentication', 'pki', 'certificates'], commonInheritance: [] },
  { id: 'IA-5(3)', family: 'IA', title: 'Authenticator Management | In-Person/Third-Party Registration', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | In-Person/Third-Party Registration', evidenceGuidance: 'Show identity proofing for registration.', tags: ['authentication', 'registration', 'proofing'], commonInheritance: [] },
  { id: 'IA-5(4)', family: 'IA', title: 'Authenticator Management | Automated Password Strength', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | Automated Password Strength', evidenceGuidance: 'Show automated password strength enforcement.', tags: ['authentication', 'passwords', 'automation'], commonInheritance: [] },
  { id: 'IA-5(6)', family: 'IA', title: 'Authenticator Management | Protection of Authenticators', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | Protection of Authenticators', evidenceGuidance: 'Show protection of stored authenticators (hashing).', tags: ['authentication', 'protection'], commonInheritance: [] },
  { id: 'IA-5(7)', family: 'IA', title: 'Authenticator Management | No Embedded Unencrypted Static Authenticators', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | No Embedded Unencrypted Static Authenticators', evidenceGuidance: 'Show no hardcoded credentials.', tags: ['authentication', 'credentials', 'hardcoded'], commonInheritance: [] },
  { id: 'IA-5(11)', family: 'IA', title: 'Authenticator Management | Hardware Token Authentication', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Management | Hardware Token Authentication', evidenceGuidance: 'Show hardware token auth for privileged users.', tags: ['authentication', 'hardware-token'], commonInheritance: [] },
  { id: 'IA-6', family: 'IA', title: 'Authenticator Feedback', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Authenticator Feedback', evidenceGuidance: 'Show obscured authenticator feedback during login.', tags: ['authentication', 'feedback'], commonInheritance: [] },
  { id: 'IA-7', family: 'IA', title: 'Cryptographic Module Authentication', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: Cryptographic Module Authentication', evidenceGuidance: 'Show FIPS 140-2 validated crypto module usage.', tags: ['authentication', 'cryptography', 'fips'], commonInheritance: [] },
  { id: 'IA-8', family: 'IA', title: 'I&A (Non-Organizational Users)', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A (Non-Organizational Users)', evidenceGuidance: 'Show I&A for external/non-org users.', tags: ['authentication', 'external-users'], commonInheritance: [] },
  { id: 'IA-8(1)', family: 'IA', title: 'I&A Non-Org | Acceptance of PIV from Other Orgs', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A Non-Org | Acceptance of PIV from Other Orgs', evidenceGuidance: 'Show PIV credential acceptance from other orgs.', tags: ['authentication', 'external', 'piv'], commonInheritance: [] },
  { id: 'IA-8(2)', family: 'IA', title: 'I&A Non-Org | Third-Party Credentials', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A Non-Org | Third-Party Credentials', evidenceGuidance: 'Show acceptance of third-party credentials.', tags: ['authentication', 'external', 'federation'], commonInheritance: [] },
  { id: 'IA-8(3)', family: 'IA', title: 'I&A Non-Org | FICAM-Approved Products', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A Non-Org | FICAM-Approved Products', evidenceGuidance: 'Show FICAM-equivalent identity products.', tags: ['authentication', 'external', 'ficam'], commonInheritance: [] },
  { id: 'IA-8(4)', family: 'IA', title: 'I&A Non-Org | FICAM-Issued Profiles', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A Non-Org | FICAM-Issued Profiles', evidenceGuidance: 'Show FICAM-equivalent identity profiles.', tags: ['authentication', 'external', 'profiles'], commonInheritance: [] },
  { id: 'IA-8(100)', family: 'IA', title: 'I&A Non-Org | GC External Authentication (ITSG-33)', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Identification and Authentication: I&A Non-Org | GC External Authentication (ITSG-33)', evidenceGuidance: 'Provide GC-specific external auth evidence.', tags: ['authentication', 'gc-specific', 'external'], commonInheritance: [] },
  { id: 'IR-1', family: 'IR', title: 'Incident Response Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Response Policy and Procedures', evidenceGuidance: 'Provide IR policy and procedures.', tags: ['policy', 'incident'], commonInheritance: [] },
  { id: 'IR-2', family: 'IR', title: 'Incident Response Training', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Response Training', evidenceGuidance: 'Provide IR training records.', tags: ['incident', 'training'], commonInheritance: [] },
  { id: 'IR-3', family: 'IR', title: 'Incident Response Testing', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Response Testing', evidenceGuidance: 'Provide IR test/exercise results (annual).', tags: ['incident', 'testing', 'exercise'], commonInheritance: [] },
  { id: 'IR-3(2)', family: 'IR', title: 'IR Testing | Coordination with Related Plans', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: IR Testing | Coordination with Related Plans', evidenceGuidance: 'Show IR testing coordination.', tags: ['incident', 'testing', 'coordination'], commonInheritance: [] },
  { id: 'IR-4', family: 'IR', title: 'Incident Handling', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Handling', evidenceGuidance: 'Provide handling procedures and recent logs.', tags: ['incident', 'handling'], commonInheritance: [] },
  { id: 'IR-4(1)', family: 'IR', title: 'Incident Handling | Automated Processes', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Handling | Automated Processes', evidenceGuidance: 'Show automated incident handling (SOAR).', tags: ['incident', 'automation'], commonInheritance: [] },
  { id: 'IR-5', family: 'IR', title: 'Incident Monitoring', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Monitoring', evidenceGuidance: 'Show incident tracking and trending.', tags: ['incident', 'monitoring'], commonInheritance: [] },
  { id: 'IR-6', family: 'IR', title: 'Incident Reporting', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Reporting', evidenceGuidance: 'Show reporting procedures (incl. CCCS GC-CIRT).', tags: ['incident', 'reporting', 'gc-cirt'], commonInheritance: [] },
  { id: 'IR-6(1)', family: 'IR', title: 'Incident Reporting | Automated Reporting', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Reporting | Automated Reporting', evidenceGuidance: 'Show automated incident reporting.', tags: ['incident', 'reporting', 'automation'], commonInheritance: [] },
  { id: 'IR-7', family: 'IR', title: 'Incident Response Assistance', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Response Assistance', evidenceGuidance: 'Show IR assistance resources.', tags: ['incident', 'assistance'], commonInheritance: [] },
  { id: 'IR-7(1)', family: 'IR', title: 'IR Assistance | Automation Support', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: IR Assistance | Automation Support', evidenceGuidance: 'Show automated IR assistance.', tags: ['incident', 'automation', 'support'], commonInheritance: [] },
  { id: 'IR-8', family: 'IR', title: 'Incident Response Plan', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Incident Response Plan', evidenceGuidance: 'Provide IR plan document.', tags: ['incident', 'plan'], commonInheritance: [] },
  { id: 'IR-9', family: 'IR', title: 'Information Spillage Response', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Incident Response: Information Spillage Response', evidenceGuidance: 'Provide spillage response procedures.', tags: ['incident', 'spillage'], commonInheritance: [] },
  { id: 'MA-1', family: 'MA', title: 'System Maintenance Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: System Maintenance Policy and Procedures', evidenceGuidance: 'Provide maintenance policy.', tags: ['policy', 'maintenance'], commonInheritance: [] },
  { id: 'MA-2', family: 'MA', title: 'Controlled Maintenance', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Controlled Maintenance', evidenceGuidance: 'Show maintenance scheduling and approval.', tags: ['maintenance', 'controlled'], commonInheritance: [] },
  { id: 'MA-3', family: 'MA', title: 'Maintenance Tools', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Maintenance Tools', evidenceGuidance: 'Show approved maintenance tools inventory.', tags: ['maintenance', 'tools'], commonInheritance: [] },
  { id: 'MA-3(1)', family: 'MA', title: 'Maintenance Tools | Inspect Tools', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Maintenance Tools | Inspect Tools', evidenceGuidance: 'Show tool inspection before use.', tags: ['maintenance', 'tools', 'inspection'], commonInheritance: [] },
  { id: 'MA-3(2)', family: 'MA', title: 'Maintenance Tools | Inspect Media', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Maintenance Tools | Inspect Media', evidenceGuidance: 'Show media inspection before use.', tags: ['maintenance', 'media'], commonInheritance: [] },
  { id: 'MA-4', family: 'MA', title: 'Nonlocal Maintenance', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Nonlocal Maintenance', evidenceGuidance: 'Show remote maintenance controls.', tags: ['maintenance', 'remote'], commonInheritance: [] },
  { id: 'MA-4(2)', family: 'MA', title: 'Nonlocal Maintenance | Documentation', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Nonlocal Maintenance | Documentation', evidenceGuidance: 'Show documentation of remote maintenance.', tags: ['maintenance', 'remote', 'documentation'], commonInheritance: [] },
  { id: 'MA-5', family: 'MA', title: 'Maintenance Personnel', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Maintenance Personnel', evidenceGuidance: 'Show personnel authorization and escort procedures.', tags: ['maintenance', 'personnel'], commonInheritance: [] },
  { id: 'MA-5(1)', family: 'MA', title: 'Maintenance Personnel | Without Appropriate Access', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Maintenance Personnel | Without Appropriate Access', evidenceGuidance: 'Show uncleared personnel procedures.', tags: ['maintenance', 'personnel', 'access'], commonInheritance: [] },
  { id: 'MA-6', family: 'MA', title: 'Timely Maintenance', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Maintenance: Timely Maintenance', evidenceGuidance: 'Show SLA for maintenance response times.', tags: ['maintenance', 'timeliness', 'sla'], commonInheritance: [] },
  { id: 'MP-1', family: 'MP', title: 'Media Protection Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Protection Policy and Procedures', evidenceGuidance: 'Provide media protection policy.', tags: ['policy', 'media'], commonInheritance: [] },
  { id: 'MP-2', family: 'MP', title: 'Media Access', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Access', evidenceGuidance: 'Show media access restrictions.', tags: ['media', 'access'], commonInheritance: [] },
  { id: 'MP-3', family: 'MP', title: 'Media Marking', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Marking', evidenceGuidance: 'Show media marking procedures.', tags: ['media', 'marking', 'classification'], commonInheritance: [] },
  { id: 'MP-4', family: 'MP', title: 'Media Storage', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Storage', evidenceGuidance: 'Show secure media storage controls.', tags: ['media', 'storage'], commonInheritance: [] },
  { id: 'MP-5', family: 'MP', title: 'Media Transport', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Transport', evidenceGuidance: 'Show media transport protection.', tags: ['media', 'transport'], commonInheritance: [] },
  { id: 'MP-5(4)', family: 'MP', title: 'Media Transport | Cryptographic Protection', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Transport | Cryptographic Protection', evidenceGuidance: 'Show media encryption during transport.', tags: ['media', 'transport', 'encryption'], commonInheritance: [] },
  { id: 'MP-6', family: 'MP', title: 'Media Sanitization', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Sanitization', evidenceGuidance: 'Provide sanitization procedures and records.', tags: ['media', 'sanitization', 'disposal'], commonInheritance: [] },
  { id: 'MP-6(2)', family: 'MP', title: 'Media Sanitization | Equipment Testing', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Sanitization | Equipment Testing', evidenceGuidance: 'Show sanitization equipment testing.', tags: ['media', 'sanitization', 'testing'], commonInheritance: [] },
  { id: 'MP-7', family: 'MP', title: 'Media Use', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Use', evidenceGuidance: 'Show removable media restrictions.', tags: ['media', 'removable', 'usb'], commonInheritance: [] },
  { id: 'MP-7(1)', family: 'MP', title: 'Media Use | Prohibit Without Owner', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Media Protection: Media Use | Prohibit Without Owner', evidenceGuidance: 'Show prohibition on ownerless removable media.', tags: ['media', 'removable', 'owner'], commonInheritance: [] },
  { id: 'PE-1', family: 'PE', title: 'Physical and Environmental Protection Policy', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Physical and Environmental Protection Policy', evidenceGuidance: 'Provide physical security policy.', tags: ['policy', 'physical'], commonInheritance: [] },
  { id: 'PE-2', family: 'PE', title: 'Physical Access Authorizations', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Physical Access Authorizations', evidenceGuidance: 'Provide physical access list and approval.', tags: ['physical', 'access', 'authorization'], commonInheritance: [] },
  { id: 'PE-2(100)', family: 'PE', title: 'Physical Access | GC Personnel Security (ITSG-33)', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Physical Access | GC Personnel Security (ITSG-33)', evidenceGuidance: 'Provide GC-specific physical access evidence.', tags: ['physical', 'gc-specific'], commonInheritance: [] },
  { id: 'PE-3', family: 'PE', title: 'Physical Access Control', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Physical Access Control', evidenceGuidance: 'Show physical access mechanisms (badges, locks).', tags: ['physical', 'access', 'controls'], commonInheritance: [] },
  { id: 'PE-4', family: 'PE', title: 'Access Control for Transmission Medium', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Access Control for Transmission Medium', evidenceGuidance: 'Show physical cabling protection.', tags: ['physical', 'cabling'], commonInheritance: [] },
  { id: 'PE-5', family: 'PE', title: 'Access Control for Output Devices', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Access Control for Output Devices', evidenceGuidance: 'Show access control for printers/displays.', tags: ['physical', 'output', 'printers'], commonInheritance: [] },
  { id: 'PE-6', family: 'PE', title: 'Monitoring Physical Access', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Monitoring Physical Access', evidenceGuidance: 'Show CCTV, visitor logs.', tags: ['physical', 'monitoring', 'cctv'], commonInheritance: [] },
  { id: 'PE-6(1)', family: 'PE', title: 'Physical Monitoring | Intrusion Alarms/Surveillance', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Physical Monitoring | Intrusion Alarms/Surveillance', evidenceGuidance: 'Show intrusion detection and surveillance.', tags: ['physical', 'intrusion', 'surveillance'], commonInheritance: [] },
  { id: 'PE-8', family: 'PE', title: 'Visitor Access Records', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Visitor Access Records', evidenceGuidance: 'Provide visitor log procedures.', tags: ['physical', 'visitors'], commonInheritance: [] },
  { id: 'PE-9', family: 'PE', title: 'Power Equipment and Cabling', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Power Equipment and Cabling', evidenceGuidance: 'Show power equipment protection.', tags: ['physical', 'power', 'cabling'], commonInheritance: [] },
  { id: 'PE-10', family: 'PE', title: 'Emergency Shutoff', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Emergency Shutoff', evidenceGuidance: 'Show emergency shutoff capability.', tags: ['physical', 'emergency', 'power'], commonInheritance: [] },
  { id: 'PE-11', family: 'PE', title: 'Emergency Power', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Emergency Power', evidenceGuidance: 'Show UPS/emergency power.', tags: ['physical', 'power', 'ups'], commonInheritance: [] },
  { id: 'PE-11(1)', family: 'PE', title: 'Emergency Power | Long-Term Alternate Power', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Emergency Power | Long-Term Alternate Power', evidenceGuidance: 'Show generator/long-term power.', tags: ['physical', 'power', 'generator'], commonInheritance: [] },
  { id: 'PE-12', family: 'PE', title: 'Emergency Lighting', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Emergency Lighting', evidenceGuidance: 'Show emergency lighting.', tags: ['physical', 'lighting'], commonInheritance: [] },
  { id: 'PE-13', family: 'PE', title: 'Fire Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Fire Protection', evidenceGuidance: 'Show fire detection/suppression.', tags: ['physical', 'fire'], commonInheritance: [] },
  { id: 'PE-13(3)', family: 'PE', title: 'Fire Protection | Automatic Suppression', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Fire Protection | Automatic Suppression', evidenceGuidance: 'Show automatic fire suppression.', tags: ['physical', 'fire', 'suppression'], commonInheritance: [] },
  { id: 'PE-14', family: 'PE', title: 'Temperature and Humidity Controls', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Temperature and Humidity Controls', evidenceGuidance: 'Show HVAC monitoring.', tags: ['physical', 'environmental', 'hvac'], commonInheritance: [] },
  { id: 'PE-15', family: 'PE', title: 'Water Damage Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Water Damage Protection', evidenceGuidance: 'Show water damage detection.', tags: ['physical', 'water'], commonInheritance: [] },
  { id: 'PE-16', family: 'PE', title: 'Delivery and Removal', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Delivery and Removal', evidenceGuidance: 'Show equipment delivery/removal authorization.', tags: ['physical', 'delivery'], commonInheritance: [] },
  { id: 'PE-17', family: 'PE', title: 'Alternate Work Site', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Physical and Environmental Protection: Alternate Work Site', evidenceGuidance: 'Show alternate work site security.', tags: ['physical', 'alternate-site', 'telework'], commonInheritance: [] },
  { id: 'PL-1', family: 'PL', title: 'Security Planning Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: Security Planning Policy and Procedures', evidenceGuidance: 'Provide security planning policy.', tags: ['policy', 'planning'], commonInheritance: [] },
  { id: 'PL-2', family: 'PL', title: 'System Security Plan', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: System Security Plan', evidenceGuidance: 'Provide System Security Plan (SSP).', tags: ['planning', 'ssp'], commonInheritance: [] },
  { id: 'PL-2(3)', family: 'PL', title: 'SSP | Coordinate with Other Entities', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: SSP | Coordinate with Other Entities', evidenceGuidance: 'Show SSP coordination.', tags: ['planning', 'coordination'], commonInheritance: [] },
  { id: 'PL-4', family: 'PL', title: 'Rules of Behavior', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: Rules of Behavior', evidenceGuidance: 'Provide AUP with user acknowledgment.', tags: ['planning', 'aup', 'behavior'], commonInheritance: [] },
  { id: 'PL-4(1)', family: 'PL', title: 'Rules of Behavior | Social Media Restrictions', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: Rules of Behavior | Social Media Restrictions', evidenceGuidance: 'Show social media restrictions.', tags: ['planning', 'social-media'], commonInheritance: [] },
  { id: 'PL-8', family: 'PL', title: 'Information Security Architecture', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Planning: Information Security Architecture', evidenceGuidance: 'Provide security architecture documentation.', tags: ['planning', 'architecture'], commonInheritance: [] },
  { id: 'PS-1', family: 'PS', title: 'Personnel Security Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Security Policy and Procedures', evidenceGuidance: 'Provide personnel security policy.', tags: ['policy', 'personnel'], commonInheritance: [] },
  { id: 'PS-2', family: 'PS', title: 'Position Risk Designation', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Position Risk Designation', evidenceGuidance: 'Show position risk designations and screening levels.', tags: ['personnel', 'risk', 'designation'], commonInheritance: [] },
  { id: 'PS-3', family: 'PS', title: 'Personnel Screening', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Screening', evidenceGuidance: 'Provide screening evidence (reliability status or clearance).', tags: ['personnel', 'screening', 'clearance'], commonInheritance: [] },
  { id: 'PS-3(1)', family: 'PS', title: 'Personnel Screening | Classified Information', priority: 'P1', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Screening | Classified Information', evidenceGuidance: 'Show enhanced screening for classified access.', tags: ['personnel', 'screening', 'classified'], commonInheritance: [] },
  { id: 'PS-4', family: 'PS', title: 'Personnel Termination', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Termination', evidenceGuidance: 'Provide termination procedures and access revocation.', tags: ['personnel', 'termination'], commonInheritance: [] },
  { id: 'PS-5', family: 'PS', title: 'Personnel Transfer', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Transfer', evidenceGuidance: 'Show access review for transfers.', tags: ['personnel', 'transfer'], commonInheritance: [] },
  { id: 'PS-6', family: 'PS', title: 'Access Agreements', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Access Agreements', evidenceGuidance: 'Provide signed access agreements and NDAs.', tags: ['personnel', 'agreements', 'nda'], commonInheritance: [] },
  { id: 'PS-7', family: 'PS', title: 'Third-Party Personnel Security', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Third-Party Personnel Security', evidenceGuidance: 'Show contractor/third-party security requirements.', tags: ['personnel', 'third-party', 'contractors'], commonInheritance: [] },
  { id: 'PS-8', family: 'PS', title: 'Personnel Sanctions', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Personnel Security: Personnel Sanctions', evidenceGuidance: 'Show personnel sanctions process.', tags: ['personnel', 'sanctions'], commonInheritance: [] },
  { id: 'RA-1', family: 'RA', title: 'Risk Assessment Policy and Procedures', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Risk Assessment Policy and Procedures', evidenceGuidance: 'Provide risk assessment policy.', tags: ['policy', 'risk'], commonInheritance: [] },
  { id: 'RA-2', family: 'RA', title: 'Security Categorization', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Security Categorization', evidenceGuidance: 'Provide security categorization document.', tags: ['risk', 'categorization'], commonInheritance: [] },
  { id: 'RA-3', family: 'RA', title: 'Risk Assessment', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Risk Assessment', evidenceGuidance: 'Provide Threat and Risk Assessment (TRA).', tags: ['risk', 'tra', 'assessment'], commonInheritance: [] },
  { id: 'RA-5', family: 'RA', title: 'Vulnerability Scanning', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Vulnerability Scanning', evidenceGuidance: 'Provide vulnerability scan reports and remediation.', tags: ['vulnerability', 'scanning'], commonInheritance: [] },
  { id: 'RA-5(1)', family: 'RA', title: 'Vulnerability Scanning | Update Tool Capability', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Vulnerability Scanning | Update Tool Capability', evidenceGuidance: 'Show regularly updated scanning tools.', tags: ['vulnerability', 'tools'], commonInheritance: [] },
  { id: 'RA-5(2)', family: 'RA', title: 'Vulnerability Scanning | Update Frequency', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Vulnerability Scanning | Update Frequency', evidenceGuidance: 'Show scanning frequency and triggers.', tags: ['vulnerability', 'frequency'], commonInheritance: [] },
  { id: 'RA-5(3)', family: 'RA', title: 'Vulnerability Scanning | Breadth/Depth of Coverage', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Vulnerability Scanning | Breadth/Depth of Coverage', evidenceGuidance: 'Show comprehensive scanning coverage.', tags: ['vulnerability', 'coverage'], commonInheritance: [] },
  { id: 'RA-5(5)', family: 'RA', title: 'Vulnerability Scanning | Privileged Access', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Risk Assessment: Vulnerability Scanning | Privileged Access', evidenceGuidance: 'Show privileged-level scanning.', tags: ['vulnerability', 'privileged'], commonInheritance: [] },
  { id: 'SA-1', family: 'SA', title: 'System and Services Acquisition Policy', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: System and Services Acquisition Policy', evidenceGuidance: 'Provide SA policy.', tags: ['policy', 'acquisition'], commonInheritance: [] },
  { id: 'SA-2', family: 'SA', title: 'Allocation of Resources', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Allocation of Resources', evidenceGuidance: 'Show security resource allocation in planning.', tags: ['acquisition', 'resources'], commonInheritance: [] },
  { id: 'SA-3', family: 'SA', title: 'System Development Life Cycle', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: System Development Life Cycle', evidenceGuidance: 'Show SDLC with security integration.', tags: ['development', 'sdlc'], commonInheritance: [] },
  { id: 'SA-4', family: 'SA', title: 'Acquisition Process', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition Process', evidenceGuidance: 'Show security requirements in procurement.', tags: ['acquisition', 'procurement'], commonInheritance: [] },
  { id: 'SA-4(1)', family: 'SA', title: 'Acquisition | Functional Properties', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | Functional Properties', evidenceGuidance: 'Show functional security requirements.', tags: ['acquisition', 'functional'], commonInheritance: [] },
  { id: 'SA-4(2)', family: 'SA', title: 'Acquisition | Design/Implementation Info', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | Design/Implementation Info', evidenceGuidance: 'Show design/implementation details.', tags: ['acquisition', 'design'], commonInheritance: [] },
  { id: 'SA-4(9)', family: 'SA', title: 'Acquisition | Functions/Ports/Protocols/Services', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | Functions/Ports/Protocols/Services', evidenceGuidance: 'Show documentation of ports/protocols.', tags: ['acquisition', 'ports', 'protocols'], commonInheritance: [] },
  { id: 'SA-4(10)', family: 'SA', title: 'Acquisition | Approved PIV Products', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | Approved PIV Products', evidenceGuidance: 'Show use of approved identity products.', tags: ['acquisition', 'piv'], commonInheritance: [] },
  { id: 'SA-5', family: 'SA', title: 'Information System Documentation', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Information System Documentation', evidenceGuidance: 'Provide system documentation.', tags: ['documentation', 'system'], commonInheritance: [] },
  { id: 'SA-8', family: 'SA', title: 'Security Engineering Principles', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Security Engineering Principles', evidenceGuidance: 'Show security engineering in system design.', tags: ['development', 'engineering'], commonInheritance: [] },
  { id: 'SA-8(100)', family: 'SA', title: 'Security Engineering | GC Security Engineering (ITSG-33)', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Security Engineering | GC Security Engineering (ITSG-33)', evidenceGuidance: 'Show GC-specific security engineering.', tags: ['development', 'gc-specific'], commonInheritance: [] },
  { id: 'SA-9', family: 'SA', title: 'External Information System Services', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: External Information System Services', evidenceGuidance: 'Show external service agreements.', tags: ['external', 'services', 'contracts'], commonInheritance: [] },
  { id: 'SA-9(2)', family: 'SA', title: 'External Services | Functions/Ports/Protocols', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: External Services | Functions/Ports/Protocols', evidenceGuidance: 'Show port/protocol identification for external services.', tags: ['external', 'ports', 'protocols'], commonInheritance: [] },
  { id: 'SA-10', family: 'SA', title: 'Developer Configuration Management', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Configuration Management', evidenceGuidance: 'Show developer CM practices.', tags: ['development', 'configuration'], commonInheritance: [] },
  { id: 'SA-11', family: 'SA', title: 'Developer Security Testing', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Security Testing', evidenceGuidance: 'Show developer security testing (SAST, DAST).', tags: ['development', 'testing', 'sast', 'dast'], commonInheritance: [] },
  { id: 'SA-11(1)', family: 'SA', title: 'Developer Testing | Static Code Analysis', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Testing | Static Code Analysis', evidenceGuidance: 'Show SAST tools and results.', tags: ['development', 'sast'], commonInheritance: [] },
  { id: 'SA-11(2)', family: 'SA', title: 'Developer Testing | Threat and Vulnerability Analyses', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Testing | Threat and Vulnerability Analyses', evidenceGuidance: 'Provide threat modeling and vulnerability analysis reports for the system.', tags: ['development', 'threat-modeling', 'vulnerability'], commonInheritance: [] },
  { id: 'SA-4(6)', family: 'SA', title: 'Acquisition | Use of Information Assurance Products', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | Use of Information Assurance Products', evidenceGuidance: 'Provide list of IA-evaluated products (CCCS/CMVP/CC) used in the system.', tags: ['acquisition', 'assurance', 'cryptography'], commonInheritance: [] },
  { id: 'SA-4(7)', family: 'SA', title: 'Acquisition | NIAP-Approved Protection Profiles', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Acquisition | NIAP-Approved Protection Profiles', evidenceGuidance: 'Show product evaluations against NIAP protection profiles where applicable.', tags: ['acquisition', 'evaluation'], commonInheritance: [] },
  { id: 'SA-9(1)', family: 'SA', title: 'External Services | Risk Assessments / Organizational Approvals', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: External Information System Services | Risk Assessments and Organizational Approvals', evidenceGuidance: 'Provide risk assessments for external/cloud services and formal approval documentation.', tags: ['external-services', 'risk-assessment', 'cloud'], commonInheritance: [] },
  { id: 'SA-9(5)', family: 'SA', title: 'External Services | Processing, Storage, and Service Location', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: External Information System Services | Processing, Storage, and Service Location', evidenceGuidance: 'Show data residency documentation confirming processing/storage location within Canada.', tags: ['external-services', 'data-residency', 'cloud', 'sovereignty'], commonInheritance: [] },
  { id: 'SA-10(1)', family: 'SA', title: 'Developer CM | Software/Firmware Integrity Verification', priority: 'P1', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Configuration Management | Software/Firmware Integrity Verification', evidenceGuidance: 'Show integrity verification of software/firmware builds (hash checks, signed builds, SBOMs).', tags: ['development', 'integrity', 'supply-chain'], commonInheritance: [] },
  { id: 'SA-12', family: 'SA', title: 'Supply Chain Protection', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Supply Chain Protection', evidenceGuidance: 'Provide supply chain risk management policy, vendor assessments, and alignment with CCCS SCI guidance (ITSAP.10.070).', tags: ['supply-chain', 'procurement', 'vendor'], commonInheritance: [] },
  { id: 'SA-12(1)', family: 'SA', title: 'Supply Chain Protection | Acquisition Strategies', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Supply Chain Protection | Acquisition Strategies, Tools, and Methods', evidenceGuidance: 'Show procurement strategies that address supply chain risk (diversification, trusted channels).', tags: ['supply-chain', 'procurement'], commonInheritance: [] },
  { id: 'SA-15', family: 'SA', title: 'Development Process, Standards, and Tools', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Development Process, Standards, and Tools', evidenceGuidance: 'Provide SDLC documentation, secure coding standards, and approved development tools list.', tags: ['development', 'sdlc', 'standards'], commonInheritance: [] },
  { id: 'SA-16', family: 'SA', title: 'Developer-Provided Training', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer-Provided Training', evidenceGuidance: 'Show developer security training records and security awareness curricula.', tags: ['training', 'development'], commonInheritance: [] },
  { id: 'SA-17', family: 'SA', title: 'Developer Security Architecture and Design', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Services Acquisition: Developer Security Architecture and Design', evidenceGuidance: 'Provide security architecture documentation including threat model, trust boundaries, data flows, and security design decisions.', tags: ['architecture', 'design', 'development'], commonInheritance: [] },
  { id: 'SC-1', family: 'SC', title: 'System and Communications Protection Policy', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: System and Communications Protection Policy', evidenceGuidance: 'Provide SC policy.', tags: ['policy', 'communications'], commonInheritance: [] },
  { id: 'SC-2', family: 'SC', title: 'Application Partitioning', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Application Partitioning', evidenceGuidance: 'Show separation of user/management interfaces.', tags: ['architecture', 'partitioning'], commonInheritance: [] },
  { id: 'SC-4', family: 'SC', title: 'Information in Shared Resources', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Information in Shared Resources', evidenceGuidance: 'Show controls preventing leakage via shared resources.', tags: ['shared-resources', 'leakage'], commonInheritance: [] },
  { id: 'SC-5', family: 'SC', title: 'Denial of Service Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Denial of Service Protection', evidenceGuidance: 'Show DDoS protection.', tags: ['ddos', 'protection', 'network'], commonInheritance: [] },
  { id: 'SC-7', family: 'SC', title: 'Boundary Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection', evidenceGuidance: 'Provide network architecture with boundary protections.', tags: ['boundary', 'firewall', 'waf', 'network'], commonInheritance: [] },
  { id: 'SC-7(3)', family: 'SC', title: 'Boundary Protection | Access Points', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Access Points', evidenceGuidance: 'Show limited managed access points.', tags: ['boundary', 'access-points'], commonInheritance: [] },
  { id: 'SC-7(4)', family: 'SC', title: 'Boundary Protection | External Telecommunications', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | External Telecommunications', evidenceGuidance: 'Show managed external telecom interface.', tags: ['boundary', 'telecommunications'], commonInheritance: [] },
  { id: 'SC-7(5)', family: 'SC', title: 'Boundary Protection | Deny by Default', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Deny by Default', evidenceGuidance: 'Show deny-all/allow-by-exception policy.', tags: ['boundary', 'default-deny', 'firewall'], commonInheritance: [] },
  { id: 'SC-7(7)', family: 'SC', title: 'Boundary Protection | Prevent Split Tunneling', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Prevent Split Tunneling', evidenceGuidance: 'Show split tunneling prevention for VPN.', tags: ['boundary', 'vpn', 'split-tunnel'], commonInheritance: [] },
  { id: 'SC-7(8)', family: 'SC', title: 'Boundary Protection | Authenticated Proxy', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Authenticated Proxy', evidenceGuidance: 'Show traffic routing through authenticated proxy.', tags: ['boundary', 'proxy'], commonInheritance: [] },
  { id: 'SC-7(12)', family: 'SC', title: 'Boundary Protection | Host-Based Protection', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Host-Based Protection', evidenceGuidance: 'Show host-based boundary protection.', tags: ['boundary', 'host-based'], commonInheritance: [] },
  { id: 'SC-7(13)', family: 'SC', title: 'Boundary Protection | Isolation of Security Tools', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Isolation of Security Tools', evidenceGuidance: 'Show security tool isolation.', tags: ['boundary', 'isolation'], commonInheritance: [] },
  { id: 'SC-7(18)', family: 'SC', title: 'Boundary Protection | Fail Secure', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Boundary Protection | Fail Secure', evidenceGuidance: 'Show fail-secure boundary devices.', tags: ['boundary', 'fail-secure'], commonInheritance: [] },
  { id: 'SC-8', family: 'SC', title: 'Transmission Confidentiality and Integrity', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Transmission Confidentiality and Integrity', evidenceGuidance: 'Show encryption in transit (TLS 1.2+).', tags: ['encryption', 'transit', 'tls'], commonInheritance: [] },
  { id: 'SC-8(1)', family: 'SC', title: 'Transmission | Cryptographic Protection', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Transmission | Cryptographic Protection', evidenceGuidance: 'Show cryptographic transmission protection.', tags: ['encryption', 'transit', 'cryptographic'], commonInheritance: [] },
  { id: 'SC-10', family: 'SC', title: 'Network Disconnect', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Network Disconnect', evidenceGuidance: 'Show auto disconnect after inactivity.', tags: ['network', 'disconnect', 'timeout'], commonInheritance: [] },
  { id: 'SC-12', family: 'SC', title: 'Cryptographic Key Establishment and Management', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Cryptographic Key Establishment and Management', evidenceGuidance: 'Provide key management procedures.', tags: ['cryptography', 'key-management'], commonInheritance: [] },
  { id: 'SC-12(1)', family: 'SC', title: 'Cryptographic Key | Use of Validated Cryptography', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Cryptographic Key | Use of Validated Cryptography', evidenceGuidance: 'Show that cryptographic modules are FIPS 140-2/3 validated (CMVP) and keys managed per CSE guidance.', tags: ['cryptography', 'fips', 'cmvp', 'key-management'], commonInheritance: [] },
  { id: 'SC-12(2)', family: 'SC', title: 'Cryptographic Key | Symmetric Keys', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Cryptographic Key | Symmetric Keys', evidenceGuidance: 'Show symmetric key management.', tags: ['cryptography', 'symmetric'], commonInheritance: [] },
  { id: 'SC-12(3)', family: 'SC', title: 'Cryptographic Key | Asymmetric Keys', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Cryptographic Key | Asymmetric Keys', evidenceGuidance: 'Show asymmetric key management and PKI.', tags: ['cryptography', 'asymmetric', 'pki'], commonInheritance: [] },
  { id: 'SC-13', family: 'SC', title: 'Cryptographic Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Cryptographic Protection', evidenceGuidance: 'Show FIPS 140-2 validated encryption.', tags: ['encryption', 'fips', 'cryptography'], commonInheritance: [] },
  { id: 'SC-15', family: 'SC', title: 'Collaborative Computing Devices', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Collaborative Computing Devices', evidenceGuidance: 'Show controls for collaborative devices.', tags: ['devices', 'collaborative'], commonInheritance: [] },
  { id: 'SC-17', family: 'SC', title: 'Public Key Infrastructure Certificates', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Public Key Infrastructure Certificates', evidenceGuidance: 'Show PKI certificate management.', tags: ['pki', 'certificates'], commonInheritance: [] },
  { id: 'SC-18', family: 'SC', title: 'Mobile Code', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Mobile Code', evidenceGuidance: 'Show mobile code restrictions.', tags: ['mobile-code', 'restrictions'], commonInheritance: [] },
  { id: 'SC-19', family: 'SC', title: 'Voice over Internet Protocol', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Voice over Internet Protocol', evidenceGuidance: 'Show VoIP security controls.', tags: ['voip', 'communications'], commonInheritance: [] },
  { id: 'SC-19(100)', family: 'SC', title: 'VoIP | GC VoIP Security (ITSG-33)', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: VoIP | GC VoIP Security (ITSG-33)', evidenceGuidance: 'Show GC-specific VoIP security.', tags: ['voip', 'gc-specific'], commonInheritance: [] },
  { id: 'SC-19(101)', family: 'SC', title: 'VoIP | GC Unified Communications (ITSG-33)', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: VoIP | GC Unified Communications (ITSG-33)', evidenceGuidance: 'Show GC UC security.', tags: ['communications', 'gc-specific'], commonInheritance: [] },
  { id: 'SC-20', family: 'SC', title: 'Secure Name/Address Resolution Service', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Secure Name/Address Resolution Service', evidenceGuidance: 'Show DNSSEC or equivalent.', tags: ['dns', 'dnssec'], commonInheritance: [] },
  { id: 'SC-21', family: 'SC', title: 'Secure Name Resolution (Recursive/Caching)', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Secure Name Resolution (Recursive/Caching)', evidenceGuidance: 'Show secure recursive DNS.', tags: ['dns', 'resolver'], commonInheritance: [] },
  { id: 'SC-22', family: 'SC', title: 'Architecture for Name Resolution Service', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Architecture for Name Resolution Service', evidenceGuidance: 'Show fault-tolerant DNS architecture.', tags: ['dns', 'architecture'], commonInheritance: [] },
  { id: 'SC-23', family: 'SC', title: 'Session Authenticity', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Session Authenticity', evidenceGuidance: 'Show session protections (anti-CSRF, tokens).', tags: ['session', 'authenticity', 'csrf'], commonInheritance: [] },
  { id: 'SC-28', family: 'SC', title: 'Protection of Information at Rest', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Protection of Information at Rest', evidenceGuidance: 'Show encryption at rest (AES-256).', tags: ['encryption', 'at-rest'], commonInheritance: [] },
  { id: 'SC-28(1)', family: 'SC', title: 'Information at Rest | Cryptographic Protection', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Information at Rest | Cryptographic Protection', evidenceGuidance: 'Show FIPS-validated encryption at rest.', tags: ['encryption', 'at-rest', 'fips'], commonInheritance: [] },
  { id: 'SC-39', family: 'SC', title: 'Process Isolation', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Communications Protection: Process Isolation', evidenceGuidance: 'Show process isolation (containers, VMs).', tags: ['isolation', 'process', 'containers'], commonInheritance: [] },
  { id: 'SI-1', family: 'SI', title: 'System and Information Integrity Policy', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: System and Information Integrity Policy', evidenceGuidance: 'Provide SI policy.', tags: ['policy', 'integrity'], commonInheritance: [] },
  { id: 'SI-2', family: 'SI', title: 'Flaw Remediation', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Flaw Remediation', evidenceGuidance: 'Show patch management and compliance.', tags: ['patching', 'remediation'], commonInheritance: [] },
  { id: 'SI-2(1)', family: 'SI', title: 'Flaw Remediation | Central Management', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Flaw Remediation | Central Management', evidenceGuidance: 'Show centralized patching (WSUS, SCCM).', tags: ['patching', 'central'], commonInheritance: [] },
  { id: 'SI-2(2)', family: 'SI', title: 'Flaw Remediation | Automated Status', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Flaw Remediation | Automated Status', evidenceGuidance: 'Show automated patch compliance reporting.', tags: ['patching', 'automation', 'reporting'], commonInheritance: [] },
  { id: 'SI-2(3)', family: 'SI', title: 'Flaw Remediation | Time to Remediate', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Flaw Remediation | Time to Remediate', evidenceGuidance: 'Show defined remediation timelines.', tags: ['patching', 'timelines'], commonInheritance: [] },
  { id: 'SI-3', family: 'SI', title: 'Malicious Code Protection', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Malicious Code Protection', evidenceGuidance: 'Show antimalware/EDR deployment.', tags: ['malware', 'antivirus', 'edr'], commonInheritance: [] },
  { id: 'SI-3(1)', family: 'SI', title: 'Malicious Code | Central Management', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Malicious Code | Central Management', evidenceGuidance: 'Show centralized antimalware console.', tags: ['malware', 'central'], commonInheritance: [] },
  { id: 'SI-3(2)', family: 'SI', title: 'Malicious Code | Automatic Updates', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Malicious Code | Automatic Updates', evidenceGuidance: 'Show automatic signature updates.', tags: ['malware', 'updates'], commonInheritance: [] },
  { id: 'SI-3(7)', family: 'SI', title: 'Malicious Code | Non-Signature Detection', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Malicious Code | Non-Signature Detection', evidenceGuidance: 'Show behavioral/heuristic detection.', tags: ['malware', 'behavioral', 'heuristic'], commonInheritance: [] },
  { id: 'SI-4', family: 'SI', title: 'Information System Monitoring', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Information System Monitoring', evidenceGuidance: 'Show SIEM, IDS/IPS monitoring.', tags: ['monitoring', 'siem', 'ids'], commonInheritance: [] },
  { id: 'SI-4(1)', family: 'SI', title: 'Monitoring | System-Wide IDS', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | System-Wide IDS', evidenceGuidance: 'Show enterprise IDS deployment.', tags: ['monitoring', 'ids', 'enterprise'], commonInheritance: [] },
  { id: 'SI-4(2)', family: 'SI', title: 'Monitoring | Automated Real-Time Analysis', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | Automated Real-Time Analysis', evidenceGuidance: 'Show automated real-time analysis.', tags: ['monitoring', 'real-time'], commonInheritance: [] },
  { id: 'SI-4(4)', family: 'SI', title: 'Monitoring | Inbound/Outbound Traffic', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | Inbound/Outbound Traffic', evidenceGuidance: 'Show traffic monitoring.', tags: ['monitoring', 'traffic'], commonInheritance: [] },
  { id: 'SI-4(5)', family: 'SI', title: 'Monitoring | System-Generated Alerts', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | System-Generated Alerts', evidenceGuidance: 'Show automated alerting.', tags: ['monitoring', 'alerting'], commonInheritance: [] },
  { id: 'SI-4(14)', family: 'SI', title: 'Monitoring | Wireless Intrusion Detection', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | Wireless Intrusion Detection', evidenceGuidance: 'Show wireless IDS.', tags: ['monitoring', 'wireless'], commonInheritance: [] },
  { id: 'SI-4(16)', family: 'SI', title: 'Monitoring | Correlate Information', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | Correlate Information', evidenceGuidance: 'Show monitoring data correlation.', tags: ['monitoring', 'correlation'], commonInheritance: [] },
  { id: 'SI-4(23)', family: 'SI', title: 'Monitoring | Host-Based Devices', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Monitoring | Host-Based Devices', evidenceGuidance: 'Show host-based monitoring agents.', tags: ['monitoring', 'host-based'], commonInheritance: [] },
  { id: 'SI-5', family: 'SI', title: 'Security Alerts, Advisories, and Directives', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Security Alerts, Advisories, and Directives', evidenceGuidance: 'Show security advisory subscription.', tags: ['alerts', 'advisories'], commonInheritance: [] },
  { id: 'SI-6', family: 'SI', title: 'Security Function Verification', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Security Function Verification', evidenceGuidance: 'Show security function verification.', tags: ['verification', 'testing'], commonInheritance: [] },
  { id: 'SI-7', family: 'SI', title: 'Software/Firmware/Information Integrity', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Software/Firmware/Information Integrity', evidenceGuidance: 'Show file integrity monitoring.', tags: ['integrity', 'fim', 'monitoring'], commonInheritance: [] },
  { id: 'SI-7(1)', family: 'SI', title: 'Integrity | Integrity Checks', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Integrity | Integrity Checks', evidenceGuidance: 'Show integrity checks on software/firmware.', tags: ['integrity', 'checks'], commonInheritance: [] },
  { id: 'SI-7(7)', family: 'SI', title: 'Integrity | Integrated Detection and Response', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Integrity | Integrated Detection and Response', evidenceGuidance: 'Show integrated integrity response.', tags: ['integrity', 'response'], commonInheritance: [] },
  { id: 'SI-8', family: 'SI', title: 'Spam Protection', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Spam Protection', evidenceGuidance: 'Show email spam/phishing protection.', tags: ['email', 'spam', 'phishing'], commonInheritance: [] },
  { id: 'SI-8(1)', family: 'SI', title: 'Spam Protection | Central Management', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Spam Protection | Central Management', evidenceGuidance: 'Show centralized spam management.', tags: ['email', 'spam', 'central'], commonInheritance: [] },
  { id: 'SI-8(2)', family: 'SI', title: 'Spam Protection | Automatic Updates', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Spam Protection | Automatic Updates', evidenceGuidance: 'Show automatic spam filter updates.', tags: ['email', 'spam', 'updates'], commonInheritance: [] },
  { id: 'SI-10', family: 'SI', title: 'Information Input Validation', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Information Input Validation', evidenceGuidance: 'Show input validation controls.', tags: ['validation', 'input', 'injection'], commonInheritance: [] },
  { id: 'SI-11', family: 'SI', title: 'Error Handling', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Error Handling', evidenceGuidance: 'Show secure error handling.', tags: ['error-handling', 'information-leakage'], commonInheritance: [] },
  { id: 'SI-12', family: 'SI', title: 'Information Handling and Retention', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Information Handling and Retention', evidenceGuidance: 'Show data handling and retention per GC policy.', tags: ['data', 'retention', 'handling'], commonInheritance: [] },
  { id: 'SI-16', family: 'SI', title: 'Memory Protection', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'System and Information Integrity: Memory Protection', evidenceGuidance: 'Show memory protection (ASLR, DEP).', tags: ['memory', 'protection', 'hardening'], commonInheritance: [] },
  { id: 'PM-1', family: 'PM', title: 'Information Security Program Plan', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Information Security Program Plan', evidenceGuidance: 'Provide information security program plan.', tags: ['policy', 'program'], commonInheritance: [] },
  { id: 'PM-2', family: 'PM', title: 'Senior Information Security Officer', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Senior Information Security Officer', evidenceGuidance: 'Show designated CISO/ITSC.', tags: ['governance', 'ciso'], commonInheritance: [] },
  { id: 'PM-3', family: 'PM', title: 'Information Security Resources', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Information Security Resources', evidenceGuidance: 'Show security resource allocation.', tags: ['governance', 'resources'], commonInheritance: [] },
  { id: 'PM-4', family: 'PM', title: 'Plan of Action and Milestones Process', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Plan of Action and Milestones Process', evidenceGuidance: 'Show POA&M process and tracking.', tags: ['governance', 'poam'], commonInheritance: [] },
  { id: 'PM-5', family: 'PM', title: 'Information System Inventory', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Information System Inventory', evidenceGuidance: 'Provide departmental system inventory.', tags: ['governance', 'inventory'], commonInheritance: [] },
  { id: 'PM-6', family: 'PM', title: 'Security Measures of Performance', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Security Measures of Performance', evidenceGuidance: 'Show security metrics and reporting.', tags: ['governance', 'metrics'], commonInheritance: [] },
  { id: 'PM-7', family: 'PM', title: 'Enterprise Architecture', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Enterprise Architecture', evidenceGuidance: 'Show EA with security integration.', tags: ['governance', 'architecture'], commonInheritance: [] },
  { id: 'PM-8', family: 'PM', title: 'Critical Infrastructure Plan', priority: 'P2', profiles: ['PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Critical Infrastructure Plan', evidenceGuidance: 'Show critical infrastructure plan.', tags: ['governance', 'critical-infrastructure'], commonInheritance: [] },
  { id: 'PM-9', family: 'PM', title: 'Risk Management Strategy', priority: 'P1', profiles: ['CCCS_LOW', 'PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Risk Management Strategy', evidenceGuidance: 'Provide risk management strategy.', tags: ['governance', 'risk', 'strategy'], commonInheritance: [] },
  { id: 'PM-10', family: 'PM', title: 'Security Authorization Process', priority: 'P1', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Security Authorization Process', evidenceGuidance: 'Show SA&A process documentation.', tags: ['governance', 'authorization'], commonInheritance: [] },
  { id: 'PM-11', family: 'PM', title: 'Mission/Business Process Definition', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Mission/Business Process Definition', evidenceGuidance: 'Show mission/business process security integration.', tags: ['governance', 'mission'], commonInheritance: [] },
  { id: 'PM-12', family: 'PM', title: 'Insider Threat Program', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Insider Threat Program', evidenceGuidance: 'Show insider threat program.', tags: ['governance', 'insider-threat'], commonInheritance: [] },
  { id: 'PM-13', family: 'PM', title: 'Information Security Workforce', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Information Security Workforce', evidenceGuidance: 'Show security workforce program.', tags: ['governance', 'workforce'], commonInheritance: [] },
  { id: 'PM-14', family: 'PM', title: 'Testing, Training, and Monitoring', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Testing, Training, and Monitoring', evidenceGuidance: 'Show integrated testing/training/monitoring.', tags: ['governance', 'testing', 'training'], commonInheritance: [] },
  { id: 'PM-15', family: 'PM', title: 'Contacts with Security Groups', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Contacts with Security Groups', evidenceGuidance: 'Show engagement with CCCS, FIRST, etc.', tags: ['governance', 'communities'], commonInheritance: [] },
  { id: 'PM-16', family: 'PM', title: 'Threat Awareness Program', priority: 'P2', profiles: ['PBMM', 'PBMM_HVA', 'SECRET_MM'], description: 'Program Management: Threat Awareness Program', evidenceGuidance: 'Show threat awareness and intelligence sharing.', tags: ['governance', 'threat-intelligence'], commonInheritance: [] }
];

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
 */
function assessSAARequirement(projectInfo) {
  const { dataClassification = '', confidentiality = '', hasPII = false, description = '', appType = '' } = projectInfo;
  const conf = confidentiality || dataClassification;
  const descLower = (description || '').toLowerCase();

  // National interest always requires SA&A
  if (['confidential','secret','top-secret'].includes(conf)) {
    return { requiresSAA: true, reason: 'Classified information (' + conf + ') always requires SA&A' };
  }

  // Protected always requires SA&A
  if (['protected-a','protected-b','protected-c'].includes(conf)) {
    return { requiresSAA: true, reason: 'Data classification is ' + conf };
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

  if (conf === 'unclassified' && !hasComplexity) {
    return {
      requiresSAA: false,
      reason: 'Unclassified static/informational content with no PII or application complexity'
    };
  }

  return { requiresSAA: true, reason: 'Unclassified with application complexity' };
}

/**
 * Get recommended controls based on project info and security profile.
 * Now fully profile-aware — selects controls based on the determined profile.
 */
function getRecommendedControls(projectInfo) {
  const {
    dataClassification = 'protected-b',
    confidentiality = '',
    hostingType = '',
    appType = '',
    hasPII = false,
    technologies = [],
    description = '',
    securityProfile = 'PBMM',
    isHVA = false
  } = projectInfo;

  const conf = confidentiality || dataClassification;
  const descLower = (description || '').toLowerCase();
  const allTags = [];
  const profileId = securityProfile || 'PBMM';

  // Add context tags
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
  if (descLower.includes('wireless') || descLower.includes('wifi')) {
    allTags.push('wireless');
  }

  // For unclassified simple projects — minimal web security baseline only
  const isUnclassified = conf === 'unclassified';
  const BASIC_WEB_CONTROLS = [
    'AC-1','AC-3','AC-7','AC-8','AC-11','AC-14','AC-17',
    'CA-1','CM-1','CM-6','IR-1','IR-6','PL-1','RA-1','RA-5',
    'SA-1','SA-9','SC-1','SC-5','SC-7','SC-8','SC-13','SC-20',
    'SI-1','SI-2','SI-3','SI-5','SI-10'
  ];

  // Determine which profiles to include controls from
  // Each profile is additive: CCCS_LOW ⊂ PBMM ⊂ SECRET_MM
  // HVA overlay adds on top of PBMM
  const includeProfiles = new Set();
  
  switch(profileId) {
    case 'NONE':
      break; // Only basic web controls
    case 'CCCS_LOW':
      includeProfiles.add('CCCS_LOW');
      break;
    case 'PBMM':
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
      break;
    case 'PBMM_HVA':
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
      includeProfiles.add('PBMM_HVA');
      break;
    case 'PB_HIGH':
    case 'PC_BASELINE':
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
      includeProfiles.add('PBMM_HVA'); // Tailored up includes HVA-level controls
      break;
    case 'SECRET_MM':
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
      includeProfiles.add('PBMM_HVA');
      includeProfiles.add('SECRET_MM');
      break;
    case 'CLASSIFIED_HIGH':
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
      includeProfiles.add('PBMM_HVA');
      includeProfiles.add('SECRET_MM');
      break;
    default:
      includeProfiles.add('CCCS_LOW');
      includeProfiles.add('PBMM');
  }

  return CONTROLS.map(control => {
    let relevanceScore = 0;
    let inheritedFrom = [];

    // Technology inheritance
    technologies.forEach(tech => {
      if (control.commonInheritance.includes(tech)) {
        inheritedFrom.push(COMMON_TECHNOLOGIES[tech]?.name || tech);
        relevanceScore += 1;
      }
    });

    // Tag relevance
    let tagMatches = 0;
    allTags.forEach(tag => {
      if (control.tags.includes(tag)) { relevanceScore += 2; tagMatches++; }
    });

    // Profile inclusion — primary selection criteria
    const inProfile = control.profiles.some(p => includeProfiles.has(p));

    // Priority bonus
    if (control.priority === 'P1') relevanceScore += 3;
    else if (control.priority === 'P2') relevanceScore += 2;
    else relevanceScore += 1;

    // Inclusion logic
    let include;
    if (profileId === 'NONE' || (isUnclassified && includeProfiles.size === 0)) {
      include = BASIC_WEB_CONTROLS.includes(control.id) || tagMatches >= 1;
    } else {
      include = inProfile;
    }

    return {
      ...control,
      familyName: CONTROL_FAMILIES[control.family],
      relevanceScore,
      inheritedFrom,
      isInherited: inheritedFrom.length > 0,
      tailoredDescription: control.description,
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
