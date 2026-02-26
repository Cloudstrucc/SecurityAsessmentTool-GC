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
function generateATODocument(assessment, project, atoType, controls, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER', bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const isIATO = atoType === 'iato';
    const title = isIATO ? 'Interim Authority to Operate (iATO)' : 'Authority to Operate (ATO)';
    const stats = computeStats(controls);

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
    }

    // ── Findings (Not Met / Partially Met) ──
    const findings = controls.filter(c => c.audit_result === 'not-met' || c.audit_result === 'partially-met');
    if (findings.length > 0) {
      doc.addPage();
      pageHeader(doc, isIATO ? 'Remediation Required Items' : 'Findings & Observations',
        `${findings.length} controls require attention`);

      findings.forEach(c => drawControlDetail(doc, c, true));
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

module.exports = { generateAssessmentReport, generateATODocument };
