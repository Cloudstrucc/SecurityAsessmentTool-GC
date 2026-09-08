// Background worker for "suggest draft evidence in bulk". One job per assessment,
// tracked in evidence_suggest_jobs so the page can show progress that survives
// navigation and reloads. Runs in-process, yielding to the event loop between
// controls so it never blocks the server; only fills empty (or prior-AI-draft)
// controls and never overwrites real or Ready evidence.
const { run, get, all } = require('../models/database');
const ai = require('./ai-service');
const es = require('./evidence-suggest');
const access = require('./access');

const active = new Set(); // job ids with a live worker in THIS process

function tick() { return new Promise(r => setImmediate(r)); }

function currentJob(assessmentId) {
  return get('SELECT * FROM evidence_suggest_jobs WHERE assessment_id = ? ORDER BY id DESC LIMIT 1', [assessmentId]);
}

// A 'running' job with no live worker (e.g. the server restarted mid-run) is stale.
function reconcile(job) {
  if (job && (job.status === 'running' || job.status === 'queued') && !active.has(job.id)) {
    run("UPDATE evidence_suggest_jobs SET status = 'failed', message = 'interrupted', finished_at = CURRENT_TIMESTAMP WHERE id = ?", [job.id]);
    return get('SELECT * FROM evidence_suggest_jobs WHERE id = ?', [job.id]);
  }
  return job;
}

function statusFor(assessmentId) { return reconcile(currentJob(assessmentId)); }

function emptyControls(assessmentId) {
  return all(`SELECT * FROM assessment_controls
    WHERE assessment_id = ? AND is_applicable = 1
      AND (evidence_source IS NULL OR evidence_source = 'ai-suggested')
      AND (evidence_text IS NULL OR evidence_text = '' OR evidence_source = 'ai-suggested')
      AND (evidence_ready IS NULL OR evidence_ready = 0)`, [assessmentId]);
}

async function startJob({ assessmentId, startedBy, aiUser }) {
  const live = reconcile(currentJob(assessmentId));
  if (live && (live.status === 'queued' || live.status === 'running')) return live;

  const controls = emptyControls(assessmentId);
  const total = controls.length;
  const jobId = run('INSERT INTO evidence_suggest_jobs (assessment_id, status, total, done, errors, started_by) VALUES (?,?,?,?,?,?)',
    [assessmentId, 'running', total, 0, 0, startedBy || '']);
  active.add(jobId);

  const a = get(`SELECT a.id, p.name p_name, p.description p_desc, p.technologies, p.hosting_type,
      p.confidentiality_level, p.integrity_level, p.availability_level, p.security_profile
      FROM assessments a JOIN projects p ON p.id = a.project_id WHERE a.id = ?`, [assessmentId]);
  const ctx = a ? { name: a.p_name, description: a.p_desc, technologies: a.technologies, hosting_type: a.hosting_type,
    confidentiality_level: a.confidentiality_level, integrity_level: a.integrity_level,
    availability_level: a.availability_level, security_profile: a.security_profile } : {};

  (async () => {
    let done = 0, errors = 0;
    for (const c of controls) {
      const fresh = get('SELECT evidence_source, evidence_text, evidence_ready FROM assessment_controls WHERE id = ?', [c.id]);
      if (fresh && (fresh.evidence_source === 'user' || fresh.evidence_ready)) { done++; run('UPDATE evidence_suggest_jobs SET done = ?, errors = ? WHERE id = ?', [done, errors, jobId]); await tick(); continue; }
      const useAI = ai.isConfigured() && (!aiUser || access.canUseAI(aiUser, 'evidence-suggest').ok);
      let text = null;
      try {
        text = await ai.generateSuggestedEvidence(
          { control_id: c.control_id, title: c.title, description: c.description, tailored_description: c.tailored_description, evidence_guidance: c.evidence_guidance },
          ctx, { allowAI: useAI });
      } catch (e) { errors++; }
      if (text) {
        run(`UPDATE assessment_controls SET evidence_text = ?, evidence_html = ?, evidence_source = 'ai-suggested',
             evidence_status = 'pending', evidence_suggested_at = CURRENT_TIMESTAMP,
             evidence_edited_by = 'Aegis AI', evidence_edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [text, es.suggestToHtml(text), c.id]);
        if (useAI && aiUser) access.recordAiUse(aiUser, 'evidence-suggest');
      } else { errors++; }
      done++;
      run('UPDATE evidence_suggest_jobs SET done = ?, errors = ? WHERE id = ?', [done, errors, jobId]);
      await tick();
    }
    run("UPDATE evidence_suggest_jobs SET status = 'done', done = ?, errors = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", [done, errors, jobId]);
    active.delete(jobId);
  })().catch(err => {
    console.error('[suggest-worker] job failed:', err.message);
    run("UPDATE evidence_suggest_jobs SET status = 'failed', message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", [String(err.message || err), jobId]);
    active.delete(jobId);
  });

  return get('SELECT * FROM evidence_suggest_jobs WHERE id = ?', [jobId]);
}

module.exports = { startJob, statusFor };
