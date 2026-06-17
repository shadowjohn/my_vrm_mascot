import assert from 'node:assert/strict';
import { HumanMotionLayer } from '../js/HumanMotionLayer.js';

// Mock THREE to avoid undefined reference errors in getBoneNames()
globalThis.THREE = {
  VRMHumanoidBoneName: {
    Spine: 'spine',
    Chest: 'chest',
    Hips: 'hips',
    LeftUpperArm: 'leftUpperArm',
    LeftLowerArm: 'leftLowerArm',
    RightUpperArm: 'rightUpperArm',
    RightLowerArm: 'rightLowerArm',
    LeftHand: 'leftHand',
    RightHand: 'rightHand',
    LeftUpperLeg: 'leftUpperLeg',
    LeftLowerLeg: 'leftLowerLeg',
    LeftFoot: 'leftFoot',
    RightUpperLeg: 'rightUpperLeg',
    RightLowerLeg: 'rightLowerLeg',
    RightFoot: 'rightFoot',
    LeftShoulder: 'leftShoulder',
    RightShoulder: 'rightShoulder',
  }
};

function createRotation() {
  return { x: 0, y: 0, z: 0 };
}

function createPosition() {
  return { x: 0, y: 0, z: 0 };
}

function createBone() {
  return {
    rotation: createRotation(),
    position: createPosition()
  };
}

function createFakeVrm() {
  const boneNames = Object.values(globalThis.THREE.VRMHumanoidBoneName);
  const bones = Object.fromEntries(boneNames.map(name => [name, createBone()]));
  return {
    humanoid: {
      getBoneNode(name) {
        return bones[name] || null;
      }
    },
    bones
  };
}

function getBonesState(bones) {
  return Object.fromEntries(Object.entries(bones).map(([name, bone]) => [
    name,
    {
      rx: bone.rotation.x,
      ry: bone.rotation.y,
      rz: bone.rotation.z,
      px: bone.position.x,
      py: bone.position.y,
      pz: bone.position.z
    }
  ]));
}

function assertBonesUnchanged(stateA, stateB) {
  assert.deepEqual(stateA, stateB, 'Bones state should not have changed');
}

// 1. Level 0 does not move body bones
async function testLevel0NoMovement() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 0 });
  layer.setEnabled(true);

  const before = getBonesState(vrm.bones);
  layer.update(0.1, { currentAction: 'idle', isVrmaActive: false });
  const after = getBonesState(vrm.bones);

  assertBonesUnchanged(before, after);
}

// 2. Level 1 changes spine/chest breathing
async function testLevel1Breathing() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 1 });
  layer.setEnabled(true);

  const before = getBonesState(vrm.bones);
  layer.update(0.5, { currentAction: 'idle', isVrmaActive: false });
  const after = getBonesState(vrm.bones);

  assert.notDeepEqual(before, after, 'Level 1 must apply breathing overlays');
  assert.notEqual(vrm.bones.spine.rotation.x, 0);
  assert.notEqual(vrm.bones.chest.rotation.x, 0);
  assert.notEqual(vrm.bones.hips.position.y, 0);

  // Other bones (like hips position x/z or arm rotation) should be unchanged
  assert.equal(vrm.bones.hips.position.x, 0);
  assert.equal(vrm.bones.rightUpperArm.rotation.z, 0);
}

// 3. Level 2 changes hips weight shift
async function testLevel2WeightShift() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 2 });
  layer.setEnabled(true);

  layer.update(0.5, { currentAction: 'idle', isVrmaActive: false });

  assert.notEqual(vrm.bones.hips.position.x, 0);
  assert.notEqual(vrm.bones.hips.position.z, 0);
  assert.notEqual(vrm.bones.spine.rotation.z, 0);
}

// 4. Level 3 triggerGesture("touch_face") moves right arm/hand
async function testLevel3TouchFace() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 3 });
  layer.setEnabled(true);

  layer.triggerGesture('touch_face');
  layer.update(0.5, { currentAction: 'idle', isVrmaActive: false });

  assert.notEqual(vrm.bones.rightUpperArm.rotation.z, 0);
  assert.notEqual(vrm.bones.rightLowerArm.rotation.y, 0);
  assert.notEqual(vrm.bones.spine.rotation.x, 0);
}

// 5. Level 4 triggerGesture("stretch") moves both arms/chest
async function testLevel4Stretch() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 4 });
  layer.setEnabled(true);

  layer.triggerGesture('stretch');
  layer.update(0.5, { currentAction: 'idle', isVrmaActive: false });

  assert.notEqual(vrm.bones.leftUpperArm.rotation.z, 0);
  assert.notEqual(vrm.bones.rightUpperArm.rotation.z, 0);
  assert.notEqual(vrm.bones.chest.rotation.x, 0);
}

// 6. Non-idle actions and VRMA-active state do not apply overlays
async function testConstraints() {
  const layer = new HumanMotionLayer();
  const vrm = createFakeVrm();
  layer.setVrm(vrm);
  layer.configure({ profile: 'alicia', level: 4 });
  layer.setEnabled(true);

  // Action is non-idle (e.g., wave)
  const before1 = getBonesState(vrm.bones);
  layer.update(0.5, { currentAction: 'wave', isVrmaActive: false });
  assertBonesUnchanged(before1, getBonesState(vrm.bones));

  // Action is idle, but VRMA is active
  const before2 = getBonesState(vrm.bones);
  layer.update(0.5, { currentAction: 'idle', isVrmaActive: true });
  assertBonesUnchanged(before2, getBonesState(vrm.bones));
}

const tests = [
  testLevel0NoMovement,
  testLevel1Breathing,
  testLevel2WeightShift,
  testLevel3TouchFace,
  testLevel4Stretch,
  testConstraints
];

console.log('Running test_human_motion_layer.mjs...');
for (const test of tests) {
  await test();
  console.log(`PASS ${test.name}`);
}
console.log('test_human_motion_layer: ok');
