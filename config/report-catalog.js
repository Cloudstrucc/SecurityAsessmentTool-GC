/**
 * Report catalog (Phase A/B).
 *
 * The single registry of the built-in, deterministic report types — one "default
 * report" per entity set. NO AI is involved in producing any of these; they are a
 * straight render of the record's data (AI is reserved for the future Phase D
 * custom-report feature). This registry is what:
 *   - the report hub lists (so an admin can see every available report, and — once
 *     the report-designer ships — edit its design),
 *   - the report viewer uses to decide which format buttons to show,
 *   - the routes use to validate a requested type.
 *
 * `entity` groups reports by the record they pull from. `formats` are the
 * downloadable formats the engine actually produces for that type (CSV appears
 * only where a real, tabular CSV export already exists — it is never fabricated).
 */

// All renderer-backed formats. CSV is intentionally NOT a renderer format — it is
// served by the existing per-object routes and only listed where one exists.
const ALL = ['html', 'pdf', 'docx', 'md'];

const TYPES = [
  {
    id: 'intake',
    entity: 'intake',
    labelKey: 'rf.catIntake',
    descKey: 'rf.catIntakeDesc',
    formats: ALL,                    // a single record — no meaningful CSV
    csv: false
  },
  {
    id: 'assessment',
    entity: 'assessment',
    labelKey: 'rf.catAssessment',
    descKey: 'rf.catAssessmentDesc',
    formats: ALL,
    csv: true                        // existing controls.csv
  },
  {
    id: 'decision-package',
    entity: 'decisionPackage',
    labelKey: 'rf.catDecision',
    descKey: 'rf.catDecisionDesc',
    formats: ALL,
    csv: false
  },
  {
    id: 'poam',
    entity: 'decisionPackage',
    labelKey: 'rf.catPoam',
    descKey: 'rf.catPoamDesc',
    formats: ALL,
    csv: false
  },
  {
    id: 'project',
    entity: 'project',
    labelKey: 'rf.catProject',
    descKey: 'rf.catProjectDesc',
    formats: ALL,
    csv: true                        // existing controls.csv
  },
  {
    id: 'portfolio',
    entity: 'organization',
    labelKey: 'rf.catPortfolio',
    descKey: 'rf.catPortfolioDesc',
    formats: ALL,
    csv: false
  }
];

const BY_ID = Object.fromEntries(TYPES.map(t => [t.id, t]));

/** Entities in display order, each with its report types (for the catalog UI). */
const ENTITY_ORDER = ['intake', 'assessment', 'decisionPackage', 'project', 'organization'];
function byEntity() {
  return ENTITY_ORDER.map(entity => ({
    entity,
    entityLabelKey: 'rf.entity_' + entity,
    reports: TYPES.filter(t => t.entity === entity)
  })).filter(g => g.reports.length);
}

/** Format buttons a viewer should show for a type, including csv when it applies. */
function formatsFor(typeId) {
  const t = BY_ID[typeId];
  if (!t) return [];
  return t.csv ? [...t.formats, 'csv'] : [...t.formats];
}

function isType(typeId) { return !!BY_ID[typeId]; }

module.exports = { TYPES, BY_ID, ENTITY_ORDER, byEntity, formatsFor, isType };
