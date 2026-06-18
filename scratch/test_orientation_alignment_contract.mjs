import assert from 'node:assert/strict';
import {
  findNearestOrientationFrame,
  normalizeOrientationSequence
} from '../js/AliciaOrientationAlignment.js';

const normalized = normalizeOrientationSequence({
  ok: true,
  frames: [{
    t: 1.23,
    bodyYawDegrees: -220,
    headYawDegrees: -80,
    headPitchDegrees: 45,
    chestYawDegrees: -40,
    shoulderRollDegrees: 22,
    confidence: { body: 1.4, head: 0.66, chest: -0.2 },
    source: { body: 'gvhmr', head: 'mediapipe_face', chest: 'skeleton_3d' }
  }]
});

assert.equal(normalized.ok, true);
assert.equal(normalized.frames.length, 1);
assert.equal(normalized.frames[0].bodyYawDegrees, -180);
assert.equal(normalized.frames[0].headYawDegrees, -45);
assert.equal(normalized.frames[0].headPitchDegrees, 30);
assert.equal(normalized.frames[0].chestYawDegrees, -18);
assert.equal(normalized.frames[0].shoulderRollDegrees, 10);
assert.deepEqual(normalized.frames[0].confidence, { body: 1, head: 0.66, chest: 0 });
assert.deepEqual(normalized.frames[0].source, {
  body: 'gvhmr',
  head: 'mediapipe_face',
  chest: 'skeleton_3d'
});

const nearest = findNearestOrientationFrame([
  { t: 0, bodyYawDegrees: 0 },
  { t: 1, bodyYawDegrees: 30 },
  { t: 2, bodyYawDegrees: 60 }
], 1.4);
assert.equal(nearest.bodyYawDegrees, 30);

const bad = normalizeOrientationSequence({ ok: false, reason: 'missing_orientation_frames' });
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'missing_orientation_frames');
assert.deepEqual(bad.frames, []);

console.log('PASS test_orientation_alignment_contract');
