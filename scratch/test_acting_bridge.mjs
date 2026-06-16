import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ActingBridge,
  chooseActingState,
  normalizeTalkingState,
  resolveTraceActingState,
} from '../js/ActingBridge.js';

function makeTrace(executeStatus, policyStatus = 'ok', executeReason) {
  return {
    action: 'query_pipe',
    tool: 'query_pipe',
    trace: [
      { step: 'normalize', status: 'ok' },
      { step: 'self_heal', status: 'skipped' },
      { step: 'policy_check', status: policyStatus },
      {
        step: 'execute_tool',
        status: executeStatus,
        ...(executeReason ? { reason: executeReason } : {}),
      },
    ],
  };
}

function createHarness(options = {}) {
  const calls = [];
  const scheduled = [];
  let now = 1000;

  const mascot = {
    act(state, meta) {
      calls.push({ type: 'act', state, meta });
      return { state, meta };
    },
    setExpression() {
      throw new Error('ActingBridge must not call setExpression directly');
    },
    playClip() {
      throw new Error('ActingBridge must not call playClip directly');
    },
    setGaze() {
      throw new Error('ActingBridge must not call setGaze directly');
    },
  };

  const bridge = new ActingBridge(mascot, {
    now: () => now,
    setTimeoutFn(fn, ms) {
      const id = scheduled.length + 1;
      scheduled.push({ id, fn, ms, cleared: false });
      return id;
    },
    clearTimeoutFn(id) {
      const target = scheduled.find(item => item.id === id);
      if (target) target.cleared = true;
    },
    transientMs: options.transientMs !== undefined ? options.transientMs : 1200,
  });

  return {
    bridge,
    calls,
    scheduled,
    advance(ms) {
      now += ms;
    },
    runNextTimer() {
      const timer = scheduled.find(item => !item.cleared);
      assert.ok(timer, 'expected a scheduled timer');
      timer.cleared = true;
      timer.fn();
    },
  };
}

function lastCall(calls) {
  return calls[calls.length - 1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMethodBody(source, methodName) {
  const escapedName = escapeRegExp(methodName);
  const methodMatch = source.match(new RegExp(`(^|\\n)\\s{2}${escapedName}\\s*\\([^)]*\\)\\s*\\{`));
  assert.ok(methodMatch, `${methodName} should exist`);

  const bodyStart = methodMatch.index + methodMatch[0].lastIndexOf('{');
  assert.notEqual(bodyStart, -1, `${methodName} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  assert.fail(`${methodName} body should close`);
}

function testTraceStateNormalization() {
  assert.equal(resolveTraceActingState(makeTrace('pending')), 'thinking');
  assert.equal(resolveTraceActingState(makeTrace('running')), 'running');
  assert.equal(resolveTraceActingState(makeTrace('done')), 'done');
  assert.equal(resolveTraceActingState(makeTrace('success')), 'success');
  assert.equal(resolveTraceActingState(makeTrace('complete')), 'done');
  assert.equal(resolveTraceActingState(makeTrace('failed', 'ok', 'timeout')), 'failed');
  assert.equal(resolveTraceActingState(makeTrace('timeout')), 'failed');
  assert.equal(resolveTraceActingState(makeTrace('error')), 'error');
  assert.equal(resolveTraceActingState(makeTrace(' error ')), 'error');
  assert.equal(resolveTraceActingState(makeTrace('warning')), 'warning');
  assert.equal(resolveTraceActingState(makeTrace('skipped', 'warning')), 'warning');
  assert.equal(resolveTraceActingState(makeTrace('skipped', 'blocked')), 'blocked');
  assert.equal(resolveTraceActingState({ trace: [] }), 'idle');
}

function testTalkingStateNormalization() {
  assert.equal(normalizeTalkingState('talking'), 'speaking');
  assert.equal(normalizeTalkingState('speaking'), 'speaking');
  assert.equal(normalizeTalkingState('thinking'), 'thinking');
  assert.equal(normalizeTalkingState('idle'), 'idle');
  assert.equal(normalizeTalkingState('not_real'), 'idle');
}

function testPrioritySelection() {
  assert.equal(chooseActingState('running', 'speaking'), 'running');
  assert.equal(chooseActingState('running', 'success'), 'running');
  assert.equal(chooseActingState('running', 'done'), 'running');
  assert.equal(chooseActingState('failed', 'speaking'), 'failed');
  assert.equal(chooseActingState('blocked', 'running'), 'blocked');
  assert.equal(chooseActingState('warning', 'running'), 'warning');
  assert.equal(chooseActingState('done', 'speaking'), 'done');
  assert.equal(chooseActingState('idle', 'success'), 'success');
  assert.equal(chooseActingState('idle', 'speaking'), 'speaking');
  assert.equal(chooseActingState('idle', 'thinking'), 'thinking');
  assert.equal(chooseActingState('idle', 'idle'), 'idle');
}

function testTraceUpdatesCallMascotActOnly() {
  const { bridge, calls } = createHarness();

  bridge.onTraceUpdate(makeTrace('pending'));
  assert.equal(lastCall(calls).state, 'thinking');

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');

  bridge.onTraceUpdate(makeTrace('failed', 'ok', 'timeout'));
  assert.equal(lastCall(calls).state, 'failed');

  assert.deepEqual(
    calls.map(call => call.type),
    ['act', 'act', 'act', 'act']
  );
}

function testPolicyBlockedWinsFromTrace() {
  const { bridge, calls } = createHarness();

  bridge.onTraceUpdate(makeTrace('skipped', 'blocked'));

  assert.equal(lastCall(calls).state, 'blocked');
  assert.equal(lastCall(calls).meta.source, 'trace');
}

function testSpeakingDoesNotOverrideRunning() {
  const { bridge, calls } = createHarness();

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');
  const countAfterRunning = calls.length;

  bridge.onTalkingState('speaking');

  assert.equal(calls.length, countAfterRunning);
  assert.equal(bridge.currentState, 'running');
}

function testTalkingSuccessDoesNotOverrideRunningTrace() {
  const { bridge, calls, scheduled } = createHarness();

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');
  const countAfterRunning = calls.length;

  bridge.onTalkingState('success');

  assert.equal(calls.length, countAfterRunning);
  assert.equal(bridge.currentState, 'running');
  assert.equal(scheduled.length, 0);
}

function testTalkingSuccessDoesNotOverridePendingTrace() {
  const { bridge, calls, scheduled } = createHarness();

  bridge.onTraceUpdate(makeTrace('pending'));
  assert.equal(lastCall(calls).state, 'thinking');
  const countAfterThinking = calls.length;

  bridge.onTalkingState('success');

  assert.equal(calls.length, countAfterThinking);
  assert.equal(bridge.currentState, 'thinking');
  assert.equal(bridge.talkingState, 'idle');
  assert.equal(scheduled.length, 0);
}

function testTalkingDoneDoesNotOverrideRunningTrace() {
  const { bridge, calls, scheduled } = createHarness();

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');
  const countAfterRunning = calls.length;

  bridge.onTalkingState('done');

  assert.equal(calls.length, countAfterRunning);
  assert.equal(bridge.currentState, 'running');
  assert.equal(bridge.talkingState, 'idle');
  assert.equal(scheduled.length, 0);
}

function testSuppressedTalkingSuccessDoesNotResurfaceAfterTraceDone() {
  const { bridge, calls, advance, runNextTimer } = createHarness({
    transientMs: 900,
  });

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');
  const countAfterRunning = calls.length;

  bridge.onTalkingState('success');
  assert.equal(calls.length, countAfterRunning);
  assert.equal(bridge.currentState, 'running');

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');

  advance(900);
  runNextTimer();

  assert.equal(lastCall(calls).state, 'idle');
  assert.equal(bridge.currentState, 'idle');
}

function testFailureOverridesRunningAndSpeaking() {
  const { bridge, calls } = createHarness();

  bridge.onTraceUpdate(makeTrace('running'));
  bridge.onTalkingState('speaking');
  bridge.onTraceUpdate(makeTrace('failed', 'ok', 'timeout'));

  assert.equal(lastCall(calls).state, 'failed');
  assert.equal(bridge.currentState, 'failed');
}

function testSpeakingWorksWhenNoToolStateIsActive() {
  const { bridge, calls } = createHarness();

  bridge.onTalkingState('speaking');

  assert.equal(lastCall(calls).state, 'speaking');
  assert.equal(bridge.currentState, 'speaking');
}

function testDoneIsTransientThenReturnsIdle() {
  const { bridge, calls, scheduled, advance, runNextTimer } = createHarness({
    transientMs: 900,
  });

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');
  assert.equal(scheduled[0].ms, 900);

  advance(900);
  runNextTimer();

  assert.equal(lastCall(calls).state, 'idle');
  assert.equal(bridge.currentState, 'idle');
}

function testTransientReturnsToSpeakingIfTalkingStillActive() {
  const { bridge, calls, advance, runNextTimer } = createHarness({
    transientMs: 900,
  });

  bridge.onTalkingState('speaking');
  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');

  advance(900);
  runNextTimer();

  assert.equal(lastCall(calls).state, 'speaking');
  assert.equal(bridge.currentState, 'speaking');
}

function testDisposeClearsTransientTimerAndIgnoresCapturedCallback() {
  const { bridge, calls, scheduled } = createHarness({
    transientMs: 900,
  });

  bridge.onTalkingState('success');
  assert.equal(lastCall(calls).state, 'success');
  const successTimer = scheduled[0];
  const countAfterSuccess = calls.length;

  bridge.dispose();

  assert.equal(successTimer.cleared, true);
  assert.equal(bridge.traceState, 'idle');
  assert.equal(bridge.talkingState, 'idle');
  assert.equal(bridge.currentState, 'none');

  successTimer.fn();

  assert.equal(calls.length, countAfterSuccess);

  bridge.onTalkingState('success');

  assert.equal(scheduled.length, 1);
  assert.equal(calls.length, countAfterSuccess);
  assert.equal(bridge.currentState, 'none');
}

function testTalkingSuccessIsTransientThenReturnsIdle() {
  const { bridge, calls, scheduled, advance, runNextTimer } = createHarness({
    transientMs: 900,
  });

  bridge.onTalkingState('success');
  assert.equal(lastCall(calls).state, 'success');
  assert.equal(scheduled[0].ms, 900);

  advance(900);
  runNextTimer();

  assert.equal(lastCall(calls).state, 'idle');
  assert.equal(bridge.currentState, 'idle');
}

function testRepeatedSameTalkingSuccessRefreshesTransientTimer() {
  const { bridge, calls, scheduled, advance } = createHarness({
    transientMs: 900,
  });

  bridge.onTalkingState('success');
  assert.equal(lastCall(calls).state, 'success');
  const firstSuccessTimer = scheduled[0];

  advance(450);
  bridge.onTalkingState('success');
  const secondSuccessTimer = scheduled[1];
  const countAfterSecondSuccess = calls.length;

  assert.equal(scheduled.length, 2);
  assert.equal(firstSuccessTimer.cleared, true);
  assert.equal(secondSuccessTimer.ms, 900);
  assert.equal(bridge.currentState, 'success');

  firstSuccessTimer.fn();

  assert.equal(lastCall(calls).state, 'success');
  assert.equal(bridge.currentState, 'success');
  assert.equal(calls.length, countAfterSecondSuccess);

  advance(900);
  secondSuccessTimer.fn();

  assert.equal(lastCall(calls).state, 'idle');
  assert.equal(bridge.currentState, 'idle');
}

function testStaleTransientTimerDoesNotOverrideNewerToolState() {
  const { bridge, calls, scheduled, advance } = createHarness({
    transientMs: 900,
  });

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');
  const staleDoneTimer = scheduled[0];

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');
  const countAfterRunning = calls.length;

  advance(900);
  staleDoneTimer.fn();

  assert.equal(lastCall(calls).state, 'running');
  assert.equal(bridge.currentState, 'running');
  assert.equal(calls.length, countAfterRunning);
}

function testStaleSameStateTransientTimerIsIgnored() {
  const { bridge, calls, scheduled, advance } = createHarness({
    transientMs: 900,
  });

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');
  const firstDoneTimer = scheduled[0];

  bridge.onTraceUpdate(makeTrace('running'));
  assert.equal(lastCall(calls).state, 'running');

  bridge.onTraceUpdate(makeTrace('done'));
  assert.equal(lastCall(calls).state, 'done');
  const secondDoneTimer = scheduled[1];
  const countAfterSecondDone = calls.length;

  advance(900);
  firstDoneTimer.fn();

  assert.equal(lastCall(calls).state, 'done');
  assert.equal(bridge.currentState, 'done');
  assert.equal(calls.length, countAfterSecondDone);

  secondDoneTimer.fn();

  assert.equal(lastCall(calls).state, 'idle');
  assert.equal(bridge.currentState, 'idle');
}

function testVrmMascotUsesBridgeForTraceUpdates() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');

  if (!/\bActingBridge\b/.test(source)) {
    return 'skip';
  }

  const updateTraceBody = extractMethodBody(source, 'updateIntentTrace');

  assert.match(source, /\bActingBridge\b/);
  assert.match(source, /from\s+['"]\.\/ActingBridge\.js['"]/);
  assert.match(source, /#actingBridge\s*=\s*null/);
  assert.match(source, /new\s+ActingBridge\s*\(\s*this\s*\)/);
  assert.match(source, /notifyTalkingState\s*\(\s*state\s*,\s*meta\s*=\s*\{\s*\}\s*\)/);
  assert.match(updateTraceBody, /#actingBridge\s*\?\.\s*onTraceUpdate\s*\(\s*intentObj\s*\)/);
  assert.doesNotMatch(updateTraceBody, /applyDirective/);
}

function testStateMachineEmitsTalkingEventsToBridge() {
  const source = readFileSync('js/MascotStateMachine.js', 'utf8');

  assert.match(source, /notifyTalkingState\s*\(\s*state\s*,\s*meta\s*=\s*\{\s*\}\s*\)/);
  assert.match(source, /this\.\#mascot\.notifyTalkingState\?\.\(\s*state\s*,\s*meta\s*\)\s*\|\|\s*null/);
  assert.match(source, /ctx\.notifyTalkingState\s*\(\s*['"]idle['"]\s*,\s*\{\s*source:\s*['"]idle_state['"]/);
  assert.match(source, /ctx\.notifyTalkingState\s*\(\s*['"]thinking['"]/);
  assert.match(source, /ctx\.notifyTalkingState\s*\(\s*['"]idle['"]\s*,\s*\{\s*source:\s*['"]thinking_exit['"]/);
  assert.match(source, /ctx\.notifyTalkingState\s*\(\s*['"]speaking['"]/);
  assert.match(source, /ctx\.notifyTalkingState\s*\(\s*['"]idle['"]\s*,\s*\{\s*source:\s*['"]talking_exit['"]/);
}

function testContextDigestStillDoesNotContainActingData() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');
  const digestBody = extractMethodBody(source, 'buildContextDigest');

  assert.doesNotMatch(digestBody, /acting|expression|clip|gaze|bridge/i);
}

const tests = [
  testTraceStateNormalization,
  testTalkingStateNormalization,
  testPrioritySelection,
  testTraceUpdatesCallMascotActOnly,
  testPolicyBlockedWinsFromTrace,
  testSpeakingDoesNotOverrideRunning,
  testTalkingSuccessDoesNotOverrideRunningTrace,
  testTalkingSuccessDoesNotOverridePendingTrace,
  testTalkingDoneDoesNotOverrideRunningTrace,
  testSuppressedTalkingSuccessDoesNotResurfaceAfterTraceDone,
  testFailureOverridesRunningAndSpeaking,
  testSpeakingWorksWhenNoToolStateIsActive,
  testDoneIsTransientThenReturnsIdle,
  testTransientReturnsToSpeakingIfTalkingStillActive,
  testDisposeClearsTransientTimerAndIgnoresCapturedCallback,
  testTalkingSuccessIsTransientThenReturnsIdle,
  testRepeatedSameTalkingSuccessRefreshesTransientTimer,
  testStaleTransientTimerDoesNotOverrideNewerToolState,
  testStaleSameStateTransientTimerIsIgnored,
  testVrmMascotUsesBridgeForTraceUpdates,
  testStateMachineEmitsTalkingEventsToBridge,
  testContextDigestStillDoesNotContainActingData,
];

for (const test of tests) {
  const result = test();
  if (result === 'skip') {
    console.log(`SKIP ${test.name}`);
    continue;
  }
  console.log(`PASS ${test.name}`);
}
