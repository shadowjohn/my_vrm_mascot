import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { CYCLE_PHASES } from '../js/MotionCaptureTypes.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const { sequence } = adapter.loadFromText(readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8'));

const detector = new MotionCycleDetector();
const invalidLoop = detector.setLoopRange(960, 0);
assert.equal(invalidLoop.ok, false);
assert.equal(invalidLoop.reason, 'invalid_loop_range');

detector.setLoopRange(0, 960);
assert.deepEqual(detector.getLoop(), { startMs: 0, endMs: 960, durationMs: 960 });
const loopCopy = detector.getLoop();
loopCopy.startMs = 999;
assert.deepEqual(detector.getLoop(), { startMs: 0, endMs: 960, durationMs: 960 });

const seeded = detector.seedEvenWalkPhases(sequence);
assert.equal(seeded.ok, true);
assert.equal(Object.keys(detector.getPhaseMarkers()).length, CYCLE_PHASES.length);
assert.equal(detector.getPhaseMarkers().contact_left.timeMs, 0);
assert.equal(detector.getPhaseMarkers().up_right.timeMs, 840);

const manual = detector.setPhaseMarker('passing_left', 260, sequence);
assert.equal(manual.ok, true);
assert.equal(detector.getPhaseMarkers().passing_left.frameIndex, 2);
const markerCopy = detector.getPhaseMarkers();
markerCopy.passing_left.timeMs = 999;
assert.equal(detector.getPhaseMarkers().passing_left.timeMs, 240);

const unknown = detector.setPhaseMarker('float_spin', 260, sequence);
assert.equal(unknown.ok, false);
assert.equal(unknown.reason, 'unknown_phase');

const emptyMarker = detector.setPhaseMarker('contact_left', 0, { frames: [] });
assert.equal(emptyMarker.ok, false);
assert.equal(emptyMarker.reason, 'empty_frames');

const missingFramesMarker = detector.setPhaseMarker('contact_left', 0, {});
assert.equal(missingFramesMarker.ok, false);
assert.equal(missingFramesMarker.reason, 'empty_frames');

const invalidFramesMarker = detector.setPhaseMarker('contact_left', 0, { frames: [null] });
assert.equal(invalidFramesMarker.ok, false);
assert.equal(invalidFramesMarker.reason, 'invalid_frames');

const invalidTimeMarker = detector.setPhaseMarker('contact_left', NaN, sequence);
assert.equal(invalidTimeMarker.ok, false);
assert.equal(invalidTimeMarker.reason, 'invalid_marker_time');
assert.equal(invalidTimeMarker.phase, 'contact_left');

const emptySeed = detector.seedEvenWalkPhases({ frames: [] });
assert.equal(emptySeed.ok, false);
assert.equal(emptySeed.reason, 'empty_frames');

const missingFramesSeed = detector.seedEvenWalkPhases({});
assert.equal(missingFramesSeed.ok, false);
assert.equal(missingFramesSeed.reason, 'empty_frames');

const invalidFramesSeed = detector.seedEvenWalkPhases({ frames: [null] });
assert.equal(invalidFramesSeed.ok, false);
assert.equal(invalidFramesSeed.reason, 'invalid_frames');

const singleFrameSeedDetector = new MotionCycleDetector();
const singleFrameSeed = singleFrameSeedDetector.seedEvenWalkPhases({
  frames: [{ timeMs: 100, frameIndex: 0 }]
});
assert.equal(singleFrameSeed.ok, false);
assert.equal(singleFrameSeed.reason, 'invalid_loop_range');

const cycleFrames = detector.extractCycleFrames(sequence);
assert.equal(cycleFrames.length, 9);
assert.equal(cycleFrames[0].timeMs, 0);
assert.equal(cycleFrames.at(-1).timeMs, 960);
assert.deepEqual(detector.extractCycleFrames({}), []);
assert.deepEqual(detector.extractCycleFrames({ frames: [null] }), []);
assert.equal(detector.extractCycleFrames({
  frames: [
    { timeMs: 0, frameIndex: 0 },
    null,
    { timeMs: 500, frameIndex: 1 }
  ]
}).length, 2);

console.log('PASS test_motion_cycle_detector');
