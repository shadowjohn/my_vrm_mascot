import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/SemanticMotionLibraryBuilder.js';
const GENERATOR_PATH = 'scratch/generate_semantic_motion_library.mjs';
const RECIPES_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipes.json';
const LIBRARY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library_report.md';

async function importBuilder() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function recipe(overrides) {
  return {
    recipeId: 'cross_no',
    displayName: '交叉制止',
    sourceMotions: ['Clapping.vrma'],
    matchedKeywords: ['不行', '禁止', '交叉'],
    motionSummary: '雙手在身前交叉或阻擋。',
    agentUsages: ['制止使用者操作', '提醒異常狀態'],
    poseHints: {
      activeSide: 'both',
      primaryAction: 'cross_block',
      repeatable: false,
    },
    confidence: 0.96,
    evidence: [],
    ...overrides,
  };
}

function findEntry(doc, id) {
  return doc.motions.find((entry) => entry.id === id);
}

async function testLibraryBuilderUpgradesRecipesIntoSemanticMotions() {
  const { buildSemanticMotionLibraryDocument } = await importBuilder();
  const recipesDocument = {
    schemaVersion: 1,
    recipes: [
      recipe({ recipeId: 'cross_no' }),
      recipe({
        recipeId: 'come_here',
        displayName: '招手靠近',
        sourceMotions: ['ComeHere.vrma'],
        matchedKeywords: ['招手', '過來', '跟上'],
        motionSummary: '右手向自己方向連續招手。',
        agentUsages: ['引導使用者查看指定位置'],
        poseHints: { activeSide: 'right', primaryAction: 'beckon', repeatable: true },
        confidence: 0.72,
      }),
    ],
  };

  const doc = buildSemanticMotionLibraryDocument(recipesDocument, {
    generatedAt: '2026-06-16T00:00:00+08:00',
  });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.phase, 'M6.8 Semantic Motion Library');
  assert.equal(doc.source, 'pose_style_recipes.json');
  assert.equal(doc.summary.totalMotions, 2);

  const crossNo = findEntry(doc, 'cross_no');
  assert.equal(crossNo.displayName, '交叉制止 / 不可以');
  assert.equal(crossNo.category, 'warning');
  assert.deepEqual(crossNo.recipes, ['cross_no']);
  assert.deepEqual(crossNo.sourceMotions, ['Clapping.vrma']);
  assert.equal(crossNo.runtimeReady, true);
  assert.ok(crossNo.intentTags.includes('not_allowed'));
  assert.ok(crossNo.agentTriggers.includes('政策阻擋'));
  assert.ok(crossNo.meanings.includes('禁止'));

  const comeHere = findEntry(doc, 'come_here');
  assert.equal(comeHere.category, 'guide');
  assert.ok(comeHere.intentTags.includes('guide'));
  assert.ok(comeHere.meanings.includes('往這裡'));
}

async function testLibraryBuilderIsDeterministicAndDoesNotMutateRecipes() {
  const { buildSemanticMotionLibraryDocument } = await importBuilder();
  const recipesDocument = {
    recipes: [
      recipe({ recipeId: 'victory_pose', confidence: 0.75, sourceMotions: ['Victory.vrma'] }),
      recipe({ recipeId: 'cross_no', confidence: 0.96, sourceMotions: ['Cross.vrma'] }),
    ],
  };
  const before = JSON.stringify(recipesDocument);

  const a = buildSemanticMotionLibraryDocument(recipesDocument, { generatedAt: '2026-06-16T00:00:00+08:00' });
  const b = buildSemanticMotionLibraryDocument(recipesDocument, { generatedAt: '2026-06-16T00:00:00+08:00' });

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(recipesDocument), before);
  assert.deepEqual(a.motions.map((entry) => entry.id), ['cross_no', 'victory_pose']);
}

async function testSemanticMotionDefinitionsCoverFirstBatch() {
  const { SEMANTIC_MOTION_IDS } = await importBuilder();

  assert.deepEqual(SEMANTIC_MOTION_IDS, [
    'come_here',
    'point_target',
    'cross_no',
    'thinking_chin',
    'angry_hands_waist',
    'shy_head_touch',
    'wave_goodbye',
    'look_around',
    'victory_pose',
    'hands_up_surrender',
  ]);
}

function testRecipeArtifactExists() {
  assert.equal(existsSync(RECIPES_PATH), true, `${RECIPES_PATH} should exist`);
  const recipes = readJson(RECIPES_PATH);

  assert.equal(Array.isArray(recipes.recipes), true);
  assert.ok(recipes.recipes.length >= 10);
}

function testGeneratorScriptContractExists() {
  assert.equal(existsSync(GENERATOR_PATH), true, `${GENERATOR_PATH} should exist`);

  const script = readFileSync(GENERATOR_PATH, 'utf8');
  assert.match(script, /pose_style_recipes\.json/);
  assert.match(script, /semantic_motion_library\.json/);
  assert.match(script, /semantic_motion_library_report\.md/);
  assert.match(script, /buildSemanticMotionLibraryDocument/);
}

function testGeneratedArtifactsContractWhenPresent() {
  if (!existsSync(LIBRARY_PATH) || !existsSync(REPORT_PATH)) {
    return;
  }

  const library = readJson(LIBRARY_PATH);
  const report = readFileSync(REPORT_PATH, 'utf8');

  assert.equal(library.schemaVersion, 1);
  assert.equal(library.source, 'pose_style_recipes.json');
  assert.equal(Array.isArray(library.motions), true);
  assert.ok(library.motions.length >= 10);
  assert.match(report, /# Semantic Motion Library Report/);
  assert.match(report, /M6\.8/);

  for (const entry of library.motions) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.displayName, 'string');
    assert.equal(typeof entry.category, 'string');
    assert.equal(Array.isArray(entry.intentTags), true);
    assert.equal(Array.isArray(entry.agentTriggers), true);
    assert.equal(Array.isArray(entry.meanings), true);
    assert.equal(Array.isArray(entry.recipes), true);
    assert.equal(Array.isArray(entry.sourceMotions), true);
    assert.equal(typeof entry.confidence, 'number');
    assert.equal(typeof entry.runtimeReady, 'boolean');
  }
}

await testLibraryBuilderUpgradesRecipesIntoSemanticMotions();
await testLibraryBuilderIsDeterministicAndDoesNotMutateRecipes();
await testSemanticMotionDefinitionsCoverFirstBatch();
testRecipeArtifactExists();
testGeneratorScriptContractExists();
testGeneratedArtifactsContractWhenPresent();

console.log('test_semantic_motion_library: ok');
