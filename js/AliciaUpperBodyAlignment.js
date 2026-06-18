function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function point(landmarks, name) {
  const item = landmarks?.[name];
  return item
    ? {
      x: finiteNumber(item.x),
      y: finiteNumber(item.y),
      z: finiteNumber(item.z)
    }
    : null;
}

export function estimateUpperBodyAlignment(landmarks = {}) {
  const hips = point(landmarks, 'hips');
  const chest = point(landmarks, 'chest');
  const leftShoulder = point(landmarks, 'leftShoulder');
  const rightShoulder = point(landmarks, 'rightShoulder');
  if (!hips || !chest || !leftShoulder || !rightShoulder) {
    return {
      chestYawDegrees: 0,
      shoulderRollDegrees: 0,
      confidence: 0,
      source: 'unknown'
    };
  }

  const shoulderDx = rightShoulder.x - leftShoulder.x;
  const shoulderDz = rightShoulder.z - leftShoulder.z;
  const shoulderDy = rightShoulder.y - leftShoulder.y;
  const chestDz = chest.z - hips.z;
  const width = Math.max(0.0001, Math.abs(shoulderDx));
  const chestYaw = Math.atan2(shoulderDz + chestDz * 0.6, width) * 180 / Math.PI;
  const shoulderRoll = Math.atan2(shoulderDy, width) * 180 / Math.PI;
  const depthEvidence = clamp((Math.abs(shoulderDz) + Math.abs(chestDz)) / 0.28, 0, 1);
  const rollEvidence = clamp(Math.abs(shoulderDy) / 0.12, 0, 1);

  return {
    chestYawDegrees: Number(clamp(chestYaw, -18, 18).toFixed(2)),
    shoulderRollDegrees: Number(clamp(shoulderRoll, -10, 10).toFixed(2)),
    confidence: Number(Math.max(depthEvidence, rollEvidence, 0.35).toFixed(3)),
    source: 'skeleton_3d'
  };
}
