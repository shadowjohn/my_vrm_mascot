import {
  CYCLE_PHASES,
  MOTION_CLIP_SCHEMA_VERSION
} from './MotionCaptureTypes.js';

function cloneLandmarks(landmarks) {
  return Object.fromEntries(
    Object.entries(landmarks || {}).map(([name, landmark]) => [name, { ...landmark }])
  );
}

function normalizeRetargetHints(retargetHints) {
  const hints =
    retargetHints && typeof retargetHints === 'object' && !Array.isArray(retargetHints)
      ? retargetHints
      : {};

  return {
    strideScale: finiteNumber(hints.strideScale, 1),
    armSwingScale: finiteNumber(hints.armSwingScale, 1),
    hipBobScale: finiteNumber(hints.hipBobScale, 1),
    smoothing: finiteNumber(hints.smoothing, 0.35)
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function isUsableFrame(frame) {
  return Boolean(
    frame &&
      typeof frame === 'object' &&
      !Array.isArray(frame) &&
      Number.isFinite(frame.frameIndex) &&
      frame.landmarks &&
      typeof frame.landmarks === 'object' &&
      !Array.isArray(frame.landmarks)
  );
}

function usableFrames(sequence) {
  return Array.isArray(sequence?.frames) ? sequence.frames.filter(isUsableFrame) : [];
}

function getLoop(detector) {
  return typeof detector?.getLoop === 'function'
    ? detector.getLoop()
    : { startMs: 0, endMs: 0, durationMs: 0 };
}

function getPhaseMarkers(detector) {
  return typeof detector?.getPhaseMarkers === 'function' ? detector.getPhaseMarkers() : {};
}

export function exportMotionClip({
  id,
  label,
  sequence,
  detector,
  source,
  retargetHints = {}
}) {
  const loop = getLoop(detector);
  const markers = getPhaseMarkers(detector);
  const framesByIndex = new Map(
    usableFrames(sequence).map((frame) => [frame.frameIndex, frame])
  );
  const phases = {};
  const keyPoses = [];

  for (const phase of CYCLE_PHASES) {
    const marker = markers[phase];
    if (!marker) {
      continue;
    }

    phases[phase] = { ...marker };

    if (!Number.isFinite(marker.frameIndex)) {
      continue;
    }

    const frame = framesByIndex.get(marker.frameIndex);
    if (!frame) {
      continue;
    }

    keyPoses.push({
      phase,
      timeMs: marker.timeMs,
      frameIndex: marker.frameIndex,
      landmarks: cloneLandmarks(frame.landmarks)
    });
  }

  return {
    schemaVersion: MOTION_CLIP_SCHEMA_VERSION,
    kind: 'motion_clip_v1',
    id,
    label,
    source,
    loop,
    phases,
    keyPoses,
    retargetHints: normalizeRetargetHints(retargetHints)
  };
}
