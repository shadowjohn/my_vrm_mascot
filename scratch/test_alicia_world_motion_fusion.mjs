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
assert.notDeepEqual(fused.bones.hips[0].rot, pose.bones.hips[0].rot);
assert.ok(Math.abs(fused.body_orientation.worldYawDegrees + 90) < 0.001);
assert.ok(Math.abs(fused.body_orientation.appliedYawDegrees + 45) < 0.001);
assert.equal(fused.world_motion.source, 'fixture');
assert.equal(fused.world_motion.applied, true);
assert.equal(fused.world_motion.footContact.left, true);
assert.ok(Math.abs(fused.world_motion.bodyYawDegrees + 45) < 0.001);
assert.ok(Math.abs(fused.world_motion.worldYawDegrees + 90) < 0.001);
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

const gvhmrFacing = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'gvhmr',
  frames: [{
    t: 0,
    bodyYawDegrees: 90,
    rootTranslation: { x: 0, y: 0, z: 0 },
    footContact: { left: false, right: false },
    confidence: 1
  }]
});
assert.ok(Math.abs(gvhmrFacing.body_orientation.worldYawDegrees - 90) < 0.001);
assert.ok(Math.abs(gvhmrFacing.body_orientation.appliedYawDegrees + 90) < 0.001);
assert.ok(Math.abs(gvhmrFacing.world_motion.worldYawDegrees - 90) < 0.001);
assert.ok(Math.abs(gvhmrFacing.world_motion.bodyYawDegrees + 90) < 0.001);

const groundedFusion = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [
    {
      t: 0,
      bodyYawDegrees: 0,
      rootTranslation: { x: 0, y: 1.5, z: 0 },
      footContact: { left: false, right: false },
      confidence: 1
    },
    {
      t: 1,
      bodyYawDegrees: 0,
      rootTranslation: { x: 0, y: 2.5, z: 0 },
      footContact: { left: false, right: false },
      confidence: 1
    }
  ]
}, { timeSeconds: 0, rootScale: 1.0 });

// Default: grounding is active, minY is 1.5, so at t=0, y should be 1.5 - 1.5 = 0
assert.deepEqual(groundedFusion.hips_position[0].pos, [0, 0, 0]);

const ungroundedFusion = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [
    {
      t: 0,
      bodyYawDegrees: 0,
      rootTranslation: { x: 0, y: 1.5, z: 0 },
      footContact: { left: false, right: false },
      confidence: 1
    },
    {
      t: 1,
      bodyYawDegrees: 0,
      rootTranslation: { x: 0, y: 2.5, z: 0 },
      footContact: { left: false, right: false },
      confidence: 1
    }
  ]
}, { timeSeconds: 0, rootScale: 1.0, grounded: false });

// With grounded: false, y should remain 1.5
assert.deepEqual(ungroundedFusion.hips_position[0].pos, [0, 1.5, 0]);

// Test calibration options
const calibFusion = fuseAliciaWorldMotion(pose, {
  ok: true,
  source: 'fixture',
  frames: [{
    t: 0.5,
    bodyYawDegrees: 30,
    rootTranslation: { x: 10, y: 5, z: 20 },
    landmarks: { hips: { x: 0, y: 2.0, z: 0 } },
    footContact: { left: false, right: false },
    confidence: 1.0
  }]
}, {
  timeSeconds: 0.5,
  rootScale: 0.1,
  grounded: true,
  calibScale: 0.8,
  calibOffsetX: 1.0,
  calibOffsetY: -0.5,
  calibOffsetZ: 2.0,
  calibYawDegrees: 15
});

// Since grounded is true and landmarks.hips.y is 2.0:
// worldTranslation.y = (currentHipsY * scale) + offsetY - 1.0 * scale
// = (2.0 * 0.8) - 0.5 - 1.0 * 0.8 = 1.6 - 0.5 - 0.8 = 0.3
// worldTranslation.x = 10 * 0.8 + 1.0 = 9.0
// worldTranslation.z = 20 * 0.8 + 2.0 = 18.0
// With rootScale = 0.1, hips_position pos = [9.0 * 0.1, 0.3 * 0.1, 18.0 * 0.1] = [0.9, 0.03, 1.8]
assert.ok(Math.abs(calibFusion.hips_position[0].pos[0] - 0.9) < 1e-6);
assert.ok(Math.abs(calibFusion.hips_position[0].pos[1] - 0.03) < 1e-6);
assert.ok(Math.abs(calibFusion.hips_position[0].pos[2] - 1.8) < 1e-6);

// bodyYawDegrees = raw (30) + yawOffset (15) + sourceOffset (0 for fixture) = 45
assert.ok(Math.abs(calibFusion.body_orientation.worldYawDegrees - 45) < 1e-6);

console.log('PASS test_alicia_world_motion_fusion');
