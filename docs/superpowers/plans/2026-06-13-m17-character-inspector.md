# M1.7 Character Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current M1.7 Pose Calibration Panel into a Traditional Chinese `角色檢查器 / Character Inspector` developer HUD, while keeping the existing Base Pose calibration behavior and pose preset API intact.

**Architecture:** Keep `MotionController` responsible for pose preset data and bone application only. Add a small label/group metadata module for Character Inspector UI text, then refactor the existing inline `index.html` panel wiring to use Character Inspector naming, Chinese copy, and bone groups. Restyle the panel as a dark right-side HUD deck using CSS only, with no new framework or server persistence.

**Tech Stack:** Plain HTML, CSS, ES modules, standalone Node `.mjs` tests, existing Python server smoke compile.

---

## File Structure

- Create `js/CharacterInspectorLabels.js`
  - Owns Traditional Chinese labels, future section metadata, bone groups, and bone display names.
  - Has no DOM, no VRM access, and no dependency on `MotionController`.

- Create `scratch/test_character_inspector_ui.mjs`
  - Standalone Node test for labels, group membership, visible HTML copy, CSS namespace, and legacy English button removal.

- Modify `index.html`
  - Rename the current pose calibration UI to Character Inspector.
  - Import `CharacterInspectorLabels.js`.
  - Render section tabs, bone group chips, bone select/options, sliders, JSON preview, and Chinese action labels.
  - Keep existing `mascot.motion` API calls.

- Modify `css/mascot.css`
  - Replace `.pose-calibration-*` visible styling with `.character-inspector-*`.
  - Use dark HUD right-side deck treatment and avoid large medium-gray surfaces.

- No changes to:
  - `js/MotionController.js`, unless a test exposes a regression.
  - `js/VrmMascot.js`.
  - `server.py`.
  - `/api/llm` or `contextDigest`.

---

### Task 1: Character Inspector Metadata And Tests

**Files:**
- Create: `js/CharacterInspectorLabels.js`
- Create: `scratch/test_character_inspector_ui.mjs`
- Read: `docs/superpowers/specs/2026-06-13-m17-character-inspector-design.md`

- [ ] **Step 1: Write the failing Character Inspector metadata/static UI test**

Create `scratch/test_character_inspector_ui.mjs` with this content:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHARACTER_INSPECTOR_SECTIONS,
  CHARACTER_INSPECTOR_BONE_GROUPS,
  CHARACTER_INSPECTOR_BONE_LABELS,
  getInspectorBoneLabel,
  getInspectorBonesForGroup,
} from '../js/CharacterInspectorLabels.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/mascot.css', import.meta.url), 'utf8');

function testSectionMetadataUsesChineseLabels() {
  assert.deepEqual(
    CHARACTER_INSPECTOR_SECTIONS.map(section => section.id),
    ['pose', 'expression', 'lookAt', 'motion']
  );
  assert.deepEqual(
    CHARACTER_INSPECTOR_SECTIONS.map(section => section.label),
    ['姿勢', '表情', '視線', '動作']
  );
  assert.equal(CHARACTER_INSPECTOR_SECTIONS[0].enabled, true);
  assert.equal(CHARACTER_INSPECTOR_SECTIONS[1].enabled, false);
  assert.equal(CHARACTER_INSPECTOR_SECTIONS[2].enabled, false);
  assert.equal(CHARACTER_INSPECTOR_SECTIONS[3].enabled, false);
}

function testBoneGroupsUseApprovedM17Bones() {
  assert.deepEqual(Object.keys(CHARACTER_INSPECTOR_BONE_GROUPS), ['center', 'body', 'arms', 'hands']);
  assert.deepEqual(getInspectorBonesForGroup('center'), ['hips']);
  assert.deepEqual(getInspectorBonesForGroup('body'), ['spine', 'chest']);
  assert.deepEqual(getInspectorBonesForGroup('arms'), [
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
  ]);
  assert.deepEqual(getInspectorBonesForGroup('hands'), ['leftHand', 'rightHand']);
  assert.deepEqual(getInspectorBonesForGroup('unknown'), [
    'hips',
    'spine',
    'chest',
    'leftUpperArm',
    'rightUpperArm',
    'leftLowerArm',
    'rightLowerArm',
    'leftHand',
    'rightHand',
  ]);
}

function testBoneLabelsKeepChineseAndHumanoidIds() {
  assert.equal(CHARACTER_INSPECTOR_BONE_LABELS.rightUpperArm, '右上臂 rightUpperArm');
  assert.equal(CHARACTER_INSPECTOR_BONE_LABELS.leftLowerArm, '左前臂 leftLowerArm');
  assert.equal(CHARACTER_INSPECTOR_BONE_LABELS.hips, '重心 hips');
  assert.equal(getInspectorBoneLabel('rightHand'), '右手 rightHand');
  assert.equal(getInspectorBoneLabel('unknownBone'), 'unknownBone');
}

function testIndexHtmlUsesCharacterInspectorCopy() {
  assert.match(indexHtml, /角色檢查器/);
  assert.match(indexHtml, /Character Inspector/);
  assert.match(indexHtml, /開發者模式/);
  assert.match(indexHtml, /複製 JSON/);
  assert.match(indexHtml, /儲存本機/);
  assert.match(indexHtml, /重設骨骼/);
  assert.match(indexHtml, /全部重設/);
  assert.doesNotMatch(indexHtml, />Reset Bone</);
  assert.doesNotMatch(indexHtml, />Reset All</);
  assert.doesNotMatch(indexHtml, />Save Local</);
  assert.doesNotMatch(indexHtml, />Pose Calibration</);
}

function testCssUsesCharacterInspectorNamespace() {
  assert.match(css, /\.character-inspector-container/);
  assert.match(css, /\.character-inspector-deck/);
  assert.match(css, /\.character-inspector-slider-list/);
  assert.doesNotMatch(css, /\.pose-calibration-container/);
}

const tests = [
  testSectionMetadataUsesChineseLabels,
  testBoneGroupsUseApprovedM17Bones,
  testBoneLabelsKeepChineseAndHumanoidIds,
  testIndexHtmlUsesCharacterInspectorCopy,
  testCssUsesCharacterInspectorNamespace,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
```

- [ ] **Step 2: Run the test and verify it fails for missing module/current copy**

Run:

```powershell
node scratch/test_character_inspector_ui.mjs
```

Expected: FAIL because `js/CharacterInspectorLabels.js` does not exist yet, or because `index.html` still contains `Pose Calibration` / English button labels.

- [ ] **Step 3: Add the Character Inspector labels module**

Create `js/CharacterInspectorLabels.js`:

```js
export const CHARACTER_INSPECTOR_SECTIONS = [
  { id: 'pose', label: '姿勢', subtitle: 'Base Pose', enabled: true },
  { id: 'expression', label: '表情', subtitle: 'Expression Debug', enabled: false },
  { id: 'lookAt', label: '視線', subtitle: 'LookAt Debug', enabled: false },
  { id: 'motion', label: '動作', subtitle: 'Motion Debug', enabled: false },
];

export const CHARACTER_INSPECTOR_BONE_GROUPS = {
  center: {
    label: '重心',
    bones: ['hips'],
  },
  body: {
    label: '身體',
    bones: ['spine', 'chest'],
  },
  arms: {
    label: '手臂',
    bones: ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'],
  },
  hands: {
    label: '手腕',
    bones: ['leftHand', 'rightHand'],
  },
};

export const CHARACTER_INSPECTOR_BONE_LABELS = {
  hips: '重心 hips',
  spine: '脊椎 spine',
  chest: '胸口 chest',
  leftUpperArm: '左上臂 leftUpperArm',
  rightUpperArm: '右上臂 rightUpperArm',
  leftLowerArm: '左前臂 leftLowerArm',
  rightLowerArm: '右前臂 rightLowerArm',
  leftHand: '左手 leftHand',
  rightHand: '右手 rightHand',
};

export function getInspectorBoneLabel(bone) {
  return CHARACTER_INSPECTOR_BONE_LABELS[bone] || bone;
}

export function getInspectorBonesForGroup(groupId) {
  const group = CHARACTER_INSPECTOR_BONE_GROUPS[groupId];
  if (group) {
    return [...group.bones];
  }

  return Object.values(CHARACTER_INSPECTOR_BONE_GROUPS).flatMap(item => item.bones);
}
```

- [ ] **Step 4: Run the test and verify only HTML/CSS assertions still fail**

Run:

```powershell
node scratch/test_character_inspector_ui.mjs
```

Expected: metadata tests PASS; static HTML/CSS copy assertions fail until Tasks 2 and 3 are complete.

---

### Task 2: Refactor Index HTML And Inline JS To Character Inspector

**Files:**
- Modify: `index.html`
- Test: `scratch/test_character_inspector_ui.mjs`

- [ ] **Step 1: Import Character Inspector labels**

In `index.html`, update the ES module imports:

```js
import { VrmMascot } from './js/VrmMascot.js';
import { POSE_CALIBRATION_BONES } from './js/MotionController.js';
import {
  CHARACTER_INSPECTOR_SECTIONS,
  CHARACTER_INSPECTOR_BONE_GROUPS,
  getInspectorBoneLabel,
  getInspectorBonesForGroup,
} from './js/CharacterInspectorLabels.js';
```

Keep `POSE_CALIBRATION_BONES` for the approved M1.7 fallback bone order.

- [ ] **Step 2: Replace the current pose panel HTML with Character Inspector markup**

Replace the existing `<div class="pose-calibration-container" id="poseCalibrationPanel">...</div>` block with:

```html
<div class="character-inspector-container" id="characterInspectorPanel">
  <div class="character-inspector-stage-note">
    <span>角色檢查器</span>
    <span>VRM Developer Mode</span>
  </div>

  <section class="character-inspector-deck" aria-label="角色檢查器">
    <div class="character-inspector-header">
      <div>
        <div class="character-inspector-title">角色檢查器</div>
        <div class="character-inspector-subtitle">Character Inspector</div>
      </div>
      <span class="character-inspector-mode">開發者模式</span>
    </div>

    <div class="character-inspector-tabs" id="characterInspectorTabs"></div>
    <div class="character-inspector-groups" id="characterInspectorGroups"></div>

    <div class="character-inspector-toolbar">
      <select id="characterInspectorBoneSelect" class="model-select character-inspector-bone-select"></select>
      <label class="character-inspector-mirror">
        <input id="characterInspectorMirrorMode" type="checkbox" checked>
        <span>鏡像調整</span>
      </label>
    </div>

    <div class="character-inspector-slider-list" id="characterInspectorSliderList"></div>

    <pre class="character-inspector-json" id="characterInspectorJsonPreview">{}</pre>

    <div class="character-inspector-actions">
      <button class="btn btn--blue" id="btnInspectorCopyJson" type="button">複製 JSON</button>
      <button class="btn btn--accent" id="btnInspectorSaveLocal" type="button">儲存本機</button>
      <button class="btn btn--upload" id="btnInspectorResetBone" type="button">重設骨骼</button>
      <button class="btn btn--upload" id="btnInspectorResetAll" type="button">全部重設</button>
      <span class="character-inspector-status" id="characterInspectorStatus">預設姿勢</span>
    </div>
  </section>
</div>
```

- [ ] **Step 3: Update the `dbg` DOM map**

Replace the old pose keys in the `dbg` object with:

```js
inspectorTabs: document.getElementById('characterInspectorTabs'),
inspectorGroups: document.getElementById('characterInspectorGroups'),
inspectorBoneSelect: document.getElementById('characterInspectorBoneSelect'),
inspectorMirrorMode: document.getElementById('characterInspectorMirrorMode'),
inspectorSliderList: document.getElementById('characterInspectorSliderList'),
inspectorResetBone: document.getElementById('btnInspectorResetBone'),
inspectorResetAll: document.getElementById('btnInspectorResetAll'),
inspectorCopyJson: document.getElementById('btnInspectorCopyJson'),
inspectorSaveLocal: document.getElementById('btnInspectorSaveLocal'),
inspectorStatus: document.getElementById('characterInspectorStatus'),
inspectorJsonPreview: document.getElementById('characterInspectorJsonPreview'),
```

- [ ] **Step 4: Replace pose UI state constants with Character Inspector state**

Replace:

```js
const POSE_STORAGE_PREFIX = 'vrmMascot.posePreset.';
const POSE_POSITION_BONES = new Set(['hips']);
const POSE_MIRROR_PAIRS = {
  leftUpperArm: 'rightUpperArm',
  rightUpperArm: 'leftUpperArm',
  leftLowerArm: 'rightLowerArm',
  rightLowerArm: 'leftLowerArm',
  leftHand: 'rightHand',
  rightHand: 'leftHand',
};
const POSE_MIRROR_INVERT_AXES = new Set(['y', 'z']);
```

with:

```js
const INSPECTOR_STORAGE_PREFIX = 'vrmMascot.posePreset.';
const INSPECTOR_POSITION_BONES = new Set(['hips']);
const INSPECTOR_MIRROR_PAIRS = {
  leftUpperArm: 'rightUpperArm',
  rightUpperArm: 'leftUpperArm',
  leftLowerArm: 'rightLowerArm',
  rightLowerArm: 'leftLowerArm',
  leftHand: 'rightHand',
  rightHand: 'leftHand',
};
const INSPECTOR_MIRROR_INVERT_AXES = new Set(['y', 'z']);
let currentInspectorGroup = 'arms';
```

- [ ] **Step 5: Replace the pose storage/mode/value helper functions**

Replace the existing pose helper functions with:

```js
function inspectorStorageKey() {
  const selectedModel = document.getElementById('modelSelector')?.value || 'default';
  return `${INSPECTOR_STORAGE_PREFIX}${selectedModel}`;
}

function getInspectorMode(bone) {
  return INSPECTOR_POSITION_BONES.has(bone) ? 'position' : 'rotation';
}

function getInspectorAxisConfig(bone) {
  if (getInspectorMode(bone) === 'position') {
    return { min: -0.08, max: 0.08, step: 0.001 };
  }
  return { min: -120, max: 120, step: 1 };
}

function formatInspectorValue(value, mode) {
  const number = Number(value) || 0;
  return mode === 'position' ? number.toFixed(3) : `${Math.round(number)}°`;
}

function setInspectorStatus(message) {
  if (dbg.inspectorStatus) dbg.inspectorStatus.textContent = message;
}

function readInspectorValue(preset, bone, axis) {
  const mode = getInspectorMode(bone);
  const source = mode === 'position'
    ? preset.basePose?.position?.[bone]
    : preset.basePose?.rotation?.[bone];
  return Number(source?.[axis] ?? 0);
}

function renderCharacterInspectorPreview() {
  if (!dbg.inspectorJsonPreview) return;
  dbg.inspectorJsonPreview.textContent = JSON.stringify(mascot.motion.getPosePreset(), null, 2);
}
```

- [ ] **Step 6: Add section tabs, group chips, and bone select rendering**

Add these functions near the existing inspector helper functions:

```js
function renderInspectorTabs() {
  if (!dbg.inspectorTabs) return;
  dbg.inspectorTabs.innerHTML = CHARACTER_INSPECTOR_SECTIONS.map(section => `
    <button
      class="character-inspector-tab${section.id === 'pose' ? ' active' : ''}${section.enabled ? '' : ' disabled'}"
      type="button"
      data-inspector-section="${escapeHtml(section.id)}"
      ${section.enabled ? '' : 'disabled'}
      title="${escapeHtml(section.subtitle)}"
    >
      ${escapeHtml(section.label)}
    </button>
  `).join('');
}

function renderInspectorGroups() {
  if (!dbg.inspectorGroups) return;
  dbg.inspectorGroups.innerHTML = Object.entries(CHARACTER_INSPECTOR_BONE_GROUPS).map(([groupId, group]) => `
    <button
      class="character-inspector-group${groupId === currentInspectorGroup ? ' active' : ''}"
      type="button"
      data-inspector-group="${escapeHtml(groupId)}"
    >
      ${escapeHtml(group.label)}
    </button>
  `).join('');
}

function ensureInspectorBoneOptions() {
  if (!dbg.inspectorBoneSelect) return;
  const groupBones = getInspectorBonesForGroup(currentInspectorGroup);
  const bones = groupBones.length > 0 ? groupBones : POSE_CALIBRATION_BONES;
  const currentValue = dbg.inspectorBoneSelect.value;

  dbg.inspectorBoneSelect.innerHTML = bones.map(bone => (
    `<option value="${escapeHtml(bone)}">${escapeHtml(getInspectorBoneLabel(bone))}</option>`
  )).join('');

  if (bones.includes(currentValue)) {
    dbg.inspectorBoneSelect.value = currentValue;
  }
}
```

- [ ] **Step 7: Replace render and slider handlers**

Replace `renderPoseCalibration`, `applyPoseMirror`, and `handlePoseSliderInput` with:

```js
function renderCharacterInspector() {
  if (!dbg.inspectorBoneSelect || !dbg.inspectorSliderList) return;
  renderInspectorTabs();
  renderInspectorGroups();
  ensureInspectorBoneOptions();

  const preset = mascot.motion.getPosePreset();
  const selectedBone = dbg.inspectorBoneSelect.value || getInspectorBonesForGroup(currentInspectorGroup)[0] || POSE_CALIBRATION_BONES[0];
  const mode = getInspectorMode(selectedBone);
  const config = getInspectorAxisConfig(selectedBone);

  dbg.inspectorSliderList.innerHTML = ['x', 'y', 'z'].map(axis => {
    const value = readInspectorValue(preset, selectedBone, axis);
    return `
      <label class="character-inspector-slider-row">
        <span class="character-inspector-axis">${axis}</span>
        <input
          class="character-inspector-slider"
          type="range"
          min="${config.min}"
          max="${config.max}"
          step="${config.step}"
          value="${value}"
          data-inspector-axis="${axis}"
        >
        <span class="character-inspector-value" data-inspector-value="${axis}">${formatInspectorValue(value, mode)}</span>
      </label>
    `;
  }).join('');

  renderCharacterInspectorPreview();
}

function applyInspectorMirror(bone, axis, value) {
  if (!dbg.inspectorMirrorMode?.checked || getInspectorMode(bone) === 'position') return;
  const mirrorBone = INSPECTOR_MIRROR_PAIRS[bone];
  if (!mirrorBone) return;

  const mirroredValue = INSPECTOR_MIRROR_INVERT_AXES.has(axis) ? -value : value;
  mascot.motion.setBasePoseRotation(mirrorBone, axis, mirroredValue);
}

function handleInspectorSliderInput(e) {
  const input = e.target.closest('[data-inspector-axis]');
  if (!input || !dbg.inspectorBoneSelect) return;

  const bone = dbg.inspectorBoneSelect.value;
  const axis = input.dataset.inspectorAxis;
  const value = Number(input.value);
  const mode = getInspectorMode(bone);

  if (mode === 'position') {
    mascot.motion.setBasePosePosition(bone, axis, value);
  } else {
    mascot.motion.setBasePoseRotation(bone, axis, value);
    applyInspectorMirror(bone, axis, value);
  }

  const valueEl = dbg.inspectorSliderList.querySelector(`[data-inspector-value="${axis}"]`);
  if (valueEl) valueEl.textContent = formatInspectorValue(value, mode);
  renderCharacterInspectorPreview();
  setInspectorStatus('編輯中');
}
```

- [ ] **Step 8: Replace load/copy/save/reset handlers**

Replace the current pose local/copy/save functions and event listeners with:

```js
function loadInspectorPresetFromLocal() {
  try {
    const raw = localStorage.getItem(inspectorStorageKey());
    if (raw) {
      mascot.motion.loadPosePreset(JSON.parse(raw));
      setInspectorStatus('已載入本機設定');
    } else {
      mascot.motion.loadPosePreset({ model: document.getElementById('modelSelector')?.value || 'default' });
      setInspectorStatus('預設姿勢');
    }
  } catch (err) {
    console.warn('Failed to load local pose preset:', err);
    mascot.motion.resetBasePoseAll();
    setInspectorStatus('本機設定無效');
  }
  renderCharacterInspector();
}

async function copyInspectorJson() {
  const text = JSON.stringify(mascot.motion.getPosePreset(), null, 2);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (dbg.inspectorJsonPreview) {
      const range = document.createRange();
      range.selectNodeContents(dbg.inspectorJsonPreview);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('copy');
      selection.removeAllRanges();
    }
    setInspectorStatus('已複製 JSON');
  } catch (err) {
    console.warn('Failed to copy pose preset:', err);
    setInspectorStatus('複製失敗');
  }
}

function saveInspectorPresetLocal() {
  try {
    localStorage.setItem(inspectorStorageKey(), JSON.stringify(mascot.motion.getPosePreset(), null, 2));
    setInspectorStatus('已儲存本機');
  } catch (err) {
    console.warn('Failed to save pose preset:', err);
    setInspectorStatus('儲存失敗');
  }
}

if (dbg.inspectorGroups) {
  dbg.inspectorGroups.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-inspector-group]');
    if (!btn) return;
    currentInspectorGroup = btn.dataset.inspectorGroup;
    renderCharacterInspector();
  });
}

if (dbg.inspectorBoneSelect) {
  dbg.inspectorBoneSelect.addEventListener('change', renderCharacterInspector);
}
if (dbg.inspectorSliderList) {
  dbg.inspectorSliderList.addEventListener('input', handleInspectorSliderInput);
}
if (dbg.inspectorResetBone) {
  dbg.inspectorResetBone.addEventListener('click', () => {
    mascot.motion.resetBasePoseBone(dbg.inspectorBoneSelect.value);
    renderCharacterInspector();
    setInspectorStatus('已重設骨骼');
  });
}
if (dbg.inspectorResetAll) {
  dbg.inspectorResetAll.addEventListener('click', () => {
    mascot.motion.loadPosePreset({ model: document.getElementById('modelSelector')?.value || 'default' });
    renderCharacterInspector();
    setInspectorStatus('已全部重設');
  });
}
if (dbg.inspectorCopyJson) {
  dbg.inspectorCopyJson.addEventListener('click', copyInspectorJson);
}
if (dbg.inspectorSaveLocal) {
  dbg.inspectorSaveLocal.addEventListener('click', saveInspectorPresetLocal);
}
```

- [ ] **Step 9: Update load calls**

Replace:

```js
loadPosePresetFromLocal();
```

with:

```js
loadInspectorPresetFromLocal();
```

Do this both before the initial `mascot.load(selector.value)` and inside the model selector `change` event.

- [ ] **Step 10: Run the static UI test**

Run:

```powershell
node scratch/test_character_inspector_ui.mjs
```

Expected: CSS namespace test still fails until Task 3; HTML copy assertions should PASS.

---

### Task 3: Restyle As Dark Character Inspector HUD

**Files:**
- Modify: `css/mascot.css`
- Test: `scratch/test_character_inspector_ui.mjs`

- [ ] **Step 1: Remove the old pose calibration CSS block**

Delete the CSS section that starts with:

```css
/* ── Pose Calibration Panel ───────────────────── */
.pose-calibration-container {
```

and ends before:

```css
/* ── Mock LLM Connector (Phase 5A) ──────────────── */
```

- [ ] **Step 2: Add Character Inspector HUD CSS**

Insert this CSS before `/* ── Mock LLM Connector (Phase 5A) ──────────────── */`:

```css
/* ── Character Inspector (VRM Developer Mode) ───── */
.character-inspector-container {
  grid-column: 1 / -1;
  margin-top: 0;
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--gap-sm);
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(320px, 410px);
  gap: var(--gap-md);
  align-items: stretch;
}

.character-inspector-stage-note {
  min-height: 280px;
  border: 1px solid rgba(24, 169, 153, 0.12);
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 35% 48%, rgba(24, 169, 153, 0.08), transparent 32%),
    rgba(5, 10, 20, 0.62);
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--gap-sm);
  padding: var(--gap-md);
}

.character-inspector-deck {
  display: grid;
  grid-template-rows: auto auto auto auto auto auto;
  gap: var(--gap-sm);
  padding: var(--gap-md);
  border: 1px solid rgba(24, 169, 153, 0.28);
  border-radius: var(--radius-md);
  background: rgba(5, 10, 20, 0.88);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.32);
}

.character-inspector-header,
.character-inspector-toolbar,
.character-inspector-actions {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.character-inspector-header {
  justify-content: space-between;
}

.character-inspector-title {
  color: var(--text-primary);
  font-size: 0.98rem;
  font-weight: 800;
  line-height: 1.2;
}

.character-inspector-subtitle {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.66rem;
  margin-top: 2px;
}

.character-inspector-mode {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(24, 169, 153, 0.32);
  background: rgba(24, 169, 153, 0.1);
  color: var(--accent-mint);
  font-size: 0.68rem;
  white-space: nowrap;
}

.character-inspector-tabs,
.character-inspector-groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-sm);
}

.character-inspector-tab,
.character-inspector-group {
  min-height: 31px;
  padding: 6px 10px;
  border: 1px solid rgba(232, 237, 245, 0.12);
  border-radius: var(--radius-sm);
  background: rgba(15, 23, 42, 0.74);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.character-inspector-tab.active,
.character-inspector-group.active {
  border-color: rgba(24, 169, 153, 0.62);
  background: rgba(24, 169, 153, 0.12);
  color: var(--accent-mint);
}

.character-inspector-tab.disabled {
  color: var(--text-muted);
  border-style: dashed;
  cursor: not-allowed;
  opacity: 0.68;
}

.character-inspector-toolbar {
  align-items: stretch;
}

.character-inspector-bone-select {
  flex: 1;
  min-width: 160px;
}

.character-inspector-mirror {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(232, 237, 245, 0.12);
  border-radius: var(--radius-sm);
  background: rgba(15, 23, 42, 0.74);
  color: var(--text-secondary);
  font-size: 0.72rem;
  white-space: nowrap;
  cursor: pointer;
}

.character-inspector-mirror input {
  accent-color: var(--accent-mint);
}

.character-inspector-slider-list {
  display: grid;
  gap: var(--gap-sm);
}

.character-inspector-slider-row {
  display: grid;
  grid-template-columns: 22px minmax(120px, 1fr) 52px;
  align-items: center;
  gap: var(--gap-sm);
  min-height: 42px;
  padding: 7px 10px;
  border: 1px solid rgba(232, 237, 245, 0.1);
  border-radius: var(--radius-sm);
  background: rgba(15, 23, 42, 0.74);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
}

.character-inspector-axis {
  color: var(--accent-amber);
  font-weight: 800;
  text-transform: uppercase;
}

.character-inspector-slider {
  width: 100%;
  accent-color: var(--accent-mint);
}

.character-inspector-value {
  color: var(--text-primary);
  text-align: right;
  white-space: nowrap;
}

.character-inspector-json {
  max-height: 132px;
  overflow: auto;
  margin: 0;
  padding: var(--gap-sm);
  border: 1px solid rgba(232, 237, 245, 0.1);
  border-radius: var(--radius-sm);
  background: rgba(2, 6, 23, 0.72);
  color: #a78bfa;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.64rem;
  line-height: 1.35;
}

.character-inspector-actions {
  flex-wrap: wrap;
}

.character-inspector-actions .btn {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.7rem;
}

.character-inspector-status {
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.66rem;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .character-inspector-container {
    grid-template-columns: 1fr;
  }

  .character-inspector-stage-note {
    min-height: 90px;
  }

  .character-inspector-toolbar {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: Run the static UI test**

Run:

```powershell
node scratch/test_character_inspector_ui.mjs
```

Expected: PASS all tests.

- [ ] **Step 4: Run CSS/HTML whitespace check**

Run:

```powershell
git diff --check -- index.html css/mascot.css js/CharacterInspectorLabels.js scratch/test_character_inspector_ui.mjs
```

Expected: no whitespace errors. CRLF warnings are acceptable in this Windows repo.

---

### Task 4: Full Regression And Browser Smoke

**Files:**
- Read/verify: `index.html`
- Read/verify: `css/mascot.css`
- Test: `scratch/test_character_inspector_ui.mjs`
- Test: `scratch/test_semantic_pose_binding.mjs`
- Test: `scratch/test_trace_timeline.mjs`
- Test: `scratch/test_suggested_actions.mjs`

- [ ] **Step 1: Run all automated tests**

Run:

```powershell
node scratch/test_character_inspector_ui.mjs
node scratch/test_semantic_pose_binding.mjs
node scratch/test_trace_timeline.mjs
node scratch/test_suggested_actions.mjs
python -m py_compile .\server.py
git diff --check
```

Expected:

- all Node tests PASS;
- Python compile exits with code 0;
- `git diff --check` has no whitespace errors;
- existing non-blocking timeout warning text from `scratch/test_trace_timeline.mjs` may still print.

- [ ] **Step 2: Browser smoke at desktop width**

Open:

```text
http://127.0.0.1:8765/?characterInspector=<timestamp>
```

Manual checks:

- Debug Panel opens.
- Visible title is `角色檢查器`.
- Secondary title is `Character Inspector`.
- Status pill says `開發者模式`.
- `姿勢` is active.
- `表情`, `視線`, `動作` are disabled or clearly unavailable if shown.
- Operation buttons read `複製 JSON`, `儲存本機`, `重設骨骼`, `全部重設`.
- Right-side area uses dark HUD colors, not a large medium-gray document surface.
- No clipped action buttons.
- No slider/value overlap.

- [ ] **Step 3: Browser smoke for slider and mirror**

Use the inspector UI:

1. Select group `手臂`.
2. Select `右上臂 rightUpperArm`.
3. Move `Z` slider to `-50`.
4. Confirm JSON preview shows:

```json
"rightUpperArm": {
  "x": 7,
  "y": 0,
  "z": -50
}
```

5. Confirm mirror updates the paired arm value in the JSON preview:

```json
"leftUpperArm": {
  "x": 7,
  "y": 0,
  "z": 50
}
```

6. Click `全部重設`.
7. Confirm `rightUpperArm.z` returns to `-42` and `leftUpperArm.z` returns to `42`.

- [ ] **Step 4: Browser smoke for save and console**

Use the inspector UI:

1. Move one slider.
2. Click `儲存本機`.
3. Confirm status text becomes `已儲存本機`.
4. Check browser console logs.

Expected:

- no new `error`;
- no new `warn` except known existing warnings unrelated to this task;
- no `alert()` appears.

- [ ] **Step 5: Browser smoke at mobile width**

Set viewport to a mobile-like width such as `390x844`, then reload:

```text
http://127.0.0.1:8765/?characterInspectorMobile=<timestamp>
```

Manual checks:

- Character Inspector stacks vertically.
- Sliders remain readable.
- JSON preview scrolls inside its own dock.
- No horizontal page overflow.
- Buttons wrap without clipping text.

- [ ] **Step 6: Commit implementation**

Stage only files touched by this plan:

```powershell
git add -- `
  index.html `
  css/mascot.css `
  js/CharacterInspectorLabels.js `
  scratch/test_character_inspector_ui.mjs
```

Inspect staged files:

```powershell
git diff --cached --name-only
git diff --cached --stat
```

Expected staged files:

```text
css/mascot.css
index.html
js/CharacterInspectorLabels.js
scratch/test_character_inspector_ui.mjs
```

Commit:

```powershell
git commit -m "feat: add character inspector HUD"
```

Do not stage unrelated existing M1/M1.6/M1.7 files unless this task actually modifies them.

---

## Self-Review Checklist

- Spec coverage:
  - Product name `角色檢查器 / Character Inspector`: Task 2.
  - M1.7 scope remains pose/base pose only: Tasks 1 and 2.
  - Chinese operation labels: Task 2.
  - Chinese semantic bone labels plus English humanoid IDs: Task 1 and Task 2.
  - Dark HUD/right-side deck color direction: Task 3.
  - Existing pose preset API remains unchanged: Task 4 regression tests.
  - No contextDigest or `/api/llm` changes: File Structure and Task 4 scope.

- Placeholder scan:
  - No step asks the worker to invent missing behavior.
  - Every new file has concrete code.
  - Every test command has expected output.

- Type consistency:
  - DOM ids use `characterInspector*`.
  - CSS namespace uses `.character-inspector-*`.
  - JS function names use `Inspector` / `CharacterInspector`.
  - The metadata module exports match the test imports.
