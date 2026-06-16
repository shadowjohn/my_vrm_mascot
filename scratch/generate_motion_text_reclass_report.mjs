import { readFileSync, writeFileSync } from 'node:fs';
import { buildMotionTextReclassReport } from '../js/MotionTextClassifier.js';

const PROFILE_PATH = 'examples/m6_7_vrma_samples/review/motion_profiles.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/motion_text_reclass_report.json';

function formatTaipeiTimestamp(date = new Date()) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().replace('Z', '+08:00');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const profileFile = readJson(PROFILE_PATH);
const profiles = profileFile.profiles || {};
const report = buildMotionTextReclassReport(profiles, {
  generatedAt: formatTaipeiTimestamp(),
});

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Text reclass report written: ${REPORT_PATH}`);
console.log(`Profiles: ${report.summary.totalProfiles}`);
console.log(`Reclass candidates: ${report.summary.reclassCandidateCount}`);
