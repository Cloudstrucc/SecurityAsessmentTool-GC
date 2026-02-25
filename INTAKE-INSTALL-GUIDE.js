// ============================================================================
// INTAKE SYSTEM — INSTALLATION GUIDE
// ============================================================================
//
// This file contains all code additions needed for the intake system.
// Follow the numbered sections below.
//
// ============================================================================

// ────────────────────────────────────────────────────────────────────────────
// 1. DATABASE SCHEMA — Add to models/database.js
//    Insert BEFORE the "Create default admin" comment
// ────────────────────────────────────────────────────────────────────────────

  // ── INTAKE SUBMISSIONS (pre-assessment project questionnaire) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS intake_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      project_name TEXT NOT NULL,
      project_description TEXT,
      department TEXT,
      branch TEXT,
      target_date TEXT,
      user_count TEXT,
      app_type TEXT,
      data_classification TEXT DEFAULT 'protected-b',
      pii_types TEXT DEFAULT '[]',
      has_pii INTEGER DEFAULT 0,
      atip_subject TEXT,
      pia_completed TEXT,
      hosting_type TEXT,
      hosting_region TEXT,
      technologies TEXT DEFAULT '[]',
      other_tech TEXT,
      has_apis TEXT,
      gc_interconnections TEXT,
      interconnections TEXT,
      mobile_access TEXT,
      external_users TEXT,
      completed_activities TEXT DEFAULT '[]',
      owner_name TEXT,
      owner_email TEXT,
      owner_title TEXT,
      tech_lead_name TEXT,
      tech_lead_email TEXT,
      tech_lead_title TEXT,
      authority_name TEXT,
      authority_email TEXT,
      authority_title TEXT,
      additional_notes TEXT,
      assessor_notes TEXT,
      assessor_description TEXT,
      decline_reason TEXT,
      project_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // ── INTAKE ATTACHMENTS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS intake_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (intake_id) REFERENCES intake_submissions(id) ON DELETE CASCADE
    )
  `);


// ────────────────────────────────────────────────────────────────────────────
// 2. PUBLIC ROUTES — Add to routes/public.js
//    Insert BEFORE the module.exports line
//    Also add at top of file: const { v4: uuidv4 } = require('uuid');
//    And ensure multer is configured:
//      const multer = require('multer');
//      const intakeUpload = multer({
//        dest: path.join(__dirname, '..', 'uploads', 'intakes'),
//        limits: { fileSize: 25 * 1024 * 1024 } // 25MB
//      });
// ────────────────────────────────────────────────────────────────────────────

// GET /intake — Show the intake form
router.get('/intake', (req, res) => {
  res.render('public/intake', {
    title: 'Security Assessment Intake',
    layout: 'layouts/main'
  });
});

// POST /intake — Process intake submission
router.post('/intake', intakeUpload.array('attachments', 10), (req, res) => {
  try {
    const db = getDb();
    const refCode = 'INT-' + uuidv4().substring(0, 8).toUpperCase();

    const piiTypes = Array.isArray(req.body.piiTypes) ? req.body.piiTypes : (req.body.piiTypes ? [req.body.piiTypes] : []);
    const technologies = Array.isArray(req.body.technologies) ? req.body.technologies : (req.body.technologies ? [req.body.technologies] : []);
    const activities = Array.isArray(req.body.completedActivities) ? req.body.completedActivities : (req.body.completedActivities ? [req.body.completedActivities] : []);
    const hasPII = piiTypes.length > 0 && !piiTypes.includes('none') ? 1 : 0;

    const intakeId = run(
      `INSERT INTO intake_submissions (
        ref_code, project_name, project_description, department, branch,
        target_date, user_count, app_type, data_classification,
        pii_types, has_pii, atip_subject, pia_completed,
        hosting_type, hosting_region, technologies, other_tech,
        has_apis, gc_interconnections, interconnections, mobile_access, external_users,
        completed_activities,
        owner_name, owner_email, owner_title,
        tech_lead_name, tech_lead_email, tech_lead_title,
        authority_name, authority_email, authority_title,
        additional_notes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        refCode, req.body.projectName, req.body.projectDescription,
        req.body.department, req.body.branch,
        req.body.targetDate, req.body.userCount, req.body.appType,
        req.body.dataClassification,
        JSON.stringify(piiTypes), hasPII,
        req.body.atipSubject, req.body.piaCompleted,
        req.body.hostingType, req.body.hostingRegion,
        JSON.stringify(technologies), req.body.otherTech,
        req.body.hasAPIs, req.body.gcInterconnections,
        req.body.interconnections, req.body.mobileAccess, req.body.externalUsers,
        JSON.stringify(activities),
        req.body.ownerName, req.body.ownerEmail, req.body.ownerTitle,
        req.body.techLeadName, req.body.techLeadEmail, req.body.techLeadTitle,
        req.body.authorityName, req.body.authorityEmail, req.body.authorityTitle,
        req.body.additionalNotes
      ]
    );

    // Save uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        run(
          `INSERT INTO intake_attachments (intake_id, filename, original_name, mime_type, size) VALUES (?,?,?,?,?)`,
          [intakeId, file.filename, file.originalname, file.mimetype, file.size]
        );
      });
    }

    res.render('public/intake', {
      title: 'Intake Submitted',
      layout: 'layouts/main',
      success: true,
      refCode: refCode
    });

  } catch (err) {
    console.error('Intake submission error:', err);
    req.flash('error', 'Failed to submit intake. Please try again.');
    res.redirect('/intake');
  }
});


// ────────────────────────────────────────────────────────────────────────────
// 3. ADMIN ROUTES — Add to routes/admin.js
//    Insert BEFORE the module.exports line
//    Also add at top: const { getRecommendedControls, COMMON_TECHNOLOGIES, groupByFamily } = require('../config/itsg33-controls');
//    (You may already have this import)
// ────────────────────────────────────────────────────────────────────────────

// ── Helper maps for display labels ──
const PII_LABELS = {
  'name-address': 'Name, Address & Contact Info',
  'sin': 'Social Insurance Number (SIN)',
  'financial': 'Financial Information',
  'health': 'Health / Medical Records',
  'biometric': 'Biometric Data',
  'employment': 'Employment / HR Records',
  'immigration': 'Immigration / Citizenship',
  'law-enforcement': 'Law Enforcement / Criminal Records',
  'indigenous': 'Indigenous / Treaty Data'
};

const ACTIVITY_LABELS = {
  'tra': 'Threat & Risk Assessment (TRA)',
  'pia': 'Privacy Impact Assessment (PIA)',
  'ssp': 'System Security Plan (SSP)',
  'vapt': 'Vulnerability Assessment / Pen Test',
  'network-diagram': 'Network / Architecture Diagram',
  'previous-sa': 'Previous SA&A / ATO'
};

// GET /admin/intakes — List all intakes
router.get('/intakes', ensureAuthenticated, (req, res) => {
  const db = getDb();
  const intakes = all('SELECT * FROM intake_submissions ORDER BY created_at DESC');
  const pending = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'pending'")[0]?.c || 0;
  const accepted = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'accepted'")[0]?.c || 0;
  const inReview = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'in-review'")[0]?.c || 0;

  res.render('admin/intakes', {
    title: 'Intake Submissions',
    layout: 'layouts/main',
    user: req.user,
    intakes,
    stats: {
      total: intakes.length,
      pending,
      accepted,
      inReview
    }
  });
});

// GET /admin/intakes/:id — Review a single intake
router.get('/intakes/:id', ensureAuthenticated, (req, res) => {
  const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
  if (!intake) {
    req.flash('error', 'Intake not found');
    return res.redirect('/admin/intakes');
  }

  // Parse JSON fields
  const piiTypes = JSON.parse(intake.pii_types || '[]');
  const technologies = JSON.parse(intake.technologies || '[]');
  const activities = JSON.parse(intake.completed_activities || '[]');

  // Get attachments
  const attachments = all('SELECT * FROM intake_attachments WHERE intake_id = ?', [intake.id]);
  attachments.forEach(a => {
    a.size_display = a.size > 1048576
      ? (a.size / 1048576).toFixed(1) + ' MB'
      : (a.size / 1024).toFixed(0) + ' KB';
  });

  // Build technology list for assessor override panel
  const allTechnologies = Object.entries(COMMON_TECHNOLOGIES).map(([key, val]) => ({
    key,
    name: val.name,
    alreadySelected: technologies.includes(key)
  }));

  // Run engine preview with submitted data
  const engineDescription = intake.project_description +
    (intake.interconnections ? ' integration interconnect API ' + intake.interconnections : '') +
    (intake.mobile_access === 'yes' ? ' mobile byod ' : '') +
    (intake.external_users === 'yes' ? ' external public ' : '');

  const recommended = getRecommendedControls({
    dataClassification: intake.data_classification,
    hostingType: intake.hosting_type,
    appType: intake.app_type,
    hasPII: intake.has_pii === 1,
    technologies: technologies,
    description: engineDescription
  });

  res.render('admin/intake-review', {
    title: 'Review: ' + intake.project_name,
    layout: 'layouts/main',
    user: req.user,
    intake,
    attachments,
    piiList: piiTypes.filter(p => p !== 'none').map(p => PII_LABELS[p] || p),
    techList: technologies.map(t => COMMON_TECHNOLOGIES[t]?.name || t),
    activityList: activities.map(a => ACTIVITY_LABELS[a] || a),
    allTechnologies,
    controlCount: recommended.length,
    p1Count: recommended.filter(c => c.priority === 'P1').length,
    p2Count: recommended.filter(c => c.priority === 'P2').length,
    p3Count: recommended.filter(c => c.priority === 'P3').length,
    inheritedCount: recommended.filter(c => c.isInherited).length
  });
});

// POST /admin/intakes/:id/status — Update intake status
router.post('/intakes/:id/status', ensureAuthenticated, (req, res) => {
  const { status, declineReason } = req.body;
  if (declineReason) {
    run('UPDATE intake_submissions SET status = ?, decline_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, declineReason, req.params.id]);
  } else {
    run('UPDATE intake_submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]);
  }
  req.flash('success', 'Intake status updated to ' + status);
  res.redirect('/admin/intakes/' + req.params.id);
});

// POST /admin/intakes/:id/create-project — Create project + assessment from intake
router.post('/intakes/:id/create-project', ensureAuthenticated, (req, res) => {
  try {
    const intake = get('SELECT * FROM intake_submissions WHERE id = ?', [req.params.id]);
    if (!intake) {
      req.flash('error', 'Intake not found');
      return res.redirect('/admin/intakes');
    }

    // Merge submitted technologies with assessor additions
    const submittedTech = JSON.parse(intake.technologies || '[]');
    const additionalTech = Array.isArray(req.body.additionalTech) ? req.body.additionalTech : (req.body.additionalTech ? [req.body.additionalTech] : []);
    const allTech = [...new Set([...submittedTech, ...additionalTech])];

    // Apply overrides
    const classification = req.body.overrideClassification || intake.data_classification;
    const appType = req.body.overrideAppType || intake.app_type;

    // Build description for engine (original + assessor additions)
    let fullDescription = intake.project_description || '';
    if (intake.interconnections) fullDescription += '\nInterconnections: ' + intake.interconnections;
    if (intake.mobile_access === 'yes') fullDescription += '\nMobile/BYOD access required.';
    if (intake.external_users === 'yes') fullDescription += '\nExternal users will access the system.';
    if (req.body.assessorDescription) fullDescription += '\n' + req.body.assessorDescription;

    // Create slug
    const slug = intake.project_name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
      '-' + Date.now().toString(36);

    // Create project
    const projectId = run(
      `INSERT INTO projects (
        name, slug, description, data_classification, hosting_type, app_type,
        has_pii, technologies, specifications,
        project_owner_name, project_owner_email,
        project_authority_name, project_authority_email,
        status, created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        intake.project_name, slug, fullDescription, classification,
        intake.hosting_type, appType,
        intake.has_pii, JSON.stringify(allTech),
        intake.other_tech || '',
        intake.owner_name, intake.owner_email,
        intake.authority_name || '', intake.authority_email || '',
        'active', req.user.id
      ]
    );

    // Run recommendation engine
    const recommended = getRecommendedControls({
      dataClassification: classification,
      hostingType: intake.hosting_type,
      appType: appType,
      hasPII: intake.has_pii === 1,
      technologies: allTech,
      description: fullDescription
    });

    // Create assessment
    const { v4: uuidv4 } = require('uuid');
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    const assessmentType = req.body.assessmentType || 'initial';

    const assessmentId = run(
      `INSERT INTO assessments (project_id, type, status, invite_code, created_by)
       VALUES (?,?,?,?,?)`,
      [projectId, assessmentType, 'draft', inviteCode, req.user.id]
    );

    // Insert recommended controls
    const grouped = groupByFamily(recommended);
    grouped.forEach(family => {
      family.controls.forEach(control => {
        run(
          `INSERT INTO assessment_controls (
            assessment_id, control_id, family, family_name, title, description,
            tailored_description, evidence_guidance, is_inherited, inherited_from,
            is_applicable, priority
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            assessmentId, control.id, control.family, control.familyName,
            control.title, control.description,
            control.tailoredDescription, control.evidenceGuidance,
            control.isInherited ? 1 : 0,
            control.inheritedFrom.join(', '),
            1, control.priority
          ]
        );
      });
    });

    // Update intake status
    run(
      `UPDATE intake_submissions SET
        status = 'accepted', project_id = ?,
        assessor_notes = ?, assessor_description = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [projectId, req.body.assessorNotes || '', req.body.assessorDescription || '', req.params.id]
    );

    req.flash('success',
      `Project "${intake.project_name}" created with ${recommended.length} controls. Assessment ready for tailoring.`
    );
    res.redirect('/admin/assessments/' + assessmentId);

  } catch (err) {
    console.error('Create project from intake error:', err);
    req.flash('error', 'Failed to create project: ' + err.message);
    res.redirect('/admin/intakes/' + req.params.id);
  }
});

// GET /admin/intakes/attachment/:id — Download intake attachment
router.get('/intakes/attachment/:id', ensureAuthenticated, (req, res) => {
  const attachment = get('SELECT * FROM intake_attachments WHERE id = ?', [req.params.id]);
  if (!attachment) {
    req.flash('error', 'Attachment not found');
    return res.redirect('/admin/intakes');
  }
  const filePath = path.join(__dirname, '..', 'uploads', 'intakes', attachment.filename);
  res.download(filePath, attachment.original_name);
});


// ────────────────────────────────────────────────────────────────────────────
// 4. NAVBAR UPDATE — Add to views/layouts/main.hbs
//    In the navbar <ul>, add this link alongside Projects/Assessments:
// ────────────────────────────────────────────────────────────────────────────

// <li class="nav-item">
//   <a class="nav-link" href="/admin/intakes">
//     <i class="bi bi-inbox me-1"></i>Intakes
//   </a>
// </li>

// And in the public section (e.g. the landing page index.hbs), add a link:
// <a href="/intake" class="btn btn-outline-primary">Submit Security Assessment Intake</a>


// ────────────────────────────────────────────────────────────────────────────
// 5. UPLOADS DIRECTORY — Ensure it exists
//    Run: mkdir -p uploads/intakes
// ────────────────────────────────────────────────────────────────────────────


// ────────────────────────────────────────────────────────────────────────────
// 6. DASHBOARD UPDATE — Add intake stats to admin/dashboard route
//    In routes/admin.js, in the GET /dashboard handler, add:
// ────────────────────────────────────────────────────────────────────────────

// const pendingIntakes = all("SELECT COUNT(*) as c FROM intake_submissions WHERE status = 'pending'")[0]?.c || 0;
// Then pass pendingIntakes to the render and display it as a stat card.
