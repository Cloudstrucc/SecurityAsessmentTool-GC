const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const INTAKE_UPLOAD_DIR = process.env.INTAKE_UPLOAD_DIR || path.join(UPLOAD_DIR, 'intakes');
const PROJECT_UPLOAD_DIR = process.env.PROJECT_UPLOAD_DIR || path.join(UPLOAD_DIR, 'projects');
const BRANDING_UPLOAD_DIR = process.env.BRANDING_UPLOAD_DIR || path.join(UPLOAD_DIR, 'branding');
const AI_TEMP_UPLOAD_DIR = process.env.AI_TEMP_UPLOAD_DIR || path.join(UPLOAD_DIR, 'ai-temp');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureUploadDirs() {
  [UPLOAD_DIR, INTAKE_UPLOAD_DIR, PROJECT_UPLOAD_DIR, BRANDING_UPLOAD_DIR, AI_TEMP_UPLOAD_DIR].forEach(ensureDir);
}

module.exports = {
  UPLOAD_DIR,
  INTAKE_UPLOAD_DIR,
  PROJECT_UPLOAD_DIR,
  BRANDING_UPLOAD_DIR,
  AI_TEMP_UPLOAD_DIR,
  ensureUploadDirs
};
