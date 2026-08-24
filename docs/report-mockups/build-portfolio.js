const fs = require('fs');
const { THEMES, doc, page } = require('./_shell.js');
const t = THEMES.vanguard;
const id = 'PORT-2026-08';
const base = { title:'Portfolio summary', subject:'Northstar Digital Services', cls:'', id };

const projects = [
  ['Member Services Portal','Protected B','PBMM',82.4,'iATO','2027-08-04',6,1,'conditional'],
  ['Claims Adjudication Engine','Protected B','PBMM',91.7,'ATO','2027-02-14',0,0,'authorized'],
  ['Provider Directory API','Unclassified','PBMM (low)',88.2,'ATO','2026-11-30',2,0,'authorized'],
  ['Workforce Scheduling','Protected A','PBMM',76.9,'iATO','2027-01-19',9,3,'conditional'],
  ['Analytics Data Platform','Protected B','PBMM',68.3,'—','—',0,0,'in assessment'],
  ['Legacy Records Archive','Protected B','PBMM',54.1,'ATO','2026-09-12',4,2,'expiring'],
  ['Partner Integration Gateway','Unclassified','PBMM (low)',79.5,'—','—',0,0,'in assessment'],
  ['Notification Service','Unclassified','PBMM (low)',94.1,'ATO','2028-03-01',0,0,'authorized']
];
const st = p => p[8]==='authorized' ? 'p-ok' : p[8]==='expiring' ? 'p-bad'
  : p[8]==='conditional' ? 'p-warn' : 'p-info';

const rows = projects.map(p => `<tr>
  <td><b>${p[0]}</b></td><td>${p[1]}</td><td>${p[2]}</td>
  <td class="num">${p[3]}%</td>
  <td style="width:26mm"><div class="meter"><i class="${p[3]>=85?'seg-ok':p[3]>=70?'seg-warn':'seg-bad'}" style="width:${p[3]}%"></i></div></td>
  <td>${p[4]}</td><td class="num">${p[5]}</td>
  <td class="num">${p[6]||'—'}</td><td class="num">${p[7]?`<b style="color:var(--bad)">${p[7]}</b>`:'—'}</td>
  <td><span class="pill ${st(p)}">${p[8]}</span></td></tr>`).join('');

const p1 = `<div class="sheet cover">
  <div class="masthead">${t.logo}
    <div class="prodtag"><b>${t.product}</b>Organization portfolio summary</div></div>
  <div class="hairline"></div>
  <div class="cover-body" style="padding-top:14mm">
    <div class="eyebrow">Portfolio summary — August 2026</div>
    <h1 class="cover-title">Northstar Digital Services</h1>
    <div class="cover-sub">8 systems · 5 authorized · 2 in assessment · 1 expiring within 30 days</div>
    <div class="cover-accent"></div>
    <div class="kpis">
      <div class="kpi"><div class="n">8</div><div class="l">Systems</div><div class="d">Across 3 business lines</div></div>
      <div class="kpi ok"><div class="n">5</div><div class="l">Authorized</div><div class="d">3 full ATO · 2 iATO</div></div>
      <div class="kpi warn"><div class="n">21</div><div class="l">Open conditions</div><div class="d">POA&amp;M items across portfolio</div></div>
      <div class="kpi bad"><div class="n">6</div><div class="l">Overdue</div><div class="d">Across 3 systems</div></div>
    </div>
    <div class="kpis" style="margin-top:8px">
      <div class="kpi"><div class="n">79.4%</div><div class="l">Mean score</div><div class="d">+4.1 vs. July</div></div>
      <div class="kpi bad"><div class="n">1</div><div class="l">Expiring ≤30d</div><div class="d">Legacy Records Archive</div></div>
      <div class="kpi warn"><div class="n">2</div><div class="l">Expiring ≤90d</div><div class="d">Renewal work not started</div></div>
      <div class="kpi"><div class="n">6</div><div class="l">HVA systems</div><div class="d">High-value assets</div></div>
    </div>
    <table class="docctl" style="margin-top:9mm">
      <tr><th>Report ID</th><td class="mono">${id}</td></tr>
      <tr><th>Reporting period</th><td>2026-08-01 to 2026-08-24 (month to date)</td></tr>
      <tr><th>Generated</th><td>2026-08-24 14:18 UTC by M. Lindqvist (organization admin)</td></tr>
      <tr><th>Scope</th><td>Every project in the tenant. Tenant-scoped — no data from any other organization
        can appear in this report.</td></tr>
    </table>
  </div>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>`;

const p2 = page(t, base, `
  <section><div class="sec-h"><span class="num">1</span><h2>Systems</h2></div>
    <table class="data" style="font-size:8.6pt">
      <thead><tr><th>System</th><th style="width:24mm">Classification</th><th style="width:24mm">Profile</th>
        <th class="num" style="width:16mm">Score</th><th style="width:28mm">Posture</th>
        <th style="width:16mm">Decision</th><th class="num" style="width:22mm">Expires</th>
        <th class="num" style="width:16mm">POA&amp;M</th><th class="num" style="width:18mm">Overdue</th>
        <th style="width:26mm">State</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>8 systems</td><td colspan="2"></td><td class="num">79.4%</td><td></td>
        <td colspan="2"></td><td class="num">21</td><td class="num">6</td><td></td></tr></tfoot>
    </table>
  </section>
  <section><div class="sec-h"><span class="num">2</span><h2>Authorization expiry watchlist</h2></div>
    <p class="lede">Systems whose authorization lapses within 180 days. A lapsed authorization means the system
      is operating without a decision on record.</p>
    <table class="data"><thead><tr><th>System</th><th style="width:20mm">Decision</th>
      <th class="num" style="width:24mm">Expires</th><th class="num" style="width:20mm">Days</th>
      <th style="width:34mm">Renewal status</th><th>Action required</th></tr></thead><tbody>
      <tr><td><b>Legacy Records Archive</b></td><td>ATO</td><td class="num">2026-09-12</td>
        <td class="num"><b style="color:var(--bad)">19</b></td><td><span class="pill p-bad">Not started</span></td>
        <td>Reassessment must begin this week to avoid a lapse. 2 POA&amp;M items already overdue.</td></tr>
      <tr><td>Provider Directory API</td><td>ATO</td><td class="num">2026-11-30</td>
        <td class="num">98</td><td><span class="pill p-warn">Not started</span></td>
        <td>Schedule reassessment kickoff before 2026-09-30.</td></tr>
      <tr><td>Workforce Scheduling</td><td>iATO</td><td class="num">2027-01-19</td>
        <td class="num">148</td><td><span class="pill p-info">Conditions in flight</span></td>
        <td>9 conditions open, 3 overdue — full ATO is blocked until these clear.</td></tr>
    </tbody></table>
  </section>`);

const p3 = page(t, base, `
  <section><div class="sec-h"><span class="num">3</span><h2>Condition ageing</h2></div>
    <table class="data"><thead><tr><th>Age bracket</th><th class="num" style="width:20mm">High</th>
      <th class="num" style="width:20mm">Medium</th><th class="num" style="width:20mm">Low</th>
      <th class="num" style="width:20mm">Total</th><th style="width:40mm">Share</th></tr></thead><tbody>
      <tr><td>Not yet due</td><td class="num">3</td><td class="num">6</td><td class="num">3</td><td class="num"><b>12</b></td>
        <td><div class="meter"><i class="seg-ok" style="width:57%"></i></div></td></tr>
      <tr><td>Due within 30 days</td><td class="num">1</td><td class="num">2</td><td class="num">0</td><td class="num"><b>3</b></td>
        <td><div class="meter"><i class="seg-warn" style="width:14%"></i></div></td></tr>
      <tr><td>Overdue 1–30 days</td><td class="num">2</td><td class="num">1</td><td class="num">0</td><td class="num"><b>3</b></td>
        <td><div class="meter"><i class="seg-bad" style="width:14%"></i></div></td></tr>
      <tr><td>Overdue 31–90 days</td><td class="num">1</td><td class="num">1</td><td class="num">0</td><td class="num"><b>2</b></td>
        <td><div class="meter"><i class="seg-bad" style="width:10%"></i></div></td></tr>
      <tr><td>Overdue 90+ days</td><td class="num">1</td><td class="num">0</td><td class="num">0</td><td class="num"><b>1</b></td>
        <td><div class="meter"><i class="seg-bad" style="width:5%"></i></div></td></tr>
    </tbody><tfoot><tr><td>All conditions</td><td class="num">8</td><td class="num">10</td><td class="num">3</td>
      <td class="num">21</td><td></td></tr></tfoot></table>
    <div class="stamp warnbox"><b>Six conditions are overdue, one by more than 90 days.</b>
      Overdue high-risk conditions on Workforce Scheduling and Legacy Records Archive are the portfolio's
      largest exposure. Both systems are blocked from full authorization until they clear.</div>
  </section>
  <section><div class="sec-h"><span class="num">4</span><h2>Weakest control families across the portfolio</h2></div>
    <p class="lede">Families ranked by the number of systems with an unsatisfied control — where a single fix
      would improve several systems at once.</p>
    <table class="data"><thead><tr><th style="width:16mm">Family</th><th>Name</th>
      <th class="num" style="width:26mm">Systems affected</th><th class="num" style="width:26mm">Findings</th>
      <th style="width:36mm">Concentration</th></tr></thead><tbody>
      <tr><td><span class="ctlid">SI</span></td><td>System and information integrity</td><td class="num">5</td><td class="num">11</td>
        <td><div class="meter"><i class="seg-bad" style="width:100%"></i></div></td></tr>
      <tr><td><span class="ctlid">CP</span></td><td>Contingency planning</td><td class="num">4</td><td class="num">8</td>
        <td><div class="meter"><i class="seg-bad" style="width:73%"></i></div></td></tr>
      <tr><td><span class="ctlid">AC</span></td><td>Access control</td><td class="num">4</td><td class="num">7</td>
        <td><div class="meter"><i class="seg-warn" style="width:64%"></i></div></td></tr>
      <tr><td><span class="ctlid">AU</span></td><td>Audit and accountability</td><td class="num">3</td><td class="num">5</td>
        <td><div class="meter"><i class="seg-warn" style="width:45%"></i></div></td></tr>
      <tr><td><span class="ctlid">CM</span></td><td>Configuration management</td><td class="num">2</td><td class="num">3</td>
        <td><div class="meter"><i class="seg-warn" style="width:27%"></i></div></td></tr>
    </tbody></table>
    <div class="stamp"><b>Portfolio insight.</b> Container patch currency (SI-2) and restoration testing (CP-9)
      account for 9 of the 21 open conditions across five systems. A single platform-level remediation would
      close roughly 43% of the portfolio's outstanding conditions.</div>
  </section>`);

fs.writeFileSync(__dirname + '/05-portfolio-summary.html',
  doc(t, 'Portfolio summary — Northstar Digital Services', p1+p2+p3));
console.log('portfolio summary written');
