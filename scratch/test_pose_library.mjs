import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MotionController } from '../js/MotionController.js';

const MANIFEST_PATH = 'motions/poses/pose_library_manifest.json';
const SEED_POSE_PATH = 'motions/poses/standing/stand_relaxed_001.json';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function testManifestSchemaAndDeterminism() {
  assert.ok(existsSync(MANIFEST_PATH), 'manifest file must exist');
  const manifest = readJson(MANIFEST_PATH);

  assert.equal(manifest.schemaVersion, 1, 'manifest schemaVersion must be 1');
  assert.ok(manifest.poses, 'manifest must contain poses key');

  const poses = manifest.poses;
  assert.ok(poses.stand_relaxed_001, 'manifest must contain stand_relaxed_001 entry');

  const seed = poses.stand_relaxed_001;
  assert.equal(seed.id, 'stand_relaxed_001');
  assert.equal(seed.category, 'standing');
  assert.equal(seed.label, '自然站姿');
  assert.equal(seed.model, 'AliciaSolid');
  assert.equal(seed.path, 'motions/poses/standing/stand_relaxed_001.json');
  assert.equal(seed.humanization.profile, 'alicia');
  assert.equal(seed.humanization.level, 2);
  assert.equal(seed.qa.balance, 5);
  assert.equal(seed.qa.silhouette, 5);
  assert.equal(seed.qa.noTpose, true);
  assert.equal(seed.qa.noArmCrossBody, true);
}

function testSeedPoseFileCompliance() {
  assert.ok(existsSync(SEED_POSE_PATH), 'seed pose file must exist');
  const pose = readJson(SEED_POSE_PATH);

  assert.equal(pose.schemaVersion, 1);
  assert.equal(pose.id, 'stand_relaxed_001');
  assert.equal(pose.category, 'standing');
  assert.equal(pose.label, '自然站姿');
  assert.equal(pose.model, 'AliciaSolid');

  // basePose validations
  assert.ok(pose.basePose, 'must have basePose');
  assert.ok(pose.basePose.rotation, 'must have basePose.rotation');
  assert.ok(pose.basePose.position, 'must have basePose.position');
  assert.ok(pose.basePose.rotation.spine, 'must have spine rotation');
  assert.ok(pose.basePose.position.hips, 'must have hips position');

  // humanization
  assert.equal(pose.humanization.profile, 'alicia');
  assert.equal(pose.humanization.level, 2);

  // QA
  assert.equal(pose.qa.balance, 5);
  assert.equal(pose.qa.silhouette, 5);
  assert.equal(pose.qa.noTpose, true);
  assert.equal(pose.qa.noArmCrossBody, true);

  // Runtime QA
  assert.equal(pose.runtimeQa.transitionScore, 0);
  assert.equal(pose.runtimeQa.idleCompatibility, true);
  assert.equal(pose.runtimeQa.clipCompatibility, true);
  assert.equal(pose.runtimeQa.vrmaCompatibility, true);

  // Source
  assert.equal(pose.source.type, 'manual');
  assert.equal(pose.source.tool, 'pose_training_lab');
}

function testPoseEntryCompatibilityWithMotionController() {
  const pose = readJson(SEED_POSE_PATH);
  const controller = new MotionController();

  // test loading preset directly
  const preset = controller.loadPosePreset(pose);
  assert.ok(preset, 'controller should successfully load the pose preset');
  assert.equal(preset.model, 'AliciaSolid');
  assert.deepEqual(preset.basePose.rotation.spine, { x: 2, y: 0, z: -2 });
  assert.deepEqual(preset.basePose.position.hips, { x: -0.014, y: 0, z: 0.004 });

  // test resetToNaturalPose after load
  assert.doesNotThrow(() => controller.resetToNaturalPose(0));
}

function run() {
  console.log('Running test_pose_library.mjs...');
  testManifestSchemaAndDeterminism();
  testSeedPoseFileCompliance();
  testPoseEntryCompatibilityWithMotionController();
  console.log('test_pose_library: ok');
}

run();
