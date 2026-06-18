import assert from 'node:assert/strict';
import { applyOrientationTransform } from '../js/AliciaOrientationAlignment.js';
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

const limbBones = [
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg'
];
const animation = {
  bones: {
    hips: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    spine: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    chest: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    leftUpperArm: [{ time_ms: 0, rot: [0.1, 0, 0, 0.99] }],
    leftLowerArm: [{ time_ms: 0, rot: [0.2, 0, 0, 0.98] }],
    rightUpperArm: [{ time_ms: 0, rot: [-0.1, 0, 0, 0.99] }],
    rightLowerArm: [{ time_ms: 0, rot: [-0.2, 0, 0, 0.98] }],
    leftUpperLeg: [{ time_ms: 0, rot: [0, 0.1, 0, 0.99] }],
    leftLowerLeg: [{ time_ms: 0, rot: [0, 0.2, 0, 0.98] }],
    rightUpperLeg: [{ time_ms: 0, rot: [0, -0.1, 0, 0.99] }],
    rightLowerLeg: [{ time_ms: 0, rot: [0, -0.2, 0, 0.98] }]
  }
};
const before = JSON.parse(JSON.stringify(animation));
const transformed = applyOrientationTransform(animation, {
  t: 0,
  headYawDegrees: 20,
  headPitchDegrees: -10,
  chestYawDegrees: 12,
  shoulderRollDegrees: 6,
  confidence: { body: 0, head: 0.8, chest: 0.7 },
  source: { body: 'unknown', head: 'fixture', chest: 'fixture' }
});

assert.notDeepEqual(transformed.bones.chest, before.bones.chest);
assert.notDeepEqual(transformed.bones.spine, before.bones.spine);
for (const bone of limbBones) {
  assert.deepEqual(transformed.bones[bone], before.bones[bone], `${bone} must not be changed by orientation layer`);
}
assert.equal(transformed.orientation_alignment.head.applied, true);
assert.equal(transformed.orientation_alignment.chest.applied, true);

let heldAnimation = null;
let lastGaze = null;
const adapter = new AliciaMotionPreviewAdapter({
  mascot: {
    lookAt: { setPreviewGaze(gaze) { lastGaze = gaze; } },
    motion: {
      getPosePreset() { return { basePose: { rotation: {} } }; },
      holdCustomPose(anim) { heldAnimation = anim; }
    }
  }
});
const result = adapter.previewPoseAtTimeMs(0, [{
  timeMs: 0,
  landmarks: {
    hips: { x: 0, y: 1, z: 0 },
    chest: { x: 0, y: 1.4, z: 0 },
    head: { x: 0, y: 1.7, z: 0 },
    leftShoulder: { x: -0.2, y: 1.5, z: 0 },
    rightShoulder: { x: 0.2, y: 1.5, z: 0 },
    leftElbow: { x: -0.32, y: 1.25, z: 0 },
    rightElbow: { x: 0.32, y: 1.25, z: 0 },
    leftWrist: { x: -0.45, y: 1.1, z: 0 },
    rightWrist: { x: 0.45, y: 1.1, z: 0 },
    leftKnee: { x: -0.12, y: 0.55, z: 0 },
    rightKnee: { x: 0.12, y: 0.55, z: 0 },
    leftAnkle: { x: -0.12, y: 0, z: 0 },
    rightAnkle: { x: 0.12, y: 0, z: 0 }
  }
}], {
  orientationTransform: {
    t: 0,
    headYawDegrees: 16,
    headPitchDegrees: 4,
    chestYawDegrees: 8,
    shoulderRollDegrees: 3,
    confidence: { body: 0, head: 0.9, chest: 0.8 },
    source: { body: 'unknown', head: 'fixture', chest: 'fixture' }
  }
});
assert.equal(result.ok, true);
assert.ok(heldAnimation.orientation_alignment.chest.applied);
assert.ok(result.orientationAlignment.head.applied);
assert.deepEqual(lastGaze, { yawDegrees: 16, pitchDegrees: 4, confidence: 0.9 });

console.log('PASS test_alicia_orientation_preview_adapter');
