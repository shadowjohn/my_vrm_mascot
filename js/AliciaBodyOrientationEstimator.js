function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rounded(value, digits = 3) {
  return Number((Number(value) || 0).toFixed(digits));
}

function sourceLandmarks(input) {
  return input?.landmarks || input || {};
}

function point(landmarks, name) {
  const item = landmarks?.[name];
  return item && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)) && Number.isFinite(Number(item.z))
    ? item
    : null;
}

function visibility(landmarks, names) {
  const values = names
    .map((name) => landmarks?.[name]?.visibility)
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + clamp(value, 0, 1), 0) / values.length;
}

function widthAndDepth(left, right, torsoHeight) {
  if (!left || !right || torsoHeight <= 0.000001) {
    return null;
  }
  const dx = finiteNumber(right.x) - finiteNumber(left.x);
  const dz = finiteNumber(right.z) - finiteNumber(left.z);
  return {
    dx,
    dz,
    widthRatio: Math.abs(dx) / torsoHeight,
    depthRatio: Math.abs(dz) / torsoHeight,
    yawDegrees: Math.atan2(Math.abs(dz), Math.max(0.000001, Math.abs(dx))) * 180 / Math.PI * Math.sign(dz || 1)
  };
}

function facingFromYaw(yawDegrees, confidence, frontConfidence, faceVisibility) {
  const absYaw = Math.abs(yawDegrees);
  if (confidence >= 0.45 && absYaw >= 45) {
    return yawDegrees >= 0 ? 'right_side' : 'left_side';
  }
  if (frontConfidence >= 0.45 && absYaw < 30) {
    return 'front';
  }
  if (faceVisibility < 0.15 && frontConfidence >= 0.35 && absYaw < 25) {
    return 'back';
  }
  return 'unknown';
}

function estimateFrameYaw(frameOrLandmarks) {
  const landmarks = sourceLandmarks(frameOrLandmarks);
  const hips = point(landmarks, 'hips');
  const chest = point(landmarks, 'chest');
  const leftShoulder = point(landmarks, 'leftShoulder');
  const rightShoulder = point(landmarks, 'rightShoulder');
  const leftHip = point(landmarks, 'leftHip');
  const rightHip = point(landmarks, 'rightHip');
  const leftAnkle = point(landmarks, 'leftAnkle');
  const rightAnkle = point(landmarks, 'rightAnkle');
  const torsoHeight = Math.max(0.000001, Math.abs(finiteNumber(chest?.y) - finiteNumber(hips?.y)));
  const shoulder = widthAndDepth(leftShoulder, rightShoulder, torsoHeight);
  const hip = widthAndDepth(leftHip, rightHip, torsoHeight);
  const faceVisibility = visibility(landmarks, ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar']);

  const yawSamples = [];
  if (shoulder) {
    yawSamples.push({ yaw: shoulder.yawDegrees, weight: Math.max(0.1, shoulder.depthRatio) });
  }
  if (hip) {
    yawSamples.push({ yaw: hip.yawDegrees, weight: Math.max(0.1, hip.depthRatio) });
  }

  const totalWeight = yawSamples.reduce((sum, sample) => sum + sample.weight, 0);
  const yawDegrees = totalWeight > 0
    ? yawSamples.reduce((sum, sample) => sum + sample.yaw * sample.weight, 0) / totalWeight
    : 0;
  const shoulderWidthRatio = shoulder?.widthRatio ?? 0;
  const hipWidthRatio = hip?.widthRatio ?? 0;
  const shoulderDepthRatio = shoulder?.depthRatio ?? 0;
  const hipDepthRatio = hip?.depthRatio ?? 0;
  const widthCollapse = clamp((0.72 - Math.max(shoulderWidthRatio, hipWidthRatio)) / 0.58, 0, 1);
  const depthConfidence = clamp(Math.max(shoulderDepthRatio / 0.42, hipDepthRatio / 0.32), 0, 1);
  const confidence = clamp(depthConfidence * 0.72 + widthCollapse * 0.28, 0, 1);
  const frontConfidence = clamp(
    (Math.max(shoulderWidthRatio, hipWidthRatio) - 0.42) / 0.42 * 0.6 + faceVisibility * 0.4,
    0,
    1
  );
  const facing = facingFromYaw(yawDegrees, confidence, frontConfidence, faceVisibility);

  return {
    facing,
    yawDegrees: facing === 'unknown' || facing === 'back' ? 0 : rounded(yawDegrees, 1),
    confidence: rounded(facing === 'front' ? frontConfidence : confidence),
    evidence: {
      shoulderWidthRatio: rounded(shoulderWidthRatio),
      hipWidthRatio: rounded(hipWidthRatio),
      shoulderDepthDelta: rounded(shoulder?.dz ?? 0),
      hipDepthDelta: rounded(hip?.dz ?? 0),
      faceVisibility: rounded(faceVisibility),
      ankleDepthDelta: rounded((rightAnkle && leftAnkle) ? finiteNumber(rightAnkle.z) - finiteNumber(leftAnkle.z) : 0),
      depthConfidence: rounded(depthConfidence),
      widthCollapse: rounded(widthCollapse)
    }
  };
}

function framesFromInput(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input?.frames)) {
    return input.frames;
  }
  return [input];
}

export function estimateBodyYaw(input) {
  const estimates = framesFromInput(input)
    .map(estimateFrameYaw)
    .filter((estimate) => estimate.facing !== 'unknown');
  if (estimates.length === 0) {
    return estimateFrameYaw(input);
  }

  const weightSum = estimates.reduce((sum, estimate) => sum + Math.max(0.05, estimate.confidence), 0);
  const yawDegrees = estimates.reduce(
    (sum, estimate) => sum + estimate.yawDegrees * Math.max(0.05, estimate.confidence),
    0
  ) / weightSum;
  const confidence = estimates.reduce((sum, estimate) => sum + estimate.confidence, 0) / estimates.length;
  const evidence = Object.fromEntries(
    Object.keys(estimates[0].evidence).map((key) => [
      key,
      rounded(estimates.reduce((sum, estimate) => sum + finiteNumber(estimate.evidence[key]), 0) / estimates.length)
    ])
  );
  const facing = facingFromYaw(yawDegrees, confidence, confidence, evidence.faceVisibility);
  return {
    facing,
    yawDegrees: facing === 'unknown' || facing === 'back' ? 0 : rounded(yawDegrees, 1),
    confidence: rounded(confidence),
    evidence
  };
}
