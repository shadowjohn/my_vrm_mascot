function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(x = 0, y = 0, z = 0) {
  return { x: finiteNumber(x), y: finiteNumber(y), z: finiteNumber(z) };
}

function clonePoint(item) {
  return point(item?.x, item?.y, item?.z);
}

function vector(from, to) {
  return {
    x: finiteNumber(to?.x) - finiteNumber(from?.x),
    y: finiteNumber(to?.y) - finiteNumber(from?.y),
    z: finiteNumber(to?.z) - finiteNumber(from?.z)
  };
}

function subtractVector(a, b) {
  return {
    x: finiteNumber(a?.x) - finiteNumber(b?.x),
    y: finiteNumber(a?.y) - finiteNumber(b?.y),
    z: finiteNumber(a?.z) - finiteNumber(b?.z)
  };
}

function addVector(from, offset) {
  return {
    x: finiteNumber(from?.x) + finiteNumber(offset?.x),
    y: finiteNumber(from?.y) + finiteNumber(offset?.y),
    z: finiteNumber(from?.z) + finiteNumber(offset?.z)
  };
}

function scaleVector(item, scale) {
  return {
    x: finiteNumber(item?.x) * scale,
    y: finiteNumber(item?.y) * scale,
    z: finiteNumber(item?.z) * scale
  };
}

function vectorLength(item) {
  return Math.hypot(finiteNumber(item?.x), finiteNumber(item?.y), finiteNumber(item?.z));
}

function distance(a, b) {
  return vectorLength(vector(a, b));
}

function dot(a, b) {
  return finiteNumber(a?.x) * finiteNumber(b?.x) +
    finiteNumber(a?.y) * finiteNumber(b?.y) +
    finiteNumber(a?.z) * finiteNumber(b?.z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedVector(item, fallback) {
  const length = vectorLength(item);
  if (length <= 0.000001) {
    const fallbackLength = vectorLength(fallback);
    return fallbackLength <= 0.000001
      ? { x: 0, y: -1, z: 0 }
      : scaleVector(fallback, 1 / fallbackLength);
  }
  return scaleVector(item, 1 / length);
}

function perpendicularComponent(item, axis) {
  return subtractVector(item, scaleVector(axis, dot(item, axis)));
}

function buildProfile() {
  const joints = {
    hips: point(0, 1, 0),
    chest: point(0, 1.42, 0),
    neck: point(0, 1.54, 0),
    head: point(0, 1.68, 0),
    leftShoulder: point(-0.2, 1.5, 0),
    rightShoulder: point(0.2, 1.5, 0),
    leftElbow: point(-0.31, 1.25, 0),
    rightElbow: point(0.31, 1.25, 0),
    leftWrist: point(-0.38, 1.04, 0),
    rightWrist: point(0.38, 1.04, 0),
    leftKnee: point(-0.06, 0.52, 0),
    rightKnee: point(0.06, 0.52, 0),
    leftAnkle: point(-0.08, 0, 0),
    rightAnkle: point(0.08, 0, 0),
    leftFoot: point(-0.08, 0, -0.14),
    rightFoot: point(0.08, 0, -0.14)
  };

  const boneLengths = {
    spine: distance(joints.hips, joints.chest),
    neck: distance(joints.chest, joints.neck),
    head: distance(joints.neck, joints.head),
    leftShoulder: distance(joints.chest, joints.leftShoulder),
    rightShoulder: distance(joints.chest, joints.rightShoulder),
    leftUpperArm: distance(joints.leftShoulder, joints.leftElbow),
    rightUpperArm: distance(joints.rightShoulder, joints.rightElbow),
    leftLowerArm: distance(joints.leftElbow, joints.leftWrist),
    rightLowerArm: distance(joints.rightElbow, joints.rightWrist),
    leftUpperLeg: distance(joints.hips, joints.leftKnee),
    rightUpperLeg: distance(joints.hips, joints.rightKnee),
    leftLowerLeg: distance(joints.leftKnee, joints.leftAnkle),
    rightLowerLeg: distance(joints.rightKnee, joints.rightAnkle),
    leftFoot: distance(joints.leftAnkle, joints.leftFoot),
    rightFoot: distance(joints.rightAnkle, joints.rightFoot)
  };

  return Object.freeze({
    id: 'alicia_preview_body_v1',
    joints: Object.freeze(joints),
    boneLengths: Object.freeze(boneLengths)
  });
}

export const DEFAULT_ALICIA_RIG_PROFILE = buildProfile();

function sourceLandmarks(sourceSkeleton) {
  return sourceSkeleton?.landmarks || sourceSkeleton || {};
}

function sourcePoint(landmarks, name, fallback) {
  const item = landmarks?.[name];
  if (!item) {
    return clonePoint(fallback);
  }
  return point(item.x, item.y, item.z);
}

function fallbackDirection(profile, fromName, toName) {
  return vector(profile.joints[fromName], profile.joints[toName]);
}

function placeBySourceDirection({ anchor, sourceFrom, sourceTo, length, fallback }) {
  const direction = normalizedVector(vector(sourceFrom, sourceTo), fallback);
  return addVector(anchor, scaleVector(direction, length));
}

function placeTwoBoneChain({
  anchor,
  sourceStart,
  sourceMid,
  sourceEnd,
  upperLength,
  lowerLength,
  fallbackMid,
  fallbackEnd,
  bendDepthScale = 1
}) {
  const endDirection = normalizedVector(vector(sourceStart, sourceEnd), fallbackEnd);
  const sourceUpperLength = distance(sourceStart, sourceMid);
  const sourceLowerLength = distance(sourceMid, sourceEnd);
  const sourceTotalLength = Math.max(0.000001, sourceUpperLength + sourceLowerLength);
  const sourceReach = distance(sourceStart, sourceEnd);
  const minReach = Math.abs(upperLength - lowerLength) + 0.000001;
  const maxReach = upperLength + lowerLength - 0.000001;
  const targetReach = clamp((sourceReach / sourceTotalLength) * (upperLength + lowerLength), minReach, maxReach);
  const along = clamp(
    (upperLength * upperLength + targetReach * targetReach - lowerLength * lowerLength) / (2 * targetReach),
    0,
    upperLength
  );
  const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  let sourceBend = perpendicularComponent(vector(sourceStart, sourceMid), endDirection);
  sourceBend.z *= bendDepthScale;
  sourceBend = perpendicularComponent(sourceBend, endDirection);
  const fallbackBend = perpendicularComponent(fallbackMid, endDirection);
  const bendDirection = normalizedVector(sourceBend, fallbackBend);
  const end = addVector(anchor, scaleVector(endDirection, targetReach));
  const mid = addVector(
    anchor,
    addVector(scaleVector(endDirection, along), scaleVector(bendDirection, bendHeight))
  );
  return { mid, end };
}

function makeBone(name, from, to, length) {
  return Object.freeze({
    name,
    from: clonePoint(from),
    to: clonePoint(to),
    vector: vector(from, to),
    length
  });
}

function buildBones(landmarks, profile) {
  return {
    spine: makeBone('spine', landmarks.hips, landmarks.chest, profile.boneLengths.spine),
    neck: makeBone('neck', landmarks.chest, landmarks.neck, profile.boneLengths.neck),
    head: makeBone('head', landmarks.neck, landmarks.head, profile.boneLengths.head),
    leftUpperLeg: makeBone('leftUpperLeg', landmarks.hips, landmarks.leftKnee, profile.boneLengths.leftUpperLeg),
    leftLowerLeg: makeBone('leftLowerLeg', landmarks.leftKnee, landmarks.leftAnkle, profile.boneLengths.leftLowerLeg),
    leftFoot: makeBone('leftFoot', landmarks.leftAnkle, landmarks.leftFoot, profile.boneLengths.leftFoot),
    rightUpperLeg: makeBone('rightUpperLeg', landmarks.hips, landmarks.rightKnee, profile.boneLengths.rightUpperLeg),
    rightLowerLeg: makeBone('rightLowerLeg', landmarks.rightKnee, landmarks.rightAnkle, profile.boneLengths.rightLowerLeg),
    rightFoot: makeBone('rightFoot', landmarks.rightAnkle, landmarks.rightFoot, profile.boneLengths.rightFoot),
    leftUpperArm: makeBone('leftUpperArm', landmarks.leftShoulder, landmarks.leftElbow, profile.boneLengths.leftUpperArm),
    leftLowerArm: makeBone('leftLowerArm', landmarks.leftElbow, landmarks.leftWrist, profile.boneLengths.leftLowerArm),
    rightUpperArm: makeBone('rightUpperArm', landmarks.rightShoulder, landmarks.rightElbow, profile.boneLengths.rightUpperArm),
    rightLowerArm: makeBone('rightLowerArm', landmarks.rightElbow, landmarks.rightWrist, profile.boneLengths.rightLowerArm)
  };
}

export function normalizeSkeletonToAlicia(sourceSkeleton, aliciaRigProfile = DEFAULT_ALICIA_RIG_PROFILE) {
  const profile = aliciaRigProfile || DEFAULT_ALICIA_RIG_PROFILE;
  const source = sourceLandmarks(sourceSkeleton);
  const sourceHips = sourcePoint(source, 'hips', profile.joints.hips);
  const sourceChest = sourcePoint(source, 'chest', profile.joints.chest);

  const landmarks = {
    hips: clonePoint(profile.joints.hips)
  };

  landmarks.chest = placeBySourceDirection({
    anchor: landmarks.hips,
    sourceFrom: sourceHips,
    sourceTo: sourceChest,
    length: profile.boneLengths.spine,
    fallback: fallbackDirection(profile, 'hips', 'chest')
  });
  landmarks.neck = placeBySourceDirection({
    anchor: landmarks.chest,
    sourceFrom: sourceChest,
    sourceTo: sourcePoint(source, 'neck', profile.joints.neck),
    length: profile.boneLengths.neck,
    fallback: fallbackDirection(profile, 'chest', 'neck')
  });
  landmarks.head = placeBySourceDirection({
    anchor: landmarks.neck,
    sourceFrom: sourcePoint(source, 'neck', profile.joints.neck),
    sourceTo: sourcePoint(source, 'head', profile.joints.head),
    length: profile.boneLengths.head,
    fallback: fallbackDirection(profile, 'neck', 'head')
  });

  for (const side of ['left', 'right']) {
    const shoulderName = `${side}Shoulder`;
    const elbowName = `${side}Elbow`;
    const wristName = `${side}Wrist`;
    const kneeName = `${side}Knee`;
    const ankleName = `${side}Ankle`;
    const footName = `${side}Foot`;

    const sourceShoulder = sourcePoint(source, shoulderName, profile.joints[shoulderName]);
    const sourceElbow = sourcePoint(source, elbowName, profile.joints[elbowName]);
    const sourceWrist = sourcePoint(source, wristName, profile.joints[wristName]);
    const sourceKnee = sourcePoint(source, kneeName, profile.joints[kneeName]);
    const sourceAnkle = sourcePoint(source, ankleName, profile.joints[ankleName]);
    const sourceFoot = source?.[footName]
      ? sourcePoint(source, footName, profile.joints[footName])
      : addVector(sourceAnkle, fallbackDirection(profile, ankleName, footName));

    landmarks[shoulderName] = placeBySourceDirection({
      anchor: landmarks.chest,
      sourceFrom: sourceChest,
      sourceTo: sourceShoulder,
      length: profile.boneLengths[shoulderName],
      fallback: fallbackDirection(profile, 'chest', shoulderName)
    });
    const armChain = placeTwoBoneChain({
      anchor: landmarks[shoulderName],
      sourceStart: sourceShoulder,
      sourceMid: sourceElbow,
      sourceEnd: sourceWrist,
      upperLength: profile.boneLengths[`${side}UpperArm`],
      lowerLength: profile.boneLengths[`${side}LowerArm`],
      fallbackMid: fallbackDirection(profile, shoulderName, elbowName),
      fallbackEnd: vector(profile.joints[shoulderName], profile.joints[wristName]),
      bendDepthScale: 0.35
    });
    landmarks[elbowName] = armChain.mid;
    landmarks[wristName] = armChain.end;
    const legChain = placeTwoBoneChain({
      anchor: landmarks.hips,
      sourceStart: sourceHips,
      sourceMid: sourceKnee,
      sourceEnd: sourceAnkle,
      upperLength: profile.boneLengths[`${side}UpperLeg`],
      lowerLength: profile.boneLengths[`${side}LowerLeg`],
      fallbackMid: fallbackDirection(profile, 'hips', kneeName),
      fallbackEnd: vector(profile.joints.hips, profile.joints[ankleName])
    });
    landmarks[kneeName] = legChain.mid;
    landmarks[ankleName] = legChain.end;
    landmarks[footName] = placeBySourceDirection({
      anchor: landmarks[ankleName],
      sourceFrom: sourceAnkle,
      sourceTo: sourceFoot,
      length: profile.boneLengths[footName],
      fallback: fallbackDirection(profile, ankleName, footName)
    });
  }

  const bones = buildBones(landmarks, profile);

  return {
    hips: landmarks.hips,
    spine: bones.spine,
    chest: landmarks.chest,
    neck: landmarks.neck,
    head: landmarks.head,
    ...bones,
    landmarks,
    bones,
    metadata: {
      profileId: profile.id,
      normalizedToAlicia: true
    }
  };
}
