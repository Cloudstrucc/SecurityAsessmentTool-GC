# How audit scoring works

This document describes exactly how Aegis SA turns an assessor's per-control
determinations into a percentage, and how that percentage relates to the
authorization decision.

> **Read this first.** There are **two different scores** in the audit step, computed
> by different formulas. They answer different questions and they will often
> disagree. See [The two scores](#the-two-scores).

---

## The two scores

| | Weighted review score | Authorization score |
|---|---|---|
| **Where you see it** | The big percentage at the top of the audit screen | Stored on the assessment as `overall_score`; drives ATO / iATO / denied |
| **Code** | `config/scoring.js` → `weightedScore()` | `routes/admin.js` → `POST /assessments/:id/complete-audit` |
| **Uses impact weight (High/Medium/Low)?** | **Yes** (×3 / ×2 / ×1) | **No** |
| **Uses evidence reliability & sufficiency?** | **Yes** | **No** |
| **Formula** | `Σ(controlScore × weight) ÷ Σ(weight) × 100` | `(met + 0.5 × partiallyMet) ÷ total × 100` |

Both only ever consider controls where `is_applicable = 1`. Controls tailored out
of scope are on the record but are not scored.

**Why this matters.** An assessment can show 84% at the top of the audit screen and
still record a different number as its authorization score, because the second
formula ignores the impact weights and the evidence quality you set. If the two
should be the same calculation, that is a product decision — it changes which
systems get an ATO — and it is tracked as open, not silently applied.

---

## Weighted review score (the number at the top of the audit screen)

```
score = Σ(controlScore(c) × weight(c)) ÷ Σ(weight(c)) × 100
```

### Step 1 — Determination

Your Met / Partially met / Not met call sets the control's base value.

| Determination | Base |
|---|---|
| Met (also: satisfied, pass, compliant) | 1.0 |
| Partially met | 0.5 |
| Not met, or not yet assessed | 0.0 |

A control with base 0 scores 0 regardless of its evidence — weak evidence cannot
drag a Not met below zero, and good evidence cannot lift it.

### Step 2 — Evidence confidence

Reliability and sufficiency combine into a confidence value between 0 and 1:

```
confidence = reliability × sufficiency
```

| Reliability | Value | | Sufficiency | Value |
|---|---|---|---|---|
| Assessor-tested | 1.00 | | Comprehensive | 1.00 |
| Third-party attestation | 0.85 | | Adequate | 0.75 |
| System-generated | 0.70 | | Partial | 0.45 |
| Internal document | 0.50 | | None | 0.00 |
| Self-attested | 0.30 | | | |

If either field is left blank, the defaults are reliability 0.6 and
sufficiency 0.7 (confidence 0.42).

Confidence then scales the base value, with a floor:

```
controlScore = base × (0.6 + 0.4 × confidence)
```

So a control marked **Met**:

| Evidence | confidence | controlScore |
|---|---|---|
| Assessor-tested + Comprehensive | 1.00 | 1.00 |
| Third-party + Adequate | 0.64 | 0.86 |
| Internal doc + Partial | 0.23 | 0.69 |
| Self-attested + Partial | 0.14 | 0.65 |
| *(both fields blank)* | 0.42 | 0.77 |

The 0.6 floor is deliberate: your professional judgement is never overridden by
the evidence metadata, only moderated by it. A Met control always keeps at least
60% of its value.

Any control you marked **Met** whose confidence is below 0.40 is flagged as
**weak evidence** in the header — a prompt to revisit, not a penalty beyond the
score it already produces.

### Step 3 — Impact weight

Each control's score is multiplied by its weight, and the sum is divided by the
total weight of all in-scope controls.

| Weight | Multiplier |
|---|---|
| High | ×3 |
| Medium | ×2 |
| Low | ×1 |

If you have not set a weight on a control, the control's `risk_level` is used
instead; failing that, it defaults to Medium (×2).

### What each control is worth

Because the denominator is the *total weight*, a control's maximum possible
contribution is its share of that total:

```
maxPct    = weight ÷ Σ(weight) × 100
earnedPct = controlScore × weight ÷ Σ(weight) × 100
```

The audit screen shows both on every control, along with how much of its own
ceiling it has earned.

**Worked example.** Five in-scope controls — two High, two Medium, one Low:

```
Σ(weight) = 3 + 3 + 2 + 2 + 1 = 11
```

| Control | Weight | Max share | Determination | Evidence (confidence) | controlScore | Earned | Of own ceiling |
|---|---|---|---|---|---|---|---|
| AC-17 | High ×3 | 27.27% | Met | assessor-tested + comprehensive (1.00) | 1.000 | 27.27% | 100% |
| SC-7 | High ×3 | 27.27% | Partially met | internal-doc + partial (0.23) | 0.345 | 9.41% | 35% |
| AU-2 | Medium ×2 | 18.18% | Met | system-generated + adequate (0.53) | 0.810 | 14.73% | 81% |
| IA-5 | Medium ×2 | 18.18% | Met | self-attested + partial (0.14) | 0.654 | 11.89% | 65% |
| PE-8 | Low ×1 | 9.09% | Not met | — (0.42, unused) | 0.000 | 0.00% | 0% |

```
score = 27.27 + 9.41 + 14.73 + 11.89 + 0.00 = 63.3%
```

Only **IA-5** is flagged as weak evidence: it is the one control marked *Met*
with confidence below 0.40. SC-7's confidence is lower still (0.23) but its
determination is Partially met, so the flag — which exists to question full
credit — does not apply.

Note that PE-8 being Not met costs only 9.09 points because it is Low impact,
while SC-7 — one control, but High impact and thinly evidenced — gives up
17.86 of its 27.27-point ceiling. That is the weighting doing its job.

*(These figures are generated from `config/scoring.js` itself, not computed by
hand.)*

---

## Authorization score and the decision

When you complete the audit, a **separate** calculation runs:

```
overall_score = round((met + 0.5 × partiallyMet) ÷ total × 100)
```

Every in-scope control counts equally here. Impact weight, reliability and
sufficiency are **not** part of this number.

The decision is then:

| Condition | Result |
|---|---|
| Every control met | **ATO** |
| Score ≥ 80 **and** no High-risk control is Not met | **ATO** |
| Score ≥ 60 | **iATO** |
| Otherwise | **Denied** |

- "High-risk" means the control's `risk_level` is high, or `computeRiskLevel()`
  derives high from its family and priority.
- An assessor can override the computed result; the override is recorded as the
  decision and the score is still stored.
- An **iATO** expires after 90 days unless a date is supplied, and automatically
  generates POA&M items for every Not met and Partially met control, with
  remediation deadlines of 30 / 60 / 90 days for high / medium / low risk.

---

## Where this lives in the code

| Concern | File |
|---|---|
| Weighted model, per-control contributions | `config/scoring.js` |
| Authorization score, thresholds, POA&M generation | `routes/admin.js`, `POST /assessments/:id/complete-audit` |
| Header score, `?` explainer, per-control share | `views/admin/assessment-detail.hbs` |
| Explainer wording (all 8 locales) | `scripts/add-scoring-locales.js`, `sc.*` keys |

`config/scoring.js` exports `weightedScore(controls)` and
`contributions(controls)`; the latter returns `{ totalWeight, byControl }` where
each entry carries `weight`, `maxPct`, `earnedPct`, `ofOwnPct` and `confidence`.

---

## Open question

The authorization decision currently ignores the impact weights and evidence
quality that the audit screen asks the assessor to set, and that the headline
percentage is built from. Unifying them — having `complete-audit` score through
`weightedScore()` — would make the two figures agree and make the weight
dropdown meaningful to the outcome. It would also change which systems qualify
for an ATO, so it needs an explicit decision before being applied.
