import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/PoseStyleRecipeGenerator.js';
const GENERATOR_PATH = 'scratch/generate_pose_style_recipes.mjs';
const PROFILE_PATH = 'examples/m6_7_vrma_samples/review/motion_profiles.json';
const RECIPES_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipes.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipe_report.md';

async function importRecipeGenerator() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function profile(overrides) {
  return {
    source: 'sample.vrma',
    motionCategory: 'point',
    motionScore: 4,
    description: '',
    usageDescription: '',
    agentUsage: [],
    ...overrides,
  };
}

function findRecipe(recipes, recipeId) {
  return recipes.find((recipe) => recipe.recipeId === recipeId);
}

async function testRecipeGeneratorExtractsCoreRecipes() {
  const { buildPoseStyleRecipeDocument } = await importRecipeGenerator();
  const profiles = {
    'ComeHere.vrma': profile({
      description: '右手伸向前方，手掌朝向自己，重複向自己方向招手。',
      usageDescription: '請過來、跟上、往這邊。',
      agentUsage: ['引導使用者查看指定位置', '呼叫使用者注意某個目標'],
    }),
    'CrossNo.vrma': profile({
      motionCategory: 'warning',
      description: '雙手在面前連續交叉數次。',
      usageDescription: '這件事情不對，不是這樣，嚴格禁止。',
      agentUsage: ['制止使用者操作', '提醒異常狀態'],
    }),
    'Thinking.vrma': profile({
      motionCategory: 'think',
      description: '右手靠近下巴，頭微低，像是在思考。',
      usageDescription: '分析中、等待查詢結果。',
      agentUsage: ['回覆前的思考狀態'],
    }),
  };

  const doc = buildPoseStyleRecipeDocument(profiles, { generatedAt: '2026-06-16T00:00:00+08:00' });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.phase, 'M6.7.6B Pose Style Recipe Generator');
  assert.equal(doc.summary.totalProfiles, 3);

  const comeHere = findRecipe(doc.recipes, 'come_here');
  assert.ok(comeHere, 'come_here recipe should be generated');
  assert.deepEqual(comeHere.sourceMotions, ['ComeHere.vrma']);
  assert.equal(comeHere.poseHints.activeSide, 'right');
  assert.equal(comeHere.poseHints.primaryAction, 'beckon');
  assert.equal(comeHere.poseHints.repeatable, true);
  assert.ok(comeHere.confidence >= 0.7);

  const crossNo = findRecipe(doc.recipes, 'cross_no');
  assert.ok(crossNo, 'cross_no recipe should be generated');
  assert.equal(crossNo.poseHints.primaryAction, 'cross_block');

  const thinking = findRecipe(doc.recipes, 'thinking_chin');
  assert.ok(thinking, 'thinking_chin recipe should be generated');
  assert.equal(thinking.poseHints.primaryAction, 'chin_touch');
}

async function testRecipeDocumentIsDeterministicAndDoesNotMutateProfiles() {
  const { buildPoseStyleRecipeDocument } = await importRecipeGenerator();
  const profiles = {
    'Angry.vrma': profile({
      motionCategory: 'warning',
      description: '雙手插腰，頭微微歪一邊晃頭。',
      usageDescription: '羽山娘生氣中。',
      agentUsage: ['提醒使用者犯錯講不聽', '警告限制或異常狀態'],
    }),
  };
  const before = JSON.stringify(profiles);

  const a = buildPoseStyleRecipeDocument(profiles, { generatedAt: '2026-06-16T00:00:00+08:00' });
  const b = buildPoseStyleRecipeDocument(profiles, { generatedAt: '2026-06-16T00:00:00+08:00' });

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(profiles), before);
  assert.equal(a.recipes[0].recipeId, 'angry_hands_waist');
  assert.equal(a.recipes[0].poseHints.primaryAction, 'hands_on_waist');
}

async function testRecipeSetIncludesOnlyKnownFirstBatchIds() {
  const { FIRST_BATCH_RECIPE_IDS } = await importRecipeGenerator();

  assert.deepEqual(FIRST_BATCH_RECIPE_IDS, [
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

function testRealProfilesAreAvailable() {
  const data = readJson(PROFILE_PATH);

  assert.equal(typeof data.profiles, 'object');
  assert.ok(Object.keys(data.profiles).length >= 150);
}

function testGeneratorScriptContractExists() {
  assert.equal(existsSync(GENERATOR_PATH), true, `${GENERATOR_PATH} should exist`);

  const script = readFileSync(GENERATOR_PATH, 'utf8');
  assert.match(script, /motion_profiles\.json/);
  assert.match(script, /pose_style_recipes\.json/);
  assert.match(script, /pose_style_recipe_report\.md/);
  assert.match(script, /buildPoseStyleRecipeDocument/);
}

function testGeneratedRecipeArtifactsContractWhenPresent() {
  if (!existsSync(RECIPES_PATH) || !existsSync(REPORT_PATH)) {
    return;
  }

  const doc = readJson(RECIPES_PATH);
  const report = readFileSync(REPORT_PATH, 'utf8');

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.source, 'motion_profiles.json');
  assert.equal(Array.isArray(doc.recipes), true);
  assert.ok(doc.recipes.length >= 5);
  assert.match(report, /# Pose Style Recipe Report/);
  assert.match(report, /M6\.7\.6B/);

  for (const recipe of doc.recipes) {
    assert.equal(typeof recipe.recipeId, 'string');
    assert.equal(typeof recipe.displayName, 'string');
    assert.equal(Array.isArray(recipe.sourceMotions), true);
    assert.equal(Array.isArray(recipe.matchedKeywords), true);
    assert.equal(typeof recipe.motionSummary, 'string');
    assert.equal(Array.isArray(recipe.agentUsages), true);
    assert.equal(typeof recipe.poseHints, 'object');
    assert.equal(typeof recipe.confidence, 'number');
  }
}

await testRecipeGeneratorExtractsCoreRecipes();
await testRecipeDocumentIsDeterministicAndDoesNotMutateProfiles();
await testRecipeSetIncludesOnlyKnownFirstBatchIds();
testRealProfilesAreAvailable();
testGeneratorScriptContractExists();
testGeneratedRecipeArtifactsContractWhenPresent();

console.log('test_pose_style_recipe_generator: ok');
