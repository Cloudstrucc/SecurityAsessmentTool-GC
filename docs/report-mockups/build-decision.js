const fs = require('fs');
const { THEMES, doc, page } = require('./_shell.js');
const D = require('./_data.js');
const t = THEMES.vanguard;
const P = D.project, A = D.assessment, K = D.decision;
const id = 'DP-2026-0118-r1';
const base = { title:'Decision package', subject:P.name, cls:'', id };

const stateCount = D.poam.reduce((a,i)=>{a[i.state]=(a[i.state]||0)+1;return a;},{});
const overdue = D.poam.filter(i=>i.overdue).length;

const p1 = `<div class="sheet cover">
  <div class="masthead">${t.logo}
    <div class="prodtag"><b>${t.product}</b>Authorization decision package</div></div>
  <div class="hairline"></div>
  <div class="cover-body">
    <div class="eyebrow">Interim authorization to operate</div>
    <h1 class="cover-title">${P.name}</h1>
    <div class="cover-sub">${K.title}</div>
    <div class="cover-accent"></div>
    <table class="docctl">
      <tr><th>Package reference</th><td class="mono">${K.reference}</td></tr>
      <tr><th>Decision type</th><td><b>${K.decision_type}</b> — interim, conditional</td></tr>
      <tr><th>State</th><td><span class="pill p-ok">Issued</span> — this package is sealed and cannot be edited</td></tr>
      <tr><th>Pinned assessment</th><td>Assessment #${A.id}, <b>version ${K.assessment_version}</b> (snapshot #${K.assessment_version_id})</td></tr>
      <tr><th>Authorizing official</th><td>${K.authorizing_official}</td></tr>
      <tr><th>Security assessor</th><td>${K.assessor}</td></tr>
      <tr><th>Issued</th><td>${K.issued_at}</td></tr>
      <tr><th>Expires</th><td><b>${K.expires_at}</b> — 345 days remaining at generation</td></tr>
    </table>
    <div class="stamp"><b>Immutable by construction.</b> This package is bound to assessment version
      ${K.assessment_version}. Work continuing on the assessment produces versions 8, 9 and beyond; none of them
      change what was authorized here. A superseding decision requires a new package.</div>
  </div>
  <div class="pfoot"><span class="cls">&nbsp;</span><span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div></div>`;

const p2 = page(t, base, `
  <section><div class="sec-h"><span class="num">1</span><h2>Decision</h2></div>
    <div class="stamp" style="border-left-color:var(--ok);margin-top:0"><b>An interim authorization to operate
      (${K.decision_type}) is granted</b> for ${P.name}, effective ${K.issued_at} and expiring ${K.expires_at},
      subject to the ${D.poam.length} conditions recorded in section 4.</div>
    <h3>Executive summary</h3><p>${K.executive_summary}</p>
    <h3>Residual risk statement</h3><p>${K.residual_risk_statement}</p>
    <h3>Decision rationale</h3><p>${K.decision_rationale}</p>
    <h3>Conditions of authorization</h3><p>${K.conditions}</p>
  </section>
  <section><div class="sec-h"><span class="num">2</span><h2>Authorization chain</h2></div>
    <div class="flow">
      <div class="chev done"><span class="s">Intake</span><span class="t">Accepted 2026-04-26</span></div>
      <div class="chev done"><span class="s">Assessment</span><span class="t">Audit complete v7</span></div>
      <div class="chev done"><span class="s">Recommendation</span><span class="t">${K.recommended_at}</span></div>
      <div class="chev now"><span class="s">Decision</span><span class="t">iATO issued</span></div>
      <div class="chev"><span class="s">Full ATO</span><span class="t">Blocked — 4 open</span></div>
    </div>
    <table class="data" style="margin-top:7mm">
      <thead><tr><th>Step</th><th>Actor</th><th>Date</th><th>Outcome</th></tr></thead><tbody>
      <tr><td>Assessment recommended for decision</td><td>${K.recommended_by} (assessor)</td><td>${K.recommended_at}</td><td><span class="pill p-info">Recommended iATO</span></td></tr>
      <tr><td>Package reviewed</td><td>R. Advani (CIO)</td><td>2026-08-01</td><td><span class="pill p-ok">Endorsed</span></td></tr>
      <tr><td>Decision made</td><td>${K.decided_by} (authorizing official)</td><td>${K.decided_at}</td><td><span class="pill p-ok">iATO granted</span></td></tr>
      <tr><td>Package issued and sealed</td><td>System</td><td>${K.issued_at}</td><td><span class="pill p-mute">Read-only</span></td></tr>
      </tbody></table>
  </section>`);

const p3 = page(t, base, `
  <section><div class="sec-h"><span class="num">3</span><h2>Assessment basis</h2></div>
    <p class="lede">Figures below are read from the pinned snapshot, not from the live assessment.</p>
    <div class="kpis">
      <div class="kpi"><div class="n">230</div><div class="l">Applicable</div><div class="d">of 269 in PBMM</div></div>
      <div class="kpi ok"><div class="n">196</div><div class="l">Satisfied</div><div class="d">85.2%</div></div>
      <div class="kpi warn"><div class="n">24</div><div class="l">Partial</div><div class="d">10.4%</div></div>
      <div class="kpi bad"><div class="n">10</div><div class="l">Not satisfied</div><div class="d">4.3%</div></div>
    </div>
    <table class="data" style="margin-top:7mm">
      <thead><tr><th>Attribute</th><th>Value at decision</th></tr></thead><tbody>
      <tr><td>Overall score</td><td><b>${A.overall_score}%</b></td></tr>
      <tr><td>Assessment result</td><td>${A.result}</td></tr>
      <tr><td>Framework and profile</td><td>${P.security_framework} · ${P.security_profile}</td></tr>
      <tr><td>Classification</td><td>${P.data_classification} · C ${P.confidentiality_level} / I ${P.integrity_level} / A ${P.availability_level}</td></tr>
      <tr><td>Personal information</td><td>Yes — subject to applicable privacy laws</td></tr>
      <tr><td>Audit completed</td><td>${A.audit_completed_at} by ${K.assessor}</td></tr>
      <tr><td>Snapshot integrity</td><td class="mono">sha256 a91f…3c7d · sealed ${K.issued_at}</td></tr>
      </tbody></table>
    <div class="note">The full assessment report <span class="mono">ASR-2026-0118-v7</span> is the companion
      document to this package and renders from the same snapshot.</div>
  </section>
  <section><div class="sec-h"><span class="num">4</span><h2>Conditions — POA&amp;M summary</h2></div>
    <div class="kpis">
      <div class="kpi"><div class="n">${stateCount.open||0}</div><div class="l">Open</div><div class="d">Not started</div></div>
      <div class="kpi warn"><div class="n">${(stateCount['in-progress']||0)+(stateCount['evidence-submitted']||0)}</div><div class="l">In flight</div><div class="d">1 in progress · 1 in review</div></div>
      <div class="kpi ok"><div class="n">${stateCount.accepted||0}</div><div class="l">Accepted</div><div class="d">Closed by assessor</div></div>
      <div class="kpi bad"><div class="n">${overdue}</div><div class="l">Overdue</div><div class="d">Blocks full ATO</div></div>
    </div>
    <div class="stamp warnbox" style="margin-top:7mm"><b>Promotion to full ATO is blocked.</b>
      1 item is overdue (CP-9, due ${D.poam[2].deadline}), 1 item is deferred to a successor package, and
      4 items remain outstanding. Promotion unblocks when every item is ACCEPTED or explicitly carried
      forward with an approved deadline. The full register is section 5.</div>
  </section>`);

const poamRow = i => `
  <tr><td class="num">${i.id}</td><td><span class="ctlid">${i.control_id}</span></td>
    <td><span class="pill ${i.risk_level==='high'?'p-bad':i.risk_level==='medium'?'p-warn':'p-mute'}">${i.risk_level}</span></td>
    <td>${i.description}<div style="font-size:8.2pt;color:var(--muted);margin-top:3px">
      <b>Remediation.</b> ${i.remediation_plan}</div></td>
    <td>${i.assigned_to}</td>
    <td class="num">${i.deadline_original}${i.deadline_changes?`<div style="font-size:7.6pt;color:var(--bad)">→ ${i.deadline} (${i.deadline_changes}×)</div>`:''}</td>
    <td><span class="pill ${i.state==='accepted'?'p-ok':i.state==='deferred'?'p-mute':i.overdue?'p-bad':'p-warn'}">${i.state}</span>
      ${i.overdue?'<div style="font-size:7.4pt;color:var(--bad);font-weight:700;margin-top:2px">OVERDUE</div>':''}</td></tr>`;
const poamHead = `<thead><tr><th class="num" style="width:8mm">#</th><th style="width:19mm">Control</th>
        <th style="width:17mm">Risk</th><th>Finding and remediation plan</th><th style="width:28mm">Owner</th>
        <th class="num" style="width:24mm">Due</th><th style="width:26mm">State</th></tr></thead>`;

const p4parts = `
  <section><div class="sec-h"><span class="num">5</span><h2>Plan of action &amp; milestones</h2></div>
    <p class="lede">Each item is a condition on this authorization. An item closes only when the assessor
      accepts the submitted evidence; a rejected item returns to the team with feedback.</p>
    <table class="data">${poamHead}
      <tbody>${D.poam.slice(0,4).map(poamRow).join('')}</tbody></table>
SPLIT<table class="data">${poamHead}
      <tbody>${D.poam.slice(4).map(poamRow).join('')}</tbody></table>
    <h3>Deadline change history — item 4 (AU-6(1))</h3>
    <table class="data"><thead><tr><th style="width:26mm">Changed</th><th style="width:24mm">From</th>
      <th style="width:24mm">To</th><th>Justification recorded</th></tr></thead><tbody>
      <tr><td>2026-08-02</td><td>2026-11-30</td><td>2026-12-31</td><td>Detection engineering capacity reallocated to incident IR-2026-114 for six weeks.</td></tr>
      <tr><td>2026-08-19</td><td>2026-12-31</td><td>2027-01-31</td><td>Purple-team validation window moved to align with the January change freeze exit.</td></tr>
    </tbody></table>
    <div class="note">Original commitments are never overwritten — the first agreed date, every subsequent
      date and the reason for each move are retained for the auditor.</div>
  </section>`.split('SPLIT');
const p4 = page(t, base, p4parts[0] + '</section>') + page(t, base,
  `<section><div class="sec-h"><span class="num">5</span><h2>Plan of action &amp; milestones <span
     style="font-weight:400;color:var(--muted);font-size:10pt">(continued)</span></h2></div>` + p4parts[1]);

const p5 = page(t, base, `
  <section><div class="sec-h"><span class="num">6</span><h2>Signatures</h2></div>
    <div class="sigs">
      <div><div class="sigline"></div><div class="sig"><div class="role">Security assessor — recommendation</div>
        <div class="who">K. Rahman</div><div class="when">Signed ${K.recommended_at}</div></div></div>
      <div><div class="sigline"></div><div class="sig"><div class="role">Authorizing official — decision</div>
        <div class="who">M. Lindqvist</div><div class="when">Signed ${K.decided_at}</div></div></div>
      <div><div class="sigline"></div><div class="sig"><div class="role">Chief information officer</div>
        <div class="who">R. Advani</div><div class="when">Endorsed 2026-08-01</div></div></div>
      <div><div class="sigline"></div><div class="sig"><div class="role">System owner — acceptance of conditions</div>
        <div class="who">D. Okonkwo</div><div class="when">Signed ${K.issued_at}</div></div></div>
    </div>
  </section>
  <section><div class="sec-h"><span class="num">B</span><h2>Appendix B — package version history</h2></div>
    <p class="lede">Editorial fields are versioned. Reverting restores a previous wording as a new version;
      an issued package can no longer be reverted.</p>
    <table class="data"><thead><tr><th class="num" style="width:16mm">Ver.</th><th style="width:26mm">Date</th>
      <th style="width:32mm">By</th><th>Change</th></tr></thead><tbody>
      <tr><td class="num"><b>4</b></td><td>${K.issued_at}</td><td>M. Lindqvist</td><td>Decision recorded; package issued and sealed. <span class="pill p-mute">Not revertable</span></td></tr>
      <tr><td class="num">3</td><td>2026-08-01</td><td>R. Advani</td><td>Residual risk statement tightened; conditions clause reworded.</td></tr>
      <tr><td class="num">2</td><td>${K.recommended_at}</td><td>K. Rahman</td><td>Executive summary and decision rationale drafted; 6 POA&amp;M items generated from the snapshot.</td></tr>
      <tr><td class="num">1</td><td>2026-07-25</td><td>K. Rahman</td><td>Package created and pinned to assessment version 7.</td></tr>
    </tbody></table>
    <div class="note">End of package.</div>
  </section>`);

fs.writeFileSync(__dirname + '/02-decision-package.html',
  doc(t, `Decision package — ${K.reference}`, p1+p2+p3+p4+p5));
console.log('decision package written');
