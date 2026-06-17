import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportMotionClip } from '../js/MotionClipExporter.js';

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const { sequence } = adapter.loadFromText(readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8'));
const detector = new MotionCycleDetector();
detector.setLoopRange(0, 960);
detector.seedEvenWalkPhases(sequence);

const clip = exportMotionClip({
  id: 'walk_cycle_001',
  label: 'Walk Cycle 001',
  sequence,
  detector,
  source: {
    type: 'skeleton_json',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'walk_reference_001'
  },
  retargetHints: {
    strideScale: 1.2,
    armSwingScale: 0.8,
    hipBobScale: 1.1,
    smoothing: 0.4
  }
});

assert.equal(clip.schemaVersion, 1);
assert.equal(clip.kind, 'motion_clip_v1');
assert.equal(clip.id, 'walk_cycle_001');
assert.equal(clip.loop.durationMs, 960);
assert.equal(clip.keyPoses.length, 8);
assert.equal(clip.keyPoses[0].phase, 'contact_left');
assert.equal(clip.keyPoses[0].landmarks.hips.y, 1.02);
assert.equal(Array.isArray(clip.phases), false);
assert.equal(clip.phases.contact_left.timeMs, 0);
assert.equal(clip.retargetHints.strideScale, 1.2);

const text = JSON.stringify(clip, null, 2);
assert.match(text, /"kind": "motion_clip_v1"/);
assert.match(text, /"contact_left"/);

assert.notEqual(clip.keyPoses[0].landmarks, sequence.frames[0].landmarks);
assert.notEqual(clip.keyPoses[0].landmarks.hips, sequence.frames[0].landmarks.hips);
clip.keyPoses[0].landmarks.hips.y = 999;
assert.equal(sequence.frames[0].landmarks.hips.y, 1.02);

const sparseDetector = new MotionCycleDetector();
sparseDetector.setLoopRange(0, 960);
sparseDetector.setPhaseMarker('contact_left', 0, sequence);
const sparseClip = exportMotionClip({
  id: 'sparse_walk',
  label: 'Sparse Walk',
  sequence,
  detector: sparseDetector,
  source: { type: 'skeleton_json' }
});

assert.equal(sparseClip.keyPoses.length, 1);
assert.deepEqual(Object.keys(sparseClip.phases), ['contact_left']);
assert.equal(sparseClip.phases.contact_left.frameIndex, 0);
assert.deepEqual(sparseClip.retargetHints, {
  strideScale: 1,
  armSwingScale: 1,
  hipBobScale: 1,
  smoothing: 0.35
});

let nullHintsClip;
assert.doesNotThrow(() => {
  nullHintsClip = exportMotionClip({
    id: 'null_hints_walk',
    label: 'Null Hints Walk',
    sequence,
    detector: sparseDetector,
    source: { type: 'skeleton_json' },
    retargetHints: null
  });
});
assert.deepEqual(nullHintsClip.retargetHints, {
  strideScale: 1,
  armSwingScale: 1,
  hipBobScale: 1,
  smoothing: 0.35
});

let invalidSequenceClip;
assert.doesNotThrow(() => {
  invalidSequenceClip = exportMotionClip({
    id: 'invalid_sequence_walk',
    label: 'Invalid Sequence Walk',
    sequence: null,
    detector,
    source: { type: 'skeleton_json' }
  });
});
assert.equal(invalidSequenceClip.kind, 'motion_clip_v1');
assert.equal(invalidSequenceClip.keyPoses.length, 0);
assert.equal(invalidSequenceClip.phases.contact_left.timeMs, 0);

let missingDetectorClip;
assert.doesNotThrow(() => {
  missingDetectorClip = exportMotionClip({
    id: 'missing_detector_walk',
    label: 'Missing Detector Walk',
    sequence: { frames: null },
    source: { type: 'skeleton_json' }
  });
});
assert.deepEqual(missingDetectorClip.loop, { startMs: 0, endMs: 0, durationMs: 0 });
assert.deepEqual(missingDetectorClip.phases, {});
assert.equal(missingDetectorClip.keyPoses.length, 0);

const missingFrameDetector = {
  getLoop() {
    return { startMs: 0, endMs: 960, durationMs: 960 };
  },
  getPhaseMarkers() {
    return {
      contact_left: { timeMs: 0, frameIndex: 999 },
      down_left: { timeMs: 120 }
    };
  }
};
let missingFrameClip;
assert.doesNotThrow(() => {
  missingFrameClip = exportMotionClip({
    id: 'missing_frame_walk',
    label: 'Missing Frame Walk',
    sequence,
    detector: missingFrameDetector,
    source: { type: 'skeleton_json' },
    retargetHints: {
      strideScale: 'abc',
      armSwingScale: Infinity,
      hipBobScale: NaN,
      smoothing: 'bad'
    }
  });
});
assert.deepEqual(missingFrameClip.phases.contact_left, { timeMs: 0, frameIndex: 999 });
assert.deepEqual(missingFrameClip.phases.down_left, { timeMs: 120 });
assert.equal(missingFrameClip.keyPoses.some((keyPose) => keyPose.phase === 'contact_left'), false);
assert.equal(missingFrameClip.keyPoses.some((keyPose) => keyPose.phase === 'down_left'), false);
assert.deepEqual(missingFrameClip.retargetHints, {
  strideScale: 1,
  armSwingScale: 1,
  hipBobScale: 1,
  smoothing: 0.35
});

console.log('PASS test_motion_clip_exporter');
