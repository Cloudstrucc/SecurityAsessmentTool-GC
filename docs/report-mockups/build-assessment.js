const fs = require('fs');
const { THEMES, doc, page } = require('./_shell.js');
const D = require('./_data.js');

const RES = { satisfied:['p-ok','Satisfied'], partial:['p-warn','Partial'], failed:['p-bad','Not satisfied'],
              pending:['p-mute','Pending'] };
const pill = (k) => `<span class="pill ${RES[k][0]}">${RES[k][1]}</span>`;

function build(themeKey, opts = {}) {
  const t = THEMES[themeKey];
  const cls = opts.classification || '';
  const id = opts.reportId || 'ASR-2026-0118-v7';
  const OF = 7;
  const base = { title:'Assessment report', subject:D.project.name, cls, id, of:OF };
  const P = D.project, A = D.assessment;

  const tot = D.families.reduce((a,f)=>({app:a.app+f[2],s:a.s+f[3],p:a.p+f[4],f:a.f+f[5],na:a.na+f[6]}),
    {app:0,s:0,p:0,f:0,na:0});

  const classbar = cls ? `<div class="classbar">${cls}</div>` : '';

  /* ── page 1 — cover ─────────────────────────────────────────────── */
  const p1 = `<div class="sheet cover">${classbar}
    <div class="masthead">${t.logo}
      <div class="prodtag"><b>${t.product}</b>Security assessment &amp; authorization${
        opts.assessorLine ? `<br>${opts.assessorLine}` : ''}</div>
    </div><div class="hairline"></div>
    <div class="cover-body">
      <div class="eyebrow">Security assessment report</div>
      <h1 class="cover-title">${P.name}</h1>
      <div class="cover-sub">${P.security_framework} · ${P.security_profile} baseline · ${A.type} assessment</div>
      <div class="cover-accent"></div>
      <table class="docctl">
        <tr><th>Report ID</th><td class="mono">${id}</td></tr>
        <tr><th>Source record</th><td>Assessment #${A.id} — <b>version ${A.version}</b> (immutable snapshot)</td></tr>
        <tr><th>Assessment status</th><td>${A.status} · result <b>${A.result}</b> · score <b>${A.overall_score}%</b></td></tr>
        <tr><th>Prepared for</th><td>${opts.preparedFor || 'Northstar Digital Services'}</td></tr>
        <tr><th>Generated</th><td>2026-08-24 14:07 UTC by K. Rahman (Lead Security Assessor)</td></tr>
        <tr><th>Language</th><td>English (en) — this report renders identically in fr, es, de, pt, it, nl, ja</td></tr>
        <tr><th>Distribution</th><td>${opts.distribution || 'Authorizing official, system owner, assessment team'}</td></tr>
      </table>
      <div class="stamp"><b>Rendered from a pinned snapshot.</b> Every figure in this report is drawn from
      assessment version ${A.version} (record #441), not from live data. Regenerating this report at any future
      date reproduces it byte for byte. Later edits appear only in a later version.</div>
      <div class="note">Contents — 1 System profile · 2 Assessment summary · 3 Control posture by family
      · 4 Control detail · 5 Findings requiring action · 6 Authorization signatures · Appendix A Version history</div>
    </div>
    <div class="pfoot"><span class="cls">${cls||'&nbsp;'}</span><span>${t.footerOwner}</span>
      <span>${id} · Page __PG__ of __OF__</span></div></div>`;

  /* ── page 2 — profile + summary ─────────────────────────────────── */
  const dial = (pct) => {
    const r=34, c=2*Math.PI*r;
    return `<svg class="dial" width="96" height="96" viewBox="0 0 96 96">
      <circle class="track" cx="48" cy="48" r="${r}"/>
      <circle class="val" cx="48" cy="48" r="${r}" stroke-dasharray="${c}"
        stroke-dashoffset="${c*(1-pct/100)}"/>
      <text x="48" y="52" text-anchor="middle" font-size="19">${pct}<tspan font-size="10">%</tspan></text>
    </svg>`;
  };
  const p2parts = `
    <section><div class="sec-h"><span class="num">1</span><h2>System profile</h2></div>
      <p class="lede">${P.description}</p>
      <table class="kv kv4">
        <tr><th>Security framework</th><td>${P.security_framework}</td>
            <th>High-value asset</th><td>${P.is_hva?'Yes':'No'}</td></tr>
        <tr><th>Control profile</th><td>${P.framework_baseline}</td>
            <th>Personal information</th><td>${P.has_pii?'Yes — applicable privacy laws':'No'}</td></tr>
        <tr><th>Classification</th><td>${P.data_classification}</td>
            <th>Hosting</th><td>${P.hosting_type}</td></tr>
        <tr><th>Confidentiality</th><td>${P.confidentiality_level}</td>
            <th>System type</th><td>${P.app_type}</td></tr>
        <tr><th>Integrity</th><td>${P.integrity_level}</td>
            <th>Lifecycle status</th><td>${P.status}</td></tr>
        <tr><th>Availability</th><td>${P.availability_level}</td>
            <th>Technologies</th><td>${P.technologies.join(', ')}</td></tr>
      </table>
      <h3>Accountability</h3>
      <table class="data"><thead><tr><th>Role</th><th>Name</th><th>Contact</th></tr></thead><tbody>
        <tr><td>System owner</td><td>${P.project_owner_name}</td><td class="mono">${P.project_owner_email}</td></tr>
        <tr><td>Authorizing official</td><td>${P.project_authority_name}</td><td class="mono">${P.project_authority_email}</td></tr>
        <tr><td>Chief information officer</td><td>${P.cio_name}</td><td class="mono">${P.cio_email}</td></tr>
      </tbody></table>
    </section>

SPLIT_HERE<section><div class="sec-h"><span class="num">2</span><h2>Assessment summary</h2></div>
      <div class="score-wrap">${dial(A.overall_score)}
        <div style="flex:1">
          <div class="meter">
            <i class="seg-ok" style="width:${tot.s/tot.app*100}%"></i>
            <i class="seg-warn" style="width:${tot.p/tot.app*100}%"></i>
            <i class="seg-bad" style="width:${tot.f/tot.app*100}%"></i>
          </div>
          <div class="legend">
            <span><i class="seg-ok"></i>Satisfied ${tot.s}</span>
            <span><i class="seg-warn"></i>Partially satisfied ${tot.p}</span>
            <span><i class="seg-bad"></i>Not satisfied ${tot.f}</span>
            <span><i class="seg-na"></i>Not applicable ${tot.na} (excluded from score)</span>
          </div>
          <p class="note" style="margin-top:9px">Overall score is the proportion of applicable controls fully
          satisfied, with partially satisfied controls counted at half weight. ${tot.app} controls applicable
          of ${tot.app+tot.na} in the ${P.security_profile} profile.</p>
        </div>
      </div>
      <div class="kpis" style="margin-top:8mm">
        <div class="kpi ok"><div class="n">${tot.s}</div><div class="l">Satisfied</div><div class="d">${(tot.s/tot.app*100).toFixed(1)}% of applicable</div></div>
        <div class="kpi warn"><div class="n">${tot.p}</div><div class="l">Partial</div><div class="d">Evidence incomplete</div></div>
        <div class="kpi bad"><div class="n">${tot.f}</div><div class="l">Not satisfied</div><div class="d">6 raised as POA&amp;M items</div></div>
        <div class="kpi"><div class="n">${D.families.filter(f=>f[0]==='PE').length?18:18}</div><div class="l">Inherited</div><div class="d">From hosting provider</div></div>
      </div>
      <h3>Milestones</h3>
      <table class="data"><thead><tr><th>Milestone</th><th>Date</th><th>Actor</th></tr></thead><tbody>
        <tr><td>Evidence submitted for audit</td><td>${A.submitted_at}</td><td>D. Okonkwo (system owner)</td></tr>
        <tr><td>Audit started</td><td>${A.audit_started_at}</td><td>K. Rahman (assessor)</td></tr>
        <tr><td>Audit completed</td><td>${A.audit_completed_at}</td><td>K. Rahman (assessor)</td></tr>
        <tr><td>Authorization decision issued</td><td>${A.ato_generated_at}</td><td>M. Lindqvist (authorizing official)</td></tr>
        <tr><td>Authorization expires</td><td><b>${A.ato_expiry_date}</b></td><td>—</td></tr>
      </tbody></table>
    </section>`.split('SPLIT_HERE');
  const p2 = page(t, base, p2parts[0]) + page(t, base, p2parts[1]);

  /* ── page 3 — posture by family ─────────────────────────────────── */
  const famRows = D.families.map(f => {
    const [code,name,app,s,p,fl,na] = f;
    const pct = ((s + p*0.5)/app*100);
    return `<tr>
      <td><span class="ctlid">${code}</span></td><td>${name}</td>
      <td class="num">${app}</td><td class="num">${s}</td><td class="num">${p||'—'}</td>
      <td class="num">${fl||'—'}</td><td class="num">${na||'—'}</td>
      <td style="width:32mm"><div class="meter">
        <i class="seg-ok" style="width:${s/app*100}%"></i>
        <i class="seg-warn" style="width:${p/app*100}%"></i>
        <i class="seg-bad" style="width:${fl/app*100}%"></i></div></td>
      <td class="num"><b>${pct.toFixed(0)}%</b></td></tr>`;
  }).join('');
  const p3 = page(t, base, `
    <section><div class="sec-h"><span class="num">3</span><h2>Control posture by family</h2></div>
      <p class="lede">Every applicable control in the ${P.security_profile} profile, grouped by ${P.security_framework}
      family. Bars are proportional to the applicable count in that family, so a short bar means a small family,
      not a weak one — read the score column for posture.</p>
      <table class="data">
        <thead><tr><th style="width:16mm">Family</th><th>Name</th><th class="num">Appl.</th>
          <th class="num">Sat.</th><th class="num">Part.</th><th class="num">Not sat.</th>
          <th class="num">N/A</th><th>Distribution</th><th class="num">Score</th></tr></thead>
        <tbody>${famRows}</tbody>
        <tfoot><tr><td colspan="2">All families</td><td class="num">${tot.app}</td><td class="num">${tot.s}</td>
          <td class="num">${tot.p}</td><td class="num">${tot.f}</td><td class="num">${tot.na}</td>
          <td></td><td class="num">${A.overall_score}%</td></tr></tfoot>
      </table>
      <div class="stamp warnbox" style="margin-top:7mm"><b>Weakest families.</b>
        RA (risk assessment) at 83% and CP (contingency planning) at 85% are the lowest-scoring families;
        SI (system and information integrity) at 89% carries the second high-risk finding. Both are addressed by POA&amp;M items 2 and 3 in the attached decision package
        <span class="mono">DP-2026-0118</span>.</div>
    </section>`);

  /* ── pages 4–5 — control detail ─────────────────────────────────── */
  const ctlRows = D.controls.slice(0,6).map(c => `
    <tr><td><span class="ctlid">${c.control_id}</span></td>
      <td><b>${c.title}</b><div style="font-size:8.4pt;color:var(--muted);margin-top:2px">
        ${c.is_inherited ? `Inherited — ${c.inherited_from}` : `Priority ${c.priority} · direct implementation`}</div></td>
      <td>${pill(c.audit_result)}</td></tr>
    <tr><td></td><td colspan="2" style="padding-top:0">
      <div style="font-size:8.6pt"><span style="font-weight:700;color:var(--ink)">Evidence.</span>
        ${c.evidence_text}</div>
      <div style="font-size:8.6pt;margin-top:3px"><span style="font-weight:700;color:var(--ink)">Assessor.</span>
        ${c.audit_comments}</div></td></tr>`).join('');
  const p4 = page(t, base, `
    <section><div class="sec-h"><span class="num">4</span><h2>Control detail</h2></div>
      <p class="lede">Extract — 6 of ${tot.app} applicable controls shown. The full control set, with every
      evidence attachment and comment thread, is included in the complete export and in the CSV extract.</p>
      <table class="data"><thead><tr><th style="width:22mm">Control</th><th>Title, evidence and assessor finding</th>
        <th style="width:26mm">Result</th></tr></thead><tbody>${ctlRows}</tbody></table>
    </section>`);

  /* ── page 5 — findings ──────────────────────────────────────────── */
  const fmt = c => `
    <div class="finding ${c.audit_result==='partial'?'warn':''}">
      <h4><span><span class="ctlid">${c.control_id}</span> — ${c.title}</span>${pill(c.audit_result)}</h4>
      <div class="lbl">Finding</div><div class="body">${c.audit_comments}</div>
      <div class="lbl">Evidence provided</div><div class="body">${c.evidence_text}</div>
      <div class="lbl">Tracked as</div><div class="body">POA&amp;M item in decision package
        <span class="mono">DP-2026-0118</span> · risk
        ${c.audit_result==='failed'?'<b>HIGH</b>':'<b>MEDIUM</b>'}</div>
    </div>`;
  const bad = D.controls.filter(c=>c.audit_result!=='satisfied');
  const p5 = page(t, base, `
    <section><div class="sec-h"><span class="num">5</span><h2>Findings requiring action</h2></div>
      <p class="lede">Every control not fully satisfied, with the assessor's finding and where the remediation
      is tracked. These become the conditions on the authorization decision.</p>
      ${bad.slice(0,2).map(fmt).join('')}
    </section>`) + page(t, base, `
    <section><div class="sec-h"><span class="num">5</span><h2>Findings requiring action <span
      style="font-weight:400;color:var(--muted);font-size:10pt">(continued)</span></h2></div>
      ${bad.slice(2).map(fmt).join('')}
      <div class="stamp" style="margin-top:8mm"><b>${bad.length} findings, ${bad.filter(c=>c.audit_result==='failed').length} at high risk.</b>
        All four are carried as conditions on decision package <span class="mono">DP-2026-0118</span> with a
        named owner and a committed date. None of them exposes personal information to unauthenticated access.</div>
    </section>`);

  /* ── page 6 — signatures ────────────────────────────────────────── */
  const p6 = page(t, base, `
    <section><div class="sec-h"><span class="num">6</span><h2>Authorization signatures</h2></div>
      <p class="lede">This report was reviewed and signed in ${t.product}. Digital signature timestamps are
      recorded against the immutable assessment version and cannot be altered after the fact.</p>
      <div class="sigs">
        <div><div class="sigline"></div><div class="sig"><div class="role">Lead security assessor</div>
          <div class="who">K. Rahman</div><div class="when">Signed ${A.assessor_signed_at} · verified in-app</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">Authorizing official</div>
          <div class="who">${P.project_authority_name}</div><div class="when">Signed ${A.authority_signed_at} · verified in-app</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">Chief information officer</div>
          <div class="who">${P.cio_name}</div><div class="when">Signed ${A.cio_signed_at} · verified in-app</div></div></div>
        <div><div class="sigline"></div><div class="sig"><div class="role">System owner</div>
          <div class="who">${P.project_owner_name}</div><div class="when">Evidence attested ${A.submitted_at}</div></div></div>
      </div>
      <div class="stamp" style="margin-top:9mm"><b>Decision.</b> ${A.ato_type} issued ${A.ato_generated_at},
      expiring ${A.ato_expiry_date}, subject to the six conditions recorded in decision package
      <span class="mono">DP-2026-0118</span>. Full authorization is withheld until all conditions are accepted.</div>
    </section>`);

  /* ── page 7 — appendix A version history ────────────────────────── */
  const versions = [
    [7,'Audit complete','2026-07-24','K. Rahman','Audit results recorded for 34 controls; 2 controls moved to not satisfied.'],
    [6,'Second evidence pass','2026-07-11','D. Okonkwo','Evidence updated for 19 controls across CM, SC and SI.'],
    [5,'Assessor feedback','2026-06-27','K. Rahman','12 controls returned for additional evidence.'],
    [4,'Evidence submitted','2026-06-02','D. Okonkwo','Full evidence set submitted for audit.'],
    [3,'Tailoring finalised','2026-05-19','K. Rahman','9 controls marked not applicable with justification; 18 marked inherited.'],
    [2,'Profile applied','2026-05-06','System','PBMM control set generated — 268 controls.'],
    [1,'Created from intake','2026-04-28','D. Okonkwo','Assessment created from intake submission INT-2026-0231.']
  ].map(v=>`<tr><td class="num"><b>${v[0]}</b></td><td>${v[1]}</td><td>${v[2]}</td><td>${v[3]}</td><td>${v[4]}</td></tr>`).join('');
  const p7 = page(t, base, `
    <section><div class="sec-h"><span class="num">A</span><h2>Appendix A — version history</h2></div>
      <p class="lede">Assessment versions are append-only. Version ${A.version} is the snapshot this report
      renders; earlier versions remain readable and any of them can be reverted to, which creates a new
      version rather than overwriting one.</p>
      <table class="data"><thead><tr><th class="num" style="width:16mm">Ver.</th><th style="width:38mm">Label</th>
        <th style="width:24mm">Date</th><th style="width:32mm">By</th><th>Summary</th></tr></thead>
        <tbody>${versions}</tbody></table>
      <h3>Report reproducibility</h3>
      <p style="font-size:9pt">Report <span class="mono">${id}</span> was generated from assessment version
      ${A.version} (snapshot record #441, SHA-256
      <span class="mono">a91f…3c7d</span>). Requesting the same report ID at any future date returns the same
      document. A report generated from a later version carries a different ID and a different snapshot hash.</p>
      <div class="note">End of report.</div>
    </section>`);

  return doc(t, `Assessment report — ${P.name}`, p1+p2+p3+p4+p5+p6+p7);
}

fs.writeFileSync(__dirname + '/01-assessment-report.html', build('vanguard'));
fs.writeFileSync(__dirname + '/06-assessment-report-BRANDED.html', build('meridian', {
  classification:'Confidential — Meridian internal',
  reportId:'MHG-ASR-2026-0118-v7',
  preparedFor:'Meridian Health Group — Information Security Office',
  assessorLine:'Prepared by Northwind Assurance Partners',
  distribution:'Meridian ISO, system owner, Northwind engagement team'
}));
console.log('assessment report written (default + branded)');
