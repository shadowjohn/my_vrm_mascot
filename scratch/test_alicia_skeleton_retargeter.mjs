import assert from 'node:assert/strict';
import {
  DEFAULT_ALICIA_RIG_PROFILE,
  normalizeSkeletonToAlicia
} from '../js/AliciaSkeletonRetargeter.js';

const EPSILON = 0.000001;

function closeTo(actual, expected, message, epsilon = EPSILON) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function closePoint(actual, expected, label, epsilon = EPSILON) {
  closeTo(actual.x, expected.x, `${label}.x`, epsilon);
  closeTo(actual.y, expected.y, `${label}.y`, epsilon);
  closeTo(actual.z, expected.z, `${label}.z`, epsilon);
}

function rotatePointAroundHips(point, hips, yawDegrees) {
  const yaw = yawDegrees * Math.PI / 180;
  const dx = point.x - hips.x;
  const dz = point.z - hips.z;
  return {
    ...point,
    x: hips.x + dx * Math.cos(yaw) - dz * Math.sin(yaw),
    z: hips.z + dx * Math.sin(yaw) + dz * Math.cos(yaw)
  };
}

function rotateSkeletonYaw(landmarks, yawDegrees) {
  const hips = landmarks.hips;
  return Object.fromEntries(
    Object.entries(landmarks).map(([name, point]) => [name, rotatePointAroundHips(point, hips, yawDegrees)])
  );
}

function makeSourceSkeleton({ scale = 1, armScale = 1, legScale = 1 } = {}) {
  const leftShoulder = { x: -0.2 * scale, y: 1.5 * scale, z: -0.02 * scale };
  const rightShoulder = { x: 0.2 * scale, y: 1.5 * scale, z: -0.02 * scale };
  const arm = (point, dx, dy, dz) => ({
    x: point.x + dx * scale * armScale,
    y: point.y + dy * scale * armScale,
    z: point.z + dz * scale * armScale
  });
  const leg = (dx, dy, dz) => ({
    x: dx * scale * legScale,
    y: 1 * scale + dy * scale * legScale,
    z: dz * scale * legScale
  });
  const leftKnee = leg(-0.08, -0.5, 0.03);
  const rightKnee = leg(0.08, -0.5, 0.03);
  return {
    hips: { x: 0, y: 1 * scale, z: 0 },
    chest: { x: 0.035 * scale, y: 1.42 * scale, z: -0.02 * scale },
    leftShoulder,
    rightShoulder,
    leftElbow: arm(leftShoulder, -0.11, -0.25, -0.02),
    rightElbow: arm(rightShoulder, 0.11, -0.25, -0.02),
    leftWrist: arm(arm(leftShoulder, -0.11, -0.25, -0.02), -0.07, -0.21, -0.02),
    rightWrist: arm(arm(rightShoulder, 0.11, -0.25, -0.02), 0.07, -0.21, -0.02),
    leftKnee,
    rightKnee,
    leftAnkle: {
      x: leftKnee.x - 0.14 * scale * legScale,
      y: leftKnee.y - 0.48 * scale * legScale,
      z: leftKnee.z + 0.05 * scale * legScale
    },
    rightAnkle: {
      x: rightKnee.x + 0.14 * scale * legScale,
      y: rightKnee.y - 0.48 * scale * legScale,
      z: rightKnee.z + 0.05 * scale * legScale
    }
  };
}

const tall = normalizeSkeletonToAlicia(makeSourceSkeleton({ scale: 1.85 }));
const short = normalizeSkeletonToAlicia(makeSourceSkeleton({ scale: 0.72 }));
const longLimbed = normalizeSkeletonToAlicia(makeSourceSkeleton({ scale: 1, armScale: 1.55, legScale: 1.45 }));

assert.equal(tall.metadata.profileId, DEFAULT_ALICIA_RIG_PROFILE.id);
assert.equal(tall.metadata.normalizedToAlicia, true);

for (const normalized of [tall, short, longLimbed]) {
  closeTo(
    distance(normalized.landmarks.hips, normalized.landmarks.leftKnee),
    DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftUpperLeg,
    'left upper leg length should match Alicia'
  );
  closeTo(
    distance(normalized.landmarks.leftKnee, normalized.landmarks.leftAnkle),
    DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftLowerLeg,
    'left lower leg length should match Alicia'
  );
  closeTo(
    distance(normalized.landmarks.leftShoulder, normalized.landmarks.leftElbow),
    DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftUpperArm,
    'left upper arm length should match Alicia'
  );
  closeTo(
    distance(normalized.landmarks.leftElbow, normalized.landmarks.leftWrist),
    DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftLowerArm,
    'left lower arm length should match Alicia'
  );
}

for (const name of [
  'hips',
  'chest',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle'
]) {
  closePoint(tall.landmarks[name], short.landmarks[name], `scaled skeletons should converge at ${name}`);
  closePoint(tall.landmarks[name], longLimbed.landmarks[name], `limb-length variants should converge at ${name}`);
}

assert.equal(tall.leftUpperLeg.length, DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftUpperLeg);
assert.equal(tall.leftLowerLeg.length, DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftLowerLeg);
assert.equal(tall.leftUpperArm.length, DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftUpperArm);
assert.equal(tall.leftLowerArm.length, DEFAULT_ALICIA_RIG_PROFILE.boneLengths.leftLowerArm);

const frontMotion = makeSourceSkeleton({ scale: 1 });
const sideMotion = rotateSkeletonYaw(frontMotion, 82);
const normalizedFrontMotion = normalizeSkeletonToAlicia(frontMotion);
const normalizedSideMotion = normalizeSkeletonToAlicia(sideMotion, undefined, { yawDegrees: 82 });
for (const name of [
  'chest',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle'
]) {
  closePoint(
    normalizedSideMotion.landmarks[name],
    normalizedFrontMotion.landmarks[name],
    `side-facing source should rotate back into Alicia front space at ${name}`,
    0.0001
  );
}
assert.equal(normalizedSideMotion.metadata.bodyYawDegrees, 82);

console.log('PASS test_alicia_skeleton_retargeter');
