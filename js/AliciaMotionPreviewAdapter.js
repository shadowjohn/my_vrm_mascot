import { buildAliciaWalkAnimation } from './AliciaWalkGenerator.js';
import { estimateBodyYaw } from './AliciaBodyOrientationEstimator.js';
import { normalizeSkeletonToAlicia } from './AliciaSkeletonRetargeter.js';

const DEG = Math.PI / 180;

const DEFAULT_BASE_ROTATIONS = Object.freeze({
  hips: { x: 0, y: 0, z: 0 },
  spine: { x: 2, y: 0, z: -2 },
  chest: { x: -1, y: -2, z: -1 },
  leftShoulder: { x: 0, y: 0, z: 2 },
  rightShoulder: { x: 0, y: 0, z: -2 },
  leftUpperArm: { x: 7, y: 0, z: 42 },
  rightUpperArm: { x: 7, y: 0, z: -42 },
  leftLowerArm: { x: 0, y: -9, z: 0 },
  rightLowerArm: { x: 0, y: 9, z: 0 },
  leftUpperLeg: { x: 1, y: 0, z: 2 },
  rightUpperLeg: { x: -1, y: 0, z: -2 },
  leftLowerLeg: { x: 0, y: 0, z: 0 },
  rightLowerLeg: { x: 0, y: 0, z: 0 }
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addDegrees(base = {}, offset = {}) {
  return {
    x: finiteNumber(base.x) + finiteNumber(offset.x),
    y: finiteNumber(base.y) + finiteNumber(offset.y),
    z: finiteNumber(base.z) + finiteNumber(offset.z)
  };
}

function quatFromDegrees(degrees = {}) {
  const x = finiteNumber(degrees.x) * DEG * 0.5;
  const y = finiteNumber(degrees.y) * DEG * 0.5;
  const z = finiteNumber(degrees.z) * DEG * 0.5;
  const c1 = Math.cos(x);
  const c2 = Math.cos(y);
  const c3 = Math.cos(z);
  const s1 = Math.sin(x);
  const s2 = Math.sin(y);
  const s3 = Math.sin(z);

  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function getBaseRotations(mascot) {
  return {
    ...DEFAULT_BASE_ROTATIONS,
    ...(mascot?.motion?.getPosePreset?.()?.basePose?.rotation || {})
  };
}

function sortedFrameList(source) {
  return Array.isArray(source)
    ? source
      .filter((keyPose) => keyPose?.landmarks && Number.isFinite(Number(keyPose.timeMs)))
      .slice()
      .sort((a, b) => Number(a.timeMs) - Number(b.timeMs))
    : [];
}

function sortedPreviewFrames(clip) {
  const source = Array.isArray(clip?.previewFrames) && clip.previewFrames.length >= 2
    ? clip.previewFrames
    : clip?.keyPoses;
  return sortedFrameList(source);
}

function nearestFrameAtMs(frames, timeMs) {
  if (!frames.length) {
    return null;
  }
  const target = finiteNumber(timeMs, frames[0].timeMs);
  let nearest = frames[0];
  let nearestDelta = Math.abs(finiteNumber(nearest.timeMs) - target);
  for (const frame of frames.slice(1)) {
    const delta = Math.abs(finiteNumber(frame.timeMs) - target);
    if (delta < nearestDelta) {
      nearest = frame;
      nearestDelta = delta;
    }
  }
  return nearest;
}

function hasJointChainLandmarks(previewFrames) {
  return previewFrames.some((frame) => {
    const landmarks = frame?.landmarks;
    return (
      hasPoint(landmarks, 'leftElbow') ||
      hasPoint(landmarks, 'rightElbow') ||
      hasPoint(landmarks, 'leftKnee') ||
      hasPoint(landmarks, 'rightKnee')
    );
  });
}

function getPoint(landmarks, name) {
  const point = landmarks?.[name];
  if (!point) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: finiteNumber(point.x),
    y: finiteNumber(point.y),
    z: finiteNumber(point.z)
  };
}

function hasPoint(landmarks, name) {
  const point = landmarks?.[name];
  return Boolean(
    point &&
      Number.isFinite(Number(point.x)) &&
      Number.isFinite(Number(point.y)) &&
      Number.isFinite(Number(point.z))
  );
}

function getOptionalPoint(landmarks, name) {
  return hasPoint(landmarks, name) ? getPoint(landmarks, name) : null;
}

function vector(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z
  };
}

function vectorLength(item) {
  return Math.hypot(item.x, item.y, item.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function angleBetweenDegrees(a, b) {
  const denom = vectorLength(a) * vectorLength(b);
  if (denom <= 0.000001) {
    return 180;
  }
  const cosine = clamp(dot(a, b) / denom, -1, 1);
  return Math.acos(cosine) / DEG;
}

function jointFlexionDegrees(parent, joint, child) {
  const toParent = vector(joint, parent);
  const toChild = vector(joint, child);
  return clamp(180 - angleBetweenDegrees(toParent, toChild), 0, 145);
}

function armOffsets(landmarks, side, scale) {
  const sign = side === 'left' ? 1 : -1;
  const bendSign = side === 'left' ? -1 : 1;
  const shoulder = getPoint(landmarks, `${side}Shoulder`);
  const elbow = getOptionalPoint(landmarks, `${side}Elbow`);
  const wrist = getPoint(landmarks, `${side}Wrist`);
  const torso = getOptionalPoint(landmarks, 'chest') || getPoint(landmarks, 'hips');
  const fullArm = vector(shoulder, wrist);
  const upperArm = elbow ? vector(shoulder, elbow) : fullArm;
  const lowerArm = elbow ? vector(elbow, wrist) : fullArm;
  const verticalRaise = Math.max(0, fullArm.y);
  const upperRaise = Math.max(0, upperArm.y);
  const forearmRaise = Math.max(0, lowerArm.y);
  const handDrop = Math.max(0, -fullArm.y);
  const handForwardReach = Math.max(0, -fullArm.z);
  const forearmForwardReach = Math.max(0, -lowerArm.z);
  const shoulderSide = Math.sign(shoulder.x - torso.x) || (side === 'left' ? -1 : 1);
  const crossBodyReach = Math.max(0, (shoulder.x - wrist.x) * shoulderSide);
  const frontCarryGate = clamp((0.16 - verticalRaise) / 0.16, 0, 1);
  const lateralLift = clamp(Math.abs(upperArm.x) * 120 * scale, 0, 44);
  const elevationLift = clamp((upperRaise * 190 + verticalRaise * 160 + forearmRaise * 90) * scale, 0, 112);
  const frontCarryLift = clamp((handForwardReach * 95 + forearmForwardReach * 58 + crossBodyReach * 54) * scale * frontCarryGate, 0, 52);
  const downSettle = clamp(Math.max(0, handDrop - 0.26) * 32 * scale, 0, 18);
  const zLift = clamp(lateralLift + elevationLift + frontCarryLift - downSettle, 0, 118);
  const forward = clamp(((-upperArm.z * 0.52) + (handForwardReach * 0.32) + (forearmForwardReach * 0.16)) * 150 * scale, -50, 50);
  const lift = clamp((upperArm.y * 170 + verticalRaise * 65) * scale, -65, 90);
  const elbowFlex = elbow
    ? jointFlexionDegrees(shoulder, elbow, wrist)
    : clamp((shoulder.y - wrist.y) * 80 * scale, 0, 70);
  const sideReachContinues = Math.sign(upperArm.x) === Math.sign(lowerArm.x);
  const sideReachAmount = sideReachContinues
    ? clamp((Math.abs(upperArm.x) + Math.abs(lowerArm.x) - 0.22) / 0.22, 0, 1)
    : 0;
  const lowSideReachStraighten = clamp((handDrop - 0.12) / 0.2, 0, 1) * sideReachAmount;
  const effectiveElbowFlex = elbowFlex * (1 - lowSideReachStraighten * 0.72);
  const lowerForward = clamp(-lowerArm.z * 95 * scale, -34, 34);
  const forearmSide = side === 'left' ? lowerArm.x : -lowerArm.x;
  const forearmSideSign = forearmSide < -0.001 ? -1 : 1;
  const forearmSideRoll = clamp((forearmSide * 58 + forearmSideSign * Math.abs(lowerArm.z) * 36) * scale, -28, 28);

  return {
    shoulder: {
      x: clamp((upperRaise * 28 + verticalRaise * 10 + forearmRaise * 5) * scale, 0, 16),
      y: clamp(-forward * 0.16, -8, 8),
      z: -sign * clamp(zLift * 0.16, 0, 16)
    },
    upper: {
      x: clamp(lift + forward * 0.55, -70, 96),
      y: sign * clamp(forward * 0.75, -45, 45),
      z: -sign * zLift
    },
    lower: {
      x: clamp(lift * 0.18 + lowerForward * 0.35, -30, 30),
      y: bendSign * clamp(effectiveElbowFlex * 0.72, 0, 95),
      z: sign * forearmSideRoll
    }
  };
}

function legOffsets(landmarks, side, scale) {
  const hips = getPoint(landmarks, 'hips');
  const knee = getOptionalPoint(landmarks, `${side}Knee`);
  const ankle = getPoint(landmarks, `${side}Ankle`);
  const fullLeg = vector(hips, ankle);
  const upperLeg = knee ? vector(hips, knee) : fullLeg;
  const lowerLeg = knee ? vector(knee, ankle) : fullLeg;
  const forwardReach = upperLeg.z * 0.65 + fullLeg.z * 0.35;
  const kneeAndAnkleAgree = knee && Math.sign(upperLeg.x) === Math.sign(fullLeg.x);
  const lateralReach = knee
    ? upperLeg.x * (kneeAndAnkleAgree ? 0.72 : 0.9) + fullLeg.x * (kneeAndAnkleAgree ? 0.28 : 0.1)
    : fullLeg.x;
  const swing = clamp(-forwardReach * 170 * scale, -46, 46);
  const sideReach = clamp(lateralReach * 86.4 * scale, -34.2, 34.2);
  const lowerSideReach = clamp((knee ? lowerLeg.x : fullLeg.x) * 86.4 * scale, -34.2, 34.2);
  const kneeFlex = knee
    ? jointFlexionDegrees(hips, knee, ankle)
    : clamp((1.05 - Math.abs(fullLeg.y)) * 42 * scale, 0, 34);
  const lowerSwing = clamp(-lowerLeg.z * 45 * scale, -18, 18);

  return {
    upper: {
      x: clamp(swing, -42, 42),
      y: 0,
      z: -sideReach
    },
    lower: {
      x: clamp(kneeFlex * 0.62 + lowerSwing, -10, 58),
      y: 0,
      z: clamp(-lowerSideReach * 0.32, -18, 18)
    }
  };
}

function torsoOffsets(landmarks, scale) {
  const hips = getPoint(landmarks, 'hips');
  const chest = getPoint(landmarks, 'chest');
  const torsoDx = chest.x - hips.x;
  const torsoDy = Math.max(0.16, Math.abs(chest.y - hips.y));
  const torsoRoll = clamp((Math.atan2(torsoDx, torsoDy) / DEG) * scale, -32, 32);
  const twist = clamp((chest.z - hips.z) * 36 * scale, -8, 8);
  return {
    hips: { x: 0, y: twist * 0.25, z: -torsoRoll * 0.45 },
    spine: { x: 0, y: twist * 0.6, z: -torsoRoll * 0.65 },
    chest: { x: 0, y: twist, z: -torsoRoll * 0.35 }
  };
}

function pushBoneKey(bones, boneName, timeMs, baseRotations, offset) {
  if (!bones[boneName]) {
    bones[boneName] = [];
  }
  bones[boneName].push({
    time_ms: timeMs,
    rot: quatFromDegrees(addDegrees(baseRotations[boneName], offset))
  });
}

function retargetHints(clip) {
  const hints = clip?.retargetHints || {};
  return {
    strideScale: finiteNumber(hints.strideScale, 1),
    armSwingScale: finiteNumber(hints.armSwingScale, 1),
    hipBobScale: finiteNumber(hints.hipBobScale, 1),
    mirrorX: hints.mirrorX === true
  };
}

function transformRetargetLandmarks(landmarks, hints) {
  if (!hints.mirrorX) {
    return landmarks;
  }
  return Object.fromEntries(
    Object.entries(landmarks || {}).map(([name, point]) => [name, {
      ...point,
      x: -finiteNumber(point?.x)
    }])
  );
}

function buildPreviewAnimation(clip, mascot) {
  const previewFrames = sortedPreviewFrames(clip);
  if (previewFrames.length < 2) {
    return null;
  }

  const loopStartMs = finiteNumber(clip?.loop?.startMs, previewFrames[0].timeMs);
  const previewSpeed = clamp(finiteNumber(clip?.previewSpeed, 1), 0.25, 2.5);
  const sourceLoopDurationMs = Math.max(
    300,
    finiteNumber(clip?.loop?.durationMs, previewFrames[previewFrames.length - 1].timeMs - loopStartMs)
  );
  const loopDurationMs = Math.max(300, Math.round(sourceLoopDurationMs / previewSpeed));
  const baseRotations = getBaseRotations(mascot);
  const hints = retargetHints(clip);
  const transformedFrames = previewFrames.map((previewFrame) => ({
    ...previewFrame,
    landmarks: transformRetargetLandmarks(previewFrame.landmarks, hints)
  }));
  const bodyOrientation = estimateBodyYaw(transformedFrames);
  const bodyYawDegrees = bodyOrientation.confidence >= 0.45 ? bodyOrientation.yawDegrees : 0;
  const firstSourceHips = getPoint(transformedFrames[0].landmarks, 'hips');
  const bones = {};
  const hipsPosition = [];

  for (const previewFrame of transformedFrames) {
    const sourceLandmarks = previewFrame.landmarks;
    const landmarks = normalizeSkeletonToAlicia(sourceLandmarks, undefined, { yawDegrees: bodyYawDegrees }).landmarks;
    const timeMs = clamp(Math.round((finiteNumber(previewFrame.timeMs) - loopStartMs) / previewSpeed), 0, loopDurationMs);
    const hips = getPoint(sourceLandmarks, 'hips');
    const leftArm = armOffsets(landmarks, 'left', hints.armSwingScale);
    const rightArm = armOffsets(landmarks, 'right', hints.armSwingScale);
    const leftLeg = legOffsets(landmarks, 'left', hints.strideScale);
    const rightLeg = legOffsets(landmarks, 'right', hints.strideScale);
    const torso = torsoOffsets(landmarks, hints.strideScale);
    torso.hips.y += bodyYawDegrees;

    hipsPosition.push({
      time_ms: timeMs,
      pos: [
        clamp(hips.x * 0.018, -0.018, 0.018),
        clamp((hips.y - firstSourceHips.y) * 0.03 * hints.hipBobScale, -0.018, 0.024),
        clamp(hips.z * 0.018, -0.018, 0.018)
      ]
    });
    pushBoneKey(bones, 'hips', timeMs, baseRotations, torso.hips);
    pushBoneKey(bones, 'spine', timeMs, baseRotations, torso.spine);
    pushBoneKey(bones, 'chest', timeMs, baseRotations, torso.chest);
    pushBoneKey(bones, 'leftShoulder', timeMs, baseRotations, leftArm.shoulder);
    pushBoneKey(bones, 'leftUpperArm', timeMs, baseRotations, leftArm.upper);
    pushBoneKey(bones, 'leftLowerArm', timeMs, baseRotations, leftArm.lower);
    pushBoneKey(bones, 'rightShoulder', timeMs, baseRotations, rightArm.shoulder);
    pushBoneKey(bones, 'rightUpperArm', timeMs, baseRotations, rightArm.upper);
    pushBoneKey(bones, 'rightLowerArm', timeMs, baseRotations, rightArm.lower);
    pushBoneKey(bones, 'leftUpperLeg', timeMs, baseRotations, leftLeg.upper);
    pushBoneKey(bones, 'leftLowerLeg', timeMs, baseRotations, leftLeg.lower);
    pushBoneKey(bones, 'rightUpperLeg', timeMs, baseRotations, rightLeg.upper);
    pushBoneKey(bones, 'rightLowerLeg', timeMs, baseRotations, rightLeg.lower);
  }

  return {
    version: 1,
    name: clip.id || 'motion_clip_preview',
    duration_ms: loopDurationMs,
    fps: 12,
    retarget_mode: hasJointChainLandmarks(previewFrames) ? 'joint_chain_preview' : 'endpoint_preview',
    source_kind: clip.kind || 'motion_clip_v1',
    body_orientation: {
      ...bodyOrientation,
      appliedYawDegrees: bodyYawDegrees
    },
    bones,
    hips_position: hipsPosition,
    sample_count: previewFrames.length
  };
}

function buildPoseAnimation(frame, frames, clip, mascot) {
  const sourceFrames = sortedFrameList(frames);
  const baseRotations = getBaseRotations(mascot);
  const hints = retargetHints(clip);
  const transformedFrames = (sourceFrames.length ? sourceFrames : [frame]).map((previewFrame) => ({
    ...previewFrame,
    landmarks: transformRetargetLandmarks(previewFrame.landmarks, hints)
  }));
  const transformedFrame = {
    ...frame,
    landmarks: transformRetargetLandmarks(frame.landmarks, hints)
  };
  const bodyOrientation = estimateBodyYaw(transformedFrames);
  const bodyYawDegrees = bodyOrientation.confidence >= 0.45 ? bodyOrientation.yawDegrees : 0;
  const firstSourceHips = getPoint(transformedFrames[0]?.landmarks, 'hips');
  const sourceLandmarks = transformedFrame.landmarks;
  const landmarks = normalizeSkeletonToAlicia(sourceLandmarks, undefined, { yawDegrees: bodyYawDegrees }).landmarks;
  const hips = getPoint(sourceLandmarks, 'hips');
  const leftArm = armOffsets(landmarks, 'left', hints.armSwingScale);
  const rightArm = armOffsets(landmarks, 'right', hints.armSwingScale);
  const leftLeg = legOffsets(landmarks, 'left', hints.strideScale);
  const rightLeg = legOffsets(landmarks, 'right', hints.strideScale);
  const torso = torsoOffsets(landmarks, hints.strideScale);
  const bones = {};
  torso.hips.y += bodyYawDegrees;

  pushBoneKey(bones, 'hips', 0, baseRotations, torso.hips);
  pushBoneKey(bones, 'spine', 0, baseRotations, torso.spine);
  pushBoneKey(bones, 'chest', 0, baseRotations, torso.chest);
  pushBoneKey(bones, 'leftShoulder', 0, baseRotations, leftArm.shoulder);
  pushBoneKey(bones, 'leftUpperArm', 0, baseRotations, leftArm.upper);
  pushBoneKey(bones, 'leftLowerArm', 0, baseRotations, leftArm.lower);
  pushBoneKey(bones, 'rightShoulder', 0, baseRotations, rightArm.shoulder);
  pushBoneKey(bones, 'rightUpperArm', 0, baseRotations, rightArm.upper);
  pushBoneKey(bones, 'rightLowerArm', 0, baseRotations, rightArm.lower);
  pushBoneKey(bones, 'leftUpperLeg', 0, baseRotations, leftLeg.upper);
  pushBoneKey(bones, 'leftLowerLeg', 0, baseRotations, leftLeg.lower);
  pushBoneKey(bones, 'rightUpperLeg', 0, baseRotations, rightLeg.upper);
  pushBoneKey(bones, 'rightLowerLeg', 0, baseRotations, rightLeg.lower);

  return {
    version: 1,
    name: clip.id || 'pose_copier_frame',
    duration_ms: 1,
    fps: 1,
    retarget_mode: hasJointChainLandmarks([frame]) ? 'joint_chain_pose' : 'endpoint_pose',
    source_kind: clip.kind || 'pose_copier_v1',
    source_time_ms: finiteNumber(frame.timeMs),
    body_orientation: {
      ...bodyOrientation,
      appliedYawDegrees: bodyYawDegrees
    },
    bones,
    hips_position: [{
      time_ms: 0,
      pos: [
        clamp(hips.x * 0.018, -0.018, 0.018),
        clamp((hips.y - firstSourceHips.y) * 0.03 * hints.hipBobScale, -0.018, 0.024),
        clamp(hips.z * 0.018, -0.018, 0.018)
      ]
    }],
    sample_count: 1
  };
}

export class AliciaMotionPreviewAdapter {
  constructor({ mascot } = {}) {
    this.mascot = mascot;
  }

  previewClip(clip) {
    if (!clip || !['motion_clip_v1', 'walk_style_v1'].includes(clip.kind)) {
      return { ok: false, reason: 'unsupported_clip' };
    }

    if (!this.mascot) {
      return { ok: false, reason: 'missing_mascot' };
    }

    if (typeof this.mascot.enableHumanization === 'function') {
      this.mascot.enableHumanization({ profile: 'alicia', level: 2 });
    }

    if (clip.kind === 'walk_style_v1' && typeof this.mascot.motion?.playCustom === 'function') {
      const traceAnimation = buildPreviewAnimation(clip, this.mascot);
      if (traceAnimation) {
        this.mascot.motion.playCustom(traceAnimation, { loop: true });
        return {
          ok: true,
          clipId: clip.id,
          adapter: 'walk_style_skeleton_trace',
          sampleCount: traceAnimation.sample_count,
          retargetMode: traceAnimation.retarget_mode
        };
      }

      const animation = buildAliciaWalkAnimation(clip, this.mascot);
      if (animation) {
        this.mascot.motion.playCustom(animation, { loop: true });
        return {
          ok: true,
          clipId: clip.id,
          adapter: 'walk_style_generator',
          sampleCount: animation.sample_count,
          retargetMode: animation.retarget_mode
        };
      }
    }

    if (typeof this.mascot.motion?.playCustom === 'function') {
      const animation = buildPreviewAnimation(clip, this.mascot);
      if (animation) {
        this.mascot.motion.playCustom(animation, { loop: true });
        return {
          ok: true,
          clipId: clip.id,
          adapter: 'motion_clip_custom',
          sampleCount: animation.sample_count,
          retargetMode: animation.retarget_mode
        };
      }
    }

    if (typeof this.mascot.motion?.play === 'function') {
      this.mascot.motion.play('walk_cycle');
    }

    return { ok: true, clipId: clip.id, adapter: 'procedural_fallback' };
  }

  previewPoseAtTimeMs(timeMs, skeletonFrames, options = {}) {
    if (!this.mascot) {
      return { ok: false, reason: 'missing_mascot' };
    }
    if (typeof this.mascot.motion?.holdCustomPose !== 'function') {
      return { ok: false, reason: 'missing_pose_hold' };
    }

    const frames = sortedFrameList(Array.isArray(skeletonFrames) ? skeletonFrames : skeletonFrames?.frames);
    const requestedTimeMs = finiteNumber(timeMs, frames[0]?.timeMs || 0);
    const frame = nearestFrameAtMs(frames, requestedTimeMs);
    if (!frame) {
      return { ok: false, reason: 'missing_skeleton_frame' };
    }

    const clip = {
      kind: options.kind || 'pose_copier_v1',
      id: options.id || 'pose_copier_frame',
      retargetHints: options.retargetHints || {}
    };
    const animation = buildPoseAnimation(frame, frames, clip, this.mascot);
    this.mascot.motion.holdCustomPose(animation, { timeMs: 0 });
    return {
      ok: true,
      adapter: 'pose_copier_single_frame',
      frameTimeMs: finiteNumber(frame.timeMs),
      requestedTimeMs,
      frameIndex: frame.frameIndex ?? null,
      retargetMode: animation.retarget_mode,
      bodyOrientation: animation.body_orientation
    };
  }
}
