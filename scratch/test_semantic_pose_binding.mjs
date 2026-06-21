import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PoseDirector,
  resolvePoseDirectiveForTrace,
} from '../js/PoseDirector.js';
import {
  getPosePresetUrlForModel,
  MotionController,
} from '../js/MotionController.js';
import { LookAtController } from '../js/LookAtController.js';
import {
  MotionClips,
  MOTION_CLIP_NAMES,
} from '../js/MotionClips.js';

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
      setTarget(target, data) {
        calls.push({ type: 'lookAt', target, data });
      },
    },
  };
}

function createRotation() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

function createQuaternion() {
  return {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
    set(x, y, z, w) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    },
    slerpQuaternions(a, b, alpha) {
      this.x = a.x + (b.x - a.x) * alpha;
      this.y = a.y + (b.y - a.y) * alpha;
      this.z = a.z + (b.z - a.z) * alpha;
      this.w = a.w + (b.w - a.w) * alpha;
    },
  };
}

function createBone(name = '') {
  return {
    name,
    rotation: createRotation(),
    quaternion: createQuaternion(),
    position: { x: 0, y: 1, z: 0 },
  };
}

function createFakeVrm() {
  const names = [
    'spine',
    'chest',
    'hips',
    'leftUpperArm',
    'leftLowerArm',
    'rightUpperArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
    'leftThumbProximal',
    'leftThumbIntermediate',
    'leftIndexProximal',
    'leftIndexIntermediate',
    'leftMiddleProximal',
    'leftMiddleIntermediate',
    'rightThumbProximal',
    'rightThumbIntermediate',
    'rightIndexProximal',
    'rightIndexIntermediate',
    'rightMiddleProximal',
    'rightMiddleIntermediate',
    'leftUpperLeg',
    'leftLowerLeg',
    'leftFoot',
    'rightUpperLeg',
    'rightLowerLeg',
    'rightFoot',
    'leftShoulder',
    'rightShoulder',
    'head',
    'neck',
  ];
  const bones = Object.fromEntries(names.map(name => [name, createBone(name)]));
  bones.hips.position.y = 1.2;

  return {
    bones,
    vrm: {
      humanoid: {
        getBoneNode(name) {
          return bones[name] || null;
        },
      },
    },
  };
}

function radians(deg) {
  return deg * Math.PI / 180;
}

function testRunningTraceResolvesPresentingPose() {
  const directive = resolvePoseDirectiveForTrace('execute_tool', { status: 'running' });

  assert.equal(directive.state, 'running');
  assert.equal(directive.motion.name, 'presenting');
  assert.equal(directive.expression.name, 'thinking');
  assert.equal(directive.gaze.mode, 'point');
}

function testDoneTraceResolvesWavePose() {
  const directive = resolvePoseDirectiveForTrace('execute_tool', { status: 'done' });

  assert.equal(directive.state, 'done');
  assert.equal(directive.clip.name, 'wave');
  assert.equal(directive.expression.name, 'happy');
}

function testPolicyBlockedTraceResolvesWarningPose() {
  const directive = resolvePoseDirectiveForTrace('policy_check', {
    status: 'blocked',
    reason: 'target_prefix_not_allowed',
  });

  assert.equal(directive.state, 'blocked');
  assert.equal(directive.clip.name, 'warning_nod');
  assert.equal(directive.expression.name, 'angry');
}

function testTimeoutFailureResolvesShakeHeadPose() {
  const directive = resolvePoseDirectiveForTrace('execute_tool', {
    status: 'failed',
    reason: 'timeout',
  });

  assert.equal(directive.state, 'failed');
  assert.equal(directive.clip.name, 'shake_head');
  assert.equal(directive.expression.name, 'sad');
}

function testPoseDirectorAppliesSemanticDirectiveToControllers() {
  const { calls, motion, expression, lookAt } = createFakeControllers();
  const director = new PoseDirector({ motion, expression, lookAt });

  const applied = director.poseForIntentResult('running');

  assert.equal(applied.state, 'running');
  assert.deepEqual(calls, [
    {
      type: 'expressionProfile',
      name: 'thinking',
      options: { intensity: 0.68, duration: 1400, fadeSec: 0.18 },
    },
    { type: 'motion', name: 'presenting' },
    { type: 'lookAt', target: 'point', data: { x: -0.45, y: 0.05 } },
  ]);
}

function testSetVrmAppliesNaturalPoseImmediately() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);

  assert.ok(Math.abs(bones.leftUpperArm.rotation.z) > radians(12), 'left arm should not remain in T-pose');
  assert.ok(Math.abs(bones.rightUpperArm.rotation.z) > radians(12), 'right arm should not remain in T-pose');
  assert.ok(Math.abs(bones.leftLowerArm.rotation.y) > radians(3), 'left elbow should have a natural bend');
  assert.ok(Math.abs(bones.rightLowerArm.rotation.y) > radians(3), 'right elbow should have a natural bend');
  assert.ok(Math.abs(bones.hips.position.x) > 0.001, 'hips should have a slight weight shift');
}

function testResetToNaturalPoseDoesNotZeroBones() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  for (const bone of Object.values(bones)) {
    bone.rotation.set(0, 0, 0);
  }
  bones.hips.position.x = 0;

  motion.resetToNaturalPose(0);

  assert.ok(Math.abs(bones.leftUpperArm.rotation.z) > radians(12));
  assert.ok(Math.abs(bones.rightUpperArm.rotation.z) > radians(12));
  assert.ok(Math.abs(bones.hips.position.x) > 0.001);
}

function testIdleBuildsOnNaturalPose() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.update(0.5);

  assert.ok(Math.abs(bones.leftUpperArm.rotation.z) > radians(12));
  assert.ok(Math.abs(bones.rightUpperArm.rotation.z) > radians(12));
  assert.ok(Math.abs(bones.hips.position.x) > 0.001);
  assert.notEqual(bones.hips.position.y, 1.2);
}

function testIdleMicroMotionAddsBoundedLifeSignals() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  const natural = {
    hipsX: bones.hips.position.x,
    hipsY: bones.hips.position.y,
    spineX: bones.spine.rotation.x,
    chestX: bones.chest.rotation.x,
    leftShoulderZ: bones.leftShoulder.rotation.z,
    rightShoulderZ: bones.rightShoulder.rotation.z,
    leftLowerArmY: bones.leftLowerArm.rotation.y,
    rightLowerArmY: bones.rightLowerArm.rotation.y,
    leftHandZ: bones.leftHand.rotation.z,
    rightHandZ: bones.rightHand.rotation.z,
  };

  motion.update(0.75);

  assert.notEqual(bones.spine.rotation.x, natural.spineX, 'idle should add layered spine breathing');
  assert.notEqual(bones.chest.rotation.x, natural.chestX, 'idle should add layered chest breathing');
  assert.notEqual(bones.hips.position.x, natural.hipsX, 'idle should add tiny weight shift');
  assert.notEqual(bones.leftShoulder.rotation.z, natural.leftShoulderZ, 'idle should relax left shoulder');
  assert.notEqual(bones.rightShoulder.rotation.z, natural.rightShoulderZ, 'idle should relax right shoulder');
  assert.notEqual(bones.leftLowerArm.rotation.y, natural.leftLowerArmY, 'idle should add forearm micro motion');
  assert.notEqual(bones.rightLowerArm.rotation.y, natural.rightLowerArmY, 'idle should add forearm micro motion');
  assert.notEqual(bones.leftHand.rotation.z, natural.leftHandZ, 'idle should add wrist micro motion');
  assert.notEqual(bones.rightHand.rotation.z, natural.rightHandZ, 'idle should add wrist micro motion');

  assert.ok(Math.abs(bones.hips.position.x - natural.hipsX) <= 0.004);
  assert.ok(Math.abs(bones.hips.position.y - natural.hipsY) <= 0.004);
  assert.ok(Math.abs(bones.leftShoulder.rotation.z - natural.leftShoulderZ) <= radians(1.2));
  assert.ok(Math.abs(bones.rightShoulder.rotation.z - natural.rightShoulderZ) <= radians(1.2));
  assert.ok(Math.abs(bones.leftHand.rotation.z - natural.leftHandZ) <= radians(1));
  assert.ok(Math.abs(bones.rightHand.rotation.z - natural.rightHandZ) <= radians(1));
}

function testIdleMicroMotionDoesNotLeakIntoPresenting() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  const naturalLeftHandZ = bones.leftHand.rotation.z;
  const naturalLeftShoulderZ = bones.leftShoulder.rotation.z;

  motion.play('presenting');
  motion.update(0.75);

  assert.equal(bones.leftHand.rotation.z, naturalLeftHandZ);
  assert.equal(bones.leftShoulder.rotation.z, naturalLeftShoulderZ);
}

function testPresentingUsesRightHandOnly() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  const naturalLeftZ = bones.leftUpperArm.rotation.z;
  const naturalRightZ = bones.rightUpperArm.rotation.z;
  motion.play('presenting');
  motion.update(0.8);

  assert.ok(
    Math.abs(bones.leftUpperArm.rotation.z - naturalLeftZ) < radians(3),
    'presenting should keep the left arm close to the natural down pose'
  );
  assert.ok(
    Math.abs(bones.rightUpperArm.rotation.z - naturalRightZ) > radians(12),
    'presenting should use the right arm as the only active arm'
  );
  assert.ok(
    Math.abs(bones.rightUpperArm.rotation.z) > radians(30),
    'presenting should not lift the right arm close to a horizontal T-pose'
  );
}

function testLoadPosePresetUsesDegreeRotationAndHipsPosition() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset({
    model: 'TestModel',
    basePose: {
      rotation: {
        leftUpperArm: { x: 10, y: 0, z: 55 },
        rightUpperArm: { x: 10, y: 0, z: -55 },
      },
      position: {
        hips: { x: -0.02, y: 0.01, z: 0.03 },
      },
    },
  });

  assert.equal(bones.leftUpperArm.rotation.x, radians(10));
  assert.equal(bones.leftUpperArm.rotation.z, radians(55));
  assert.equal(bones.rightUpperArm.rotation.z, radians(-55));
  assert.equal(bones.hips.position.x, -0.02);
  assert.equal(bones.hips.position.y, 1.21);
  assert.equal(bones.hips.position.z, 0.03);
}

function testSetBasePoseRotationUpdatesPresetAndCurrentPose() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.setBasePoseRotation('leftLowerArm', 'y', -22);

  const preset = motion.getPosePreset();
  assert.equal(preset.basePose.rotation.leftLowerArm.y, -22);
  assert.equal(bones.leftLowerArm.rotation.y, radians(-22));
}

function testSetBasePosePositionKeepsHipsSeparateFromRotation() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.setBasePosePosition('hips', 'x', -0.031);

  const preset = motion.getPosePreset();
  assert.equal(preset.basePose.position.hips.x, -0.031);
  assert.equal(preset.basePose.rotation.hips, undefined);
  assert.equal(bones.hips.position.x, -0.031);
}

function testResetBasePoseBoneRestoresDefaultPose() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  const initialZ = bones.leftUpperArm.rotation.z;
  motion.setBasePoseRotation('leftUpperArm', 'z', 70);
  motion.resetBasePoseBone('leftUpperArm');

  assert.equal(bones.leftUpperArm.rotation.z, initialZ);
  assert.equal(motion.getPosePreset().basePose.rotation.leftUpperArm.z, 42);
}

function testMascotModelUsesAliciaPosePreset() {
  assert.equal(
    getPosePresetUrlForModel('models/mascot.vrm'),
    'motions/poses/alicia_solid.json'
  );
}

function testUnknownModelFallsBackToDefaultPosePreset() {
  assert.equal(
    getPosePresetUrlForModel('models/custom_character.vrm'),
    'motions/poses/default.json'
  );
}

function testAliciaPresetKeepsArmsAwayFromTPose() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset({
    model: 'AliciaSolid',
    basePose: {
      rotation: {
        leftUpperArm: { x: 9, y: -3, z: 54 },
        rightUpperArm: { x: 9, y: 3, z: -54 },
        leftLowerArm: { x: 1, y: -14, z: -5 },
        rightLowerArm: { x: 1, y: 14, z: 5 },
      },
      position: {
        hips: { x: -0.014, y: 0, z: 0.004 },
      },
    },
  });

  assert.ok(bones.leftUpperArm.rotation.z > radians(45));
  assert.ok(bones.rightUpperArm.rotation.z < radians(-45));
  assert.ok(Math.abs(bones.leftLowerArm.rotation.y) > radians(8));
  assert.ok(Math.abs(bones.rightLowerArm.rotation.y) > radians(8));
  assert.ok(Math.abs(bones.hips.position.x) > 0.01);
}

function testAliciaPresetFileIsModelSpecificAndNatural() {
  const preset = JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8'));
  const rotation = preset.basePose.rotation;

  assert.equal(preset.model, 'AliciaSolid');
  assert.ok(rotation.leftUpperArm.z > 45, 'Alicia left upper arm should hang down from bind pose');
  assert.ok(rotation.rightUpperArm.z < -45, 'Alicia right upper arm should hang down from bind pose');
  assert.ok(Math.abs(rotation.leftLowerArm.y) > 8, 'Alicia left elbow should have a relaxed bend');
  assert.ok(Math.abs(rotation.rightLowerArm.y) > 8, 'Alicia right elbow should have a relaxed bend');
  assert.ok(Math.abs(preset.basePose.position.hips.x) > 0.01, 'Alicia hips should have a visible weight shift');
}

function testVrmMascotLoadsModelSpecificPosePresetWithFileLoader() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');

  assert.match(source, /getPosePresetUrlForModel/);
  assert.match(source, /#loadPosePresetForModel\(url\)/);
  assert.match(source, /new THREE\.FileLoader\(\)/);
  assert.doesNotMatch(source, /fetch\([^)]*pose/i);
}

function testLookAtNoneAddsBoundedIdleHeadDrift() {
  const lookAt = new LookAtController();
  const { vrm, bones } = createFakeVrm();

  lookAt.setVrm(vrm);
  lookAt.setTarget('none');
  lookAt.update(0.75);

  assert.notEqual(bones.head.rotation.x, 0);
  assert.notEqual(bones.head.rotation.y, 0);
  assert.notEqual(bones.neck.rotation.x, 0);
  assert.ok(Math.abs(bones.head.rotation.x) <= radians(1.2));
  assert.ok(Math.abs(bones.head.rotation.y) <= radians(1.4));
  assert.ok(Math.abs(bones.neck.rotation.x) <= radians(0.5));
}

function testLookAtPointDoesNotUseIdleDriftMode() {
  const lookAt = new LookAtController();
  const { vrm, bones } = createFakeVrm();

  lookAt.setVrm(vrm);
  lookAt.setTarget('point', { x: 0.5, y: 0 });
  lookAt.update(0.75);

  assert.ok(bones.head.rotation.y > radians(0.5));
  assert.equal(bones.head.rotation.z, 0);
}

function testMotionClipRegistryHasBoundedDurations() {
  assert.deepEqual(MOTION_CLIP_NAMES, [
    'wave',
    'victory',
    'warning_nod',
    'shake_head',
    'dance_short',
    'punch_short',
  ]);

  for (const name of MOTION_CLIP_NAMES) {
    const clip = MotionClips[name];
    assert.equal(typeof clip.apply, 'function', `${name} should expose apply()`);
    assert.ok(clip.duration > 0, `${name} duration should be positive`);
    assert.ok(clip.duration <= 1600, `${name} duration should stay short`);
  }
}

function snapshotCriticalBones(bones) {
  return {
    hipsX: bones.hips.position.x,
    hipsY: bones.hips.position.y,
    spineX: bones.spine.rotation.x,
    spineZ: bones.spine.rotation.z,
    chestX: bones.chest.rotation.x,
    chestY: bones.chest.rotation.y,
    leftUpperArmZ: bones.leftUpperArm.rotation.z,
    rightUpperArmZ: bones.rightUpperArm.rotation.z,
    leftLowerArmY: bones.leftLowerArm.rotation.y,
    rightLowerArmY: bones.rightLowerArm.rotation.y,
    leftHandZ: bones.leftHand.rotation.z,
    rightHandZ: bones.rightHand.rotation.z,
  };
}

function assertSnapshotClose(actual, expected, epsilon = 1e-9) {
  for (const key of Object.keys(expected)) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= epsilon,
      `${key} expected ${expected[key]}, got ${actual[key]}`
    );
  }
}

function testPlayClipEndsBackToIdleWithoutResidualPose() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  const baseline = snapshotCriticalBones(bones);

  motion.playClip('wave');
  motion.update(0.6);

  assert.equal(motion.currentAction, 'wave');
  assert.ok(Math.abs(bones.rightUpperArm.rotation.z - baseline.rightUpperArmZ) > radians(12));

  motion.update(1.2);

  assert.equal(motion.currentAction, 'idle');
  assertSnapshotClose(snapshotCriticalBones(bones), baseline);
}

function testClipDoesNotMutateIdleMicroMotionState() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  motion.playClip('punch_short');
  motion.update(0.35);
  motion.update(0.5);

  const afterClipBaseline = snapshotCriticalBones(bones);
  motion.update(0.35);

  assert.equal(motion.currentAction, 'idle');
  assert.notDeepEqual(snapshotCriticalBones(bones), afterClipBaseline, 'idle micro motion should resume after clip finish');
}

function testHoldCustomPoseMaintainsSingleFramePose() {
  const previousThree = globalThis.THREE;
  globalThis.THREE = {
    Quaternion: class {
      constructor() {
        return createQuaternion();
      }
    },
  };

  try {
    const motion = new MotionController();
    const { vrm, bones } = createFakeVrm();

    motion.setVrm(vrm);
    motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
    motion.holdCustomPose({
      duration_ms: 1,
      bones: {
        leftUpperArm: [{ time_ms: 0, rot: [0.1, 0.2, 0.3, 0.9] }],
      },
      hips_position: [{ time_ms: 0, pos: [0.01, 0.02, 0.03] }],
    }, { timeMs: 0 });

    assert.equal(motion.currentAction, 'custom_pose');
    assert.equal(bones.leftUpperArm.quaternion.z, 0.3);
    assert.equal(bones.hips.position.x, 0.01);

    motion.update(0.5);

    assert.equal(motion.currentAction, 'custom_pose');
    assert.equal(bones.leftUpperArm.quaternion.z, 0.3);
    assert.equal(bones.hips.position.z, 0.03);
  } finally {
    if (previousThree === undefined) {
      delete globalThis.THREE;
    } else {
      globalThis.THREE = previousThree;
    }
  }
}

function testCustomPoseAppliesHandPoseFingerCurl() {
  const previousThree = globalThis.THREE;
  globalThis.THREE = {
    Quaternion: class {
      constructor() {
        return createQuaternion();
      }
    },
  };

  try {
    const motion = new MotionController();
    const { vrm, bones } = createFakeVrm();

    motion.setVrm(vrm);
    motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
    motion.holdCustomPose({
      duration_ms: 1,
      bones: {},
      hand_poses: {
        left: [{ time_ms: 0, gesture: 'fist', fingerCurl: 0.9 }],
        right: [{ time_ms: 0, gesture: 'open', fingerCurl: 0.1 }],
      },
    }, { timeMs: 0 });

    assert.ok(Math.abs(bones.leftIndexProximal.rotation.z) > radians(35), 'fist should visibly curl left fingers around the finger bend axis');
    assert.ok(Math.abs(bones.leftMiddleIntermediate.rotation.z) > radians(25), 'fist should curl intermediate finger bones around the bend axis');
    assert.ok(bones.leftThumbProximal.rotation.y > radians(15), 'left thumb should tuck into the palm for a fist');
    assert.ok(bones.leftIndexProximal.rotation.z > 0, 'left fingers should curl toward the palm');
    assert.equal(bones.leftIndexProximal.rotation.x, 0, 'finger curl must not twist along the finger length axis');
    assert.ok(bones.rightIndexProximal.rotation.x < radians(12), 'open hand should stay mostly open');

    motion.resetToNaturalPose(0);
    assert.equal(bones.leftIndexProximal.rotation.x, 0, 'natural pose should clear custom finger curl');

    motion.holdCustomPose({
      duration_ms: 1,
      bones: {},
      hand_poses: {
        right: [{ time_ms: 0, gesture: 'relaxed', fingerCurl: 0.39 }],
      },
    }, { timeMs: 0 });
    assert.ok(Math.abs(bones.rightIndexProximal.rotation.z) > radians(25), 'relaxed should look like a half fist');
    assert.ok(bones.rightIndexProximal.rotation.z < 0, 'right fingers should curl toward the palm');
    assert.ok(bones.rightThumbProximal.rotation.y < -radians(10), 'right thumb should tuck into the palm for a half fist');
  } finally {
    if (previousThree === undefined) {
      delete globalThis.THREE;
    } else {
      globalThis.THREE = previousThree;
    }
  }
}

function testShortClipsDoNotProduceTPose() {
  for (const name of MOTION_CLIP_NAMES) {
    const motion = new MotionController();
    const { vrm, bones } = createFakeVrm();

    motion.setVrm(vrm);
    motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
    motion.playClip(name);
    motion.update((MotionClips[name].duration / 1000) * 0.5);

    assert.ok(Math.abs(bones.leftUpperArm.rotation.z) > radians(16), `${name} should not flatten left arm`);
    assert.ok(Math.abs(bones.rightUpperArm.rotation.z) > radians(16), `${name} should not flatten right arm`);
  }
}

function testLegacyPlayRoutesClipNamesDeterministically() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.loadPosePreset(JSON.parse(readFileSync('motions/poses/alicia_solid.json', 'utf8')));
  motion.play('warning_nod');
  motion.update(0.45);

  assert.equal(motion.currentAction, 'warning_nod');
  assert.equal(motion.isVrmaActive, false);
  assert.ok(Math.abs(bones.spine.rotation.x - radians(2)) > radians(1));
}

function testCoreSemanticMotionsDoNotResolveToRawVrma() {
  const motion = new MotionController();

  for (const name of ['idle', 'think', 'presenting', 'warning', 'wave', 'victory', 'warning_nod', 'shake_head', 'dance_short', 'punch_short']) {
    assert.equal(motion.getVrmaUrlForName(name), null, `${name} should use procedural runtime, not raw VRMA`);
  }
  assert.equal(motion.getVrmaUrlForName('walk_cycle'), 'motions/showcase/davinci2_walking.vrma');
}

function testWalkCycleUsesProceduralLegMotionInsteadOfVrmaPlayback() {
  const motion = new MotionController();
  const { vrm, bones } = createFakeVrm();

  motion.setVrm(vrm);
  motion.play('walk_cycle');
  motion.update(0.12);

  const firstFrame = {
    leftUpperLegX: bones.leftUpperLeg.rotation.x,
    rightUpperLegX: bones.rightUpperLeg.rotation.x,
    leftLowerLegX: bones.leftLowerLeg.rotation.x,
    rightLowerLegX: bones.rightLowerLeg.rotation.x,
    leftFootX: bones.leftFoot.rotation.x,
    rightFootX: bones.rightFoot.rotation.x,
  };

  motion.update(0.18);

  assert.equal(motion.currentAction, 'walk_cycle');
  assert.equal(motion.isVrmaActive, false);
  assert.ok(
    Math.abs(firstFrame.leftUpperLegX - bones.leftUpperLeg.rotation.x) > radians(2) ||
    Math.abs(firstFrame.rightUpperLegX - bones.rightUpperLeg.rotation.x) > radians(2),
    'walk_cycle should visibly swing upper legs'
  );
  assert.ok(
    Math.abs(bones.leftLowerLeg.rotation.x) > radians(2) ||
    Math.abs(bones.rightLowerLeg.rotation.x) > radians(2),
    'walk_cycle should bend lower legs'
  );
  assert.ok(
    Math.abs(bones.leftFoot.rotation.x) > radians(1) ||
    Math.abs(bones.rightFoot.rotation.x) > radians(1),
    'walk_cycle should animate feet instead of sliding with locked feet'
  );
}

function testVrmaRetargetAcceptsMixamoColonAliasesForLegTracks() {
  const previousThree = globalThis.THREE;
  class FakeTrack {
    constructor(name, times, values) {
      this.name = name;
      this.times = times;
      this.values = values;
    }
  }
  class FakeAnimationClip {
    constructor(name, duration, tracks) {
      this.name = name;
      this.duration = duration;
      this.tracks = tracks;
    }
  }

  globalThis.THREE = {
    AnimationClip: FakeAnimationClip,
    VRMHumanoidBoneName: {
      Hips: 'hips',
      Spine: 'spine',
      Chest: 'chest',
      LeftUpperLeg: 'leftUpperLeg',
      LeftLowerLeg: 'leftLowerLeg',
      LeftFoot: 'leftFoot',
      RightUpperLeg: 'rightUpperLeg',
      RightLowerLeg: 'rightLowerLeg',
      RightFoot: 'rightFoot',
    },
  };

  try {
    const motion = new MotionController();
    const { vrm } = createFakeVrm();
    motion.setVrm(vrm);

    const clip = new FakeAnimationClip('mixamo.com', 1.4, [
      new FakeTrack('mixamorigHips.position', [0, 1], new Float32Array([0, 1.2, 0, 0, 1.24, 0.6])),
      new FakeTrack('mixamorigRightUpLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigRightLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, -0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigRightFoot.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0, 0.1, 0, 0.99])),
      new FakeTrack('mixamorigLeftUpLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, -0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigLeftLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigLeftFoot.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0, -0.1, 0, 0.99])),
    ]);
    clip.userData = {
      nodeNameToBoneName: new Map([
        ['mixamorig:Hips', 'hips'],
        ['mixamorig:RightUpLeg', 'rightUpperLeg'],
        ['mixamorig:RightLeg', 'rightLowerLeg'],
        ['mixamorig:RightFoot', 'rightFoot'],
        ['mixamorig:LeftUpLeg', 'leftUpperLeg'],
        ['mixamorig:LeftLeg', 'leftLowerLeg'],
        ['mixamorig:LeftFoot', 'leftFoot'],
      ]),
    };

    const retargeted = motion.retargetVrmaClip(clip, 'walk_cycle');
    const trackNames = retargeted.tracks.map(track => track.name);

    assert.ok(trackNames.includes('rightUpperLeg.quaternion'));
    assert.ok(trackNames.includes('rightLowerLeg.quaternion'));
    assert.ok(trackNames.includes('rightFoot.quaternion'));
    assert.ok(trackNames.includes('leftUpperLeg.quaternion'));
    assert.ok(trackNames.includes('leftLowerLeg.quaternion'));
    assert.ok(trackNames.includes('leftFoot.quaternion'));
    assert.ok(trackNames.includes('hips.position'));
  } finally {
    globalThis.THREE = previousThree;
  }
}

function testVrmaRetargetLocksLowerBodyForNonLocomotionRuntimeClips() {
  const previousThree = globalThis.THREE;
  class FakeTrack {
    constructor(name, times, values) {
      this.name = name;
      this.times = times;
      this.values = values;
    }
  }
  class FakeAnimationClip {
    constructor(name, duration, tracks) {
      this.name = name;
      this.duration = duration;
      this.tracks = tracks;
    }
  }

  globalThis.THREE = {
    AnimationClip: FakeAnimationClip,
    VRMHumanoidBoneName: {
      Hips: 'hips',
      Spine: 'spine',
      RightUpperArm: 'rightUpperArm',
      RightUpperLeg: 'rightUpperLeg',
      RightLowerLeg: 'rightLowerLeg',
      RightFoot: 'rightFoot',
    },
  };

  try {
    const motion = new MotionController();
    const { vrm } = createFakeVrm();
    motion.setVrm(vrm);

    const clip = new FakeAnimationClip('mixamo.com', 1.4, [
      new FakeTrack('mixamorigSpine.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0.1, 0, 0, 0.99])),
      new FakeTrack('mixamorigRightArm.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0, 0.2, 0, 0.98])),
      new FakeTrack('mixamorigHips.position', [0, 1], new Float32Array([0, 1.2, 0, 0, 1.24, 0.6])),
      new FakeTrack('mixamorigRightUpLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigRightLeg.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, -0.2, 0, 0, 0.98])),
      new FakeTrack('mixamorigRightFoot.quaternion', [0, 1], new Float32Array([0, 0, 0, 1, 0, 0.1, 0, 0.99])),
    ]);
    clip.userData = {
      nodeNameToBoneName: new Map([
        ['mixamorig:Spine', 'spine'],
        ['mixamorig:RightArm', 'rightUpperArm'],
        ['mixamorig:Hips', 'hips'],
        ['mixamorig:RightUpLeg', 'rightUpperLeg'],
        ['mixamorig:RightLeg', 'rightLowerLeg'],
        ['mixamorig:RightFoot', 'rightFoot'],
      ]),
    };

    const retargeted = motion.retargetVrmaClip(clip, 'punch_short');
    const trackNames = retargeted.tracks.map(track => track.name);

    assert.ok(trackNames.includes('spine.quaternion'));
    assert.ok(trackNames.includes('rightUpperArm.quaternion'));
    assert.ok(!trackNames.some(name => name.startsWith('hips.')));
    assert.ok(!trackNames.some(name => name.startsWith('rightUpperLeg.')));
    assert.ok(!trackNames.some(name => name.startsWith('rightLowerLeg.')));
    assert.ok(!trackNames.some(name => name.startsWith('rightFoot.')));
  } finally {
    globalThis.THREE = previousThree;
  }
}

const tests = [
  testRunningTraceResolvesPresentingPose,
  testDoneTraceResolvesWavePose,
  testPolicyBlockedTraceResolvesWarningPose,
  testTimeoutFailureResolvesShakeHeadPose,
  testPoseDirectorAppliesSemanticDirectiveToControllers,
  testSetVrmAppliesNaturalPoseImmediately,
  testResetToNaturalPoseDoesNotZeroBones,
  testIdleBuildsOnNaturalPose,
  testIdleMicroMotionAddsBoundedLifeSignals,
  testIdleMicroMotionDoesNotLeakIntoPresenting,
  testPresentingUsesRightHandOnly,
  testLoadPosePresetUsesDegreeRotationAndHipsPosition,
  testSetBasePoseRotationUpdatesPresetAndCurrentPose,
  testSetBasePosePositionKeepsHipsSeparateFromRotation,
  testResetBasePoseBoneRestoresDefaultPose,
  testMascotModelUsesAliciaPosePreset,
  testUnknownModelFallsBackToDefaultPosePreset,
  testAliciaPresetKeepsArmsAwayFromTPose,
  testAliciaPresetFileIsModelSpecificAndNatural,
  testVrmMascotLoadsModelSpecificPosePresetWithFileLoader,
  testLookAtNoneAddsBoundedIdleHeadDrift,
  testLookAtPointDoesNotUseIdleDriftMode,
  testMotionClipRegistryHasBoundedDurations,
  testPlayClipEndsBackToIdleWithoutResidualPose,
  testClipDoesNotMutateIdleMicroMotionState,
  testHoldCustomPoseMaintainsSingleFramePose,
  testCustomPoseAppliesHandPoseFingerCurl,
  testShortClipsDoNotProduceTPose,
  testLegacyPlayRoutesClipNamesDeterministically,
  testCoreSemanticMotionsDoNotResolveToRawVrma,
  testWalkCycleUsesProceduralLegMotionInsteadOfVrmaPlayback,
  testVrmaRetargetAcceptsMixamoColonAliasesForLegTracks,
  testVrmaRetargetLocksLowerBodyForNonLocomotionRuntimeClips,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
