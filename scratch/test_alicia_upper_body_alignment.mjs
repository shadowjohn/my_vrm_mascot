import assert from 'node:assert/strict';
import { estimateUpperBodyAlignment } from '../js/AliciaUpperBodyAlignment.js';

const yawed = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0.03, y: 1.42, z: -0.18 },
  leftShoulder: { x: -0.12, y: 1.5, z: -0.12 },
  rightShoulder: { x: 0.18, y: 1.5, z: 0.12 },
  leftHip: { x: -0.12, y: 1, z: 0 },
  rightHip: { x: 0.12, y: 1, z: 0 }
});
assert.equal(yawed.source, 'skeleton_3d');
assert.ok(Math.abs(yawed.chestYawDegrees) > 4);
assert.ok(yawed.confidence >= 0.35);

const rolled = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 0, y: 1.42, z: 0 },
  leftShoulder: { x: -0.2, y: 1.56, z: 0 },
  rightShoulder: { x: 0.2, y: 1.45, z: 0 },
  leftHip: { x: -0.12, y: 1, z: 0 },
  rightHip: { x: 0.12, y: 1, z: 0 }
});
assert.ok(Math.abs(rolled.shoulderRollDegrees) > 4);
assert.ok(Math.abs(rolled.shoulderRollDegrees) <= 10);

const extreme = estimateUpperBodyAlignment({
  hips: { x: 0, y: 1, z: 0 },
  chest: { x: 1, y: 1.42, z: -1 },
  leftShoulder: { x: -2, y: 2, z: -2 },
  rightShoulder: { x: 2, y: 1, z: 2 }
});
assert.ok(Math.abs(extreme.chestYawDegrees) <= 18);
assert.ok(Math.abs(extreme.shoulderRollDegrees) <= 10);

const missing = estimateUpperBodyAlignment({ head: { x: 0, y: 1.7, z: 0 } });
assert.equal(missing.source, 'unknown');
assert.equal(missing.confidence, 0);

console.log('PASS test_alicia_upper_body_alignment');
