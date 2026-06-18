import assert from 'node:assert/strict';
import { estimateHeadGaze } from '../js/AliciaHeadGazeEstimator.js';

const lookingLeft = estimateHeadGaze({
  nose: { x: -0.08, y: 1.68, z: -0.08, visibility: 0.95 },
  leftEar: { x: -0.22, y: 1.66, z: 0, visibility: 0.92 },
  rightEar: { x: 0.18, y: 1.66, z: 0, visibility: 0.92 },
  head: { x: 0, y: 1.7, z: 0 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.equal(lookingLeft.source, 'mediapipe_face');
assert.ok(lookingLeft.headYawDegrees < -8);
assert.ok(lookingLeft.confidence >= 0.55);

const lookingRight = estimateHeadGaze({
  nose: { x: 0.09, y: 1.68, z: -0.08, visibility: 0.95 },
  leftEar: { x: -0.18, y: 1.66, z: 0, visibility: 0.92 },
  rightEar: { x: 0.22, y: 1.66, z: 0, visibility: 0.92 },
  head: { x: 0, y: 1.7, z: 0 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.ok(lookingRight.headYawDegrees > 8);

const skeletonFallback = estimateHeadGaze({
  head: { x: 0.05, y: 1.72, z: -0.11 },
  neck: { x: 0, y: 1.54, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 }
});
assert.equal(skeletonFallback.source, 'skeleton_3d');
assert.ok(skeletonFallback.confidence >= 0.35);

const missing = estimateHeadGaze({ hips: { x: 0, y: 1, z: 0 } });
assert.equal(missing.source, 'unknown');
assert.ok(missing.confidence < 0.2);
assert.equal(missing.headYawDegrees, 0);

console.log('PASS test_alicia_head_gaze_estimator');
