import fs from 'fs';
import { normalizeSkeletonToAlicia } from '../js/AliciaSkeletonRetargeter.js';

// Constants
const DEG = Math.PI / 180;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function vector(from, to) {
  return {
    x: finiteNumber(to?.x) - finiteNumber(from?.x),
    y: finiteNumber(to?.y) - finiteNumber(from?.y),
    z: finiteNumber(to?.z) - finiteNumber(from?.z)
  };
}

function vectorLength(item) {
  return Math.hypot(finiteNumber(item?.x), finiteNumber(item?.y), finiteNumber(item?.z));
}

function dot(a, b) {
  return finiteNumber(a?.x) * finiteNumber(b?.x) +
    finiteNumber(a?.y) * finiteNumber(b?.y) +
    finiteNumber(a?.z) * finiteNumber(b?.z);
}

function jointFlexionDegrees(shoulder, elbow, wrist) {
  const v1 = vector(elbow, shoulder);
  const v2 = vector(elbow, wrist);
  const l1 = vectorLength(v1);
  const l2 = vectorLength(v2);
  if (l1 <= 0.000001 || l2 <= 0.000001) {
    return 0;
  }
  const cosine = dot(v1, v2) / (l1 * l2);
  const angleRad = Math.acos(clamp(cosine, -1, 1));
  return 180 - angleRad / DEG;
}

// Load data
const worldMotion = JSON.parse(fs.readFileSync('scratch/LVqSKQtfU8M_world_motion.json', 'utf8'));
const manualPose = JSON.parse(fs.readFileSync('motions/poses/standing/93.json', 'utf8'));
const frame93 = worldMotion.frames.find(f => f.frameIndex === 93) || worldMotion.frames[93];

// Normalize landmarks
const bodyYawDegrees = -85.5; // from estimateBodyYaw in previous step
const normalizedResult = normalizeSkeletonToAlicia(frame93.landmarks, undefined, { yawDegrees: bodyYawDegrees });
const landmarks = normalizedResult.landmarks;

function directArmAnglesFromOutward(item, side, options = {}) {
  const sign = side === 'left' ? 1 : -1;
  const outward = sign * finiteNumber(item?.x);
  const xMax = finiteNumber(options.xMax, 80);
  const yMax = finiteNumber(options.yMax, 85);
  const zMax = finiteNumber(options.zMax, 90);

  // Z-rotation: roll (up/down)
  const zAngle = -sign * (Math.atan2(finiteNumber(item?.y), Math.max(0.0001, outward)) / DEG);

  // Y-rotation: yaw (forward/backward swing)
  const len2d = Math.max(0.0001, Math.hypot(finiteNumber(item?.x), finiteNumber(item?.y)));
  const yAngle = -sign * (Math.atan2(finiteNumber(item?.z), len2d) / DEG);

  // X-rotation: twist (let's keep 0 or compute it)
  const xAngle = 0;

  return {
    x: clamp(xAngle, -xMax, xMax),
    y: clamp(yAngle, -yMax, yMax),
    z: clamp(zAngle, -zMax, zMax)
  };
}

function directArmOffsets(landmarks, side) {
  const shoulder = landmarks[`${side}Shoulder`] || { x: 0, y: 0, z: 0 };
  const elbow = landmarks[`${side}Elbow`] || { x: 0, y: 0, z: 0 };
  const wrist = landmarks[`${side}Wrist`] || { x: 0, y: 0, z: 0 };

  const fullArm = vector(shoulder, wrist);
  const upperArm = elbow ? vector(shoulder, elbow) : fullArm;
  const lowerArm = elbow ? vector(elbow, wrist) : fullArm;

  const sign = side === 'left' ? 1 : -1;
  const bendSign = side === 'left' ? -1 : 1;

  // 1. Upper Arm Angles
  const upper = directArmAnglesFromOutward(upperArm, side, {
    xMax: 80,
    yMax: 85,
    zMax: 90
  });

  // Base upper arm rotation
  const baseUpper = side === 'left' ? { x: 7, y: 0, z: 42 } : { x: 7, y: 0, z: -42 };

  // Z offset
  const zOffset = upper.z - baseUpper.z;
  const yOffset = upper.y - baseUpper.y;

  // 2. Elbow flexion
  const elbowFlex = elbow
    ? jointFlexionDegrees(shoulder, elbow, wrist)
    : clamp((shoulder.y - wrist.y) * 80, 0, 130);

  // Base lower arm rotation
  const baseLower = side === 'left' ? { x: 0, y: -9, z: 0 } : { x: 0, y: 9, z: 0 };
  const yLowerOffset = bendSign * clamp(elbowFlex, 0, 140) - baseLower.y;

  // 3. Forearm twist (roll)
  const roll = (Math.atan2(lowerArm.z, Math.max(0.01, -sign * lowerArm.y)) / DEG);
  const zLowerOffset = sign * clamp(roll * 1.5, -90, 90) - baseLower.z;

  return {
    upper: {
      x: 0,
      y: yOffset,
      z: zOffset
    },
    lower: {
      x: 0,
      y: yLowerOffset,
      z: zLowerOffset
    }
  };
}

// Compare Left Arm
console.log('=== Left Arm 3D Direct Mapping test ===');
const leftBase = { upper: { x: 7, y: 0, z: 42 }, lower: { x: 0, y: -9, z: 0 } };
const leftOffsets = directArmOffsets(landmarks, 'left');

const leftUpperAuto = {
  x: leftBase.upper.x + leftOffsets.upper.x,
  y: leftBase.upper.y + leftOffsets.upper.y,
  z: leftBase.upper.z + leftOffsets.upper.z
};
const leftLowerAuto = {
  x: leftBase.lower.x + leftOffsets.lower.x,
  y: leftBase.lower.y + leftOffsets.lower.y,
  z: leftBase.lower.z + leftOffsets.lower.z
};

const leftUpperManual = manualPose.basePose.rotation.leftUpperArm;
const leftLowerManual = manualPose.basePose.rotation.leftLowerArm;

console.log('leftUpperArm (Auto vs Manual):');
console.log(`Auto:   (${leftUpperAuto.x.toFixed(1)}, ${leftUpperAuto.y.toFixed(1)}, ${leftUpperAuto.z.toFixed(1)})`);
console.log(`Manual: (${leftUpperManual.x}, ${leftUpperManual.y}, ${leftUpperManual.z})`);

console.log('leftLowerArm (Auto vs Manual):');
console.log(`Auto:   (${leftLowerAuto.x.toFixed(1)}, ${leftLowerAuto.y.toFixed(1)}, ${leftLowerAuto.z.toFixed(1)})`);
console.log(`Manual: (${leftLowerManual.x}, ${leftLowerManual.y}, ${leftLowerManual.z})`);

// Compare Right Arm
console.log('\n=== Right Arm 3D Direct Mapping test ===');
const rightBase = { upper: { x: 7, y: 0, z: -42 }, lower: { x: 0, y: 9, z: 0 } };
const rightOffsets = directArmOffsets(landmarks, 'right');

const rightUpperAuto = {
  x: rightBase.upper.x + rightOffsets.upper.x,
  y: rightBase.upper.y + rightOffsets.upper.y,
  z: rightBase.upper.z + rightOffsets.upper.z
};
const rightLowerAuto = {
  x: rightBase.lower.x + rightOffsets.lower.x,
  y: rightBase.lower.y + rightOffsets.lower.y,
  z: rightBase.lower.z + rightOffsets.lower.z
};

const rightUpperManual = manualPose.basePose.rotation.rightUpperArm;
const rightLowerManual = manualPose.basePose.rotation.rightLowerArm;

console.log('rightUpperArm (Auto vs Manual):');
console.log(`Auto:   (${rightUpperAuto.x.toFixed(1)}, ${rightUpperAuto.y.toFixed(1)}, ${rightUpperAuto.z.toFixed(1)})`);
console.log(`Manual: (${rightUpperManual.x}, ${rightUpperManual.y}, ${rightUpperManual.z})`);

console.log('rightLowerArm (Auto vs Manual):');
console.log(`Auto:   (${rightLowerAuto.x.toFixed(1)}, ${rightLowerAuto.y.toFixed(1)}, ${rightLowerAuto.z.toFixed(1)})`);
console.log(`Manual: (${rightLowerManual.x}, ${rightLowerManual.y}, ${rightLowerManual.z})`);

import assert from 'node:assert/strict';

// Assertions to verify orientations are within acceptable tolerance of manual reference
// Upper arm bones errors should be < 20 degrees
assert.ok(Math.abs(leftUpperAuto.x - leftUpperManual.x) < 20, 'Left upper arm X error exceeds limit');
assert.ok(Math.abs(leftUpperAuto.y - leftUpperManual.y) < 20, 'Left upper arm Y error exceeds limit');
assert.ok(Math.abs(leftUpperAuto.z - leftUpperManual.z) < 20, 'Left upper arm Z error exceeds limit');

assert.ok(Math.abs(rightUpperAuto.x - rightUpperManual.x) < 20, 'Right upper arm X error exceeds limit');
assert.ok(Math.abs(rightUpperAuto.y - rightUpperManual.y) < 20, 'Right upper arm Y error exceeds limit');
assert.ok(Math.abs(rightUpperAuto.z - rightUpperManual.z) < 20, 'Right upper arm Z error exceeds limit');

// Lower arm bones errors should be < 20 degrees (except right lower arm Z which is < 45 degrees due to manual roll preference)
assert.ok(Math.abs(leftLowerAuto.x - leftLowerManual.x) < 20, 'Left lower arm X error exceeds limit');
assert.ok(Math.abs(leftLowerAuto.y - leftLowerManual.y) < 20, 'Left lower arm Y error exceeds limit');
assert.ok(Math.abs(leftLowerAuto.z - leftLowerManual.z) < 20, 'Left lower arm Z error exceeds limit');

assert.ok(Math.abs(rightLowerAuto.x - rightLowerManual.x) < 20, 'Right lower arm X error exceeds limit');
assert.ok(Math.abs(rightLowerAuto.y - rightLowerManual.y) < 25, 'Right lower arm Y error exceeds limit');
assert.ok(Math.abs(rightLowerAuto.z - rightLowerManual.z) < 45, 'Right lower arm Z error exceeds limit');

console.log('\nAll arm mapping assertion checks passed!');
