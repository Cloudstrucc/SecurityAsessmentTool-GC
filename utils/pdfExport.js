const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Colour constants ──
const COLORS = {
  navy: '#26374a',
  red: '#af3c43',
  text: '#333333',
  muted: '#6c757d',
  link: '#2b4380',
  success: '#1e7e34',
  warning: '#e68a00',
  danger: '#c9302c',
  lightBg: '#f5f7fa',
  white: '#ffffff'
};

// ── Helper: add page header ──
function pageHeader(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 80).fill(COLORS.navy);
  doc.fontSize(18).fillColor(COLORS.white).text(title, 50, 22, { width: doc.page.width - 100 });
  if (subtitle) {
    doc.fontSize(10).fillColor('#aabbcc').text(subtitle, 50, 48, { width: doc.page.width - 100 });
  }
  doc.moveDown(4);
  doc.fillColor(COLORS.text);
}

// ── Helper: section heading ──
function sectionHeading(doc, text) {
  if (doc.y > 680) doc.addPage();
  doc.moveDown(0.5);
  doc.rect(50, doc.y, doc.page.width - 100, 1).fill(COLORS.red);
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor(COLORS.navy).text(text, { underline: false });
  doc.moveDown(0.4);
  doc.fillColor(COLORS.text);
}

// ── Helper: info row ──
function infoRow(doc, label, value) {
  doc.fontSize(9).fillColor(COLORS.muted).text(label + ':', { continued: true });
  doc.fillColor(COLORS.text).text('  ' + (value || 'N/A'));
}

// ── Helper: status label ──
function statusText(result) {
  if (result === 'met') return 'MET';
  if (result === 'partially-met') return 'PARTIALLY MET';
  if (result === 'not-met') return 'NOT MET';
  return 'PENDING';
}
function statusColor(result) {
  if (result === 'met') return COLORS.success;
  if (result === 'partially-met') return COLORS.warning;
  if (result === 'not-met') return COLORS.danger;
  return COLORS.muted;
}

// ── Helper: truncate text ──
function truncate(text, max) {
  if (!text) return '';
  const clean = text.replace(/\n+/g, ' ').trim();
  return clean.length > max ? clean.substring(0, max) + '...' : clean;
}

// ── Helper: strip HTML ──
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

// ── Helper: compute stats ──
function computeStats(controls) {
  const applicable = controls.filter(c => c.is_applicable);
  const inherited = controls.filter(c => c.is_inherited);
  const met = controls.filter(c => c.audit_result === 'met');
  const partial = controls.filter(c => c.audit_result === 'partially-met');
  const notMet = controls.filter(c => c.audit_result === 'not-met');
  const pending = controls.filter(c => !c.audit_result || c.audit_result === 'pending');
  const na = controls.filter(c => !c.is_applicable);
  const evidenced = controls.filter(c => c.evidence_status === 'provided');
  const score = applicable.length > 0
    ? Math.round((met.length + partial.length * 0.5) / applicable.length * 100) : 0;
  return { applicable, inherited, met, partial, notMet, pending, na, evidenced, score };
}

// ── Helper: draw score bar ──
function drawScoreBar(doc, stats, width) {
  const barY = doc.y;
  const barH = 12;
  const total = stats.applicable.length || 1;
  doc.rect(50, barY, width, barH).fill('#e9ecef');
  const metW = (stats.met.length / total) * width;
  const partW = (stats.partial.length / total) * width;
  const nmW = (stats.notMet.length / total) * width;
  if (metW > 0) doc.rect(50, barY, metW, barH).fill(COLORS.success);
  if (partW > 0) doc.rect(50 + metW, barY, partW, barH).fill(COLORS.warning);
  if (nmW > 0) doc.rect(50 + metW + partW, barY, nmW, barH).fill(COLORS.danger);
  doc.moveDown(1.2);
}

// ── Helper: draw family breakdown table ──
function drawFamilyTable(doc, controls) {
  const familyMap = {};
  controls.forEach(c => {
    if (!familyMap[c.family]) familyMap[c.family] = { name: c.family_name, total: 0, met: 0, partial: 0, notMet: 0, pending: 0, inherited: 0, evidence: 0 };
    const f = familyMap[c.family];
    f.total++;
    if (c.audit_result === 'met') f.met++;
    else if (c.audit_result === 'partially-met') f.partial++;
    else if (c.audit_result === 'not-met') f.notMet++;
    else f.pending++;
    if (c.is_inherited) f.inherited++;
    if (c.evidence_status === 'provided') f.evidence++;
  });

  doc.fontSize(8).fillColor(COLORS.navy);
  const tableX = 50;
  const colW = [35, 130, 32, 28, 36, 42, 40, 32, 45];
  const headers = ['Family', 'Name', 'Total', 'Met', 'Partial', 'Not Met', 'Pending', 'Inher.', 'Evidence'];
  let tx = tableX;
  const headerY = doc.y;
  headers.forEach((h, i) => {
    doc.text(h, tx, headerY, { width: colW[i], align: 'left' });
    tx += colW[i];
  });
  doc.moveDown(0.4);
  doc.rect(tableX, doc.y, 420, 0.5).fill(COLORS.navy);
  doc.moveDown(0.3);

  Object.keys(familyMap).sort().forEach(code => {
    if (doc.y > 700) doc.addPage();
    const f = familyMap[code];
    const rowY = doc.y;
    let rx = tableX;
    const vals = [code, truncate(f.name, 22), f.total, f.met, f.partial, f.notMet, f.pending, f.inherited, f.evidence + '/' + f.total];
    const valColors = [COLORS.text, COLORS.text, COLORS.text, COLORS.success, COLORS.warning, COLORS.danger, COLORS.muted, COLORS.link, COLORS.text];
    vals.forEach((v, i) => {
      doc.fontSize(8).fillColor(valColors[i]).text(String(v), rx, rowY, { width: colW[i], align: 'left' });
      rx += colW[i];
    });
    doc.moveDown(0.2);
  });

  return familyMap;
}

// ── Helper: draw control detail with evidence ──
function drawControlDetail(doc, control, verbose) {
  if (doc.y > 640) doc.addPage();

  const sColor = statusColor(control.audit_result);
  doc.fontSize(9).fillColor(sColor).text('● ', { continued: true });
  doc.fillColor(COLORS.navy).text(`${control.control_id}`, { continued: true });
  doc.fillColor(COLORS.text).text(` – ${control.title}`, { continued: true });
  doc.fillColor(sColor).text(`   [${statusText(control.audit_result)}]`);

  // Badges line
  doc.fontSize(8).fillColor(COLORS.muted);
  let badges = `Priority: ${control.priority || 'P1'}`;
  const riskLvl = control.risk_level || 'medium';
  badges += `   |   TBS Risk: ${riskLvl.toUpperCase()}`;
  if (control.is_inherited) badges += `   |   Inherited: ${control.inherited_from || 'Shared services'}`;
  if (!control.is_applicable) badges += `   |   NOT APPLICABLE`;
  doc.text(badges, { indent: 15 });

  if (verbose) {
    // Tailored description
    if (control.tailored_description) {
      doc.fontSize(8).fillColor(COLORS.muted).text('Tailored Description:', { indent: 15 });
      doc.fontSize(8).fillColor(COLORS.text).text(truncate(control.tailored_description, 500), { indent: 15 });
    }
    // Evidence guidance
    if (control.evidence_guidance) {
      doc.fontSize(8).fillColor(COLORS.muted).text('Evidence Guidance:', { indent: 15 });
      doc.fontSize(8).fillColor(COLORS.text).text(truncate(control.evidence_guidance, 300), { indent: 15 });
    }
  }

  // ★ Evidence text
  const evText = stripHtml(control.evidence_html) || control.evidence_text || '';
  if (control.evidence_status === 'provided' && evText) {
    doc.fontSize(8).fillColor(COLORS.success).text('Evidence:', { indent: 15 });
    doc.fontSize(8).fillColor(COLORS.text).text(truncate(evText, verbose ? 800 : 500), { indent: 15 });
  } else if (evText) {
    doc.fontSize(8).fillColor(COLORS.link).text('Evidence (draft):', { indent: 15 });
    doc.fontSize(8).fillColor(COLORS.text).text(truncate(evText, verbose ? 600 : 300), { indent: 15 });
  } else if (verbose) {
    doc.fontSize(8).fillColor(COLORS.muted).text('No evidence provided', { indent: 15, oblique: true });
  }

  // Auditor comments
  if (control.audit_comments) {
    doc.fontSize(8).fillColor('#8b5cf6').text('Auditor Comments:', { indent: 15 });
    doc.fontSize(8).fillColor(COLORS.text).text(truncate(control.audit_comments, 400), { indent: 15 });
  }

  doc.moveDown(0.3);
  doc.rect(65, doc.y, doc.page.width - 130, 0.3).fill('#e9ecef');
  doc.moveDown(0.2);
}

// ── Helper: add page footers ──
function addFooters(doc, footerText) {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(COLORS.muted);
    doc.text(
      `${footerText} — Page ${i + 1} of ${pageCount}`,
      50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' }
    );
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ASSESSMENT REPORT PDF
// ═══════════════════════════════════════════════════════════════════════════════
function generateAssessmentReport(assessment, controls, project, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const stats = computeStats(controls);

    // ── Title page ──
    pageHeader(doc, 'Security Assessment Report', 'ITSG-33 Security Control Assessment');

    sectionHeading(doc, 'Project Information');
    doc.fontSize(10);
    infoRow(doc, 'Project Name', project.name);
    infoRow(doc, 'Classification', (project.data_classification || 'Protected B').toUpperCase());
    infoRow(doc, 'Security Profile', project.security_profile || 'PBMM');
    if (project.confidentiality_level) {
      infoRow(doc, 'Categorization',
        `${(project.confidentiality_level || '').toUpperCase()} / ${(project.integrity_level || 'Medium').toUpperCase()} / ${(project.availability_level || 'Medium').toUpperCase()}`);
    }
    infoRow(doc, 'Hosting', project.hosting_type || 'N/A');
    infoRow(doc, 'Application Type', project.app_type || 'N/A');
    infoRow(doc, 'PII', project.has_pii ? 'Yes' : 'No');
    infoRow(doc, 'Assessment Date', new Date(assessment.created_at).toLocaleDateString('en-CA'));
    if (assessment.overall_score !== null && assessment.overall_score !== undefined) {
      infoRow(doc, 'Overall Score', assessment.overall_score + '%');
    }
    infoRow(doc, 'Result', (assessment.result || 'Pending').toUpperCase());

    // ── Summary ──
    sectionHeading(doc, 'Compliance Summary');
    doc.fontSize(10).fillColor(COLORS.text);
    doc.text(`Total Controls: ${controls.length}     Applicable: ${stats.applicable.length}     Inherited: ${stats.inherited.length}     N/A: ${stats.na.length}`);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(COLORS.navy).text(`Compliance Score: ${stats.score}%`);
    doc.moveDown(0.3);
    drawScoreBar(doc, stats, 400);
    doc.fontSize(9).fillColor(COLORS.text);
    doc.text(`Met: ${stats.met.length}   |   Partially Met: ${stats.partial.length}   |   Not Met: ${stats.notMet.length}   |   Pending: ${stats.pending.length}   |   Evidence Provided: ${stats.evidenced.length}`);

    // ── Family breakdown table ──
    sectionHeading(doc, 'Compliance by Control Family');
    drawFamilyTable(doc, controls);

    // ── Detailed Controls with Evidence ──
    doc.addPage();
    pageHeader(doc, 'Detailed Control Assessment', `${controls.length} controls — evidence and audit results`);

    let currentFamily = '';
    controls.forEach(control => {
      if (control.family !== currentFamily) {
        currentFamily = control.family;
        if (doc.y > 640) doc.addPage();
        doc.moveDown(0.5);
        doc.rect(50, doc.y, doc.page.width - 100, 22).fill(COLORS.lightBg);
        doc.fontSize(11).fillColor(COLORS.navy).text(`${control.family} – ${control.family_name}`, 55, doc.y + 4);
        doc.moveDown(1.6);
      }
      drawControlDetail(doc, control, true);
    });

    addFooters(doc, `Government of Canada — ITSG-33 SA Report — ${project.name}`);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// ATO / iATO DOCUMENT PDF
// ═══════════════════════════════════════════════════════════════════════════════
function generateATODocument(assessment, project, atoType, controls, outputPath, extras = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const isIATO = atoType === 'iato';
    const title = isIATO ? 'Interim Authority to Operate (iATO)' : 'Authority to Operate (ATO)';
    const stats = computeStats(controls);
    const { poamItems = [], riskAcceptance = '', poamNotes = '' } = extras;

    // ── Official header ──
    doc.rect(0, 0, doc.page.width, 90).fill(COLORS.navy);
    doc.fontSize(11).fillColor('#aabbcc').text('GOVERNMENT OF CANADA', 50, 15, { align: 'center' });
    doc.fontSize(20).fillColor(COLORS.white).text(title, 50, 35, { align: 'center' });
    doc.fontSize(10).fillColor('#aabbcc').text('ITSG-33 Security Assessment & Authorization', 50, 65, { align: 'center' });

    doc.moveDown(5.5);
    doc.fillColor(COLORS.text);

    // ── System Details ──
    sectionHeading(doc, 'System Details');
    doc.fontSize(10);
    infoRow(doc, 'System Name', project.name);
    infoRow(doc, 'Security Classification', (project.data_classification || 'Protected B').toUpperCase());
    infoRow(doc, 'Security Profile', project.security_profile || 'PBMM');
    if (project.confidentiality_level) {
      infoRow(doc, 'Categorization',
        `${(project.confidentiality_level || '').toUpperCase()} / ${(project.integrity_level || 'Medium').toUpperCase()} / ${(project.availability_level || 'Medium').toUpperCase()}`);
    }
    infoRow(doc, 'Hosting Type', project.hosting_type || 'N/A');
    infoRow(doc, 'Assessment Date', new Date(assessment.audit_completed_at || assessment.created_at).toLocaleDateString('en-CA'));
    if (isIATO && assessment.ato_expiry_date) {
      infoRow(doc, 'Expiry Date', new Date(assessment.ato_expiry_date).toLocaleDateString('en-CA'));
    }

    // ── Compliance Summary ──
    sectionHeading(doc, 'Compliance Summary');
    doc.fontSize(10).fillColor(COLORS.text);
    doc.text(`Total Controls Assessed: ${controls.length}     Applicable: ${stats.applicable.length}     Inherited: ${stats.inherited.length}`);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(COLORS.navy).text(`Compliance Score: ${stats.score}%`);
    doc.moveDown(0.3);
    drawScoreBar(doc, stats, 400);
    doc.fontSize(9).fillColor(COLORS.text);
    doc.text(`Met: ${stats.met.length}   |   Partially Met: ${stats.partial.length}   |   Not Met: ${stats.notMet.length}   |   Pending: ${stats.pending.length}   |   Evidence Provided: ${stats.evidenced.length} of ${controls.length}`);

    // ── Family Breakdown ──
    sectionHeading(doc, 'Compliance by Control Family');
    drawFamilyTable(doc, controls);

    // ── Authorization Statement ──
    if (doc.y > 500) doc.addPage();
    sectionHeading(doc, 'Authorization Statement');
    doc.fontSize(10).fillColor(COLORS.text);

    if (!isIATO) {
      doc.text(
        `Based on the security assessment conducted in accordance with ITSG-33 guidelines, the system "${project.name}" ` +
        `has been evaluated against ${controls.length} security controls (${stats.applicable.length} applicable). ` +
        `The system achieved a compliance score of ${stats.score}%, with ${stats.met.length} controls fully met, ` +
        `${stats.partial.length} partially met, and ${stats.notMet.length} not met. ` +
        `${stats.inherited.length} controls are inherited from shared infrastructure. ` +
        `${stats.evidenced.length} controls have documented evidence.\n\n` +
        `This Authority to Operate authorizes the system for operational use within the Government of Canada, ` +
        `subject to the conditions and residual risks documented herein. The system owner is responsible for ` +
        `maintaining the security posture and reporting any changes that may affect the security categorization.`,
        { lineGap: 2 }
      );
    } else {
      doc.text(
        `Based on the security assessment conducted in accordance with ITSG-33 guidelines, the system "${project.name}" ` +
        `has been evaluated against ${controls.length} security controls (${stats.applicable.length} applicable). ` +
        `The system achieved a compliance score of ${stats.score}%, with ${stats.met.length} controls fully met, ` +
        `${stats.partial.length} partially met, and ${stats.notMet.length} not met. ` +
        `${stats.inherited.length} controls are inherited from shared infrastructure.\n\n` +
        `This Interim Authority to Operate grants temporary authorization for the system pending remediation ` +
        `of the outstanding items identified below. Failure to address these items by the specified ` +
        `deadline${assessment.ato_expiry_date ? ' (' + new Date(assessment.ato_expiry_date).toLocaleDateString('en-CA') + ')' : ''} ` +
        `may result in revocation of this authorization.`,
        { lineGap: 2 }
      );
      if (riskAcceptance) {
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor(COLORS.navy).text('Risk Acceptance:', { underline: false });
        doc.fontSize(10).fillColor(COLORS.text).text(riskAcceptance, { lineGap: 2, indent: 10 });
      }
    }

    // ── Findings (Not Met / Partially Met) ──
    const findings = controls.filter(c => c.audit_result === 'not-met' || c.audit_result === 'partially-met');
    if (findings.length > 0) {
      doc.addPage();
      pageHeader(doc, isIATO ? 'Remediation Required Items' : 'Findings & Observations',
        `${findings.length} controls require attention`);

      findings.forEach(c => drawControlDetail(doc, c, true));
    }

    // ── POA&M Section (for iATO) ──
    if (isIATO && poamItems.length > 0) {
      doc.addPage();
      pageHeader(doc, 'Plan of Action & Milestones (POA&M)',
        `${poamItems.length} remediation items — TBS Directive on Security Management`);

      if (riskAcceptance) {
        doc.fontSize(10).fillColor(COLORS.navy).text('Risk Acceptance Statement:', { underline: false });
        doc.moveDown(0.2);
        doc.fontSize(9).fillColor(COLORS.text).text(riskAcceptance, { indent: 10 });
        doc.moveDown(0.5);
      }

      if (poamNotes) {
        doc.fontSize(9).fillColor(COLORS.muted).text('Notes: ' + poamNotes);
        doc.moveDown(0.5);
      }

      // POA&M summary
      const poamHigh = poamItems.filter(i => i.risk_level === 'high').length;
      const poamMed = poamItems.filter(i => i.risk_level === 'medium').length;
      const poamLow = poamItems.filter(i => i.risk_level === 'low').length;
      const poamOpen = poamItems.filter(i => i.status === 'open').length;
      const poamCompleted = poamItems.filter(i => i.status === 'completed' || i.status === 'verified').length;
      doc.fontSize(9).fillColor(COLORS.text);
      doc.text(`Total Items: ${poamItems.length}   |   High: ${poamHigh}   |   Medium: ${poamMed}   |   Low: ${poamLow}   |   Open: ${poamOpen}   |   Completed: ${poamCompleted}`);
      doc.moveDown(0.5);

      // POA&M table
      poamItems.forEach((item, idx) => {
        if (doc.y > 660) doc.addPage();

        const riskColor = item.risk_level === 'high' ? COLORS.danger
          : item.risk_level === 'medium' ? COLORS.warning : '#17a2b8';
        const statusLabel = (item.status || 'open').toUpperCase().replace('-', ' ');

        doc.fontSize(9).fillColor(riskColor).text(`[${(item.risk_level || 'medium').toUpperCase()}] `, { continued: true });
        doc.fillColor(COLORS.navy).text(`${idx + 1}. ${item.description}`);

        doc.fontSize(8).fillColor(COLORS.muted);
        let meta = [];
        if (item.control_id) meta.push('Control: ' + item.control_id);
        if (item.deadline) meta.push('Deadline: ' + new Date(item.deadline).toLocaleDateString('en-CA'));
        if (item.assigned_to) meta.push('Assigned: ' + item.assigned_to);
        meta.push('Status: ' + statusLabel);
        doc.text(meta.join('   |   '), { indent: 15 });

        if (item.original_finding) {
          doc.fontSize(8).fillColor(COLORS.muted).text('Finding: ' + truncate(item.original_finding, 300), { indent: 15 });
        }
        if (item.remediation_plan) {
          doc.fontSize(8).fillColor(COLORS.link).text('Remediation Plan: ' + truncate(item.remediation_plan, 300), { indent: 15 });
        }
        doc.moveDown(0.3);
        doc.rect(65, doc.y, doc.page.width - 130, 0.3).fill('#e9ecef');
        doc.moveDown(0.2);
      });
    }

    // ── Full Control Evidence Appendix ──
    doc.addPage();
    pageHeader(doc, 'Appendix: Full Control Evidence', `${controls.length} controls — ${stats.evidenced.length} with evidence`);

    let currentFamily = '';
    controls.forEach(c => {
      if (c.family !== currentFamily) {
        currentFamily = c.family;
        if (doc.y > 640) doc.addPage();
        doc.moveDown(0.3);
        doc.rect(50, doc.y, doc.page.width - 100, 18).fill(COLORS.lightBg);
        doc.fontSize(10).fillColor(COLORS.navy).text(`${c.family} – ${c.family_name}`, 55, doc.y + 3);
        doc.moveDown(1.3);
      }
      drawControlDetail(doc, c, false);
    });

    // ── Signature Page ──
    doc.addPage();
    pageHeader(doc, 'Authorization Signatures', '');
    doc.moveDown(2);
    doc.fontSize(10).fillColor(COLORS.text);
    doc.text(`System: ${project.name}`);
    doc.text(`Classification: ${(project.data_classification || 'Protected B').toUpperCase()}`);
    doc.text(`Authorization Type: ${title}`);
    doc.text(`Compliance Score: ${stats.score}%`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-CA')}`);

    doc.moveDown(3);
    const sigY = doc.y;
    doc.fontSize(10).fillColor(COLORS.text);
    doc.text('_________________________________', 50, sigY);
    doc.text('Security Assessor', 50, sigY + 18);
    doc.text('Date: ____________________', 50, sigY + 33);
    doc.text('_________________________________', 320, sigY);
    doc.text('Project Authority', 320, sigY + 18);
    doc.text('Date: ____________________', 320, sigY + 33);
    doc.text('_________________________________', 50, sigY + 75);
    doc.text('Chief Information Officer', 50, sigY + 93);
    doc.text('Date: ____________________', 50, sigY + 108);
    doc.text('_________________________________', 320, sigY + 75);
    doc.text('Departmental Security Officer', 320, sigY + 93);
    doc.text('Date: ____________________', 320, sigY + 108);

    addFooters(doc, `Government of Canada — ${title} — ${project.name}`);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function cleanText(value, fallback = 'N/A') {
  const text = stripHtml(value === null || value === undefined ? '' : String(value)).replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function formatDateValue(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-CA');
}

function resolveLogoPath(branding = {}, logoDir) {
  if (!branding.logo_filename || !logoDir) return null;
  const logoPath = path.join(logoDir, branding.logo_filename);
  return fs.existsSync(logoPath) ? logoPath : null;
}

function brandConfig(project = {}, options = {}) {
  const branding = options.branding || {};
  return {
    organization: branding.organization_name || project.department || project.organization_name || 'Security Assessment',
    subtitle: branding.report_subtitle || 'Security Assessment and Authorization',
    classification: branding.classification_label || project.data_classification || '',
    assessorCompany: branding.assessor_company_name || '',
    logoPath: resolveLogoPath(branding, options.logoDir)
  };
}

function brandedHeader(doc, title, project = {}, options = {}) {
  const brand = brandConfig(project, options);
  const accent = '#d4a017';
  const teal = '#0f766e';
  doc.rect(0, 0, doc.page.width, 86).fill(COLORS.navy);
  doc.rect(0, 82, doc.page.width, 4).fill(accent);

  if (brand.logoPath) {
    try {
      doc.image(brand.logoPath, 50, 18, { fit: [58, 42], align: 'left', valign: 'center' });
    } catch (err) {
      // Keep report generation resilient if an uploaded logo is invalid.
    }
  }

  const textX = brand.logoPath ? 122 : 50;
  doc.fontSize(9).fillColor('#dbe6f3').text(brand.organization, textX, 16, { width: doc.page.width - textX - 50 });
  doc.fontSize(17).fillColor(COLORS.white).text(title, textX, 32, { width: doc.page.width - textX - 50 });
  doc.fontSize(9).fillColor('#dbe6f3').text(brand.subtitle, textX, 57, { width: doc.page.width - textX - 50 });
  if (brand.classification) {
    doc.roundedRect(doc.page.width - 180, 15, 130, 20, 3).fill(teal);
    doc.fontSize(8).fillColor(COLORS.white).text(String(brand.classification).toUpperCase(), doc.page.width - 172, 20, { width: 114, align: 'center' });
  }
  doc.y = 112;
  doc.fillColor(COLORS.text);
}

function ensureSpace(doc, needed = 80, options = {}) {
  if (doc.y + needed > doc.page.height - 56) {
    doc.addPage();
    if (options.title) brandedHeader(doc, options.title, options.project, options);
  }
}

function brandedSection(doc, title, options = {}) {
  ensureSpace(doc, 54, options);
  doc.moveDown(0.3);
  doc.rect(50, doc.y, doc.page.width - 100, 1).fill('#d4a017');
  doc.moveDown(0.4);
  doc.fontSize(12).fillColor(COLORS.navy).text(title);
  doc.moveDown(0.3);
  doc.fillColor(COLORS.text);
}

function brandedInfoRows(doc, rows, options = {}) {
  rows.filter(row => row && row.length).forEach(([label, value]) => {
    ensureSpace(doc, 20, options);
    doc.fontSize(8).fillColor(COLORS.muted).text(String(label) + ':', { continued: true });
    doc.fillColor(COLORS.text).text('  ' + cleanText(value, 'N/A'));
  });
  doc.moveDown(0.3);
}

function paragraph(doc, text, options = {}) {
  ensureSpace(doc, 60, options);
  doc.fontSize(9).fillColor(COLORS.text).text(cleanText(text, 'None provided.'), { lineGap: 2 });
  doc.moveDown(0.4);
}

function drawProjectControl(doc, control, options = {}) {
  ensureSpace(doc, 145, options);
  const title = `${control.control_id || ''} - ${control.title || 'Untitled Control'}`;
  const applicable = control.is_applicable ? 'Applicable' : 'Not Applicable';
  const status = control.audit_result || control.evidence_status || control.assessment_status || 'pending';
  const risk = control.risk_level || 'medium';

  doc.roundedRect(50, doc.y, doc.page.width - 100, 20, 3).fill(COLORS.lightBg);
  doc.fontSize(9).fillColor(COLORS.navy).text(title, 58, doc.y + 5, { width: doc.page.width - 116 });
  doc.moveDown(1.5);
  doc.fontSize(8).fillColor(COLORS.muted)
    .text(`Framework: ${control.framework || 'ITSG-33'}   Family: ${control.family_name || control.family || 'N/A'}   Status: ${status}   Applicability: ${applicable}   Risk: ${risk}`);
  doc.moveDown(0.2);

  [
    ['Description', control.description],
    ['Control Guidance', control.control_guidance],
    ['Evidence Guidance', control.evidence_guidance],
    ['Evidence Collected', control.evidence_text || control.evidence_html],
    ['Assessor Notes', control.assessor_notes || control.audit_comments]
  ].forEach(([label, value]) => {
    const body = cleanText(value, '');
    if (!body) return;
    ensureSpace(doc, 42, options);
    doc.fontSize(8).fillColor(COLORS.muted).text(label + ':');
    doc.fontSize(8).fillColor(COLORS.text).text(truncate(body, 850), { lineGap: 1, indent: 10 });
  });
  doc.moveDown(0.4);
}

function drawPoamItem(doc, item, options = {}) {
  ensureSpace(doc, 95, options);
  const riskColor = item.risk_level === 'high' ? COLORS.danger : item.risk_level === 'medium' ? COLORS.warning : '#0f766e';
  doc.fontSize(9).fillColor(riskColor).text(`[${(item.risk_level || 'medium').toUpperCase()}] `, { continued: true });
  doc.fillColor(COLORS.navy).text(cleanText(item.description, 'POA&M item'));
  doc.fontSize(8).fillColor(COLORS.muted)
    .text(`Control: ${item.control_id || 'N/A'}   Owner: ${item.assigned_to || 'N/A'}   Due: ${formatDateValue(item.deadline)}   Status: ${item.status || 'open'}`);
  if (item.remediation_plan) doc.fontSize(8).fillColor(COLORS.text).text('Mitigation Plan: ' + truncate(cleanText(item.remediation_plan, ''), 450), { indent: 10 });
  if (item.milestone) doc.fontSize(8).fillColor(COLORS.text).text('Milestones: ' + truncate(cleanText(item.milestone, ''), 350), { indent: 10 });
  if (item.residual_risk) doc.fontSize(8).fillColor(COLORS.text).text('Residual Risk: ' + truncate(cleanText(item.residual_risk, ''), 350), { indent: 10 });
  if (item.assessor_notes) doc.fontSize(8).fillColor(COLORS.text).text('Assessor Notes: ' + truncate(cleanText(item.assessor_notes, ''), 350), { indent: 10 });
  doc.moveDown(0.4);
}

function finishBrandedDocument(doc, footerText) {
  addFooters(doc, footerText);
  doc.end();
}

function generateControlsReport(project, controls, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const headerOptions = { ...options, title: 'Project Control Assessment Report', project };
    brandedHeader(doc, headerOptions.title, project, options);
    brandedInfoRows(doc, [
      ['Project Name', project.name],
      ['Organization', (options.branding || {}).organization_name || project.department],
      ['Report Generated', new Date().toLocaleDateString('en-CA')],
      ['Control Count', controls.length],
      ['Classification', project.data_classification],
      ['Security Profile', project.security_profile]
    ], headerOptions);

    const stats = computeStats(controls);
    brandedSection(doc, 'Control Summary', headerOptions);
    doc.fontSize(9).fillColor(COLORS.text)
      .text(`Total: ${controls.length}   Applicable: ${stats.applicable.length}   Met: ${stats.met.length}   Partially Met: ${stats.partial.length}   Not Met: ${stats.notMet.length}   Pending: ${stats.pending.length}`);
    doc.moveDown(0.4);
    drawScoreBar(doc, stats, 400);

    brandedSection(doc, 'Controls', headerOptions);
    controls.forEach(control => drawProjectControl(doc, control, headerOptions));

    finishBrandedDocument(doc, `${brandConfig(project, options).organization} - Controls Report - ${project.name}`);
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function generateFullProjectReport(project, data, outputPath) {
  return new Promise((resolve, reject) => {
    data = data || {};
    const options = { ...(data || {}), title: 'Full Project Security Report', project };
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    brandedHeader(doc, options.title, project, data || {});
    brandedInfoRows(doc, [
      ['Project Name', project.name],
      ['Organization', (data.branding || {}).organization_name || project.department],
      ['Generated', new Date().toLocaleDateString('en-CA')],
      ['Classification', project.data_classification],
      ['Security Profile', project.security_profile],
      ['Hosting', project.hosting_type],
      ['Application Type', project.app_type]
    ], options);

    brandedSection(doc, 'Project Overview', options);
    paragraph(doc, project.description || project.specifications || 'No project description provided.', options);

    brandedSection(doc, 'Organization Information', options);
    brandedInfoRows(doc, [
      ['Department', project.department],
      ['Branch', project.branch],
      ['Project Owner', project.project_owner_name],
      ['Project Owner Email', project.project_owner_email],
      ['Project Authority', project.project_authority_name],
      ['CIO', project.cio_name]
    ], options);

    brandedSection(doc, 'Documentation List', options);
    if ((data.documents || []).length) {
      (data.documents || []).forEach(document => {
        ensureSpace(doc, 30, options);
        doc.fontSize(8).fillColor(COLORS.text)
          .text(`${document.original_name}   Type: ${document.document_type || document.mime_type || 'N/A'}   Uploaded: ${formatDateValue(document.created_at)}   Size: ${document.size || 0} bytes`);
      });
      doc.moveDown(0.3);
    } else {
      paragraph(doc, 'No project documents are associated with this project. Attachments are intentionally not embedded in this report.', options);
    }

    brandedSection(doc, 'Assessment Summary', options);
    if ((data.assessments || []).length) {
      (data.assessments || []).forEach(assessment => {
        brandedInfoRows(doc, [
          ['Assessment', `${assessment.invite_code || assessment.id} (${assessment.status || 'draft'})`],
          ['Result', assessment.result || 'Pending'],
          ['Created', assessment.created_at],
          ['Updated', assessment.updated_at]
        ], options);
      });
    } else {
      paragraph(doc, 'No assessments have been created for this project yet.', options);
    }

    brandedSection(doc, 'Control Assessment Results', options);
    if ((data.controls || []).length) {
      data.controls.forEach(control => drawProjectControl(doc, control, options));
    } else {
      paragraph(doc, 'No tailored controls have been saved yet.', options);
    }

    brandedSection(doc, 'POA&M Items', options);
    if ((data.poamItems || []).length) {
      data.poamItems.forEach(item => drawPoamItem(doc, item, options));
    } else {
      paragraph(doc, 'No POA&M items are currently recorded.', options);
    }

    brandedSection(doc, 'ATO/iATO Summary', options);
    if ((data.atoRecords || []).length) {
      data.atoRecords.forEach(ato => {
        brandedInfoRows(doc, [
          ['Record', `${(ato.record_type || 'ato').toUpperCase()} - ${ato.title || ato.system_name || project.name}`],
          ['Status', ato.authorization_status],
          ['Authorization Date', ato.authorization_date],
          ['Expiry Date', ato.expiry_date]
        ], options);
      });
    } else {
      paragraph(doc, 'No ATO/iATO records have been created for this project.', options);
    }

    brandedSection(doc, 'Report Metadata', options);
    paragraph(doc, 'Uploaded attachments are listed for traceability but are not embedded in this full project report.', options);

    finishBrandedDocument(doc, `${brandConfig(project, data || {}).organization} - Full Project Report - ${project.name}`);
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function generateATORecordReport(ato, project, data, outputPath) {
  return new Promise((resolve, reject) => {
    data = data || {};
    const title = `${(ato.record_type || 'ato').toUpperCase()} Authorization Package`;
    const options = { ...(data || {}), title, project };
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    brandedHeader(doc, title, project, data || {});
    brandedInfoRows(doc, [
      ['ATO/iATO ID', ato.id],
      ['Title', ato.title],
      ['System Name', ato.system_name || project.name],
      ['Organization', ato.organization_name || (data.branding || {}).organization_name],
      ['Authorizing Official', ato.authorizing_official],
      ['Assessor', ato.assessor],
      ['Authorization Status', ato.authorization_status],
      ['Authorization Date', ato.authorization_date],
      ['Expiry Date', ato.expiry_date],
      ['Generated', new Date().toLocaleDateString('en-CA')]
    ], options);

    const sections = [
      ['Executive Summary', ato.executive_summary],
      ['System Description', ato.system_description || project.description],
      ['Assessment Scope', ato.assessment_scope],
      ['Control Assessment Summary', ato.security_control_summary],
      ['Risk Summary', ato.risk_summary],
      ['Residual Risk Statement', ato.residual_risk_statement],
      ['POA&M Summary', ato.poam_summary],
      ['Conditions of Authorization', ato.conditions_of_authorization],
      ['Assessor Notes', ato.assessor_notes],
      ['Static Report Text', ato.static_sections],
      ['Custom Sections', ato.custom_sections]
    ];

    sections.forEach(([heading, body]) => {
      brandedSection(doc, heading, options);
      paragraph(doc, body, options);
    });

    brandedSection(doc, 'Control Assessment Appendix', options);
    if ((data.controls || []).length) {
      const stats = computeStats(data.controls || []);
      doc.fontSize(9).fillColor(COLORS.text)
        .text(`Total Controls: ${data.controls.length}   Applicable: ${stats.applicable.length}   Met: ${stats.met.length}   Partially Met: ${stats.partial.length}   Not Met: ${stats.notMet.length}`);
      doc.moveDown(0.4);
      (data.controls || []).slice(0, 40).forEach(control => drawProjectControl(doc, control, options));
      if ((data.controls || []).length > 40) paragraph(doc, `${data.controls.length - 40} additional controls omitted from this appendix preview. Use the controls export for the full detail set.`, options);
    } else {
      paragraph(doc, 'No controls are linked to this authorization record.', options);
    }

    brandedSection(doc, 'Plan of Action and Milestones', options);
    if ((data.poamItems || []).length) {
      data.poamItems.forEach(item => drawPoamItem(doc, item, options));
    } else {
      paragraph(doc, 'No POA&M items are linked to this authorization record.', options);
    }

    brandedSection(doc, 'Signature and Approval', options);
    ensureSpace(doc, 150, options);
    const sigY = doc.y + 20;
    doc.fontSize(9).fillColor(COLORS.text);
    doc.text('_________________________________', 50, sigY);
    doc.text('Authorizing Official', 50, sigY + 18);
    doc.text('Date: ____________________', 50, sigY + 34);
    doc.text('_________________________________', 320, sigY);
    doc.text('Security Assessor', 320, sigY + 18);
    doc.text('Date: ____________________', 320, sigY + 34);

    finishBrandedDocument(doc, `${brandConfig(project, data || {}).organization} - ${title} - ${project.name}`);
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = {
  generateAssessmentReport,
  generateATODocument,
  generateControlsReport,
  generateFullProjectReport,
  generateATORecordReport
};
