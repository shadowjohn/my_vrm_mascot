import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/MotionTextClassifier.js';
const GENERATOR_PATH = 'scratch/generate_motion_text_reclass_report.mjs';
const PROFILE_PATH = 'examples/m6_7_vrma_samples/review/motion_profiles.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/motion_text_reclass_report.json';

async function importClassifier() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sampleProfile(overrides) {
  return {
    source: 'sample.vrma',
    motionCategory: 'present',
    motionScore: 4,
    description: '',
    usageDescription: '',
    agentUsage: [],
    ...overrides,
  };
}

function testProfileDataIsDescriptionComplete() {
  const data = readJson(PROFILE_PATH);
  const profiles = data.profiles;

  assert.equal(typeof profiles, 'object');
  assert.ok(Object.keys(profiles).length >= 150, 'motion profiles should include the mined batch');

  for (const [source, profile] of Object.entries(profiles)) {
    assert.equal(typeof profile.description, 'string', `${source} should include human description`);
    assert.notEqual(profile.description.trim(), '', `${source} description should not be empty`);
    assert.equal(typeof profile.usageDescription, 'string', `${source} should include usage description`);
    assert.notEqual(profile.usageDescription.trim(), '', `${source} usage should not be empty`);
    assert.equal(Array.isArray(profile.agentUsage), true, `${source} should include agentUsage list`);
    assert.ok(profile.agentUsage.some((item) => String(item).trim()), `${source} agentUsage should not be empty`);
  }
}

async function testClassifierUsesHumanTextOverFileName() {
  const { classifyMotionProfile } = await importClassifier();

  const result = classifyMotionProfile('Clapping.vrma', sampleProfile({
    motionCategory: 'success',
    description: '雙手在面前連續交叉數次',
    usageDescription: '這件事情不對，不是這樣',
    agentUsage: ['這樣不行，很不好', '嚴格禁止，不能這樣'],
  }));

  assert.equal(result.currentCategory, 'success');
  assert.equal(result.suggestedCategory, 'warning');
  assert.ok(result.confidence >= 0.7);
  assert.ok(result.reason.includes('不對') || result.reason.includes('禁止'));
  assert.equal(result.shouldReclassify, true);
}

async function testClassifierRecognizesFutureFullBodyMotions() {
  const { classifyMotionProfile } = await importClassifier();

  const result = classifyMotionProfile('SitToStand.vrma', sampleProfile({
    motionCategory: 'warning',
    description: '坐著，然後雙手往前支撐站起，身體往下落了一些',
    usageDescription: '需要下半身、重心與站起動作才自然',
    agentUsage: ['未來可用於全身情境動作，不適合現在的上半身 Agent 姿勢'],
  }));

  assert.equal(result.suggestedCategory, 'candidate_future');
  assert.equal(result.shouldReclassify, true);
  assert.ok(result.matchedSignals.includes('requires_lower_body'));
}

async function testReportBuilderIsDeterministicAndDoesNotMutateProfiles() {
  const { buildMotionTextReclassReport } = await importClassifier();
  const profiles = {
    'Clapping.vrma': sampleProfile({
      source: 'Clapping.vrma',
      motionCategory: 'success',
      description: '雙手在面前連續交叉數次',
      usageDescription: '這件事情不對，不是這樣',
      agentUsage: ['這樣不行，很不好', '嚴格禁止，不能這樣'],
    }),
    'Thinking.vrma': sampleProfile({
      source: 'Thinking.vrma',
      motionCategory: 'think',
      description: '右手靠近下巴，頭微低',
      usageDescription: '用於思考、分析與等待查詢結果',
      agentUsage: ['查詢中', '分析中'],
    }),
  };
  const before = JSON.stringify(profiles);

  const reportA = buildMotionTextReclassReport(profiles, { generatedAt: '2026-06-16T00:00:00+08:00' });
  const reportB = buildMotionTextReclassReport(profiles, { generatedAt: '2026-06-16T00:00:00+08:00' });

  assert.deepEqual(reportA, reportB);
  assert.equal(JSON.stringify(profiles), before, 'report builder should not mutate source profiles');
  assert.equal(reportA.schemaVersion, 1);
  assert.equal(reportA.source, 'motion_profiles.json');
  assert.equal(reportA.summary.totalProfiles, 2);
  assert.equal(reportA.summary.reclassCandidateCount, 1);
  assert.equal(reportA.reclassCandidates[0].source, 'Clapping.vrma');
  assert.equal(reportA.entries.length, 2);
}

function testGeneratedReportContractWhenPresent() {
  if (!existsSync(REPORT_PATH)) {
    return;
  }

  const report = readJson(REPORT_PATH);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.source, 'motion_profiles.json');
  assert.ok(report.summary.totalProfiles >= 150);
  assert.equal(Array.isArray(report.entries), true);
  assert.equal(Array.isArray(report.reclassCandidates), true);

  for (const entry of report.entries) {
    assert.equal(typeof entry.source, 'string');
    assert.equal(typeof entry.currentCategory, 'string');
    assert.equal(typeof entry.suggestedCategory, 'string');
    assert.equal(typeof entry.confidence, 'number');
    assert.equal(Array.isArray(entry.matchedSignals), true);
    assert.equal(typeof entry.reason, 'string');
  }
}

function testGeneratorScriptContractExists() {
  assert.equal(existsSync(GENERATOR_PATH), true, `${GENERATOR_PATH} should exist`);

  const script = readFileSync(GENERATOR_PATH, 'utf8');
  assert.match(script, /motion_profiles\.json/);
  assert.match(script, /motion_text_reclass_report\.json/);
  assert.match(script, /buildMotionTextReclassReport/);
}

await testProfileDataIsDescriptionComplete();
await testClassifierUsesHumanTextOverFileName();
await testClassifierRecognizesFutureFullBodyMotions();
await testReportBuilderIsDeterministicAndDoesNotMutateProfiles();
testGeneratedReportContractWhenPresent();
testGeneratorScriptContractExists();

console.log('test_motion_text_classifier: ok');
