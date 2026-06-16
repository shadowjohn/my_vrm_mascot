import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTING_POLICY_STATES,
  ALLOWED_GAZE_MODES,
  ALLOWED_MOTION_NAMES,
  configureSemanticMotionLibrary,
  resolveActingPolicyForState,
  resolveActingPolicyForTrace,
  validateActingPolicy,
} from '../js/ActingPolicy.js';
import { ExpressionProfiles } from '../js/ExpressionProfiles.js';
import { MotionClips } from '../js/MotionClips.js';
import { ActionQueue } from '../js/ActionQueue.js';
import { MascotStateMachine } from '../js/MascotStateMachine.js';
import { PoseDirector } from '../js/PoseDirector.js';
import semanticMotionLibrary from '../examples/m6_7_vrma_samples/review/semantic_motion_library.json' with { type: 'json' };

function createFakeControllers() {
  const calls = [];
  return {
    calls,
    motion: {
      play(name) {
        calls.push({ type: 'motion', name });
      },
      playClip(name) {
        calls.push({ type: 'clip', name });
      },
    },
    expression: {
      setProfile(name, options) {
        calls.push({ type: 'expressionProfile', name, options });
      },
      set(name, weight, fadeSec) {
        calls.push({ type: 'expression', name, weight, fadeSec });
      },
    },
    lookAt: {
      setTarget(mode, data) {
        calls.push({ type: 'gaze', mode, data });
      },
    },
  };
}

function testSuccessPolicyUsesHappyVictoryMouse() {
  const policy = resolveActingPolicyForState('success');

  assert.equal(policy.expression.name, 'happy');
  assert.equal(policy.expression.intensity, 0.85);
  assert.equal(policy.expression.duration, 1200);
  assert.equal(policy.clip.name, 'victory');
  assert.equal(policy.motion, undefined);
  assert.equal(policy.gaze.mode, 'mouse');
}

function testRunningPolicyUsesPresentingAndPointGaze() {
  const policy = resolveActingPolicyForState('running');

  assert.equal(policy.expression.name, 'thinking');
  assert.equal(policy.motion.name, 'presenting');
  assert.equal(policy.clip, undefined);
  assert.deepEqual(policy.gaze, { mode: 'point', data: { x: -0.45, y: 0.05 } });
}

function testBlockedPolicyUsesWarningNodNotLongWarningPose() {
  const policy = resolveActingPolicyForState('blocked');

  assert.equal(policy.expression.name, 'angry');
  assert.equal(policy.clip.name, 'warning_nod');
  assert.equal(policy.motion, undefined);
  assert.equal(policy.gaze.mode, 'mouse');
}

function testThinkingPolicyDoesNotReferenceFakeClip() {
  const policy = resolveActingPolicyForState('thinking');

  assert.equal(policy.expression.name, 'thinking');
  assert.equal(policy.clip, undefined);
  assert.equal(policy.motion.name, 'idle');
  assert.equal(policy.gaze.mode, 'mouse');
}

function testSpeakingPolicyIsNoOpForBridge() {
  const policy = resolveActingPolicyForState('speaking');

  assert.equal(policy.state, 'speaking');
  assert.equal(policy.expression, undefined);
  assert.equal(policy.clip, undefined);
  assert.equal(policy.motion, undefined);
  assert.equal(policy.gaze, undefined);
}

function testUnknownPolicyFallsBackToNeutralIdle() {
  const policy = resolveActingPolicyForState('not_real');

  assert.equal(policy.expression.name, 'neutral');
  assert.equal(policy.motion.name, 'idle');
  assert.equal(policy.clip, undefined);
  assert.equal(policy.gaze.mode, 'none');
}

function testTracePolicyMappingUsesRuntimeStatus() {
  assert.equal(
    resolveActingPolicyForTrace('execute_tool', { status: 'running' }).motion.name,
    'presenting'
  );
  assert.equal(
    resolveActingPolicyForTrace('execute_tool', { status: 'done' }).clip.name,
    'wave'
  );
  assert.equal(
    resolveActingPolicyForTrace('policy_check', { status: 'blocked' }).clip.name,
    'warning_nod'
  );
  assert.equal(
    resolveActingPolicyForTrace('execute_tool', { status: 'failed', reason: 'timeout' }).clip.name,
    'shake_head'
  );
  assert.equal(resolveActingPolicyForTrace('normalize', { status: 'ok' }), null);
}

function testActingPolicyPicksSemanticMotionForTrace() {
  configureSemanticMotionLibrary(semanticMotionLibrary);

  const blockedIntent = { action: 'download_report', tool: 'download_report' };
  const blockedPolicy = resolveActingPolicyForTrace(
    'policy_check',
    { status: 'blocked', reason: 'policy_blocked' },
    blockedIntent
  );
  assert.equal(blockedPolicy.semanticMotionId, 'cross_no');
  assert.equal(blockedPolicy.meta.pickedSemanticMotion.motionId, 'cross_no');
  assert.equal(blockedIntent.pickedSemanticMotion.motionId, 'cross_no');

  const runningIntent = { action: 'query_pipe', tool: 'query_pipe' };
  const runningPolicy = resolveActingPolicyForTrace(
    'execute_tool',
    { status: 'running' },
    runningIntent
  );
  assert.equal(runningPolicy.semanticMotionId, 'thinking_chin');
  assert.equal(runningPolicy.meta.pickedSemanticMotion.motionId, 'thinking_chin');

  const doneIntent = { action: 'download_report', tool: 'download_report' };
  const donePolicy = resolveActingPolicyForTrace(
    'execute_tool',
    { status: 'done' },
    doneIntent
  );
  assert.equal(donePolicy.semanticMotionId, 'victory_pose');
}

function testPolicyReferencesOnlyExistingExpressionClipAndGazeModes() {
  for (const state of ACTING_POLICY_STATES) {
    const policy = resolveActingPolicyForState(state);
    assert.deepEqual(validateActingPolicy(policy), [], `${state} should be valid`);

    if (policy.expression) {
      assert.ok(ExpressionProfiles[policy.expression.name], `${state} expression exists`);
    }
    if (policy.clip) {
      assert.ok(MotionClips[policy.clip.name], `${state} clip exists`);
    }
    if (policy.motion) {
      assert.ok(ALLOWED_MOTION_NAMES.includes(policy.motion.name), `${state} motion exists`);
    }
    if (policy.gaze) {
      assert.ok(ALLOWED_GAZE_MODES.includes(policy.gaze.mode), `${state} gaze exists`);
    }
  }
}

function testActingPolicyStillWorksWithoutSemanticLibrary() {
  configureSemanticMotionLibrary(null);

  const policy = resolveActingPolicyForTrace(
    'policy_check',
    { status: 'blocked', reason: 'policy_blocked' },
    { action: 'download_report', tool: 'download_report' }
  );

  assert.equal(policy.clip.name, 'warning_nod');
  assert.equal(policy.semanticMotionId, undefined);
  assert.equal(policy.meta.pickedSemanticMotion, undefined);
}

function testPoseDirectorAppliesActingPolicyToControllers() {
  const { calls, motion, expression, lookAt } = createFakeControllers();
  const director = new PoseDirector({ motion, expression, lookAt });

  const applied = director.act('success');

  assert.equal(applied.state, 'success');
  assert.deepEqual(calls, [
    {
      type: 'expressionProfile',
      name: 'happy',
      options: { intensity: 0.85, duration: 1200, fadeSec: 0.18 },
    },
    { type: 'clip', name: 'victory' },
    { type: 'gaze', mode: 'mouse', data: undefined },
  ]);
}

function createFakeMascotForStateMachine(options = {}) {
  const { calls, motion, expression, lookAt } = createFakeControllers();
  const mascot = {
    motion,
    expression,
    lookAt,
    queue: { length: 0, isExecuting: false },
    isUserInteracting: false,
    act(state, meta) {
      calls.push({ type: 'act', state, meta });
      return { state, meta };
    },
    notifyTalkingState(state, meta) {
      calls.push({ type: 'talkingState', state, meta });
      return options.notifyTalkingState?.(state, meta) ?? { state, meta };
    },
    _getBlendShapeProxy() {
      return null;
    },
  };
  return { calls, mascot };
}

function testTalkingStateIgnoresArbitraryActingStateAndNotifiesSpeaking() {
  const { calls, mascot } = createFakeMascotForStateMachine();
  const machine = new MascotStateMachine(mascot);

  machine.dispatch('talking', {
    text: '完成',
    emotion: 'joy',
    motion: 'wave',
    actingState: 'success',
  });

  assert.deepEqual(calls, [
    {
      type: 'talkingState',
      state: 'speaking',
      meta: { source: 'talking_state', text: '完成' },
    },
    { type: 'expression', name: 'joy', weight: 0.8, fadeSec: 0.3 },
    { type: 'motion', name: 'wave' },
  ]);
}

function testPlainTalkingKeepsLegacyEmotionMotionAndNotifiesSpeaking() {
  const { calls, mascot } = createFakeMascotForStateMachine();
  const machine = new MascotStateMachine(mascot);

  machine.dispatch('talking', {
    text: '一般說話',
    emotion: 'joy',
    motion: 'wave',
  });

  assert.deepEqual(calls, [
    {
      type: 'talkingState',
      state: 'speaking',
      meta: { source: 'talking_state', text: '一般說話' },
    },
    { type: 'expression', name: 'joy', weight: 0.8, fadeSec: 0.3 },
    { type: 'motion', name: 'wave' },
  ]);
}

function testIdleDoesNotOverrideActiveTracePose() {
  const { calls, mascot } = createFakeMascotForStateMachine({
    notifyTalkingState(state, meta) {
      if (state === 'idle') {
        return { state: 'running', skipped: true, meta };
      }
      return { state, meta };
    },
  });
  const machine = new MascotStateMachine(mascot);

  machine.dispatch('idle');

  assert.deepEqual(calls, [
    {
      type: 'talkingState',
      state: 'idle',
      meta: { source: 'idle_state' },
    },
  ]);
}

function testPlainTalkingDoesNotOverrideActiveTracePose() {
  const { calls, mascot } = createFakeMascotForStateMachine({
    notifyTalkingState(state, meta) {
      if (state === 'speaking') {
        return { state: 'running', skipped: true, meta };
      }
      return { state, meta };
    },
  });
  const machine = new MascotStateMachine(mascot);

  machine.dispatch('talking', {
    text: '執行中仍說話',
    emotion: 'joy',
    motion: 'wave',
  });

  assert.deepEqual(calls, [
    {
      type: 'talkingState',
      state: 'speaking',
      meta: { source: 'talking_state', text: '執行中仍說話' },
    },
  ]);
}

function testActionQueueDoesNotForwardActingStateToTalkingDispatch() {
  let dispatched = null;
  const mascot = {
    dispatch(name, params) {
      dispatched = { name, params };
    },
    state: {
      cancelCurrentState() {},
    },
  };
  const queue = new ActionQueue(mascot);

  queue.enqueue({
    type: 'say',
    text: '完成',
    emotion: 'joy',
    motion: 'wave',
    actingState: 'success',
    timeout: 1000,
  });
  queue.clear('test_done');

  assert.equal(dispatched.name, 'talking');
  assert.equal(dispatched.params.text, '完成');
  assert.equal(dispatched.params.emotion, 'joy');
  assert.equal(dispatched.params.motion, 'wave');
  assert.equal(dispatched.params.actingState, undefined);
}

async function testActionQueueDoesNotInjectActingStateIntoToolSuccessSay() {
  const dispatched = [];
  const traceUpdates = [];
  const mascot = {
    dispatch(name, params) {
      dispatched.push({ name, params });
      params.onComplete?.();
    },
    state: {
      cancelCurrentState() {},
    },
    tools: {
      execute() {
        return { ok: true, summary: '工具完成' };
      },
    },
    updateIntentTrace(intentObj, step, patch) {
      traceUpdates.push({ intentObj, step, patch });
    },
  };
  const queue = new ActionQueue(mascot);
  const intentObj = { trace: [] };
  const queueEmpty = new Promise((resolve) => {
    queue.onQueueEmpty = resolve;
  });

  queue.enqueue({
    type: 'tool',
    name: 'demo_tool',
    args: {},
    intentObj,
    timeout: 1000,
    afterText: '結果',
    afterEmotion: 'joy',
    afterMotion: 'wave',
  });
  await queueEmpty;

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].name, 'talking');
  assert.equal(dispatched[0].params.text, '結果，工具完成');
  assert.equal(dispatched[0].params.emotion, 'joy');
  assert.equal(dispatched[0].params.motion, 'wave');
  assert.equal(dispatched[0].params.actingState, undefined);
  assert.deepEqual(
    traceUpdates.map((entry) => [entry.step, entry.patch.status]),
    [
      ['execute_tool', 'running'],
      ['execute_tool', 'done'],
    ]
  );
}

function testVrmMascotExposesActApiWithoutContextDigestPollution() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');
  const digestMatch = source.match(/buildContextDigest\(\) \{[\s\S]*?\n  \}/);

  assert.match(source, /act\(state,\s*meta\s*=\s*\{\}\)/);
  assert.match(source, /actForIntentResult\(status,\s*intentObj\s*=\s*\{\}\)/);
  assert.match(source, /configureSemanticMotionLibrary/);
  assert.match(source, /semantic_motion_library\.json/);
  assert.ok(digestMatch, 'buildContextDigest should remain present');
  assert.doesNotMatch(digestMatch[0], /acting|expression|clip|gaze|semanticMotion/i);
}

const tests = [
  testSuccessPolicyUsesHappyVictoryMouse,
  testRunningPolicyUsesPresentingAndPointGaze,
  testBlockedPolicyUsesWarningNodNotLongWarningPose,
  testThinkingPolicyDoesNotReferenceFakeClip,
  testSpeakingPolicyIsNoOpForBridge,
  testUnknownPolicyFallsBackToNeutralIdle,
  testTracePolicyMappingUsesRuntimeStatus,
  testActingPolicyPicksSemanticMotionForTrace,
  testPolicyReferencesOnlyExistingExpressionClipAndGazeModes,
  testActingPolicyStillWorksWithoutSemanticLibrary,
  testPoseDirectorAppliesActingPolicyToControllers,
  testTalkingStateIgnoresArbitraryActingStateAndNotifiesSpeaking,
  testPlainTalkingKeepsLegacyEmotionMotionAndNotifiesSpeaking,
  testIdleDoesNotOverrideActiveTracePose,
  testPlainTalkingDoesNotOverrideActiveTracePose,
  testActionQueueDoesNotForwardActingStateToTalkingDispatch,
  testActionQueueDoesNotInjectActingStateIntoToolSuccessSay,
  testVrmMascotExposesActApiWithoutContextDigestPollution,
];

for (const test of tests) {
  await test();
  console.log(`PASS ${test.name}`);
}
