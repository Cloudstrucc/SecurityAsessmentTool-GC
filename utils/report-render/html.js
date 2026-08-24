/**
 * HTML renderer (Phase A). Turns a report model (config/report-model.js) into a
 * self-contained, print-ready HTML document. Drives BOTH the on-screen "view
 * report" page and the .html download. Branding (config/report-branding.js) sets
 * the colours, logo and header/footer; `t` localizes every label.
 *
 * The PDF renderer (pdf.js) is a deliberate SECOND layout using pdfkit, per the
 * project decision to keep pdfkit rather than add a headless browser. HTML here is
 * the source of truth for the on-screen and .html forms; the two are kept visually
 * close by hand.
 */
const { makeT } = require('./labels');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function css(b) {
  const ink = b.primary_color || '#143453';
  const accent = b.accent_color || '#4d9fe0';
  return `
:root{--ink:${ink};--accent:${accent};--nav:#0a1626;--light:#f4f9fd;--border:#dce7f2;
  --muted:#5f7185;--text:#17273a;--ok:#2fa06d;--warn:#c98617;--bad:#c23b46;
  --grad:linear-gradient(90deg,${ink} 0%,${accent} 100%)}
*,*::before,*::after{box-sizing:border-box}
html{background:#e7edf3}
body{margin:0;font-family:'Lato','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  color:var(--text);font-size:10.5pt;line-height:1.5;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:'Lato','Inter',sans-serif;color:var(--ink);line-height:1.2;margin:0}
.sheet{width:210mm;min-height:296mm;margin:10mm auto;background:#fff;position:relative;padding:16mm 15mm 22mm;box-shadow:0 3px 18px rgba(15,32,54,.16)}
.classbar{margin:0 -15mm;background:var(--nav);color:#fff;text-align:center;font-size:8pt;font-weight:700;letter-spacing:2.6px;padding:5px 0;text-transform:uppercase}
.masthead{display:flex;justify-content:space-between;align-items:flex-end;padding:9mm 0 5mm;border-bottom:1px solid var(--border)}
.hairline{height:3px;background:var(--grad);margin:0 -15mm}
.logo-img{height:34px;width:auto;display:block}
.wordmark{font-weight:900;font-size:17pt;color:var(--ink);letter-spacing:.3px}
.prodtag{text-align:right;font-size:8pt;color:var(--muted);line-height:1.5}
.prodtag b{display:block;color:var(--ink);font-size:11pt}
.runhead{display:flex;justify-content:space-between;font-size:8pt;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:9mm}
.runhead b{color:var(--ink)}
.eyebrow{font-size:8.5pt;letter-spacing:3.4px;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:10px}
.cover-title{font-size:27pt;font-weight:900;letter-spacing:-.5px;margin-bottom:6px}
.cover-sub{font-size:12.5pt;color:var(--muted);margin-bottom:22px}
.cover-accent{height:4px;width:74px;background:var(--grad);border-radius:2px;margin-bottom:22px}
.docctl{width:100%;border-collapse:collapse;margin-top:6mm;font-size:9.5pt}
.docctl th{text-align:left;width:44mm;font-weight:700;color:var(--ink);padding:6px 10px 6px 0;vertical-align:top;border-bottom:1px solid var(--border);font-size:8.5pt;letter-spacing:.6px;text-transform:uppercase}
.docctl td{padding:6px 0;border-bottom:1px solid var(--border);vertical-align:top}
.stamp{margin-top:8mm;border:1px solid var(--border);border-left:4px solid var(--accent);background:var(--light);padding:11px 14px;font-size:9pt;border-radius:0 6px 6px 0}
.stamp.warn{border-left-color:var(--warn)}
.stamp b{color:var(--ink)}
section{margin-top:9mm;page-break-inside:avoid}
.sec-h{display:flex;align-items:baseline;gap:9px;border-bottom:2px solid var(--ink);padding-bottom:5px;margin-bottom:9px}
.sec-h .num{font-size:9pt;font-weight:900;color:var(--accent);letter-spacing:1px}
.sec-h h2{font-size:13.5pt;font-weight:700}
h3{font-size:10.5pt;margin:6mm 0 4px;color:var(--ink)}
p{margin:0 0 8px}.lede{color:var(--muted);font-size:9.5pt;margin-bottom:10px}
table.data{width:100%;border-collapse:collapse;font-size:9pt;margin-top:4px}
table.data thead th{background:var(--ink);color:#fff;text-align:left;padding:6px 8px;font-size:8pt;letter-spacing:.7px;text-transform:uppercase;font-weight:700}
table.data td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
table.data tbody tr:nth-child(even) td{background:#fafcfe}
table.data td.num,table.data th.num{text-align:right}
table.data tfoot td{font-weight:700;background:var(--light);border-top:2px solid var(--ink);color:var(--ink)}
.kv{width:100%;border-collapse:collapse;font-size:9.5pt}
.kv th{text-align:left;font-weight:700;color:var(--ink);width:44mm;padding:5px 10px 5px 0;border-bottom:1px solid var(--border);vertical-align:top}
.kv td{padding:5px 0;border-bottom:1px solid var(--border)}
.pill{display:inline-block;font-size:7.6pt;font-weight:700;letter-spacing:.5px;padding:1.5px 7px;border-radius:9px;border:1px solid;text-transform:uppercase;white-space:nowrap}
.p-ok{color:#1c6f4a;border-color:#8fd0b3;background:#eaf7f1}
.p-warn{color:#8a5a05;border-color:#e8c98a;background:#fdf5e6}
.p-bad{color:#8f242e;border-color:#e5a8ad;background:#fdeef0}
.p-info{color:#1f5580;border-color:#a9cbe6;background:#eef5fb}
.p-mute{color:#4a5b6d;border-color:#c8d4e0;background:#f2f5f8}
.meter{height:9px;background:#e9eff5;border-radius:5px;overflow:hidden;display:flex;border:1px solid var(--border)}
.meter i{display:block;height:100%}
.seg-ok{background:#3aa876}.seg-warn{background:#e0a53d}.seg-bad{background:#d1505b}.seg-na{background:#c3ced9}
.legend{display:flex;gap:14px;font-size:8pt;color:var(--muted);margin-top:7px;flex-wrap:wrap}
.legend span{display:flex;align-items:center;gap:5px}.legend i{width:9px;height:9px;border-radius:2px;display:block}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px}
.kpi{border:1px solid var(--border);border-top:3px solid var(--accent);border-radius:5px;padding:9px 11px;background:#fff}
.kpi .n{font-size:20pt;font-weight:900;color:var(--ink);line-height:1.05}
.kpi .l{font-size:7.8pt;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-top:2px;font-weight:700}
.kpi .d{font-size:8pt;color:var(--muted);margin-top:3px}
.kpi.bad{border-top-color:var(--bad)}.kpi.warn{border-top-color:var(--warn)}.kpi.ok{border-top-color:var(--ok)}
.flow{display:flex;gap:3px;margin-top:5px}
.chev{flex:1;background:var(--light);border:1px solid var(--border);padding:8px 12px 8px 20px;font-size:8.4pt;clip-path:polygon(0 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,0 100%,11px 50%)}
.chev:first-child{clip-path:polygon(0 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,0 100%)}
.chev.done{background:var(--ink);border-color:var(--ink);color:#fff}
.chev.now{background:var(--accent);border-color:var(--accent);color:#fff}
.chev .s{display:block;font-size:7.2pt;letter-spacing:1.1px;text-transform:uppercase;opacity:.8}
.chev .t{font-weight:700}
.finding{border:1px solid var(--border);border-left:4px solid var(--bad);border-radius:0 5px 5px 0;padding:9px 12px;margin-bottom:8px;background:#fff;page-break-inside:avoid}
.finding.warn{border-left-color:var(--warn)}
.finding h4{font-size:10pt;display:flex;justify-content:space-between;gap:10px}
.finding .lbl{font-size:7.8pt;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700;margin-top:6px}
.finding .body{font-size:9pt;margin-top:3px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:9mm 12mm;margin-top:6mm}
.sig{border-top:1px solid var(--ink);padding-top:5px}
.sig .role{font-size:8pt;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:700}
.sig .who{font-weight:700;color:var(--ink);margin-top:2px}.sig .when{font-size:8.5pt;color:var(--muted)}
.sigline{height:13mm;border-bottom:1px dashed #97a7b6;margin-bottom:4px}
.pfoot{position:absolute;left:15mm;right:15mm;bottom:11mm;display:flex;justify-content:space-between;font-size:7.6pt;color:var(--muted);border-top:1px solid var(--border);padding-top:5px}
.pfoot .cls{font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink)}
.ctlid{font-family:'SFMono-Regular',Consolas,monospace;font-weight:700;color:var(--ink);white-space:nowrap}
.mono{font-family:'SFMono-Regular',Consolas,monospace;font-size:8.6pt}
.note{font-size:8.4pt;color:var(--muted);font-style:italic;margin-top:6px}
@media print{html{background:#fff}.sheet{margin:0;box-shadow:none;page-break-after:always;width:auto;min-height:auto}.sheet:last-child{page-break-after:auto}@page{size:A4;margin:0}}
`;
}

function logoBlock(b, logoDataUri) {
  if (logoDataUri) return `<img class="logo-img" src="${logoDataUri}" alt="${esc(b.organization_name)}">`;
  return `<div class="wordmark">${esc(b.organization_name || 'Aegis SA')}</div>`;
}
const RES_PILL = { satisfied: 'p-ok', partial: 'p-warn', failed: 'p-bad' };

function resultPill(t, r) {
  if (r === 'satisfied') return `<span class="pill p-ok">${esc(t('rf.satisfied'))}</span>`;
  if (r === 'partial') return `<span class="pill p-warn">${esc(t('rf.partial'))}</span>`;
  if (r === 'failed') return `<span class="pill p-bad">${esc(t('rf.notSatisfied'))}</span>`;
  return `<span class="pill p-mute">${esc(t('rf.pending'))}</span>`;
}
function statePill(t, s, overdue) {
  const map = { open: ['p-mute', 'rf.open'], 'in-progress': ['p-info', 'rf.inProgress'],
    'evidence-submitted': ['p-warn', 'rf.evidenceSubmitted'], accepted: ['p-ok', 'rf.accepted'],
    rejected: ['p-bad', 'rf.rejected'], deferred: ['p-mute', 'rf.deferred'] };
  const [cls, key] = map[s] || ['p-mute', 'rf.open'];
  const od = overdue ? `<div style="font-size:7.2pt;color:var(--bad);font-weight:700;margin-top:2px">${esc(t('rf.overdue')).toUpperCase()}</div>` : '';
  return `<span class="pill ${overdue ? 'p-bad' : cls}">${esc(t(key))}</span>${od}`;
}
function riskPill(t, level) {
  const cls = level === 'high' ? 'p-bad' : level === 'medium' ? 'p-warn' : 'p-mute';
  return `<span class="pill ${cls}">${esc(t('rf.' + (level || 'medium')))}</span>`;
}

function masthead(b, logoDataUri, tag) {
  return `<div class="masthead">${logoBlock(b, logoDataUri)}
    <div class="prodtag"><b>${esc(b.product_name || 'Aegis SA')}</b>${esc(tag)}</div></div><div class="hairline"></div>`;
}
function foot(b, m, cls) {
  return `<div class="pfoot"><span class="cls">${cls ? esc(cls) : '&nbsp;'}</span>
    <span>${esc(b.footer_text || '')}</span><span>${esc(m.reportId)} · <span data-pg></span></span></div>`;
}

// ── page numbering: stamp __PG__/__OF__ tokens after assembly ──
function paginate(html, t) {
  const foots = (html.match(/<span data-pg><\/span>/g) || []).length;
  let n = 0;
  return html.replace(/<span data-pg><\/span>/g,
    () => `${esc(t('rf.page'))} ${++n} ${esc(t('rf.of'))} ${foots}`);
}

// ════════════════════ per-type bodies ════════════════════
function coverDocctl(t, m, rows, cls) {
  const trs = rows.map(([k, v]) => `<tr><th>${esc(t(k))}</th><td>${v}</td></tr>`).join('');
  return `<table class="docctl">
    <tr><th>${esc(t('rf.reportId'))}</th><td class="mono">${esc(m.reportId)}</td></tr>
    ${trs}
    <tr><th>${esc(t('rf.generated'))}</th><td>${esc(m.meta.generatedAt)} ${esc(t('rf.generatedBy'))} ${esc(m.meta.generatedBy)}</td></tr>
    <tr><th>${esc(t('rf.language'))}</th><td>${esc(m.meta.language)}</td></tr>
  </table>`;
}

function assessmentBody(m, b, t, logoDataUri, cls) {
  const a = m.assessment, s = m.stats, tot = s.totals;
  const classbar = cls ? `<div class="classbar">${esc(cls)}</div>` : '';
  const inherited = m.controls.filter(c => c.is_inherited).length;
  // cover
  let h = `<div class="sheet">${classbar}${masthead(b, logoDataUri, t('rf.report'))}
    <div style="padding-top:16mm">
      <div class="eyebrow">${esc(m.title)}</div>
      <h1 class="cover-title">${esc(m.subject)}</h1>
      <div class="cover-sub">${esc(m.subtitle)}</div><div class="cover-accent"></div>
      ${coverDocctl(t, m, [
        [`rf.result`, `${esc(a.status || '')} · <b>${esc(a.result || '')}</b> · ${esc(t('rf.score'))} <b>${a.score}%</b>`]
      ], cls)}
      <div class="stamp"><b>${esc(t('rf.pinnedNote'))}</b></div>
    </div>${foot(b, m, cls)}</div>`;

  // profile + summary
  const P = m.project;
  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span>${esc(cls || '')}</span></div>
    <section><div class="sec-h"><span class="num">1</span><h2>${esc(t('rf.systemProfile'))}</h2></div>
      ${P.description ? `<p class="lede">${esc(P.description)}</p>` : ''}
      <table class="kv">
        <tr><th>${esc(t('rf.securityFramework'))}</th><td>${esc(P.security_framework || 'ITSG-33')}</td></tr>
        <tr><th>${esc(t('rf.controlProfile'))}</th><td>${esc(P.security_profile || '')} ${P.framework_baseline ? '— ' + esc(P.framework_baseline) : ''}</td></tr>
        <tr><th>${esc(t('rf.classification'))}</th><td>${esc(P.data_classification || '')}</td></tr>
        <tr><th>${esc(t('rf.confidentiality'))}</th><td>${esc(P.confidentiality_level || '')}</td></tr>
        <tr><th>${esc(t('rf.integrity'))}</th><td>${esc(P.integrity_level || '')}</td></tr>
        <tr><th>${esc(t('rf.availability'))}</th><td>${esc(P.availability_level || '')}</td></tr>
        <tr><th>${esc(t('rf.highValueAsset'))}</th><td>${P.is_hva ? 'Yes' : 'No'}</td></tr>
        <tr><th>${esc(t('rf.personalInformation'))}</th><td>${P.has_pii ? 'Yes' : 'No'}</td></tr>
        <tr><th>${esc(t('rf.hosting'))}</th><td>${esc(P.hosting_type || '')}</td></tr>
        <tr><th>${esc(t('rf.systemType'))}</th><td>${esc(P.app_type || '')}</td></tr>
      </table>
      <h3>${esc(t('rf.accountability'))}</h3>
      <table class="data"><thead><tr><th>${esc(t('rf.role'))}</th><th>${esc(t('rf.name'))}</th><th>${esc(t('rf.contact'))}</th></tr></thead><tbody>
        <tr><td>${esc(t('rf.systemOwner'))}</td><td>${esc(P.project_owner_name || '—')}</td><td class="mono">${esc(P.project_owner_email || '')}</td></tr>
        <tr><td>${esc(t('rf.authorizingOfficial'))}</td><td>${esc(P.project_authority_name || '—')}</td><td class="mono">${esc(P.project_authority_email || '')}</td></tr>
        <tr><td>${esc(t('rf.cio'))}</td><td>${esc(P.cio_name || '—')}</td><td class="mono">${esc(P.cio_email || '')}</td></tr>
      </tbody></table>
    </section>${foot(b, m, cls)}</div>`;

  // summary sheet
  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span>${esc(cls || '')}</span></div>
    <section><div class="sec-h"><span class="num">2</span><h2>${esc(t('rf.assessmentSummary'))}</h2></div>
      <div class="meter">
        <i class="seg-ok" style="width:${tot.app ? tot.s / tot.app * 100 : 0}%"></i>
        <i class="seg-warn" style="width:${tot.app ? tot.p / tot.app * 100 : 0}%"></i>
        <i class="seg-bad" style="width:${tot.app ? tot.f / tot.app * 100 : 0}%"></i></div>
      <div class="legend">
        <span><i class="seg-ok"></i>${esc(t('rf.satisfied'))} ${tot.s}</span>
        <span><i class="seg-warn"></i>${esc(t('rf.partial'))} ${tot.p}</span>
        <span><i class="seg-bad"></i>${esc(t('rf.notSatisfied'))} ${tot.f}</span>
        <span><i class="seg-na"></i>${esc(t('rf.notApplicable'))} ${tot.na} (${esc(t('rf.excludedFromScore'))})</span></div>
      <div class="kpis" style="margin-top:8mm">
        <div class="kpi ok"><div class="n">${tot.s}</div><div class="l">${esc(t('rf.satisfied'))}</div></div>
        <div class="kpi warn"><div class="n">${tot.p}</div><div class="l">${esc(t('rf.partial'))}</div></div>
        <div class="kpi bad"><div class="n">${tot.f}</div><div class="l">${esc(t('rf.notSatisfied'))}</div></div>
        <div class="kpi"><div class="n">${inherited}</div><div class="l">${esc(t('rf.inherited'))}</div></div>
      </div>
    </section>${foot(b, m, cls)}</div>`;

  // posture by family
  const famRows = s.families.map(f => {
    const pct = f.app ? ((f.s + f.p * 0.5) / f.app * 100).toFixed(0) : '—';
    return `<tr><td><span class="ctlid">${esc(f.code)}</span></td><td>${esc(f.name)}</td>
      <td class="num">${f.app}</td><td class="num">${f.s}</td><td class="num">${f.p || '—'}</td>
      <td class="num">${f.f || '—'}</td><td class="num">${f.na || '—'}</td>
      <td style="width:30mm"><div class="meter"><i class="seg-ok" style="width:${f.app ? f.s / f.app * 100 : 0}%"></i>
        <i class="seg-warn" style="width:${f.app ? f.p / f.app * 100 : 0}%"></i>
        <i class="seg-bad" style="width:${f.app ? f.f / f.app * 100 : 0}%"></i></div></td>
      <td class="num"><b>${pct}%</b></td></tr>`;
  }).join('');
  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span>${esc(cls || '')}</span></div>
    <section><div class="sec-h"><span class="num">3</span><h2>${esc(t('rf.postureByFamily'))}</h2></div>
      <table class="data"><thead><tr><th style="width:16mm">${esc(t('rf.family'))}</th><th>${esc(t('rf.name'))}</th>
        <th class="num">${esc(t('rf.applicable'))}</th><th class="num">${esc(t('rf.satisfied'))}</th>
        <th class="num">${esc(t('rf.partial'))}</th><th class="num">${esc(t('rf.notSatisfied'))}</th>
        <th class="num">${esc(t('rf.notApplicable'))}</th><th>${esc(t('rf.distribution'))}</th><th class="num">${esc(t('rf.score'))}</th></tr></thead>
        <tbody>${famRows}</tbody>
        <tfoot><tr><td colspan="2">${esc(t('rf.overallScore'))}</td><td class="num">${tot.app}</td><td class="num">${tot.s}</td>
          <td class="num">${tot.p}</td><td class="num">${tot.f}</td><td class="num">${tot.na}</td><td></td><td class="num">${a.score}%</td></tr></tfoot>
      </table>
    </section>${foot(b, m, cls)}</div>`;

  // findings (chunk 4 per page)
  const fmt = c => `<div class="finding ${c.result === 'partial' ? 'warn' : ''}">
    <h4><span><span class="ctlid">${esc(c.control_id)}</span> — ${esc(c.title)}</span>${resultPill(t, c.result)}</h4>
    <div class="lbl">${esc(t('rf.finding'))}</div><div class="body">${esc(c.finding || '—')}</div>
    <div class="lbl">${esc(t('rf.evidence'))}</div><div class="body">${esc(c.evidence || '—')}</div></div>`;
  const chunks = [];
  for (let i = 0; i < m.findings.length; i += 4) chunks.push(m.findings.slice(i, i + 4));
  (chunks.length ? chunks : [[]]).forEach((chunk, idx) => {
    h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span>${esc(cls || '')}</span></div>
      <section><div class="sec-h"><span class="num">4</span><h2>${esc(t('rf.findings'))}${idx ? ' (…)' : ''}</h2></div>
        ${chunk.length ? chunk.map(fmt).join('') : `<p class="lede">—</p>`}
      </section>${foot(b, m, cls)}</div>`;
  });

  // signatures + version history
  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span>${esc(cls || '')}</span></div>
    <section><div class="sec-h"><span class="num">5</span><h2>${esc(t('rf.signatures'))}</h2></div>
      <div class="sigs">
        <div><div class="sigline"></div><div class="sig"><div class="role">${esc(t('rf.assessor'))}</div><div class="when">${esc(a.assessor_signed_at)}</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">${esc(t('rf.authorizingOfficial'))}</div><div class="when">${esc(a.authority_signed_at)}</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">${esc(t('rf.cio'))}</div><div class="when">${esc(a.cio_signed_at)}</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">${esc(t('rf.systemOwner'))}</div><div class="when">${esc(a.submitted_at)}</div></div></div>
      </div>
    </section>
    <section><div class="sec-h"><span class="num">A</span><h2>${esc(t('rf.versionHistory'))}</h2></div>
      <table class="data"><thead><tr><th class="num" style="width:16mm">${esc(t('rf.version'))}</th><th style="width:34mm">${esc(t('rf.title'))}</th>
        <th style="width:24mm">${esc(t('rf.date'))}</th><th style="width:30mm">${esc(t('rf.by'))}</th><th>${esc(t('rf.summary'))}</th></tr></thead><tbody>
        ${m.versions.map(v => `<tr><td class="num"><b>${v.version}</b></td><td>${esc(v.label || '')}</td>
          <td>${esc(String(v.created_at || '').slice(0, 10))}</td><td>${esc(v.created_by_name || '')}</td><td>${esc(v.summary || '')}</td></tr>`).join('')
          || `<tr><td colspan="5">—</td></tr>`}
      </tbody></table>
    </section>${foot(b, m, cls)}</div>`;
  return h;
}

function decisionBody(m, b, t, logoDataUri, cls) {
  const d = m.decision, s = m.stats;
  let h = `<div class="sheet">${masthead(b, logoDataUri, t('rf.decision'))}
    <div style="padding-top:12mm">
      <div class="eyebrow">${esc(m.title)}</div><h1 class="cover-title">${esc(m.subject)}</h1>
      <div class="cover-sub">${esc(m.subtitle)}</div><div class="cover-accent"></div>
      ${coverDocctl(t, m, [
        ['rf.decisionType', `<b>${esc((d.decision_type || 'ato').toUpperCase())}</b>`],
        ['rf.state', `<span class="pill ${m.immutable ? 'p-ok' : 'p-info'}">${esc(d.state || '')}</span>`],
        ['rf.pinnedAssessment', `#${d.assessment_id || '—'}, v${d.assessment_version || '—'}`],
        ['rf.authorizingOfficial', esc(d.authorizing_official || '—')],
        ['rf.assessor', esc(d.assessor || '—')],
        ['rf.issued', esc(d.issued_at)], ['rf.expires', `<b>${esc(d.expires_at)}</b>`]
      ], cls)}
      <div class="stamp"><b>${esc(t(m.immutable ? 'rf.pinnedNote' : 'rf.liveNote'))}</b></div>
    </div>${foot(b, m, cls)}</div>`;

  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
    <section><div class="sec-h"><span class="num">1</span><h2>${esc(t('rf.decision'))}</h2></div>
      ${d.executive_summary ? `<h3>${esc(t('rf.executiveSummary'))}</h3><p>${esc(d.executive_summary)}</p>` : ''}
      ${d.residual_risk_statement ? `<h3>${esc(t('rf.residualRisk'))}</h3><p>${esc(d.residual_risk_statement)}</p>` : ''}
      ${d.decision_rationale ? `<h3>${esc(t('rf.decisionRationale'))}</h3><p>${esc(d.decision_rationale)}</p>` : ''}
      ${d.conditions ? `<h3>${esc(t('rf.conditionsOfAuth'))}</h3><p>${esc(d.conditions)}</p>` : ''}
    </section>${foot(b, m, cls)}</div>`;

  // POA&M conditions (chunk 4/page)
  const items = m.poam || [];
  const poamRow = i => `<tr><td class="num">${i.id}</td><td><span class="ctlid">${esc(i.control_id || '')}</span></td>
    <td>${riskPill(t, i.risk_level)}</td><td>${esc(i.description || '')}
      ${i.remediation_plan ? `<div style="font-size:8.2pt;color:var(--muted);margin-top:3px"><b>${esc(t('rf.remediation'))}.</b> ${esc(i.remediation_plan)}</div>` : ''}</td>
    <td>${esc(i.assigned_to || '—')}</td><td class="num">${esc(i.deadline || '—')}</td><td>${statePill(t, i.state, i.overdue)}</td></tr>`;
  const chunks = [];
  for (let i = 0; i < items.length; i += 4) chunks.push(items.slice(i, i + 4));
  (chunks.length ? chunks : [[]]).forEach((chunk, idx) => {
    h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
      <section><div class="sec-h"><span class="num">2</span><h2>${esc(t('rf.poamRegister'))}${idx ? ' (…)' : ''}</h2></div>
      ${idx === 0 && m.promotion ? `<div class="stamp ${m.promotion.blocked ? 'warn' : ''}"><b>${esc(t(m.promotion.blocked ? 'rf.promotionBlocked' : 'rf.promotionClear'))}.</b></div>` : ''}
        <table class="data"><thead><tr><th class="num" style="width:8mm">#</th><th style="width:19mm">${esc(t('rf.control'))}</th>
          <th style="width:17mm">${esc(t('rf.risk'))}</th><th>${esc(t('rf.finding'))}</th><th style="width:28mm">${esc(t('rf.owner'))}</th>
          <th class="num" style="width:22mm">${esc(t('rf.due'))}</th><th style="width:26mm">${esc(t('rf.state'))}</th></tr></thead>
          <tbody>${chunk.length ? chunk.map(poamRow).join('') : `<tr><td colspan="7">—</td></tr>`}</tbody></table>
      </section>${foot(b, m, cls)}</div>`;
  });

  // version history
  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
    <section><div class="sec-h"><span class="num">B</span><h2>${esc(t('rf.versionHistory'))}</h2></div>
      <table class="data"><thead><tr><th class="num" style="width:16mm">${esc(t('rf.version'))}</th><th style="width:26mm">${esc(t('rf.date'))}</th>
        <th style="width:32mm">${esc(t('rf.by'))}</th><th>${esc(t('rf.change'))}</th></tr></thead><tbody>
        ${(m.versions || []).map(v => `<tr><td class="num"><b>${v.version}</b></td><td>${esc(String(v.created_at || '').slice(0, 10))}</td>
          <td>${esc(v.created_by_name || '')}</td><td>${esc(v.summary || v.label || '')}</td></tr>`).join('') || `<tr><td colspan="4">—</td></tr>`}
      </tbody></table>
    </section>${foot(b, m, cls)}</div>`;
  return h;
}

function poamBody(m, b, t, logoDataUri, cls) {
  const items = m.poam || [];
  const S = m.summary || {};
  const row = i => `<tr><td class="num">${i.id}</td><td><span class="ctlid">${esc(i.control_id || '')}</span></td>
    <td>${riskPill(t, i.risk_level)}</td><td>${esc(i.description || '')}</td><td>${esc(i.remediation_plan || '')}</td>
    <td>${esc(i.milestone || '')}</td><td>${esc(i.assigned_to || '—')}</td>
    <td class="num">${esc(i.deadline_original || '—')}</td><td class="num">${esc(i.deadline || '—')}</td>
    <td class="num">${i.deadline_changes || '—'}</td><td>${statePill(t, i.state, i.overdue)}</td></tr>`;
  const head = `<thead><tr><th class="num" style="width:8mm">#</th><th style="width:20mm">${esc(t('rf.control'))}</th>
    <th style="width:16mm">${esc(t('rf.risk'))}</th><th>${esc(t('rf.finding'))}</th><th>${esc(t('rf.remediation'))}</th>
    <th>${esc(t('rf.milestone'))}</th><th style="width:30mm">${esc(t('rf.owner'))}</th>
    <th class="num" style="width:20mm">${esc(t('rf.originalDue'))}</th><th class="num" style="width:20mm">${esc(t('rf.currentDue'))}</th>
    <th class="num" style="width:12mm">${esc(t('rf.moves'))}</th><th style="width:26mm">${esc(t('rf.state'))}</th></tr></thead>`;
  const land = `<style>.sheet{width:297mm;min-height:209mm;padding:10mm 14mm 16mm}.classbar,.hairline{margin-left:-14mm;margin-right:-14mm}.pfoot{left:14mm;right:14mm;bottom:8mm}@media print{@page{size:A4 landscape;margin:0}}</style>`;
  let h = `<div class="sheet">${masthead(b, logoDataUri, t('rf.poamRegister'))}
    <div style="margin-top:6mm"><div class="eyebrow">${esc(m.title)}</div>
      <h1 style="font-size:18pt;font-weight:900">${esc(m.subject)}</h1>
      <div style="color:var(--muted);font-size:10pt">${esc(m.subtitle)}</div></div>
    <div class="kpis" style="grid-template-columns:repeat(6,1fr);margin-top:5mm">
      <div class="kpi"><div class="n">${items.length}</div><div class="l">${esc(t('rf.totalItems'))}</div></div>
      <div class="kpi"><div class="n">${S.open || 0}</div><div class="l">${esc(t('rf.open'))}</div></div>
      <div class="kpi warn"><div class="n">${(S['in-progress'] || 0) + (S['evidence-submitted'] || 0)}</div><div class="l">${esc(t('rf.inFlight'))}</div></div>
      <div class="kpi ok"><div class="n">${S.accepted || 0}</div><div class="l">${esc(t('rf.accepted'))}</div></div>
      <div class="kpi"><div class="n">${S.deferred || 0}</div><div class="l">${esc(t('rf.deferred'))}</div></div>
      <div class="kpi bad"><div class="n">${items.filter(i => i.overdue).length}</div><div class="l">${esc(t('rf.overdue'))}</div></div>
    </div>
    <table class="data" style="margin-top:5mm;font-size:8.2pt">${head}<tbody>${items.map(row).join('') || `<tr><td colspan="11">—</td></tr>`}</tbody></table>
    ${m.promotion ? `<div class="stamp ${m.promotion.blocked ? 'warn' : ''}"><b>${esc(t(m.promotion.blocked ? 'rf.promotionBlocked' : 'rf.promotionClear'))}.</b></div>` : ''}
    ${foot(b, m, cls)}</div>`;
  return { html: h, extraHead: land };
}

function projectBody(m, b, t, logoDataUri, cls) {
  let h = `<div class="sheet">${masthead(b, logoDataUri, t('rf.report'))}
    <div style="padding-top:12mm"><div class="eyebrow">${esc(m.title)}</div>
      <h1 class="cover-title">${esc(m.subject)}</h1><div class="cover-sub">${esc(m.subtitle)}</div><div class="cover-accent"></div>
      ${coverDocctl(t, m, [], cls)}
      <div class="stamp"><b>${esc(t('rf.liveNote'))}</b></div>
    </div>${foot(b, m, cls)}</div>`;

  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
    <section><div class="sec-h"><span class="num">1</span><h2>${esc(t('rf.assessments'))}</h2></div>
      <table class="data"><thead><tr><th class="num" style="width:12mm">#</th><th style="width:22mm">${esc(t('rf.type'))}</th>
        <th style="width:30mm">${esc(t('rf.status'))}</th><th class="num" style="width:16mm">${esc(t('rf.version'))}</th>
        <th class="num" style="width:16mm">${esc(t('rf.score'))}</th><th style="width:26mm">${esc(t('rf.result'))}</th>
        <th>${esc(t('rf.lastActivity'))}</th></tr></thead><tbody>
        ${m.assessments.map(a => `<tr><td class="num">${a.id}</td><td>${esc(a.type || '')}</td>
          <td><span class="pill p-info">${esc(a.status || '')}</span></td><td class="num">${a.version}</td>
          <td class="num">${a.score != null ? a.score + '%' : '—'}</td><td>${esc(a.result || '')}</td><td>${esc(a.updated_at)}</td></tr>`).join('')
          || `<tr><td colspan="7">—</td></tr>`}
      </tbody></table>
    </section>
    <section><div class="sec-h"><span class="num">2</span><h2>${esc(t('rf.decisionPackages'))}</h2></div>
      <table class="data"><thead><tr><th style="width:34mm">${esc(t('rf.packageReference'))}</th><th style="width:20mm">${esc(t('rf.type'))}</th>
        <th style="width:24mm">${esc(t('rf.state'))}</th><th class="num" style="width:24mm">${esc(t('rf.version'))}</th>
        <th style="width:26mm">${esc(t('rf.issued'))}</th><th style="width:26mm">${esc(t('rf.expires'))}</th></tr></thead><tbody>
        ${m.decisions.map(d => `<tr><td class="mono">${esc(d.reference || '')}</td><td>${esc(d.decision_type || '')}</td>
          <td><span class="pill p-info">${esc(d.state || '')}</span></td><td class="num">v${d.assessment_version || '—'}</td>
          <td>${esc(d.issued_at)}</td><td>${esc(d.expires_at)}</td></tr>`).join('') || `<tr><td colspan="6">—</td></tr>`}
      </tbody></table>
    </section>${foot(b, m, cls)}</div>`;

  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
    <section><div class="sec-h"><span class="num">3</span><h2>${esc(t('rf.outstandingConditions'))}</h2></div>
      <table class="data"><thead><tr><th class="num" style="width:9mm">#</th><th style="width:20mm">${esc(t('rf.control'))}</th>
        <th style="width:16mm">${esc(t('rf.risk'))}</th><th>${esc(t('rf.finding'))}</th><th style="width:34mm">${esc(t('rf.owner'))}</th>
        <th class="num" style="width:24mm">${esc(t('rf.due'))}</th><th style="width:28mm">${esc(t('rf.state'))}</th></tr></thead><tbody>
        ${m.conditions.filter(i => i.state !== 'accepted').map(i => `<tr><td class="num">${i.id}</td>
          <td><span class="ctlid">${esc(i.control_id || '')}</span></td><td>${riskPill(t, i.risk_level)}</td>
          <td>${esc(i.description || '')}</td><td>${esc(i.assigned_to || '—')}</td><td class="num">${esc(i.deadline || '—')}</td>
          <td>${statePill(t, i.state, i.overdue)}</td></tr>`).join('') || `<tr><td colspan="7">—</td></tr>`}
      </tbody></table>
    </section>
    <section><div class="sec-h"><span class="num">4</span><h2>${esc(t('rf.documents'))}</h2></div>
      <table class="data"><thead><tr><th>${esc(t('rf.document'))}</th><th style="width:30mm">${esc(t('rf.type'))}</th>
        <th style="width:24mm">${esc(t('rf.uploaded'))}</th></tr></thead><tbody>
        ${m.documents.slice(0, 12).map(dc => `<tr><td>${esc(dc.original_name || dc.filename || '')}</td>
          <td>${esc(dc.document_type || dc.category || '')}</td><td>${esc(String(dc.created_at || '').slice(0, 10))}</td></tr>`).join('')
          || `<tr><td colspan="3">—</td></tr>`}
      </tbody></table>
      <div class="note">${esc(t('rf.noAttachmentsNote'))}</div>
    </section>${foot(b, m, cls)}</div>`;
  return h;
}

function portfolioBody(m, b, t, logoDataUri, cls) {
  const S = m.summary;
  const st = r => r.state === 'issued' ? 'p-ok' : r.state === 'in assessment' ? 'p-info' : 'p-mute';
  let h = `<div class="sheet">${masthead(b, logoDataUri, t('rf.report'))}
    <div style="padding-top:10mm"><div class="eyebrow">${esc(m.title)}</div>
      <h1 class="cover-title">${esc(m.subject)}</h1><div class="cover-sub">${esc(m.subtitle)}</div><div class="cover-accent"></div>
      <div class="kpis">
        <div class="kpi"><div class="n">${S.total}</div><div class="l">${esc(t('rf.systems'))}</div></div>
        <div class="kpi ok"><div class="n">${S.authorized}</div><div class="l">${esc(t('rf.authorized'))}</div></div>
        <div class="kpi warn"><div class="n">${S.openConditions}</div><div class="l">${esc(t('rf.outstandingConditions'))}</div></div>
        <div class="kpi bad"><div class="n">${S.overdue}</div><div class="l">${esc(t('rf.overdue'))}</div></div>
      </div>
      ${coverDocctl(t, m, [['rf.meanScore', `${S.meanScore}%`]], cls)}
    </div>${foot(b, m, cls)}</div>`;

  h += `<div class="sheet"><div class="runhead"><span><b>${esc(m.title)}</b> — ${esc(m.subject)}</span><span></span></div>
    <section><div class="sec-h"><span class="num">1</span><h2>${esc(t('rf.systems'))}</h2></div>
      <table class="data" style="font-size:8.6pt"><thead><tr><th>${esc(t('rf.system'))}</th><th style="width:24mm">${esc(t('rf.classification'))}</th>
        <th style="width:22mm">${esc(t('rf.controlProfile'))}</th><th class="num" style="width:16mm">${esc(t('rf.score'))}</th>
        <th style="width:18mm">${esc(t('rf.decisionCol'))}</th><th class="num" style="width:22mm">${esc(t('rf.expires'))}</th>
        <th class="num" style="width:16mm">${esc(t('rf.poamCol'))}</th><th class="num" style="width:18mm">${esc(t('rf.overdue'))}</th>
        <th style="width:26mm">${esc(t('rf.state'))}</th></tr></thead><tbody>
        ${m.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.classification || '')}</td><td>${esc(r.profile || '')}</td>
          <td class="num">${r.score != null ? r.score + '%' : '—'}</td><td>${esc(r.decision_type || '—')}</td>
          <td class="num">${esc(r.expires_at)}</td><td class="num">${r.open_conditions || '—'}</td>
          <td class="num">${r.overdue ? `<b style="color:var(--bad)">${r.overdue}</b>` : '—'}</td>
          <td><span class="pill ${st(r)}">${esc(r.state)}</span></td></tr>`).join('') || `<tr><td colspan="9">—</td></tr>`}
        </tbody>
        <tfoot><tr><td>${S.total} ${esc(t('rf.systems')).toLowerCase()}</td><td colspan="2"></td>
          <td class="num">${S.meanScore}%</td><td colspan="2"></td><td class="num">${S.openConditions}</td>
          <td class="num">${S.overdue}</td><td></td></tr></tfoot>
      </table>
    </section>${foot(b, m, cls)}</div>`;
  return h;
}

const BODIES = {
  assessment: assessmentBody, 'decision-package': decisionBody,
  poam: poamBody, project: projectBody, portfolio: portfolioBody
};

/**
 * @param {object} model  from config/report-model.js
 * @param {object} opts   { branding, req, t, logoDataUri, embed }
 *   embed:true returns just the <style>+body (for the on-screen viewer);
 *   otherwise a full standalone <!doctype html> document (for the .html download).
 */
function render(model, opts = {}) {
  const b = opts.branding || require('../../config/report-branding').PLATFORM_DEFAULT;
  const t = opts.t || makeT(opts.req);
  const cls = b.classification_label || '';
  const bodyFn = BODIES[model.type];
  if (!bodyFn) throw new Error('unknown report type: ' + model.type);
  const built = bodyFn(model, b, t, opts.logoDataUri, cls);
  const bodyHtml = paginate(typeof built === 'string' ? built : built.html, t);
  const extraHead = (typeof built === 'object' && built.extraHead) || '';
  const style = `<style>${css(b)}</style>${extraHead}`;
  if (opts.embed) return style + bodyHtml;
  return `<!doctype html><html lang="${esc(model.meta.language || 'en')}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.title)} — ${esc(model.subject)}</title>
${style}</head><body>${bodyHtml}</body></html>`;
}

module.exports = { render, css, esc };
