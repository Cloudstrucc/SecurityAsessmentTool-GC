/* Measure each sheet's laid-out height against the A4 box, headlessly. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROBE = `<script>window.addEventListener('load',()=>{
  const out=[...document.querySelectorAll('.sheet')].map((s,i)=>(i+1)+':'+Math.round(s.getBoundingClientRect().height)).join(' ');
  document.title='PROBE '+out;
});<\/script>`;
for (const f of process.argv.slice(2)) {
  const html = fs.readFileSync(f,'utf8').replace('</head>', PROBE + '</head>');
  const tmp = '/tmp/probe-'+f;
  fs.writeFileSync(tmp, html);
  const dom = execFileSync(CH, ['--headless','--disable-gpu','--virtual-time-budget=3000',
    '--window-size=1200,2000','--dump-dom', 'file://'+tmp], {maxBuffer:1e8}).toString();
  const m = dom.match(/<title>PROBE ([^<]*)<\/title>/);
  console.log(f.padEnd(40), m ? m[1] : '(no probe)');
}
