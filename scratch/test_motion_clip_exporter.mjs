import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportMotionClip } from '../js/MotionClipExporter.js';
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

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

const calls = [];
const preview = new AliciaMotionPreviewAdapter({
  mascot: {
    enableHumanization(config) {
      calls.push(['enableHumanization', config]);
    },
    motion: {
      getPosePreset() {
        return {
          basePose: {
            rotation: {
              hips: { x: 0, y: 0, z: 0 },
              spine: { x: 2, y: 0, z: -2 },
              chest: { x: -1, y: -2, z: -1 },
              leftUpperArm: { x: 7, y: 0, z: 42 },
              rightUpperArm: { x: 7, y: 0, z: -42 },
              leftLowerArm: { x: 0, y: -9, z: 0 },
              rightLowerArm: { x: 0, y: 9, z: 0 },
              leftUpperLeg: { x: 1, y: 0, z: 2 },
              rightUpperLeg: { x: -1, y: 0, z: -2 },
              leftLowerLeg: { x: 0, y: 0, z: 0 },
              rightLowerLeg: { x: 0, y: 0, z: 0 }
            }
          }
        };
      },
      playCustom(animData, options) {
        calls.push(['motion.playCustom', animData, options]);
      },
      play(name) {
        calls.push(['motion.play', name]);
      }
    }
  }
});

const previewResult = preview.previewClip(clip);
assert.equal(previewResult.ok, true);
assert.equal(previewResult.adapter, 'motion_clip_custom');
assert.equal(previewResult.retargetMode, 'endpoint_preview');
assert.deepEqual(calls[0], ['enableHumanization', { profile: 'alicia', level: 2 }]);
assert.equal(calls[1][0], 'motion.playCustom');
assert.equal(calls[1][1].name, 'walk_cycle_001');
assert.equal(calls[1][1].duration_ms, 960);
assert.ok(calls[1][1].hips_position.length >= 2);
assert.ok(calls[1][1].bones.leftUpperArm.length >= 2);
assert.ok(calls[1][1].bones.rightUpperLeg.length >= 2);
assert.deepEqual(calls[1][2], { loop: true });
assert.equal(calls.some(([name]) => name === 'motion.play'), false);

const customCalls = [];
const variantClip = {
  kind: 'motion_clip_v1',
  id: 'variant_walk',
  loop: { startMs: 1000, endMs: 1400, durationMs: 400 },
  keyPoses: [
    {
      phase: 'contact_left',
      timeMs: 1000,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftWrist: { x: -0.35, y: 1.05, z: 0.08 },
        rightWrist: { x: 0.35, y: 1.2, z: -0.08 },
        leftAnkle: { x: -0.08, y: 0, z: 0.1 },
        rightAnkle: { x: 0.08, y: 0, z: -0.1 }
      }
    },
    {
      phase: 'contact_right',
      timeMs: 1400,
      landmarks: {
        hips: { x: 0.12, y: 1.08, z: 0.02 },
        chest: { x: 0.02, y: 1.45, z: 0 },
        leftShoulder: { x: -0.18, y: 1.5, z: 0 },
        rightShoulder: { x: 0.22, y: 1.5, z: 0 },
        leftWrist: { x: -0.26, y: 1.28, z: -0.06 },
        rightWrist: { x: 0.48, y: 0.98, z: 0.08 },
        leftAnkle: { x: -0.14, y: 0, z: -0.12 },
        rightAnkle: { x: 0.16, y: 0, z: 0.12 }
      }
    }
  ],
  retargetHints: {
    strideScale: 1.4,
    armSwingScale: 1.2,
    hipBobScale: 1.1,
    smoothing: 0.35
  }
};
const variantPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        customCalls.push(animData);
      }
    }
  }
});
assert.equal(variantPreview.previewClip(variantClip).ok, true);
assert.notDeepEqual(
  customCalls[0].bones.leftUpperArm[0].rot,
  customCalls[0].bones.leftUpperArm[1].rot
);
assert.notDeepEqual(customCalls[0].hips_position[0].pos, customCalls[0].hips_position[1].pos);

const previewFrameCalls = [];
const frameDenseClip = {
  ...variantClip,
  id: 'frame_dense_walk',
  previewFrames: [
    variantClip.keyPoses[0],
    {
      timeMs: 1200,
      frameIndex: 4,
      landmarks: {
        hips: { x: 0.03, y: 1.02, z: 0 },
        chest: { x: 0.01, y: 1.43, z: 0 },
        leftShoulder: { x: -0.18, y: 1.48, z: 0 },
        rightShoulder: { x: 0.2, y: 1.48, z: 0 },
        leftWrist: { x: -0.32, y: 1.05, z: 0 },
        rightWrist: { x: 0.82, y: 1.62, z: 0.02 },
        leftAnkle: { x: -0.12, y: 0, z: -0.05 },
        rightAnkle: { x: 0.12, y: 0, z: 0.05 }
      }
    },
    variantClip.keyPoses[1]
  ]
};
const frameDensePreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        previewFrameCalls.push(animData);
      }
    }
  }
});
const frameDenseResult = frameDensePreview.previewClip(frameDenseClip);
assert.equal(frameDenseResult.ok, true);
assert.equal(frameDenseResult.sampleCount, 3);
assert.equal(previewFrameCalls[0].bones.rightUpperArm.length, 3);
assert.notDeepEqual(
  previewFrameCalls[0].bones.rightUpperArm[0].rot,
  previewFrameCalls[0].bones.rightUpperArm[1].rot
);

const jointChainCalls = [];
const jointChainClip = {
  ...variantClip,
  id: 'joint_chain_walk',
  previewFrames: [
    {
      timeMs: 1000,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftElbow: { x: -0.28, y: 1.22, z: 0.02 },
        rightElbow: { x: 0.32, y: 1.22, z: 0.02 },
        leftWrist: { x: -0.42, y: 1.12, z: 0.02 },
        rightWrist: { x: 0.46, y: 1.14, z: 0.02 },
        leftKnee: { x: -0.08, y: 0.48, z: 0.02 },
        rightKnee: { x: 0.08, y: 0.48, z: 0.02 },
        leftAnkle: { x: -0.12, y: 0, z: 0.02 },
        rightAnkle: { x: 0.14, y: 0, z: 0.02 }
      }
    },
    {
      timeMs: 1400,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftElbow: { x: -0.5, y: 1.48, z: -0.22 },
        rightElbow: { x: 0.5, y: 1.48, z: -0.22 },
        leftWrist: { x: -0.42, y: 1.12, z: 0.02 },
        rightWrist: { x: 0.46, y: 1.14, z: 0.02 },
        leftKnee: { x: -0.28, y: 0.52, z: -0.24 },
        rightKnee: { x: 0.28, y: 0.52, z: 0.26 },
        leftAnkle: { x: -0.12, y: 0, z: 0.02 },
        rightAnkle: { x: 0.14, y: 0, z: 0.02 }
      }
    }
  ]
};
const jointChainPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        jointChainCalls.push(animData);
      }
    }
  }
});
const jointChainResult = jointChainPreview.previewClip(jointChainClip);
assert.equal(jointChainResult.adapter, 'motion_clip_custom');
assert.equal(jointChainResult.retargetMode, 'joint_chain_preview');
assert.notDeepEqual(
  jointChainCalls[0].bones.leftUpperArm[0].rot,
  jointChainCalls[0].bones.leftUpperArm[1].rot
);
assert.notDeepEqual(
  jointChainCalls[0].bones.leftLowerArm[0].rot,
  jointChainCalls[0].bones.leftLowerArm[1].rot
);
assert.notDeepEqual(
  jointChainCalls[0].bones.leftUpperLeg[0].rot,
  jointChainCalls[0].bones.leftUpperLeg[1].rot
);
assert.notDeepEqual(
  jointChainCalls[0].bones.leftLowerLeg[0].rot,
  jointChainCalls[0].bones.leftLowerLeg[1].rot
);
assert.equal(jointChainCalls[0].retarget_mode, 'joint_chain_preview');

const raisedArmCalls = [];
const raisedArmClip = {
  kind: 'walk_style_v1',
  id: 'raised_arm_trace',
  loop: { startMs: 0, endMs: 400, durationMs: 400 },
  parameters: {
    stride: 0.4,
    cadence: 1.2,
    armSwing: 0.7,
    hipBob: 0.1,
    bounce: 0.1,
    bodyLean: 0
  },
  retargetHints: {
    strideScale: 1,
    armSwingScale: 1,
    hipBobScale: 1
  },
  previewFrames: [
    {
      timeMs: 0,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftElbow: { x: -0.28, y: 1.25, z: 0 },
        rightElbow: { x: 0.28, y: 1.25, z: 0 },
        leftWrist: { x: -0.33, y: 1.05, z: 0 },
        rightWrist: { x: 0.33, y: 1.05, z: 0 },
        leftKnee: { x: -0.08, y: 0.5, z: 0 },
        rightKnee: { x: 0.08, y: 0.5, z: 0 },
        leftAnkle: { x: -0.1, y: 0, z: 0 },
        rightAnkle: { x: 0.1, y: 0, z: 0 }
      }
    },
    {
      timeMs: 400,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftElbow: { x: -0.28, y: 1.68, z: -0.05 },
        rightElbow: { x: 0.28, y: 1.68, z: -0.05 },
        leftWrist: { x: -0.18, y: 1.82, z: -0.12 },
        rightWrist: { x: 0.18, y: 1.82, z: -0.12 },
        leftKnee: { x: -0.08, y: 0.5, z: 0 },
        rightKnee: { x: 0.08, y: 0.5, z: 0 },
        leftAnkle: { x: -0.1, y: 0, z: 0 },
        rightAnkle: { x: 0.1, y: 0, z: 0 }
      }
    }
  ]
};
const raisedArmPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        raisedArmCalls.push(animData);
      }
    }
  }
});
const raisedArmResult = raisedArmPreview.previewClip(raisedArmClip);
assert.equal(raisedArmResult.adapter, 'walk_style_skeleton_trace');
assert.equal(raisedArmResult.retargetMode, 'joint_chain_preview');
assert.equal(raisedArmCalls[0].bones.leftShoulder.length, 2);
assert.equal(raisedArmCalls[0].bones.rightShoulder.length, 2);
assert.ok(
  raisedArmCalls[0].bones.leftUpperArm[0].rot[2] > 0 &&
    raisedArmCalls[0].bones.leftUpperArm[1].rot[2] < 0,
  'raised left wrist should pull Alicia left upper arm away from the down-pose direction'
);
assert.ok(
  raisedArmCalls[0].bones.rightUpperArm[0].rot[2] < 0 &&
    raisedArmCalls[0].bones.rightUpperArm[1].rot[2] > 0,
  'raised right wrist should pull Alicia right upper arm away from the down-pose direction'
);

const bentHandCalls = [];
const bentHandNearHeadClip = {
  ...raisedArmClip,
  id: 'bent_hand_near_head_trace',
  previewFrames: [
    raisedArmClip.previewFrames[0],
    {
      timeMs: 400,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.4, z: 0 },
        leftShoulder: { x: -0.2, y: 1.5, z: 0 },
        rightShoulder: { x: 0.2, y: 1.5, z: 0 },
        leftElbow: { x: -0.28, y: 1.36, z: -0.04 },
        rightElbow: { x: 0.28, y: 1.36, z: -0.04 },
        leftWrist: { x: -0.12, y: 1.68, z: -0.16 },
        rightWrist: { x: 0.12, y: 1.68, z: -0.16 },
        leftKnee: { x: -0.08, y: 0.5, z: 0 },
        rightKnee: { x: 0.08, y: 0.5, z: 0 },
        leftAnkle: { x: -0.1, y: 0, z: 0 },
        rightAnkle: { x: 0.1, y: 0, z: 0 }
      }
    }
  ]
};
const bentHandPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        bentHandCalls.push(animData);
      }
    }
  }
});
bentHandPreview.previewClip(bentHandNearHeadClip);
assert.ok(
  Math.abs(bentHandCalls[0].bones.leftUpperArm[1].rot[2]) < 0.06,
  'bent left hand near head should neutralize the Alicia down-pose side rotation'
);
assert.ok(
  Math.abs(bentHandCalls[0].bones.rightUpperArm[1].rot[2]) < 0.06,
  'bent right hand near head should neutralize the Alicia down-pose side rotation'
);

const torsoLeanCalls = [];
const torsoLeanClip = {
  ...raisedArmClip,
  id: 'torso_lean_trace',
  previewFrames: [
    {
      timeMs: 0,
      landmarks: {
        hips: { x: 0, y: 1, z: 0 },
        chest: { x: 0, y: 1.45, z: 0 },
        leftShoulder: { x: -0.2, y: 1.55, z: 0 },
        rightShoulder: { x: 0.2, y: 1.55, z: 0 },
        leftElbow: { x: -0.28, y: 1.28, z: 0 },
        rightElbow: { x: 0.28, y: 1.28, z: 0 },
        leftWrist: { x: -0.34, y: 1.08, z: 0 },
        rightWrist: { x: 0.34, y: 1.08, z: 0 },
        leftKnee: { x: -0.08, y: 0.5, z: 0 },
        rightKnee: { x: 0.08, y: 0.5, z: 0 },
        leftAnkle: { x: -0.1, y: 0, z: 0 },
        rightAnkle: { x: 0.1, y: 0, z: 0 }
      }
    },
    {
      timeMs: 400,
      landmarks: {
        hips: { x: 0.24, y: 1, z: 0 },
        chest: { x: -0.18, y: 1.32, z: -0.03 },
        leftShoulder: { x: -0.36, y: 1.42, z: -0.03 },
        rightShoulder: { x: 0.02, y: 1.42, z: -0.03 },
        leftElbow: { x: -0.54, y: 1.22, z: -0.04 },
        rightElbow: { x: 0.1, y: 1.18, z: -0.04 },
        leftWrist: { x: -0.62, y: 1.02, z: -0.04 },
        rightWrist: { x: 0.18, y: 0.98, z: -0.04 },
        leftKnee: { x: 0.02, y: 0.5, z: 0 },
        rightKnee: { x: 0.34, y: 0.5, z: 0 },
        leftAnkle: { x: -0.02, y: 0, z: 0 },
        rightAnkle: { x: 0.42, y: 0, z: 0 }
      }
    }
  ]
};
const torsoLeanPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      playCustom(animData) {
        torsoLeanCalls.push(animData);
      }
    }
  }
});
torsoLeanPreview.previewClip(torsoLeanClip);
assert.equal(torsoLeanCalls[0].bones.hips.length, 2);
assert.notDeepEqual(torsoLeanCalls[0].bones.hips[0].rot, torsoLeanCalls[0].bones.hips[1].rot);
assert.ok(
  Math.abs(torsoLeanCalls[0].bones.hips[1].rot[2]) > 0.05,
  'diagonal skeleton torso should drive Alicia hips roll instead of keeping the body upright'
);

const badPreview = preview.previewClip({ kind: 'pose_preset' });
assert.equal(badPreview.ok, false);
assert.equal(badPreview.reason, 'unsupported_clip');

const missingMascotPreview = new AliciaMotionPreviewAdapter().previewClip(clip);
assert.equal(missingMascotPreview.ok, false);
assert.equal(missingMascotPreview.reason, 'missing_mascot');

const fallbackCalls = [];
const optionalMethodsPreview = new AliciaMotionPreviewAdapter({
  mascot: {
    motion: {
      play(name) {
        fallbackCalls.push(name);
      }
    }
  }
}).previewClip(clip);
assert.equal(optionalMethodsPreview.ok, true);
assert.equal(optionalMethodsPreview.clipId, 'walk_cycle_001');
assert.equal(optionalMethodsPreview.adapter, 'procedural_fallback');
assert.deepEqual(fallbackCalls, ['walk_cycle']);

console.log('PASS test_motion_clip_exporter');
