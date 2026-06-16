import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExpressionController } from '../js/ExpressionController.js';
import {
  EXPRESSION_PROFILE_NAMES,
  ExpressionProfiles,
} from '../js/ExpressionProfiles.js';
import { MotionController } from '../js/MotionController.js';

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

function createBone() {
  return {
    rotation: createRotation(),
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
    'leftUpperLeg',
    'rightUpperLeg',
    'leftShoulder',
    'rightShoulder',
  ];
  const bones = Object.fromEntries(names.map(name => [name, createBone()]));
  bones.hips.position.y = 1.2;

  const blendShapeProxy = {
    values: {},
    calls: [],
    setValue(name, value) {
      this.values[name] = value;
      this.calls.push({ name, value });
    },
  };

  return {
    bones,
    blendShapeProxy,
    vrm: {
      blendShapeProxy,
      humanoid: {
        getBoneNode(name) {
          return bones[name] || null;
        },
      },
    },
  };
}

function snapshotBoneRotations(bones) {
  return Object.fromEntries(Object.entries(bones).map(([name, bone]) => [
    name,
    {
      x: bone.rotation.x,
      y: bone.rotation.y,
      z: bone.rotation.z,
    },
  ]));
}

function radians(deg) {
  return deg * Math.PI / 180;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function testExpressionProfilesAreSemanticAndBounded() {
  assert.deepEqual(EXPRESSION_PROFILE_NAMES, [
    'neutral',
    'happy',
    'thinking',
    'surprised',
    'sad',
    'angry',
  ]);

  for (const name of EXPRESSION_PROFILE_NAMES) {
    const profile = ExpressionProfiles[name];
    assert.equal(profile.name, name);
    assert.equal(profile.rotation, undefined, `${name} must not write bone rotation`);
    assert.equal(profile.position, undefined, `${name} must not write bone position`);
    assert.equal(profile.bones, undefined, `${name} must not write humanoid bones`);
    assert.equal(profile.values.blink, undefined, `${name} must not own blink`);

    for (const [key, weight] of Object.entries(profile.values)) {
      assert.ok(weight >= 0 && weight <= 1, `${name}.${key} should be clamped in profile`);
    }
  }
}

function testSetProfileFallsBackToNeutralAndClampsIntensity() {
  const expression = new ExpressionController();
  const { vrm, blendShapeProxy } = createFakeVrm();

  expression.setVrm(vrm);
  const applied = expression.setProfile('happy', { intensity: 3, fadeSec: 0.01 });
  expression.update(0.02);

  assert.equal(applied.name, 'happy');
  assert.equal(expression.currentExpression, 'happy');
  assert.ok(blendShapeProxy.values.joy <= 1);
  assert.ok(blendShapeProxy.values.joy > 0.7);

  const fallback = expression.setProfile('not_real', { fadeSec: 0.01 });
  expression.update(0.02);

  assert.equal(fallback.name, 'neutral');
  assert.equal(expression.currentExpression, 'neutral');
  assert.equal(blendShapeProxy.values.joy, 0);
}

function testClearExpressionFadesManagedChannelsWithoutResidual() {
  const expression = new ExpressionController();
  const { vrm, blendShapeProxy } = createFakeVrm();

  expression.setVrm(vrm);
  expression.setProfile('sad', { intensity: 1, fadeSec: 0.01 });
  expression.update(0.02);
  assert.ok(blendShapeProxy.values.sorrow > 0.5);

  expression.clear({ fadeSec: 0.01 });
  expression.update(0.02);

  assert.equal(expression.currentExpression, null);
  assert.equal(blendShapeProxy.values.sorrow, 0);
}

async function testBlinkDoesNotOverwriteActiveExpression() {
  const expression = new ExpressionController();
  const { vrm, blendShapeProxy } = createFakeVrm();

  expression.setVrm(vrm);
  expression.setProfile('happy', { intensity: 0.8, fadeSec: 0.01 });
  expression.update(0.02);

  expression.startAutoBlink(2, 2);
  await delay(8);
  expression.update(0.07);
  expression.stopAutoBlink();

  assert.ok(blendShapeProxy.values.blink > 0.5);
  assert.ok(blendShapeProxy.values.joy > 0.5);
}

function testHappyExpressionCoexistsWithVictoryClip() {
  const motion = new MotionController();
  const expression = new ExpressionController();
  const { vrm, bones, blendShapeProxy } = createFakeVrm();

  motion.setVrm(vrm);
  expression.setVrm(vrm);
  expression.setProfile('happy', { intensity: 0.85, fadeSec: 0.01 });
  motion.playClip('victory');

  motion.update(0.45);
  expression.update(0.02);

  assert.equal(motion.currentAction, 'victory');
  assert.ok(blendShapeProxy.values.joy > 0.5);
  assert.ok(Math.abs(bones.rightUpperArm.rotation.z) > radians(16));
}

function testExpressionLayerDoesNotWriteBoneRotations() {
  const expression = new ExpressionController();
  const { vrm, bones } = createFakeVrm();
  const before = snapshotBoneRotations(bones);

  expression.setVrm(vrm);
  expression.setProfile('thinking', { intensity: 1, fadeSec: 0.01 });
  expression.update(0.02);

  assert.deepEqual(snapshotBoneRotations(bones), before);
}

function testVrmMascotExposesSemanticExpressionApi() {
  const source = readFileSync('js/VrmMascot.js', 'utf8');

  assert.match(source, /setExpression\(name,\s*options\s*=\s*\{\}\)/);
  assert.match(source, /clearExpression\(options\s*=\s*\{\}\)/);
  assert.doesNotMatch(source, /setExpression[\s\S]*rotation\.set/);
}

const tests = [
  testExpressionProfilesAreSemanticAndBounded,
  testSetProfileFallsBackToNeutralAndClampsIntensity,
  testClearExpressionFadesManagedChannelsWithoutResidual,
  testBlinkDoesNotOverwriteActiveExpression,
  testHappyExpressionCoexistsWithVictoryClip,
  testExpressionLayerDoesNotWriteBoneRotations,
  testVrmMascotExposesSemanticExpressionApi,
];

for (const test of tests) {
  await test();
  console.log(`PASS ${test.name}`);
}
