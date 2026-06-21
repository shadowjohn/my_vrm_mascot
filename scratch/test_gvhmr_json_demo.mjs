import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('demo.html', 'utf8');
const motionController = readFileSync('js/MotionController.js', 'utf8');
const jsonPath = 'conda_vm/gvhmr/GVHMR/outputs/demo/DW4zkfl95cU/alicia_blender_bake_motion.json';

assert.ok(existsSync('demo.html'), 'demo.html must exist');
assert.ok(existsSync(jsonPath), 'Blender-baked Alicia motion JSON must exist');
assert.match(html, /new VrmMascot\(\$\('stage'\)/);
assert.match(html, /playCustom\(state\.motion/);
assert.match(html, /id="motionSelect"/);
assert.match(html, /id="skeletonToggle"/);
assert.match(html, /id="skeletonCanvas"/);
assert.match(html, /id="sourceVideoOverlay"/);
assert.match(html, /id="sourceVideo"/);
assert.match(html, /const MOTION_EXAMPLES = \[/);
assert.match(html, /api\/gvhmr\/demo-motions/);
assert.match(html, /loadMotionExamples/);
assert.match(html, /motionSelect'\)\.addEventListener\('change'/);
assert.match(html, /drawGvhmrSkeleton/);
assert.match(html, /skeletonUrlFor/);
assert.match(html, /videoUrlFor/);
assert.match(html, /syncSourceVideo/);
assert.match(html, /facingYaw: state\.motion\.facing_alignment/);
assert.doesNotMatch(html, /previewPoseAtTimeMs\(timeMs, state\.frames/);
assert.match(html, new RegExp(jsonPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
const quatAngleDegrees = (quat) => {
  const w = Math.max(-1, Math.min(1, Number(quat?.[3]) || 0));
  return 2 * Math.acos(Math.abs(w)) * 180 / Math.PI;
};
const averageBoneAngle = (motion, boneName) => {
  const keys = motion.bones?.[boneName] || [];
  assert.ok(keys.length > 0, `${boneName} must have quaternion keys`);
  return keys.reduce((sum, key) => sum + quatAngleDegrees(key.rot), 0) / keys.length;
};
assert.equal(payload.source, 'gvhmr_blender_bake');
assert.equal(payload.retarget_mode, 'blender_ik_foot_lock');
assert.equal(payload.facing_alignment?.targetForward?.z, 1, 'Alicia target forward must be explicit');
assert.equal(typeof payload.facing_alignment?.yawCorrectionDegrees, 'number', 'baked JSON must record facing yaw correction');
assert.ok(payload.bones?.leftToes?.length > 0, 'baked JSON must include toe proxy keys');
assert.ok(payload.bones?.rightToes?.length > 0, 'baked JSON must include toe proxy keys');
assert.ok(payload.frame_count > 0, 'baked JSON must have frames');
assert.ok(payload.bones?.hips?.length > 0, 'baked JSON must have hips quaternion keys');
assert.ok(payload.bones?.leftUpperLeg?.length > 0, 'baked JSON must have leg quaternion keys');
assert.match(motionController, /leftToes:\s+h\.getBoneNode/);
assert.match(motionController, /rightToes:\s+h\.getBoneNode/);

const demoJsonPaths = [...html.matchAll(/url:\s*'([^']+alicia_blender_bake_motion\.json)'/g)].map((match) => match[1]);
assert.equal(demoJsonPaths.length, 5, 'demo should expose all baked examples');
for (const path of demoJsonPaths) {
  assert.ok(existsSync(path), `${path} must exist`);
  const skeletonPath = path.replace('alicia_blender_bake_motion.json', 'alicia_intermediate_landmarks.json');
  const videoPath = path.replace('alicia_blender_bake_motion.json', '0_input_video.mp4');
  assert.ok(existsSync(skeletonPath), `${skeletonPath} must exist`);
  assert.ok(existsSync(videoPath), `${videoPath} must exist`);
  const demoPayload = JSON.parse(readFileSync(path, 'utf8'));
  const skeletonPayload = JSON.parse(readFileSync(skeletonPath, 'utf8'));
  assert.ok(demoPayload.bones?.leftToes?.length > 0, `${path} must include leftToes`);
  assert.ok(demoPayload.bones?.rightToes?.length > 0, `${path} must include rightToes`);
  assert.ok(averageBoneAngle(demoPayload, 'leftFoot') < 35, `${path} leftFoot should stay near rest after IK foot lock`);
  assert.ok(averageBoneAngle(demoPayload, 'rightFoot') < 35, `${path} rightFoot should stay near rest after IK foot lock`);
  assert.ok(skeletonPayload.frames?.[0]?.landmarks?.chest, `${skeletonPath} must include GVHMR chest landmarks`);
}

console.log('PASS test_gvhmr_json_demo');
