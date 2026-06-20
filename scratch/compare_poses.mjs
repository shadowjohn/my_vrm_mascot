import fs from 'fs';
import { AliciaMotionPreviewAdapter } from '../js/AliciaMotionPreviewAdapter.js';

// Load files
const worldMotion = JSON.parse(fs.readFileSync('scratch/LVqSKQtfU8M_world_motion.json', 'utf8'));
const manualPose = JSON.parse(fs.readFileSync('motions/poses/standing/93.json', 'utf8'));

// Extract frame 93
const frame93 = worldMotion.frames.find(f => f.frameIndex === 93) || worldMotion.frames[93];
if (!frame93) {
  console.error('Frame 93 not found in world motion JSON');
  process.exit(1);
}

// Convert timeMs to match preview system
const timeMs = Math.round(frame93.t * 1000);
frame93.timeMs = timeMs;

// Mock mascot
let heldAnimation = null;
const mascot = {
  lookAt: {
    setPreviewGaze() {}
  },
  motion: {
    getPosePreset() {
      // Return standard base pose preset
      return {
        basePose: {
          rotation: {
            hips: { x: 0, y: 0, z: 0 },
            spine: { x: 2, y: 0, z: -2 },
            chest: { x: -1, y: -2, z: -1 },
            leftShoulder: { x: 0, y: 0, z: 2 },
            rightShoulder: { x: 0, y: 0, z: -2 },
            leftUpperArm: { x: 7, y: 0, z: 42 },
            rightUpperArm: { x: 7, y: 0, z: -42 },
            leftLowerArm: { x: 0, y: -9, z: 0 },
            rightLowerArm: { x: 0, y: 9, z: 0 },
            leftUpperLeg: { x: 1, y: 0, z: 2 },
            rightUpperLeg: { x: -1, y: 0, z: -2 },
            leftLowerLeg: { x: 0, y: 0, z: 0 },
            rightLowerLeg: { x: 0, y: 0, z: 0 },
            leftFoot: { x: 0, y: 0, z: 0 },
            rightFoot: { x: 0, y: 0, z: 0 }
          }
        }
      };
    },
    holdCustomPose(anim) {
      heldAnimation = anim;
    }
  }
};

// Instantiate adapter and preview frame 93
const adapter = new AliciaMotionPreviewAdapter({ mascot });
const result = adapter.previewPoseAtTimeMs(timeMs, [frame93], {
  kind: 'pose_copier_v1',
  id: 'pose_copier_frame',
  retargetHints: {
    directSkeletonPose: true,
    strideScale: 1.0,
    armSwingScale: 1.0
  }
});

if (!result.ok || !heldAnimation) {
  console.error('Failed to preview pose:', result.reason);
  process.exit(1);
}

// YXZ quaternion to Euler degrees
function quatToEulerYXZ(q) {
  const [x, y, z, w] = q;
  const sinX = 2 * (w * x - y * z);
  let pitchRad;
  if (Math.abs(sinX) >= 1) {
    pitchRad = Math.sign(sinX) * Math.PI / 2;
  } else {
    pitchRad = Math.asin(sinX);
  }

  const sinY = 2 * (w * y + z * x);
  const cosY = 1 - 2 * (x * x + y * y);
  const yawRad = Math.atan2(sinY, cosY);

  const sinZ = 2 * (w * z + x * y);
  const cosZ = 1 - 2 * (z * z + x * x);
  const rollRad = Math.atan2(sinZ, cosZ);

  return {
    x: Math.round(pitchRad * 180 / Math.PI),
    y: Math.round(yawRad * 180 / Math.PI),
    z: Math.round(rollRad * 180 / Math.PI)
  };
}

// Compare bones
const bonesToCompare = [
  'hips',
  'spine',
  'chest',
  'leftUpperArm',
  'leftLowerArm',
  'rightUpperArm',
  'rightLowerArm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg'
];

console.log('=== 93 幀骨架角度對比 (自動對應 vs 手動校正) ===');
console.log('----------------------------------------------------------------------');
console.log(
  '骨骼名稱'.padEnd(14) + ' | ' +
  '自動解算 (X, Y, Z)'.padEnd(20) + ' | ' +
  '手動校正 (X, Y, Z)'.padEnd(20) + ' | ' +
  '誤差值 (Manual - Auto)'
);
console.log('----------------------------------------------------------------------');

for (const name of bonesToCompare) {
  const autoKeys = heldAnimation.bones[name];
  const manualRot = manualPose.basePose.rotation[name] || { x: 0, y: 0, z: 0 };

  if (!autoKeys || autoKeys.length === 0) {
    console.log(`${name.padEnd(14)} | (未計算)`.padEnd(38) + ` | (${manualRot.x}, ${manualRot.y}, ${manualRot.z})`);
    continue;
  }

  const autoRot = quatToEulerYXZ(autoKeys[0].rot);
  const diffX = manualRot.x - autoRot.x;
  const diffY = manualRot.y - autoRot.y;
  const diffZ = manualRot.z - autoRot.z;

  console.log(
    name.padEnd(14) + ' | ' +
    `(${autoRot.x}, ${autoRot.y}, ${autoRot.z})`.padEnd(20) + ' | ' +
    `(${manualRot.x}, ${manualRot.y}, ${manualRot.z})`.padEnd(20) + ' | ' +
    `(${diffX}, ${diffY}, ${diffZ})`
  );
}
console.log('----------------------------------------------------------------------');
