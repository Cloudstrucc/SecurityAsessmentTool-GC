// Evidence-strength weighted scoring (Phase 4). Combines the assessor's
// determination with the strength of the evidence (reliability × sufficiency),
// weighted by control impact — a defensible aggregation that supports, but never
// replaces, the assessor's professional judgement.
//
// Determination base (from audit_result): met/satisfied 1.0, partial 0.5, else 0.
// Evidence confidence 0..1 from reliability + sufficiency. Impact weight 1/2/3.
// A "satisfied" backed by weak evidence is capped so it can't score full marks.
const RELIABILITY = { 'assessor-tested': 1.0, 'third-party': 0.85, 'system-generated': 0.7, 'internal-doc': 0.5, 'self-attested': 0.3 };
const SUFFICIENCY = { 'comprehensive': 1.0, 'adequate': 0.75, 'partial': 0.45, 'none': 0.0 };
const WEIGHT = { 'high': 3, 'medium': 2, 'low': 1 };

function determinationBase(auditResult) {
  const v = String(auditResult || '').toLowerCase();
  if (['met', 'satisfied', 'pass', 'compliant'].includes(v)) return 1.0;
  if (['partially-met', 'partial', 'partially'].includes(v)) return 0.5;
  return 0.0;
}

function evidenceConfidence(c) {
  const rel = RELIABILITY[c.evidence_reliability] != null ? RELIABILITY[c.evidence_reliability] : 0.6;
  const suf = SUFFICIENCY[c.evidence_sufficiency] != null ? SUFFICIENCY[c.evidence_sufficiency] : 0.7;
  return rel * suf; // 0..1
}

function controlWeight(c) {
  return WEIGHT[c.control_weight] || WEIGHT[c.risk_level] || 2;
}

// Per-control score 0..1: determination, but a "satisfied" is gated by evidence
// confidence so thin evidence can't earn full marks.
function controlScore(c) {
  const base = determinationBase(c.audit_result);
  if (base <= 0) return 0;
  const conf = evidenceConfidence(c);
  // Cap: a satisfied control scores at most (0.6 + 0.4*conf) of its base when the
  // evidence is weak; full marks require strong evidence.
  return base * (0.6 + 0.4 * conf);
}

// Weighted roll-up across applicable controls → { score(0-100), weak[] }.
function weightedScore(controls) {
  const applicable = (controls || []).filter(c => c.is_applicable == null || Number(c.is_applicable) === 1);
  let num = 0, den = 0;
  const weak = [];
  applicable.forEach(c => {
    const w = controlWeight(c);
    num += controlScore(c) * w;
    den += w;
    if (determinationBase(c.audit_result) >= 1 && evidenceConfidence(c) < 0.4) weak.push(c.control_id);
  });
  const score = den > 0 ? +(num / den * 100).toFixed(1) : 0;
  return { score, weak };
}

/**
 * What each control is worth, and what it is currently earning, as a share of
 * the whole assessment — so the assessor can see why the headline number is
 * what it is.
 *
 *   maxPct   this control's weight as a share of the total weight (its ceiling)
 *   earnedPct what it contributes right now (controlScore × weight / total weight)
 *   ofOwnPct  how much of ITS OWN ceiling it has earned (0-100)
 *
 * Returns a Map keyed by control id. `totalWeight` is the denominator.
 */
function contributions(controls) {
  const applicable = (controls || []).filter(c => c.is_applicable == null || Number(c.is_applicable) === 1);
  const totalWeight = applicable.reduce((sum, c) => sum + controlWeight(c), 0);
  const map = new Map();
  applicable.forEach(c => {
    const w = controlWeight(c);
    const maxPct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
    const earnedPct = totalWeight > 0 ? (controlScore(c) * w / totalWeight) * 100 : 0;
    map.set(c.id, {
      weight: w,
      weightLabel: Object.keys(WEIGHT).find(k => WEIGHT[k] === w) || 'medium',
      maxPct: +maxPct.toFixed(2),
      earnedPct: +earnedPct.toFixed(2),
      ofOwnPct: maxPct > 0 ? +((earnedPct / maxPct) * 100).toFixed(0) : 0,
      confidence: +(evidenceConfidence(c) * 100).toFixed(0),
      base: determinationBase(c.audit_result)
    });
  });
  return { totalWeight, byControl: map };
}

module.exports = { weightedScore, contributions, controlScore, evidenceConfidence, controlWeight, determinationBase, RELIABILITY, SUFFICIENCY, WEIGHT };
