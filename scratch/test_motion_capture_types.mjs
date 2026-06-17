import assert from 'node:assert/strict';
import {
  CAPTURE_SOURCE_TYPES,
  CYCLE_PHASES,
  MOTION_CLIP_SCHEMA_VERSION,
  REQUIRED_CANONICAL_LANDMARKS,
  createEmptyCycleMarkers,
  isValidCyclePhase,
  normalizeCaptureFrame,
  normalizeLandmark,
  validateSkeletonSequence
} from '../js/MotionCaptureTypes.js';

assert.deepEqual(CAPTURE_SOURCE_TYPES, ['video', 'webcam', 'skeleton_json', 'vrma']);
assert.deepEqual(CYCLE_PHASES, [
  'contact_left',
  'down_left',
  'passing_left',
  'up_left',
  'contact_right',
  'down_right',
  'passing_right',
  'up_right'
]);
assert.equal(MOTION_CLIP_SCHEMA_VERSION, 1);
assert.deepEqual(REQUIRED_CANONICAL_LANDMARKS, [
  'hips',
  'chest',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftWrist',
  'rightWrist',
  'leftAnkle',
  'rightAnkle'
]);
assert.ok(isValidCyclePhase('contact_left'));
assert.equal(isValidCyclePhase('float_spin'), false);

const markers = createEmptyCycleMarkers();
assert.deepEqual(Object.keys(markers), CYCLE_PHASES);
assert.equal(markers.contact_left, null);

const normalized = normalizeCaptureFrame({
  timeMs: 33.3,
  landmarks: {
    hips: { x: '0', y: 1, z: 0 },
    chest: { x: 0, y: 1.4, z: 0 },
    head: { x: 0, y: 1.7, z: 0 },
    leftShoulder: { x: -0.2, y: 1.45, z: 0 },
    rightShoulder: { x: 0.2, y: 1.45, z: 0 },
    leftWrist: { x: -0.32, y: 1.05, z: 0 },
    rightWrist: { x: 0.32, y: 1.05, z: 0 },
    leftAnkle: { x: -0.1, y: 0.05, z: 0.15 },
    rightAnkle: { x: 0.1, y: 0.05, z: -0.15 }
  }
}, 1);

assert.equal(normalized.frameIndex, 1);
assert.equal(normalized.timeMs, 33.3);
assert.equal(normalized.landmarks.hips.x, 0);
assert.equal(normalized.landmarks.hips.visibility, 1);

const fallbackLandmark = normalizeLandmark({
  x: 'nope',
  y: 2,
  z: null
});
assert.equal(fallbackLandmark.x, 0);
assert.equal(fallbackLandmark.y, 2);
assert.equal(fallbackLandmark.z, 0);
assert.equal(fallbackLandmark.visibility, 1);

const invalidVisibilityLandmark = normalizeLandmark({
  x: 1,
  y: 2,
  z: 3,
  visibility: 'hidden'
});
assert.equal(invalidVisibilityLandmark.visibility, 1);

const valid = validateSkeletonSequence({
  id: 'unit_walk',
  sourceType: 'skeleton_json',
  fps: 30,
  frames: [normalized]
});
assert.equal(valid.ok, true);

const invalid = validateSkeletonSequence({
  id: 'bad_walk',
  sourceType: 'skeleton_json',
  fps: 30,
  frames: [{ timeMs: 0, landmarks: { hips: { x: 0, y: 1, z: 0 } } }]
});
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'missing_landmark');
assert.equal(invalid.landmark, 'chest');

const unknownSourceType = validateSkeletonSequence({
  id: 'bad_source',
  sourceType: 'spreadsheet',
  fps: 30,
  frames: [normalized]
});
assert.equal(unknownSourceType.ok, false);
assert.equal(unknownSourceType.reason, 'unknown_source_type');

const emptyFrames = validateSkeletonSequence({
  id: 'empty_walk',
  sourceType: 'skeleton_json',
  fps: 30,
  frames: []
});
assert.equal(emptyFrames.ok, false);
assert.equal(emptyFrames.reason, 'empty_frames');

const nullFrame = validateSkeletonSequence({
  id: 'null_frame',
  sourceType: 'video',
  fps: 30,
  frames: [null]
});
assert.equal(nullFrame.ok, false);
assert.equal(nullFrame.reason, 'invalid_frame');
assert.equal(nullFrame.frameIndex, 0);

const missingLandmarks = validateSkeletonSequence({
  id: 'missing_landmarks',
  sourceType: 'video',
  fps: 30,
  frames: [{ timeMs: 0 }]
});
assert.equal(missingLandmarks.ok, false);
assert.equal(missingLandmarks.reason, 'missing_landmarks');
assert.equal(missingLandmarks.frameIndex, 0);

console.log('PASS test_motion_capture_types');
