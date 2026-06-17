import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PACK_PATH = join('examples', 'm6_7_vrma_samples', 'review', 'showcase_motion_pack.json');
const EVENTS_PATH = join('examples', 'm6_7_vrma_samples', 'review', 'showcase_events.json');
const REPORT_PATH = join('examples', 'm6_7_vrma_samples', 'review', 'showcase_motion_pack_report.md');
const GENERATOR_PATH = join('scratch', 'generate_showcase_pack.mjs');
const DEMO_PATH = 'demo.php';
const VRM_MASCOT_PATH = join('js', 'VrmMascot.js');
const MOTION_CONTROLLER_PATH = join('js', 'MotionController.js');

const REQUIRED_SEMANTIC_MOTIONS = [
  'angry_hands_waist',
  'come_here',
  'cross_no',
  'hands_up_surrender',
  'look_around',
  'point_target',
  'shy_head_touch',
  'thinking_chin',
  'victory_pose',
  'wave_goodbye',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function testGeneratorExistsAndIsDeterministic() {
  assert.equal(existsSync(GENERATOR_PATH), true, 'generator should exist');
  const beforePack = readFileSync(PACK_PATH, 'utf8').replace(/\r\n/g, '\n');
  const beforeEvents = readFileSync(EVENTS_PATH, 'utf8').replace(/\r\n/g, '\n');
  const result = spawnSync('node', [GENERATOR_PATH], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `generator should pass\n${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(PACK_PATH, 'utf8').replace(/\r\n/g, '\n'), beforePack, 'pack export should be deterministic');
  assert.equal(readFileSync(EVENTS_PATH, 'utf8').replace(/\r\n/g, '\n'), beforeEvents, 'event export should be deterministic');
}

function testShowcasePackUsesMinedDescriptions() {
  const pack = readJson(PACK_PATH);
  assert.equal(pack.schemaVersion, 1);
  assert.equal(pack.phase, 'v0.1.2 Alicia Showcase Pack');
  assert.ok(pack.summary.totalSelectedMotions >= 20, 'showcase should select enough motions');
  assert.ok(pack.summary.researchPreviewCount > 0, 'showcase should include mined research preview motions');
  assert.equal(pack.motions.length, pack.summary.totalSelectedMotions);

  const semanticIds = new Set(pack.motions.map((motion) => motion.semanticMotionId));
  for (const id of REQUIRED_SEMANTIC_MOTIONS) {
    assert.ok(semanticIds.has(id), `showcase should cover ${id}`);
  }

  for (const motion of pack.motions) {
    assert.match(motion.releasePath, /^motions\/showcase\/.+\.vrma$/);
    assert.equal(typeof motion.description, 'string');
    assert.ok(motion.description.length > 0);
    assert.equal(typeof motion.usageDescription, 'string');
    assert.ok(motion.usageDescription.length > 0);
    assert.ok(Array.isArray(motion.agentUsage));
    assert.ok(motion.agentUsage.length > 0);
    assert.ok(['approved', 'research_preview'].includes(motion.licenseStatus));
  }
}

function testShowcaseEventsAreRuntimeFriendly() {
  const pack = readJson(PACK_PATH);
  const events = readJson(EVENTS_PATH);
  const packSources = new Set(pack.motions.map((motion) => motion.sourceMotion));

  assert.equal(events.schemaVersion, 1);
  assert.equal(events.phase, 'v0.1.2 Alicia Showcase Events');
  assert.equal(events.events.length, pack.motions.length);

  for (const event of events.events) {
    assert.ok(packSources.has(event.sourceMotion), `${event.sourceMotion} should exist in pack`);
    assert.equal(typeof event.text, 'string');
    assert.match(event.text, /我從 .+ 挖到這個/);
    assert.ok(event.text.includes(event.sourceMotion));
    assert.equal(typeof event.intent, 'string');
    assert.equal(typeof event.motion, 'string');
    assert.equal(typeof event.animation, 'string');
    assert.ok(event.semanticMotionId);
    assert.ok(event.minedDescription);
    assert.ok(event.usageDescription);
  }
}

function testReportExists() {
  assert.equal(existsSync(REPORT_PATH), true, 'showcase report should exist');
  const report = readFileSync(REPORT_PATH, 'utf8');
  assert.match(report, /Alicia Showcase Pack Report/);
  assert.match(report, /Research preview motions/);
}

function testDemoPrefersShowcaseEvents() {
  assert.equal(existsSync(DEMO_PATH), true, 'release demo page should exist');
  const demo = readFileSync(DEMO_PATH, 'utf8');
  assert.match(demo, /showcase_events\.json/);
  assert.match(demo, /showcaseEvents\.length > 0/);
  assert.match(demo, /showcase_motion_pack/);
}

function testDemoPropsUseSharedThreeScene() {
  const demo = readFileSync(DEMO_PATH, 'utf8');
  const mascot = readFileSync(VRM_MASCOT_PATH, 'utf8');
  const pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));
  const showcaseAssetPaths = pack.motions
    .map((motion) => motion?.releasePath)
    .filter(Boolean);

  assert.match(mascot, /getSceneContext\(\)/);
  assert.match(mascot, /addSceneObject\(object3d\)/);
  assert.match(mascot, /removeSceneObject\(object3d\)/);
  assert.match(demo, /this\.usesMascotScene = !!\(sceneContext\?\.scene && typeof mascot\?\.addSceneObject === 'function'\)/);
  assert.match(demo, /this\.mascot\.addSceneObject\(this\.sceneRoot\)/);
  assert.match(demo, /data-scene-mode="shared"/);
  assert.match(demo, /#alicia-stage\[data-scene-mode="shared"\] \.toy-card small/);
  assert.ok(
    showcaseAssetPaths.some((assetPath) => assetPath.startsWith('motions/showcase/')),
    'showcase pack should point to bundled showcase assets'
  );
}

function testDemoStagesPhysicalContactAndGaze() {
  const demo = readFileSync(DEMO_PATH, 'utf8').replace(/\r\n/g, '\n');
  const motionController = readFileSync(MOTION_CONTROLLER_PATH, 'utf8');
  const crouchBlock = demo.match(/crouch_touch:\s*{([\s\S]*?)\n\s*},\n\s*kick_forward:/)?.[1] || '';
  const hipsY = [...crouchBlock.matchAll(/pos:\s*\[[^,\]]+,\s*([^,\]]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const riskyLegRotations = [...crouchBlock.matchAll(/(?:left|right)(?:Upper|Lower)Leg:\s*\[[^\n]+/g)]
    .flatMap((match) => [...match[0].matchAll(/x:\s*(-?\d+)/g)].map((value) => Number(value[1])))
    .filter(Number.isFinite);
  const spineBend = [...(crouchBlock.match(/spine:\s*\[[^\n]+/)?.[0] || '').matchAll(/x:\s*(-?\d+)/g)]
    .map((value) => Number(value[1]))
    .filter(Number.isFinite);
  const chestBend = [...(crouchBlock.match(/chest:\s*\[[^\n]+/)?.[0] || '').matchAll(/x:\s*(-?\d+)/g)]
    .map((value) => Number(value[1]))
    .filter(Number.isFinite);

  assert.match(demo, /crouch_touch/);
  assert.match(demo, /hipsPosition:\s*\[/);
  assert.ok(Math.min(...hipsY) <= -0.22, 'crouch_touch should visibly lower Alicia, not just bend slightly');
  assert.ok(Math.min(...spineBend) < 0, 'crouch_touch spine should bend forward, not arch backward');
  assert.ok(Math.min(...chestBend) < 0, 'crouch_touch chest should bend forward, not arch backward');
  assert.ok(Math.min(...spineBend) <= -45, 'crouch_touch should lean far enough forward to read as picking up');
  assert.ok(Math.min(...chestBend) <= -28, 'crouch_touch chest should support the forward pickup bend');
  assert.ok(
    riskyLegRotations.every((value) => Math.abs(value) <= 24),
    'crouch_touch must not use large leg rotations without IK / foot locking'
  );
  assert.match(demo, /nudgeContact\(event = \{\}, propLayer = null\)/);
  assert.match(demo, /getPropWorldPosition\(name\)/);
  assert.match(demo, /getLookAtPoint\(name, fallback/);
  assert.match(demo, /class GazeDirector/);
  assert.match(demo, /mouseOverrideUntil = performance\.now\(\) \+ 1150/);
  assert.match(demo, /gazeDirector\.focusEvent\(event\)/);
  assert.match(demo, /aliciaGazeDirector\?\.handleMouseMove/);
  assert.match(demo, /waitForSceneRoot\(timeoutMs = 1600\)/);
  assert.match(demo, /walker\.reset\(\{ instant: true \}\)/);
  assert.match(demo, /shortestAngleDelta\(from, to\)/);
  assert.match(demo, /facingRotationFor\(fromX, fromZ, toX, toZ\)/);
  assert.match(demo, /async moveTo\(target = \{\}, options = \{\}\)/);
  assert.match(demo, /const faceWorld = this\.propLayer\?\.getPropWorldPosition\?\.\(event\.prop\) \|\| null/);
  assert.match(demo, /forceWalk:\s*Boolean\(event\.walkTo\)/);
  assert.match(demo, /this\.rootBaseRotationY \+ Math\.atan2\(dx, dz\)/);
  assert.match(demo, /walkRotationY/);
  assert.match(demo, /finalRotationY/);
  assert.match(demo, /options\.forceWalk === true/);
  assert.match(demo, /duration = Math\.max\(850, Math\.min\(2400, duration\)\)/);
  assert.match(demo, /this\.shortestAngleDelta\(from\.rotationY, to\.walkRotationY\)/);
  assert.match(demo, /this\.shortestAngleDelta\(walkFacing, to\.rotationY\)/);
  assert.match(demo, /const moveT = isWalking \? this\.clamp\(\(p - 0\.18\) \/ 0\.72, 0, 1\) : ease\(p\)/);
  assert.match(demo, /const walkTurnT = isWalking \? \(1 - Math\.pow\(1 - this\.clamp\(p \/ 0\.24, 0, 1\), 3\)\) : moveT/);
  assert.match(demo, /const finalTurnT = isWalking \? \(1 - Math\.pow\(1 - this\.clamp\(\(p - 0\.72\) \/ 0\.28, 0, 1\), 3\)\) : 1/);
  assert.match(demo, /const noAutoDirector = query\.has\('noAuto'\) \|\| query\.has\('manual'\)/);
  assert.match(demo, /auto director disabled by query flag/);
  assert.match(motionController, /async preloadVrmaForName\(name\)/);
  assert.match(motionController, /preloadOnly:\s*true/);
  assert.doesNotMatch(demo, /preloadVrmaForName\?\.\('walk_cycle'\)/);
  assert.match(demo, /await this\.mascot\.motion\?\.play\?\.\('walk_cycle'\)/);
  assert.match(demo, /await this\.walker\.moveTo\(event\.walkTo/);
  assert.match(demo, /this\.mascot\.dispatch\?\.\('talking'/);
  assert.doesNotMatch(demo, /this\.mascot\.performIntent\(\{[\s\S]*?motion:\s*event\.motion/);
  assert.match(demo, /sceneAction} \$\{event\.prop\}\$\{contact \? ' \+ contact' : ''\}/);
  assert.doesNotMatch(demo, /const vrmaMap = \{/);
  assert.doesNotMatch(demo, /playVrmaFile\(resolvedUrl/);
  assert.match(demo, /buildCustomAnimation\(name, this\.mascot\)/);
}

function testDemoAliciaScenePlaygroundIntegration() {
  const demo = readFileSync(DEMO_PATH, 'utf8');
  const mascot = readFileSync(join('js', 'VrmMascot.js'), 'utf8');
  const motionController = readFileSync(join('js', 'MotionController.js'), 'utf8');

  // Verify imports and humanization level 4 setup
  assert.match(demo, /import\s*{\s*AutoDirectorLite\s*}\s*from\s*['"]\.\/js\/AutoDirectorLite\.js['"]/);
  assert.match(demo, /enableHumanization\?\.\({\s*profile:\s*['"]alicia['"],\s*level:\s*4\s*}\)/);
  assert.match(demo, /new\s+AutoDirectorLite\(/);

  // Verify birthday cake prop and placement
  assert.match(demo, /birthdayCake:\s*{\s*position:\s*\[0,\s*-0\.92,\s*0\.8\],\s*scale:\s*0\.3/);
  assert.match(demo, /birthdayCake:\s*{\s*position:\s*\[0,\s*-1\.38,\s*0\.7\],\s*scale:\s*0\.6/);
  assert.match(demo, /#createBirthdayCake\(\)/);

  // Verify candle flame wobble animation
  assert.match(demo, /name\s*===\s*['"]birthdayCake['"]/);
  assert.match(demo, /getObjectByName\(['"]Flame['"]\)/);
  assert.match(demo, /flame\.scale\.set/);

  // Verify cake event and custom sequence handling
  assert.match(demo, /topic:\s*['"]cake['"]/);
  assert.match(demo, /event\.topic\s*===\s*['"]cake['"]/);
  assert.match(demo, /triggerGesture\?\.\(['"]touch_face['"]\)/);
  assert.match(demo, /triggerGesture\?\.\(['"]stretch['"]\)/);

  // Ensure no production defaults changed
  assert.doesNotMatch(mascot, /enableHumanization\s*\([^)]*level:\s*4/);
  assert.doesNotMatch(motionController, /enableHumanization\s*\([^)]*level:\s*4/);
}


async function run() {
  const tests = [
    testGeneratorExistsAndIsDeterministic,
    testShowcasePackUsesMinedDescriptions,
    testShowcaseEventsAreRuntimeFriendly,
    testReportExists,
    testDemoPrefersShowcaseEvents,
    testDemoPropsUseSharedThreeScene,
    testDemoStagesPhysicalContactAndGaze,
    testDemoAliciaScenePlaygroundIntegration,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
