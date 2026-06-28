import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lab = readFileSync('pose_training_lab.html', 'utf8');
const controller = readFileSync('js/MotionController.js', 'utf8');

assert.match(controller, /#customPoseAdditiveRotation = \{\}/);
assert.match(controller, /additiveRotation/);
assert.match(controller, /#applyCustomPoseAdditiveRotation\(\)/);
assert.match(lab, /holdCustomPose\(state\.poseMotion,\s*\{[\s\S]*?additiveRotation:\s*state\.boneOffsets/);
assert.doesNotMatch(lab, /function\s+applyBoneOffsetsToCurrentPose/);

console.log('PASS test_pose_training_baked_offsets');
