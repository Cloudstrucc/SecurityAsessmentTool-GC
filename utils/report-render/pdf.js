/**
 * PDF renderer (Phase A) — the deliberate SECOND layout, built with pdfkit.
 *
 * The project chose to keep pdfkit rather than add a headless browser, accepting
 * that the PDF layout is maintained separately from the HTML one (html.js). This
 * renderer is model-driven so all five report types share one code path, and it
 * honours branding colours + header/footer. Returns a Promise<Buffer>.
 */
const PDFDocument = require('pdfkit');
const { makeT } = require('./labels');

function hex(c, fallback) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : fallback; }

function render(model, opts = {}) {
  const t = opts.t || makeT(opts.req);
  const b = opts.branding || {};
  const ink = hex(b.primary_color, '#143453');
  const accent = hex(b.accent_color, '#4d9fe0');
  const muted = '#5f7185', border = '#dce7f2', light = '#f4f9fd';
  const RES = { satisfied: '#2fa06d', partial: '#c98617', failed: '#c23b46' };
  const landscape = model.type === 'poam';
  const m = model;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 42, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const R = () => doc.page.width - doc.page.margins.right;
    const W = () => R() - L;
    const cls = b.classification_label || '';

    function ensure(space) { if (doc.y + space > doc.page.height - 64) doc.addPage(); }
    function heading(num, text) {
      ensure(40);
      const y = doc.y + 6;
      doc.moveTo(L, y).lineTo(R(), y).lineWidth(1.4).strokeColor(ink).stroke();
      doc.fontSize(12.5).fillColor(ink).font('Helvetica-Bold');
      doc.text(`${num ? num + '   ' : ''}${text}`, L, y + 5);
      doc.moveDown(0.5); doc.fillColor('#17273a').font('Helvetica');
    }
    function para(text, o = {}) {
      doc.fontSize(o.size || 9.5).fillColor(o.color || '#17273a').font(o.bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(String(text == null ? '' : text), { width: W(), lineGap: 1 });
      doc.moveDown(0.4);
    }
    function kv(rows) {
      const lw = 150;
      doc.fontSize(9.5);
      rows.forEach(([k, v]) => {
        ensure(18);
        const y = doc.y;
        doc.font('Helvetica-Bold');
        const kh = doc.heightOfString(String(k), { width: lw - 8 });
        doc.font('Helvetica');
        const vh = doc.heightOfString(String(v == null ? '' : v), { width: W() - lw });
        const rh = Math.max(kh, vh);
        doc.font('Helvetica-Bold').fillColor(ink).text(String(k), L, y, { width: lw - 8 });
        doc.font('Helvetica').fillColor('#17273a').text(String(v == null ? '' : v), L + lw, y, { width: W() - lw });
        doc.y = y + rh;
        doc.moveTo(L, doc.y + 2).lineTo(R(), doc.y + 2).lineWidth(0.5).strokeColor(border).stroke();
        doc.moveDown(0.35);
      });
      doc.moveDown(0.3);
    }
    // widths: array of fractions summing to ~1
    function dataTable(headers, rows, fracs, aligns) {
      const total = W();
      const cols = fracs.map(f => f * total);
      const pad = 5;
      function drawRow(cells, isHead, zebra) {
        const heights = cells.map((c, i) => {
          doc.fontSize(isHead ? 8 : 8.6).font(isHead ? 'Helvetica-Bold' : 'Helvetica');
          return doc.heightOfString(String(c == null ? '' : c), { width: cols[i] - pad * 2 });
        });
        const rh = Math.max(...heights) + pad * 2;
        ensure(rh + 4);
        let x = L; const y = doc.y;
        if (isHead) doc.rect(L, y, total, rh).fill(ink);
        else if (zebra) doc.rect(L, y, total, rh).fill('#fafcfe');
        cells.forEach((c, i) => {
          doc.fontSize(isHead ? 8 : 8.6).font(isHead ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(isHead ? '#ffffff' : '#17273a');
          doc.text(String(c == null ? '' : c), x + pad, y + pad, { width: cols[i] - pad * 2, align: (aligns && aligns[i]) || 'left' });
          x += cols[i];
        });
        if (!isHead) doc.moveTo(L, y + rh).lineTo(R(), y + rh).lineWidth(0.5).strokeColor(border).stroke();
        doc.y = y + rh;
      }
      drawRow(headers, true, false);
      rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
      doc.moveDown(0.6);
    }

    function pillText(state, overdue) {
      const map = { open: t('rf.open'), 'in-progress': t('rf.inProgress'), 'evidence-submitted': t('rf.evidenceSubmitted'),
        accepted: t('rf.accepted'), rejected: t('rf.rejected'), deferred: t('rf.deferred') };
      return (map[state] || state) + (overdue ? ` (${t('rf.overdue')})` : '');
    }
    function resultText(r) { return r === 'failed' ? t('rf.notSatisfied') : r === 'partial' ? t('rf.partial') : r === 'satisfied' ? t('rf.satisfied') : t('rf.pending'); }

    // ── header band + footer on each page (added at the end via bufferPages) ──
    function titleBlock() {
      doc.rect(0, 0, doc.page.width, 4).fill(accent);
      doc.fontSize(8.5).fillColor(accent).font('Helvetica-Bold').text((b.organization_name || 'Aegis SA').toUpperCase(), L, 34);
      doc.fontSize(22).fillColor(ink).font('Helvetica-Bold').text(m.subject, L, 50, { width: W() });
      doc.fontSize(11).fillColor(muted).font('Helvetica').text(m.subtitle || '', { width: W() });
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor(muted).font('Helvetica')
        .text(`${t('rf.reportId')}: ${m.reportId}   ·   ${t('rf.generated')}: ${m.meta.generatedAt} ${t('rf.generatedBy')} ${m.meta.generatedBy}`, { width: W() });
      if (cls) doc.fillColor(ink).font('Helvetica-Bold').text(cls.toUpperCase(), { width: W() });
      doc.moveDown(0.6);
      if (m.immutable) para(t('rf.pinnedNote'), { color: muted, size: 8.5 });
      else para(t('rf.liveNote'), { color: muted, size: 8.5 });
    }

    titleBlock();

    const P = m.project;
    if (P) {
      heading('1', t('rf.systemProfile'));
      kv([
        [t('rf.securityFramework'), P.security_framework || 'ITSG-33'],
        [t('rf.controlProfile'), `${P.security_profile || ''} ${P.framework_baseline || ''}`.trim()],
        [t('rf.classification'), P.data_classification || ''],
        [`${t('rf.confidentiality')} / ${t('rf.integrity')} / ${t('rf.availability')}`,
          `${P.confidentiality_level || ''} / ${P.integrity_level || ''} / ${P.availability_level || ''}`],
        [t('rf.hosting'), P.hosting_type || ''], [t('rf.systemType'), P.app_type || '']
      ]);
    }

    if (m.type === 'intake') {
      const i = m.intake;
      heading('1', t('rf.systemProfile'));
      kv([
        [t('rf.securityFramework'), i.security_framework || 'ITSG-33'],
        [t('rf.controlProfile'), `${i.security_profile || ''} ${i.framework_baseline || ''}`.trim()],
        [t('rf.classification'), i.data_classification || ''],
        [`${t('rf.confidentiality')} / ${t('rf.integrity')} / ${t('rf.availability')}`, `${i.confidentiality_level || ''} / ${i.integrity_level || ''} / ${i.availability_level || ''}`],
        [t('rf.personalInformation'), i.has_pii ? 'Yes' : 'No'],
        [t('rf.hosting'), `${i.hosting_type || ''}${i.hosting_region ? ' · ' + i.hosting_region : ''}`],
        [t('rf.systemType'), i.app_type || ''],
        [t('rf.technologies'), (i.technologies || []).join(', ')]
      ]);
      heading('2', t('rf.accountability'));
      dataTable([t('rf.role'), t('rf.name'), t('rf.contact')], [
        [t('rf.systemOwner'), i.owner_name || '—', i.owner_email || ''],
        [t('rf.intakeTechLead'), i.tech_lead_name || '—', i.tech_lead_email || ''],
        [t('rf.authorizingOfficial'), i.authority_name || '—', i.authority_email || '']
      ], [0.28, 0.32, 0.4]);
      if (i.additional_notes) { para(t('rf.intakeNotes'), { bold: true, color: ink }); para(i.additional_notes); }
    } else if (m.type === 'assessment') {
      const s = m.stats, tot = s.totals;
      heading('2', t('rf.assessmentSummary'));
      para(`${t('rf.overallScore')}: ${m.assessment.score}%   —   ${t('rf.satisfied')}: ${tot.s} · ${t('rf.partial')}: ${tot.p} · ${t('rf.notSatisfied')}: ${tot.f} · ${t('rf.notApplicable')}: ${tot.na}`, { bold: true });
      heading('3', t('rf.postureByFamily'));
      dataTable([t('rf.family'), t('rf.name'), t('rf.applicable'), t('rf.satisfied'), t('rf.partial'), t('rf.notSatisfied'), t('rf.score')],
        s.families.map(f => [f.code, f.name, f.app, f.s, f.p, f.f, (f.app ? ((f.s + f.p * 0.5) / f.app * 100).toFixed(0) : '—') + '%']),
        [0.09, 0.4, 0.1, 0.1, 0.1, 0.11, 0.1], ['left', 'left', 'right', 'right', 'right', 'right', 'right']);
      heading('4', t('rf.findings'));
      m.findings.forEach(c => {
        ensure(40);
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(ink).text(`${c.control_id} — ${c.title}`, { width: W() });
        doc.fillColor(RES[c.result] || muted).fontSize(8).text(resultText(c.result).toUpperCase());
        doc.font('Helvetica').fillColor('#17273a').fontSize(8.6);
        doc.text(`${t('rf.finding')}: ${c.finding || '—'}`, { width: W() });
        doc.fillColor(muted).text(`${t('rf.evidence')}: ${c.evidence || '—'}`, { width: W() });
        doc.moveDown(0.5);
      });
      heading('A', t('rf.versionHistory'));
      dataTable([t('rf.version'), t('rf.title'), t('rf.date'), t('rf.by'), t('rf.summary')],
        m.versions.map(v => [v.version, v.label || '', String(v.created_at || '').slice(0, 10), v.created_by_name || '', v.summary || '']),
        [0.08, 0.2, 0.13, 0.17, 0.42]);
    } else if (m.type === 'decision-package') {
      const d = m.decision;
      heading('2', t('rf.decision'));
      kv([[t('rf.decisionType'), (d.decision_type || 'ato').toUpperCase()], [t('rf.state'), d.state || ''],
        [t('rf.pinnedAssessment'), `#${d.assessment_id || '—'} v${d.assessment_version || '—'}`],
        [t('rf.issued'), d.issued_at], [t('rf.expires'), d.expires_at]]);
      if (d.executive_summary) { para(t('rf.executiveSummary'), { bold: true, color: ink }); para(d.executive_summary); }
      if (d.residual_risk_statement) { para(t('rf.residualRisk'), { bold: true, color: ink }); para(d.residual_risk_statement); }
      if (d.conditions) { para(t('rf.conditionsOfAuth'), { bold: true, color: ink }); para(d.conditions); }
      heading('3', t('rf.poamRegister'));
      dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.owner'), t('rf.due'), t('rf.state')],
        (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.assigned_to || '', i.deadline || '', pillText(i.state, i.overdue)]),
        [0.05, 0.12, 0.09, 0.36, 0.15, 0.11, 0.12], ['right', 'left', 'left', 'left', 'left', 'right', 'left']);
    } else if (m.type === 'poam') {
      heading(null, t('rf.poamRegister'));
      dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.remediation'), t('rf.milestone'), t('rf.owner'), t('rf.originalDue'), t('rf.currentDue'), t('rf.moves'), t('rf.state')],
        (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.remediation_plan || '', i.milestone || '', i.assigned_to || '', i.deadline_original || '', i.deadline || '', i.deadline_changes || 0, pillText(i.state, i.overdue)]),
        [0.03, 0.07, 0.055, 0.17, 0.18, 0.12, 0.09, 0.07, 0.07, 0.04, 0.085],
        ['right', 'left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'left']);
      if (m.promotion) para(t(m.promotion.blocked ? 'rf.promotionBlocked' : 'rf.promotionClear'), { bold: true, color: m.promotion.blocked ? RES.failed : RES.satisfied });
    } else if (m.type === 'project') {
      heading('1', t('rf.assessments'));
      dataTable(['#', t('rf.type'), t('rf.status'), t('rf.version'), t('rf.score'), t('rf.result')],
        m.assessments.map(a => [a.id, a.type || '', a.status || '', a.version, a.score != null ? a.score + '%' : '—', a.result || '']),
        [0.1, 0.2, 0.24, 0.12, 0.14, 0.2], ['right', 'left', 'left', 'right', 'right', 'left']);
      heading('2', t('rf.decisionPackages'));
      dataTable([t('rf.packageReference'), t('rf.type'), t('rf.state'), t('rf.expires')],
        m.decisions.map(d => [d.reference || '', d.decision_type || '', d.state || '', d.expires_at]),
        [0.4, 0.2, 0.2, 0.2]);
      heading('3', t('rf.outstandingConditions'));
      dataTable(['#', t('rf.control'), t('rf.risk'), t('rf.owner'), t('rf.due'), t('rf.state')],
        m.conditions.filter(i => i.state !== 'accepted').map(i => [i.id, i.control_id || '', i.risk_level || '', i.assigned_to || '', i.deadline || '', pillText(i.state, i.overdue)]),
        [0.07, 0.16, 0.12, 0.3, 0.15, 0.2], ['right', 'left', 'left', 'left', 'right', 'left']);
    } else if (m.type === 'portfolio') {
      const S = m.summary;
      heading('1', t('rf.systems'));
      para(`${t('rf.systems')}: ${S.total} · ${t('rf.authorized')}: ${S.authorized} · ${t('rf.meanScore')}: ${S.meanScore}%`, { bold: true });
      dataTable([t('rf.system'), t('rf.classification'), t('rf.score'), t('rf.decisionCol'), t('rf.expires'), t('rf.poamCol'), t('rf.overdue'), t('rf.state')],
        m.rows.map(r => [r.name, r.classification || '', r.score != null ? r.score + '%' : '—', r.decision_type || '—', r.expires_at, r.open_conditions, r.overdue, r.state]),
        [0.24, 0.16, 0.09, 0.11, 0.13, 0.08, 0.08, 0.11], ['left', 'left', 'right', 'left', 'right', 'right', 'right', 'left']);
    }

    // ── footers on every buffered page ──
    // The footer sits below the text area. pdfkit auto-adds a page whenever text
    // would cross the bottom margin, so drawing a footer there spawns blank pages
    // (one per footer line). Zeroing the page's bottom margin and passing
    // lineBreak:false keeps every footer on its own page — no phantom pages.
    const range = doc.bufferedPageRange(); // { start, count }
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 40;
      const opt = { width: W(), lineBreak: false };
      doc.moveTo(L, fy).lineTo(R(), fy).lineWidth(0.5).strokeColor(border).stroke();
      doc.fontSize(7.6).fillColor(muted).font('Helvetica');
      if (cls) doc.fillColor(ink).font('Helvetica-Bold').text(cls.toUpperCase(), L, fy + 5, { ...opt, width: W() / 3 });
      doc.fillColor(muted).font('Helvetica').text(b.footer_text || '', L, fy + 5, { ...opt, align: 'center' });
      doc.text(`${m.reportId} · ${t('rf.page')} ${i - range.start + 1} ${t('rf.of')} ${range.count}`, L, fy + 5, { ...opt, align: 'right' });
    }
    doc.end();
  });
}

module.exports = { render };
