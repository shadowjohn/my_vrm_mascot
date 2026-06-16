import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const DEMO_PATH = 'm6_acting_bridge_demo.html';

function readDemo() {
  assert.ok(existsSync(DEMO_PATH), `${DEMO_PATH} should exist`);
  return readFileSync(DEMO_PATH, 'utf8');
}

function testDemoHtmlContractExists() {
  const html = readDemo();

  assert.match(html, /Phase M6\.5/);
  assert.match(html, /演出橋接測試台/);
  assert.match(html, /id=["']demoTraceList["']/);
  assert.match(html, /id=["']demoBridgeState["']/);
  assert.match(html, /id=["']demoLog["']/);
  assert.match(html, /id=["']demoCurrentAction["']/);
}

function testDemoButtonsExposeRequiredActions() {
  const html = readDemo();
  const requiredActions = [
    'act:success',
    'act:warning',
    'act:blocked',
    'act:failed',
    'trace:pending',
    'trace:running',
    'trace:done',
    'trace:failed',
    'trace:blocked',
    'talking:thinking',
    'talking:speaking',
    'talking:idle',
    'scenario:tool_success',
    'scenario:tool_failed',
    'scenario:speaking_while_running',
  ];

  for (const action of requiredActions) {
    assert.match(html, new RegExp(`data-demo-action=["']${action}["']`));
  }

  const requiredLabels = [
    '演出：成功',
    '演出：警告',
    '演出：阻擋',
    '演出：失敗',
    '追蹤：等待中',
    '追蹤：執行中',
    '追蹤：完成',
    '追蹤：失敗',
    '追蹤：已阻擋',
    '對話：思考中',
    '對話：說話中',
    '對話：待機',
    '情境：工具成功流程',
    '情境：工具失敗流程',
    '情境：執行中說話',
  ];

  for (const label of requiredLabels) {
    assert.match(html, new RegExp(label));
  }
}

function testDemoUsesBridgeFacingApisOnly() {
  const html = readDemo();

  assert.match(html, /import\s+\{\s*VrmMascot\s*,\s*createIntentTrace\s*\}\s+from\s+['"]\.\/js\/VrmMascot\.js['"]/);
  assert.match(html, /mascot\.act\(/);
  assert.match(html, /mascot\.updateIntentTrace\(/);
  assert.match(html, /mascot\.notifyTalkingState\(/);
  assert.doesNotMatch(html, /mascot\.performIntent\(/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\bXMLHttpRequest\b/);
}

function testDemoIncludesScenarioAndTraceHelpers() {
  const html = readDemo();

  assert.match(html, /追蹤時間線/);
  assert.match(html, /事件紀錄/);
  assert.match(html, /工具執行中仍維持展示動作/);
  assert.match(html, /function\s+applyTraceStatus\s*\(/);
  assert.match(html, /function\s+runScenario\s*\(/);
  assert.match(html, /function\s+renderTrace\s*\(/);
  assert.match(html, /function\s+appendLog\s*\(/);
  assert.match(html, /tool_success/);
  assert.match(html, /tool_failed/);
  assert.match(html, /speaking_while_running/);
}

const tests = [
  testDemoHtmlContractExists,
  testDemoButtonsExposeRequiredActions,
  testDemoUsesBridgeFacingApisOnly,
  testDemoIncludesScenarioAndTraceHelpers,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
