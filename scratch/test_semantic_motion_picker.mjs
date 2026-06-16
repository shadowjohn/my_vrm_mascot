import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/SemanticMotionPicker.js';
const LIBRARY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';

async function importPicker() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertPick(result, motionId) {
  assert.equal(result.motionId, motionId);
  assert.equal(typeof result.displayName, 'string');
  assert.equal(result.displayName.length > 0, true);
  assert.equal(typeof result.reason, 'string');
  assert.match(result.reason, /matched/i);
  assert.equal(typeof result.confidence, 'number');
  assert.ok(result.confidence >= 0.5 && result.confidence <= 1);
  assert.equal(result.source, 'semantic_motion_library');
}

async function testFirstBatchIntentMapping() {
  const { pickSemanticMotion } = await importPicker();
  const library = readJson(LIBRARY_PATH);

  const cases = [
    [
      { intent: 'warning', trigger: '政策阻擋', context: { selectedFeature: true, toolStatus: 'blocked' } },
      'cross_no',
    ],
    [
      { intent: 'thinking', trigger: '查詢中', context: { toolStatus: 'running' } },
      'thinking_chin',
    ],
    [
      { intent: 'guide', trigger: '引導查看位置', context: { selectedFeature: true } },
      'come_here',
    ],
    [
      { intent: 'point', trigger: '地圖目標', context: { selectedFeature: true } },
      'point_target',
    ],
    [
      { intent: 'social', trigger: '再見', context: {} },
      'wave_goodbye',
    ],
    [
      { intent: 'attention', trigger: '環顧找目標', context: { selectedFeature: true } },
      'look_around',
    ],
    [
      { intent: 'success', trigger: '完成', context: { toolStatus: 'done' } },
      'victory_pose',
    ],
    [
      { intent: 'surprised', trigger: '意外結果', context: { toolStatus: 'failed' } },
      'hands_up_surrender',
    ],
  ];

  for (const [request, expectedMotionId] of cases) {
    assertPick(pickSemanticMotion(request, library), expectedMotionId);
  }
}

async function testPickerUsesIntentTagsAndTriggers() {
  const { pickSemanticMotion } = await importPicker();
  const library = readJson(LIBRARY_PATH);

  assertPick(pickSemanticMotion({ intent: 'deny', trigger: 'not_allowed' }, library), 'cross_no');
  assertPick(pickSemanticMotion({ intent: 'spatial_reference', trigger: '查詢結果位置' }, library), 'point_target');
  assertPick(pickSemanticMotion({ intent: 'done', trigger: '工具執行成功' }, library), 'victory_pose');
}

async function testPickerIsDeterministicAndDoesNotMutateLibrary() {
  const { pickSemanticMotion } = await importPicker();
  const library = readJson(LIBRARY_PATH);
  const before = JSON.stringify(library);
  const request = { intent: 'warning', trigger: '使用者操作不合法', context: { toolStatus: 'blocked' } };

  const a = pickSemanticMotion(request, library);
  const b = pickSemanticMotion(request, library);

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(library), before);
}

async function testPickerReturnsNullWhenNoLibraryMatch() {
  const { pickSemanticMotion } = await importPicker();
  const result = pickSemanticMotion({ intent: 'unknown_intent', trigger: '完全沒有關係的語意' }, { motions: [] });

  assert.equal(result, null);
}

await testFirstBatchIntentMapping();
await testPickerUsesIntentTagsAndTriggers();
await testPickerIsDeterministicAndDoesNotMutateLibrary();
await testPickerReturnsNullWhenNoLibraryMatch();

console.log('test_semantic_motion_picker: ok');
