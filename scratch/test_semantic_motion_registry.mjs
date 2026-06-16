import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/SemanticMotionRegistryBuilder.js';
const GENERATOR_PATH = 'scratch/generate_semantic_motion_registry.mjs';
const LIBRARY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';
const REGISTRY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_registry.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_registry_report.md';

async function importBuilder() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function motion(overrides) {
  return {
    id: 'cross_no',
    displayName: '交叉制止 / 不可以',
    category: 'warning',
    intentTags: ['deny', 'reject', 'stop', 'not_allowed'],
    agentTriggers: ['政策阻擋', '使用者操作不合法'],
    meanings: ['不行', '停止', '禁止', '拒絕'],
    recipes: ['cross_no'],
    sourceMotions: ['Clapping.vrma', 'SomeOther.vrma'],
    confidence: 0.96,
    runtimeReady: true,
    recipeSummary: '雙手在身前交叉或阻擋。',
    poseHints: { activeSide: 'both', primaryAction: 'cross_block' },
    ...overrides,
  };
}

async function testRegistryBuilderSeparatesSemanticMotionFromPlayback() {
  const { buildSemanticMotionRegistryDocument } = await importBuilder();
  const library = {
    schemaVersion: 1,
    motions: [
      motion({ id: 'cross_no' }),
      motion({
        id: 'come_here',
        displayName: '招手靠近 / 跟我來',
        category: 'guide',
        intentTags: ['guide', 'come_here'],
        agentTriggers: ['引導使用者查看指定位置'],
        meanings: ['過來', '跟上', '往這裡'],
        recipes: ['come_here'],
        sourceMotions: ['ComeHere.vrma'],
        confidence: 0.7,
        poseHints: { activeSide: 'right', primaryAction: 'beckon' },
      }),
    ],
  };

  const doc = buildSemanticMotionRegistryDocument(library, {
    generatedAt: '2026-06-16T00:00:00+08:00',
  });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.phase, 'M6.11 Semantic Motion Registry');
  assert.equal(doc.source, 'semantic_motion_library.json');
  assert.equal(doc.summary.totalMotions, 2);
  assert.equal(doc.summary.runtimePlaybackReadyCount, 0);

  const crossNo = doc.motions.cross_no;
  assert.equal(crossNo.semanticMotionId, 'cross_no');
  assert.equal(crossNo.displayName, '交叉制止 / 不可以');
  assert.equal(crossNo.category, 'warning');
  assert.deepEqual(crossNo.recipes, ['cross_no']);
  assert.deepEqual(crossNo.sourceMotions, ['Clapping.vrma', 'SomeOther.vrma']);
  assert.equal(crossNo.preferredMotion, 'Clapping.vrma');
  assert.deepEqual(crossNo.variants, []);
  assert.equal(crossNo.runtimeReady, false);
  assert.equal(crossNo.runtimeStatus, 'data_ready');
  assert.equal(crossNo.dataReady, true);
}

async function testRegistryBuilderIsDeterministicAndDoesNotMutateLibrary() {
  const { buildSemanticMotionRegistryDocument } = await importBuilder();
  const library = {
    motions: [
      motion({ id: 'victory_pose', sourceMotions: ['VictoryB.vrma', 'VictoryA.vrma'] }),
      motion({ id: 'cross_no', sourceMotions: ['CrossB.vrma', 'CrossA.vrma'] }),
    ],
  };
  const before = JSON.stringify(library);

  const a = buildSemanticMotionRegistryDocument(library, { generatedAt: '2026-06-16T00:00:00+08:00' });
  const b = buildSemanticMotionRegistryDocument(library, { generatedAt: '2026-06-16T00:00:00+08:00' });

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(library), before);
  assert.deepEqual(Object.keys(a.motions), ['cross_no', 'victory_pose']);
  assert.equal(a.motions.cross_no.preferredMotion, 'CrossA.vrma');
}

function testSemanticMotionLibraryExists() {
  assert.equal(existsSync(LIBRARY_PATH), true, `${LIBRARY_PATH} should exist`);
  const library = readJson(LIBRARY_PATH);

  assert.equal(Array.isArray(library.motions), true);
  assert.ok(library.motions.length >= 10);
}

function testGeneratorScriptContractExists() {
  assert.equal(existsSync(GENERATOR_PATH), true, `${GENERATOR_PATH} should exist`);

  const script = readFileSync(GENERATOR_PATH, 'utf8');
  assert.match(script, /semantic_motion_library\.json/);
  assert.match(script, /semantic_motion_registry\.json/);
  assert.match(script, /semantic_motion_registry_report\.md/);
  assert.match(script, /buildSemanticMotionRegistryDocument/);
}

function testGeneratedRegistryArtifactsContractWhenPresent() {
  if (!existsSync(REGISTRY_PATH) || !existsSync(REPORT_PATH)) {
    return;
  }

  const registry = readJson(REGISTRY_PATH);
  const report = readFileSync(REPORT_PATH, 'utf8');

  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.source, 'semantic_motion_library.json');
  assert.equal(typeof registry.motions, 'object');
  assert.ok(Object.keys(registry.motions).length >= 10);
  assert.match(report, /# Semantic Motion Registry Report/);
  assert.match(report, /M6\.11/);

  for (const [id, entry] of Object.entries(registry.motions)) {
    assert.equal(entry.semanticMotionId, id);
    assert.equal(typeof entry.displayName, 'string');
    assert.equal(typeof entry.category, 'string');
    assert.equal(Array.isArray(entry.recipes), true);
    assert.equal(Array.isArray(entry.sourceMotions), true);
    assert.equal(typeof entry.preferredMotion, 'string');
    assert.equal(Array.isArray(entry.variants), true);
    assert.equal(entry.runtimeReady, false);
    assert.equal(entry.runtimeStatus, 'data_ready');
  }
}

await testRegistryBuilderSeparatesSemanticMotionFromPlayback();
await testRegistryBuilderIsDeterministicAndDoesNotMutateLibrary();
testSemanticMotionLibraryExists();
testGeneratorScriptContractExists();
testGeneratedRegistryArtifactsContractWhenPresent();

console.log('test_semantic_motion_registry: ok');
