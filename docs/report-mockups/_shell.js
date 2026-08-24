/* Shared report shell — the single layout every renderer (HTML/PDF/DOCX) drives from. */
const fs = require('fs');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(__dirname + '/.logo.b64', 'utf8');

const THEMES = {
  vanguard: {
    brandName: 'Vanguard Cloud Services', product: 'Aegis SA',
    ink:'#143453', nav:'#0a1626', accent:'#4d9fe0', accentDk:'#2f80cf',
    light:'#f4f9fd', border:'#dce7f2', muted:'#5f7185', text:'#17273a',
    grad:'linear-gradient(90deg,#6d7fca 0%,#4d9fe0 50%,#7cc9ee 100%)',
    logo:`<img src="${LOGO}" alt="Vanguard Cloud Services" class="logo-img">`,
    footerOwner:'Vanguard Cloud Services · Aegis SA'
  },
  meridian: {
    brandName: 'Meridian Health Group', product: 'Aegis SA',
    ink:'#1f4d4a', nav:'#123634', accent:'#2f8f86', accentDk:'#236e67',
    light:'#f2f8f7', border:'#d5e6e3', muted:'#5c7472', text:'#16302e',
    grad:'linear-gradient(90deg,#6d3b5e 0%,#2f8f86 55%,#7fc9bf 100%)',
    logo:`<svg class="logo-svg" viewBox="0 0 250 46" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Meridian Health Group">
      <circle cx="23" cy="23" r="18" fill="none" stroke="#1f4d4a" stroke-width="2.4"/>
      <path d="M23 7 L23 39 M9.5 15 L36.5 31 M36.5 15 L9.5 31" stroke="#6d3b5e" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="23" cy="23" r="5.6" fill="#2f8f86"/>
      <text x="52" y="21" font-family="Lato,Inter,sans-serif" font-size="15.5" font-weight="900" fill="#1f4d4a" letter-spacing="2.2">MERIDIAN</text>
      <text x="53" y="36" font-family="Lato,Inter,sans-serif" font-size="9" font-weight="700" fill="#6d3b5e" letter-spacing="4.6">HEALTH GROUP</text>
    </svg>`,
    footerOwner:'Meridian Health Group · prepared by Northwind Assurance Partners'
  }
};

function css(t) { return `
@import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap');
*,*::before,*::after{box-sizing:border-box}
:root{
  --ink:${t.ink}; --nav:${t.nav}; --accent:${t.accent}; --accent-dk:${t.accentDk};
  --light:${t.light}; --border:${t.border}; --muted:${t.muted}; --text:${t.text};
  --grad:${t.grad};
  --ok:#2fa06d; --warn:#c98617; --bad:#c23b46; --info:#3d7fb8;
}
html{background:#e7edf3}
body{margin:0;font-family:'Lato','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  color:var(--text);font-size:10.5pt;line-height:1.5;-webkit-font-smoothing:antialiased;
  font-variant-numeric:tabular-nums}
h1,h2,h3,h4{font-family:'Lato','Inter',sans-serif;color:var(--ink);line-height:1.2;margin:0}

/* ── the sheet = one printed page ───────────────────────────────────── */
.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;position:relative;
  padding:16mm 15mm 22mm;box-shadow:0 3px 18px rgba(15,32,54,.16);overflow:hidden}
.sheet.cover{padding-top:0}

/* ── masthead ───────────────────────────────────────────────────────── */
.classbar{margin:0 -15mm 0;background:var(--nav);color:#fff;text-align:center;
  font-size:8pt;font-weight:700;letter-spacing:2.6px;padding:5px 0;text-transform:uppercase}
.masthead{display:flex;justify-content:space-between;align-items:flex-end;
  padding:9mm 0 5mm;border-bottom:1px solid var(--border)}
.masthead .rule,.hairline{height:3px;background:var(--grad);margin:0 -15mm}
.logo-img{height:34px;width:auto;display:block}
.logo-svg{height:38px;width:auto;display:block}
.prodtag{text-align:right;font-size:8pt;color:var(--muted);letter-spacing:.6px;line-height:1.5}
.prodtag b{display:block;color:var(--ink);font-size:11pt;letter-spacing:.2px}

/* running header on continuation pages */
.runhead{display:flex;justify-content:space-between;align-items:center;font-size:8pt;
  color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:9mm;
  letter-spacing:.4px}
.runhead b{color:var(--ink);font-weight:700}

/* ── cover ──────────────────────────────────────────────────────────── */
.cover-body{padding-top:26mm}
.eyebrow{font-size:8.5pt;letter-spacing:3.4px;text-transform:uppercase;color:var(--accent-dk);
  font-weight:700;margin-bottom:10px}
.cover-title{font-size:29pt;font-weight:900;letter-spacing:-.5px;margin-bottom:6px}
.cover-sub{font-size:13pt;color:var(--muted);font-weight:400;margin-bottom:26px}
.cover-accent{height:4px;width:74px;background:var(--grad);border-radius:2px;margin:0 0 26px}
.docctl{width:100%;border-collapse:collapse;margin-top:8mm;font-size:9.5pt}
.docctl th{text-align:left;width:44mm;font-weight:700;color:var(--ink);padding:6px 10px 6px 0;
  vertical-align:top;border-bottom:1px solid var(--border);font-size:8.5pt;letter-spacing:.6px;
  text-transform:uppercase}
.docctl td{padding:6px 0;border-bottom:1px solid var(--border);vertical-align:top}
.stamp{margin-top:10mm;border:1px solid var(--border);border-left:4px solid var(--accent);
  background:var(--light);padding:11px 14px;font-size:9pt;border-radius:0 6px 6px 0}
.stamp b{color:var(--ink)}
.stamp.warnbox{border-left-color:var(--warn)}

/* ── sections ───────────────────────────────────────────────────────── */
section{margin-top:9mm;page-break-inside:avoid}
.sec-h{display:flex;align-items:baseline;gap:9px;border-bottom:2px solid var(--ink);
  padding-bottom:5px;margin-bottom:9px}
.sec-h .num{font-size:9pt;font-weight:900;color:var(--accent-dk);letter-spacing:1px}
.sec-h h2{font-size:13.5pt;font-weight:700}
h3{font-size:10.5pt;margin:6mm 0 4px;color:var(--ink)}
p{margin:0 0 8px}
.lede{color:var(--muted);font-size:9.5pt;margin-bottom:10px}

/* ── data tables ────────────────────────────────────────────────────── */
table.data{width:100%;border-collapse:collapse;font-size:9pt;margin-top:4px}
table.data thead th{background:var(--ink);color:#fff;text-align:left;padding:6px 8px;
  font-size:8pt;letter-spacing:.7px;text-transform:uppercase;font-weight:700;
  border-right:1px solid rgba(255,255,255,.12)}
table.data thead th:last-child{border-right:none}
table.data td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}
table.data tbody tr:nth-child(even) td{background:#fafcfe}
table.data td.num,table.data th.num{text-align:right}
table.data tfoot td{font-weight:700;background:var(--light);border-top:2px solid var(--ink);
  border-bottom:none;color:var(--ink)}
.kv{width:100%;border-collapse:collapse;font-size:9.5pt}
.kv th{text-align:left;font-weight:700;color:var(--ink);width:46mm;padding:5px 10px 5px 0;
  border-bottom:1px solid var(--border);vertical-align:top}
.kv td{padding:5px 0;border-bottom:1px solid var(--border)}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 12mm}
.kv4 th{width:34mm}
.kv4 td{width:auto;padding-right:9mm}
.kv4 th:nth-child(3){padding-left:7mm;border-left:1px solid var(--border)}

/* ── pills — readable in greyscale: border + weight, never colour alone ── */
.pill{display:inline-block;font-size:7.6pt;font-weight:700;letter-spacing:.5px;
  padding:1.5px 7px;border-radius:9px;border:1px solid;text-transform:uppercase;white-space:nowrap}
.p-ok{color:#1c6f4a;border-color:#8fd0b3;background:#eaf7f1}
.p-warn{color:#8a5a05;border-color:#e8c98a;background:#fdf5e6}
.p-bad{color:#8f242e;border-color:#e5a8ad;background:#fdeef0}
.p-info{color:#1f5580;border-color:#a9cbe6;background:#eef5fb}
.p-mute{color:#4a5b6d;border-color:#c8d4e0;background:#f2f5f8}

/* ── bars & meters ──────────────────────────────────────────────────── */
.meter{height:9px;background:#e9eff5;border-radius:5px;overflow:hidden;display:flex;
  border:1px solid var(--border)}
.meter i{display:block;height:100%}
.seg-ok{background:#3aa876}.seg-warn{background:#e0a53d}.seg-bad{background:#d1505b}
.seg-na{background:#c3ced9}
.legend{display:flex;gap:14px;font-size:8pt;color:var(--muted);margin-top:7px;flex-wrap:wrap}
.legend span{display:flex;align-items:center;gap:5px}
.legend i{width:9px;height:9px;border-radius:2px;display:block}

/* KPI tiles */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px}
.kpi{border:1px solid var(--border);border-top:3px solid var(--accent);border-radius:5px;
  padding:9px 11px;background:#fff}
.kpi .n{font-size:20pt;font-weight:900;color:var(--ink);line-height:1.05}
.kpi .l{font-size:7.8pt;text-transform:uppercase;letter-spacing:1px;color:var(--muted);
  margin-top:2px;font-weight:700}
.kpi .d{font-size:8pt;color:var(--muted);margin-top:3px}
.kpi.bad{border-top-color:var(--bad)}.kpi.warn{border-top-color:var(--warn)}
.kpi.ok{border-top-color:var(--ok)}

/* score dial */
.score-wrap{display:flex;gap:14px;align-items:center}
.dial{flex:0 0 auto}
.dial .track{fill:none;stroke:#e9eff5;stroke-width:11}
.dial .val{fill:none;stroke:var(--accent);stroke-width:11;stroke-linecap:round;
  transform:rotate(-90deg);transform-origin:50% 50%}
.dial text{font-family:'Lato',sans-serif;font-weight:900;fill:var(--ink)}

/* chevron process flow */
.flow{display:flex;gap:3px;margin-top:5px}
.chev{position:relative;flex:1;background:var(--light);border:1px solid var(--border);
  padding:8px 12px 8px 20px;font-size:8.4pt;clip-path:polygon(0 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,0 100%,11px 50%)}
.chev:first-child{clip-path:polygon(0 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,0 100%)}
.chev.done{background:var(--ink);border-color:var(--ink);color:#fff}
.chev.now{background:var(--accent);border-color:var(--accent);color:#fff}
.chev .s{display:block;font-size:7.2pt;letter-spacing:1.1px;text-transform:uppercase;opacity:.8}
.chev .t{font-weight:700}

/* finding block */
.finding{border:1px solid var(--border);border-left:4px solid var(--bad);border-radius:0 5px 5px 0;
  padding:9px 12px;margin-bottom:8px;background:#fff;page-break-inside:avoid}
.finding.warn{border-left-color:var(--warn)}
.finding h4{font-size:10pt;display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.finding .body{font-size:9pt;margin-top:5px;color:var(--text)}
.finding .lbl{font-size:7.8pt;text-transform:uppercase;letter-spacing:1px;color:var(--muted);
  font-weight:700;margin-top:6px}

/* signatures */
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:9mm 12mm;margin-top:6mm}
.sig{border-top:1px solid var(--ink);padding-top:5px}
.sig .role{font-size:8pt;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);
  font-weight:700}
.sig .who{font-weight:700;color:var(--ink);margin-top:2px}
.sig .when{font-size:8.5pt;color:var(--muted)}
.sigline{height:13mm;border-bottom:1px dashed #97a7b6;margin-bottom:4px}

/* footer */
.pfoot{position:absolute;left:15mm;right:15mm;bottom:11mm;display:flex;justify-content:space-between;
  align-items:center;font-size:7.6pt;color:var(--muted);border-top:1px solid var(--border);
  padding-top:5px;letter-spacing:.3px}
.pfoot .cls{font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink)}

.note{font-size:8.4pt;color:var(--muted);font-style:italic;margin-top:6px}
.mono{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:8.6pt}
.ctlid{font-family:'SFMono-Regular',Consolas,monospace;font-weight:700;color:var(--ink);white-space:nowrap}

@media print{
  html{background:#fff}
  .sheet{margin:0;box-shadow:none;page-break-after:always;width:auto;min-height:auto}
  .sheet:last-child{page-break-after:auto}
  @page{size:A4;margin:0}
}
`;}

/** Page footer — every renderer emits the same one. */
function foot(t, {cls, id}) {
  return `<div class="pfoot"><span class="cls">${cls || '&nbsp;'}</span>
    <span>${t.footerOwner}</span>
    <span>${id} · Page __PG__ of __OF__</span></div>`;
}
function runhead(t, {title, subject, cls}) {
  return `<div class="runhead"><span><b>${title}</b> — ${subject}</span><span>${cls || ''}</span></div>`;
}
function page(t, o, inner) {
  return `<div class="sheet">${o.first ? '' : runhead(t, o)}${inner}${foot(t, o)}</div>`;
}
/* Page numbers are stamped after layout, exactly as a paginating renderer would. */
function paginate(body) {
  const of = (body.match(/__PG__/g) || []).length;
  let n = 0;
  return body.replace(/__PG__/g, () => ++n).replace(/__OF__/g, of);
}
function doc(t, title, body) {
  body = paginate(body);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>${css(t)}</style></head><body>${body}</body></html>`;
}
module.exports = { THEMES, doc, page, foot, runhead, paginate, LOGO };
