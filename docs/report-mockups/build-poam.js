const fs = require('fs');
const { THEMES, doc, page } = require('./_shell.js');
const D = require('./_data.js');
const t = THEMES.vanguard;
const P = D.project, K = D.decision;
const id = 'POAM-2026-0118';
const base = { title:'POA&M register', subject:P.name, cls:'', id };

const LAND = `<style>
  .sheet{width:297mm;min-height:210mm;padding:9mm 14mm 16mm}
  .kpis{margin-top:4mm!important}
  .kpi .n{font-size:17pt}
  .classbar,.masthead .rule,.hairline{margin-left:-14mm;margin-right:-14mm}
  .pfoot{left:14mm;right:14mm;bottom:8mm}
  @media print{ @page{size:A4 landscape;margin:0} }
</style>`;

const S = {
  'open':['p-mute','Open'], 'in-progress':['p-info','In progress'],
  'evidence-submitted':['p-warn','Evidence submitted'], 'accepted':['p-ok','Accepted'],
  'rejected':['p-bad','Rejected'], 'deferred':['p-mute','Deferred']
};
const cnt = D.poam.reduce((a,i)=>{a[i.state]=(a[i.state]||0)+1;return a;},{});
const overdue = D.poam.filter(i=>i.overdue);

const row = i => `
  <tr>
    <td class="num">${i.id}</td>
    <td><span class="ctlid">${i.control_id}</span></td>
    <td><span class="pill ${i.risk_level==='high'?'p-bad':i.risk_level==='medium'?'p-warn':'p-mute'}">${i.risk_level}</span></td>
    <td style="width:62mm">${i.description}</td>
    <td style="width:66mm">${i.remediation_plan}</td>
    <td style="width:44mm">${i.milestone}</td>
    <td>${i.assigned_to}</td>
    <td class="num">${i.deadline_original}</td>
    <td class="num">${i.deadline!==i.deadline_original?`<b style="color:var(--bad)">${i.deadline}</b>`:i.deadline}</td>
    <td class="num">${i.deadline_changes||'—'}</td>
    <td><span class="pill ${S[i.state][0]}">${S[i.state][1]}</span>
      ${i.overdue?'<div style="font-size:7.2pt;color:var(--bad);font-weight:700;margin-top:2px">OVERDUE 9d</div>':''}</td>
  </tr>`;
const tableHead = `<thead><tr>
      <th class="num" style="width:8mm">#</th><th style="width:20mm">Control</th><th style="width:16mm">Risk</th>
      <th>Finding</th><th>Remediation plan</th><th>Completion milestone</th>
      <th style="width:32mm">Owner</th><th class="num" style="width:22mm">Original due</th>
      <th class="num" style="width:22mm">Current due</th><th class="num" style="width:14mm">Moves</th>
      <th style="width:30mm">State</th></tr></thead>`;

const p1 = `<div class="sheet">
  <div class="masthead">${t.logo}
    <div class="prodtag"><b>${t.product}</b>Plan of action &amp; milestones register</div></div>
  <div class="hairline"></div>
  <div style="margin-top:7mm">
    <div class="eyebrow">POA&amp;M register</div>
    <h1 style="font-size:19pt;font-weight:900">${P.name}</h1>
    <div style="color:var(--muted);font-size:10pt">Decision package <span class="mono">${K.reference}</span>
      · ${K.decision_type} issued ${K.issued_at} · expires ${K.expires_at}
      · generated 2026-08-24 14:11 UTC</div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(6,1fr);margin-top:6mm">
    <div class="kpi"><div class="n">${D.poam.length}</div><div class="l">Total items</div><div class="d">All conditions</div></div>
    <div class="kpi"><div class="n">${cnt.open||0}</div><div class="l">Open</div><div class="d">Not started</div></div>
    <div class="kpi warn"><div class="n">${(cnt['in-progress']||0)+(cnt['evidence-submitted']||0)}</div><div class="l">In flight</div><div class="d">1 awaiting review</div></div>
    <div class="kpi ok"><div class="n">${cnt.accepted||0}</div><div class="l">Accepted</div><div class="d">Closed</div></div>
    <div class="kpi"><div class="n">${cnt.deferred||0}</div><div class="l">Deferred</div><div class="d">To successor</div></div>
    <div class="kpi bad"><div class="n">${overdue.length}</div><div class="l">Overdue</div><div class="d">Blocks promotion</div></div>
  </div>
  <table class="data" style="margin-top:4mm;font-size:8.2pt">${tableHead}
    <tbody>${D.poam.slice(0,3).map(row).join('')}</tbody></table>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>

<div class="sheet">
  <div class="runhead"><span><b>POA&amp;M register</b> — ${P.name}</span><span></span></div>
  <table class="data" style="font-size:8.2pt">${tableHead}
    <tbody>${D.poam.slice(3).map(row).join('')}</tbody></table>
  <div class="stamp warnbox" style="margin-top:6mm"><b>Promotion check — full ATO is blocked.</b>
    Item 3 (CP-9) is overdue by 9 days and has no re-baselined date; item 6 (RA-5(2)) is deferred and must be
    carried into a successor package before this one can close. ${t.product} refuses promotion until the
    assessor either accepts every outstanding item or approves a new deadline with a written justification.</div>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>`;

const p2 = `<div class="sheet">
  <div class="runhead"><span><b>POA&amp;M register</b> — ${P.name}</span><span></span></div>
  <section><div class="sec-h"><span class="num">2</span><h2>Deadline change history</h2></div>
    <p class="lede">Every movement of a committed date, with who approved it and why. Original commitments are
      never overwritten.</p>
    <table class="data"><thead><tr><th class="num" style="width:10mm">Item</th><th style="width:22mm">Control</th>
      <th style="width:26mm">Changed on</th><th style="width:24mm">From</th><th style="width:24mm">To</th>
      <th style="width:34mm">Approved by</th><th>Justification</th></tr></thead><tbody>
      <tr><td class="num">1</td><td><span class="ctlid">AC-2(3)</span></td><td>2026-08-14</td><td>2026-10-31</td><td>2026-12-15</td><td>M. Lindqvist</td><td>Identity platform migration moved the automation dependency into the Q4 release train.</td></tr>
      <tr><td class="num">4</td><td><span class="ctlid">AU-6(1)</span></td><td>2026-08-02</td><td>2026-11-30</td><td>2026-12-31</td><td>M. Lindqvist</td><td>Detection engineering capacity reallocated to incident IR-2026-114 for six weeks.</td></tr>
      <tr><td class="num">4</td><td><span class="ctlid">AU-6(1)</span></td><td>2026-08-19</td><td>2026-12-31</td><td>2027-01-31</td><td>M. Lindqvist</td><td>Purple-team validation window moved to align with the January change freeze exit.</td></tr>
      <tr><td class="num">6</td><td><span class="ctlid">RA-5(2)</span></td><td>2026-08-20</td><td>2026-10-15</td><td>2027-03-31</td><td>M. Lindqvist</td><td>Deferred to the successor package — non-production scanning is out of scope for this authorization period.</td></tr>
    </tbody></table>
  </section>
  <section><div class="sec-h"><span class="num">3</span><h2>Review activity</h2></div>
    <table class="data"><thead><tr><th style="width:26mm">Date</th><th class="num" style="width:12mm">Item</th>
      <th style="width:34mm">Actor</th><th style="width:34mm">Action</th><th>Notes</th></tr></thead><tbody>
      <tr><td>2026-08-21</td><td class="num">2</td><td>Platform Engineering</td><td><span class="pill p-warn">Evidence submitted</span></td><td>Weekly rebuild pipeline run history and a 30-day image-age report attached.</td></tr>
      <tr><td>2026-08-18</td><td class="num">5</td><td>K. Rahman</td><td><span class="pill p-ok">Accepted</span></td><td>Approved procedure MP-STD-002 rev 4 reviewed; cryptographic erasure described adequately.</td></tr>
      <tr><td>2026-08-11</td><td class="num">5</td><td>Information Management</td><td><span class="pill p-warn">Evidence submitted</span></td><td>Draft procedure attached for review.</td></tr>
      <tr><td>2026-08-06</td><td class="num">1</td><td>Identity Platform Team</td><td><span class="pill p-info">In progress</span></td><td>Automation design approved; build scheduled into sprint 2026-19.</td></tr>
      <tr><td>2026-07-30</td><td class="num">3</td><td>K. Rahman</td><td><span class="pill p-bad">Rejected</span></td><td>Backup monitoring screenshots do not evidence a restoration test. A timed restore with recorded RTO/RPO is required.</td></tr>
    </tbody></table>
  </section>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>`;

fs.writeFileSync(__dirname + '/03-poam-register.html',
  doc(t, `POA&M register — ${P.name}`, p1+p2).replace('</head>', LAND + '</head>'));
console.log('poam register written');
