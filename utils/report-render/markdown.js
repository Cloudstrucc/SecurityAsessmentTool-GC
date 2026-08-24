/**
 * Markdown renderer (Phase A). A plain-text rendering of the report model — useful
 * for pasting into tickets, wikis and PRs. Branding contributes only a text header
 * (no colours/logo in Markdown); CSV is unaffected and produced elsewhere.
 */
const { makeT } = require('./labels');

function h(level, text) { return `${'#'.repeat(level)} ${text}\n\n`; }
function table(headers, rows) {
  if (!rows.length) return '';
  const line = a => `| ${a.join(' | ')} |\n`;
  return line(headers) + line(headers.map(() => '---')) + rows.map(r => line(r.map(c => String(c == null ? '' : c).replace(/\|/g, '\\|').replace(/\n/g, ' ')))).join('') + '\n';
}

function render(model, opts = {}) {
  const t = opts.t || makeT(opts.req);
  const b = opts.branding || {};
  const m = model;
  let out = '';
  if (b.footer_text || b.organization_name) out += `*${b.organization_name || b.footer_text}*\n\n`;
  out += h(1, `${m.title} — ${m.subject}`);
  out += `**${t('rf.reportId')}:** \`${m.reportId}\`  \n`;
  out += `**${t('rf.generated')}:** ${m.meta.generatedAt} ${t('rf.generatedBy')} ${m.meta.generatedBy}  \n`;
  out += `**${t('rf.language')}:** ${m.meta.language}\n\n`;
  if (m.immutable) out += `> ${t('rf.pinnedNote')}\n\n`;

  const P = m.project;
  if (P) {
    out += h(2, t('rf.systemProfile'));
    out += table([t('rf.role'), ''], [
      [t('rf.securityFramework'), P.security_framework || 'ITSG-33'],
      [t('rf.controlProfile'), `${P.security_profile || ''} ${P.framework_baseline || ''}`.trim()],
      [t('rf.classification'), P.data_classification || ''],
      [t('rf.confidentiality'), P.confidentiality_level || ''],
      [t('rf.integrity'), P.integrity_level || ''],
      [t('rf.availability'), P.availability_level || '']
    ]);
  }

  if (m.type === 'intake') {
    const i = m.intake;
    out += h(2, t('rf.systemProfile'));
    out += table([t('rf.role'), ''], [
      [t('rf.securityFramework'), i.security_framework || 'ITSG-33'],
      [t('rf.controlProfile'), `${i.security_profile || ''} ${i.framework_baseline || ''}`.trim()],
      [t('rf.classification'), i.data_classification || ''],
      [`${t('rf.confidentiality')}/${t('rf.integrity')}/${t('rf.availability')}`, `${i.confidentiality_level || ''} / ${i.integrity_level || ''} / ${i.availability_level || ''}`],
      [t('rf.personalInformation'), i.has_pii ? 'Yes' : 'No'],
      [t('rf.hosting'), i.hosting_type || ''],
      [t('rf.systemType'), i.app_type || ''],
      [t('rf.technologies'), (i.technologies || []).join(', ')]
    ]);
    out += h(2, t('rf.accountability'));
    out += table([t('rf.role'), t('rf.name'), t('rf.contact')], [
      [t('rf.systemOwner'), i.owner_name || '', i.owner_email || ''],
      [t('rf.intakeTechLead'), i.tech_lead_name || '', i.tech_lead_email || ''],
      [t('rf.authorizingOfficial'), i.authority_name || '', i.authority_email || '']
    ]);
    if (i.additional_notes) out += `### ${t('rf.intakeNotes')}\n\n${i.additional_notes}\n\n`;
  } else if (m.type === 'assessment') {
    const s = m.stats, tot = s.totals;
    out += h(2, t('rf.assessmentSummary'));
    out += `- ${t('rf.overallScore')}: **${m.assessment.score}%**\n`;
    out += `- ${t('rf.satisfied')}: ${tot.s} · ${t('rf.partial')}: ${tot.p} · ${t('rf.notSatisfied')}: ${tot.f} · ${t('rf.notApplicable')}: ${tot.na}\n\n`;
    out += h(2, t('rf.postureByFamily'));
    out += table([t('rf.family'), t('rf.name'), t('rf.applicable'), t('rf.satisfied'), t('rf.partial'), t('rf.notSatisfied'), t('rf.score')],
      s.families.map(f => [f.code, f.name, f.app, f.s, f.p, f.f, (f.app ? ((f.s + f.p * 0.5) / f.app * 100).toFixed(0) : '—') + '%']));
    out += h(2, t('rf.findings'));
    m.findings.forEach(c => {
      out += `### ${c.control_id} — ${c.title}\n\n`;
      out += `- **${t('rf.result')}:** ${t('rf.' + (c.result === 'failed' ? 'notSatisfied' : c.result))}\n`;
      out += `- **${t('rf.finding')}:** ${c.finding || '—'}\n`;
      out += `- **${t('rf.evidence')}:** ${c.evidence || '—'}\n\n`;
    });
    out += h(2, t('rf.versionHistory'));
    out += table([t('rf.version'), t('rf.title'), t('rf.date'), t('rf.by'), t('rf.summary')],
      m.versions.map(v => [v.version, v.label || '', String(v.created_at || '').slice(0, 10), v.created_by_name || '', v.summary || '']));
  } else if (m.type === 'decision-package') {
    const d = m.decision;
    out += h(2, t('rf.decision'));
    out += table([t('rf.role'), ''], [
      [t('rf.decisionType'), (d.decision_type || 'ato').toUpperCase()],
      [t('rf.state'), d.state || ''], [t('rf.pinnedAssessment'), `#${d.assessment_id || '—'} v${d.assessment_version || '—'}`],
      [t('rf.issued'), d.issued_at], [t('rf.expires'), d.expires_at]
    ]);
    if (d.executive_summary) out += `### ${t('rf.executiveSummary')}\n\n${d.executive_summary}\n\n`;
    if (d.residual_risk_statement) out += `### ${t('rf.residualRisk')}\n\n${d.residual_risk_statement}\n\n`;
    if (d.conditions) out += `### ${t('rf.conditionsOfAuth')}\n\n${d.conditions}\n\n`;
    out += h(2, t('rf.poamRegister'));
    out += table(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.owner'), t('rf.due'), t('rf.state')],
      (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.assigned_to || '', i.deadline || '', i.state + (i.overdue ? ' (overdue)' : '')]));
  } else if (m.type === 'poam') {
    out += h(2, t('rf.poamRegister'));
    out += table(['#', t('rf.control'), t('rf.risk'), t('rf.finding'), t('rf.remediation'), t('rf.owner'), t('rf.originalDue'), t('rf.currentDue'), t('rf.moves'), t('rf.state')],
      (m.poam || []).map(i => [i.id, i.control_id || '', i.risk_level || '', i.description || '', i.remediation_plan || '', i.assigned_to || '', i.deadline_original || '', i.deadline || '', i.deadline_changes || 0, i.state + (i.overdue ? ' (overdue)' : '')]));
  } else if (m.type === 'project') {
    out += h(2, t('rf.assessments'));
    out += table(['#', t('rf.type'), t('rf.status'), t('rf.version'), t('rf.score'), t('rf.result')],
      m.assessments.map(a => [a.id, a.type || '', a.status || '', a.version, a.score != null ? a.score + '%' : '—', a.result || '']));
    out += h(2, t('rf.decisionPackages'));
    out += table([t('rf.packageReference'), t('rf.type'), t('rf.state'), t('rf.expires')],
      m.decisions.map(d => [d.reference || '', d.decision_type || '', d.state || '', d.expires_at]));
    out += h(2, t('rf.outstandingConditions'));
    out += table(['#', t('rf.control'), t('rf.risk'), t('rf.owner'), t('rf.due'), t('rf.state')],
      m.conditions.filter(i => i.state !== 'accepted').map(i => [i.id, i.control_id || '', i.risk_level || '', i.assigned_to || '', i.deadline || '', i.state]));
  } else if (m.type === 'portfolio') {
    const S = m.summary;
    out += h(2, t('rf.systems'));
    out += `- ${t('rf.systems')}: ${S.total} · ${t('rf.authorized')}: ${S.authorized} · ${t('rf.meanScore')}: ${S.meanScore}%\n\n`;
    out += table([t('rf.system'), t('rf.classification'), t('rf.score'), t('rf.decisionCol'), t('rf.expires'), t('rf.poamCol'), t('rf.overdue'), t('rf.state')],
      m.rows.map(r => [r.name, r.classification || '', r.score != null ? r.score + '%' : '—', r.decision_type || '—', r.expires_at, r.open_conditions, r.overdue, r.state]));
  }
  return out;
}

module.exports = { render };
