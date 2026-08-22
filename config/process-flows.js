/**
 * Business process flows (the chevron UI).
 *
 * A project's position in the lifecycle is DERIVED from its related records
 * rather than stored in a column, so it can never drift out of sync with the
 * intake / assessment / decision package it describes. This module is the single
 * definition of stages, their steps, and what "done" means for each; the chevron
 * partial and any "what's next" prompt both read from here.
 *
 * Every label is an i18n key (pf.*) — see locales/*.json. Nothing here returns
 * user-facing English.
 */

const STATE = { COMPLETE: 'complete', CURRENT: 'current', UPCOMING: 'upcoming', BLOCKED: 'blocked' };

// Assessment lifecycle, least → most advanced. Used to pick the active assessment
// and to decide how far the assessment stage has progressed.
const ASSESSMENT_ORDER = [
  'draft', 'in-progress', 'tailoring', 'evidence-gathering',
  'submitted', 'under-review', 'audit', 'completed'
];

const INTAKE_ORDER = ['draft', 'submitted', 'in-review', 'returned', 'accepted', 'approved'];

function rank(order, status) {
  const i = order.indexOf(String(status || '').toLowerCase());
  return i === -1 ? 0 : i;
}

function newest(rows) {
  if (!rows || !rows.length) return null;
  return rows.slice().sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.id - a.id))[0];
}

/**
 * A project has at most ONE active record of each kind. Where several exist
 * (e.g. a re-submitted intake), the most recent is the active one.
 */
function activeIntake(intakes) { return newest(intakes); }
function activeDecision(decisions) { return newest(decisions); }

/** Most-advanced assessment wins; ties break to the most recent. */
function activeAssessment(assessments) {
  if (!assessments || !assessments.length) return null;
  return assessments.slice().sort((a, b) => {
    const d = rank(ASSESSMENT_ORDER, b.status) - rank(ASSESSMENT_ORDER, a.status);
    if (d !== 0) return d;
    return String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.id - a.id);
  })[0];
}

function step(labelKey, done, href) { return { labelKey, done: !!done, href: href || null }; }

/** Roll a stage's steps up into a stage state. */
function stateFor(steps, previousComplete) {
  const done = steps.filter(s => s.done).length;
  if (steps.length && done === steps.length) return STATE.COMPLETE;
  if (!previousComplete) return STATE.UPCOMING;
  return STATE.CURRENT;
}

/** The master project flow: Intake → Assessment → Decision Package → Closed. */
function projectFlow({ project, intakes = [], assessments = [], decisions = [] } = {}) {
  const intake = activeIntake(intakes);
  const assessment = activeAssessment(assessments);
  const decision = activeDecision(decisions);

  const intakeStatus = String((intake && intake.status) || '').toLowerCase();
  const intakeAccepted = ['accepted', 'approved'].includes(intakeStatus);
  const aRank = assessment ? rank(ASSESSMENT_ORDER, assessment.status) : -1;
  const decisionStatus = String((decision && (decision.state || decision.authorization_status)) || '').toLowerCase();
  const decisionIssued = ['issued', 'approved', 'granted'].includes(decisionStatus);

  const intakeHref = intake ? `/admin/intakes/${intake.id}` : null;
  const assessmentHref = assessment ? `/admin/assessments/${assessment.id}` : null;
  const projectHref = project ? `/admin/projects/${project.id}` : null;

  const stages = [];

  // ① Intake
  const intakeSteps = [
    step('pf.stepProjectCreated', !!project, projectHref),
    step('pf.stepIntakeSubmitted', !!intake && intakeStatus !== 'draft', intakeHref),
    step('pf.stepIntakeReviewed', !!intake && rank(INTAKE_ORDER, intakeStatus) >= rank(INTAKE_ORDER, 'in-review'), intakeHref),
    step('pf.stepIntakeAccepted', intakeAccepted, intakeHref)
  ];
  stages.push({
    key: 'intake', labelKey: 'pf.stageIntake', icon: 'bi-inbox',
    state: stateFor(intakeSteps, true), steps: intakeSteps,
    href: intakeHref, recordLabel: intake ? intake.ref_code : null
  });

  // ② Security assessment
  const assessmentSteps = [
    step('pf.stepAssessmentCreated', !!assessment, assessmentHref),
    step('pf.stepControlsTailored', aRank >= rank(ASSESSMENT_ORDER, 'evidence-gathering'), assessmentHref),
    step('pf.stepEvidenceGathered', aRank >= rank(ASSESSMENT_ORDER, 'submitted'), assessmentHref),
    step('pf.stepAssessmentSubmitted', aRank >= rank(ASSESSMENT_ORDER, 'audit'), assessmentHref),
    step('pf.stepAuditCompleted', aRank >= rank(ASSESSMENT_ORDER, 'completed'), assessmentHref)
  ];
  stages.push({
    key: 'assessment', labelKey: 'pf.stageAssessment', icon: 'bi-clipboard-check',
    state: stateFor(assessmentSteps, intakeAccepted), steps: assessmentSteps,
    href: assessmentHref, recordLabel: assessment ? `#${assessment.id}` : null
  });

  // ③ Decision package
  const assessmentComplete = aRank >= rank(ASSESSMENT_ORDER, 'completed');
  const decisionSteps = [
    step('pf.stepDecisionCreated', !!decision, projectHref),
    step('pf.stepDecisionReview', !!decision && decisionStatus !== 'draft', projectHref),
    step('pf.stepDecisionRecorded', !!decision && (decisionIssued || ['decided', 'recommended', 'denied'].includes(decisionStatus)), projectHref),
    step('pf.stepDecisionIssued', decisionIssued, projectHref)
  ];
  stages.push({
    key: 'decision', labelKey: 'pf.stageDecision', icon: 'bi-award',
    state: stateFor(decisionSteps, assessmentComplete), steps: decisionSteps,
    href: projectHref, recordLabel: decision ? (decision.title || null) : null
  });

  // ④ Authorized / closed
  const closedSteps = [
    step('pf.stepAuthorizationIssued', decisionIssued, projectHref),
    step('pf.stepProjectClosed', !!(project && project.archived_at), projectHref)
  ];
  stages.push({
    key: 'closed', labelKey: 'pf.stageClosed', icon: 'bi-check2-circle',
    state: stateFor(closedSteps, decisionIssued), steps: closedSteps,
    href: projectHref, recordLabel: null
  });

  return decorate(stages);
}

/** An intake record's own flow. */
function intakeFlow(intake) {
  const s = String((intake && intake.status) || '').toLowerCase();
  const r = rank(INTAKE_ORDER, s);
  const href = intake ? `/admin/intakes/${intake.id}` : null;
  const mk = (key, labelKey, done, steps) => ({
    key, labelKey, state: done ? STATE.COMPLETE : STATE.UPCOMING, steps, href, icon: null
  });
  const stages = [
    mk('submitted', 'pf.iStageSubmitted', r >= rank(INTAKE_ORDER, 'submitted'),
      [step('pf.stepIntakeSubmitted', r >= rank(INTAKE_ORDER, 'submitted'), href)]),
    mk('review', 'pf.iStageReview', r >= rank(INTAKE_ORDER, 'in-review'),
      [step('pf.stepIntakeReviewed', r >= rank(INTAKE_ORDER, 'in-review'), href)]),
    mk('accepted', 'pf.iStageAccepted', ['accepted', 'approved'].includes(s),
      [step('pf.stepIntakeAccepted', ['accepted', 'approved'].includes(s), href)])
  ];
  return decorate(markCurrent(stages));
}

/** An assessment record's own flow. */
function assessmentFlow(assessment) {
  const r = assessment ? rank(ASSESSMENT_ORDER, assessment.status) : -1;
  const href = assessment ? `/admin/assessments/${assessment.id}` : null;
  const at = name => r >= rank(ASSESSMENT_ORDER, name);
  const mk = (key, labelKey, done, stepKey) => ({
    key, labelKey, state: done ? STATE.COMPLETE : STATE.UPCOMING,
    steps: [step(stepKey, done, href)], href, icon: null
  });
  const stages = [
    mk('draft', 'pf.aStageDraft', !!assessment, 'pf.stepAssessmentCreated'),
    mk('tailoring', 'pf.aStageTailoring', at('evidence-gathering'), 'pf.stepControlsTailored'),
    mk('evidence', 'pf.aStageEvidence', at('submitted'), 'pf.stepEvidenceGathered'),
    mk('audit', 'pf.aStageAudit', at('audit'), 'pf.stepAssessmentSubmitted'),
    mk('completed', 'pf.aStageCompleted', at('completed'), 'pf.stepAuditCompleted')
  ];
  return decorate(markCurrent(stages));
}

/** A decision package's own flow. */
function decisionFlow(dp) {
  const state = String((dp && dp.state) || 'draft').toLowerCase();
  const href = dp ? `/admin/decision-packages/${dp.id}` : null;
  const order = ['draft', 'in-review', 'recommended', 'decided', 'issued'];
  const r = order.indexOf(state) === -1 ? 0 : order.indexOf(state);
  const terminal = ['denied', 'revoked', 'expired'].includes(state);
  const at = i => terminal ? true : r >= i;
  const mk = (key, labelKey, done, stepKey) => ({
    key, labelKey, state: done ? STATE.COMPLETE : STATE.UPCOMING,
    steps: [step(stepKey, done, href)], href, icon: null
  });
  const stages = [
    mk('draft', 'pf.dStageDraft', !!dp, 'pf.stepDecisionCreated'),
    mk('review', 'pf.dStageReview', at(1), 'pf.stepDecisionReview'),
    mk('recommended', 'pf.dStageRecommended', at(2), 'pf.stepDecisionRecommended'),
    mk('decided', 'pf.dStageDecided', at(3), 'pf.stepDecisionRecorded'),
    mk('issued', 'pf.dStageIssued', at(4), 'pf.stepDecisionIssued')
  ];
  return decorate(markCurrent(stages));
}

/** For record-level flows: the first incomplete stage is the current one. */
function markCurrent(stages) {
  const i = stages.findIndex(s => s.state !== STATE.COMPLETE);
  if (i >= 0) stages[i].state = STATE.CURRENT;
  return stages;
}

/** Add positional metadata the view needs (index, totals, current flag). */
function decorate(stages) {
  const total = stages.length;
  const currentIndex = stages.findIndex(s => s.state === STATE.CURRENT);
  stages.forEach((s, i) => {
    s.index = i + 1;
    s.total = total;
    s.isCurrent = s.state === STATE.CURRENT;
    s.isComplete = s.state === STATE.COMPLETE;
    s.doneCount = s.steps.filter(x => x.done).length;
    s.stepCount = s.steps.length;
  });
  return {
    stages,
    total,
    currentIndex: currentIndex === -1 ? total : currentIndex + 1,
    current: currentIndex === -1 ? null : stages[currentIndex],
    // The first not-yet-done step of the current stage — i.e. "what to do next".
    nextStep: currentIndex === -1 ? null : (stages[currentIndex].steps.find(s => !s.done) || null)
  };
}

module.exports = {
  STATE, ASSESSMENT_ORDER, INTAKE_ORDER,
  activeIntake, activeAssessment, activeDecision,
  projectFlow, intakeFlow, assessmentFlow, decisionFlow
};
