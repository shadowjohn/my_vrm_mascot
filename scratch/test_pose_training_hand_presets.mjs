import fs from 'node:fs';
import assert from 'node:assert/strict';

const motionController = fs.readFileSync('js/MotionController.js', 'utf8');
const poseTraining = fs.readFileSync('pose_training_lab.html', 'utf8');

assert.match(motionController, /HAND_POSE_CURL_PRESETS[\s\S]*trigger[\s\S]*peace[\s\S]*thumbsUp/);
assert.match(motionController, /fingerNameFromBone/);
assert.match(motionController, /#customPoseHandOverride/);
assert.match(motionController, /fingerCurlByFinger/);
assert.match(poseTraining, /trainingLeftHandPose/);
assert.match(poseTraining, /trainingRightHandPose/);
assert.match(poseTraining, /handPoseOverride:\s*buildTrainingHandPoseOverride\(\)/);
assert.match(poseTraining, /handPoseOverride:\s*cloneJson\(state\.handPoseOverride\)/);
assert.match(poseTraining, /buildCorrectedHandPoses/);

console.log('PASS test_pose_training_hand_presets');
