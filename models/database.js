const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'sa-tool.db');

let db = null;

async function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // ── USERS & ROLES ──
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'assessor',
      title TEXT,
      organization TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      totp_secret TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      is_break_glass INTEGER DEFAULT 0
    )
  `);

  // ── PROJECTS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      data_classification TEXT DEFAULT 'protected-b',
      confidentiality_level TEXT DEFAULT 'protected-b',
      integrity_level TEXT DEFAULT 'medium',
      availability_level TEXT DEFAULT 'medium',
      security_profile TEXT DEFAULT 'PBMM',
      security_framework TEXT DEFAULT 'ITSG-33',
      framework_baseline TEXT,
      framework_category TEXT,
      framework_applicability TEXT,
      is_hva INTEGER DEFAULT 0,
      hosting_type TEXT,
      app_type TEXT,
      has_pii INTEGER DEFAULT 0,
      technologies TEXT DEFAULT '[]',
      specifications TEXT,
      project_owner_name TEXT,
      project_owner_email TEXT,
      project_authority_name TEXT,
      project_authority_email TEXT,
      cio_name TEXT,
      cio_email TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── ASSESSMENTS (the SA&A package) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      type TEXT DEFAULT 'initial',
      intake_id INTEGER,
      status TEXT DEFAULT 'draft',
      invite_code TEXT UNIQUE,
      invite_sent_at DATETIME,
      invite_expires_at DATETIME,
      submitted_at DATETIME,
      audit_started_at DATETIME,
      audit_completed_at DATETIME,
      overall_score REAL,
      result TEXT,
      ato_type TEXT,
      ato_generated_at DATETIME,
      ato_expiry_date DATETIME,
      assessor_signed_at DATETIME,
      authority_signed_at DATETIME,
      cio_signed_at DATETIME,
      assigned_to_user_id INTEGER,
      assigned_to_email TEXT,
      assigned_to_role TEXT,
      security_framework TEXT DEFAULT 'ITSG-33',
      framework_baseline TEXT,
      framework_category TEXT,
      framework_applicability TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (intake_id) REFERENCES intake_submissions(id),
      FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── ASSESSMENT CONTROLS (tailored controls for each assessment) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      control_id TEXT NOT NULL,
      family TEXT NOT NULL,
      family_name TEXT,
      title TEXT NOT NULL,
      description TEXT,
      tailored_description TEXT,
      evidence_guidance TEXT,
      is_inherited INTEGER DEFAULT 0,
      inherited_from TEXT,
      is_applicable INTEGER DEFAULT 1,
      priority TEXT DEFAULT 'P1',
      evidence_text TEXT,
      evidence_html TEXT,
      evidence_status TEXT DEFAULT 'pending',
      attachments TEXT DEFAULT '[]',
      audit_result TEXT,
      audit_comments TEXT,
      audit_reviewed_at DATETIME,
      audit_reviewed_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
      FOREIGN KEY (audit_reviewed_by) REFERENCES users(id)
    )
  `);

  // ── COMMENTS (threaded comments per control) ──
  // ── ASSESSMENT AI ASSISTANT CHAT (conversation history for the SA&A Assistant) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      assessment_id INTEGER,
      mode TEXT,
      author_user_id INTEGER,
      author_name TEXT,
      author_role TEXT,
      message TEXT,
      ai_reply TEXT,
      actions_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── DECISION PACKAGES (authorization decisions: ATO / iATO / denial) ──
  // A decision package pins the EXACT assessment version it authorized. Versions are
  // append-only snapshots, so the authorization record is immutable by construction —
  // the live assessment may keep evolving without changing what was authorized.
  db.run(`
    CREATE TABLE IF NOT EXISTS decision_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      assessment_id INTEGER,
      assessment_version_id INTEGER,
      assessment_version INTEGER,
      reference TEXT,
      title TEXT,
      decision_type TEXT DEFAULT 'ato',
      state TEXT DEFAULT 'draft',
      executive_summary TEXT,
      residual_risk_statement TEXT,
      decision_rationale TEXT,
      conditions TEXT,
      authorizing_official TEXT,
      assessor TEXT,
      recommended_by TEXT,
      recommended_at DATETIME,
      decided_by TEXT,
      decided_at DATETIME,
      issued_at DATETIME,
      expires_at DATETIME,
      snapshot_extra TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id),
      FOREIGN KEY (assessment_version_id) REFERENCES assessment_versions(id)
    )
  `);

  // ── MENTION EMAIL QUEUE (batched notifications) ──
  // In-app notifications are immediate; email is batched so a busy thread cannot
  // spam someone into muting the feature. One digest per user per record per window.
  db.run(`
    CREATE TABLE IF NOT EXISTS mention_email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      message_id INTEGER,
      author_name TEXT,
      excerpt TEXT,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── DECISION PACKAGE VERSIONS (audit history + revert) ──
  // Snapshots the package's own editorial fields only. POA&M items and their review
  // verdicts are deliberately NOT rolled back by a revert: reverting an editorial
  // mistake must never erase an assessor's decision or a team's submitted evidence.
  db.run(`
    CREATE TABLE IF NOT EXISTS decision_package_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_package_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      label TEXT,
      summary TEXT,
      created_by INTEGER,
      created_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      snapshot_json TEXT,
      FOREIGN KEY (decision_package_id) REFERENCES decision_packages(id) ON DELETE CASCADE
    )
  `);

  // ── COLLABORATION MESSAGES (polymorphic; project is always the parent thread) ──
  // Posted against a specific record but rolled up to the project so a whole
  // conversation can be read in one place. Never sent to the AI provider.
  db.run(`
    CREATE TABLE IF NOT EXISTS collab_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'project',
      entity_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      body TEXT NOT NULL,
      mentions_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME,
      deleted_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── INTEGRATION CHECK LOG (per-tenant; 24h rolling retention) ──
  // One row per validation attempt against SMTP / SMS / custom domain / AI provider.
  db.run(`
    CREATE TABLE IF NOT EXISTS org_setting_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      feature TEXT NOT NULL,          -- smtp | sms | domain | ai
      kind TEXT,                      -- validate | test
      ok INTEGER DEFAULT 0,
      message TEXT,
      detail TEXT,
      checked_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── ASSESSMENT VERSIONS (point-in-time snapshots for audit history + revert) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      label TEXT,
      summary TEXT,
      created_by INTEGER,
      created_by_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      snapshot_json TEXT,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_control_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      user_role TEXT DEFAULT 'user',
      content TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assessment_control_id) REFERENCES assessment_controls(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ── FILE ATTACHMENTS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_control_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_by TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assessment_control_id) REFERENCES assessment_controls(id) ON DELETE CASCADE
    )
  `);

  // ── iATO CHECKLIST ITEMS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS iato_checklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      control_id TEXT,
      description TEXT NOT NULL,
      risk_level TEXT DEFAULT 'medium',
      original_finding TEXT,
      remediation_plan TEXT,
      milestone TEXT,
      deadline DATETIME,
      status TEXT DEFAULT 'open',
      assigned_to TEXT,
      estimated_cost TEXT,
      resources_required TEXT,
      completed_at DATETIME,
      verified_at DATETIME,
      verified_by INTEGER,
      evidence_text TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── Add POA&M columns to existing tables (safe migration) ──
  const poamCols = [
    ['iato_checklist', 'risk_level', "TEXT DEFAULT 'medium'"],
    ['iato_checklist', 'original_finding', 'TEXT'],
    ['iato_checklist', 'remediation_plan', 'TEXT'],
    ['iato_checklist', 'milestone', 'TEXT'],
    ['iato_checklist', 'estimated_cost', 'TEXT'],
    ['iato_checklist', 'resources_required', 'TEXT'],
    ['iato_checklist', 'verified_at', 'DATETIME'],
    ['iato_checklist', 'verified_by', 'INTEGER'],
    ['assessments', 'poam_notes', 'TEXT'],
    ['assessments', 'risk_acceptance_statement', 'TEXT'],
    ['assessment_controls', 'risk_level', 'TEXT']
  ];
  poamCols.forEach(([table, col, type]) => {
    try { db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch(e) { /* already exists */ }
  });

  // ── GUIDANCE REPORTS (no-SA&A web guidance checklist) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS guidance_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      invite_code TEXT UNIQUE,
      status TEXT DEFAULT 'draft',
      checklist_responses TEXT DEFAULT '{}',
      respondent_name TEXT,
      respondent_email TEXT,
      respondent_notes TEXT,
      submitted_at DATETIME,
      reviewer_notes TEXT,
      validated_at DATETIME,
      validated_by INTEGER,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (validated_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── ATO DOCUMENTS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS ato_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      filename TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      assessor_signature TEXT,
      authority_signature TEXT,
      cio_signature TEXT,
      status TEXT DEFAULT 'draft',
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    )
  `);

  // ── EDITABLE ATO / iATO RECORDS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS ato_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      assessment_id INTEGER,
      record_type TEXT NOT NULL DEFAULT 'ato',
      title TEXT,
      system_name TEXT,
      organization_name TEXT,
      authorizing_official TEXT,
      assessor TEXT,
      authorization_status TEXT DEFAULT 'draft',
      authorization_date TEXT,
      expiry_date TEXT,
      executive_summary TEXT,
      system_description TEXT,
      assessment_scope TEXT,
      risk_summary TEXT,
      residual_risk_statement TEXT,
      conditions_of_authorization TEXT,
      security_control_summary TEXT,
      poam_summary TEXT,
      assessor_notes TEXT,
      static_sections TEXT,
      custom_sections TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── REUSABLE TEMPLATES (from completed assessments) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS control_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_id TEXT NOT NULL,
      hosting_type TEXT,
      technologies TEXT,
      tailored_description TEXT,
      evidence_guidance TEXT,
      example_evidence TEXT,
      source_project_id INTEGER,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_project_id) REFERENCES projects(id)
    )
  `);

  // ── SECURITY CONTROL CATALOG ──
  db.run(`
    CREATE TABLE IF NOT EXISTS security_control_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      framework TEXT NOT NULL,
      control_id TEXT NOT NULL,
      title TEXT NOT NULL,
      family TEXT,
      description TEXT,
      guidance TEXT,
      definitions TEXT,
      related_controls TEXT,
      baseline TEXT,
      category TEXT,
      applicability_notes TEXT,
      status TEXT DEFAULT 'active',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(framework, control_id)
    )
  `);

  // ── ANALYTICS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS analytics_sent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
      confidentiality_level TEXT DEFAULT 'protected-b',
      integrity_level TEXT DEFAULT 'medium',
      availability_level TEXT DEFAULT 'medium',
      is_hva INTEGER DEFAULT 0,
      security_profile TEXT DEFAULT 'PBMM',
      security_framework TEXT DEFAULT 'ITSG-33',
      framework_baseline TEXT,
      framework_category TEXT,
      framework_applicability TEXT,
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
      created_by_assessor_id INTEGER,
      submitted_by_user_id INTEGER,
      assigned_to_user_id INTEGER,
      assigned_to_email TEXT,
      assigned_to_role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (created_by_assessor_id) REFERENCES users(id),
      FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
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

  // ── PROJECT DOCUMENTS (documents reusable for AI, reports, and traceability) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS project_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      intake_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      document_type TEXT,
      mime_type TEXT,
      size INTEGER,
      uploaded_by_user_id INTEGER,
      uploaded_by_name TEXT,
      status TEXT DEFAULT 'active',
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (intake_id) REFERENCES intake_submissions(id),
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
    )
  `);

  // ── REPORT BRANDING ──
  db.run(`
    CREATE TABLE IF NOT EXISTS report_branding (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_type TEXT DEFAULT 'project',
      project_id INTEGER,
      organization_name TEXT,
      logo_filename TEXT,
      logo_original_name TEXT,
      logo_mime_type TEXT,
      report_subtitle TEXT,
      classification_label TEXT,
      assessor_company_name TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ── SELF-ASSESSMENTS (anonymous/invite-code pre-intake workflow) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS self_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'submitted',
      submitter_name TEXT,
      submitter_email TEXT NOT NULL,
      submitter_org TEXT,
      system_type TEXT,
      system_description TEXT,
      country TEXT,
      gov_level TEXT,
      data_sensitivity TEXT,
      frameworks_json TEXT DEFAULT '{}',
      questions_json TEXT DEFAULT '[]',
      answers_json TEXT DEFAULT '{}',
      report_json TEXT DEFAULT '{}',
      score INTEGER DEFAULT 0,
      secure_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      critical_count INTEGER DEFAULT 0,
      intake_id INTEGER,
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (intake_id) REFERENCES intake_submissions(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sa_access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT NOT NULL,
      organization TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      access_code TEXT UNIQUE,
      approved_by INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);

  // ── USER INVITATIONS ──
  db.run(`
    CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'client',
      email TEXT NOT NULL,
      name TEXT,
      organization TEXT,
      invite_code TEXT UNIQUE NOT NULL,
      invited_by INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      message TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME,
      accepted_by_user_id INTEGER,
      FOREIGN KEY (invited_by) REFERENCES users(id),
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
    )
  `);

  // ── ASSIGNMENTS (intakes, assessments, and pending invitations) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL DEFAULT 'assessment',
      entity_id INTEGER NOT NULL,
      assigned_to INTEGER,
      assignee_email TEXT,
      assignee_role TEXT DEFAULT 'client',
      assigned_by INTEGER NOT NULL,
      invitation_id INTEGER,
      role TEXT DEFAULT 'assigned',
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      revoked_at DATETIME,
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id),
      FOREIGN KEY (invitation_id) REFERENCES invitations(id)
    )
  `);

  // Create default admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@youragency.gc.ca';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';

  // ── SCHEMA MIGRATIONS (safely add columns missing from older databases) ──
  const migrations = [
    // Assessment-time control-profile override (C/I/A + resolved profile the
    // assessor chose when creating the package; may differ from the project's).
    ['assessments', 'security_profile', 'ALTER TABLE assessments ADD COLUMN security_profile TEXT'],
    ['assessments', 'version', 'ALTER TABLE assessments ADD COLUMN version INTEGER DEFAULT 1'],
    ['assessments', 'confidentiality_level', 'ALTER TABLE assessments ADD COLUMN confidentiality_level TEXT'],
    ['assessments', 'integrity_level', 'ALTER TABLE assessments ADD COLUMN integrity_level TEXT'],
    ['assessments', 'availability_level', 'ALTER TABLE assessments ADD COLUMN availability_level TEXT'],
    ['users', 'totp_secret', 'ALTER TABLE users ADD COLUMN totp_secret TEXT'],
    ['users', 'mfa_enabled', 'ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0'],
    ['users', 'is_break_glass', 'ALTER TABLE users ADD COLUMN is_break_glass INTEGER DEFAULT 0'],
    ['users', 'webauthn_credential_id', 'ALTER TABLE users ADD COLUMN webauthn_credential_id TEXT'],
    ['users', 'webauthn_public_key', 'ALTER TABLE users ADD COLUMN webauthn_public_key TEXT'],
    ['users', 'webauthn_counter', 'ALTER TABLE users ADD COLUMN webauthn_counter INTEGER DEFAULT 0'],
    ['users', 'mfa_mode', "ALTER TABLE users ADD COLUMN mfa_mode TEXT DEFAULT 'totp'"],
    ['projects', 'confidentiality_level', "ALTER TABLE projects ADD COLUMN confidentiality_level TEXT DEFAULT 'protected-b'"],
    ['projects', 'integrity_level', "ALTER TABLE projects ADD COLUMN integrity_level TEXT DEFAULT 'medium'"],
    ['projects', 'availability_level', "ALTER TABLE projects ADD COLUMN availability_level TEXT DEFAULT 'medium'"],
    ['projects', 'security_profile', "ALTER TABLE projects ADD COLUMN security_profile TEXT DEFAULT 'PBMM'"],
    ['projects', 'security_framework', "ALTER TABLE projects ADD COLUMN security_framework TEXT DEFAULT 'ITSG-33'"],
    ['projects', 'framework_baseline', 'ALTER TABLE projects ADD COLUMN framework_baseline TEXT'],
    ['projects', 'framework_category', 'ALTER TABLE projects ADD COLUMN framework_category TEXT'],
    ['projects', 'framework_applicability', 'ALTER TABLE projects ADD COLUMN framework_applicability TEXT'],
    ['projects', 'is_hva', 'ALTER TABLE projects ADD COLUMN is_hva INTEGER DEFAULT 0'],
    ['projects', 'department', 'ALTER TABLE projects ADD COLUMN department TEXT'],
    ['projects', 'branch', 'ALTER TABLE projects ADD COLUMN branch TEXT'],
    ['projects', 'client_user_id', 'ALTER TABLE projects ADD COLUMN client_user_id INTEGER'],
    // Archive support (reversible soft-archive; preserves prior status)
    ['projects', 'archived_at', 'ALTER TABLE projects ADD COLUMN archived_at DATETIME'],
    ['projects', 'status_before_archive', 'ALTER TABLE projects ADD COLUMN status_before_archive TEXT'],
    ['assessments', 'archived_at', 'ALTER TABLE assessments ADD COLUMN archived_at DATETIME'],
    ['assessments', 'status_before_archive', 'ALTER TABLE assessments ADD COLUMN status_before_archive TEXT'],
    ['intake_submissions', 'archived_at', 'ALTER TABLE intake_submissions ADD COLUMN archived_at DATETIME'],
    ['intake_submissions', 'status_before_archive', 'ALTER TABLE intake_submissions ADD COLUMN status_before_archive TEXT'],

    // ── Billing / multi-tenant (Stripe) ──
    ['users', 'organization_id', 'ALTER TABLE users ADD COLUMN organization_id INTEGER'],
    ['projects', 'organization_id', 'ALTER TABLE projects ADD COLUMN organization_id INTEGER'],
    ['organizations', null, `CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_user_id INTEGER,
      plan TEXT NOT NULL DEFAULT 'trial',
      status TEXT NOT NULL DEFAULT 'trialing',
      seats_limit INTEGER,
      projects_limit INTEGER,
      trial_ends_at DATETIME,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      comp_code_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    )`],
    ['comp_codes', null, `CREATE TABLE IF NOT EXISTS comp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'business',
      seats_limit INTEGER,
      projects_limit INTEGER,
      max_redemptions INTEGER DEFAULT 1,
      redemptions INTEGER DEFAULT 0,
      expires_at DATETIME,
      active INTEGER DEFAULT 1,
      note TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    ['billing_events', null, `CREATE TABLE IF NOT EXISTS billing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stripe_event_id TEXT UNIQUE,
      type TEXT,
      organization_id INTEGER,
      payload TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    ['payg_usage', null, `CREATE TABLE IF NOT EXISTS payg_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      active_users INTEGER DEFAULT 0,
      projects_created INTEGER DEFAULT 0,
      reported_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, period)
    )`],

    // ── RBAC, licensing & access control ──
    ['users', 'account_type', "ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT 'owner'"], // owner | admin | member | collaborator
    ['users', 'is_licensed', 'ALTER TABLE users ADD COLUMN is_licensed INTEGER DEFAULT 0'],
    ['users', 'is_root_admin', 'ALTER TABLE users ADD COLUMN is_root_admin INTEGER DEFAULT 0'],
    ['users', 'must_reenroll_mfa', 'ALTER TABLE users ADD COLUMN must_reenroll_mfa INTEGER DEFAULT 0'],
    ['organizations', 'admin_seats_limit', 'ALTER TABLE organizations ADD COLUMN admin_seats_limit INTEGER'],
    // AI usage counters (for trial-tier per-work-type caps)
    ['ai_usage', null, `CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      organization_id INTEGER,
      work_type TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, work_type)
    )`],
    // Bring-your-own AI provider / MCP (root-admin configured, per tenant).
    ['org_settings', 'ai_provider', "ALTER TABLE org_settings ADD COLUMN ai_provider TEXT DEFAULT 'oob'"], // oob | anthropic | openai | grok | gemini | custom
    ['org_settings', 'ai_api_key', 'ALTER TABLE org_settings ADD COLUMN ai_api_key TEXT'],
    ['org_settings', 'ai_model', 'ALTER TABLE org_settings ADD COLUMN ai_model TEXT'],
    ['org_settings', 'ai_base_url', 'ALTER TABLE org_settings ADD COLUMN ai_base_url TEXT'],   // for custom / on-prem OpenAI-compatible endpoints
    ['org_settings', 'ai_mcp_url', 'ALTER TABLE org_settings ADD COLUMN ai_mcp_url TEXT'],
    ['org_settings', 'ai_mcp_token', 'ALTER TABLE org_settings ADD COLUMN ai_mcp_token TEXT'],
    // Last SUCCESSFUL validation per integration ("Last valid check"). Kept on the
    // settings row so it survives the 24h purge of org_setting_checks.
    ['org_settings', 'smtp_verified_at', 'ALTER TABLE org_settings ADD COLUMN smtp_verified_at DATETIME'],
    ['org_settings', 'sms_verified_at', 'ALTER TABLE org_settings ADD COLUMN sms_verified_at DATETIME'],
    ['org_settings', 'domain_checked_at', 'ALTER TABLE org_settings ADD COLUMN domain_checked_at DATETIME'],
    ['org_settings', 'ai_verified_at', 'ALTER TABLE org_settings ADD COLUMN ai_verified_at DATETIME'],
    // Collaboration (chat) toggles. On by default; the org-level flag is a global
    // kill-switch that wins over the per-project one.
    ['org_settings', 'collaboration_enabled', 'ALTER TABLE org_settings ADD COLUMN collaboration_enabled INTEGER DEFAULT 1'],
    ['projects', 'collaboration_enabled', 'ALTER TABLE projects ADD COLUMN collaboration_enabled INTEGER DEFAULT 1'],
    // POA&M moves to decision packages: conditions attached to a conditional
    // authorization, with their own review loop and due-date history.
    ['iato_checklist', 'decision_package_id', 'ALTER TABLE iato_checklist ADD COLUMN decision_package_id INTEGER'],
    ['iato_checklist', 'state', "ALTER TABLE iato_checklist ADD COLUMN state TEXT DEFAULT 'open'"],
    ['iato_checklist', 'evidence_submitted_at', 'ALTER TABLE iato_checklist ADD COLUMN evidence_submitted_at DATETIME'],
    ['iato_checklist', 'evidence_submitted_by', 'ALTER TABLE iato_checklist ADD COLUMN evidence_submitted_by TEXT'],
    ['iato_checklist', 'reviewed_at', 'ALTER TABLE iato_checklist ADD COLUMN reviewed_at DATETIME'],
    ['iato_checklist', 'reviewed_by', 'ALTER TABLE iato_checklist ADD COLUMN reviewed_by TEXT'],
    ['iato_checklist', 'review_decision', 'ALTER TABLE iato_checklist ADD COLUMN review_decision TEXT'],
    ['iato_checklist', 'review_notes', 'ALTER TABLE iato_checklist ADD COLUMN review_notes TEXT'],
    ['iato_checklist', 'deferred_to_package_id', 'ALTER TABLE iato_checklist ADD COLUMN deferred_to_package_id INTEGER'],
    ['iato_checklist', 'carried_from_item_id', 'ALTER TABLE iato_checklist ADD COLUMN carried_from_item_id INTEGER'],
    // Due-date history: the original commitment, the previous value, and how often it moved.
    ['iato_checklist', 'deadline_original', 'ALTER TABLE iato_checklist ADD COLUMN deadline_original DATETIME'],
    ['iato_checklist', 'deadline_previous', 'ALTER TABLE iato_checklist ADD COLUMN deadline_previous DATETIME'],
    ['iato_checklist', 'deadline_changes', 'ALTER TABLE iato_checklist ADD COLUMN deadline_changes INTEGER DEFAULT 0'],
    ['iato_checklist', 'deadline_change_reason', 'ALTER TABLE iato_checklist ADD COLUMN deadline_change_reason TEXT'],
    // A package that extends an earlier one (approval extended with conditions).
    ['decision_packages', 'parent_package_id', 'ALTER TABLE decision_packages ADD COLUMN parent_package_id INTEGER'],
    ['decision_packages', 'extension_reason', 'ALTER TABLE decision_packages ADD COLUMN extension_reason TEXT'],
    ['decision_packages', 'version', 'ALTER TABLE decision_packages ADD COLUMN version INTEGER DEFAULT 1'],
    // Mention notification preferences (per user) and tenant policy (per org).
    ['users', 'notify_mentions_inapp', 'ALTER TABLE users ADD COLUMN notify_mentions_inapp INTEGER DEFAULT 1'],
    ['users', 'notify_mentions_email', 'ALTER TABLE users ADD COLUMN notify_mentions_email INTEGER DEFAULT 1'],
    ['org_settings', 'notify_mentions_enabled', 'ALTER TABLE org_settings ADD COLUMN notify_mentions_enabled INTEGER DEFAULT 1'],
    // Link-only by default: message text is NOT put into inboxes unless a tenant opts in.
    ['org_settings', 'notify_mention_excerpt', 'ALTER TABLE org_settings ADD COLUMN notify_mention_excerpt INTEGER DEFAULT 0'],
    // Per-tenant OOB token allowance + usage.
    ['organizations', 'token_limit', 'ALTER TABLE organizations ADD COLUMN token_limit INTEGER'],       // null = plan default
    ['organizations', 'tokens_extra', 'ALTER TABLE organizations ADD COLUMN tokens_extra INTEGER DEFAULT 0'], // topped-up tokens
    ['organizations', 'token_period', 'ALTER TABLE organizations ADD COLUMN token_period TEXT'],         // YYYY-MM the current window
    ['organizations', 'tokens_used', 'ALTER TABLE organizations ADD COLUMN tokens_used INTEGER DEFAULT 0'],
    // Detailed AI token usage log.
    ['ai_token_usage', null, `CREATE TABLE IF NOT EXISTS ai_token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      user_id INTEGER,
      provider TEXT,
      work_type TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      billed_oob INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    // In-app notifications (assignments, invites, messages).
    ['notifications', null, `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    // Pre-assessment reviewer routing (Increment 5).
    ['self_assessments', 'reviewer_email', 'ALTER TABLE self_assessments ADD COLUMN reviewer_email TEXT'],
    ['self_assessments', 'reviewer_notified_at', 'ALTER TABLE self_assessments ADD COLUMN reviewer_notified_at DATETIME'],
    ['self_assessments', 'submitted_by_user_id', 'ALTER TABLE self_assessments ADD COLUMN submitted_by_user_id INTEGER'],
    // Org-tied member invitations (licensing): consumed by the redeem flow.
    ['invitations', 'organization_id', 'ALTER TABLE invitations ADD COLUMN organization_id INTEGER'],
    ['invitations', 'grant_admin', 'ALTER TABLE invitations ADD COLUMN grant_admin INTEGER DEFAULT 0'],
    ['invitations', 'grant_license', 'ALTER TABLE invitations ADD COLUMN grant_license INTEGER DEFAULT 1'],
    // Per-tenant settings: own SMTP / SMS / custom domain (root-admin configured)
    ['org_settings', null, `CREATE TABLE IF NOT EXISTS org_settings (
      organization_id INTEGER PRIMARY KEY,
      smtp_host TEXT, smtp_port INTEGER, smtp_user TEXT, smtp_password TEXT,
      smtp_from TEXT, smtp_secure INTEGER DEFAULT 0, smtp_enabled INTEGER DEFAULT 0,
      sms_provider TEXT, sms_account_sid TEXT, sms_auth_token TEXT, sms_from TEXT, sms_enabled INTEGER DEFAULT 0,
      custom_domain TEXT, custom_domain_verified INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    ['intake_submissions', 'confidentiality_level', "ALTER TABLE intake_submissions ADD COLUMN confidentiality_level TEXT DEFAULT 'protected-b'"],
    ['intake_submissions', 'integrity_level', "ALTER TABLE intake_submissions ADD COLUMN integrity_level TEXT DEFAULT 'medium'"],
    ['intake_submissions', 'availability_level', "ALTER TABLE intake_submissions ADD COLUMN availability_level TEXT DEFAULT 'medium'"],
    ['intake_submissions', 'security_profile', "ALTER TABLE intake_submissions ADD COLUMN security_profile TEXT DEFAULT 'PBMM'"],
    ['intake_submissions', 'security_framework', "ALTER TABLE intake_submissions ADD COLUMN security_framework TEXT DEFAULT 'ITSG-33'"],
    ['intake_submissions', 'framework_baseline', 'ALTER TABLE intake_submissions ADD COLUMN framework_baseline TEXT'],
    ['intake_submissions', 'framework_category', 'ALTER TABLE intake_submissions ADD COLUMN framework_category TEXT'],
    ['intake_submissions', 'framework_applicability', 'ALTER TABLE intake_submissions ADD COLUMN framework_applicability TEXT'],
    ['intake_submissions', 'is_hva', 'ALTER TABLE intake_submissions ADD COLUMN is_hva INTEGER DEFAULT 0'],
    ['intake_submissions', 'created_by_assessor_id', 'ALTER TABLE intake_submissions ADD COLUMN created_by_assessor_id INTEGER'],
    ['intake_submissions', 'submitted_by_user_id', 'ALTER TABLE intake_submissions ADD COLUMN submitted_by_user_id INTEGER'],
    ['intake_submissions', 'assigned_to_user_id', 'ALTER TABLE intake_submissions ADD COLUMN assigned_to_user_id INTEGER'],
    ['intake_submissions', 'assigned_to_email', 'ALTER TABLE intake_submissions ADD COLUMN assigned_to_email TEXT'],
    ['intake_submissions', 'assigned_to_role', 'ALTER TABLE intake_submissions ADD COLUMN assigned_to_role TEXT'],
    ['assessments', 'intake_id', 'ALTER TABLE assessments ADD COLUMN intake_id INTEGER'],
    ['assessments', 'assigned_to_user_id', 'ALTER TABLE assessments ADD COLUMN assigned_to_user_id INTEGER'],
    ['assessments', 'assigned_to_email', 'ALTER TABLE assessments ADD COLUMN assigned_to_email TEXT'],
    ['assessments', 'assigned_to_role', 'ALTER TABLE assessments ADD COLUMN assigned_to_role TEXT'],
    ['assessments', 'security_framework', "ALTER TABLE assessments ADD COLUMN security_framework TEXT DEFAULT 'ITSG-33'"],
    ['assessments', 'framework_baseline', 'ALTER TABLE assessments ADD COLUMN framework_baseline TEXT'],
    ['assessments', 'framework_category', 'ALTER TABLE assessments ADD COLUMN framework_category TEXT'],
    ['assessments', 'framework_applicability', 'ALTER TABLE assessments ADD COLUMN framework_applicability TEXT'],
    ['invitations', null, `CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'client',
      email TEXT NOT NULL,
      name TEXT,
      organization TEXT,
      invite_code TEXT UNIQUE NOT NULL,
      invited_by INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      message TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME,
      accepted_by_user_id INTEGER
    )`],
    ['invitations', 'entity_type', 'ALTER TABLE invitations ADD COLUMN entity_type TEXT'],
    ['invitations', 'entity_id', 'ALTER TABLE invitations ADD COLUMN entity_id INTEGER'],
    ['assessment_assignments', null, `CREATE TABLE IF NOT EXISTS assessment_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL DEFAULT 'assessment',
      entity_id INTEGER NOT NULL,
      assigned_to INTEGER,
      assignee_email TEXT,
      assignee_role TEXT DEFAULT 'client',
      assigned_by INTEGER NOT NULL,
      invitation_id INTEGER,
      role TEXT DEFAULT 'assigned',
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      revoked_at DATETIME
    )`],
    ['assessment_assignments', 'assignee_email', 'ALTER TABLE assessment_assignments ADD COLUMN assignee_email TEXT'],
    ['assessment_assignments', 'assignee_role', "ALTER TABLE assessment_assignments ADD COLUMN assignee_role TEXT DEFAULT 'client'"],
    ['assessment_assignments', 'invitation_id', 'ALTER TABLE assessment_assignments ADD COLUMN invitation_id INTEGER'],
    ['assessment_assignments', 'accepted_at', 'ALTER TABLE assessment_assignments ADD COLUMN accepted_at DATETIME'],
    ['projects', 'description', 'ALTER TABLE projects ADD COLUMN description TEXT'],
    ['projects', 'technologies', "ALTER TABLE projects ADD COLUMN technologies TEXT DEFAULT '[]'"],
    ['assessment_controls', 'control_guidance', 'ALTER TABLE assessment_controls ADD COLUMN control_guidance TEXT'],
    ['assessment_controls', 'assessor_notes', 'ALTER TABLE assessment_controls ADD COLUMN assessor_notes TEXT'],
    ['assessment_controls', 'guidance_source', "ALTER TABLE assessment_controls ADD COLUMN guidance_source TEXT DEFAULT 'manual'"],
    ['assessment_controls', 'ai_generated_at', 'ALTER TABLE assessment_controls ADD COLUMN ai_generated_at DATETIME'],
    ['assessment_controls', 'guidance_edited_at', 'ALTER TABLE assessment_controls ADD COLUMN guidance_edited_at DATETIME'],
    ['assessment_controls', 'framework', "ALTER TABLE assessment_controls ADD COLUMN framework TEXT DEFAULT 'ITSG-33'"],
    ['iato_checklist', 'project_id', 'ALTER TABLE iato_checklist ADD COLUMN project_id INTEGER'],
    ['iato_checklist', 'ato_record_id', 'ALTER TABLE iato_checklist ADD COLUMN ato_record_id INTEGER'],
    ['iato_checklist', 'residual_risk', 'ALTER TABLE iato_checklist ADD COLUMN residual_risk TEXT'],
    ['iato_checklist', 'assessor_notes', 'ALTER TABLE iato_checklist ADD COLUMN assessor_notes TEXT'],
    ['iato_checklist', 'updated_at', 'ALTER TABLE iato_checklist ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ['self_assessments', null, `CREATE TABLE IF NOT EXISTS self_assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'submitted',
      submitter_name TEXT,
      submitter_email TEXT NOT NULL,
      submitter_org TEXT,
      system_type TEXT,
      system_description TEXT,
      country TEXT,
      gov_level TEXT,
      data_sensitivity TEXT,
      frameworks_json TEXT DEFAULT '{}',
      questions_json TEXT DEFAULT '[]',
      answers_json TEXT DEFAULT '{}',
      report_json TEXT DEFAULT '{}',
      score INTEGER DEFAULT 0,
      secure_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      critical_count INTEGER DEFAULT 0,
      intake_id INTEGER,
      reviewed_by INTEGER,
      reviewed_at DATETIME,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`],
    ['intake_submissions', 'self_assessment_id', 'ALTER TABLE intake_submissions ADD COLUMN self_assessment_id INTEGER'],
    ['sa_access_requests', null, `CREATE TABLE IF NOT EXISTS sa_access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT NOT NULL,
      organization TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      access_code TEXT UNIQUE,
      approved_by INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )`],
  ];

  migrations.forEach(([table, column, sql]) => {
    try {
      if (!column) {
        db.run(sql);
        return;
      }
      const cols = db.exec(`PRAGMA table_info(${table})`);
      const hasCol = cols.length && cols[0].values.some(row => row[1] === column);
      if (!hasCol) {
        db.run(sql);
        console.log(`Migration: added ${table}.${column}`);
      }
    } catch (e) {
      // Table might not exist yet, that's fine — CREATE TABLE handles it
    }
  });

  // Custom domains used to be "verified" by self-attestation: the root admin
  // clicked a button and the flag flipped without any DNS lookup. Verification now
  // performs a real DNS check and stamps `domain_checked_at` on success, so
  // `custom_domain_verified = 1` must always imply a non-null `domain_checked_at`.
  // Clear any flag that predates real checking (or that some other path set without
  // one) so those domains show as unverified until they are genuinely re-proven.
  try {
    const stale = db.exec(`SELECT COUNT(*) FROM org_settings
                           WHERE custom_domain_verified = 1 AND domain_checked_at IS NULL`);
    const staleCount = stale.length ? Number(stale[0].values[0][0]) : 0;
    if (staleCount > 0) {
      db.run(`UPDATE org_settings SET custom_domain_verified = 0, updated_at = CURRENT_TIMESTAMP
              WHERE custom_domain_verified = 1 AND domain_checked_at IS NULL`);
      console.log(`Migration: cleared ${staleCount} self-attested custom-domain verification flag(s) — re-validate to prove them via DNS`);
    }
  } catch (e) {
    // org_settings may not exist yet on a brand-new database — nothing to repair.
  }

  // Older databases created POA&M items with assessment_id NOT NULL. ATO/iATO
  // remediation can be project-level, so relax that constraint while preserving rows.
  try {
    const poamInfo = db.exec('PRAGMA table_info(iato_checklist)');
    const assessmentIdCol = poamInfo[0]?.values.find(row => row[1] === 'assessment_id');
    if (assessmentIdCol && Number(assessmentIdCol[3]) === 1) {
      db.run('BEGIN TRANSACTION');
      db.run('ALTER TABLE iato_checklist RENAME TO iato_checklist_old');
      db.run(`
        CREATE TABLE iato_checklist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          assessment_id INTEGER,
          project_id INTEGER,
          ato_record_id INTEGER,
          control_id TEXT,
          description TEXT NOT NULL,
          risk_level TEXT DEFAULT 'medium',
          original_finding TEXT,
          remediation_plan TEXT,
          milestone TEXT,
          deadline DATETIME,
          status TEXT DEFAULT 'open',
          assigned_to TEXT,
          estimated_cost TEXT,
          resources_required TEXT,
          completed_at DATETIME,
          verified_at DATETIME,
          verified_by INTEGER,
          evidence_text TEXT,
          residual_risk TEXT,
          assessor_notes TEXT,
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (ato_record_id) REFERENCES ato_records(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);
      db.run(`
        INSERT INTO iato_checklist (
          id, assessment_id, project_id, ato_record_id, control_id, description, risk_level,
          original_finding, remediation_plan, milestone, deadline, status, assigned_to,
          estimated_cost, resources_required, completed_at, verified_at, verified_by,
          evidence_text, residual_risk, assessor_notes, created_by, created_at, updated_at
        )
        SELECT
          id, assessment_id, project_id, ato_record_id, control_id, description, risk_level,
          original_finding, remediation_plan, milestone, deadline, status, assigned_to,
          estimated_cost, resources_required, completed_at, verified_at, verified_by,
          evidence_text, residual_risk, assessor_notes, created_by, created_at, updated_at
        FROM iato_checklist_old
      `);
      db.run('DROP TABLE iato_checklist_old');
      db.run('COMMIT');
      console.log('Migration: relaxed iato_checklist.assessment_id constraint');
    }
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    console.warn('POA&M assessment_id constraint migration skipped:', e.message);
  }

  const existingAdmin = db.exec(`SELECT id FROM users WHERE email = '${adminEmail}'`);
  if (!existingAdmin.length || !existingAdmin[0].values.length) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    db.run(`INSERT INTO users (email, password, name, role, title, organization) VALUES (?, ?, ?, ?, ?, ?)`,
      [adminEmail, hashedPassword, process.env.ADMIN_NAME || 'Administrator', 'assessor', 'IT Security Assessor', 'Your Agency']);
    console.log('Default assessor account created:', adminEmail);
  }

  try {
    const { CONTROLS, CONTROL_FAMILIES } = require('../config/itsg33-controls');
    const frameworkCatalog = require('../config/framework-control-data.json');
    const insert = db.prepare(`INSERT OR REPLACE INTO security_control_catalog
      (framework, control_id, title, family, description, guidance, definitions, related_controls, baseline, category, applicability_notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let seededCount = 0;
    const seededByFramework = {};
    const upsertCatalogRow = (row) => {
      insert.bind([
        row.framework,
        row.control_id,
        row.title,
        row.family || '',
        row.description || '',
        row.guidance || '',
        row.definitions || '',
        row.related_controls || '',
        row.baseline || '',
        row.category || '',
        row.applicability_notes || '',
        row.status || 'active'
      ]);
      insert.step();
      insert.reset();
      seededCount += 1;
      seededByFramework[row.framework] = (seededByFramework[row.framework] || 0) + 1;
    };

    CONTROLS.forEach(control => upsertCatalogRow({
      framework: 'ITSG-33',
      control_id: control.id,
      title: control.title,
      family: control.family,
      description: control.description || '',
      guidance: control.evidenceGuidance || '',
      definitions: JSON.stringify(control.tags || []),
      related_controls: JSON.stringify([]),
      baseline: (control.profiles || []).join(', '),
      category: CONTROL_FAMILIES[control.family] || control.family,
      applicability_notes: (control.commonInheritance || []).join(', '),
      status: 'active'
    }));

    (frameworkCatalog.controls || []).forEach(upsertCatalogRow);
    insert.free();
    const summary = Object.entries(seededByFramework)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([framework, count]) => `${framework}: ${count}`)
      .join('; ');
    console.log(`Security control catalog upserted (${seededCount} controls; ${summary})`);
  } catch (e) {
    console.warn('Security control catalog seed skipped:', e.message);
  }

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  const lastId = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
  saveDatabase();
  return lastId;
}

// Batch run - inserts multiple rows without saving after each one
function runBatch(statements) {
  let lastId;
  statements.forEach(({ sql, params }) => {
    const stmt = db.prepare(sql);
    stmt.bind(params || []);
    stmt.step();
    stmt.free();
  });
  lastId = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
  saveDatabase();
  return lastId;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    const obj = stmt.getAsObject();
    // sql.js can return Uint8Array for TEXT columns — convert to strings
    for (const key of Object.keys(obj)) {
      if (obj[key] instanceof Uint8Array) {
        obj[key] = new TextDecoder().decode(obj[key]);
      }
    }
    results.push(obj);
  }
  stmt.free();
  return results;
}

function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

module.exports = { initDatabase, saveDatabase, getDb, run, runBatch, all, get };
