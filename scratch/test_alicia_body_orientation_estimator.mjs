import assert from 'node:assert/strict';
import { estimateBodyYaw } from '../js/AliciaBodyOrientationEstimator.js';

function rotatePointAroundHips(point, hips, yawDegrees) {
  const yaw = yawDegrees * Math.PI / 180;
  const dx = point.x - hips.x;
  const dz = point.z - hips.z;
  return {
    ...point,
    x: hips.x + dx * Math.cos(yaw) - dz * Math.sin(yaw),
    z: hips.z + dx * Math.sin(yaw) + dz * Math.cos(yaw)
  };
}

function rotateSkeletonYaw(landmarks, yawDegrees) {
  const hips = landmarks.hips;
  return Object.fromEntries(
    Object.entries(landmarks).map(([name, point]) => [name, rotatePointAroundHips(point, hips, yawDegrees)])
  );
}

const frontLandmarks = {
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 },
  nose: { x: 0, y: 1.7, z: -0.08, visibility: 0.95 },
  leftShoulder: { x: -0.22, y: 1.5, z: 0 },
  rightShoulder: { x: 0.22, y: 1.5, z: 0 },
  leftHip: { x: -0.13, y: 1, z: 0 },
  rightHip: { x: 0.13, y: 1, z: 0 },
  leftAnkle: { x: -0.12, y: 0, z: 0.03 },
  rightAnkle: { x: 0.12, y: 0, z: -0.03 }
};

const front = estimateBodyYaw(frontLandmarks);
assert.equal(front.facing, 'front');
assert.ok(Math.abs(front.yawDegrees) < 8, `front yaw should be near 0, got ${front.yawDegrees}`);
assert.ok(front.confidence >= 0.55, `front confidence should be usable, got ${front.confidence}`);
assert.ok(front.evidence.shoulderWidthRatio > 0.8);

const rightSide = estimateBodyYaw(rotateSkeletonYaw(frontLandmarks, 82));
assert.equal(rightSide.facing, 'right_side');
assert.ok(rightSide.yawDegrees > 65 && rightSide.yawDegrees < 95, `right side yaw should be near +90, got ${rightSide.yawDegrees}`);
assert.ok(rightSide.confidence >= 0.65, `right side confidence should be high, got ${rightSide.confidence}`);
assert.ok(Math.abs(rightSide.evidence.shoulderDepthDelta) > 0.35);
assert.ok(rightSide.evidence.shoulderWidthRatio < 0.22);

const leftSide = estimateBodyYaw(rotateSkeletonYaw(frontLandmarks, -78));
assert.equal(leftSide.facing, 'left_side');
assert.ok(leftSide.yawDegrees < -60 && leftSide.yawDegrees > -95, `left side yaw should be near -90, got ${leftSide.yawDegrees}`);
assert.ok(leftSide.confidence >= 0.65, `left side confidence should be high, got ${leftSide.confidence}`);

const noDepthNarrow = estimateBodyYaw({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 },
  leftShoulder: { x: -0.03, y: 1.5, z: 0 },
  rightShoulder: { x: 0.03, y: 1.5, z: 0 },
  leftAnkle: { x: -0.04, y: 0, z: 0 },
  rightAnkle: { x: 0.04, y: 0, z: 0 }
});
assert.equal(noDepthNarrow.facing, 'unknown');
assert.ok(noDepthNarrow.confidence < 0.4);

console.log('PASS test_alicia_body_orientation_estimator');
