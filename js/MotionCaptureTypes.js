export const MOTION_CLIP_SCHEMA_VERSION = 1;

export const CAPTURE_SOURCE_TYPES = Object.freeze([
  'video',
  'webcam',
  'skeleton_json',
  'vrma'
]);

export const CYCLE_PHASES = Object.freeze([
  'contact_left',
  'down_left',
  'passing_left',
  'up_left',
  'contact_right',
  'down_right',
  'passing_right',
  'up_right'
]);

export const REQUIRED_CANONICAL_LANDMARKS = Object.freeze([
  'hips',
  'chest',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftWrist',
  'rightWrist',
  'leftAnkle',
  'rightAnkle'
]);

export function isValidCyclePhase(phase) {
  return CYCLE_PHASES.includes(phase);
}

export function createEmptyCycleMarkers() {
  return CYCLE_PHASES.reduce((markers, phase) => {
    markers[phase] = null;
    return markers;
  }, {});
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeLandmark(landmark) {
  return {
    x: toNumber(landmark?.x),
    y: toNumber(landmark?.y),
    z: toNumber(landmark?.z),
    visibility: toNumber(landmark?.visibility, 1)
  };
}

export function normalizeCaptureFrame(frame, frameIndex = 0) {
  const landmarks = {};
  for (const [name, landmark] of Object.entries(frame?.landmarks || {})) {
    landmarks[name] = normalizeLandmark(landmark);
  }
  return {
    frameIndex,
    timeMs: toNumber(frame?.timeMs),
    landmarks
  };
}

export function validateSkeletonSequence(sequence) {
  if (!sequence || typeof sequence !== 'object') {
    return { ok: false, reason: 'invalid_sequence' };
  }
  if (!CAPTURE_SOURCE_TYPES.includes(sequence.sourceType)) {
    return { ok: false, reason: 'unknown_source_type', sourceType: sequence.sourceType };
  }
  if (!Array.isArray(sequence.frames) || sequence.frames.length === 0) {
    return { ok: false, reason: 'empty_frames' };
  }
  for (const [frameIndex, frame] of sequence.frames.entries()) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      return { ok: false, reason: 'invalid_frame', frameIndex };
    }
    if (!frame.landmarks || typeof frame.landmarks !== 'object' || Array.isArray(frame.landmarks)) {
      return { ok: false, reason: 'missing_landmarks', frameIndex };
    }
    for (const landmark of REQUIRED_CANONICAL_LANDMARKS) {
      if (!frame.landmarks[landmark]) {
        return { ok: false, reason: 'missing_landmark', frameIndex, landmark };
      }
    }
  }
  return { ok: true };
}
