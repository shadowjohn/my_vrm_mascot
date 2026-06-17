const DEG = Math.PI / 180;

const DEFAULT_BASE_ROTATIONS = Object.freeze({
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

function pushBoneKey(bones, boneName, timeMs, baseRotations, offset) {
  if (!bones[boneName]) {
    bones[boneName] = [];
  }
  bones[boneName].push({
    time_ms: timeMs,
    rot: quatFromDegrees(addDegrees(baseRotations[boneName], offset))
  });
}

function parameters(style) {
  const params = style?.parameters || {};
  const previewSpeed = clamp(finiteNumber(style?.previewSpeed, 1), 0.25, 2.5);
  return {
    stride: clamp(finiteNumber(params.stride, 0.45), 0, 1),
    cadence: clamp(finiteNumber(params.cadence, 1.15) * previewSpeed, 0.35, 3.2),
    armSwing: clamp(finiteNumber(params.armSwing, 0.35), 0, 1),
    hipBob: clamp(finiteNumber(params.hipBob, 0.08), 0, 1),
    bounce: clamp(finiteNumber(params.bounce, 0.1), 0, 1),
    bodyLean: clamp(finiteNumber(params.bodyLean, 0), -1, 1)
  };
}

export function buildAliciaWalkAnimation(style, mascot) {
  if (!style || style.kind !== 'walk_style_v1') {
    return null;
  }

  const baseRotations = getBaseRotations(mascot);
  const params = parameters(style);
  const durationMs = Math.round(clamp(2000 / params.cadence, 620, 2600));
  const bones = {};
  const hipsPosition = [];
  const sampleCount = 9;
  const strideDegrees = 8 + params.stride * 24;
  const armDegrees = 6 + params.armSwing * 44;
  const hipBob = 0.004 + params.hipBob * 0.028 + params.bounce * 0.012;
  const sideShift = 0.003 + params.stride * 0.011;
  const leanDegrees = params.bodyLean * 8;

  for (let index = 0; index < sampleCount; index += 1) {
    const ratio = index / (sampleCount - 1);
    const timeMs = Math.round(durationMs * ratio);
    const phase = ratio * Math.PI * 2;
    const left = Math.sin(phase);
    const right = -left;
    const leftLift = Math.max(0, left);
    const rightLift = Math.max(0, right);
    const leftPlant = Math.max(0, -left);
    const rightPlant = Math.max(0, -right);
    const bob = Math.max(leftLift, rightLift);
    const sway = Math.sin(phase + Math.PI * 0.5);

    hipsPosition.push({
      time_ms: timeMs,
      pos: [
        clamp(sway * sideShift + leanDegrees * 0.0008, -0.028, 0.028),
        clamp(bob * hipBob, 0, 0.05),
        0
      ]
    });

    pushBoneKey(bones, 'spine', timeMs, baseRotations, {
      x: -params.bounce * 2.4,
      y: sway * (1.5 + params.stride * 1.2),
      z: -leanDegrees
    });
    pushBoneKey(bones, 'chest', timeMs, baseRotations, {
      x: params.bounce * 1.8,
      y: -sway * (1.8 + params.armSwing * 1.4),
      z: leanDegrees * 0.75
    });
    pushBoneKey(bones, 'leftUpperArm', timeMs, baseRotations, {
      x: right * armDegrees,
      y: right * params.armSwing * 8,
      z: leftLift * 6
    });
    pushBoneKey(bones, 'rightUpperArm', timeMs, baseRotations, {
      x: left * armDegrees,
      y: -left * params.armSwing * 8,
      z: -rightLift * 6
    });
    pushBoneKey(bones, 'leftLowerArm', timeMs, baseRotations, {
      x: Math.max(0, right) * params.armSwing * 7,
      y: -Math.max(0, right) * (12 + params.armSwing * 30),
      z: 0
    });
    pushBoneKey(bones, 'rightLowerArm', timeMs, baseRotations, {
      x: Math.max(0, left) * params.armSwing * 7,
      y: Math.max(0, left) * (12 + params.armSwing * 30),
      z: 0
    });
    pushBoneKey(bones, 'leftUpperLeg', timeMs, baseRotations, {
      x: left * strideDegrees,
      y: 0,
      z: 1.5 + leftLift * 2.6
    });
    pushBoneKey(bones, 'rightUpperLeg', timeMs, baseRotations, {
      x: right * strideDegrees,
      y: 0,
      z: -1.5 - rightLift * 2.6
    });
    pushBoneKey(bones, 'leftLowerLeg', timeMs, baseRotations, {
      x: leftLift * (16 + params.stride * 24) - leftPlant * 7,
      y: 0,
      z: 0
    });
    pushBoneKey(bones, 'rightLowerLeg', timeMs, baseRotations, {
      x: rightLift * (16 + params.stride * 24) - rightPlant * 7,
      y: 0,
      z: 0
    });
  }

  return {
    version: 1,
    name: style.id || 'walk_style_preview',
    duration_ms: durationMs,
    fps: 12,
    retarget_mode: 'walk_style_generator',
    source_kind: 'walk_style_v1',
    bones,
    hips_position: hipsPosition,
    sample_count: sampleCount
  };
}
