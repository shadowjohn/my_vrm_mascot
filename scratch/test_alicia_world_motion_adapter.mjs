import assert from 'node:assert/strict';
import {
  findNearestWorldMotionFrame,
  normalizeWorldMotion
} from '../js/AliciaWorldMotionAdapter.js';

const normalized = normalizeWorldMotion({
  ok: true,
  source: 'gvhmr',
  frames: [
    {
      t: '0.033',
      bodyYawDegrees: '-82.5',
      rootTranslation: { x: '0.02', y: 'bad', z: '0.14' },
      footContact: { left: 0.9, right: 0.2 },
      confidence: 1.4,
      landmarks: {
        hips: { x: '0', y: '1', z: '0' },
        leftAnkle: { x: '-0.1', y: '0.02', z: '0.12' },
        rightAnkle: { x: '0.1', y: '0', z: '-0.08' },
        badJoint: { x: 'nope', y: 0, z: 0 }
      }
    },
    {
      t: 0.1,
      bodyYawDegrees: -80,
      rootTranslation: { x: 0.03, y: 0, z: 0.2 },
      footContact: { left: false, right: true },
      confidence: 0.75
    }
  ],
  metadata: { staticCamera: true }
});

assert.equal(normalized.ok, true);
assert.equal(normalized.source, 'gvhmr');
assert.equal(normalized.frames.length, 2);
assert.deepEqual(normalized.frames[0].rootTranslation, { x: 0.02, y: 0, z: 0.14 });
assert.deepEqual(normalized.frames[0].footContact, { left: true, right: false });
assert.deepEqual(normalized.frames[0].landmarks.leftAnkle, { x: -0.1, y: 0.02, z: 0.12 });
assert.equal(normalized.frames[0].landmarks.badJoint, undefined);
assert.equal(normalized.frames[0].confidence, 1);
assert.equal(findNearestWorldMotionFrame(normalized.frames, 0.09).t, 0.1);

const missing = normalizeWorldMotion({ ok: false, source: 'gvhmr', reason: 'missing_binary' });
assert.equal(missing.ok, false);
assert.equal(missing.reason, 'missing_binary');
assert.deepEqual(missing.frames, []);

const invalid = normalizeWorldMotion({ ok: true, source: 'unknown', frames: [{ t: 'nope' }] });
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'missing_valid_frames');

console.log('PASS test_alicia_world_motion_adapter');
