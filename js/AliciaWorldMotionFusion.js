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

function roundMotionValue(value) {
  return Math.round(value * 1000000) / 1000000;
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

  const bodyYawDegrees = smoothYaw(frame.bodyYawDegrees, options.yawSmoothing ?? 1);
  return {
    ...poseAnimation,
    hips_position: [{
      time_ms: 0,
      pos: scaledRootPosition(frame.rootTranslation, options.rootScale)
    }],
    world_motion: {
      applied: true,
      source: worldMotion.source,
      frameTimeSeconds: frame.t,
      bodyYawDegrees,
      rootTranslation: frame.rootTranslation,
      footContact: frame.footContact,
      confidence: frame.confidence
    }
  };
}
