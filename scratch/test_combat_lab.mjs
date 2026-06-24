import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const LAB_PATH = 'combat_lab.html';
assert.ok(existsSync(LAB_PATH), 'combat_lab.html file must exist');

const html = readFileSync(LAB_PATH, 'utf8');

// Verify vendor libraries loading via import map CDN URLs
for (const cdn of [
  'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3/lib/three-vrm.module.js',
  'https://cdn.jsdelivr.net/npm/@pixiv/three-vrm-animation@3/lib/three-vrm-animation.module.js'
]) {
  assert.match(html, new RegExp(cdn.replaceAll('/', '\\/').replaceAll('.', '\\.')), `must import ${cdn}`);
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
  'muzzleZ',
  'btnSpawnTarget',
  'btnClearTargets',
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
assert.match(html, /手動生成 3D 目標球/);

// Verify core VRM loading and raycasting
assert.match(html, /new VRMLoaderPlugin/);
assert.match(html, /loader\.loadAsync\(/);
assert.match(html, /THREE\.Raycaster\(\)/);
assert.match(html, /raycaster\.intersectObjects\(/);

console.log('PASS test_combat_lab');
