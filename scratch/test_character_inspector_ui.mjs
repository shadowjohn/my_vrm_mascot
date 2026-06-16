import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHARACTER_INSPECTOR_SECTIONS,
  CHARACTER_INSPECTOR_BONE_GROUPS,
  CHARACTER_INSPECTOR_BONE_LABELS,
  getInspectorBoneLabel,
  getInspectorBonesForGroup,
} from '../js/CharacterInspectorLabels.js';

const runtimeHtml = readFileSync(new URL('../mascot_runtime.html', import.meta.url), 'utf8');
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
  assert.match(runtimeHtml, /角色檢查器/);
  assert.match(runtimeHtml, /Character Inspector/);
  assert.match(runtimeHtml, /開發者模式/);
  assert.match(runtimeHtml, /複製 JSON/);
  assert.match(runtimeHtml, /儲存本機/);
  assert.match(runtimeHtml, /重設骨骼/);
  assert.match(runtimeHtml, /全部重設/);
  assert.doesNotMatch(runtimeHtml, />Reset Bone</);
  assert.doesNotMatch(runtimeHtml, />Reset All</);
  assert.doesNotMatch(runtimeHtml, />Save Local</);
  assert.doesNotMatch(runtimeHtml, />Pose Calibration</);
}

function testIndexHtmlKeepsInspectorContracts() {
  assert.match(runtimeHtml, /data-inspector-section="\$\{escapeHtml\(section\.id\)\}"/);
  assert.match(runtimeHtml, /\$\{section\.enabled \? '' : 'disabled'\}/);
  assert.match(runtimeHtml, /data-inspector-group="\$\{escapeHtml\(groupId\)\}"/);
  assert.match(runtimeHtml, /id="btnInspectorCopyJson"/);
  assert.match(runtimeHtml, /id="btnInspectorSaveLocal"/);
  assert.match(runtimeHtml, /id="btnInspectorResetBone"/);
  assert.match(runtimeHtml, /id="btnInspectorResetAll"/);
}

function testInspectorLocalPresetDoesNotOverwriteModelDefault() {
  assert.match(runtimeHtml, /vrmMascot\.posePreset\.v2\./);
  assert.match(runtimeHtml, /mascot\.onLoaded = \(\) => \{[\s\S]*loadInspectorPresetFromLocal\(\)/);
  assert.doesNotMatch(
    runtimeHtml,
    /else\s*\{\s*mascot\.motion\.loadPosePreset\(\{ model: document\.getElementById\('modelSelector'\)\?\.value \|\| 'default' \}\);/
  );
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
  testIndexHtmlKeepsInspectorContracts,
  testInspectorLocalPresetDoesNotOverwriteModelDefault,
  testCssUsesCharacterInspectorNamespace,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
