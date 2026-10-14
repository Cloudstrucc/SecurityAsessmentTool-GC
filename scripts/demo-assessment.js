#!/usr/bin/env node
/**
 * Build a demo assessment end to end, through the app's own HTTP endpoints.
 *
 *   node scripts/demo-assessment.js create  --project 5
 *   node scripts/demo-assessment.js draft   --assessment 7
 *   node scripts/demo-assessment.js fill    --assessment 7 --attachments
 *   node scripts/demo-assessment.js submit  --assessment 7
 *   node scripts/demo-assessment.js audit   --assessment 7
 *   node scripts/demo-assessment.js package --assessment 7 --issue
 *   node scripts/demo-assessment.js all     --project 5 --stop-at evidence
 *
 * Connection:
 *   --base-url https://vanguard-saa-dev.azurewebsites.net   (or $AEGIS_BASE_URL)
 *   --email / --password / --totp-secret                    (or $AEGIS_EMAIL / _PASSWORD / _TOTP)
 *
 * Why HTTP and not the database: the app keeps the whole SQLite file in memory
 * and rewrites it on save, so an external writer gets silently overwritten.
 */
const { clientFromArgs, parseArgs } = require('./lib/api-client');
const content = require('./lib/demo-content');

const STOPS = ['tailored', 'evidence', 'submitted', 'audited', 'iato', 'issued'];

function usage() {
  console.log(`
Usage: node scripts/demo-assessment.js <command> [options]

  create   --project <id> [--controls AC-2,AC-3,...] [--per-family [n]] [--inherit AC-1]
  draft    --assessment <id> [--ai]
  fill     --assessment <id> [--attachments] [--mark-ready]
  submit   --assessment <id>
  audit    --assessment <id> [--mix 2met,1partial,1notmet] [--decision iato|ato|denied]
  package  --assessment <id> [--issue]
  all      --project <id> [--stop-at ${STOPS.join('|')}]

Connection:
  --base-url <url>        or $AEGIS_BASE_URL
  --email <email>         or $AEGIS_EMAIL
  --password <password>   or $AEGIS_PASSWORD
  --totp-secret <secret>  or $AEGIS_TOTP   (only if the account has MFA on)
  --verbose               log every request

Defaults: ${content.DEFAULT_CONTROLS.join(', ')} — chosen for a public portal over a
Dataverse back end (account management, access enforcement / table permissions,
session termination, audit events, and external-user authentication).
`);
}

// ── small helpers ────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pull every `name="x" value="y"` out of a chunk of HTML. */
function hiddenInputs(html) {
  const out = [];
  const re = /<input[^>]*\bname="([^"]+)"[^>]*\bvalue="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) out.push([decodeHtml(m[1]), decodeHtml(m[2])]);
  return out;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&#x3D;/g, '=').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function die(msg) { console.error('\nError: ' + msg); process.exit(1); }

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 };

// ── create ───────────────────────────────────────────────────────────────────

/**
 * Read the New Assessment page and post it back with a chosen subset in scope.
 *
 * Reading the page rather than re-deriving the baseline keeps the script in step
 * with whatever the server offers, and lets us post every `offered_ids` back so
 * the controls we did not pick are recorded as tailored-out with a reason rather
 * than silently dropped.
 */
async function cmdCreate(api, args) {
  const projectId = args.project;
  if (!projectId || projectId === true) die('Missing --project <id>');

  // The page defaults to a TAILORED subset of the baseline, which can omit a
  // control we were asked for (AC-12 is P2 and drops out of some profiles).
  // ?all=1 renders the full baseline, so fall back to it when something is
  // missing rather than silently handing back fewer controls than requested.
  const wanted = (args.controls && args.controls !== true)
    ? String(args.controls).split(',').map(s => s.trim()).filter(Boolean)
    : (args['per-family'] ? [] : content.DEFAULT_CONTROLS);

  let page = await api.getText(`/admin/projects/${projectId}/assessments/new`);
  if (!/offered_ids/.test(page.text)) {
    die(`No tailoring form at /admin/projects/${projectId}/assessments/new — check the project id and that you are signed in as its assessor.`);
  }
  if (wanted.length) {
    const have = new Set((page.text.match(/name="offered_ids"\s+value="([^"]+)"/g) || [])
      .map(m => (m.match(/value="([^"]+)"/) || [])[1]));
    if (wanted.some(id => !have.has(id))) {
      const full = await api.getText(`/admin/projects/${projectId}/assessments/new?all=1`);
      if (/offered_ids/.test(full.text)) {
        page = full;
        console.error('  note: used the full baseline (?all=1) so every requested control is available');
      }
    }
  }
  const { text } = page;

  // Index every offered control and the metadata the form carries for it.
  const inputs = hiddenInputs(text);
  // The page also contains a JS template that builds inputs by concatenation
  // (value="'+id+'"), which the regex above happily matches. Keep only values
  // that look like a real control id.
  const isControlId = v => /^[A-Z]{2,3}-\d+[0-9()\-.]*$/.test(v);
  const offered = inputs.filter(([k, v]) => k === 'offered_ids' && isControlId(v)).map(([, v]) => v);
  if (!offered.length) die('The tailoring form offered no controls.');
  const meta = {};
  inputs.forEach(([k, v]) => {
    const m = k.match(/^(title|desc|control_guidance|priority|risk|family|family_name|framework|rationale)_(.+)$/);
    if (m) {
      meta[m[2]] = meta[m[2]] || {};
      meta[m[2]][m[1]] = v;
    }
  });

  // Choose what stays in scope.
  let chosen;
  if (args.controls && args.controls !== true) {
    chosen = String(args.controls).split(',').map(s => s.trim()).filter(Boolean);
    const missing = chosen.filter(id => !offered.includes(id));
    if (missing.length) die(`Not offered by this project's baseline: ${missing.join(', ')}`);
  } else if (args['per-family']) {
    const n = args['per-family'] === true ? 1 : parseInt(args['per-family'], 10) || 1;
    const byFamily = {};
    offered.forEach(id => {
      const fam = (meta[id] && meta[id].family) || id.split(/[.\-(]/)[0];
      (byFamily[fam] = byFamily[fam] || []).push(id);
    });
    chosen = [];
    Object.keys(byFamily).sort().forEach(fam => {
      const sorted = byFamily[fam].sort((a, b) => {
        const pa = PRIORITY_RANK[(meta[a] || {}).priority] ?? 9;
        const pb = PRIORITY_RANK[(meta[b] || {}).priority] ?? 9;
        return pa !== pb ? pa - pb : a.localeCompare(b);
      });
      chosen.push(...sorted.slice(0, n));
    });
  } else {
    chosen = content.DEFAULT_CONTROLS.filter(id => offered.includes(id));
    const missing = content.DEFAULT_CONTROLS.filter(id => !offered.includes(id));
    if (missing.length) {
      console.error(`  note: not in this project's baseline, skipped: ${missing.join(', ')}`);
    }
    if (!chosen.length) die('None of the default controls are in this project\'s baseline — pass --controls or --per-family.');
  }

  const inherit = (args.inherit && args.inherit !== true)
    ? String(args.inherit).split(',').map(s => s.trim()) : [];

  // Rebuild the form: every offered control, only the chosen ones selected.
  const form = [];
  offered.forEach(id => {
    form.push(['offered_ids', id]);
    const m = meta[id] || {};
    ['title', 'desc', 'control_guidance', 'priority', 'risk', 'family', 'family_name', 'framework', 'rationale']
      .forEach(f => { if (m[f] !== undefined) form.push([`${f}_${id}`, m[f]]); });
    if (!chosen.includes(id)) {
      form.push([`scoped_out_reason[${id}]`, 'Out of scope for this demonstration assessment.']);
    }
  });
  chosen.forEach(id => {
    form.push(['control_ids', id]);
    form.push([`applicable[${id}]`, '1']);
    if (inherit.includes(id)) {
      form.push([`inherited[${id}]`, '1']);
      form.push([`inherited_from[${id}]`, 'Departmental IT Security Policy (enterprise-wide)']);
    }
  });

  const res = await api.request('POST', `/admin/projects/${projectId}/assessments/new`, { form });
  const loc = res.headers.get('location') || '';
  const assessmentId = (loc.match(/\/admin\/assessments\/(\d+)/) || [])[1];
  if (!assessmentId) die(`Assessment was not created (HTTP ${res.status}, redirected to "${loc}").`);

  console.log(`Assessment #${assessmentId} created on project ${projectId}`);
  console.log(`  in scope (${chosen.length}): ${chosen.join(', ')}`);
  console.log(`  tailored out: ${offered.length - chosen.length} of ${offered.length} recommended`);
  if (inherit.length) console.log(`  inherited: ${inherit.join(', ')}`);
  return assessmentId;
}

// ── shared lookups ───────────────────────────────────────────────────────────

/** Resolve the evidence-flow invite code via the server, which repairs it if missing. */
async function inviteCode(api, assessmentId) {
  const hop = await api.request('GET', `/admin/assessments/${assessmentId}/evidence`);
  const m = (hop.headers.get('location') || '').match(/^\/respond\/([A-Z0-9]+)/);
  if (!m) die(`Could not resolve the evidence flow for assessment ${assessmentId}.`);
  return m[1];
}

/** The in-scope controls on the respond page: db id + control id. */
async function respondControls(api, code) {
  const { text } = await api.getText(`/respond/${code}`);
  const out = [];
  const re = /id="editor-(\d+)"/g;
  let m;
  while ((m = re.exec(text))) out.push({ dbId: m[1] });
  // Pair each editor with the control id printed just above it.
  const ids = (text.match(/<strong[^>]*>\s*([A-Z]{2}-[0-9()\-.]+)\s*<\/strong>/g) || [])
    .map(s => (s.match(/([A-Z]{2}-[0-9()\-.]+)/) || [])[1]);
  out.forEach((c, i) => { c.controlId = ids[i] || null; });
  if (!out.length) die('No editable controls on the evidence flow — is the assessment still a draft, or already submitted?');
  return out;
}

/**
 * Make sure the evidence flow is actually open.
 *
 * send-invite only activates a draft when it has somebody to send to, and it
 * takes that from the assignee or the project owner's email. A project created
 * without an owner email therefore stays a draft and the flow renders read-only.
 * So: assign it to the signed-in assessor first, then activate.
 */
async function ensureActivated(api, assessmentId) {
  const { text } = await api.getText(`/admin/assessments/${assessmentId}`);
  const isDraft = /Assessment Package\s*—?\s*<[^>]*>\s*Draft/i.test(text) || /\bDraft\b/.test(
    (text.match(/Assessment Package[\s\S]{0,200}/) || [''])[0]);

  if (isDraft) {
    // Pick ourselves out of the assignable-user list so the assessment has an
    // owner and a recipient. Falls back to the first option if the email is not
    // rendered next to it.
    const select = (text.match(/name="assignee_user_id"[\s\S]*?<\/select>/) || [''])[0];
    const options = [...select.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)]
      .map(m => ({ id: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() }));
    const me = options.find(o => api.email && o.label.toLowerCase().includes(String(api.email).toLowerCase()))
      || options[0];
    if (me) {
      await api.request('POST', `/admin/assessments/${assessmentId}/assign`, {
        form: { assignment_mode: 'existing', assignee_user_id: me.id, assignee_role: 'assessor' }
      });
    }
  }

  await api.request('POST', `/admin/assessments/${assessmentId}/send-invite`);
}

// ── draft ────────────────────────────────────────────────────────────────────

async function cmdDraft(api, args) {
  const id = args.assessment;
  if (!id || id === true) die('Missing --assessment <id>');
  await ensureActivated(api, id);
  const code = await inviteCode(api, id);
  const controls = await respondControls(api, code);

  if (args.ai) {
    const { data } = await api.postJson(`/respond/${code}/suggest-bulk`, {});
    console.log(`AI drafting started for assessment ${id} (${controls.length} controls)…`);
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await api.getText(`/respond/${code}/suggest-status`);
      if (/"done"\s*:\s*true|complete/i.test(s.text)) break;
    }
    console.log('AI drafting finished (or timed out — check the flow).');
    return id;
  }

  let n = 0;
  for (const c of controls) {
    const html = content.draftFor(c.controlId || '');
    const { data } = await api.postJson(`/respond/${code}/save/${c.dbId}`, {
      evidence_text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      evidence_html: html
    });
    if (data && data.success === false) die(`Could not save a draft: ${data.message || 'refused'}`);
    n++;
  }
  console.log(`Drafted ${n} control(s) on assessment ${id} (canned, no AI).`);
  return id;
}

// ── fill ─────────────────────────────────────────────────────────────────────

/** Tiny but valid files, generated so no binaries live in the repo. */
function sampleFile(kind, name) {
  if (kind === 'pdf') {
    const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
      + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    return { buffer: Buffer.from(body, 'latin1'), name: `${name}.pdf`, type: 'application/pdf' };
  }
  if (kind === 'png') {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    return { buffer: Buffer.from(b64, 'base64'), name: `${name}.png`, type: 'image/png' };
  }
  return {
    buffer: Buffer.from('field,value\nexported_at,' + new Date().toISOString() + '\nsource,demo seed\n', 'utf8'),
    name: `${name}.csv`, type: 'text/csv'
  };
}

async function uploadSample(api, code, dbId, kind, name) {
  const f = sampleFile(kind, name);
  const fd = new FormData();
  fd.append('file', new Blob([f.buffer], { type: f.type }), f.name);
  const res = await api.request('POST', `/respond/${code}/upload/${dbId}`, { body: fd });
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  return (data && data.success) ? f.name : null;
}

async function cmdFill(api, args) {
  const id = args.assessment;
  if (!id || id === true) die('Missing --assessment <id>');
  const code = await inviteCode(api, id);
  const { text } = await api.getText(`/respond/${code}`);
  const controls = await respondControls(api, code);

  const kinds = ['pdf', 'csv', 'png'];
  let filled = 0, uploaded = 0;

  for (const c of controls) {
    // Re-read this control's current draft so we fill whatever is actually there,
    // whether it came from the AI or from `draft --no-ai`.
    const block = text.split(`id="editor-${c.dbId}"`)[1] || '';
    const current = block.slice(0, block.indexOf('</div>'));
    const source = /\[\[VALUE:|\[\[ATTACH:/.test(current) ? current : content.draftFor(c.controlId || '');

    const names = [];
    if (args.attachments) {
      const want = content.countMarkers(source).attachments;
      for (let i = 0; i < want; i++) {
        const base = `${(c.controlId || 'control').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-evidence-${i + 1}`;
        const name = await uploadSample(api, code, c.dbId, kinds[i % kinds.length], base);
        if (name) { names.push(name); uploaded++; }
      }
    }

    const html = content.fillMarkers(source, { attachmentNames: names });
    const { data } = await api.postJson(`/respond/${code}/save/${c.dbId}`, {
      evidence_text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      evidence_html: html
    });
    if (data && data.success === false) die(`Could not save evidence: ${data.message || 'refused'}`);
    filled++;

    if (args['mark-ready']) await api.postJson(`/respond/${code}/ready/${c.dbId}`, {});
  }

  console.log(`Filled ${filled} control(s) on assessment ${id}`
    + (args.attachments ? `, uploaded ${uploaded} attachment(s)` : '')
    + (args['mark-ready'] ? ', marked ready' : '') + '.');
  return id;
}

// ── submit / audit / package ─────────────────────────────────────────────────

async function cmdSubmit(api, args) {
  const id = args.assessment;
  if (!id || id === true) die('Missing --assessment <id>');
  const code = await inviteCode(api, id);
  const res = await api.request('POST', `/respond/${code}/submit`, { form: {} });
  if (res.status >= 400) die(`Submit failed (HTTP ${res.status}).`);
  console.log(`Evidence submitted for assessment ${id}.`);
  return id;
}

function parseMix(mix, total) {
  const plan = [];
  if (mix && mix !== true) {
    String(mix).split(',').forEach(part => {
      const m = part.trim().match(/^(\d+)(met|partial|notmet)$/i);
      if (!m) die(`Could not read --mix "${mix}". Use e.g. 2met,1partial,1notmet`);
      const label = m[2].toLowerCase() === 'notmet' ? 'not-met' : (m[2].toLowerCase() === 'partial' ? 'partially-met' : 'met');
      for (let i = 0; i < Number(m[1]); i++) plan.push(label);
    });
  }
  // Pad or trim to the control count, keeping at least one finding so an iATO
  // is the honest outcome rather than something the engine would refuse.
  while (plan.length < total) plan.push(plan.length === total - 1 ? 'not-met' : 'met');
  return plan.slice(0, total);
}

async function cmdAudit(api, args) {
  const id = args.assessment;
  if (!id || id === true) die('Missing --assessment <id>');

  await api.request('POST', `/admin/assessments/${id}/start-audit`, { form: {} });

  const { text } = await api.getText(`/admin/assessments/${id}`);
  const rows = [...text.matchAll(/auditControl\((\d+),\s*'(\d+)'/g)].map(m => m[1]);
  const unique = [...new Set(rows)];
  if (!unique.length) die('No controls to score — is the assessment in the audit stage?');

  const plan = parseMix(args.mix, unique.length);
  const notes = {
    'met': 'Evidence verified against the configuration export; control is operating as described.',
    'partially-met': 'Control is largely in place, but coverage gaps remain on a subset of the estate.',
    'not-met': 'Required configuration is not in place; remediation needed before full authorization.'
  };
  for (let i = 0; i < unique.length; i++) {
    await api.postJson(`/admin/assessments/${id}/audit-control`, {
      controlId: unique[i], result: plan[i], comments: notes[plan[i]]
    }).catch(() => {});
    await api.request('POST', `/admin/assessments/${id}/audit-control/${unique[i]}`, {
      form: { result: plan[i], comments: notes[plan[i]] }
    }).catch(() => {});
  }

  const decision = (args.decision && args.decision !== true) ? args.decision : 'iato';
  const expiry = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const res = await api.request('POST', `/admin/assessments/${id}/complete-audit`, {
    form: {
      overrideResult: decision,
      atoExpiryDate: expiry,
      riskAcceptance: 'Residual risk is accepted on an interim basis for 90 days, pending closure of the open findings. '
        + 'Compensating measures: phishing-resistant MFA for internal users, table permissions scoped to the signed-in contact, '
        + 'and audit forwarding to the central workspace.'
    }
  });
  if (res.status >= 400) die(`Completing the audit failed (HTTP ${res.status}).`);
  console.log(`Audit completed on assessment ${id}: ${plan.join(', ')} → ${decision.toUpperCase()}, expires ${expiry}.`);
  return id;
}

async function cmdPackage(api, args) {
  const id = args.assessment;
  if (!id || id === true) die('Missing --assessment <id>');

  const { text } = await api.getText(`/admin/assessments/${id}`);
  const projectId = (text.match(/\/admin\/projects\/(\d+)/) || [])[1];
  if (!projectId) die('Could not find the project behind that assessment.');

  const create = await api.request('POST', `/admin/projects/${projectId}/decision-packages`, {
    form: { assessment_id: id, decision_type: 'iato' }
  });
  const dpId = ((create.headers.get('location') || '').match(/\/admin\/decision-packages\/(\d+)/) || [])[1];
  if (!dpId) die(`Decision package was not created (HTTP ${create.status}).`);

  await api.request('POST', `/admin/decision-packages/${dpId}/poam/generate`, { form: {} });
  console.log(`Decision package #${dpId} created with conditions generated from the findings.`);

  if (args.issue) {
    for (const state of ['in-review', 'recommended', 'decided', 'issued']) {
      const r = await api.request('POST', `/admin/decision-packages/${dpId}/transition`, { form: { to: state } });
      if (r.status >= 400) die(`Transition to "${state}" failed (HTTP ${r.status}).`);
    }
    console.log(`Decision package #${dpId} issued.`);
  }
  return dpId;
}

// ── all ──────────────────────────────────────────────────────────────────────

async function cmdAll(api, args) {
  const stop = (args['stop-at'] && args['stop-at'] !== true) ? String(args['stop-at']) : 'issued';
  if (!STOPS.includes(stop)) die(`--stop-at must be one of: ${STOPS.join(', ')}`);
  const at = STOPS.indexOf(stop);

  const assessmentId = await cmdCreate(api, args);
  if (at < STOPS.indexOf('evidence')) return;

  await cmdDraft(api, { ...args, assessment: assessmentId });
  await cmdFill(api, { ...args, assessment: assessmentId, attachments: args.attachments !== false, 'mark-ready': true });
  if (at < STOPS.indexOf('submitted')) return;

  await cmdSubmit(api, { ...args, assessment: assessmentId });
  if (at < STOPS.indexOf('audited')) return;

  await cmdAudit(api, { ...args, assessment: assessmentId });
  if (at < STOPS.indexOf('iato')) return;

  await cmdPackage(api, { ...args, assessment: assessmentId, issue: stop === 'issued' });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) { usage(); return; }

  const api = clientFromArgs(args);
  await api.health().catch(() => die(`Could not reach ${api.baseUrl} — check --base-url.`));
  await api.loginAdmin();

  const commands = {
    create: cmdCreate, draft: cmdDraft, fill: cmdFill,
    submit: cmdSubmit, audit: cmdAudit, package: cmdPackage, all: cmdAll
  };
  if (!commands[command]) { usage(); die(`Unknown command: ${command}`); }
  await commands[command](api, args);
}

main().catch(err => { console.error('\nError: ' + (err && err.message ? err.message : err)); process.exit(1); });
