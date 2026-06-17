import assert from 'node:assert/strict';
import { AutoDirectorLite } from '../js/AutoDirectorLite.js';

function testInitializationAndDefaults() {
  const director = new AutoDirectorLite();
  const state = director.debugState;

  assert.equal(state.enabled, false);
  assert.equal(state.level, 2);
  assert.equal(state.nextTouchFaceSec, 90);
  assert.equal(state.nextStretchSec, 180);
  assert.equal(state.cooldownRemainingSec, 0);
  assert.equal(state.lastAction, "none");
  assert.equal(state.eligible, false);
}

function testCustomConfiguration() {
  const director = new AutoDirectorLite({
    touchFaceIntervalSec: 10,
    stretchIntervalSec: 20,
    gestureCooldownSec: 2
  });

  assert.equal(director.touchFaceIntervalSec, 10);
  assert.equal(director.stretchIntervalSec, 20);
  assert.equal(director.gestureCooldownSec, 2);

  director.configure({ enabled: true, level: 3 });
  const state = director.debugState;
  assert.equal(state.enabled, true);
  assert.equal(state.level, 3);
  assert.equal(state.nextTouchFaceSec, 10);
  assert.equal(state.nextStretchSec, 20);
}

function testEligibilityConstraints() {
  const director = new AutoDirectorLite({
    touchFaceIntervalSec: 10,
    stretchIntervalSec: 20,
    gestureCooldownSec: 2
  });
  director.configure({ enabled: true, level: 3 });

  // 1. Not active
  director.update(1, { playgroundActive: false, currentAction: "idle", isVrmaActive: false, activeGesture: null });
  assert.equal(director.debugState.nextTouchFaceSec, 10, "Should not decrement when playground is inactive");
  assert.equal(director.debugState.eligible, false);

  // 2. Disabled
  director.configure({ enabled: false, level: 3 });
  director.update(1, { playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null });
  assert.equal(director.debugState.nextTouchFaceSec, 10, "Should not decrement when disabled");
  assert.equal(director.debugState.eligible, false);

  // 3. Eligible (reenable)
  director.configure({ enabled: true, level: 3 });
  director.update(1.5, { playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null });
  assert.equal(director.debugState.nextTouchFaceSec, 8.5, "Should decrement when eligible");
  assert.equal(director.debugState.eligible, true);

  // 4. Non-idle action
  director.update(1, { playgroundActive: true, currentAction: "wave", isVrmaActive: false, activeGesture: null });
  assert.equal(director.debugState.nextTouchFaceSec, 8.5, "Should not decrement during non-idle action");
  assert.equal(director.debugState.eligible, false);

  // 5. VRMA Active
  director.update(1, { playgroundActive: true, currentAction: "idle", isVrmaActive: true, activeGesture: null });
  assert.equal(director.debugState.nextTouchFaceSec, 8.5, "Should not decrement when VRMA active");
  assert.equal(director.debugState.eligible, false);

  // 6. Active gesture
  director.update(1, { playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: "touch_face" });
  assert.equal(director.debugState.nextTouchFaceSec, 8.5, "Should not decrement when gesture is active");
  assert.equal(director.debugState.eligible, false);
}

function testLevelsTriggering() {
  // Level 0-2: no automatic gestures
  {
    const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 20 });
    director.configure({ enabled: true, level: 2 });
    let triggered = null;

    director.update(15, {
      playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
      onGesture: (name) => { triggered = name; }
    });
    assert.equal(triggered, null, "Should not trigger on level 2");
    assert.equal(director.debugState.nextTouchFaceSec, 10, "Timer should not even decrement on level 2");
    assert.equal(director.debugState.nextStretchSec, 20);
  }

  // Level 3: auto touch_face every 10s
  {
    const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 20 });
    director.configure({ enabled: true, level: 3 });
    let triggered = null;

    director.update(5, { playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null });
    assert.equal(director.debugState.nextTouchFaceSec, 5);

    director.update(6, {
      playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
      onGesture: (name) => { triggered = name; }
    });
    assert.equal(triggered, "touch_face");
    assert.equal(director.debugState.nextTouchFaceSec, 10, "Timer resets");
    assert.equal(director.debugState.cooldownRemainingSec, 8, "Cooldown applied");
    assert.equal(director.debugState.lastAction, "touch_face");
  }

  // Level 4: both touch_face and stretch
  {
    const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 20 });
    director.configure({ enabled: true, level: 4 });
    let triggered = null;

    director.update(10, {
      playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
      onGesture: (name) => { triggered = name; }
    });
    assert.equal(triggered, "touch_face");
    assert.equal(director.debugState.cooldownRemainingSec, 8);

    director.update(5, {
      playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
      onGesture: (name) => { triggered = name; }
    });
    // Wait, the cooldown is 8s, so at t=10, 10s touch_face triggers, setting cooldown to 8s.
    // Ticking remaining 5s doesn't trigger anything because cooldown blocks it.
    assert.equal(director.debugState.cooldownRemainingSec, 3, "cooldown ticks down: 8 - 5 = 3");
  }
}

function testTieBreaker() {
  const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 10, gestureCooldownSec: 3 });
  director.configure({ enabled: true, level: 4 });
  let triggered = null;

  // Let both reach 0 simultaneously
  director.update(10, {
    playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
    onGesture: (name) => { triggered = name; }
  });

  assert.equal(triggered, "stretch", "Stretch wins tie-breaker");
  assert.equal(director.debugState.nextStretchSec, 10, "Stretch timer reset");
  assert.equal(director.debugState.nextTouchFaceSec, 10, "Touch face timer reset");
  assert.equal(director.debugState.lastAction, "stretch");
  assert.equal(director.debugState.cooldownRemainingSec, 3);
}

function testCooldownBlocksAutoGestures() {
  const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 20, gestureCooldownSec: 8 });
  director.configure({ enabled: true, level: 3 });
  let triggered = null;

  // Trigger manual gesture touch_face
  director.notifyManualGesture("touch_face");
  assert.equal(director.debugState.cooldownRemainingSec, 8);
  assert.equal(director.debugState.nextTouchFaceSec, 10);

  // Update for 5 seconds: cooldown goes to 3, but eligibility is false, so nextTouchFaceSec stays 10
  director.update(5, {
    playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
    onGesture: (name) => { triggered = name; }
  });
  assert.equal(director.debugState.cooldownRemainingSec, 3);
  assert.equal(director.debugState.nextTouchFaceSec, 10, "Timer does not tick down during cooldown");
  assert.equal(triggered, null);

  // Update for another 5 seconds: cooldown goes to 0 after 3 seconds, then nextTouchFaceSec ticks down by 2 seconds to 8
  director.update(5, {
    playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null,
    onGesture: (name) => { triggered = name; }
  });
  assert.equal(director.debugState.cooldownRemainingSec, 0);
  assert.equal(director.debugState.nextTouchFaceSec, 8, "Timer ticks down only after cooldown ends");
}

function testReset() {
  const director = new AutoDirectorLite({ touchFaceIntervalSec: 10, stretchIntervalSec: 20 });
  director.configure({ enabled: true, level: 4 });

  director.update(5, { playgroundActive: true, currentAction: "idle", isVrmaActive: false, activeGesture: null });
  director.notifyManualGesture("touch_face");

  director.reset();
  const state = director.debugState;
  assert.equal(state.nextTouchFaceSec, 10);
  assert.equal(state.nextStretchSec, 20);
  assert.equal(state.cooldownRemainingSec, 0);
  assert.equal(state.lastAction, "none");
}

const tests = [
  testInitializationAndDefaults,
  testCustomConfiguration,
  testEligibilityConstraints,
  testLevelsTriggering,
  testTieBreaker,
  testCooldownBlocksAutoGestures,
  testReset
];

console.log('Running test_auto_director_lite.mjs...');
for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
console.log('test_auto_director_lite: ok');
