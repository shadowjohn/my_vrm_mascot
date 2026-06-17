import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportWalkStyle } from '../js/WalkStyleExtractor.js';
import { buildAliciaWalkAnimation } from '../js/AliciaWalkGenerator.js';
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const { sequence } = adapter.loadFromText(readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8'));
const detector = new MotionCycleDetector();
detector.setLoopRange(0, 960);
detector.seedEvenWalkPhases(sequence);

const style = exportWalkStyle({
  id: 'walk_style_001',
  label: 'Walk Style 001',
  sequence,
  detector,
  source: {
    type: 'skeleton_json',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'walk_reference_001'
  }
});

assert.equal(style.schemaVersion, 1);
assert.equal(style.kind, 'walk_style_v1');
assert.equal(style.id, 'walk_style_001');
assert.equal(style.loop.durationMs, 960);
assert.equal(style.source.type, 'skeleton_json');
assert.equal(style.phases.contact_left.timeMs, 0);
assert.equal(Array.isArray(style.keyPoses), false);
assert.equal(Object.hasOwn(style, 'bones'), false);
assert.ok(style.parameters.stride >= 0 && style.parameters.stride <= 1);
assert.ok(style.parameters.cadence > 0);
assert.ok(style.parameters.armSwing >= 0 && style.parameters.armSwing <= 1);
assert.ok(style.parameters.hipBob >= 0 && style.parameters.hipBob <= 1);
assert.ok(style.parameters.bounce >= 0 && style.parameters.bounce <= 1);
assert.ok(style.parameters.bodyLean >= -1 && style.parameters.bodyLean <= 1);
assert.ok(style.confidence.overall > 0 && style.confidence.overall <= 1);
assert.ok(Number.isFinite(style.confidence.trackingConfidence));
assert.ok(Number.isFinite(style.confidence.depthConfidence));

const liftedSequence = {
  ...sequence,
  poseMode: '3d_lifted',
  depthSource: 'motionbert_poc',
  viewpoint: 'front',
  frames: sequence.frames.map((frame) => ({
    ...frame,
    landmarks: {
      ...frame.landmarks,
      leftKnee: { x: -0.08, y: 0.55, z: -0.22, visibility: 0.92 },
      rightKnee: { x: 0.08, y: 0.55, z: 0.26, visibility: 0.92 },
      leftAnkle: { ...frame.landmarks.leftAnkle, z: -0.34 },
      rightAnkle: { ...frame.landmarks.rightAnkle, z: 0.31 }
    }
  }))
};
const liftedStyle = exportWalkStyle({
  id: 'walk_style_3d_lifted',
  label: 'Walk Style 3D Lifted',
  sequence: liftedSequence,
  detector,
  source: {
    type: 'video',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'motionbert_poc'
  }
});
assert.equal(liftedStyle.poseMode, '3d_lifted');
assert.equal(liftedStyle.viewpoint, 'front');
assert.equal(liftedStyle.leadFoot, 'left');
assert.ok(liftedStyle.frontBackConfidence >= 0.6);
assert.equal(liftedStyle.metadata.poseMode, '3d_lifted');
assert.equal(liftedStyle.metadata.depthSource, 'motionbert_poc');
assert.ok(liftedStyle.confidence.depthConfidence >= 0.6);

const slowStyle = {
  ...style,
  parameters: {
    stride: 0.25,
    cadence: 0.9,
    armSwing: 0.1,
    hipBob: 0.02,
    bounce: 0.02,
    bodyLean: 0
  }
};
const energeticStyle = {
  ...style,
  parameters: {
    stride: 0.9,
    cadence: 1.8,
    armSwing: 0.75,
    hipBob: 0.18,
    bounce: 0.22,
    bodyLean: 0.16
  }
};

const slowAnimation = buildAliciaWalkAnimation(slowStyle);
const energeticAnimation = buildAliciaWalkAnimation(energeticStyle);

assert.equal(slowAnimation.retarget_mode, 'walk_style_generator');
assert.equal(energeticAnimation.retarget_mode, 'walk_style_generator');
assert.ok(slowAnimation.duration_ms > energeticAnimation.duration_ms);
assert.equal(slowAnimation.bones.leftUpperArm.length, 9);
assert.equal(energeticAnimation.bones.leftUpperLeg.length, 9);
assert.ok(slowAnimation.hips_position.length >= 9);
assert.notDeepEqual(
  slowAnimation.bones.leftUpperArm[2].rot,
  energeticAnimation.bones.leftUpperArm[2].rot
);
assert.notDeepEqual(
  slowAnimation.hips_position[2].pos,
  energeticAnimation.hips_position[2].pos
);

const calls = [];
const preview = new AliciaMotionPreviewAdapter({
  mascot: {
    enableHumanization(config) {
      calls.push(['enableHumanization', config]);
    },
    motion: {
      playCustom(animData, options) {
        calls.push(['playCustom', animData, options]);
      }
    }
  }
});
const previewResult = preview.previewClip(energeticStyle);
assert.equal(previewResult.ok, true);
assert.equal(previewResult.adapter, 'walk_style_generator');
assert.equal(previewResult.retargetMode, 'walk_style_generator');
assert.deepEqual(calls[0], ['enableHumanization', { profile: 'alicia', level: 2 }]);
assert.equal(calls[1][0], 'playCustom');
assert.equal(calls[1][1].kind, undefined);
assert.equal(calls[1][1].retarget_mode, 'walk_style_generator');
assert.deepEqual(calls[1][2], { loop: true });

calls.length = 0;
const traceStyle = {
  ...energeticStyle,
  previewSpeed: 1.25,
  previewFrames: sequence.frames.slice(0, 5).map((frame) => ({
    timeMs: frame.timeMs,
    frameIndex: frame.frameIndex,
    landmarks: frame.landmarks
  }))
};
const traceResult = preview.previewClip(traceStyle);
assert.equal(traceResult.ok, true);
assert.equal(traceResult.adapter, 'walk_style_skeleton_trace');
assert.equal(traceResult.retargetMode, 'endpoint_preview');
assert.equal(calls[1][0], 'playCustom');
assert.equal(calls[1][1].retarget_mode, 'endpoint_preview');
assert.equal(calls[1][1].source_kind, 'walk_style_v1');
assert.notEqual(calls[1][1].retarget_mode, 'walk_style_generator');

console.log('PASS test_walk_style_extractor');
