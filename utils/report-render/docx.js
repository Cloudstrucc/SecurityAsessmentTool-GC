/**
 * DOCX renderer (Phase A). Produces an editable Word document from the report
 * model using the `docx` library. Branding sets the accent colour used for
 * headings and the title; the logo/colours of the HTML/PDF do not all carry into
 * Word, by design — DOCX is meant to be edited downstream.
 *
 * Returns a Buffer (via docx Packer).
 */
const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType } = docx;
const { makeT } = require('./labels');

function hexNoHash(c, fallback) {
  const v = String(c || '').replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

function render(model, opts = {}) {
  const t = opts.t || makeT(opts.req);
  const b = opts.branding || {};
  const accent = hexNoHash(b.accent_color, '4D9FE0');
  const ink = hexNoHash(b.primary_color, '143453');
  const m = model;
  const children = [];

  const P = (text, o = {}) => new Paragraph({ children: [new TextRun({ text: String(text == null ? '' : text), ...o })], spacing: { after: 120 }, ...(o.para || {}) });
  const H = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ heading: level, spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, color: ink, bold: true })] });

  function dataTable(headers, rows) {
    const border = { style: BorderStyle.SINGLE, size: 2, color: 'DCE7F2' };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
    const headCells = headers.map(hh => new TableCell({
      shading: { fill: ink }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: String(hh), bold: true, color: 'FFFFFF', size: 16 })] })]
    }));
    const bodyRows = rows.map((r, i) => new TableRow({
      children: r.map(c => new TableCell({
        shading: i % 2 ? { fill: 'FAFCFE' } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: String(c == null ? '' : c), size: 16 })] })]
      }))
    }));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders,
      rows: [new TableRow({ tableHeader: true, children: headCells }), ...bodyRows] });
  }

  // ── title block ──
  if (b.organization_name) children.push(new Paragraph({ children: [new TextRun({ text: b.organization_name, color: accent, bold: true, size: 18 })] }));
  children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: m.title.toUpperCase(), color: accent, bold: true, size: 18 })] }));
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: m.subject, color: ink, bold: true })] }));
  children.push(P(m.subtitle, { color: '5F7185' }));
  children.push(dataTable([t('rf.reportId'), m.reportId], [
    [t('rf.generated'), `${m.meta.generatedAt} ${t('rf.generatedBy')} ${m.meta.generatedBy}`],
    [t('rf.language'), m.meta.language]
  ]));
  if (m.immutable) children.push(P(t('rf.pinnedNote'), { italics: true, color: '5F7185' }));

  const Prj = m.project;
  if (Prj) {
    children.push(H(t('rf.systemProfile')));
    children.push(dataTable([t('rf.role'), ''], [
      [t('rf.securityFramework'), Prj.security_framework || 'ITSG-33'],
      [t('rf.controlProfile'), `${Prj.security_profile || ''} ${Prj.framework_baseline || ''}`.trim()],
      [t('rf.classification'), Prj.data_classification || ''],
      [t('rf.confidentiality'), Prj.confidentiality_level || ''],
      [t('rf.integrity'), Prj.integrity_level || ''],
      [t('rf.availability'), Prj.availability_level || '']
    ]));
  }

  if (m.type === 'intake') {
    const i = m.intake;
    children.push(H(t('rf.systemProfile')));
    children.push(dataTable([t('rf.role'), ''], [
      [t('rf.securityFramework'), i.security_framework || 'ITSG-33'],
      [t('rf.controlProfile'), `${i.security_profile || ''} ${i.framework_baseline || ''}`.trim()],
      [t('rf.classification'), i.data_classification || ''],
      [`${t('rf.confidentiality')}/${t('rf.integrity')}/${t('rf.availability')}`, `${i.confidentiality_level || ''} / ${i.integrity_level || ''} / ${i.availability_level || ''}`],
      [t('rf.personalInformation'), i.has_pii ? 'Yes' : 'No'],
      [t('rf.hosting'), i.hosting_type || ''],
      [t('rf.systemType'), i.app_type || ''],
      [t('rf.technologies'), (i.technologies || []).join(', ')]
    ]));
    children.push(H(t('rf.accountability')));
    children.push(dataTable([t('rf.role'), t('rf.name'), t('rf.contact')], [
      [t('rf.systemOwner'), i.owner_name || '', i.owner_email || ''],
      [t('rf.intakeTechLead'), i.tech_lead_name || '', i.tech_lead_email || ''],
      [t('rf.authorizingOfficial'), i.authority_name || '', i.authority_email || '']
    ]));
    if (i.additional_notes) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t('rf.intakeNotes'), color: ink, bold: true })] })); children.push(P(i.additional_notes)); }
  } else if (m.type === 'assessment') {
    const s = m.stats, tot = s.totals;
    children.push(H(t('rf.assessmentSummary')));
    children.push(P(`${t('rf.overallScore')}: ${m.assessment.score}%  —  ${t('rf.satisfied')}: ${tot.s} · ${t('rf.partial')}: ${tot.p} · ${t('rf.notSatisfied')}: ${tot.f} · ${t('rf.notApplicable')}: ${tot.na}`));
    children.push(H(t('rf.postureByFamily')));
    children.push(dataTable([t('rf.family'), t('rf.name'), t('rf.applicable'), t('rf.satisfied'), t('rf.partial'), t('rf.notSatisfied'), t('rf.score')],
      s.families.map(f => [f.code, f.name, f.app, f.s, f.p, f.f, (f.app ? ((f.s + f.p * 0.5) / f.app * 100).toFixed(0) : '—') + '%'])));
    children.push(H(t('rf.findings')));
    m.findings.forEach(c => {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: `${c.control_id} — ${c.title}`, color: ink, bold: true })] }));
      children.push(P(`${t('rf.finding')}: ${c.finding || '—'}`));
      children.push(P(`${t('rf.evidence')}: ${c.evidence || '—'}`, { color: '5F7185' }));
    });
    children.push(H(t('rf.versionHistory')));
    children.push(dataTable([t('rf.version'), t('rf.title'), t('rf.date'), t('rf.by'), t('rf.summary')],
      m.versions.map(v => [v.version, v.label || '', String(v.created_at || '').slice(0, 10), v.created_by_name || '', v.summary || ''])));
  } else if (m.type === 'decision-package') {
    const d = m.decision;
    children.push(H(t('rf.decision')));
    children.push(dataTable([t('rf.role'), ''], [
      [t('rf.decisionType'), (d.decision_type || 'ato').toUpperCase()], [t('rf.state'), d.state || ''],
      [t('rf.pinnedAssessment'), `#${d.assessment_id || '—'} v${d.assessment_version || '—'}`],
      [t('rf.issued'), d.issued_at], [t('rf.expires'), d.expires_at]
    ]));
    if (d.executive_summary) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t('rf.executiveSummary'), color: ink, bold: true })] })); children.push(P(d.executive_summary)); }
    if (d.residual_risk_statement) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t('rf.residualRisk'), color: ink, bold: true })] })); children.push(P(d.residual_risk_statement)); }
    if (d.conditions) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t('rf.conditionsOfAuth'), color: ink, bold: true })] })); children.push(P(d.conditions)); }
    children.push(H(t('rf.poamRegister')));
    children.push(dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.owner'), t('rf.due'), t('rf.state')],
      (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.assigned_to || '', i.deadline || '', i.state + (i.overdue ? ' (overdue)' : '')])));
  } else if (m.type === 'poam') {
    children.push(H(t('rf.poamRegister')));
    children.push(dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.remediation'), t('rf.owner'), t('rf.currentDue'), t('rf.state')],
      (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.remediation_plan || '', i.assigned_to || '', i.deadline || '', i.state + (i.overdue ? ' (overdue)' : '')])));
  } else if (m.type === 'project') {
    children.push(H(t('rf.assessments')));
    children.push(dataTable(['#', t('rf.type'), t('rf.status'), t('rf.version'), t('rf.score'), t('rf.result')],
      m.assessments.map(a => [a.id, a.type || '', a.status || '', a.version, a.score != null ? a.score + '%' : '—', a.result || ''])));
    children.push(H(t('rf.decisionPackages')));
    children.push(dataTable([t('rf.packageReference'), t('rf.type'), t('rf.state'), t('rf.expires')],
      m.decisions.map(d => [d.reference || '', d.decision_type || '', d.state || '', d.expires_at])));
    children.push(H(t('rf.outstandingConditions')));
    children.push(dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.owner'), t('rf.due'), t('rf.state')],
      m.conditions.filter(i => i.state !== 'accepted').map(i => [i.id, i.control_id || '', i.risk_level || '', i.assigned_to || '', i.deadline || '', i.state])));
  } else if (m.type === 'portfolio') {
    const S = m.summary;
    children.push(H(t('rf.systems')));
    children.push(P(`${t('rf.systems')}: ${S.total} · ${t('rf.authorized')}: ${S.authorized} · ${t('rf.meanScore')}: ${S.meanScore}%`));
    children.push(dataTable([t('rf.system'), t('rf.classification'), t('rf.score'), t('rf.decisionCol'), t('rf.expires'), t('rf.poamCol'), t('rf.overdue'), t('rf.state')],
      m.rows.map(r => [r.name, r.classification || '', r.score != null ? r.score + '%' : '—', r.decision_type || '—', r.expires_at, r.open_conditions, r.overdue, r.state])));
  }

  if (b.footer_text) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun({ text: b.footer_text, size: 14, color: '5F7185' })] }));

  const doc = new Document({ creator: b.product_name || 'Aegis SA', title: `${m.title} — ${m.subject}`,
    sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = { render };
