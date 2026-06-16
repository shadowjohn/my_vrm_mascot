# Phase M6: Conversation Acting Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ActingBridge` so tool trace and talking lifecycle events automatically drive `mascot.act(state)` without letting runtime code know expression, motion clip, or gaze details.

**Architecture:** `ActingBridge.js` is the only bridge from runtime/talking events to semantic acting states. `ActingPolicy.js` remains the only mapping from acting state to expression, motion/clip, and gaze. `ActionQueue` continues to update trace only; `VrmMascot.updateIntentTrace()` and `MascotStateMachine` forward events to the bridge.

**Tech Stack:** Browser ES modules, vanilla JavaScript, Node standalone tests, existing `VrmMascot`, `ActionQueue`, `MascotStateMachine`, `ActingPolicy`, and `PoseDirector`.

---

## File Structure

- Create `js/ActingBridge.js`
  - Owns trace/talking state normalization, priority, transient completion behavior, and the single output call `mascot.act(state, meta)`.
- Create `scratch/test_acting_bridge.mjs`
  - Standalone Node tests for bridge priority, transient reset, source wiring checks, and controller isolation.
- Modify `js/ActingPolicy.js`
  - Add a `speaking` acting policy state using no new expression, clip, motion, or gaze. This lets the bridge emit `speaking` without creating extra visible behavior.
- Modify `js/VrmMascot.js`
  - Import and instantiate `ActingBridge`.
  - Add `actingBridge` getter and `notifyTalkingState(state, meta)` public bridge hook.
  - Replace direct `resolvePoseDirectiveForTrace()` / `PoseDirector.applyDirective()` in `updateIntentTrace()` with `actingBridge.onTraceUpdate(intentObj)`.
- Modify `js/MascotStateMachine.js`
  - Forward `thinking`, `speaking`, and `idle` lifecycle events to `VrmMascot.notifyTalkingState()`.
  - Keep lip-sync cleanup in `TalkingState`.
  - Preserve legacy explicit `emotion/motion` behavior, but let bridge run last so higher-priority tool states can win.
- Modify `scratch/test_acting_policy.mjs`
  - Add `speaking` policy coverage and update fake mascot bridge hook as needed.
- Modify `README.md`
  - Add a short M6 note and bridge API mention.

## Task 1: Add Failing ActingBridge Tests

**Files:**
- Create: `scratch/test_acting_bridge.mjs`

- [ ] **Step 1: Write the failing bridge test file**

Create `scratch/test_acting_bridge.mjs` with this full content:

```js
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

function testTraceStateNormalization() {
  assert.equal(resolveTraceActingState(makeTrace('pending')), 'thinking');
  assert.equal(resolveTraceActingState(makeTrace('running')), 'running');
  assert.equal(resolveTraceActingState(makeTrace('done')), 'done');
  assert.equal(resolveTraceActingState(makeTrace('failed', 'ok', 'timeout')), 'failed');
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
  assert.equal(chooseActingState('failed', 'speaking'), 'failed');
  assert.equal(chooseActingState('blocked', 'running'), 'blocked');
  assert.equal(chooseActingState('warning', 'running'), 'warning');
  assert.equal(chooseActingState('done', 'speaking'), 'done');
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

function testVrmMascotUsesBridgeForTraceUpdates() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');
  const updateTraceMatch = source.match(/updateIntentTrace\(intentObj, step, patch = \{\}\) \{[\s\S]*?\n  \}/);

  assert.match(source, /import \{ ActingBridge \ } +from '\.\/ActingBridge\.js';/);
  assert.match(source, /#actingBridge = null;/);
  assert.match(source, /new ActingBridge\(this\)/);
  assert.match(source, /notifyTalkingState\(state,\s*meta\s*=\s*\{\}\)/);
  assert.ok(updateTraceMatch, 'updateIntentTrace should exist');
  assert.match(updateTraceMatch[0], /#actingBridge\?\.onTraceUpdate\(intentObj\)/);
  assert.doesNotMatch(updateTraceMatch[0], /applyDirective/);
  assert.doesNotMatch(source, /resolvePoseDirectiveForTrace/);
}

function testStateMachineEmitsTalkingEventsToBridge() {
  const source = readFileSync('js/MascotStateMachine.js', 'utf8');

  assert.match(source, /notifyTalkingState\(state,\s*meta\s*=\s*\{\}\)/);
  assert.match(source, /ctx\.notifyTalkingState\('thinking'/);
  assert.match(source, /ctx\.notifyTalkingState\(params\?\.actingState \|\| 'speaking'/);
  assert.match(source, /ctx\.notifyTalkingState\('idle'/);
}

function testContextDigestStillDoesNotContainActingData() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');
  const digestMatch = source.match(/buildContextDigest\(\) \{[\s\S]*?\n  \}/);

  assert.ok(digestMatch, 'buildContextDigest should remain present');
  assert.doesNotMatch(digestMatch[0], /acting|expression|clip|gaze|bridge/i);
}

const tests = [
  testTraceStateNormalization,
  testTalkingStateNormalization,
  testPrioritySelection,
  testTraceUpdatesCallMascotActOnly,
  testPolicyBlockedWinsFromTrace,
  testSpeakingDoesNotOverrideRunning,
  testFailureOverridesRunningAndSpeaking,
  testSpeakingWorksWhenNoToolStateIsActive,
  testDoneIsTransientThenReturnsIdle,
  testTransientReturnsToSpeakingIfTalkingStillActive,
  testVrmMascotUsesBridgeForTraceUpdates,
  testStateMachineEmitsTalkingEventsToBridge,
  testContextDigestStillDoesNotContainActingData,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node .\scratch\test_acting_bridge.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/ActingBridge.js`.

## Task 2: Implement ActingBridge Core

**Files:**
- Create: `js/ActingBridge.js`
- Test: `scratch/test_acting_bridge.mjs`

- [ ] **Step 1: Add the bridge implementation**

Create `js/ActingBridge.js` with this full content:

```js
/**
 * ActingBridge — 將 runtime / talking 事件正規化成 mascot.act(state)。
 *
 * 這層只負責橋接與優先權，不直接碰 expression、motion clip 或 gaze。
 */

const PRIORITY = Object.freeze({
  idle: 0,
  thinking: 1,
  speaking: 2,
  pending: 1,
  running: 3,
  done: 4,
  success: 4,
  warning: 5,
  blocked: 5,
  failed: 5,
  error: 5,
});

const TRANSIENT_STATES = new Set(['done', 'success']);

function normalizeState(state) {
  const value = String(state || '').toLowerCase();
  if (value === 'talk' || value === 'talking' || value === 'say') return 'speaking';
  if (value === 'pending') return 'thinking';
  if (value === 'timeout') return 'failed';
  if (Object.prototype.hasOwnProperty.call(PRIORITY, value)) return value;
  return 'idle';
}

function getTraceStep(trace, step) {
  return Array.isArray(trace)
    ? trace.find(item => item && item.step === step)
    : null;
}

export function normalizeTalkingState(state) {
  return normalizeState(state);
}

export function resolveTraceActingState(intentObj = {}) {
  const trace = Array.isArray(intentObj?.trace) ? intentObj.trace : [];
  const policyCheck = getTraceStep(trace, 'policy_check');
  const executeTool = getTraceStep(trace, 'execute_tool');
  const policyStatus = String(policyCheck?.status || '').toLowerCase();
  const executeStatus = String(executeTool?.status || '').toLowerCase();

  if (policyStatus === 'blocked') return 'blocked';

  if (executeStatus === 'pending') return 'thinking';
  if (executeStatus === 'running') return 'running';
  if (executeStatus === 'done') return 'done';
  if (executeStatus === 'failed') return 'failed';

  return 'idle';
}

export function chooseActingState(traceState = 'idle', talkingState = 'idle') {
  const trace = normalizeState(traceState);
  const talking = normalizeState(talkingState);
  const tracePriority = Object.prototype.hasOwnProperty.call(PRIORITY, trace) ? PRIORITY[trace] : 0;
  const talkingPriority = Object.prototype.hasOwnProperty.call(PRIORITY, talking) ? PRIORITY[talking] : 0;
  return tracePriority >= talkingPriority ? trace : talking;
}

export class ActingBridge {
  #mascot = null;
  #traceState = 'idle';
  #talkingState = 'idle';
  #currentState = 'none';
  #transientTimer = null;
  #transientState = null;
  #now = () => Date.now();
  #setTimeoutFn = (fn, ms) => setTimeout(fn, ms);
  #clearTimeoutFn = (id) => clearTimeout(id);
  #transientMs = 1400;

  constructor(mascot, options = {}) {
    this.#mascot = mascot || null;
    this.#now = typeof options.now === 'function' ? options.now : this.#now;
    this.#setTimeoutFn = typeof options.setTimeoutFn === 'function'
      ? options.setTimeoutFn
      : this.#setTimeoutFn;
    this.#clearTimeoutFn = typeof options.clearTimeoutFn === 'function'
      ? options.clearTimeoutFn
      : this.#clearTimeoutFn;
    this.#transientMs = Number.isFinite(options.transientMs)
      ? Math.max(0, options.transientMs)
      : this.#transientMs;
  }

  get traceState() {
    return this.#traceState;
  }

  get talkingState() {
    return this.#talkingState;
  }

  get currentState() {
    return this.#currentState;
  }

  onTraceUpdate(intentObj = {}) {
    this.#traceState = resolveTraceActingState(intentObj);
    return this.resolve({
      source: 'trace',
      intent: intentObj,
    });
  }

  onTalkingState(state, meta = {}) {
    this.#talkingState = normalizeTalkingState(state);
    return this.resolve({
      source: 'talking',
      talkingState: this.#talkingState,
      ...meta,
    });
  }

  resolve(meta = {}) {
    const nextState = chooseActingState(this.#traceState, this.#talkingState);
    const result = this.#applyState(nextState, meta);
    this.#syncTransientTimer(nextState);
    return result;
  }

  #applyState(state, meta = {}) {
    if (state === this.#currentState) {
      return {
        state,
        skipped: true,
      };
    }

    this.#currentState = state;
    return this.#mascot?.act?.(state, {
      source: 'acting_bridge',
      bridgeSource: meta.source || 'resolve',
      traceState: this.#traceState,
      talkingState: this.#talkingState,
      time: this.#now(),
      ...meta,
    }) || null;
  }

  #syncTransientTimer(state) {
    if (!TRANSIENT_STATES.has(state)) {
      this.#clearTransientTimer();
      return;
    }

    if (this.#transientState === state && this.#transientTimer) {
      return;
    }

    this.#clearTransientTimer();
    this.#transientState = state;
    this.#transientTimer = this.#setTimeoutFn(() => {
      if (this.#traceState === state) {
        this.#traceState = 'idle';
      }
      this.#transientTimer = null;
      this.#transientState = null;
      this.resolve({ source: 'transient_timeout' });
    }, this.#transientMs);
  }

  #clearTransientTimer() {
    if (this.#transientTimer) {
      this.#clearTimeoutFn(this.#transientTimer);
    }
    this.#transientTimer = null;
    this.#transientState = null;
  }
}
```

- [ ] **Step 2: Run bridge tests**

Run:

```powershell
node .\scratch\test_acting_bridge.mjs
```

Expected: bridge pure tests pass, but source-wiring tests fail because `VrmMascot.js` and `MascotStateMachine.js` are not wired yet.

- [ ] **Step 3: Commit bridge core**

Run:

```powershell
git add .\js\ActingBridge.js .\scratch\test_acting_bridge.mjs
git commit -m "feat: add acting bridge core"
```

## Task 3: Add Speaking State To ActingPolicy

**Files:**
- Modify: `js/ActingPolicy.js`
- Modify: `scratch/test_acting_policy.mjs`

- [ ] **Step 1: Add a failing speaking policy test**

In `scratch/test_acting_policy.mjs`, add this function after `testThinkingPolicyDoesNotReferenceFakeClip()`:

```js
function testSpeakingPolicyIsNoOpForBridge() {
  const policy = resolveActingPolicyForState('speaking');

  assert.equal(policy.state, 'speaking');
  assert.equal(policy.expression, undefined);
  assert.equal(policy.clip, undefined);
  assert.equal(policy.motion, undefined);
  assert.equal(policy.gaze, undefined);
}
```

Add it to the `tests` array immediately after `testThinkingPolicyDoesNotReferenceFakeClip`:

```js
  testThinkingPolicyDoesNotReferenceFakeClip,
  testSpeakingPolicyIsNoOpForBridge,
```

- [ ] **Step 2: Run policy test and verify it fails**

Run:

```powershell
node .\scratch\test_acting_policy.mjs
```

Expected: FAIL because `speaking` currently falls back to `idle`.

- [ ] **Step 3: Add speaking policy**

In `js/ActingPolicy.js`, add `speaking` to `ACTING_POLICY_STATES` after `thinking`:

```js
  'thinking',
  'speaking',
  'pending',
```

Add this policy block after the existing `thinking` policy:

```js
  speaking: {
    state: 'speaking',
  },
```

This intentionally uses no expression, clip, motion, or gaze so M6 does not add new acting capability. Lip sync and legacy explicit speech behavior continue to work outside this no-op policy.

- [ ] **Step 4: Run policy test and bridge test**

Run:

```powershell
node .\scratch\test_acting_policy.mjs
node .\scratch\test_acting_bridge.mjs
```

Expected:

- `test_acting_policy.mjs` passes.
- `test_acting_bridge.mjs` still fails only on source-wiring checks.

- [ ] **Step 5: Commit policy support**

Run:

```powershell
git add .\js\ActingPolicy.js .\scratch\test_acting_policy.mjs
git commit -m "feat: add speaking acting policy state"
```

## Task 4: Wire VrmMascot Trace Events Through ActingBridge

**Files:**
- Modify: `js/VrmMascot.js`
- Test: `scratch/test_acting_bridge.mjs`

- [ ] **Step 1: Update imports**

In `js/VrmMascot.js`, add:

```js
import { ActingBridge } from './ActingBridge.js';
```

Change the `PoseDirector` import from:

```js
import {
  PoseDirector,
  resolvePoseDirectiveForTrace,
} from './PoseDirector.js';
```

to:

```js
import { PoseDirector } from './PoseDirector.js';
```

- [ ] **Step 2: Add bridge field and instantiate it**

In the private subsystem fields, add `#actingBridge = null;` after `#poseDirector = null;`:

```js
  #policyGate = null;
  #poseDirector = null;
  #actingBridge = null;
```

In the constructor, after `this.#poseDirector = new PoseDirector(...)`, add:

```js
    this.#actingBridge = new ActingBridge(this);
```

- [ ] **Step 3: Add bridge public accessors**

After the existing `poseDirector` getter, add:

```js
  /** @returns {ActingBridge} */
  get actingBridge() { return this.#actingBridge; }
```

After `actForIntentResult(status, intentObj = {})`, add:

```js
  /**
   * 將 talking lifecycle 事件交給 ActingBridge；不在 StateMachine 內直接決定表情或動作。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  notifyTalkingState(state, meta = {}) {
    return this.#actingBridge?.onTalkingState(state, meta) || null;
  }
```

- [ ] **Step 4: Replace direct trace directive application**

Replace the whole `updateIntentTrace(intentObj, step, patch = {})` body with:

```js
  updateIntentTrace(intentObj, step, patch = {}) {
    updateTraceStep(intentObj, step, patch);
    this.#actionIntent = intentObj;
    this.#actingBridge?.onTraceUpdate(intentObj);
    this.#emitIntentUpdate();
  }
```

- [ ] **Step 5: Notify idle when action queue becomes empty**

In the constructor `this.#actionQueue.onQueueEmpty = () => { ... }`, add the bridge call before `#emitIntentUpdate()`:

```js
    this.#actionQueue.onQueueEmpty = () => {
      this.#currentIntent = 'idle';
      this.#actingBridge?.onTalkingState('idle', { source: 'queue_empty' });
      this.#emitIntentUpdate();
    };
```

- [ ] **Step 6: Run bridge test**

Run:

```powershell
node .\scratch\test_acting_bridge.mjs
```

Expected: source check for `VrmMascot.js` passes; `MascotStateMachine.js` source check still fails.

- [ ] **Step 7: Commit VrmMascot wiring**

Run:

```powershell
git add .\js\VrmMascot.js .\scratch\test_acting_bridge.mjs
git commit -m "feat: route trace acting through bridge"
```

## Task 5: Wire Talking Lifecycle Events Through ActingBridge

**Files:**
- Modify: `js/MascotStateMachine.js`
- Modify: `scratch/test_acting_policy.mjs`
- Test: `scratch/test_acting_bridge.mjs`

- [ ] **Step 1: Add a StateContext bridge helper**

In `StateContext`, after `hideBubble()`, add:

```js
  /**
   * 將對話狀態交給 ActingBridge；StateMachine 不直接知道表情 / clip / gaze 策略。
   * @param {string} state
   * @param {object} [meta]
   * @returns {object|null}
   */
  notifyTalkingState(state, meta = {}) {
    return this.#mascot.notifyTalkingState?.(state, meta) || null;
  }
```

- [ ] **Step 2: Notify bridge from IdleState**

At the start of `IdleState.onEnter(ctx, params)`, after `super.onEnter(ctx, params);`, add:

```js
    ctx.notifyTalkingState('idle', { source: 'idle_state' });
```

Keep the existing `ctx.motion.play('idle');` and `ctx.expression.set(null);` calls to preserve existing idle behavior.

- [ ] **Step 3: Notify bridge from ThinkingState**

Replace `ThinkingState.onEnter(ctx, params)` with:

```js
  onEnter(ctx, params) {
    super.onEnter(ctx, params);
    this.#elapsed = 0;
    ctx.notifyTalkingState('thinking', { source: 'thinking_state' });
  }
```

Replace `ThinkingState.onExit(ctx)` with:

```js
  onExit(ctx) {
    super.onExit(ctx);
    ctx.notifyTalkingState('idle', { source: 'thinking_exit' });
  }
```

- [ ] **Step 4: Notify bridge from TalkingState**

In `TalkingState.onEnter(ctx, params)`, replace the M5 acting block:

```js
    // M5：若有 actingState，優先由 ActingPolicy 決定 expression / clip / gaze。
    if (params?.actingState) {
      ctx.mascot.act(params.actingState, {
        source: 'talking',
        text: this.#text,
      });
    } else if (params?.emotion) {
      ctx.expression.set(params.emotion, 0.8, 0.3);
    }
    if (!params?.actingState && params?.motion) {
      ctx.motion.play(params.motion);
    }
```

with:

```js
    // M6：保留舊的顯式 emotion/motion，但最後交給 ActingBridge 做優先權裁決。
    if (!params?.actingState && params?.emotion) {
      ctx.expression.set(params.emotion, 0.8, 0.3);
    }
    if (!params?.actingState && params?.motion) {
      ctx.motion.play(params.motion);
    }
    ctx.notifyTalkingState(params?.actingState || 'speaking', {
      source: 'talking_state',
      text: this.#text,
    });
```

This preserves existing manual speech styling while allowing active tool states such as `running` or `failed` to win because bridge resolution runs last.

- [ ] **Step 5: Notify bridge when TalkingState exits**

At the end of `TalkingState.onExit(ctx)`, replace:

```js
    // 說話完畢後表情慢慢退回 default
    ctx.expression.set(null, 0, 0.4);
```

with:

```js
    ctx.notifyTalkingState('idle', { source: 'talking_exit' });
```

- [ ] **Step 6: Update fake mascot in acting policy test**

In `scratch/test_acting_policy.mjs`, update `createFakeMascotForStateMachine()` so the fake mascot includes `notifyTalkingState`:

```js
    notifyTalkingState(state, meta) {
      return this.act(state, meta);
    },
```

The fake mascot block should include both `act()` and `notifyTalkingState()`:

```js
    act(state, meta) {
      const director = new PoseDirector({ motion, expression, lookAt });
      return director.act(state, meta);
    },
    notifyTalkingState(state, meta) {
      return this.act(state, meta);
    },
```

- [ ] **Step 7: Run bridge and policy tests**

Run:

```powershell
node .\scratch\test_acting_bridge.mjs
node .\scratch\test_acting_policy.mjs
```

Expected: both pass.

- [ ] **Step 8: Commit talking bridge wiring**

Run:

```powershell
git add .\js\MascotStateMachine.js .\scratch\test_acting_policy.mjs .\scratch\test_acting_bridge.mjs
git commit -m "feat: bridge talking state to acting policy"
```

## Task 6: Update Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add M6 docs**

In `README.md`, add `ActingBridge.js` beside the current acting files in the structure section:

```text
js/
  ActingBridge.js          # Conversation/runtime event -> mascot.act(state) bridge
  ActingPolicy.js          # Semantic acting state -> expression + clip + gaze
```

Add this short M6 note near the mascot phase notes:

```markdown
### Phase M6: Conversation Acting Bridge

`ActingBridge` receives tool trace and talking lifecycle events, resolves priority, and calls only `mascot.act(state)`. Runtime code keeps updating trace; acting details stay in `ActingPolicy`, `PoseDirector`, and the low-level controllers.
```

- [ ] **Step 2: Run docs diff check**

Run:

```powershell
git diff -- .\README.md
```

Expected: README only documents M6; it does not describe new expression, clip, or gaze capability.

- [ ] **Step 3: Commit docs**

Run:

```powershell
git add .\README.md
git commit -m "docs: document conversation acting bridge"
```

## Task 7: Full Regression Verification

**Files:**
- Verify current working tree

- [ ] **Step 1: Run all M6 and existing mascot tests**

Run:

```powershell
node .\scratch\test_acting_bridge.mjs
node .\scratch\test_acting_policy.mjs
node .\scratch\test_expression_layer.mjs
node .\scratch\test_semantic_pose_binding.mjs
node .\scratch\test_trace_timeline.mjs
node .\scratch\test_suggested_actions.mjs
node .\scratch\test_character_inspector_ui.mjs
python -m py_compile .\server.py
git diff --check
```

Expected:

- All Node tests exit `0`.
- `server.py` py_compile exits `0`.
- `git diff --check` exits `0`.
- Existing ActionQueue timeout warning logs may appear in trace tests; they are non-blocking if the process exits `0`.

- [ ] **Step 2: Browser smoke**

Start a temporary static server on a port that is not already used:

```powershell
$p = Start-Process -FilePath python -ArgumentList @('-m','http.server','8775','--directory','my_vrm_mascot') -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$p.Id
```

Open:

```text
http://127.0.0.1:8775/?m6=1
```

Manual checks:

- Trigger a normal tool flow.
- During `execute_tool: pending`, Alicia uses `thinking`.
- During `execute_tool: running`, Alicia uses `running` / presenting.
- After `execute_tool: done`, Alicia plays `done` / wave, then returns to idle.
- Trigger a blocked policy path and confirm `blocked` / warning behavior.
- Trigger or simulate a failed/timeout tool and confirm `failed` / shake head behavior.
- Confirm browser console has no new error/warn.

Stop the temporary server:

```powershell
Stop-Process -Id $p.Id -Force
```

- [ ] **Step 3: Final status check**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected:

- Working tree is clean.
- Recent commits include the M6 bridge commits.

## Implementation Notes

- Do not modify `/api/llm`.
- Do not add `acting`, `expression`, `clip`, `gaze`, or `bridge` fields to `contextDigest`.
- Do not make `ActionQueue` call `mascot.act()`.
- Do not add new expression profiles, motion clips, or gaze modes.
- Keep `ActingPolicy.js` as the only state-to-performance mapping.
- `speaking` is intentionally a no-op policy state so lip sync and existing explicit speech styling can continue without adding new presentation capability.
