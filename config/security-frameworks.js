/**
 * Multi-Framework Security Control Engine
 * 
 * Defines 20 security frameworks, their control domains, and cross-mappings.
 * Generates consolidated multi-framework control sets where overlapping
 * controls are merged and tagged with all applicable frameworks.
 */

// ══════════════════════════════════════════════════════════════════════════════
//  FRAMEWORK DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

const FRAMEWORKS = {
  'ITSG-33':          { name: 'ITSG-33', fullName: 'ITSG-33 (GoC)', country: 'Canada', level: 'Federal', sector: 'All Govt', controlCount: '~300', riskLevels: 'Low/Med/High (CIA)', atoEquivalent: 'ATO Letter', mandatory: true, mandatoryNote: 'GoC', category: 'government' },
  'CCCS-MEDIUM':      { name: 'CCCS Medium (PBMM)', fullName: 'CCCS Medium Cloud Profile', country: 'Canada', level: 'Federal', sector: 'Cloud', controlCount: '~200', riskLevels: 'PBMM fixed', atoEquivalent: 'ATO Letter', mandatory: true, mandatoryNote: 'GC Cloud', category: 'government' },
  'OSFI-B13':         { name: 'OSFI B-13', fullName: 'OSFI Guideline B-13', country: 'Canada', level: 'Federal', sector: 'Finance', controlCount: 'Outcomes-based', riskLevels: '—', atoEquivalent: 'Supervisory Review', mandatory: true, mandatoryNote: 'FRFIs', category: 'finance' },
  'NIST-800-53':      { name: 'NIST 800-53', fullName: 'NIST SP 800-53 Rev 5', country: 'USA', level: 'Federal', sector: 'All', controlCount: '~1000+', riskLevels: 'Low/Mod/High', atoEquivalent: 'ATO', mandatory: true, mandatoryNote: 'FISMA', category: 'government' },
  'FEDRAMP':          { name: 'FedRAMP', fullName: 'FedRAMP', country: 'USA', level: 'Federal', sector: 'Cloud', controlCount: '~325 Mod', riskLevels: 'Low/Mod/High', atoEquivalent: 'P-ATO / ATO', mandatory: true, mandatoryNote: 'Fed Cloud', category: 'government' },
  'CMMC':             { name: 'CMMC 2.0', fullName: 'CMMC 2.0', country: 'USA', level: 'Federal', sector: 'Defense', controlCount: '17–110', riskLevels: 'L1/L2/L3', atoEquivalent: 'Certification', mandatory: true, mandatoryNote: 'DoD contracts', category: 'government' },
  'STATERAMP':        { name: 'StateRAMP', fullName: 'StateRAMP', country: 'USA', level: 'State', sector: 'Cloud', controlCount: '~325', riskLevels: 'Low/Mod/High', atoEquivalent: 'Provisional Auth.', mandatory: true, mandatoryNote: 'Member states', category: 'government' },
  'NYDFS-500':        { name: 'NYDFS 500', fullName: 'NYDFS 23 NYCRR 500', country: 'USA', level: 'State', sector: 'Finance', controlCount: '~23 sections', riskLevels: '—', atoEquivalent: 'Annual Certification', mandatory: true, mandatoryNote: 'NY-regulated', category: 'finance' },
  'NIS2':             { name: 'NIS2', fullName: 'NIS2 Directive', country: 'EU', level: 'National', sector: '18 sectors', controlCount: 'Outcome-based', riskLevels: 'Essential/Important', atoEquivalent: 'NCA Compliance', mandatory: true, mandatoryNote: 'EU', category: 'government' },
  'DORA':             { name: 'DORA', fullName: 'Digital Operational Resilience Act', country: 'EU', level: 'National', sector: 'Finance', controlCount: '5 pillars', riskLevels: 'Significant/Other', atoEquivalent: 'ESA Compliance', mandatory: true, mandatoryNote: 'EU Finance', category: 'finance' },
  'BSI-GRUNDSCHUTZ':  { name: 'BSI IT-Grundschutz', fullName: 'BSI IT-Grundschutz', country: 'Germany', level: 'National', sector: 'All', controlCount: '100+ Bausteine', riskLevels: 'Normal/High/VH', atoEquivalent: 'Certification', mandatory: true, mandatoryNote: 'Govt', category: 'government' },
  'ANSSI-RGS':        { name: 'ANSSI RGS', fullName: 'ANSSI RGS / EBIOS RM', country: 'France', level: 'National', sector: 'Public Admin', controlCount: '3 levels', riskLevels: 'Standard/Enhanced/High', atoEquivalent: 'ANSSI Qualification', mandatory: true, mandatoryNote: 'French govt', category: 'government' },
  'NCSC-CAF':         { name: 'NCSC CAF', fullName: 'NCSC Cyber Assessment Framework', country: 'UK', level: 'National', sector: 'CNI', controlCount: '14 outcomes', riskLevels: 'IGP scores', atoEquivalent: 'NIS Compliance', mandatory: true, mandatoryNote: 'NIS-regulated', category: 'government' },
  'ENS':              { name: 'ENS (CCN-STIC)', fullName: 'Esquema Nacional de Seguridad', country: 'Spain', level: 'National', sector: 'Public Admin', controlCount: '~75 measures', riskLevels: 'Basic/Medium/High', atoEquivalent: 'ENS Certificate', mandatory: true, mandatoryNote: 'Spanish govt', category: 'government' },
  'ASD-ISM':          { name: 'ASD ISM + IRAP', fullName: 'ASD Information Security Manual', country: 'Australia', level: 'Federal', sector: 'All Govt', controlCount: '~900+', riskLevels: 'NC/OS/P/S/TS', atoEquivalent: 'ATO', mandatory: true, mandatoryNote: 'Commonwealth', category: 'government' },
  'ASD-E8':           { name: 'ASD Essential Eight', fullName: 'ASD Essential Eight', country: 'Australia', level: 'Federal+', sector: 'All', controlCount: '8 strategies', riskLevels: 'ML1/ML2/ML3', atoEquivalent: 'ML Attainment', mandatory: true, mandatoryNote: 'PSPF', category: 'government' },
  'APRA-CPS234':      { name: 'APRA CPS 234', fullName: 'APRA CPS 234', country: 'Australia', level: 'National', sector: 'Finance', controlCount: 'Outcomes-based', riskLevels: 'Criticality tiers', atoEquivalent: 'Board Attestation', mandatory: true, mandatoryNote: 'APRA entities', category: 'finance' },
  'ISO-27001':        { name: 'ISO 27001:2022', fullName: 'ISO/IEC 27001:2022', country: 'Global', level: '—', sector: 'All', controlCount: '93 (Annex A)', riskLevels: 'Risk-based', atoEquivalent: 'Certificate', mandatory: false, mandatoryNote: 'Voluntary/Referenced', category: 'international' },
  'SOC2':             { name: 'SOC 2 Type II', fullName: 'SOC 2 Type II', country: 'Global', level: '—', sector: 'Service Orgs', controlCount: '5 TSC', riskLevels: '—', atoEquivalent: 'SOC 2 Report', mandatory: false, mandatoryNote: 'Contractual', category: 'international' },
  'PCI-DSS':          { name: 'PCI DSS 4.0', fullName: 'PCI DSS v4.0', country: 'Global', level: '—', sector: 'Payments', controlCount: '12 requirements', riskLevels: '—', atoEquivalent: 'AoC', mandatory: false, mandatoryNote: 'Contractual', category: 'international' },
};

// ══════════════════════════════════════════════════════════════════════════════
//  UNIVERSAL SECURITY DOMAINS
//  (Used as the common denominator for cross-framework mapping)
// ══════════════════════════════════════════════════════════════════════════════

const DOMAINS = {
  'AC':  'Access Control',
  'AT':  'Awareness & Training',
  'AU':  'Audit & Accountability',
  'CA':  'Security Assessment & Authorization',
  'CM':  'Configuration Management',
  'CP':  'Contingency Planning & Resilience',
  'IA':  'Identification & Authentication',
  'IR':  'Incident Response',
  'MA':  'Maintenance',
  'MP':  'Media Protection',
  'PE':  'Physical & Environmental Protection',
  'PL':  'Planning & Governance',
  'PS':  'Personnel Security',
  'RA':  'Risk Assessment',
  'SA':  'System & Services Acquisition',
  'SC':  'System & Communications Protection',
  'SI':  'System & Information Integrity',
  'PM':  'Program Management',
  'SR':  'Supply Chain Risk Management',
  'PT':  'Privacy & Data Protection',
  'BC':  'Business Continuity & Resilience',
  'TM':  'Third-Party Management',
  'VN':  'Vulnerability & Patch Management',
  'CT':  'Cryptography',
  'SD':  'Secure Development',
  'NW':  'Network Security',
  'AM':  'Asset Management',
  'TI':  'Threat Intelligence',
};

// ══════════════════════════════════════════════════════════════════════════════
//  CROSS-FRAMEWORK MAPPING
//  Maps each framework's control IDs/sections to universal domains.
//  This is the engine that detects overlap and consolidates controls.
// ══════════════════════════════════════════════════════════════════════════════

const FRAMEWORK_DOMAIN_MAP = {
  'ITSG-33':     { AC:'AC-*', AT:'AT-*', AU:'AU-*', CA:'CA-*', CM:'CM-*', CP:'CP-*', IA:'IA-*', IR:'IR-*', MA:'MA-*', MP:'MP-*', PE:'PE-*', PL:'PL-*', PS:'PS-*', RA:'RA-*', SA:'SA-*', SC:'SC-*', SI:'SI-*', PM:'PM-*' },
  'CCCS-MEDIUM': { AC:'AC-*', AT:'AT-*', AU:'AU-*', CA:'CA-*', CM:'CM-*', CP:'CP-*', IA:'IA-*', IR:'IR-*', MA:'MA-*', MP:'MP-*', PE:'PE-*', PL:'PL-*', PS:'PS-*', RA:'RA-*', SA:'SA-*', SC:'SC-*', SI:'SI-*', PM:'PM-*' },
  'NIST-800-53': { AC:'AC-*', AT:'AT-*', AU:'AU-*', CA:'CA-*', CM:'CM-*', CP:'CP-*', IA:'IA-*', IR:'IR-*', MA:'MA-*', MP:'MP-*', PE:'PE-*', PL:'PL-*', PS:'PS-*', RA:'RA-*', SA:'SA-*', SC:'SC-*', SI:'SI-*', PM:'PM-*', SR:'SR-*', PT:'PT-*' },
  'FEDRAMP':     { AC:'AC-*', AT:'AT-*', AU:'AU-*', CA:'CA-*', CM:'CM-*', CP:'CP-*', IA:'IA-*', IR:'IR-*', MA:'MA-*', MP:'MP-*', PE:'PE-*', PL:'PL-*', PS:'PS-*', RA:'RA-*', SA:'SA-*', SC:'SC-*', SI:'SI-*', PM:'PM-*', SR:'SR-*' },
  'CMMC':        { AC:'AC', IA:'IA', AT:'AT', AU:'AU', CM:'CM', IR:'IR', MA:'MA', MP:'MP', PE:'PE', PS:'PS', RA:'RA', SC:'SC', SI:'SI', AM:'AM', RE:'CP' },
  'STATERAMP':   { AC:'AC-*', AT:'AT-*', AU:'AU-*', CA:'CA-*', CM:'CM-*', CP:'CP-*', IA:'IA-*', IR:'IR-*', MA:'MA-*', MP:'MP-*', PE:'PE-*', PL:'PL-*', PS:'PS-*', RA:'RA-*', SA:'SA-*', SC:'SC-*', SI:'SI-*' },
  'ISO-27001':   { AC:'A.5.15-A.5.18,A.8.2-A.8.5', AT:'A.6.3', AU:'A.8.15', CA:'A.5.35-A.5.36', CM:'A.8.9', CP:'A.5.29-A.5.30', IA:'A.5.16-A.5.17,A.8.5', IR:'A.5.24-A.5.28', MA:'A.7.13', MP:'A.7.10', PE:'A.7.1-A.7.14', PL:'A.5.1-A.5.4', PS:'A.6.1-A.6.8', RA:'A.5.7,A.8.8', SA:'A.5.19-A.5.22', SC:'A.8.20-A.8.24', SI:'A.8.7-A.8.12', CT:'A.8.24', NW:'A.8.20-A.8.22', TM:'A.5.19-A.5.23', SD:'A.8.25-A.8.34', AM:'A.5.9-A.5.14' },
  'SOC2':        { AC:'CC6.1-CC6.3', AT:'CC1.4', AU:'CC4.1-CC4.2', CA:'CC3.1-CC3.4', CM:'CC6.8,CC7.1', CP:'A1.1-A1.3', IA:'CC6.1', IR:'CC7.3-CC7.5', PL:'CC1.1-CC1.5', PS:'CC1.4', RA:'CC3.1-CC3.2', SC:'CC6.6-CC6.7', SI:'CC7.1-CC7.2', PT:'P1.1-P1.2', TM:'CC9.2' },
  'PCI-DSS':     { NW:'Req1-2', CT:'Req3-4', VN:'Req5-6', AC:'Req7-8', PE:'Req9', AU:'Req10', SI:'Req11', PL:'Req12' },
  'OSFI-B13':    { PL:'S1-Governance', RA:'S2-Risk', AC:'S3-Access', IR:'S4-Incident', CP:'S5-Resilience', TM:'S6-ThirdParty', AU:'S7-Testing' },
  'NYDFS-500':   { PL:'500.1-500.4', AC:'500.7,500.12', IA:'500.7,500.12', AU:'500.6,500.14', IR:'500.16-500.17', RA:'500.9', CT:'500.15', TM:'500.11', VN:'500.5', AT:'500.10', PT:'500.13' },
  'NIS2':        { RA:'Art21(a)', IR:'Art21(b),Art23', CP:'Art21(c)', SC:'Art21(d)', SA:'Art21(e)', VN:'Art21(e)', AT:'Art21(g)', CT:'Art21(h)', AC:'Art21(i)', AM:'Art21(i)', TM:'Art21(j)', SR:'Art21(j)' },
  'DORA':        { PL:'Ch2-Governance', RA:'Ch2-RiskMgmt', IR:'Ch3-Incident', CP:'Ch4-Testing', BC:'Ch4-Resilience', TM:'Ch5-ThirdParty', TI:'Ch6-ThreatIntel' },
  'BSI-GRUNDSCHUTZ': { PL:'ISMS.*', AC:'ORP.4,APP.*.1', AT:'ORP.3', AU:'OPS.2.*', CM:'OPS.1.*', CP:'DER.4,CON.3', IA:'ORP.4', IR:'DER.2.*', MA:'OPS.1.2', PE:'INF.*', RA:'BSI-200-3', SC:'NET.*', SI:'DER.1,OPS.1.5', NW:'NET.*', CT:'CON.1' },
  'ANSSI-RGS':   { PL:'RGS-Governance', AC:'RGS-Access', IA:'RGS-Auth', AU:'RGS-Logging', IR:'RGS-Incident', CT:'RGS-Crypto', NW:'RGS-Network', SD:'RGS-Dev' },
  'NCSC-CAF':    { AM:'A1-GovRisk', RA:'A2-AssetMgmt,A3-SupplyChain', AC:'B2-IdAccess', NW:'B3-DataSec,B4-SystemSec', SC:'B4-SystemSec,B5-Resilience', IR:'C1-Detection,C2-Response', CP:'B5-Resilience', AT:'D1-Awareness', AU:'C1-Monitoring' },
  'ENS':         { PL:'org.*', AC:'op.acc.*', IA:'op.acc.*', AU:'op.exp.8', CM:'op.exp.*', CP:'op.cont.*', IR:'op.exp.7', PE:'mp.if.*', SC:'mp.com.*', CT:'mp.com.3', PS:'mp.per.*', AT:'mp.per.3-4', AM:'mp.sw.*,mp.info.*', NW:'mp.com.1-2' },
  'ASD-ISM':     { PL:'ISM-Gov', AC:'ISM-Access', IA:'ISM-Auth', AU:'ISM-Monitoring', CM:'ISM-SystemHard', CP:'ISM-DataBackup', IR:'ISM-Incident', PE:'ISM-Physical', SC:'ISM-Comms', CT:'ISM-Crypto', PS:'ISM-Personnel', AT:'ISM-Training', NW:'ISM-Network', VN:'ISM-Patching', SD:'ISM-DevSec', AM:'ISM-AssetMgmt', MP:'ISM-Media' },
  'ASD-E8':      { VN:'E8-Patch-Apps,E8-Patch-OS', AC:'E8-Admin-Priv,E8-App-Control', IA:'E8-MFA', CM:'E8-Harden-Apps,E8-Macro', CP:'E8-Backup' },
  'APRA-CPS234': { PL:'CPS234.8-11', AC:'CPS234.25', IA:'CPS234.25', AU:'CPS234.33-36', IR:'CPS234.28-30', RA:'CPS234.15-16', TM:'CPS234.17-24', AT:'CPS234.26-27', SI:'CPS234.31-32' },
};

// ══════════════════════════════════════════════════════════════════════════════
//  FRAMEWORK-SPECIFIC CONTROLS
//  Controls unique to a framework that don't exist in ITSG-33.
//  These get added as separate items when the framework is in scope.
// ══════════════════════════════════════════════════════════════════════════════

const FRAMEWORK_SPECIFIC_CONTROLS = {

  'OSFI-B13': [
    { id: 'OSFI-GOV-1', family: 'PL', title: 'Technology & Cyber Risk Governance', description: 'Board and senior management accountability for technology and cyber risk.', evidenceGuidance: 'Board-approved cyber risk appetite statement, committee charter, reporting cadence.' },
    { id: 'OSFI-TPR-1', family: 'TM', title: 'Third-Party Technology Risk', description: 'Due diligence and ongoing monitoring of third-party technology arrangements.', evidenceGuidance: 'Vendor risk assessments, contractual security clauses, monitoring reports.' },
    { id: 'OSFI-RES-1', family: 'BC', title: 'Technology Resilience Testing', description: 'Scenario-based resilience testing including severe but plausible scenarios.', evidenceGuidance: 'DR test plans, test results, recovery time evidence, lessons learned.' },
  ],

  'NYDFS-500': [
    { id: 'NYDFS-500.2', family: 'PL', title: 'Cybersecurity Program', description: 'Maintain a cybersecurity program based on risk assessment.', evidenceGuidance: 'Written cybersecurity program policy, board approval evidence.' },
    { id: 'NYDFS-500.4', family: 'PL', title: 'CISO Appointment', description: 'Designate a qualified CISO responsible for the cybersecurity program.', evidenceGuidance: 'CISO appointment letter, reporting structure, qualifications.' },
    { id: 'NYDFS-500.12', family: 'IA', title: 'MFA Requirement', description: 'MFA for any individual accessing internal networks from external.', evidenceGuidance: 'MFA configuration evidence, policy, exception process.' },
    { id: 'NYDFS-500.17', family: 'IR', title: '72-Hour Notification', description: 'Notify superintendent within 72 hours of a cybersecurity event.', evidenceGuidance: 'Incident response plan with notification procedures, contact details.' },
  ],

  'NIS2': [
    { id: 'NIS2-Art21a', family: 'RA', title: 'Risk Analysis & Policies', description: 'Policies on risk analysis and information system security.', evidenceGuidance: 'Risk assessment methodology, IS security policies, board approval.' },
    { id: 'NIS2-Art23', family: 'IR', title: 'Incident Notification (24h/72h)', description: 'Early warning within 24h, full notification within 72h to CSIRT.', evidenceGuidance: 'Incident classification criteria, notification templates, CSIRT contacts.' },
    { id: 'NIS2-Art21j', family: 'SR', title: 'Supply Chain Security', description: 'Security of supply chains including relationships with direct suppliers.', evidenceGuidance: 'Supply chain risk assessments, vendor security requirements, SBOMs.' },
    { id: 'NIS2-Art20', family: 'PL', title: 'Management Body Accountability', description: 'Management bodies must approve cyber risk management measures.', evidenceGuidance: 'Board meeting minutes, training records, accountability framework.' },
  ],

  'DORA': [
    { id: 'DORA-CH2-1', family: 'PL', title: 'ICT Risk Management Framework', description: 'Comprehensive ICT risk management framework including governance.', evidenceGuidance: 'ICT risk management policy, governance structure, board reporting.' },
    { id: 'DORA-CH3-1', family: 'IR', title: 'ICT Incident Classification', description: 'Classify ICT incidents using prescribed criteria (clients, duration, geography).', evidenceGuidance: 'Incident classification matrix, severity thresholds, reporting templates.' },
    { id: 'DORA-CH4-1', family: 'BC', title: 'Digital Operational Resilience Testing', description: 'Advanced testing including TLPT (Threat-Led Penetration Testing).', evidenceGuidance: 'TLPT scope, red team results, remediation plans, 3-year test programme.' },
    { id: 'DORA-CH5-1', family: 'TM', title: 'ICT Third-Party Risk Register', description: 'Register of all ICT third-party service providers with criticality assessment.', evidenceGuidance: 'TPP register, criticality assessments, concentration risk analysis.' },
    { id: 'DORA-CH6-1', family: 'TI', title: 'Cyber Threat Intelligence Sharing', description: 'Participation in threat intelligence sharing arrangements.', evidenceGuidance: 'TI sharing agreements, IOC feeds, sector ISAC membership.' },
  ],

  'CMMC': [
    { id: 'CMMC-L2-AC.1.001', family: 'AC', title: 'Limit System Access (FCI)', description: 'Limit information system access to authorized users.', evidenceGuidance: 'Access control policy, user access list, SSP documentation.' },
    { id: 'CMMC-L2-SC.3.177', family: 'SC', title: 'Protect CUI in Transit', description: 'Employ FIPS-validated cryptography for CUI in transit.', evidenceGuidance: 'TLS configuration, FIPS 140-2 certificates, network diagrams.' },
    { id: 'CMMC-L2-SI.2.216', family: 'SI', title: 'Monitor CUI Boundaries', description: 'Monitor organizational systems for unauthorized CUI transfer.', evidenceGuidance: 'DLP policies, boundary monitoring configuration, alert rules.' },
  ],

  'ISO-27001': [
    { id: 'ISO-A.5.1', family: 'PL', title: 'Policies for Information Security', description: 'Information security policy and topic-specific policies shall be defined.', evidenceGuidance: 'IS policy document, management approval, distribution records, review dates.' },
    { id: 'ISO-A.5.23', family: 'SC', title: 'Cloud Services Security', description: 'Processes for acquisition, use, management and exit from cloud services.', evidenceGuidance: 'Cloud security policy, cloud risk assessment, exit strategy document.' },
    { id: 'ISO-A.5.7', family: 'TI', title: 'Threat Intelligence', description: 'Collect and analyze information relating to information security threats.', evidenceGuidance: 'Threat intelligence feeds, analysis reports, integration with SIEM.' },
    { id: 'ISO-A.8.25', family: 'SD', title: 'Secure Development Lifecycle', description: 'Rules for secure development of software and systems.', evidenceGuidance: 'SDLC policy, code review evidence, SAST/DAST results.' },
    { id: 'ISO-A.8.28', family: 'SD', title: 'Secure Coding', description: 'Secure coding principles applied to software development.', evidenceGuidance: 'Secure coding standards, training records, code review findings.' },
  ],

  'SOC2': [
    { id: 'SOC2-CC1.1', family: 'PL', title: 'COSO: Control Environment', description: 'Demonstrate commitment to integrity and ethical values.', evidenceGuidance: 'Code of conduct, ethics training records, board oversight documentation.' },
    { id: 'SOC2-CC9.2', family: 'TM', title: 'Vendor Risk Management', description: 'Assess and manage risks associated with vendors and business partners.', evidenceGuidance: 'Vendor assessment process, SOC 2 reports from vendors, contractual terms.' },
    { id: 'SOC2-A1.2', family: 'BC', title: 'Recovery Testing', description: 'Test recovery plan procedures supporting system availability commitments.', evidenceGuidance: 'DR test schedule, test results, RTO/RPO achievement evidence.' },
    { id: 'SOC2-P1.1', family: 'PT', title: 'Privacy Notice', description: 'Provide notice to data subjects about privacy practices.', evidenceGuidance: 'Published privacy notice, consent mechanism, update history.' },
  ],

  'PCI-DSS': [
    { id: 'PCI-3.5', family: 'CT', title: 'Protect Stored Account Data Keys', description: 'Protect cryptographic keys used for stored account data.', evidenceGuidance: 'Key management procedures, HSM evidence, split knowledge/dual control.' },
    { id: 'PCI-4.2', family: 'CT', title: 'Protect PAN During Transmission', description: 'PAN is protected with strong cryptography during transmission over public networks.', evidenceGuidance: 'TLS configuration, certificate management, network flow diagrams.' },
    { id: 'PCI-6.4', family: 'SD', title: 'Secure Software Development', description: 'Public-facing web applications protected against attacks.', evidenceGuidance: 'WAF configuration, code review process, penetration test results.' },
    { id: 'PCI-9.1', family: 'PE', title: 'Physical Access to Cardholder Data', description: 'Restrict physical access to systems storing cardholder data.', evidenceGuidance: 'Physical security controls, badge access logs, visitor logs, camera evidence.' },
    { id: 'PCI-11.3', family: 'VN', title: 'Penetration Testing', description: 'External and internal penetration testing regularly performed.', evidenceGuidance: 'Penetration test reports, remediation evidence, re-test results.' },
  ],

  'ASD-E8': [
    { id: 'E8-PATCH-APP', family: 'VN', title: 'Patch Applications', description: 'Patch, update or mitigate vulnerabilities in applications within 48h (critical).', evidenceGuidance: 'Patching SLAs, patch compliance reports, vulnerability scan results.' },
    { id: 'E8-PATCH-OS', family: 'VN', title: 'Patch Operating Systems', description: 'Patch, update or mitigate vulnerabilities in OS within 48h (critical).', evidenceGuidance: 'OS patch compliance, automated patching configuration, exception log.' },
    { id: 'E8-MFA', family: 'IA', title: 'Multi-Factor Authentication', description: 'MFA for all users accessing internet-facing services and privileged access.', evidenceGuidance: 'MFA policy, coverage report, phishing-resistant MFA methods used.' },
    { id: 'E8-ADMIN', family: 'AC', title: 'Restrict Administrative Privileges', description: 'Restrict admin privileges based on user duties using PAM.', evidenceGuidance: 'PAM solution configuration, admin account inventory, JIT access evidence.' },
    { id: 'E8-APP-CTRL', family: 'CM', title: 'Application Control', description: 'Application control to prevent execution of unapproved programs.', evidenceGuidance: 'Application allowlisting policy, configuration screenshots, exception process.' },
    { id: 'E8-MACRO', family: 'CM', title: 'Configure Microsoft Office Macros', description: 'Block macros from the internet, only allow vetted macros in trusted locations.', evidenceGuidance: 'GPO or Intune macro policies, trusted location list, user notification screenshots.' },
    { id: 'E8-HARDEN', family: 'CM', title: 'User Application Hardening', description: 'Configure web browsers and other apps to block ads, Java, Flash, unnecessary features.', evidenceGuidance: 'Browser hardening policy, attack surface reduction rules, configuration evidence.' },
    { id: 'E8-BACKUP', family: 'CP', title: 'Regular Backups', description: 'Perform regular backups; test restoration; retain disconnected copies.', evidenceGuidance: 'Backup schedule, retention policy, test restoration log, air-gapped backup evidence.' },
  ],

  'NCSC-CAF': [
    { id: 'CAF-A1', family: 'PL', title: 'Governance', description: 'Appropriate governance structure in place to manage cybersecurity risk.', evidenceGuidance: 'Governance framework, board reporting, named responsible person, risk appetite.' },
    { id: 'CAF-B1', family: 'SC', title: 'Service Protection Policies', description: 'Define and communicate appropriate policies to secure systems.', evidenceGuidance: 'Security policies, communication evidence, review/update records.' },
    { id: 'CAF-C1', family: 'AU', title: 'Security Monitoring', description: 'Monitor networks and systems for security events using signatures and anomaly detection.', evidenceGuidance: 'SIEM configuration, monitoring coverage, alert triage process, SOC procedures.' },
    { id: 'CAF-D1', family: 'AT', title: 'Cyber Security Culture', description: 'Staff understand and contribute to the security of essential functions.', evidenceGuidance: 'Awareness programme, training completion rates, phishing test results.' },
  ],

  'APRA-CPS234': [
    { id: 'CPS234-9', family: 'PL', title: 'Board Oversight of Information Security', description: 'Board ensures IS capability commensurate with size, threats and vulnerabilities.', evidenceGuidance: 'Board IS reporting, IS capability assessment, resource allocation evidence.' },
    { id: 'CPS234-15', family: 'RA', title: 'Information Asset Classification', description: 'Classify information assets by criticality and sensitivity.', evidenceGuidance: 'Asset register with criticality ratings, classification scheme document.' },
    { id: 'CPS234-28', family: 'IR', title: 'Incident Management & Notification', description: 'Notify APRA of material information security incidents within 72 hours.', evidenceGuidance: 'Incident response plan, APRA notification template, escalation matrix.' },
  ],

  'BSI-GRUNDSCHUTZ': [
    { id: 'BSI-ISMS.1', family: 'PL', title: 'Security Management', description: 'Establish and operate an information security management system.', evidenceGuidance: 'ISMS documentation, security officer appointment, management review records.' },
    { id: 'BSI-ORP.4', family: 'AC', title: 'Identity and Access Management', description: 'Manage identities and access rights across all systems.', evidenceGuidance: 'IAM policy, access review records, provisioning/deprovisioning process.' },
    { id: 'BSI-DER.2.1', family: 'IR', title: 'Incident Handling', description: 'Handle security incidents systematically and learn from them.', evidenceGuidance: 'Incident handling process, past incident reports, lessons learned documentation.' },
  ],

  'ANSSI-RGS': [
    { id: 'RGS-GOV-1', family: 'PL', title: 'Homologation (Security Accreditation)', description: 'Formal security accreditation process for information systems.', evidenceGuidance: 'Homologation dossier, risk study (EBIOS RM), accreditation decision.' },
    { id: 'RGS-CRYPTO-1', family: 'CT', title: 'Qualified Cryptographic Mechanisms', description: 'Use ANSSI-qualified cryptographic mechanisms.', evidenceGuidance: 'Crypto inventory, ANSSI qualification references, key management procedures.' },
  ],

  'ENS': [
    { id: 'ENS-org.1', family: 'PL', title: 'Security Policy', description: 'Formal information security policy approved by management.', evidenceGuidance: 'Security policy document, approval records, review schedule.' },
    { id: 'ENS-op.acc.5', family: 'AC', title: 'Authentication Mechanisms', description: 'Authentication mechanisms commensurate with the system category.', evidenceGuidance: 'Authentication configuration, MFA evidence for medium/high categories.' },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROL GENERATION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determine which universal domains a framework covers.
 * Returns Set of domain codes.
 */
function getFrameworkDomains(frameworkId) {
  const mapping = FRAMEWORK_DOMAIN_MAP[frameworkId] || {};
  return new Set(Object.keys(mapping));
}

/**
 * For a given ITSG-33 family code (e.g. 'AC'), return which of the selected
 * frameworks also cover that domain and what their reference IDs are.
 */
function getFrameworkCoverage(family, selectedFrameworks) {
  const coverage = [];
  for (const fwId of selectedFrameworks) {
    const mapping = FRAMEWORK_DOMAIN_MAP[fwId] || {};
    if (mapping[family]) {
      coverage.push({
        frameworkId: fwId,
        frameworkName: FRAMEWORKS[fwId]?.name || fwId,
        reference: mapping[family]
      });
    }
  }
  return coverage;
}

/**
 * Generate a multi-framework control set.
 * 
 * Strategy:
 * 1. Start with ITSG-33 controls as the base (already detailed)
 * 2. For each ITSG-33 control, check which selected frameworks also cover
 *    that domain — tag the control with all matching frameworks
 * 3. For each selected framework, check for framework-specific controls
 *    not covered by ITSG-33 — add these as separate controls
 * 4. Return the consolidated set
 *
 * @param {string[]} selectedFrameworks - Array of framework IDs
 * @param {Object[]} baseControls - ITSG-33 recommended controls from existing engine
 * @param {Object} projectInfo - Project context
 * @returns {Object[]} Consolidated controls with framework tags
 */
function generateMultiFrameworkControls(selectedFrameworks, baseControls, projectInfo = {}) {
  // Always include ITSG-33 as the primary if not already included
  const frameworks = new Set(selectedFrameworks);
  const allFrameworks = [...frameworks];

  // Step 1: Tag base controls with applicable frameworks
  const taggedControls = baseControls.map(control => {
    const coverage = getFrameworkCoverage(control.family, allFrameworks);
    return {
      ...control,
      frameworks: coverage.map(c => c.frameworkId),
      frameworkRefs: coverage,
      isFrameworkSpecific: false,
      sourceFramework: 'ITSG-33'
    };
  });

  // Step 2: Add framework-specific controls
  const existingDomains = new Set(taggedControls.map(c => c.family));
  let fwSpecificCount = 0;

  for (const fwId of allFrameworks) {
    const specifics = FRAMEWORK_SPECIFIC_CONTROLS[fwId] || [];
    for (const specific of specifics) {
      // Check if this specific control's domain is already well-covered
      // by ITSG-33 controls. If the domain exists but the control adds
      // unique requirements, still add it.
      const alreadyHasSimilar = taggedControls.some(c =>
        c.id === specific.id ||
        (c.family === specific.family && c.title.toLowerCase().includes(specific.title.toLowerCase().split(' ')[0]))
      );

      if (!alreadyHasSimilar) {
        const coverage = getFrameworkCoverage(specific.family, allFrameworks);
        taggedControls.push({
          id: specific.id,
          family: specific.family,
          familyName: DOMAINS[specific.family] || specific.family,
          title: specific.title,
          description: `[${FRAMEWORKS[fwId]?.name || fwId}] ${specific.description}`,
          evidenceGuidance: specific.evidenceGuidance || '',
          priority: 'P1',
          profiles: [],
          tags: [],
          commonInheritance: [],
          isInherited: false,
          inheritedFrom: [],
          frameworks: [fwId, ...coverage.filter(c => c.frameworkId !== fwId).map(c => c.frameworkId)],
          frameworkRefs: [{ frameworkId: fwId, frameworkName: FRAMEWORKS[fwId]?.name || fwId, reference: specific.id }, ...coverage],
          isFrameworkSpecific: true,
          sourceFramework: fwId,
          tailoredDescription: specific.description,
          relevanceScore: 10
        });
        fwSpecificCount++;
      }
    }
  }

  console.log(`[Frameworks] Generated ${taggedControls.length} controls (${baseControls.length} base + ${fwSpecificCount} framework-specific) across ${allFrameworks.length} frameworks`);

  return taggedControls;
}

/**
 * Get a summary of framework coverage for an assessment.
 */
function getFrameworkCoverageSummary(controls, selectedFrameworks) {
  const summary = {};
  for (const fwId of selectedFrameworks) {
    const fw = FRAMEWORKS[fwId];
    const covered = controls.filter(c => c.frameworks && c.frameworks.includes(fwId));
    const specific = covered.filter(c => c.sourceFramework === fwId);
    summary[fwId] = {
      ...fw,
      id: fwId,
      totalControls: covered.length,
      specificControls: specific.length,
      sharedControls: covered.length - specific.length,
      domains: [...new Set(covered.map(c => c.family))]
    };
  }
  return summary;
}

/**
 * Get all framework IDs grouped by category for the UI checklist.
 */
function getFrameworksByCategory() {
  const categories = {
    'Canadian Government': [],
    'Canadian Financial': [],
    'US Government': [],
    'US Financial': [],
    'European Union': [],
    'Europe National': [],
    'UK': [],
    'Australia': [],
    'Global / International': []
  };

  const categoryMap = {
    'ITSG-33': 'Canadian Government', 'CCCS-MEDIUM': 'Canadian Government',
    'OSFI-B13': 'Canadian Financial',
    'NIST-800-53': 'US Government', 'FEDRAMP': 'US Government', 'CMMC': 'US Government', 'STATERAMP': 'US Government',
    'NYDFS-500': 'US Financial',
    'NIS2': 'European Union', 'DORA': 'European Union',
    'BSI-GRUNDSCHUTZ': 'Europe National', 'ANSSI-RGS': 'Europe National', 'ENS': 'Europe National',
    'NCSC-CAF': 'UK',
    'ASD-ISM': 'Australia', 'ASD-E8': 'Australia', 'APRA-CPS234': 'Australia',
    'ISO-27001': 'Global / International', 'SOC2': 'Global / International', 'PCI-DSS': 'Global / International'
  };

  for (const [fwId, fw] of Object.entries(FRAMEWORKS)) {
    const cat = categoryMap[fwId] || 'Global / International';
    categories[cat].push({ id: fwId, ...fw });
  }

  return Object.entries(categories)
    .filter(([_, fws]) => fws.length > 0)
    .map(([category, fws]) => ({ category, frameworks: fws }));
}

module.exports = {
  FRAMEWORKS,
  DOMAINS,
  FRAMEWORK_DOMAIN_MAP,
  FRAMEWORK_SPECIFIC_CONTROLS,
  getFrameworkDomains,
  getFrameworkCoverage,
  generateMultiFrameworkControls,
  getFrameworkCoverageSummary,
  getFrameworksByCategory
};
