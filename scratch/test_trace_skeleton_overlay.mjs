import assert from 'node:assert/strict';
import {
  DEFAULT_TRACE_BONES,
  buildTraceSkeletonFrame,
  prepareTraceSkeletonFrames,
  summarizeTraceAlignment
} from '../js/TraceSkeletonOverlay.js';

const sourceFrame = {
  timeMs: 1000,
  frameIndex: 12,
  landmarks: {
    head: { x: 0.2, y: 1.72, z: -0.04 },
    chest: { x: 0.2, y: 1.28, z: 0.0 },
    hips: { x: 0.2, y: 0.86, z: 0.0 },
    leftShoulder: { x: 0.38, y: 1.32, z: 0.02 },
    rightShoulder: { x: 0.02, y: 1.32, z: -0.01 },
    leftElbow: { x: 0.48, y: 1.05, z: 0.10 },
    rightElbow: { x: -0.13, y: 1.06, z: -0.16 },
    leftWrist: { x: 0.56, y: 0.86, z: 0.18 },
    rightWrist: { x: -0.26, y: 0.94, z: -0.22 },
    leftKnee: { x: 0.13, y: 0.46, z: -0.16 },
    rightKnee: { x: 0.28, y: 0.46, z: 0.12 },
    leftAnkle: { x: 0.08, y: 0.04, z: -0.24 },
    rightAnkle: { x: 0.31, y: 0.02, z: 0.14 }
  }
};

assert.ok(
  DEFAULT_TRACE_BONES.some(([from, to]) => from === 'leftKnee' && to === 'leftAnkle'),
  'trace overlay must draw leg chains'
);

const normalized = buildTraceSkeletonFrame(sourceFrame, {
  targetHeight: 1.6,
  groundY: -0.95,
  depthScale: 0.7
});

assert.equal(normalized.timeMs, 1000);
assert.equal(normalized.frameIndex, 12);
assert.ok(Math.abs(normalized.joints.hips.x) < 0.000001, 'hips should be centered on Alicia');
assert.ok(
  normalized.joints.leftShoulder.x > 0 && normalized.joints.rightShoulder.x < 0,
  'trace overlay should preserve source left/right visual sides by default'
);
assert.ok(Math.abs(normalized.joints.rightAnkle.y - -0.95) < 0.000001, 'lowest ankle should touch Alicia ground');
assert.ok(normalized.joints.leftAnkle.z > normalized.joints.rightAnkle.z, 'near camera depth should map toward camera');
assert.equal(normalized.metrics.leadFoot, 'left');
assert.ok(normalized.metrics.depthConfidence >= 0.6);
assert.ok(normalized.metrics.leftFootLift > normalized.metrics.rightFootLift);

const frames = prepareTraceSkeletonFrames([
  sourceFrame,
  {
    ...sourceFrame,
    timeMs: 1400,
    frameIndex: 13,
    landmarks: {
      ...sourceFrame.landmarks,
      leftAnkle: { x: 0.11, y: 0.02, z: -0.18 },
      rightAnkle: { x: 0.28, y: 0.08, z: 0.20 }
    }
  }
], {
  loopStartMs: 1000,
  loopDurationMs: 800,
  previewSpeed: 2,
  targetHeight: 1.6,
  groundY: -0.95
});

assert.equal(frames.length, 2);
assert.equal(frames[0].previewTimeMs, 0);
assert.equal(frames[1].previewTimeMs, 200);
assert.equal(frames[1].durationMs, 400);

const summary = summarizeTraceAlignment(frames);
assert.equal(summary.sampleCount, 2);
assert.equal(summary.leadFoot, 'left');
assert.ok(summary.depthConfidence >= 0.6);
assert.match(summary.footDeltaLabel, /^L [0-9.]+ \/ R [0-9.]+$/);

console.log('PASS test_trace_skeleton_overlay');
