function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(landmarks, name) {
  const item = landmarks?.[name];
  if (!item) {
    return null;
  }
  return {
    x: finiteNumber(item.x),
    y: finiteNumber(item.y),
    z: finiteNumber(item.z),
    visibility: clamp(finiteNumber(item.visibility, 1), 0, 1)
  };
}

function estimateFromFace(landmarks) {
  const nose = point(landmarks, 'nose');
  const leftEar = point(landmarks, 'leftEar');
  const rightEar = point(landmarks, 'rightEar');
  if (!nose || !leftEar || !rightEar) {
    return null;
  }

  const earSpan = Math.max(0.0001, Math.abs(rightEar.x - leftEar.x));
  const earCenterX = (leftEar.x + rightEar.x) / 2;
  const yaw = clamp(((nose.x - earCenterX) / earSpan) * 70, -45, 45);
  const earCenterY = (leftEar.y + rightEar.y) / 2;
  const pitch = clamp((earCenterY - nose.y) * 140, -30, 30);
  const confidence = clamp((nose.visibility + leftEar.visibility + rightEar.visibility) / 3, 0, 1);
  return {
    headYawDegrees: yaw,
    headPitchDegrees: pitch,
    confidence,
    source: 'mediapipe_face'
  };
}

function estimateFromSkeleton(landmarks) {
  const head = point(landmarks, 'head');
  const neck = point(landmarks, 'neck') || point(landmarks, 'chest');
  const chest = point(landmarks, 'chest');
  if (!head || !neck || !chest) {
    return null;
  }

  const dx = head.x - neck.x;
  const dy = head.y - neck.y;
  const dz = head.z - neck.z;
  const yaw = clamp(Math.atan2(dx, Math.max(0.0001, Math.abs(dz))) * 180 / Math.PI, -45, 45);
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz) || 0.0001) * 180 / Math.PI - 45, -30, 30);
  const confidence = Math.max(0.35, Math.min(0.62, Math.hypot(dx, dz) * 3 + 0.35));
  return {
    headYawDegrees: yaw,
    headPitchDegrees: pitch,
    confidence,
    source: 'skeleton_3d'
  };
}

export function estimateHeadGaze(landmarks = {}) {
  const estimate = estimateFromFace(landmarks) || estimateFromSkeleton(landmarks);
  if (!estimate) {
    return {
      headYawDegrees: 0,
      headPitchDegrees: 0,
      confidence: 0,
      source: 'unknown'
    };
  }
  return {
    headYawDegrees: Number(estimate.headYawDegrees.toFixed(2)),
    headPitchDegrees: Number(estimate.headPitchDegrees.toFixed(2)),
    confidence: Number(clamp(estimate.confidence, 0, 1).toFixed(3)),
    source: estimate.source
  };
}
