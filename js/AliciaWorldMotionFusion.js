import { findNearestWorldMotionFrame, normalizeWorldMotion } from './AliciaWorldMotionAdapter.js';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothYaw(value, smoothing) {
  return finiteNumber(value) * clamp(finiteNumber(smoothing, 1), 0, 1);
}

function normalizeDegrees(value) {
  const degrees = finiteNumber(value);
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function aliciaFacingYawDegrees(frame, source, yawOffset = 0) {
  const rawYaw = finiteNumber(frame?.bodyYawDegrees) + yawOffset;
  const sourceOffset = source === 'gvhmr' ? 180 : 0;
  return normalizeDegrees(rawYaw + sourceOffset);
}

function roundMotionValue(value) {
  return Math.round(value * 1000000) / 1000000;
}

function quatFromYawDegrees(yawDegrees) {
  const half = finiteNumber(yawDegrees) * Math.PI / 360;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

function normalizeQuat(quat) {
  const length = Math.hypot(quat[0], quat[1], quat[2], quat[3]) || 1;
  return quat.map((value) => roundMotionValue(value / length));
}

function multiplyQuat(a, b) {
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ]);
}

function applyRootYawToBones(bones, yawDeltaDegrees) {
  if (!bones?.hips?.length || Math.abs(yawDeltaDegrees) <= 0.001) {
    return bones;
  }
  const yawQuat = quatFromYawDegrees(yawDeltaDegrees);
  return {
    ...bones,
    hips: bones.hips.map((key) => ({
      ...key,
      rot: Array.isArray(key.rot) && key.rot.length === 4
        ? multiplyQuat(yawQuat, key.rot)
        : key.rot
    }))
  };
}

function scaledRootPosition(rootTranslation, rootScale) {
  const scale = finiteNumber(rootScale, 0.08);
  return [
    roundMotionValue(finiteNumber(rootTranslation?.x) * scale),
    roundMotionValue(finiteNumber(rootTranslation?.y) * scale),
    roundMotionValue(finiteNumber(rootTranslation?.z) * scale)
  ];
}

export function fuseAliciaWorldMotion(poseAnimation, worldMotionPayload, options = {}) {
  const worldMotion = normalizeWorldMotion(worldMotionPayload);
  if (!poseAnimation || !worldMotion.ok) {
    return poseAnimation;
  }

  const frame = findNearestWorldMotionFrame(worldMotion.frames, finiteNumber(options.timeSeconds));
  const minConfidence = finiteNumber(options.minConfidence, 0.35);
  if (!frame || frame.confidence < minConfidence) {
    return poseAnimation;
  }

  const scale = finiteNumber(options.calibScale, 1.0);
  const offsetX = finiteNumber(options.calibOffsetX, 0.0);
  const offsetY = finiteNumber(options.calibOffsetY, 0.0);
  const offsetZ = finiteNumber(options.calibOffsetZ, 0.0);
  const yawOffset = finiteNumber(options.calibYawDegrees, 0.0);

  const worldTranslation = { ...frame.rootTranslation };
  worldTranslation.x = worldTranslation.x * scale + offsetX;
  worldTranslation.y = worldTranslation.y * scale + offsetY;
  worldTranslation.z = worldTranslation.z * scale + offsetZ;

  if (options.grounded !== false) {
    const currentHipsY = frame.landmarks?.hips?.y;
    if (currentHipsY !== undefined && Number.isFinite(currentHipsY)) {
      worldTranslation.y = (currentHipsY * scale) + offsetY - 1.0 * scale;
    } else {
      const validY = worldMotion.frames
        .map(f => f.rootTranslation?.y)
        .filter(y => y !== undefined && Number.isFinite(y));
      if (validY.length > 0) {
        const minY = Math.min(...validY);
        worldTranslation.y = worldTranslation.y - minY * scale;
      }
    }
  }

  const worldYawDegrees = finiteNumber(frame.bodyYawDegrees) + yawOffset;
  const bodyYawDegrees = smoothYaw(aliciaFacingYawDegrees(frame, worldMotion.source, yawOffset), options.yawSmoothing ?? 1);
  const previousYawDegrees = finiteNumber(poseAnimation?.body_orientation?.appliedYawDegrees);
  const yawDeltaDegrees = bodyYawDegrees - previousYawDegrees;
  return {
    ...poseAnimation,
    body_orientation: {
      ...(poseAnimation.body_orientation || {}),
      appliedYawDegrees: bodyYawDegrees,
      worldYawDegrees
    },
    bones: applyRootYawToBones(poseAnimation.bones, yawDeltaDegrees),
    hips_position: [{
      time_ms: 0,
      pos: scaledRootPosition(worldTranslation, options.rootScale)
    }],
    world_motion: {
      applied: true,
      source: worldMotion.source,
      frameTimeSeconds: frame.t,
      bodyYawDegrees,
      worldYawDegrees,
      rootTranslation: frame.rootTranslation,
      footContact: frame.footContact,
      confidence: frame.confidence
    }
  };
}
