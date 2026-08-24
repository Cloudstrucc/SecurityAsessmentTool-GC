const fs = require('fs');
const { THEMES, doc, page } = require('./_shell.js');
const D = require('./_data.js');
const t = THEMES.vanguard;
const P = D.project;
const id = 'PRJ-2026-0044';
const base = { title:'Project rollup', subject:P.name, cls:'', id };

const p1 = `<div class="sheet cover">
  <div class="masthead">${t.logo}
    <div class="prodtag"><b>${t.product}</b>Project rollup report</div></div>
  <div class="hairline"></div>
  <div class="cover-body" style="padding-top:18mm">
    <div class="eyebrow">Project rollup</div>
    <h1 class="cover-title">${P.name}</h1>
    <div class="cover-sub">${P.description}</div>
    <div class="cover-accent"></div>
    <h3 style="margin-top:0">Where this project stands</h3>
    <div class="flow">
      <div class="chev done"><span class="s">Intake</span><span class="t">Accepted</span></div>
      <div class="chev done"><span class="s">Project</span><span class="t">Active</span></div>
      <div class="chev done"><span class="s">Assessment</span><span class="t">Audit complete</span></div>
      <div class="chev now"><span class="s">Decision</span><span class="t">iATO issued</span></div>
      <div class="chev"><span class="s">Full ATO</span><span class="t">4 conditions open</span></div>
    </div>
    <div class="kpis" style="margin-top:8mm">
      <div class="kpi"><div class="n">2</div><div class="l">Assessments</div><div class="d">1 active · 1 superseded</div></div>
      <div class="kpi ok"><div class="n">82.4%</div><div class="l">Current score</div><div class="d">+11.2 since v4</div></div>
      <div class="kpi warn"><div class="n">6</div><div class="l">POA&amp;M items</div><div class="d">1 overdue</div></div>
      <div class="kpi"><div class="n">345</div><div class="l">Days to expiry</div><div class="d">iATO to 2027-08-04</div></div>
    </div>
    <table class="docctl" style="margin-top:9mm">
      <tr><th>Report ID</th><td class="mono">${id}</td></tr>
      <tr><th>Generated</th><td>2026-08-24 14:14 UTC by M. Lindqvist</td></tr>
      <tr><th>Scope</th><td>All assessments, decisions, conditions, documents and team access for this project</td></tr>
      <tr><th>Live data</th><td>This rollup reflects <b>current</b> state, not a pinned snapshot — it is a
        management view, not an authorization artefact</td></tr>
    </table>
  </div>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>`;

const p2 = page(t, base, `
  <section><div class="sec-h"><span class="num">1</span><h2>Assessments</h2></div>
    <table class="data"><thead><tr><th class="num" style="width:12mm">#</th><th style="width:22mm">Type</th>
      <th style="width:30mm">Status</th><th class="num" style="width:18mm">Ver.</th><th class="num" style="width:18mm">Score</th>
      <th style="width:26mm">Result</th><th style="width:26mm">Assessor</th><th>Last activity</th></tr></thead><tbody>
      <tr><td class="num">118</td><td>Initial</td><td><span class="pill p-ok">Audit complete</span></td>
        <td class="num">7</td><td class="num"><b>82.4%</b></td><td><span class="pill p-warn">Conditional</span></td>
        <td>K. Rahman</td><td>2026-07-24 — audit results recorded</td></tr>
      <tr><td class="num">96</td><td>Pre-assessment</td><td><span class="pill p-mute">Superseded</span></td>
        <td class="num">3</td><td class="num">64.1%</td><td><span class="pill p-mute">Advisory</span></td>
        <td>K. Rahman</td><td>2026-03-30 — closed, findings carried into #118</td></tr>
    </tbody></table>
    <h3>Score trajectory — assessment #118</h3>
    <table class="data"><thead><tr><th class="num" style="width:16mm">Ver.</th><th style="width:26mm">Date</th>
      <th class="num" style="width:20mm">Score</th><th style="width:44mm">Movement</th><th>Driver</th></tr></thead><tbody>
      <tr><td class="num"><b>7</b></td><td>2026-07-24</td><td class="num"><b>82.4%</b></td>
        <td><div class="meter"><i class="seg-ok" style="width:82.4%"></i></div></td><td>Audit results recorded; AC-2(3) and SI-2 moved to not satisfied.</td></tr>
      <tr><td class="num">6</td><td>2026-07-11</td><td class="num">86.9%</td>
        <td><div class="meter"><i class="seg-ok" style="width:86.9%"></i></div></td><td>Second evidence pass closed 19 gaps in CM, SC and SI.</td></tr>
      <tr><td class="num">5</td><td>2026-06-27</td><td class="num">74.8%</td>
        <td><div class="meter"><i class="seg-ok" style="width:74.8%"></i></div></td><td>12 controls returned by the assessor for additional evidence.</td></tr>
      <tr><td class="num">4</td><td>2026-06-02</td><td class="num">71.2%</td>
        <td><div class="meter"><i class="seg-ok" style="width:71.2%"></i></div></td><td>First full evidence submission.</td></tr>
    </tbody></table>
  </section>
  <section><div class="sec-h"><span class="num">2</span><h2>Decision packages</h2></div>
    <table class="data"><thead><tr><th style="width:34mm">Reference</th><th style="width:20mm">Type</th>
      <th style="width:24mm">State</th><th class="num" style="width:26mm">Pinned version</th>
      <th style="width:26mm">Issued</th><th style="width:26mm">Expires</th><th>Conditions</th></tr></thead><tbody>
      <tr><td class="mono">DP-2026-0118</td><td>iATO</td><td><span class="pill p-ok">Issued</span></td>
        <td class="num">v7 (#441)</td><td>2026-08-05</td><td>2027-08-04</td><td>6 items — 1 accepted, 4 outstanding, 1 deferred</td></tr>
      <tr><td class="mono">DP-2026-0096</td><td>Advisory</td><td><span class="pill p-mute">Expired</span></td>
        <td class="num">v3 (#318)</td><td>2026-04-02</td><td>2026-07-01</td><td>None — pre-assessment guidance only</td></tr>
    </tbody></table>
  </section>`);

const p3parts = `
  <section><div class="sec-h"><span class="num">3</span><h2>Outstanding conditions</h2></div>
    <table class="data"><thead><tr><th class="num" style="width:9mm">#</th><th style="width:20mm">Control</th>
      <th style="width:16mm">Risk</th><th>Finding</th><th style="width:34mm">Owner</th>
      <th class="num" style="width:24mm">Due</th><th style="width:30mm">State</th></tr></thead><tbody>
      ${D.poam.filter(i=>i.state!=='accepted').map(i=>`<tr><td class="num">${i.id}</td>
        <td><span class="ctlid">${i.control_id}</span></td>
        <td><span class="pill ${i.risk_level==='high'?'p-bad':i.risk_level==='medium'?'p-warn':'p-mute'}">${i.risk_level}</span></td>
        <td>${i.description}</td><td>${i.assigned_to}</td>
        <td class="num">${i.deadline}</td>
        <td><span class="pill ${i.state==='deferred'?'p-mute':i.overdue?'p-bad':'p-warn'}">${i.state}</span>
        ${i.overdue?'<div style="font-size:7.2pt;color:var(--bad);font-weight:700">OVERDUE</div>':''}</td></tr>`).join('')}
    </tbody></table>
  </section>
  <section><div class="sec-h"><span class="num">4</span><h2>Documents and evidence</h2></div>
    <table class="data"><thead><tr><th>Document</th><th style="width:30mm">Type</th>
      <th style="width:24mm">Uploaded</th><th style="width:30mm">By</th><th class="num" style="width:18mm">Size</th></tr></thead><tbody>
      <tr><td>System security plan — rev 4</td><td>Security plan</td><td>2026-06-01</td><td>D. Okonkwo</td><td class="num">3.4 MB</td></tr>
      <tr><td>Threat and risk assessment</td><td>Risk</td><td>2026-05-22</td><td>K. Rahman</td><td class="num">1.9 MB</td></tr>
      <tr><td>Penetration test report 2026-Q2</td><td>Test result</td><td>2026-06-18</td><td>External — Northwind</td><td class="num">2.7 MB</td></tr>
      <tr><td>Provider SOC 2 Type II attestation</td><td>Inheritance</td><td>2026-05-09</td><td>D. Okonkwo</td><td class="num">6.1 MB</td></tr>
    </tbody></table>
    <div class="note">Attachments are listed, not embedded. A full export bundles them as a ZIP alongside this document.</div>
  </section>
SPLIT5<section><div class="sec-h"><span class="num">5</span><h2>Team and access</h2></div>
    <table class="data"><thead><tr><th style="width:36mm">Member</th><th style="width:34mm">Role</th>
      <th style="width:30mm">Scope</th><th style="width:26mm">Added</th><th>Report access</th></tr></thead><tbody>
      <tr><td>M. Lindqvist</td><td>Organization admin</td><td>All projects</td><td>2026-01-08</td><td>All reports in the tenant</td></tr>
      <tr><td>K. Rahman</td><td>Lead assessor</td><td>Assessment #118</td><td>2026-04-28</td><td>Reports for assigned assessments only</td></tr>
      <tr><td>D. Okonkwo</td><td>System owner</td><td>Assessment #118</td><td>2026-04-28</td><td>Reports for assigned assessments only</td></tr>
      <tr><td>Identity Platform Team</td><td>Contributor</td><td>POA&amp;M item 1</td><td>2026-08-06</td><td>No report access</td></tr>
    </tbody></table>
    <div class="stamp"><b>Access rule shown here.</b> Organization admins can export any report in the tenant.
      Everyone else can export only the reports for assessments they are assigned to — the same rule that
      governs POA&amp;M participation.</div>
  </section>`.split('SPLIT5');
const p3 = page(t, base, p3parts[0]) + page(t, base, p3parts[1]);

fs.writeFileSync(__dirname + '/04-project-rollup.html', doc(t, `Project rollup — ${P.name}`, p1+p2+p3));
console.log('project rollup written');
