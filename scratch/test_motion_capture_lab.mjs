import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportMotionClip } from '../js/MotionClipExporter.js';

const html = readFileSync('motion_capture_lab.html', 'utf8');
const forbiddenSceneAdapter = ['Scene', 'ObjectAdapter'].join('');
const forbiddenMoveTo = ['mascot', 'moveTo'].join('.');

const requiredIds = [
  'captureSourceType',
  'captureVideoInput',
  'captureWebcamButton',
  'captureSkeletonJsonInput',
  'captureVrmaInput',
  'btnLoadSampleSkeleton',
  'captureStatus',
  'videoPreview',
  'skeletonPreviewCanvas',
  'cycleStartMs',
  'cycleEndMs',
  'btnSeedCyclePhases',
  'phase_contact_left',
  'phase_down_left',
  'phase_passing_left',
  'phase_up_left',
  'phase_contact_right',
  'phase_down_right',
  'phase_passing_right',
  'phase_up_right',
  'aliciaPreview',
  'btnPreviewWalkCycle',
  'btnExportMotionClip',
  'motionClipOutput'
];

for (const id of requiredIds) {
  assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
}

const requiredImports = [
  './js/MotionCaptureTypes.js',
  './js/SkeletonSequenceAdapter.js',
  './js/PoseEstimatorAdapters.js',
  './js/MotionCycleDetector.js',
  './js/MotionClipExporter.js',
  './js/AliciaMotionPreviewAdapter.js',
  './js/VrmMascot.js'
];

for (const specifier of requiredImports) {
  assert.ok(html.includes(specifier), `missing import ${specifier}`);
}

assert.match(html, /fetch\('motions\/capture_samples\/walk_reference_001\.json'\)/);
assert.match(html, /adapter\.loadFromText/);
assert.match(html, /detector\.seedEvenWalkPhases/);
assert.match(html, /exportMotionClip/);
assert.match(html, /previewAdapter\.previewClip/);
assert.match(html, /<script src="vendor\/three\.min\.js"><\/script>/);
assert.match(html, /<script src="vendor\/GLTFLoader\.js"><\/script>/);
assert.match(html, /<script src="vendor\/OrbitControls\.js"><\/script>/);
assert.match(html, /<script src="vendor\/three-vrm\.min\.js"><\/script>/);
assert.doesNotMatch(html, /import\s*\{\s*VrmMascot\s*\}\s*from\s*['"]\.\/js\/VrmMascot\.js['"]/);
assert.match(html, /await import\('\.\/js\/VrmMascot\.js'\)/);
assert.match(html, /const DEFAULT_VRM_MODEL_URL = 'models\/mascot\.vrm'/);
assert.match(html, /checkModelAvailable\(DEFAULT_VRM_MODEL_URL\)/);
assert.ok(
  html.indexOf('checkModelAvailable(DEFAULT_VRM_MODEL_URL)') <
    html.indexOf("await import('./js/VrmMascot.js')"),
  'model availability must be checked before dynamic VrmMascot import'
);
assert.match(html, /new VrmMascot\(\$\('aliciaPreview'\),\s*\{\s*orbitControls:\s*true,\s*grid:\s*true\s*\}\)/);
assert.doesNotMatch(html, /new VrmMascot\(\{\s*container/);
assert.match(html, /\.load\(DEFAULT_VRM_MODEL_URL\)/);
assert.match(html, /btnPreviewWalkCycle'\)\.disabled = true/);
assert.match(html, /local model \$\{DEFAULT_VRM_MODEL_URL\} not found\. Skeleton JSON export remains usable\./);
assert.match(html, /if \(!state\.mascot \|\| \$\('btnPreviewWalkCycle'\)\.disabled\)/);
assert.match(html, /URL\.revokeObjectURL/);
assert.match(html, /input\.value\.trim\(\) === ''/);
assert.doesNotMatch(html, new RegExp(forbiddenMoveTo.replace('.', '\\.')));
assert.doesNotMatch(html, new RegExp(forbiddenSceneAdapter));
assert.doesNotMatch(html, /body\s*\{[^}]*overflow:\s*auto/i);
assert.doesNotMatch(html, /html,\s*body\s*\{[^}]*height:\s*auto/i);
assert.doesNotMatch(html, /grid-template-columns:\s*1fr\b/i);
assert.doesNotMatch(html, /overflow:\s*visible/i);

const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const loadResult = adapter.loadFromText(
  readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8')
);
assert.equal(loadResult.ok, true);

const detector = new MotionCycleDetector();
assert.equal(detector.setLoopRange(0, 960).ok, true);
assert.equal(detector.seedEvenWalkPhases(loadResult.sequence).ok, true);

const clip = exportMotionClip({
  id: 'walk_cycle_001',
  label: 'Walk Cycle 001',
  sequence: loadResult.sequence,
  detector,
  source: {
    type: 'skeleton_json',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'walk_reference_001'
  }
});
assert.equal(clip.kind, 'motion_clip_v1');
assert.equal(clip.keyPoses.length, 8);
assert.equal(clip.phases.contact_left.timeMs, 0);

console.log('PASS test_motion_capture_lab');
