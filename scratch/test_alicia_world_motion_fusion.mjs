import assert from 'node:assert/strict';
import { fuseAliciaWorldMotion } from '../js/AliciaWorldMotionFusion.js';

const pose = {
  name: 'pose_copier_frame',
  bones: {
    hips: [{ time_ms: 0, rot: [0, 0, 0, 1] }],
    leftUpperArm: [{ time_ms: 0, rot: [0.1, 0, 0, 0.99] }]
  },
  hips_position: [{ time_ms: 0, pos: [0, 0, 0] }],
  world_motion: { existing: true }
};

const fused = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0.5,
    bodyYawDegrees: -90,
    rootTranslation: { x: 0.2, y: 0, z: 1.5 },
    footContact: { left: true, right: false },
    confidence: 0.8
  }]
}, { timeSeconds: 0.52, rootScale: 0.1, yawSmoothing: 0.5 });

assert.notEqual(fused, pose);
assert.deepEqual(fused.bones.leftUpperArm, pose.bones.leftUpperArm);
assert.equal(fused.world_motion.source, 'fixture');
assert.equal(fused.world_motion.applied, true);
assert.equal(fused.world_motion.footContact.left, true);
assert.ok(Math.abs(fused.world_motion.bodyYawDegrees + 45) < 0.001);
assert.deepEqual(fused.hips_position[0].pos, [0.02, 0, 0.15]);

const unchanged = fuseAliciaWorldMotion(pose, { ok: false, frames: [] });
assert.deepEqual(unchanged, pose);

const lowConfidence = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0,
    bodyYawDegrees: 120,
    rootTranslation: { x: 1, y: 0, z: 1 },
    footContact: { left: true, right: true },
    confidence: 0.1
  }]
}, { minConfidence: 0.35 });
assert.deepEqual(lowConfidence, pose);

console.log('PASS test_alicia_world_motion_fusion');
