import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const LAB_PATH = 'combat_lab.html';
assert.ok(existsSync(LAB_PATH), 'combat_lab.html file must exist');

const html = readFileSync(LAB_PATH, 'utf8');

// Verify vendor libraries loading
for (const vendor of [
  'vendor/three.min.js',
  'vendor/GLTFLoader.js',
  'vendor/OrbitControls.js',
  'vendor/three-vrm.min.js'
]) {
  assert.match(html, new RegExp(`src="${vendor.replaceAll('/', '\\/')}"`), `must load ${vendor}`);
}

// Verify critical DOM elements by ID
for (const id of [
  'weaponSelect',
  'offsetX',
  'offsetY',
  'offsetZ',
  'rotX',
  'rotY',
  'rotZ',
  'scale',
  'showHelper',
  'btnSaveOffset',
  'btnResetOffset',
  'viewportContainer',
  'viewport',
  'crosshair',
  'statusBar',
  'statShots',
  'statHits',
  'statAccuracy',
  'btnResetStats',
  'poseModeSelect',
  'muzzleZ',
  'btnSpawnTarget',
  'btnClearTargets',
  'animateTargets',
  'muteAudio'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `must have element with id="${id}"`);
}

// Verify important text labels
assert.match(html, /Alicia 戰鬥持槍與射擊實驗室/);
assert.match(html, /平移偏移量/);
assert.match(html, /旋轉偏移量/);
assert.match(html, /模型縮放/);
assert.match(html, /槍口發射偏置/);
assert.match(html, /目標球控制/);

// Verify core VrmMascot instantiation and handlers
assert.match(html, /new VrmMascot\(/);
assert.match(html, /mascot\.load\(/);
assert.match(html, /_getBoneNode\('rightHand'\)/);
assert.match(html, /getSceneContext\(\)/);
assert.match(html, /THREE\.Raycaster\(\)/);
assert.match(html, /raycaster\.intersectObjects\(/);

console.log('PASS test_combat_lab');
