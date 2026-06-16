# Phase M6.7 Motion Template Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VRMA-first developer lab that samples upper-body pose templates and exports deterministic NaturalPose preset JSON for Alicia.

**Architecture:** Keep VRMA loading isolated in `motion_template_lab.html`. Put deterministic preset-building logic in a small pure ES module so standalone Node tests can verify whitelist, rounding, base-pose merge, and repeatable JSON export. Do not touch Agent Runtime, ActingBridge, ActionQueue, or the main mascot page.

**Tech Stack:** Static HTML, ES modules, Three.js, `@pixiv/three-vrm`, `@pixiv/three-vrm-animation`, existing `MotionController.loadPosePreset()` schema, standalone Node tests.

---

## Scope

This plan implements the approved spec:

```text
docs/superpowers/specs/2026-06-13-m6-7-motion-template-importer-design.md
```

The key acceptance gate is deterministic export:

```text
same VRMA sample + same timestamp + same base preset
  -> same NaturalPosePreset JSON
```

M6.7 does not write `generatedAt`, random ids, current time, or any browser-session-specific values into exported JSON. If future metadata fields become non-deterministic, they must be explicitly listed and excluded by tests. In M6.7, exact JSON equality is required for repeated export with identical inputs.

## File Structure

- Create: `js/MotionTemplateImporter.js`
  - Pure helper module.
  - Owns upper-body bone whitelist.
  - Owns degree rounding.
  - Owns deterministic merge into NaturalPose preset schema.
  - Owns stable JSON stringification.
  - No DOM, no Three.js import, no VRM runtime dependency.

- Create: `motion_template_lab.html`
  - Developer UI for loading Alicia and a local `.vrma`.
  - Uses isolated CDN imports for modern `three-vrm` / `three-vrm-animation`.
  - Calls `MotionTemplateImporter.js` to build export JSON.
  - Does not import production runtime modules except the pure importer helper.

- Create: `scratch/test_motion_template_importer.mjs`
  - Standalone Node tests for helper logic and HTML contract.
  - Verifies deterministic export.
  - Verifies Chinese UI labels and runtime isolation.

- Modify: `README.md`
  - Add one short developer-tool note and URL for the lab.
  - Do not describe it as production runtime behavior.

No changes:

- `js/VrmMascot.js`
- `js/MotionController.js`
- `js/ActionQueue.js`
- `js/ActingBridge.js`
- `js/ActingPolicy.js`
- `js/PoseDirector.js`
- `index.html`

---

### Task 1: Add Failing Motion Template Importer Tests

**Files:**
- Create: `scratch/test_motion_template_importer.mjs`

- [ ] **Step 1: Create the standalone test file**

Create `scratch/test_motion_template_importer.mjs` with this content:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPEC_PATH = 'docs/superpowers/specs/2026-06-13-m6-7-motion-template-importer-design.md';
const LAB_PATH = 'motion_template_lab.html';
const MODULE_PATH = 'js/MotionTemplateImporter.js';
const INDEX_PATH = 'index.html';

function read(path) {
  return readFileSync(path, 'utf8');
}

async function importImporterModule() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function testSpecRequiresDeterministicExport() {
  const spec = read(SPEC_PATH);

  assert.match(spec, /deterministic/i);
  assert.match(spec, /same VRMA sample|同一份 VRMA|Exporting the same VRMA sample/i);
  assert.match(spec, /JSON differences are not allowed|JSON 差異/i);
}

function testLabHtmlContractExists() {
  assert.equal(existsSync(LAB_PATH), true, `${LAB_PATH} should exist`);

  const html = read(LAB_PATH);
  assert.match(html, /Motion Template Lab/);
  assert.match(html, /VRMA-first Pose Importer/);
  assert.match(html, /載入 VRMA/);
  assert.match(html, /取第一幀/);
  assert.match(html, /取指定時間/);
  assert.match(html, /複製 JSON/);
  assert.match(html, /下載 JSON/);
  assert.match(html, /匯出 NaturalPosePreset/);
  assert.match(html, /Upper Body/);
  assert.match(html, /motion-template-json/);
}

function testLabReferencesVrmaCapabilityOnlyInLab() {
  const html = read(LAB_PATH);
  const index = read(INDEX_PATH);

  assert.match(html, /@pixiv\/three-vrm-animation/);
  assert.match(html, /VRMAnimationLoaderPlugin/);
  assert.match(html, /createVRMAnimationClip/);
  assert.doesNotMatch(index, /motion_template_lab|three-vrm-animation|VRMAnimationLoaderPlugin/);
}

function testLabDoesNotImportAgentRuntime() {
  const html = read(LAB_PATH);

  assert.doesNotMatch(html, /ActionQueue/);
  assert.doesNotMatch(html, /ActingBridge/);
  assert.doesNotMatch(html, /ActingPolicy/);
  assert.doesNotMatch(html, /PoseDirector/);
  assert.doesNotMatch(html, /contextDigest/);
  assert.doesNotMatch(html, /performIntent/);
}

async function testUpperBodyWhitelistIsExplicitAndStable() {
  const mod = await importImporterModule();

  assert.deepEqual(mod.UPPER_BODY_BONES, [
    'spine',
    'chest',
    'leftShoulder',
    'rightShoulder',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
  ]);

  assert.equal(mod.UPPER_BODY_BONES.includes('head'), false);
  assert.equal(mod.UPPER_BODY_BONES.includes('hips'), false);
  assert.equal(mod.UPPER_BODY_BONES.includes('leftUpperLeg'), false);
}

async function testBuildNaturalPosePresetMergesUpperBodyOnly() {
  const {
    buildNaturalPosePreset,
  } = await importImporterModule();

  const basePreset = {
    model: 'AliciaSolid',
    basePose: {
      rotation: {
        leftUpperLeg: { x: 1, y: 0, z: 2 },
        rightUpperLeg: { x: -1, y: 0, z: -2 },
        leftUpperArm: { x: 9, y: -3, z: 54 },
      },
      position: {
        hips: { x: -0.014, y: 0, z: 0.004 },
      },
    },
  };

  const preset = buildNaturalPosePreset({
    basePreset,
    rotations: {
      leftUpperArm: { x: 12.345, y: -2.222, z: 43.333 },
      rightUpperArm: { x: 10, y: 2, z: -43 },
      head: { x: 99, y: 99, z: 99 },
      hips: { x: 88, y: 88, z: 88 },
    },
    source: {
      type: 'vrma',
      fileName: 'stand.vrma',
      sampleTime: 0,
    },
    warnings: [],
  });

  assert.deepEqual(preset.basePose.rotation.leftUpperArm, { x: 12.35, y: -2.22, z: 43.33 });
  assert.deepEqual(preset.basePose.rotation.rightUpperArm, { x: 10, y: 2, z: -43 });
  assert.deepEqual(preset.basePose.rotation.leftUpperLeg, { x: 1, y: 0, z: 2 });
  assert.deepEqual(preset.basePose.rotation.rightUpperLeg, { x: -1, y: 0, z: -2 });
  assert.equal(preset.basePose.rotation.head, undefined);
  assert.deepEqual(preset.basePose.position.hips, { x: -0.014, y: 0, z: 0.004 });
}

async function testStableExportIsDeterministic() {
  const {
    buildNaturalPosePreset,
    stableStringifyPreset,
  } = await importImporterModule();

  const basePreset = {
    model: 'AliciaSolid',
    basePose: {
      rotation: {
        chest: { x: -2, y: -2, z: -1 },
        leftUpperArm: { x: 9, y: -3, z: 54 },
        rightUpperArm: { x: 9, y: 3, z: -54 },
      },
      position: {
        hips: { x: -0.014, y: 0, z: 0.004 },
      },
    },
  };

  const rotationsA = {
    rightUpperArm: { z: -42.7777, x: 7.1111, y: 3.2222 },
    leftUpperArm: { y: -3.2222, z: 42.7777, x: 7.1111 },
    chest: { z: -0.5555, y: -1.2222, x: -2.7777 },
  };

  const rotationsB = {
    chest: { x: -2.7777, y: -1.2222, z: -0.5555 },
    leftUpperArm: { x: 7.1111, y: -3.2222, z: 42.7777 },
    rightUpperArm: { x: 7.1111, y: 3.2222, z: -42.7777 },
  };

  const source = {
    type: 'vrma',
    fileName: 'girl_stand.vrma',
    sampleTime: 0.25,
  };

  const first = stableStringifyPreset(buildNaturalPosePreset({
    basePreset,
    rotations: rotationsA,
    source,
    warnings: ['missing leftHand'],
  }));

  const second = stableStringifyPreset(buildNaturalPosePreset({
    basePreset,
    rotations: rotationsB,
    source,
    warnings: ['missing leftHand'],
  }));

  assert.equal(first, second);
  assert.match(first, /"sampleTime": 0.25/);
  assert.doesNotMatch(first, /generatedAt|Date|exportSessionId|Math\.random/);
}

async function testClampSampleTime() {
  const { clampSampleTime } = await importImporterModule();

  assert.equal(clampSampleTime(-1, 2), 0);
  assert.equal(clampSampleTime(3, 2), 2);
  assert.equal(clampSampleTime(1.23456, 2), 1.23456);
  assert.equal(clampSampleTime(Number.NaN, 2), 0);
}

async function run() {
  const tests = [
    testSpecRequiresDeterministicExport,
    testLabHtmlContractExists,
    testLabReferencesVrmaCapabilityOnlyInLab,
    testLabDoesNotImportAgentRuntime,
    testUpperBodyWhitelistIsExplicitAndStable,
    testBuildNaturalPosePresetMergesUpperBodyOnly,
    testStableExportIsDeterministic,
    testClampSampleTime,
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
```

Expected:

```text
AssertionError ... motion_template_lab.html should exist
```

- [ ] **Step 3: Commit the failing test**

Run:

```powershell
git add .\scratch\test_motion_template_importer.mjs
git commit -m "test: add motion template importer contract"
```

---

### Task 2: Implement Deterministic Importer Core

**Files:**
- Create: `js/MotionTemplateImporter.js`
- Test: `scratch/test_motion_template_importer.mjs`

- [ ] **Step 1: Create the pure importer module**

Create `js/MotionTemplateImporter.js` with this content:

```js
export const UPPER_BODY_BONES = Object.freeze([
  'spine',
  'chest',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
]);

export const DEFAULT_EXPORT_PRECISION = 2;

const UPPER_BODY_BONE_SET = new Set(UPPER_BODY_BONES);

export function clampSampleTime(value, duration = 0) {
  const numeric = Number(value);
  const max = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric >= max) return max;
  return numeric;
}

export function roundDegrees(value, precision = DEFAULT_EXPORT_PRECISION) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  const rounded = Math.round((numeric + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeRotation(rotation = {}, precision = DEFAULT_EXPORT_PRECISION) {
  return {
    x: roundDegrees(rotation.x, precision),
    y: roundDegrees(rotation.y, precision),
    z: roundDegrees(rotation.z, precision),
  };
}

export function normalizeRotationMap(rotations = {}, precision = DEFAULT_EXPORT_PRECISION) {
  const result = {};

  for (const bone of UPPER_BODY_BONES) {
    if (!Object.prototype.hasOwnProperty.call(rotations, bone)) continue;
    result[bone] = normalizeRotation(rotations[bone], precision);
  }

  return result;
}

export function buildNaturalPosePreset({
  basePreset = {},
  rotations = {},
  source = {},
  warnings = [],
  precision = DEFAULT_EXPORT_PRECISION,
} = {}) {
  const basePose = basePreset.basePose || {};
  const baseRotation = basePose.rotation || {};
  const basePosition = basePose.position || {};
  const importedRotations = normalizeRotationMap(rotations, precision);
  const mergedRotation = {};

  for (const bone of Object.keys(baseRotation).sort()) {
    if (UPPER_BODY_BONE_SET.has(bone) && importedRotations[bone]) {
      continue;
    }
    mergedRotation[bone] = normalizeRotation(baseRotation[bone], precision);
  }

  for (const bone of UPPER_BODY_BONES) {
    if (!importedRotations[bone]) continue;
    mergedRotation[bone] = importedRotations[bone];
  }

  return sortObjectDeep({
    model: basePreset.model || 'AliciaSolid',
    source: normalizeSource(source, warnings),
    basePose: {
      rotation: mergedRotation,
      position: clonePosition(basePosition, precision),
    },
  });
}

export function stableStringifyPreset(preset) {
  return JSON.stringify(sortObjectDeep(preset), null, 2);
}

function normalizeSource(source = {}, warnings = []) {
  const normalizedWarnings = Array.from(new Set(
    (Array.isArray(warnings) ? warnings : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )).sort();

  return sortObjectDeep({
    type: String(source.type || 'vrma'),
    fileName: String(source.fileName || ''),
    sampleTime: roundDegrees(source.sampleTime || 0, 4),
    boneScope: 'upper_body',
    warnings: normalizedWarnings,
  });
}

function clonePosition(position = {}, precision = DEFAULT_EXPORT_PRECISION) {
  const result = {};

  for (const bone of Object.keys(position).sort()) {
    const value = position[bone] || {};
    result[bone] = {
      x: roundDegrees(value.x, precision + 3),
      y: roundDegrees(value.y, precision + 3),
      z: roundDegrees(value.z, precision + 3),
    };
  }

  return result;
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObjectDeep(value[key]);
      return acc;
    }, {});
}
```

- [ ] **Step 2: Run the test and verify the expected remaining failure**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
```

Expected:

```text
AssertionError ... motion_template_lab.html should exist
```

The pure importer tests should no longer be blocked by missing module import once the test reaches them in the next task.

- [ ] **Step 3: Commit the pure importer**

Run:

```powershell
git add .\js\MotionTemplateImporter.js
git commit -m "feat: add deterministic motion template importer core"
```

---

### Task 3: Build Motion Template Lab Page

**Files:**
- Create: `motion_template_lab.html`
- Test: `scratch/test_motion_template_importer.mjs`

- [ ] **Step 1: Create the lab HTML**

Create `motion_template_lab.html` with a static HTML document that contains these required elements:

```html
<title>Motion Template Lab — VRMA-first Pose Importer</title>
<main class="lab-shell">
  <section class="lab-stage" aria-label="Alicia pose preview">
    <header class="lab-header">
      <strong>Motion Template Lab</strong>
      <span>VRMA-first Pose Importer</span>
      <span id="labLoadState">載入中</span>
    </header>
    <div id="labViewport" class="lab-viewport"></div>
  </section>

  <aside class="lab-panel" aria-label="VRMA pose importer controls">
    <h1>動作範本匯入器</h1>
    <p>載入 VRMA，取樣上半身姿勢，匯出 NaturalPosePreset JSON。</p>

    <label class="lab-file">
      <span>載入 VRMA</span>
      <input id="vrmaFileInput" type="file" accept=".vrma,model/gltf-binary">
    </label>

    <div class="lab-actions">
      <button id="btnSampleFirst" type="button">取第一幀</button>
      <button id="btnSampleTime" type="button">取指定時間</button>
      <button id="btnCopyJson" type="button">複製 JSON</button>
      <button id="btnDownloadJson" type="button">下載 JSON</button>
    </div>

    <label class="lab-slider">
      <span>取樣時間</span>
      <input id="sampleTime" type="range" min="0" max="0" step="0.033" value="0">
      <output id="sampleTimeLabel">0.000s / 0.000s</output>
    </label>

    <dl class="lab-summary">
      <div><dt>來源檔案</dt><dd id="sourceFile">未載入</dd></div>
      <div><dt>動畫長度</dt><dd id="durationLabel">0.000s</dd></div>
      <div><dt>骨架範圍</dt><dd>Upper Body</dd></div>
      <div><dt>匯出骨骼</dt><dd id="exportedBoneCount">0</dd></div>
    </dl>

    <section class="lab-warning-panel">
      <h2>警告</h2>
      <ul id="warningList"></ul>
    </section>

    <section class="lab-json-panel">
      <h2>匯出 NaturalPosePreset</h2>
      <pre id="motion-template-json">{}</pre>
    </section>
  </aside>
</main>
```

Add local CSS in the same file. Keep the style close to existing dev panels:

```css
body {
  margin: 0;
  background: #07111f;
  color: #e6edf7;
  font-family: "Segoe UI", "Noto Sans TC", sans-serif;
}

.lab-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);
}

.lab-stage {
  position: relative;
  min-height: 100vh;
  background: radial-gradient(circle at 35% 30%, #19394f 0, #07111f 46%, #050a12 100%);
}

.lab-viewport {
  position: absolute;
  inset: 72px 20px 20px;
}

.lab-panel {
  overflow: auto;
  max-height: 100vh;
  padding: 24px;
  background: #101827;
  border-left: 1px solid rgba(148, 163, 184, 0.28);
}

.lab-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

button,
.lab-file {
  border: 1px solid rgba(45, 212, 191, 0.45);
  background: rgba(15, 23, 42, 0.88);
  color: #e6edf7;
  border-radius: 8px;
  padding: 10px 12px;
}

pre {
  white-space: pre-wrap;
  overflow: auto;
  max-height: 320px;
  background: #050a12;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 12px;
}

@media (max-width: 860px) {
  .lab-shell {
    grid-template-columns: 1fr;
  }

  .lab-stage {
    min-height: 58vh;
  }

  .lab-panel {
    max-height: none;
    border-left: 0;
    border-top: 1px solid rgba(148, 163, 184, 0.28);
  }
}
```

- [ ] **Step 2: Add import map and module script**

At the bottom of `motion_template_lab.html`, add this import map:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3/lib/three-vrm.module.js",
    "@pixiv/three-vrm-animation": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm-animation@3/lib/three-vrm-animation.module.js"
  }
}
</script>
```

Then add a module script with these imports:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
} from '@pixiv/three-vrm-animation';
import {
  UPPER_BODY_BONES,
  buildNaturalPosePreset,
  clampSampleTime,
  stableStringifyPreset,
} from './js/MotionTemplateImporter.js';
```

- [ ] **Step 3: Implement lab runtime state and setup**

Inside the module script, define state and setup code:

```js
const els = {
  viewport: document.getElementById('labViewport'),
  loadState: document.getElementById('labLoadState'),
  fileInput: document.getElementById('vrmaFileInput'),
  btnSampleFirst: document.getElementById('btnSampleFirst'),
  btnSampleTime: document.getElementById('btnSampleTime'),
  btnCopyJson: document.getElementById('btnCopyJson'),
  btnDownloadJson: document.getElementById('btnDownloadJson'),
  sampleTime: document.getElementById('sampleTime'),
  sampleTimeLabel: document.getElementById('sampleTimeLabel'),
  sourceFile: document.getElementById('sourceFile'),
  durationLabel: document.getElementById('durationLabel'),
  exportedBoneCount: document.getElementById('exportedBoneCount'),
  warningList: document.getElementById('warningList'),
  json: document.getElementById('motion-template-json'),
};

let renderer;
let scene;
let camera;
let controls;
let clock;
let vrm;
let mixer;
let action;
let clip;
let basePreset;
let sourceFileName = '';
let latestPreset = null;

init().catch((err) => {
  setStatus('載入失敗');
  setWarnings([`初始化失敗：${err?.message || err}`]);
  console.error(err);
});
```

Add initialization:

```js
async function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  els.viewport.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.35, 3.3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.25, 0);
  controls.enableDamping = true;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(1, 2, 2);
  scene.add(keyLight);

  clock = new THREE.Clock();
  await loadBasePreset();
  await loadAlicia();

  window.addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(render);

  bindEvents();
  setStatus('已載入 Alicia');
  renderJson(basePreset);
}
```

- [ ] **Step 4: Implement VRM and VRMA loading**

Add these functions:

```js
async function loadBasePreset() {
  const res = await fetch('motions/poses/alicia_solid.json');
  if (!res.ok) throw new Error(`無法載入 Alicia preset: ${res.status}`);
  basePreset = await res.json();
}

async function loadAlicia() {
  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync('models/mascot.vrm');
  vrm = gltf.userData.vrm;

  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.removeUnnecessaryJoints(vrm.scene);
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
  });

  if (vrm.lookAt) {
    const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    lookAtProxy.name = 'lookAtQuaternionProxy';
    vrm.scene.add(lookAtProxy);
  }

  scene.add(vrm.scene);
}

async function loadVrmaFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.vrma')) {
    throw new Error('請選擇 .vrma 檔案');
  }

  const url = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrmAnimation = gltf.userData.vrmAnimations?.[0];
    if (!vrmAnimation) throw new Error('找不到 VRM Animation');

    clip = createVRMAnimationClip(vrmAnimation, vrm);
    mixer = new THREE.AnimationMixer(vrm.scene);
    action = mixer.clipAction(clip);
    action.play();
    action.paused = true;

    sourceFileName = file.name;
    els.sourceFile.textContent = file.name;
    els.sampleTime.max = String(clip.duration || 0);
    els.sampleTime.value = '0';
    els.durationLabel.textContent = `${formatSeconds(clip.duration || 0)}s`;
    updateTimeLabel(0);
    setStatus('已載入 VRMA');
    sampleAt(0);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 5: Implement sampling, JSON export, and warnings**

Add these functions:

```js
function sampleAt(value) {
  if (!vrm || !mixer || !action || !clip) {
    setWarnings(['請先載入 VRMA']);
    return;
  }

  const duration = clip.duration || 0;
  const sampleTime = clampSampleTime(value, duration);
  const warnings = [];
  const rotations = {};

  mixer.setTime(0);
  mixer.update(0);
  mixer.setTime(sampleTime);
  vrm.update?.(0);

  for (const bone of UPPER_BODY_BONES) {
    const node = getHumanoidBoneNode(bone);
    if (!node) {
      warnings.push(`缺少骨骼：${bone}`);
      continue;
    }

    rotations[bone] = {
      x: THREE.MathUtils.radToDeg(node.rotation.x),
      y: THREE.MathUtils.radToDeg(node.rotation.y),
      z: THREE.MathUtils.radToDeg(node.rotation.z),
    };

    if (Math.max(Math.abs(rotations[bone].x), Math.abs(rotations[bone].y), Math.abs(rotations[bone].z)) > 120) {
      warnings.push(`角度偏大：${bone}`);
    }
  }

  latestPreset = buildNaturalPosePreset({
    basePreset,
    rotations,
    source: {
      type: 'vrma',
      fileName: sourceFileName,
      sampleTime,
    },
    warnings,
  });

  els.sampleTime.value = String(sampleTime);
  updateTimeLabel(sampleTime);
  els.exportedBoneCount.textContent = String(Object.keys(latestPreset.basePose.rotation || {}).filter((bone) => UPPER_BODY_BONES.includes(bone)).length);
  setWarnings(warnings);
  renderJson(latestPreset);
  setStatus('已取樣');
}

function getHumanoidBoneNode(bone) {
  return vrm?.humanoid?.getNormalizedBoneNode?.(bone)
    || vrm?.humanoid?.getRawBoneNode?.(bone)
    || null;
}

function renderJson(preset) {
  latestPreset = preset;
  els.json.textContent = stableStringifyPreset(preset || {});
}

async function copyJson() {
  const text = els.json.textContent || '{}';
  await navigator.clipboard.writeText(text);
  setStatus('已複製 JSON');
}

function downloadJson() {
  const text = els.json.textContent || '{}';
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alicia_solid_from_vrma_${formatSeconds(Number(els.sampleTime.value || 0)).replace('.', '_')}s.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('匯出完成');
}
```

- [ ] **Step 6: Implement event binding and render loop**

Add these functions:

```js
function bindEvents() {
  els.fileInput.addEventListener('change', async () => {
    try {
      const file = els.fileInput.files?.[0];
      await loadVrmaFile(file);
    } catch (err) {
      setStatus('無法讀取 VRMA');
      setWarnings([err?.message || String(err)]);
      console.error(err);
    }
  });

  els.btnSampleFirst.addEventListener('click', () => sampleAt(0));
  els.btnSampleTime.addEventListener('click', () => sampleAt(Number(els.sampleTime.value || 0)));
  els.sampleTime.addEventListener('input', () => updateTimeLabel(Number(els.sampleTime.value || 0)));
  els.btnCopyJson.addEventListener('click', () => copyJson().catch((err) => setWarnings([`複製失敗：${err?.message || err}`])));
  els.btnDownloadJson.addEventListener('click', downloadJson);
}

function render() {
  const dt = clock.getDelta();
  controls.update();
  vrm?.update?.(dt);
  renderer.render(scene, camera);
}

function resize() {
  const rect = els.viewport.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function setStatus(text) {
  els.loadState.textContent = text;
}

function setWarnings(warnings = []) {
  const list = warnings.length ? warnings : ['無'];
  els.warningList.innerHTML = list.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function updateTimeLabel(value) {
  els.sampleTimeLabel.textContent = `${formatSeconds(value)}s / ${formatSeconds(clip?.duration || 0)}s`;
}

function formatSeconds(value) {
  return Number(value || 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
```

- [ ] **Step 7: Run the importer tests**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
```

Expected:

```text
PASS testSpecRequiresDeterministicExport
PASS testLabHtmlContractExists
PASS testLabReferencesVrmaCapabilityOnlyInLab
PASS testLabDoesNotImportAgentRuntime
PASS testUpperBodyWhitelistIsExplicitAndStable
PASS testBuildNaturalPosePresetMergesUpperBodyOnly
PASS testStableExportIsDeterministic
PASS testClampSampleTime
```

- [ ] **Step 8: Commit the lab page**

Run:

```powershell
git add .\motion_template_lab.html .\scratch\test_motion_template_importer.mjs
git commit -m "feat: add VRMA motion template lab"
```

---

### Task 4: Document the Developer Lab

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short M6.7 README note**

In `README.md`, after the M6 Conversation Acting Bridge paragraph, add:

```markdown
M6.7 Motion Template Importer 提供獨立開發工具 `motion_template_lab.html`：載入 Alicia 與本機 `.vrma`，取樣第一幀或指定時間點的 upper-body humanoid rotation，匯出可貼回 Character Inspector 的 NaturalPose preset JSON。這個 lab 不進 production runtime、不改 Agent、不寫 `contextDigest`。
```

Add a developer tool link near the usage section:

````markdown
開啟 VRMA 範本匯入實驗室：

```text
http://127.0.0.1:8765/motion_template_lab.html
```
````

- [ ] **Step 2: Run README and importer tests**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 3: Commit README update**

Run:

```powershell
git add .\README.md
git commit -m "docs: document motion template lab"
```

---

### Task 5: Browser Smoke Test

**Files:**
- Verify: `motion_template_lab.html`

- [ ] **Step 1: Start or reuse the local server**

Run:

```powershell
python .\server.py
```

Expected:

```text
Serving ... 8765
```

If the server is already running, keep the existing server.

- [ ] **Step 2: Open the lab**

Open:

```text
http://127.0.0.1:8765/motion_template_lab.html
```

Expected:

- Alicia preview canvas is visible.
- Right panel shows Chinese UI.
- `載入中` changes to `已載入 Alicia`.
- JSON preview shows Alicia base preset before VRMA sampling.
- Console has no new error or warning.

- [ ] **Step 3: Load a local VRMA**

Use a known local `.vrma` file.

Expected:

- Status changes to `已載入 VRMA`.
- Duration is greater than or equal to `0.000s`.
- Timestamp slider max matches the loaded clip duration.

- [ ] **Step 4: Sample first frame**

Click:

```text
取第一幀
```

Expected:

- Status changes to `已取樣`.
- Exported bone count is greater than `0`.
- JSON contains `source.type = "vrma"`.
- JSON contains `source.sampleTime = 0`.
- JSON contains `basePose.rotation.leftUpperArm` when the VRMA has that bone.
- JSON preserves `basePose.position.hips` from Alicia preset.

- [ ] **Step 5: Verify deterministic export manually**

Copy JSON after the first `取第一幀`, click `取第一幀` again, and copy JSON again.

Expected:

```text
The two JSON strings are exactly identical.
```

If they differ, inspect whether the difference is a source metadata field. M6.7 has no approved non-deterministic metadata fields, so any difference is a bug.

- [ ] **Step 6: Sample selected timestamp**

Move the slider to a non-zero timestamp and click:

```text
取指定時間
```

Expected:

- `source.sampleTime` changes to the selected clamped timestamp.
- JSON output remains stable when sampling the same timestamp twice.

- [ ] **Step 7: Paste into Character Inspector**

Open:

```text
http://127.0.0.1:8765/
```

Paste the exported JSON into Character Inspector.

Expected:

- `MotionController.loadPosePreset()` accepts the JSON.
- Alicia does not reveal T-Pose.
- Lower body / hips baseline remains aligned with Alicia preset.

---

### Task 6: Final Regression and PR-Ready Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run regression tests**

Run:

```powershell
node .\scratch\test_motion_template_importer.mjs
node .\scratch\test_semantic_pose_binding.mjs
node .\scratch\test_character_inspector_ui.mjs
python -m py_compile .\server.py
git diff --check
```

Expected:

```text
All Node tests PASS.
py_compile exits 0.
git diff --check exits 0.
```

- [ ] **Step 2: Inspect git diff**

Run:

```powershell
git status --short --branch
git diff --stat HEAD~3..HEAD
```

Expected changed files:

```text
js/MotionTemplateImporter.js
motion_template_lab.html
README.md
scratch/test_motion_template_importer.mjs
```

No Agent Runtime or main `index.html` changes should appear.

- [ ] **Step 3: Commit any final fixes**

If browser smoke or regression required fixes, commit them:

```powershell
git add .\js\MotionTemplateImporter.js .\motion_template_lab.html .\README.md .\scratch\test_motion_template_importer.mjs
git commit -m "fix: stabilize motion template importer"
```

If no final fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: the plan covers VRMA loading, first-frame sampling, selected timestamp sampling, upper-body-only extraction, NaturalPose preset export, deterministic JSON, runtime isolation, tests, browser smoke, and README.
- Placeholder scan: no `TBD`, `TODO`, or incomplete "add tests" steps remain.
- Type consistency: helper names are consistent across tests and implementation: `UPPER_BODY_BONES`, `buildNaturalPosePreset`, `stableStringifyPreset`, and `clampSampleTime`.
- Scope check: Mixamo, VMD/MMD, YOLO, mocap, IK, expression import, gaze import, and server save remain outside M6.7.
