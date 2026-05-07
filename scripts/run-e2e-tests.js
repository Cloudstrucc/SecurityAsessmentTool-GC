#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportsDir = path.join(root, 'tests', 'reports');
const e2eDir = path.join(root, 'tests', 'e2e');
const testFiles = fs.readdirSync(e2eDir)
  .filter(file => file.endsWith('.test.js'))
  .map(file => path.join('tests', 'e2e', file));

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseSummary(output) {
  const summary = {};
  output.split(/\r?\n/).forEach(line => {
    const match = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (.+)$/);
    if (match) summary[match[1]] = match[2];
  });
  return summary;
}

function markdownReport({ command, exitCode, output, reportName }) {
  const summary = parseSummary(output);
  const rows = ['tests', 'pass', 'fail', 'skipped', 'todo', 'duration_ms']
    .filter(key => summary[key] !== undefined)
    .map(key => `| ${key} | ${summary[key]} |`)
    .join('\n');

  return `# E2E Test Report

- Report: \`${reportName}\`
- Generated: ${new Date().toISOString()}
- Command: \`${command}\`
- Exit code: ${exitCode}

## Summary

| Metric | Value |
| --- | --- |
${rows || '| result | No summary was parsed. |'}

## TAP Output

\`\`\`tap
${output.trim()}
\`\`\`
`;
}

fs.mkdirSync(reportsDir, { recursive: true });

const reportName = `e2e-${timestamp()}.md`;
const reportPath = path.join(reportsDir, reportName);
const args = ['--test', ...testFiles];
const command = `node ${args.join(' ')}`;
const child = spawn(process.execPath, args, {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';

child.stdout.on('data', chunk => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

child.stderr.on('data', chunk => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

child.on('close', code => {
  fs.writeFileSync(reportPath, markdownReport({ command, exitCode: code, output, reportName }));
  console.log(`\nE2E report written to ${path.relative(root, reportPath)}`);
  process.exit(code);
});
