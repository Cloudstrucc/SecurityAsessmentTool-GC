const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'sa-tool.db');
const DATA_DIR = path.join(__dirname, '..', 'data');

let db = null;

async function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
      mfa_enabled INTEGER DEFAULT 0
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
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
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

  // ── AUDIT SIGNATURES (MFA-verified action log) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      action_label TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      entity_name TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      mfa_method TEXT DEFAULT 'totp',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── INVITATIONS (for both client and assessor invites) ──
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME,
      accepted_by_user_id INTEGER,
      FOREIGN KEY (invited_by) REFERENCES users(id),
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id)
    )
  `);

  // ── ASSESSMENT ASSIGNMENTS (scoped access for peer assessors) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS assessment_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL DEFAULT 'assessment',
      entity_id INTEGER NOT NULL,
      assigned_to INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      role TEXT DEFAULT 'assigned',
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id)
    )
  `);

  // Create default admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@youragency.gc.ca';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';

  // ── SCHEMA MIGRATIONS (safely add columns missing from older databases) ──
  const migrations = [
    ['users', 'totp_secret', 'ALTER TABLE users ADD COLUMN totp_secret TEXT'],
    ['users', 'mfa_enabled', 'ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0'],
    ['projects', 'confidentiality_level', "ALTER TABLE projects ADD COLUMN confidentiality_level TEXT DEFAULT 'protected-b'"],
    ['projects', 'integrity_level', "ALTER TABLE projects ADD COLUMN integrity_level TEXT DEFAULT 'medium'"],
    ['projects', 'availability_level', "ALTER TABLE projects ADD COLUMN availability_level TEXT DEFAULT 'medium'"],
    ['projects', 'security_profile', "ALTER TABLE projects ADD COLUMN security_profile TEXT DEFAULT 'PBMM'"],
    ['projects', 'is_hva', 'ALTER TABLE projects ADD COLUMN is_hva INTEGER DEFAULT 0'],
    ['intake_submissions', 'confidentiality_level', "ALTER TABLE intake_submissions ADD COLUMN confidentiality_level TEXT DEFAULT 'protected-b'"],
    ['intake_submissions', 'integrity_level', "ALTER TABLE intake_submissions ADD COLUMN integrity_level TEXT DEFAULT 'medium'"],
    ['intake_submissions', 'availability_level', "ALTER TABLE intake_submissions ADD COLUMN availability_level TEXT DEFAULT 'medium'"],
    ['intake_submissions', 'security_profile', "ALTER TABLE intake_submissions ADD COLUMN security_profile TEXT DEFAULT 'PBMM'"],
    ['intake_submissions', 'is_hva', 'ALTER TABLE intake_submissions ADD COLUMN is_hva INTEGER DEFAULT 0'],
    ['projects', 'description', 'ALTER TABLE projects ADD COLUMN description TEXT'],
    ['projects', 'technologies', "ALTER TABLE projects ADD COLUMN technologies TEXT DEFAULT '[]'"],
    // WebAuthn (biometric push) + MFA mode
    ['users', 'webauthn_credential_id', 'ALTER TABLE users ADD COLUMN webauthn_credential_id TEXT'],
    ['users', 'webauthn_public_key', 'ALTER TABLE users ADD COLUMN webauthn_public_key TEXT'],
    ['users', 'webauthn_counter', 'ALTER TABLE users ADD COLUMN webauthn_counter INTEGER DEFAULT 0'],
    ['users', 'mfa_mode', "ALTER TABLE users ADD COLUMN mfa_mode TEXT DEFAULT 'totp'"],
    // Client scoping
    ['intake_submissions', 'submitted_by_user_id', 'ALTER TABLE intake_submissions ADD COLUMN submitted_by_user_id INTEGER'],
    ['intake_submissions', 'created_by_assessor_id', 'ALTER TABLE intake_submissions ADD COLUMN created_by_assessor_id INTEGER'],
    ['intake_submissions', 'assigned_to_email', 'ALTER TABLE intake_submissions ADD COLUMN assigned_to_email TEXT'],
    ['assessments', 'client_email', 'ALTER TABLE assessments ADD COLUMN client_email TEXT'],
    // POA&M client remediation evidence
    ['iato_checklist', 'client_evidence', 'ALTER TABLE iato_checklist ADD COLUMN client_evidence TEXT'],
    ['iato_checklist', 'client_evidence_status', "ALTER TABLE iato_checklist ADD COLUMN client_evidence_status TEXT DEFAULT 'pending'"],
    ['iato_checklist', 'client_submitted_at', 'ALTER TABLE iato_checklist ADD COLUMN client_submitted_at DATETIME'],
    // AI pre-review fields on assessment_controls
    ['assessment_controls', 'ai_review_result', 'ALTER TABLE assessment_controls ADD COLUMN ai_review_result TEXT'],
    ['assessment_controls', 'ai_review_comments', 'ALTER TABLE assessment_controls ADD COLUMN ai_review_comments TEXT'],
    ['assessment_controls', 'ai_reviewed_at', 'ALTER TABLE assessment_controls ADD COLUMN ai_reviewed_at DATETIME'],
    // Multi-framework support
    ['assessments', 'selected_frameworks', "ALTER TABLE assessments ADD COLUMN selected_frameworks TEXT DEFAULT '[]'"],
    ['assessment_controls', 'frameworks', "ALTER TABLE assessment_controls ADD COLUMN frameworks TEXT DEFAULT '[]'"],
    ['assessment_controls', 'source_framework', 'ALTER TABLE assessment_controls ADD COLUMN source_framework TEXT'],
    ['assessment_controls', 'framework_refs', "ALTER TABLE assessment_controls ADD COLUMN framework_refs TEXT DEFAULT '[]'"],
    // Region/jurisdiction support for intake
    ['intake_submissions', 'selected_regions', "ALTER TABLE intake_submissions ADD COLUMN selected_regions TEXT DEFAULT '[]'"],
    // Region/framework/client support for projects
    ['projects', 'selected_regions', "ALTER TABLE projects ADD COLUMN selected_regions TEXT DEFAULT '[]'"],
    ['projects', 'selected_frameworks', "ALTER TABLE projects ADD COLUMN selected_frameworks TEXT DEFAULT '[]'"],
    ['projects', 'client_user_id', 'ALTER TABLE projects ADD COLUMN client_user_id INTEGER'],
    ['projects', 'department', 'ALTER TABLE projects ADD COLUMN department TEXT'],
    ['projects', 'branch', 'ALTER TABLE projects ADD COLUMN branch TEXT'],
  ];

  migrations.forEach(([table, column, sql]) => {
    try {
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

  const existingAdmin = db.exec(`SELECT id FROM users WHERE email = '${adminEmail}'`);
  if (!existingAdmin.length || !existingAdmin[0].values.length) {
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    db.run(`INSERT INTO users (email, password, name, role, title, organization) VALUES (?, ?, ?, ?, ?, ?)`,
      [adminEmail, hashedPassword, process.env.ADMIN_NAME || 'Administrator', 'assessor', 'IT Security Assessor', 'Your Agency']);
    console.log('Default assessor account created:', adminEmail);
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
