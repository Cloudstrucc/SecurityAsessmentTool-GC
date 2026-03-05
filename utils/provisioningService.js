// ═══════════════════════════════════════════════════════════════════════════════
// Provisioning Service — Creates tenant Azure App Service instances via SDK
// ═══════════════════════════════════════════════════════════════════════════════
const { ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { WebSiteManagementClient } = require('@azure/arm-appservice');
const { run, get } = require('../models/database');
const fs = require('fs');
const path = require('path');

// ── Configuration ──
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
const AZURE_LOCATION = process.env.AZURE_LOCATION || 'canadacentral';
const AZURE_SKU = process.env.AZURE_PROVISIONING_SKU || 'B1';

/**
 * Check if provisioning is properly configured
 */
function isConfigured() {
  return !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET && AZURE_SUBSCRIPTION_ID);
}

/**
 * Get authenticated Azure clients
 */
function getClients() {
  const credential = new ClientSecretCredential(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET);
  return {
    resourceClient: new ResourceManagementClient(credential, AZURE_SUBSCRIPTION_ID),
    webClient: new WebSiteManagementClient(credential, AZURE_SUBSCRIPTION_ID),
    credential
  };
}

/**
 * Update job status in DB and status file
 */
function updateStatus(jobId, status, progress, step, extra = {}) {
  const sets = [`status='${status}'`, `progress=${progress}`, `step='${step.replace(/'/g, "''")}'`];
  if (extra.appName) sets.push(`app_name='${extra.appName}'`);
  if (extra.instanceUrl) sets.push(`instance_url='${extra.instanceUrl}'`);
  if (extra.error) sets.push(`error_message='${extra.error.replace(/'/g, "''")}'`);
  if (status === 'completed' || status === 'failed') sets.push(`completed_at=CURRENT_TIMESTAMP`);

  try {
    run(`UPDATE provisioning_jobs SET ${sets.join(', ')} WHERE job_id = ?`, [jobId]);
  } catch (e) {
    console.error(`[Provision] Failed to update job ${jobId}:`, e.message);
  }

  // Also write status file for fast polling
  const statusDir = path.join(__dirname, '..', 'provisioning-status');
  try {
    if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });
    fs.writeFileSync(path.join(statusDir, `${jobId}.json`), JSON.stringify({
      job_id: jobId, status, progress, step,
      app_name: extra.appName || '', instance_url: extra.instanceUrl || '',
      error: extra.error || ''
    }));
  } catch (e) { /* non-critical */ }
}

/**
 * Create deployment zip from current application using Node.js archiver
 */
async function createDeployZip() {
  const archiver = require('archiver');
  const zipPath = `/tmp/vcs-tenant-deploy-${Date.now()}.zip`;
  const appRoot = path.join(__dirname, '..');

  // Verify node_modules exists (critical — tenant won't start without it)
  const nodeModulesPath = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    throw new Error(`node_modules not found at ${nodeModulesPath} — cannot create tenant deploy zip`);
  }

  // Sanity check a key dependency
  if (!fs.existsSync(path.join(nodeModulesPath, 'dotenv'))) {
    throw new Error('node_modules/dotenv missing — npm install may not have run on root site');
  }

  console.log(`[Provision] Creating deploy zip from: ${appRoot}`);
  console.log(`[Provision] node_modules exists: true (${fs.readdirSync(nodeModulesPath).length} top-level packages)`);

  // Include node_modules to avoid npm install during deploy (causes 504 on B1).
  // Exclude Azure SDK packages — tenant instances don't provision, only the root site does.
  const excludeDirs = new Set([
    '.git', 'data', 'uploads',
    'provisioning-status',
    '_del_node_modules'  // Oryx artifact — stale node_modules moved aside
  ]);
  const excludeNodeModules = new Set([
    '@azure', // ~54MB of SDK packages not needed on tenant instances
  ]);
  const excludeFiles = new Set([
    'deploy-azure.sh', 'provision-tenant.sh',
    '.DS_Store', 'cookies.txt',
    // Oryx build artifacts from root site — if included, Oryx startup on tenant
    // will extract the stale node_modules.tar.gz and delete our real node_modules/
    'oryx-manifest.toml',
    'node_modules.tar.gz',
    '.oryx_all_node_modules_copied_marker',
    '_del_node_modules'
  ]);
  const excludeExts = new Set(['.db', '.gz', '.tgz']);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    let fileCount = 0;
    let nodeModulesIncluded = false;

    // Walk directory and add files — handles symlinks correctly
    function addDir(dirPath, archivePath) {
      let entries;
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (e) {
        return; // Skip unreadable directories
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const arcPath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

        // Resolve symlinks — treat symlinked dirs as dirs, symlinked files as files
        let isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
          try {
            isDir = fs.statSync(fullPath).isDirectory();
          } catch (e) {
            continue; // Skip broken symlinks
          }
        }

        if (isDir) {
          if (excludeDirs.has(entry.name)) continue;
          // Inside node_modules, skip Azure SDK packages (not needed on tenant)
          if (archivePath === 'node_modules' && excludeNodeModules.has(entry.name)) continue;
          if (entry.name === 'node_modules') nodeModulesIncluded = true;
          addDir(fullPath, arcPath);
        } else {
          if (excludeFiles.has(entry.name)) continue;
          if (entry.name.startsWith('.env')) continue;
          const ext = path.extname(entry.name);
          if (excludeExts.has(ext)) continue;
          archive.file(fullPath, { name: arcPath });
          fileCount++;
        }
      }
    }

    addDir(appRoot, '');

    // Include empty directories that the app expects
    archive.append('', { name: 'data/.gitkeep' });
    archive.append('', { name: 'uploads/.gitkeep' });
    archive.append('', { name: 'uploads/intakes/.gitkeep' });

    archive.finalize();

    // Log after close event fires (in the resolve callback above)
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`[Provision] Deploy zip: ${fileCount} files, ${sizeMB}MB, node_modules=${nodeModulesIncluded}`);
    });
  });
}

/**
 * Deploy zip to web app via Kudu API (async mode to avoid 504 timeouts)
 */
async function deployZipToApp(webClient, resourceGroup, appName, zipPath) {
  // Get publishing credentials
  const creds = await webClient.webApps.beginListPublishingCredentialsAndWait(resourceGroup, appName);
  const kuduUser = creds.publishingUserName;
  const kuduPass = creds.publishingPassword;
  const authHeader = 'Basic ' + Buffer.from(`${kuduUser}:${kuduPass}`).toString('base64');
  const kuduBase = `https://${appName}.scm.azurewebsites.net`;

  const zipBuffer = fs.readFileSync(zipPath);

  // Use async deploy — returns 202 Accepted immediately
  const response = await fetch(`${kuduBase}/api/zipdeploy?isAsync=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'Authorization': authHeader
    },
    body: zipBuffer
  });

  if (response.status !== 202 && response.status !== 200) {
    throw new Error(`Kudu deploy returned ${response.status}: ${response.statusText}`);
  }

  // Poll deployment status (check every 15s for up to 10 minutes)
  const maxPolls = 40;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 15000));
    try {
      const statusResp = await fetch(`${kuduBase}/api/deployments/latest`, {
        headers: { 'Authorization': authHeader }
      });
      if (statusResp.ok) {
        const deploy = await statusResp.json();
        // status: 0=pending, 1=building, 2=deploying, 3=failed, 4=success
        if (deploy.status === 4) {
          console.log(`[Provision] Kudu deploy succeeded after ${(i + 1) * 15}s`);
          return;
        }
        if (deploy.status === 3) {
          throw new Error(`Kudu deploy failed: ${deploy.message || 'Build/deploy error'}`);
        }
        console.log(`[Provision] Kudu deploy status: ${deploy.status} (poll ${i + 1}/${maxPolls})`);
      }
    } catch (pollErr) {
      if (pollErr.message.includes('Kudu deploy failed')) throw pollErr;
      // Transient network error — keep polling
    }
  }
  throw new Error('Kudu deploy timed out after 10 minutes');
}

/**
 * Wait for app to become healthy
 */
async function waitForHealth(instanceUrl, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(`${instanceUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) return true;
    } catch (e) { /* keep trying */ }
    await new Promise(r => setTimeout(r, 15000));
  }
  return false;
}

/**
 * Main provisioning function — runs async in background
 */
async function provisionTenant(jobId, orgSlug, adminEmail, adminPassword, adminName) {
  const appName = `vcs-sa-${orgSlug}`;
  const resourceGroup = `vcs-sa-${orgSlug}-rg`;
  const planName = `${appName}-plan`;
  const domain = `${appName}.azurewebsites.net`;
  const instanceUrl = `https://${domain}`;

  console.log(`[Provision] Starting job ${jobId} for ${orgSlug}`);

  try {
    // ── Validate config ──
    if (!isConfigured()) {
      updateStatus(jobId, 'failed', 5, 'Configuration error', {
        appName, error: 'Azure provisioning credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID.'
      });
      return;
    }

    const { resourceClient, webClient } = getClients();

    // ═══ STEP 1: Create Resource Group ═══
    updateStatus(jobId, 'running', 10, 'Creating resource group...', { appName, instanceUrl });

    await resourceClient.resourceGroups.createOrUpdate(resourceGroup, {
      location: AZURE_LOCATION,
      tags: { product: 'vcs-sa-tool', plan: 'trial', org: orgSlug }
    });
    console.log(`[Provision] ${jobId}: Resource group created`);

    // ═══ STEP 2: Create App Service Plan ═══
    updateStatus(jobId, 'running', 25, 'Creating App Service plan...', { appName, instanceUrl });

    await webClient.appServicePlans.beginCreateOrUpdateAndWait(resourceGroup, planName, {
      location: AZURE_LOCATION,
      sku: { name: AZURE_SKU, tier: AZURE_SKU === 'B1' ? 'Basic' : 'Standard' },
      kind: 'linux',
      reserved: true // Required for Linux
    });
    console.log(`[Provision] ${jobId}: App Service plan created`);

    // ═══ STEP 3: Create Web App ═══
    updateStatus(jobId, 'running', 40, 'Creating web application...', { appName, instanceUrl });

    await webClient.webApps.beginCreateOrUpdateAndWait(resourceGroup, appName, {
      location: AZURE_LOCATION,
      serverFarmId: `/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${planName}`,
      siteConfig: {
        linuxFxVersion: 'NODE|20-lts',
        appCommandLine: 'rm -f /home/site/wwwroot/node_modules.tar.gz /home/site/wwwroot/oryx-manifest.toml /home/site/wwwroot/.oryx_all_node_modules_copied_marker && node app.js',
        alwaysOn: false,
        httpLoggingEnabled: true,
        detailedErrorLoggingEnabled: true
      },
      httpsOnly: true,
      tags: { product: 'vcs-sa-tool', plan: 'trial', org: orgSlug }
    });
    console.log(`[Provision] ${jobId}: Web app created`);

    // ═══ STEP 4: Configure App Settings ═══
    updateStatus(jobId, 'running', 55, 'Configuring environment & credentials...', { appName, instanceUrl });

    const crypto = require('crypto');
    const sessionSecret = crypto.randomBytes(32).toString('base64');

    await webClient.webApps.updateApplicationSettings(resourceGroup, appName, {
      properties: {
        NODE_ENV: 'production',
        PORT: '8080',
        SESSION_SECRET: sessionSecret,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        ADMIN_NAME: adminName,
        WEBAUTHN_RP_ID: domain,
        WEBAUTHN_ORIGIN: instanceUrl,
        WEBSITE_NODE_DEFAULT_VERSION: '~20',
        WEBSITES_ENABLE_APP_SERVICE_STORAGE: 'true',
        SCM_DO_BUILD_DURING_DEPLOYMENT: 'false',
        PLAN_TIER: 'trial',
        MAX_ASSESSMENTS: '3',
        DAILY_ASSESSMENT_LIMIT: '1',
        AI_TOKEN_LIMIT: '25000'
      }
    });
    console.log(`[Provision] ${jobId}: App settings configured`);

    // Enable logging
    await webClient.webApps.updateDiagnosticLogsConfig(resourceGroup, appName, {
      applicationLogs: { fileSystem: { level: 'Information' } },
      httpLogs: { fileSystem: { enabled: true, retentionInDays: 7, retentionInMb: 35 } }
    });

    // ── Wait for SCM container to settle after settings update ──
    // Applying app settings triggers an SCM container restart. If we deploy
    // immediately, Oryx intercepts the zip and wipes node_modules.
    console.log(`[Provision] ${jobId}: Waiting 30s for SCM container to settle...`);
    updateStatus(jobId, 'running', 60, 'Waiting for environment to stabilize...', { appName, instanceUrl });
    await new Promise(r => setTimeout(r, 30000));

    // ═══ STEP 5: Package & Deploy Code ═══
    updateStatus(jobId, 'running', 65, 'Packaging application code...', { appName, instanceUrl });

    let zipPath;
    try {
      zipPath = await createDeployZip();
      const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
      console.log(`[Provision] ${jobId}: Deploy zip created (${zipSize}MB)`);
    } catch (e) {
      updateStatus(jobId, 'failed', 65, 'Failed to package application', {
        appName, instanceUrl, error: `Zip creation failed: ${e.message}`
      });
      return;
    }

    updateStatus(jobId, 'running', 75, 'Deploying to Azure (this may take 3–5 minutes)...', { appName, instanceUrl });

    try {
      await deployZipToApp(webClient, resourceGroup, appName, zipPath);
      console.log(`[Provision] ${jobId}: Code deployed`);
    } catch (e) {
      console.error(`[Provision] ${jobId}: Deploy error:`, e.message);
      updateStatus(jobId, 'failed', 75, 'Code deployment failed', {
        appName, instanceUrl, error: `Deployment failed: ${e.message}`
      });
      // Clean up zip
      try { fs.unlinkSync(zipPath); } catch (_) {}
      return;
    }

    // Clean up zip
    try { fs.unlinkSync(zipPath); } catch (_) {}

    // ═══ STEP 6: Health Check ═══
    updateStatus(jobId, 'running', 90, 'Waiting for instance to become healthy...', { appName, instanceUrl });

    const healthy = await waitForHealth(instanceUrl);
    if (!healthy) {
      // Not necessarily an error — app might just need more startup time
      updateStatus(jobId, 'running', 95, 'Instance deployed — finalizing startup...', { appName, instanceUrl });
      await new Promise(r => setTimeout(r, 20000));
    }

    // ═══ DONE ═══
    updateStatus(jobId, 'completed', 100, 'Your instance is ready!', { appName, instanceUrl });
    console.log(`[Provision] ${jobId}: Complete — ${instanceUrl}`);

  } catch (err) {
    console.error(`[Provision] ${jobId}: Fatal error:`, err);
    updateStatus(jobId, 'failed', 0, 'Provisioning failed', {
      appName, instanceUrl,
      error: err.message || 'An unexpected error occurred during provisioning.'
    });
  }
}

module.exports = { provisionTenant, isConfigured };