/**
 * Report label keys. Every human-readable word the renderers emit (headings,
 * column titles, status words, footer boilerplate) goes through `t` so a report
 * downloaded in any of the 8 supported languages is fully localized. Report
 * CONTENT (control titles, evidence, names) is data and is passed through as-is.
 *
 * `makeT(req)` returns a translator. When a real i18next `req.t` is present it is
 * used; otherwise we fall back to the English default baked in here so the
 * renderers still work in tests and scripts with no i18n runtime.
 */
const EN = {
  // Full project report — the detail sections appended to the rollup.
  'rf.authorizationDecision': 'Authorization decision',
  'rf.controlsAndEvidence': 'Controls and evidence',
  'rf.evidenceAttachments': 'Evidence attachments',
  'rf.externalReference': 'external reference',
  // Contributors — who provided what.
  'rf.contributors': 'Contributors',
  'rf.contributorsLede': '{{people}} people made {{actions}} recorded contributions to this project.',
  'rf.catContributors': 'Project contributors',
  'rf.catContributorsDesc': 'Every recorded contribution to this project and its records, and who made it.',
  'rf.person': 'Person', 'rf.role': 'Role', 'rf.actions': 'Actions', 'rf.contributed': 'Contributed',
  'rf.firstActivity': 'First activity', 'rf.lastActivity': 'Last activity', 'rf.people': 'People',
  'rf.activityLog': 'Activity log', 'rf.when': 'When', 'rf.recordType': 'Record type',
  'rf.record': 'Record', 'rf.action': 'Action', 'rf.detail': 'Detail',
  'rf.actor_assessor': 'Assessor', 'rf.actor_provider': 'Provider',
  'rf.actor_ai': 'AI', 'rf.actor_system': 'System',
  'rf.ent_project': 'Project', 'rf.ent_intake': 'Intake', 'rf.ent_assessment': 'Assessment',
  'rf.ent_control': 'Control', 'rf.ent_slot': 'Evidence slot',
  'rf.ent_attachment': 'Attachment', 'rf.ent_decision': 'Decision package',
  'rf.field': 'Field',
  'rf.value': 'Value',
  'rf.report': 'report',
  'rf.generated': 'Generated',
  'rf.generatedBy': 'by',
  'rf.language': 'Language',
  'rf.reportId': 'Report ID',
  'rf.page': 'Page',
  'rf.of': 'of',
  'rf.pinnedNote': 'Rendered from a pinned snapshot — this report reproduces byte for byte.',
  'rf.liveNote': 'Reflects current state, not a pinned snapshot — a management view, not an authorization artefact.',
  'rf.contents': 'Contents',
  // sections
  'rf.systemProfile': 'System profile',
  'rf.assessmentSummary': 'Assessment summary',
  'rf.postureByFamily': 'Control posture by family',
  'rf.controlDetail': 'Control detail',
  'rf.findings': 'Findings requiring action',
  'rf.tailoringRegister': 'Tailoring register',
  'rf.tailoringRationale': 'Rationale',
  'rf.scopedOut': 'Tailored out of scope',
  'rf.exclusionReason': 'Reason for exclusion',
  'rf.controlsOffered': 'Controls recommended',
  'rf.controlsInScope': 'Controls in scope',
  'rf.signatures': 'Authorization signatures',
  'rf.versionHistory': 'Version history',
  'rf.decision': 'Decision',
  'rf.authorizationChain': 'Authorization chain',
  'rf.assessmentBasis': 'Assessment basis',
  'rf.conditions': 'Conditions',
  'rf.poamRegister': 'Plan of action & milestones',
  'rf.deadlineHistory': 'Deadline change history',
  'rf.reviewActivity': 'Review activity',
  'rf.assessments': 'Assessments',
  'rf.decisionPackages': 'Decision packages',
  'rf.outstandingConditions': 'Outstanding conditions',
  'rf.documents': 'Documents and evidence',
  'rf.teamAccess': 'Team and access',
  'rf.systems': 'Systems',
  'rf.expiryWatchlist': 'Authorization expiry watchlist',
  'rf.accountability': 'Accountability',
  // fields
  'rf.securityFramework': 'Security framework',
  'rf.controlProfile': 'Control profile',
  'rf.classification': 'Classification',
  'rf.confidentiality': 'Confidentiality',
  'rf.integrity': 'Integrity',
  'rf.availability': 'Availability',
  'rf.highValueAsset': 'High-value asset',
  'rf.personalInformation': 'Personal information',
  'rf.hosting': 'Hosting',
  'rf.systemType': 'System type',
  'rf.technologies': 'Technologies',
  'rf.lifecycleStatus': 'Lifecycle status',
  'rf.systemOwner': 'System owner',
  'rf.authorizingOfficial': 'Authorizing official',
  'rf.cio': 'Chief information officer',
  'rf.assessor': 'Security assessor',
  'rf.role': 'Role', 'rf.name': 'Name', 'rf.contact': 'Contact',
  // stats / results
  'rf.applicable': 'Applicable',
  'rf.satisfied': 'Satisfied',
  'rf.partial': 'Partially satisfied',
  'rf.notSatisfied': 'Not satisfied',
  'rf.notApplicable': 'Not applicable',
  'rf.inherited': 'Inherited',
  'rf.pending': 'Pending',
  'rf.score': 'Score',
  'rf.overallScore': 'Overall score',
  'rf.family': 'Family',
  'rf.distribution': 'Distribution',
  'rf.result': 'Result',
  'rf.control': 'Control',
  'rf.title': 'Title',
  'rf.evidence': 'Evidence',
  'rf.finding': 'Finding',
  'rf.priority': 'Priority',
  // poam
  'rf.risk': 'Risk',
  'rf.owner': 'Owner',
  'rf.due': 'Due',
  'rf.originalDue': 'Original due',
  'rf.currentDue': 'Current due',
  'rf.moves': 'Moves',
  'rf.state': 'State',
  'rf.milestone': 'Completion milestone',
  'rf.remediation': 'Remediation plan',
  'rf.overdue': 'Overdue',
  'rf.high': 'high', 'rf.medium': 'medium', 'rf.low': 'low',
  'rf.open': 'Open', 'rf.inProgress': 'In progress', 'rf.evidenceSubmitted': 'Evidence submitted',
  'rf.accepted': 'Accepted', 'rf.rejected': 'Rejected', 'rf.deferred': 'Deferred',
  'rf.promotionBlocked': 'Promotion to full authorization is blocked',
  'rf.promotionClear': 'No conditions block promotion',
  'rf.totalItems': 'Total items', 'rf.inFlight': 'In flight',
  // decision
  'rf.packageReference': 'Package reference',
  'rf.decisionType': 'Decision type',
  'rf.pinnedAssessment': 'Pinned assessment',
  'rf.issued': 'Issued', 'rf.expires': 'Expires',
  'rf.executiveSummary': 'Executive summary',
  'rf.residualRisk': 'Residual risk statement',
  'rf.decisionRationale': 'Decision rationale',
  'rf.conditionsOfAuth': 'Conditions of authorization',
  'rf.version': 'Version', 'rf.date': 'Date', 'rf.by': 'By', 'rf.change': 'Change', 'rf.summary': 'Summary',
  'rf.notRevertable': 'Not revertable',
  // project / portfolio
  'rf.status': 'Status', 'rf.type': 'Type', 'rf.lastActivity': 'Last activity',
  'rf.document': 'Document', 'rf.uploaded': 'Uploaded', 'rf.size': 'Size',
  'rf.system': 'System', 'rf.decisionCol': 'Decision', 'rf.poamCol': 'POA&M',
  'rf.meanScore': 'Mean score', 'rf.authorized': 'Authorized', 'rf.inAssessmentCount': 'In assessment',
  'rf.noAttachmentsNote': 'Attachments are listed, not embedded.',
  'rf.excludedFromScore': 'excluded from score',
  'rf.reportView': 'Report',
  'rf.download': 'Download',
  'rf.format': 'Format',
  // intake report fields
  'rf.submitted': 'Submitted',
  'rf.intakeUsers': 'Users',
  'rf.intakeExternalUsers': 'External users',
  'rf.intakeDepartment': 'Department',
  'rf.intakeTargetDate': 'Target date',
  'rf.intakeTechLead': 'Technical lead',
  'rf.intakeNotes': 'Additional notes'
};

function makeT(req) {
  if (req && typeof req.t === 'function') {
    return (key, opts) => {
      const v = req.t(key, opts);
      return (v === key && EN[key]) ? EN[key] : v;
    };
  }
  // Optional explicit i18next instance
  if (req && req.i18n && typeof req.i18n.t === 'function') {
    const fixed = req.i18n.getFixedT ? req.i18n.getFixedT(req.language || 'en') : req.i18n.t.bind(req.i18n);
    return (key, opts) => { const v = fixed(key, opts); return (v === key && EN[key]) ? EN[key] : v; };
  }
  return (key) => EN[key] || key;
}

module.exports = { EN, makeT };
