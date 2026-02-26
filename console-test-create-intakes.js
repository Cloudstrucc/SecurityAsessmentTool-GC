/**
 * GC SA&A Tool — Sample Intake Seeder
 * 
 * Paste this into the browser console while logged in as a client at /intake
 * (or any authenticated page). It submits 6 diverse intakes spanning
 * different security profiles: Unclassified, PA/L/L, PBMM, PBMM+HVA,
 * PB/H/H, and Secret/M/M.
 *
 * Usage:
 *   1. Go to your app URL and register/log in as a client
 *   2. Open browser DevTools (F12) → Console
 *   3. Paste this entire script and press Enter
 *   4. Check /admin/intakes to see results
 */

(async function seedIntakes() {
  const intakes = [

    // ── 1. Unclassified static website — should get "No SA&A Required" ──
    {
      projectName: 'Canada.ca Departmental Landing Page',
      projectDescription: 'Static informational website for the department, hosted on GC Web infrastructure. No user login, no data collection, no forms. HTML/CSS content only.',
      department: 'Transport Canada',
      branch: 'Communications Branch',
      targetDate: '2026-06-01',
      userCount: '5001+',
      appType: 'external',
      confidentialityLevel: 'unclassified',
      integrityLevel: 'low',
      availabilityLevel: 'low',
      piiTypes: 'none',
      atipSubject: 'no',
      piaCompleted: 'not-required',
      hostingType: 'cloud-public',
      hostingRegion: 'canada',
      technologies: ['ssl-tls'],
      hasAPIs: 'no',
      gcInterconnections: 'no',
      mobileAccess: 'no',
      externalUsers: 'no',
      ownerName: 'Marie Dubois',
      ownerEmail: 'marie.dubois@tc.gc.ca',
      ownerTitle: 'Web Manager',
      techLeadName: 'Kevin Park',
      techLeadEmail: 'kevin.park@tc.gc.ca',
      techLeadTitle: 'Web Developer',
      additionalNotes: 'Simple static site refresh. No backend services.'
    },

    // ── 2. Protected A / Low / Low — should get CCCS Low ──
    {
      projectName: 'Internal Staff Directory',
      projectDescription: 'Internal-only employee directory with name, title, office location, and phone extension. Read-only for most users, updated by HR. Protected A data only — no SIN, no performance info.',
      department: 'Natural Resources Canada',
      branch: 'Corporate Services',
      targetDate: '2026-08-15',
      userCount: '501-5000',
      appType: 'internal',
      confidentialityLevel: 'protected-a',
      integrityLevel: 'low',
      availabilityLevel: 'low',
      piiTypes: ['name-address'],
      atipSubject: 'yes',
      piaCompleted: 'yes',
      hostingType: 'ssc-dc',
      hostingRegion: 'canada',
      technologies: ['active-directory', 'gc-network'],
      hasAPIs: 'no',
      gcInterconnections: 'no',
      mobileAccess: 'no',
      externalUsers: 'no',
      ownerName: 'Sandra Thompson',
      ownerEmail: 'sandra.thompson@nrcan.gc.ca',
      ownerTitle: 'Director, Corporate Services',
      techLeadName: 'Ahmed Hassan',
      techLeadEmail: 'ahmed.hassan@nrcan.gc.ca',
      techLeadTitle: 'Senior Systems Analyst',
      additionalNotes: 'Replacing legacy Lotus Notes directory.'
    },

    // ── 3. Protected B / Medium / Medium — standard PBMM ──
    {
      projectName: 'Immigration Case Management System',
      projectDescription: 'Cloud-based case management portal for immigration officers. Handles application processing, applicant PII, medical exam results, background check data, and decision records. Integrates with GCMS via API. SSO with Microsoft Entra ID, MFA enforced.',
      department: 'Immigration, Refugees and Citizenship Canada',
      branch: 'Operations Branch',
      targetDate: '2026-04-30',
      userCount: '501-5000',
      appType: 'hybrid',
      confidentialityLevel: 'protected-b',
      integrityLevel: 'medium',
      availabilityLevel: 'medium',
      piiTypes: ['name-address', 'immigration', 'health', 'biometric', 'law-enforcement'],
      atipSubject: 'yes',
      piaCompleted: 'in-progress',
      hostingType: 'cloud-public',
      hostingRegion: 'canada',
      technologies: ['azure', 'entra-id', 'mfa', 'siem-sentinel', 'defender', 'key-vault', 'waf', 'ssl-tls'],
      hasAPIs: 'yes',
      gcInterconnections: 'yes',
      interconnections: 'GCMS (Global Case Management System), CBSA Lookout system, biometrics matching service',
      mobileAccess: 'no',
      externalUsers: 'no',
      ownerName: 'Priya Sharma',
      ownerEmail: 'priya.sharma@ircc.gc.ca',
      ownerTitle: 'Director General, Digital Services',
      techLeadName: 'James Wilson',
      techLeadEmail: 'james.wilson@ircc.gc.ca',
      techLeadTitle: 'Chief Architect',
      authorityName: 'Dr. Hélène Tremblay',
      authorityEmail: 'helene.tremblay@ircc.gc.ca',
      authorityTitle: 'CISO, IRCC',
      completedActivities: ['stra', 'network-diagram'],
      additionalNotes: 'Phase 2 of the IRCC Digital Modernization initiative. Must be operational by Q2 2026.'
    },

    // ── 4. Protected B / Medium / Medium + HVA — PBMM with HVA overlay ──
    {
      projectName: 'CRA MyAccount Tax Filing Portal',
      projectDescription: 'National-scale citizen-facing tax filing portal handling millions of Canadian tax returns. Processes SIN, income data, banking information for direct deposits, and Notice of Assessment records. High-value asset due to national-scale service delivery and volume of sensitive financial PII.',
      department: 'Canada Revenue Agency',
      branch: 'Assessment, Benefit and Service Branch',
      targetDate: '2026-03-01',
      userCount: '5001+',
      appType: 'external',
      confidentialityLevel: 'protected-b',
      integrityLevel: 'medium',
      availabilityLevel: 'medium',
      isHVA: '1',
      piiTypes: ['name-address', 'sin', 'financial', 'employment'],
      atipSubject: 'yes',
      piaCompleted: 'yes',
      hostingType: 'cloud-public',
      hostingRegion: 'canada',
      technologies: ['azure', 'entra-id', 'mfa', 'siem-sentinel', 'defender', 'key-vault', 'waf', 'ssl-tls', 'pim', 'backup-azure'],
      hasAPIs: 'yes',
      gcInterconnections: 'yes',
      interconnections: 'CRA tax processing mainframe, banking payment gateway (Payments Canada), Service Canada identity verification, provincial tax systems',
      mobileAccess: 'yes',
      externalUsers: 'yes',
      ownerName: 'David Chen',
      ownerEmail: 'david.chen@cra-arc.gc.ca',
      ownerTitle: 'Assistant Commissioner, Digital Services',
      techLeadName: 'Laura Martinez',
      techLeadEmail: 'laura.martinez@cra-arc.gc.ca',
      techLeadTitle: 'Enterprise Architect',
      authorityName: 'Robert Fontaine',
      authorityEmail: 'robert.fontaine@cra-arc.gc.ca',
      authorityTitle: 'Agency CISO',
      completedActivities: ['stra', 'soa', 'network-diagram', 'pia'],
      additionalNotes: 'Designated High Value Asset per TBS. Must maintain 99.95% availability during tax season (Feb-Apr). Previous ATO expires March 2026.'
    },

    // ── 5. Protected B / High / High — PB_HIGH tailored ──
    {
      projectName: 'National Health Surveillance Platform',
      projectDescription: 'Real-time public health surveillance system aggregating data from provincial health authorities, hospitals, and labs. Monitors disease outbreaks, tracks vaccination records, and issues public health alerts. Data corruption or unavailability during a pandemic could endanger lives. Microservices architecture with API gateway, Redis caching, PostgreSQL database.',
      department: 'Public Health Agency of Canada',
      branch: 'Centre for Emergency Preparedness and Response',
      targetDate: '2026-05-15',
      userCount: '501-5000',
      appType: 'hybrid',
      confidentialityLevel: 'protected-b',
      integrityLevel: 'high',
      availabilityLevel: 'high',
      piiTypes: ['name-address', 'health', 'sin'],
      atipSubject: 'yes',
      piaCompleted: 'in-progress',
      hostingType: 'cloud-public',
      hostingRegion: 'canada',
      technologies: ['azure', 'entra-id', 'mfa', 'siem-sentinel', 'defender', 'key-vault', 'waf', 'ssl-tls', 'backup-azure'],
      otherTech: 'PostgreSQL, Redis, Kubernetes (AKS), API Gateway, Event Hub, geo-redundant storage',
      hasAPIs: 'yes',
      gcInterconnections: 'yes',
      interconnections: 'Provincial health ministry APIs (all 13 PT), WHO IHR reporting, CIHI, hospital lab information systems (HL7/FHIR)',
      mobileAccess: 'yes',
      externalUsers: 'yes',
      ownerName: 'Dr. Anika Patel',
      ownerEmail: 'anika.patel@phac-aspc.gc.ca',
      ownerTitle: 'VP, Digital Health Infrastructure',
      techLeadName: 'Marcus Johnson',
      techLeadEmail: 'marcus.johnson@phac-aspc.gc.ca',
      techLeadTitle: 'Principal Cloud Architect',
      authorityName: 'Dr. Claire Beaumont',
      authorityEmail: 'claire.beaumont@phac-aspc.gc.ca',
      authorityTitle: 'Chief Information Security Officer',
      completedActivities: ['stra', 'soa', 'network-diagram', 'pia'],
      additionalNotes: 'Mission-critical system — 99.99% availability target. Active-active across Canada Central and Canada East. RPO: 5 min, RTO: 15 min.'
    },

    // ── 6. Secret / Medium / Medium — ITSG-33 Profile 3 ──
    {
      projectName: 'Intelligence Analysis Collaboration Platform',
      projectDescription: 'Classified SECRET collaboration platform for intelligence analysts across Five Eyes partner agencies. Handles intelligence assessments, source reports, and operational planning documents. Deployed on classified network infrastructure with TEMPEST-rated facilities.',
      department: 'Communications Security Establishment',
      branch: 'Cyber Security Operations',
      targetDate: '2026-09-30',
      userCount: '1-50',
      appType: 'internal',
      confidentialityLevel: 'secret',
      integrityLevel: 'medium',
      availabilityLevel: 'medium',
      piiTypes: 'none',
      atipSubject: 'no',
      piaCompleted: 'not-required',
      hostingType: 'on-premises',
      hostingRegion: 'canada',
      technologies: ['ssc-dc', 'gc-network', 'active-directory'],
      hasAPIs: 'yes',
      gcInterconnections: 'yes',
      interconnections: 'CSEC classified network, DND CANCOMS, CSIS systems (classified interconnect)',
      mobileAccess: 'no',
      externalUsers: 'no',
      ownerName: 'Col. Martin Leclerc',
      ownerEmail: 'martin.leclerc@cse-cst.gc.ca',
      ownerTitle: 'Director, Cyber Operations',
      techLeadName: 'Dr. Sarah Kim',
      techLeadEmail: 'sarah.kim@cse-cst.gc.ca',
      techLeadTitle: 'Lead Security Architect (TS cleared)',
      authorityName: 'BGen. Philippe Gagnon',
      authorityEmail: 'philippe.gagnon@cse-cst.gc.ca',
      authorityTitle: 'Designated Authorizing Official',
      completedActivities: ['stra', 'soa', 'network-diagram'],
      additionalNotes: 'SECRET network only. TEMPEST Zone 1 facility. All personnel TS cleared. CSE SA&A process applies — this intake is for tracking purposes.'
    }
  ];

  console.log('%c GC SA&A Tool — Seeding ' + intakes.length + ' sample intakes...', 'font-size:14px; font-weight:bold; color:#1a5276;');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < intakes.length; i++) {
    const intake = intakes[i];
    const form = new FormData();

    // Map all fields to FormData
    for (const [key, value] of Object.entries(intake)) {
      if (Array.isArray(value)) {
        value.forEach(v => form.append(key, v));
      } else if (value !== undefined && value !== null) {
        form.append(key, value);
      }
    }

    try {
      const resp = await fetch('/intake', {
        method: 'POST',
        body: form,
        redirect: 'manual'
      });

      // The form responds with 200 (rendered success page) or 302 redirect
      const text = await resp.text();
      const refMatch = text.match(/INT-[A-Z0-9]{8}/);
      const ref = refMatch ? refMatch[0] : '(submitted)';

      if (resp.status === 200 || resp.status === 302) {
        success++;
        const profiles = {
          'unclassified': '🟢 No SA&A',
          'protected-a':  '🔵 CCCS Low',
          'protected-b':  '🟡 PBMM',
          'secret':       '⚫ SECRET/M/M'
        };
        let profileHint = profiles[intake.confidentialityLevel] || '🔴 Custom';
        if (intake.isHVA === '1') profileHint = '🟠 PBMM+HVA';
        if (intake.integrityLevel === 'high' || intake.availabilityLevel === 'high') profileHint = '🔴 PB/H/H';

        console.log(
          `%c ✓ ${i+1}/${intakes.length} %c ${ref} %c ${intake.projectName} %c ${profileHint}`,
          'color:green; font-weight:bold',
          'color:#888',
          'color:#1a5276; font-weight:bold',
          'color:#666; font-style:italic'
        );
      } else {
        failed++;
        console.log(`%c ✗ ${i+1}/${intakes.length} FAILED (HTTP ${resp.status}): ${intake.projectName}`, 'color:red; font-weight:bold');
      }
    } catch (err) {
      failed++;
      console.log(`%c ✗ ${i+1}/${intakes.length} ERROR: ${intake.projectName} — ${err.message}`, 'color:red; font-weight:bold');
    }

    // Small delay between submissions
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('');
  console.log(
    `%c Done! ${success} submitted, ${failed} failed. Check /admin/intakes to review.`,
    'font-size:13px; font-weight:bold; color:' + (failed === 0 ? '#27ae60' : '#c0392b')
  );

})();