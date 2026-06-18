const VALID_SOURCES = new Set([
  'gvhmr',
  'mediapipe_face',
  'skeleton_2d',
  'skeleton_3d',
  'motionbert',
  'fixture',
  'unknown'
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSource(value) {
  return VALID_SOURCES.has(value) ? value : 'unknown';
}

function normalizeConfidence(confidence = {}) {
  return {
    body: clamp(finiteNumber(confidence?.body), 0, 1),
    head: clamp(finiteNumber(confidence?.head), 0, 1),
    chest: clamp(finiteNumber(confidence?.chest), 0, 1)
  };
}

function normalizeSourceMap(source = {}) {
  return {
    body: normalizeSource(source?.body),
    head: normalizeSource(source?.head),
    chest: normalizeSource(source?.chest)
  };
}

export function normalizeOrientationFrame(frame) {
  const t = finiteNumber(frame?.t, NaN);
  if (!Number.isFinite(t)) {
    return null;
  }
  return {
    t,
    bodyYawDegrees: clamp(finiteNumber(frame?.bodyYawDegrees), -180, 180),
    headYawDegrees: clamp(finiteNumber(frame?.headYawDegrees), -45, 45),
    headPitchDegrees: clamp(finiteNumber(frame?.headPitchDegrees), -30, 30),
    chestYawDegrees: clamp(finiteNumber(frame?.chestYawDegrees), -18, 18),
    shoulderRollDegrees: clamp(finiteNumber(frame?.shoulderRollDegrees), -10, 10),
    confidence: normalizeConfidence(frame?.confidence),
    source: normalizeSourceMap(frame?.source)
  };
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
}

export function normalizeOrientationSequence(payload = {}) {
  const metadata = normalizeMetadata(payload?.metadata);
  if (payload?.ok === false) {
    return {
      ok: false,
      reason: String(payload.reason || 'orientation_failed'),
      frames: [],
      metadata
    };
  }

  const frames = Array.isArray(payload?.frames)
    ? payload.frames.map(normalizeOrientationFrame).filter(Boolean).sort((a, b) => a.t - b.t)
    : [];
  if (!frames.length) {
    return {
      ok: false,
      reason: 'missing_orientation_frames',
      frames: [],
      metadata
    };
  }

  return {
    ok: true,
    frames,
    metadata: {
      version: 'orientation_alignment_v1',
      ...metadata
    }
  };
}

export function findNearestOrientationFrame(frames, timeSeconds) {
  const source = Array.isArray(frames) ? frames : [];
  if (!source.length) {
    return null;
  }
  const target = finiteNumber(timeSeconds, source[0].t);
  return source.reduce((nearest, frame) => (
    Math.abs(frame.t - target) < Math.abs(nearest.t - target) ? frame : nearest
  ), source[0]);
}

function quatFromDegrees({ x = 0, y = 0, z = 0 } = {}) {
  const hx = finiteNumber(x) * Math.PI / 360;
  const hy = finiteNumber(y) * Math.PI / 360;
  const hz = finiteNumber(z) * Math.PI / 360;
  const c1 = Math.cos(hx);
  const c2 = Math.cos(hy);
  const c3 = Math.cos(hz);
  const s1 = Math.sin(hx);
  const s2 = Math.sin(hy);
  const s3 = Math.sin(hz);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function normalizeQuat(quat) {
  const length = Math.hypot(quat[0], quat[1], quat[2], quat[3]) || 1;
  return quat.map((value) => Math.round((value / length) * 1000000) / 1000000);
}

function multiplyQuat(a, b) {
  return normalizeQuat([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ]);
}

function applyBoneDelta(bones, boneName, deltaQuat) {
  if (!bones?.[boneName]?.length) {
    return bones?.[boneName];
  }
  return bones[boneName].map((key) => ({
    ...key,
    rot: Array.isArray(key.rot) && key.rot.length === 4 ? multiplyQuat(deltaQuat, key.rot) : key.rot
  }));
}

export function applyOrientationTransform(animation, orientationFrame, options = {}) {
  const frame = normalizeOrientationFrame(orientationFrame);
  if (!animation || !frame) {
    return animation;
  }
  const minConfidence = finiteNumber(options.minConfidence, 0.35);
  const bones = { ...(animation.bones || {}) };
  const chestApplied = frame.confidence.chest >= minConfidence;
  if (chestApplied) {
    const chestQuat = quatFromDegrees({
      y: frame.chestYawDegrees,
      z: frame.shoulderRollDegrees
    });
    const spineQuat = quatFromDegrees({
      y: frame.chestYawDegrees * 0.45,
      z: frame.shoulderRollDegrees * 0.35
    });
    bones.chest = applyBoneDelta(bones, 'chest', chestQuat);
    bones.spine = applyBoneDelta(bones, 'spine', spineQuat);
  }

  const headApplied = frame.confidence.head >= minConfidence;
  return {
    ...animation,
    bones,
    orientation_alignment: {
      applied: chestApplied || headApplied,
      frameTimeSeconds: frame.t,
      head: {
        applied: headApplied,
        yawDegrees: headApplied ? frame.headYawDegrees : 0,
        pitchDegrees: headApplied ? frame.headPitchDegrees : 0,
        confidence: frame.confidence.head,
        source: frame.source.head
      },
      chest: {
        applied: chestApplied,
        yawDegrees: chestApplied ? frame.chestYawDegrees : 0,
        shoulderRollDegrees: chestApplied ? frame.shoulderRollDegrees : 0,
        confidence: frame.confidence.chest,
        source: frame.source.chest
      }
    }
  };
}
