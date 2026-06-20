const VALID_SOURCES = new Set(['gvhmr', 'wham', 'fixture', 'unknown']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSource(source) {
  return VALID_SOURCES.has(source) ? source : 'unknown';
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
}

function normalizeFootContact(contact = {}) {
  return {
    left: contact?.left === true || Number(contact?.left) >= 0.5,
    right: contact?.right === true || Number(contact?.right) >= 0.5
  };
}

function normalizeRootTranslation(rootTranslation = {}) {
  return {
    x: finiteNumber(rootTranslation?.x),
    y: finiteNumber(rootTranslation?.y),
    z: finiteNumber(rootTranslation?.z)
  };
}

function normalizePoint(point = {}) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function normalizeLandmarks(landmarks = {}) {
  if (!landmarks || typeof landmarks !== 'object' || Array.isArray(landmarks)) {
    return null;
  }
  const entries = Object.entries(landmarks)
    .map(([name, point]) => [name, normalizePoint(point)])
    .filter(([, point]) => point);
  return entries.length ? Object.fromEntries(entries) : null;
}

function normalizeFrame(frame) {
  const t = finiteNumber(frame?.t, NaN);
  if (!Number.isFinite(t)) {
    return null;
  }
  const normalized = {
    t,
    bodyYawDegrees: clamp(finiteNumber(frame?.bodyYawDegrees), -180, 180),
    rootTranslation: normalizeRootTranslation(frame?.rootTranslation),
    footContact: normalizeFootContact(frame?.footContact),
    confidence: clamp(finiteNumber(frame?.confidence), 0, 1)
  };
  const landmarks = normalizeLandmarks(frame?.landmarks);
  if (landmarks) {
    normalized.landmarks = landmarks;
  }
  return normalized;
}

export function normalizeWorldMotion(payload = {}) {
  const source = normalizeSource(payload?.source);
  const metadata = normalizeMetadata(payload?.metadata);
  if (payload?.ok === false) {
    return {
      ok: false,
      source,
      reason: String(payload.reason || 'provider_failed'),
      frames: [],
      metadata
    };
  }

  const frames = Array.isArray(payload?.frames)
    ? payload.frames.map(normalizeFrame).filter(Boolean).sort((a, b) => a.t - b.t)
    : [];
  if (!frames.length) {
    return {
      ok: false,
      source,
      reason: 'missing_valid_frames',
      frames: [],
      metadata
    };
  }

  return {
    ok: true,
    source,
    frames,
    metadata
  };
}

export function findNearestWorldMotionFrame(frames, timeSeconds) {
  const source = Array.isArray(frames) ? frames : [];
  if (!source.length) {
    return null;
  }
  const target = finiteNumber(timeSeconds, source[0].t);
  return source.reduce((nearest, frame) => (
    Math.abs(frame.t - target) < Math.abs(nearest.t - target) ? frame : nearest
  ), source[0]);
}
