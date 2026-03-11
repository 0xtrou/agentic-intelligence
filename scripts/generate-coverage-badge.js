#!/usr/bin/env node
/**
 * Aggregate coverage from all packages and generate coverage.json for shields.io
 */
const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, '../packages');
const packages = fs.readdirSync(packagesDir);

let totalStatements = 0;
let coveredStatements = 0;

for (const pkg of packages) {
  const coveragePath = path.join(packagesDir, pkg, 'coverage/coverage-summary.json');
  if (fs.existsSync(coveragePath)) {
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const total = coverage.total;
    
    totalStatements += total.statements.total;
    coveredStatements += total.statements.covered;
  }
}

const percentage = totalStatements > 0
  ? Math.round((coveredStatements / totalStatements) * 100 * 100) / 100
  : 0;

const color = percentage >= 80 ? 'brightgreen' : percentage >= 60 ? 'yellow' : 'red';

const badgeData = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${percentage}%`,
  color: color
};

// Write badge data
const outputPath = path.join(__dirname, '../coverage.json');
fs.writeFileSync(outputPath, JSON.stringify(badgeData, null, 2));

console.log(`Coverage: ${percentage}% (${coveredStatements}/${totalStatements} statements)`);
console.log(`Badge data written to ${outputPath}`);
