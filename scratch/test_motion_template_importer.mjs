import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPEC_PATH = 'docs/superpowers/specs/2026-06-13-m6-7-motion-template-importer-design.md';
const LAB_PATH = 'motion_template_lab.html';
const MODULE_PATH = 'js/MotionTemplateImporter.js';
const RUNTIME_PATH = 'mascot_runtime.html';
const EXAMPLE_DIR = 'examples/m6_7_vrma_samples';
const REQUIRED_EXAMPLE_VRMA = [
  'Angry.vrma',
  'Blush.vrma',
  'Clapping.vrma',
  'Goodbye.vrma',
  'Jump.vrma',
  'LookAround.vrma',
  'Relax.vrma',
  'Sad.vrma',
  'Sleepy.vrma',
  'Surprised.vrma',
  'Thinking.vrma',
];
const MINED_SPRINT_001_VRMA = REQUIRED_EXAMPLE_VRMA.filter((fileName) => fileName !== 'Blush.vrma');
const MINING_LOG_PATH = 'examples/m6_7_motion_mining/mining_log.json';
const MINING_REPORT_PATH = 'examples/m6_7_motion_mining/mining_report.json';

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
  assert.match(html, /Alicia Motion Mine/);
  assert.match(html, /先定義動作，再釘選姿勢/);
  assert.match(html, /載入 VRMA/);
  assert.match(html, /取第一幀/);
  assert.match(html, /取目前時間/);
  assert.match(html, /複製 JSON/);
  assert.match(html, /下載 JSON/);
  assert.match(html, /匯出 NaturalPosePreset/);
  assert.match(html, /Upper Body/);
  assert.match(html, /鎖定下半身/);
  assert.match(html, /motion-template-json/);
}

function testExampleVrmaSamplesAreDocumentedLocalAssets() {
  const sources = read(`${EXAMPLE_DIR}/SOURCES.md`);
  const readme = read(`${EXAMPLE_DIR}/README.md`);

  assert.match(sources, /local-only|本機/i);
  assert.match(sources, /Third-party VRMA binaries|第三方 VRMA binary/i);
  assert.match(readme, /local-only|本機/i);

  for (const fileName of REQUIRED_EXAMPLE_VRMA) {
    assert.match(sources, new RegExp(fileName.replace('.', '\\.')));
    assert.match(readme, new RegExp(fileName.replace('.', '\\.')));
  }
}

function testLabIncludesExampleAndPlaybackControls() {
  const html = read(LAB_PATH);

  assert.match(html, /範例動作/);
  assert.match(html, /載入範例/);
  for (const fileName of REQUIRED_EXAMPLE_VRMA) {
    assert.match(html, new RegExp(fileName.replace('.', '\\.')));
  }
  assert.match(html, /播放/);
  assert.match(html, /暫停/);
  assert.match(html, /停止/);
  assert.match(html, /examples\/m6_7_vrma_samples\//);
  assert.match(html, /\/api\/vrma-samples/);
  assert.match(html, /loadVrmaSamplesFromServer/);
  assert.match(html, /vrmaSampleCatalog/);
  assert.match(html, /function\s+playMotion\s*\(/);
  assert.match(html, /function\s+pauseMotion\s*\(/);
  assert.match(html, /function\s+stopPlayback\s*\(/);
  assert.match(html, /function\s+applyLowerBodyPreviewLock\s*\(/);
  assert.match(html, /isPlaying\s*&&\s*mixer/);
  assert.match(html, /mixer\.update\(dt\)/);
  assert.match(html, /applyLowerBodyPreviewLock\(\)/);
  assert.match(html, /startTime\s*>=\s*duration\s*-\s*0\.034/);
}

function testLabDefaultsToFrontFacingPreviewCamera() {
  const html = read(LAB_PATH);

  assert.match(html, /PREVIEW_CAMERA_POSITION/);
  assert.match(html, /z:\s*-3\.3/);
  assert.match(html, /function\s+resetPreviewCamera\s*\(/);
  assert.match(html, /resetPreviewCamera\(\);[\s\S]*sampleAt\(0\);/);
  assert.doesNotMatch(html, /camera\.position\.set\(0,\s*1\.35,\s*3\.3\)/);
}

function testMotionMiningLogHasSprintReviewedSamples() {
  assert.equal(existsSync(MINING_LOG_PATH), true, `${MINING_LOG_PATH} should exist`);

  const log = JSON.parse(read(MINING_LOG_PATH));
  assert.ok(log.length >= 50, 'mining log should keep the first sprint above 50 samples');
  assert.deepEqual([...new Set(log.map((entry) => entry.source))].sort(), [...MINED_SPRINT_001_VRMA].sort());

  for (const source of MINED_SPRINT_001_VRMA) {
    assert.ok(log.filter((entry) => entry.source === source).length >= 5, `${source} should have at least 5 mined samples`);
  }

  for (const entry of log) {
    assert.match(entry.id, /^(present|point|think|warning|success|reject|candidate_future)_\d{3}$/);
    assert.equal(MINED_SPRINT_001_VRMA.includes(entry.source), true);
    assert.equal(typeof entry.sampleTime, 'number');
    assert.ok(entry.sampleTime >= 0);
    assert.match(entry.createdAt, /^2026-06-(13|14)T\d{2}:\d{2}:\d{2}\+08:00$/);
    assert.equal(Array.isArray(entry.tags), true);
    assert.equal(entry.tags.length > 0, true);
    assert.equal(typeof entry.sourceScore, 'number');
    assert.equal(typeof entry.agentScore, 'number');
    assert.ok(entry.sourceScore >= 1 && entry.sourceScore <= 5);
    assert.ok(entry.agentScore >= 1 && entry.agentScore <= 5);

    if (entry.category === 'reject') {
      assert.equal(typeof entry.rejectReason, 'string');
      assert.equal(entry.exportedPoseFile, undefined);
    } else if (entry.category === 'candidate_future') {
      assert.equal(typeof entry.reason, 'string');
      assert.equal(entry.exportedPoseFile, `${entry.id}.json`);
    } else {
      assert.equal(entry.exportedPoseFile, `${entry.id}.json`);
    }
  }
}

function testMotionMiningReportMatchesLog() {
  assert.equal(existsSync(MINING_REPORT_PATH), true, `${MINING_REPORT_PATH} should exist`);

  const log = JSON.parse(read(MINING_LOG_PATH));
  const report = JSON.parse(read(MINING_REPORT_PATH));
  const categoryCounts = {};
  const sourceCounts = {};
  const reasonCounts = {};

  for (const entry of log) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1;
    const reason = entry.reason || entry.rejectReason;
    if (reason) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }

  assert.equal(report.sprint, 'Motion Mining Sprint 001');
  assert.equal(report.generatedFrom, 'mining_log.json');
  assert.equal(report.totalEntries, log.length);
  assert.equal(report.sourceCount, MINED_SPRINT_001_VRMA.length);
  assert.deepEqual(report.categoryCounts, categoryCounts);
  assert.deepEqual(report.sourceCounts, sourceCounts);
  assert.deepEqual(report.reasonCounts, reasonCounts);
  assert.equal(report.rankings.categoryByCount[0].category, 'think');
}

function testLabReferencesVrmaCapabilityOnlyInLab() {
  const html = read(LAB_PATH);
  const runtime = read(RUNTIME_PATH);

  assert.match(html, /@pixiv\/three-vrm-animation/);
  assert.match(html, /VRMAnimationLoaderPlugin/);
  assert.match(html, /createVRMAnimationClip/);
  assert.doesNotMatch(runtime, /motion_template_lab|three-vrm-animation|VRMAnimationLoaderPlugin/);
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

async function testLowerBodyPreviewLockIsExplicitAndSeparateFromExportScope() {
  const mod = await importImporterModule();

  assert.deepEqual(mod.LOWER_BODY_PREVIEW_LOCK_BONES, [
    'hips',
    'leftUpperLeg',
    'rightUpperLeg',
    'leftLowerLeg',
    'rightLowerLeg',
    'leftFoot',
    'rightFoot',
    'leftToes',
    'rightToes',
  ]);

  for (const bone of mod.LOWER_BODY_PREVIEW_LOCK_BONES) {
    assert.equal(mod.UPPER_BODY_BONES.includes(bone), false, `${bone} must not be exported as upper body`);
  }
}

async function testMotionMiningSchemaBuildsCandidateAndRejectEntries() {
  const mod = await importImporterModule();

  assert.deepEqual(mod.MOTION_MINING_CATEGORIES, [
    'present',
    'point',
    'think',
    'warning',
    'success',
    'candidate_future',
    'reject',
  ]);
  assert.deepEqual(mod.MOTION_MINING_REJECT_REASONS, [
    'too_large_motion',
    'hands_cover_face',
    'off_balance',
    'too_dance_like',
    'bad_silhouette',
    'arm_cross_body',
    'not_agentic',
    'costume_clip',
    'unclear_intent',
    'requires_lower_body',
    'requires_hips',
    'requires_weight_shift',
    'requires_locomotion',
  ]);

  const candidate = mod.buildMotionMiningEntry({
    source: 'Relax.vrma',
    sampleTime: 0.46234,
    category: 'present',
    score: 5,
    sourceScore: 4,
    agentScore: 5,
    note: '雙手自然打開，適合介紹',
    tags: 'upper_body, agent_friendly',
    sequence: 1,
    createdAt: '2026-06-13T12:00:00+08:00',
  });

  assert.deepEqual(candidate, {
    id: 'present_001',
    source: 'Relax.vrma',
    sampleTime: 0.4623,
    category: 'present',
    score: 5,
    sourceScore: 4,
    agentScore: 5,
    note: '雙手自然打開，適合介紹',
    tags: ['upper_body', 'agent_friendly'],
    exportedPoseFile: 'present_001.json',
    createdAt: '2026-06-13T12:00:00+08:00',
  });

  const reject = mod.buildMotionMiningEntry({
    source: 'Clapping.vrma',
    sampleTime: 1.2,
    category: 'reject',
    score: 2,
    sourceScore: 3,
    agentScore: 1,
    rejectReason: 'hands_cover_face',
    note: '手遮住臉，但手腕角度可參考',
    tags: 'negative_sample',
    sequence: 3,
    createdAt: '2026-06-13T12:10:00+08:00',
  });

  assert.deepEqual(reject, {
    id: 'reject_003',
    source: 'Clapping.vrma',
    sampleTime: 1.2,
    category: 'reject',
    score: 2,
    sourceScore: 3,
    agentScore: 1,
    rejectReason: 'hands_cover_face',
    note: '手遮住臉，但手腕角度可參考',
    tags: ['negative_sample'],
    createdAt: '2026-06-13T12:10:00+08:00',
  });

  const future = mod.buildMotionMiningEntry({
    source: 'Jump.vrma',
    sampleTime: 1.419,
    category: 'candidate_future',
    score: 4,
    sourceScore: 5,
    agentScore: 2,
    reason: 'requires_weight_shift',
    note: '原始重心很好，但 Agent Pose 鎖下半身後失衡。',
    tags: 'future_candidate, locomotion',
    sequence: 2,
    createdAt: '2026-06-13T12:20:00+08:00',
  });

  assert.deepEqual(future, {
    id: 'candidate_future_002',
    source: 'Jump.vrma',
    sampleTime: 1.419,
    category: 'candidate_future',
    score: 4,
    sourceScore: 5,
    agentScore: 2,
    reason: 'requires_weight_shift',
    note: '原始重心很好，但 Agent Pose 鎖下半身後失衡。',
    tags: ['future_candidate', 'locomotion'],
    exportedPoseFile: 'candidate_future_002.json',
    createdAt: '2026-06-13T12:20:00+08:00',
  });
}

function testLabIncludesMotionMiningWorkbenchControls() {
  const html = read(LAB_PATH);

  assert.match(html, /Preview Mode/);
  assert.match(html, /id="previewModeOriginal"/);
  assert.match(html, /id="previewModeAgent"/);
  assert.match(html, /id="previewModeLabel"/);
  assert.match(html, /id="previewModeOriginal"[^>]*checked/);
  assert.doesNotMatch(html, /id="previewModeAgent"[^>]*checked/);
  assert.match(html, /let previewMode = 'original';/);
  assert.match(html, /Original VRMA \/ 全身原地預覽/);
  assert.match(html, /ORIGINAL_PREVIEW_ROOT_MOTION_SCALE\s*=\s*Object\.freeze\(\{\s*x:\s*0,\s*y:\s*1,\s*z:\s*0\s*\}\)/);
  assert.match(html, /ORIGINAL_PREVIEW_VERTICAL_DELTA_LIMIT\s*=\s*0\.75/);
  assert.match(html, /setPreviewMode\('original',\s*\{\s*refresh:\s*false,\s*silent:\s*true\s*\}\);[\s\S]*sampleAt\(0\);/);
  assert.match(html, /let sourceHipsAnchor = null;/);
  assert.match(html, /function\s+captureSourceHipsAnchor\s*\(/);
  assert.match(html, /function\s+applyOriginalPreviewStabilizer\s*\(/);
  assert.match(html, /\(rawX - sourceHipsAnchor\.x\) \* ORIGINAL_PREVIEW_ROOT_MOTION_SCALE\.x/);
  assert.match(html, /\(rawZ - sourceHipsAnchor\.z\) \* ORIGINAL_PREVIEW_ROOT_MOTION_SCALE\.z/);
  assert.match(html, /clampDelta\(rawY - sourceHipsAnchor\.y,\s*ORIGINAL_PREVIEW_VERTICAL_DELTA_LIMIT\) \* ORIGINAL_PREVIEW_ROOT_MOTION_SCALE\.y/);
  assert.match(html, /if\s*\(previewMode === 'original'\)\s*\{[\s\S]*applyOriginalPreviewStabilizer\(\);[\s\S]*\}\s*else\s+if\s*\(previewMode === 'agent'\)/);
  assert.match(html, /captureSourceHipsAnchor\(\);[\s\S]*sampleAt\(0\);/);
  assert.match(html, /function\s+applyPreviewMode\s*\(/);
  assert.match(html, /function\s+refreshCurrentFrame\s*\(/);
  assert.match(html, /Alicia Motion Mine/);
  assert.match(html, /id="minerAdvancedTools"/);
  assert.match(html, /id="miningCategory"/);
  assert.match(html, /id="miningScore"/);
  assert.match(html, /id="miningSourceScore"/);
  assert.match(html, /id="miningAgentScore"/);
  assert.match(html, /id="miningFutureReason"/);
  assert.match(html, /id="miningRejectReason"/);
  assert.match(html, /id="miningNote"/);
  assert.match(html, /id="miningTags"/);
  assert.match(html, /id="btnAddMiningCandidate"/);
  assert.match(html, /id="btnExportMiningLog"/);
  assert.match(html, /id="miningCandidateList"/);
  assert.match(html, /function\s+addMiningCandidate\s*\(/);
  assert.match(html, /function\s+downloadMiningLog\s*\(/);
  assert.match(html, /mining_log\.json/);
  assert.doesNotMatch(html, /innerHTML/);
}

function testLabIncludesQuickReviewModeControls() {
  const html = read(LAB_PATH);

  assert.match(html, /Quick Review Mode/);
  assert.match(html, /快速標註/);
  assert.match(html, /id="quickReviewPanel"/);
  assert.match(html, /id="quickReviewPresent"/);
  assert.match(html, /id="quickReviewPoint"/);
  assert.match(html, /id="quickReviewThink"/);
  assert.match(html, /id="quickReviewWarning"/);
  assert.match(html, /id="quickReviewSuccess"/);
  assert.match(html, /id="quickReviewFuture"/);
  assert.match(html, /id="quickReviewReject"/);
  assert.match(html, /data-quick-key="Q"/);
  assert.match(html, /data-quick-key="W"/);
  assert.match(html, /data-quick-key="E"/);
  assert.match(html, /data-quick-key="R"/);
  assert.match(html, /data-quick-key="T"/);
  assert.match(html, /data-quick-key="C"/);
  assert.match(html, /data-quick-key="X"/);
  assert.match(html, /id="advancedMiningDetails"/);
  assert.match(html, /function\s+addQuickReviewCandidate\s*\(/);
  assert.match(html, /function\s+getQuickReviewPreset\s*\(/);
  assert.match(html, /function\s+handleQuickReviewKeydown\s*\(/);
  assert.match(html, /function\s+isQuickReviewEditableTarget\s*\(/);
  assert.match(html, /event\.repeat/);
  assert.match(html, /event\.ctrlKey/);
  assert.match(html, /event\.metaKey/);
  assert.match(html, /event\.altKey/);
  assert.match(html, /category:\s*'candidate_future'[\s\S]*reason:\s*'requires_weight_shift'/);
  assert.match(html, /category:\s*'reject'[\s\S]*rejectReason:\s*'unclear_intent'/);
}

function testLabUsesMotionFirstCategoryModel() {
  const html = read(LAB_PATH);

  assert.match(html, /動作主分類|Motion Category/);
  assert.match(html, /一支 VRMA = 一個 motion intent/);
  assert.match(html, /motionProfiles/);
  assert.match(html, /motionCategory/);
  assert.match(html, /motionScore/);
  assert.match(html, /setMotionCategory/);
  assert.match(html, /getCurrentMotionProfile/);
  assert.match(html, /applyMotionProfileToPinnedMoment/);
  assert.match(html, /const inheritedItem = applyMotionProfileToPinnedMoment\(item\)/);
  assert.match(html, /套用主分類/);
  assert.match(html, /候選片段會先繼承主分類/);
  assert.doesNotMatch(html, /每個 frame 都/);
}

function testLabShowsRecommendationForMotionCategory() {
  const html = read(LAB_PATH);

  assert.match(html, /id="motionCategorySuggestionLabel"/);
  assert.match(html, /id="motionCategorySuggestionConfidence"/);
  assert.match(html, /id="motionCategorySuggestionReason"/);
  assert.match(html, /function\s+suggestMotionCategory\s*\(/);
  assert.match(html, /renderMotionCategoryRecommendation/);
  assert.doesNotMatch(html, /button\.classList\.toggle\('is-recommended',\s*button\.dataset\.motionCategory === recommendedCategory\)/);
}

function testLabUsesCalmMotionCategoryButtonStates() {
  const html = read(LAB_PATH);

  assert.match(html, /savedMotionProfileSources/);
  assert.match(html, /savedMotionProfileCategories/);
  assert.match(html, /is-saved-profile/);
  assert.match(html, /const isSavedProfileCategory = savedMotionProfileSources\.has\(sourceFileName\)[\s\S]*savedMotionProfileCategories\.get\(sourceFileName\) === category/);
  assert.match(html, /button\.classList\.toggle\('is-saved-profile',\s*isSavedProfileCategory && button\.dataset\.motionCategory === category\)/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="present"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="point"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="think"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="warning"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="success"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="candidate_future"\]/);
  assert.doesNotMatch(html, /\.lab-quick-button\[data-motion-category="reject"\]/);
}

function testLabPersistsMotionProfilesToServer() {
  const html = read(LAB_PATH);

  assert.match(html, /MOTION_PROFILE_API_URL\s*=\s*'\/api\/motion-profiles'/);
  assert.match(html, /id="motionProfileSaveState"/);
  assert.match(html, /id="motionDescription"/);
  assert.match(html, /id="btnSaveMotionProfile"/);
  assert.match(html, /人類描述/);
  assert.match(html, /儲存主分類與描述/);
  assert.match(html, /async function\s+loadMotionProfilesFromServer\s*\(/);
  assert.match(html, /async function\s+saveMotionProfileToServer\s*\(/);
  assert.match(html, /function\s+saveMotionDescription\s*\(/);
  assert.match(html, /btnSaveMotionProfile\.addEventListener\('click',\s*\(\)\s*=>\s*saveMotionDescription\(\)\)/);
  assert.match(html, /motionDescription\.addEventListener\('input'[\s\S]*syncMotionDescriptionToProfile\(\)/);
  assert.match(html, /motionDescription\.addEventListener\('input'[\s\S]*markDescriptionFieldEdited\(\)/);
  assert.match(html, /motionDescription\.addEventListener\('keydown'/);
  assert.doesNotMatch(html, /motionDescription\.addEventListener\('change'/);
  assert.match(html, /description:\s*profile\.description/);
  assert.match(html, /usageDescription:\s*profile\.usageDescription/);
  assert.match(html, /agentUsage:\s*Array\.isArray\(profile\.agentUsage\)/);
  assert.match(html, /profile\.usageDescription\s*=\s*fields\.usageDescription/);
  assert.match(html, /profile\.agentUsage\s*=\s*parseAgentUsage\(fields\.agentUsageText\)/);
  assert.match(html, /els\.usageDescription\.value\s*=\s*profile\.usageDescription/);
  assert.match(html, /els\.agentUsage\.value\s*=\s*Array\.isArray\(profile\.agentUsage\)/);
  assert.match(html, /motionCategory:\s*profile\.motionCategory/);
  assert.match(html, /method:\s*'POST'/);
  assert.match(html, /profile:\s*serializeMotionProfile\(profile\)/);
  assert.match(html, /saveMotionProfileToServer\(profile\)/);
  assert.match(html, /motion_profiles\.json/);
}

function testLabGuardsAccidentalDuplicateMiningEntries() {
  const html = read(LAB_PATH);

  assert.match(html, /id="btnUndoMiningCandidate"/);
  assert.match(html, /function\s+findDuplicateMiningEntry\s*\(/);
  assert.match(html, /function\s+addMiningEntry\s*\(/);
  assert.match(html, /function\s+undoLastMiningCandidate\s*\(/);
  assert.match(html, /findDuplicateMiningEntry\(entry\)/);
  assert.match(html, /已略過重複候選/);
  assert.match(html, /miningEntries\.pop\(\)/);
  assert.match(html, /已撤銷/);
  assert.match(html, /btnUndoMiningCandidate\.addEventListener/);
}

function testLabIncludesReviewQueueControls() {
  const html = read(LAB_PATH);

  assert.match(html, /id="reviewQueuePanel"/);
  assert.match(html, /審核清單/);
  assert.match(html, /id="btnGenerateReviewQueue"/);
  assert.match(html, /id="reviewQueueFilter"/);
  assert.match(html, /id="btnReviewPrevious"/);
  assert.match(html, /id="btnReviewNext"/);
  assert.match(html, /id="reviewQueueList"/);
  assert.match(html, /function\s+buildReviewQueueItems\s*\(/);
  assert.match(html, /function\s+selectReviewQueueItem\s*\(/);
  assert.match(html, /function\s+classifySelectedReviewItem\s*\(/);
}

function testReviewQueueUsesChineseFirstLabels() {
  const html = read(LAB_PATH);

  assert.match(html, /待分類/);
  assert.match(html, /已分類/);
  assert.match(html, /全部/);
  assert.match(html, /產生清單/);
  assert.match(html, /上一筆/);
  assert.match(html, /下一筆/);
  assert.doesNotMatch(html, />\s*Generate Queue\s*</);
  assert.doesNotMatch(html, />\s*Pending\s*</);
  assert.doesNotMatch(html, />\s*Classified\s*</);
}

function testMineListSeparatesSavedAndUnsavedMotionProfiles() {
  const html = read(LAB_PATH);

  assert.match(html, /id="mineFilterUnclassified"/);
  assert.match(html, /未分類/);
  assert.match(html, /id="mineFilterClassified"/);
  assert.match(html, /已分類/);
  assert.match(html, /id="mineFilterAll"/);
  assert.match(html, /function\s+getMineFilterValue\s*\(/);
  assert.match(html, /function\s+isMotionProfileSaved\s*\(/);
  assert.match(html, /button\.classList\.toggle\('is-profile-saved',\s*isSaved\)/);
  assert.match(html, /savedMotionProfileSources\.has\(fileName\)/);
  assert.match(html, /mineFilterInputs/);
  assert.match(html, /renderMineList/);
  assert.match(html, /\.miner-flow-list li::before/);
  assert.doesNotMatch(html, /\.miner-guide li::before/);
}

function testMineCardClickLoadsAndAutoplaysMotion() {
  const html = read(LAB_PATH);

  assert.match(html, /async function\s+loadExampleVrma\s*\(\s*fileName\s*=\s*els\.exampleSelect\.value\s*\|\|\s*'Relax\.vrma',\s*\{\s*autoplay\s*=\s*false\s*\}\s*=\s*\{\}\s*\)/);
  assert.match(html, /if\s*\(autoplay\)\s*\{[\s\S]*playMotion\(\);[\s\S]*\}/);
  assert.match(html, /loadExampleVrma\(fileName,\s*\{\s*autoplay:\s*true\s*\}\)/);
}

function testMotionMineLayoutPreventsSidebarOverlap() {
  const html = read(LAB_PATH);

  assert.match(html, /\.miner-guide\s*\{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(html, /\.miner-stage,\s*\.miner-classifier,\s*\.miner-sidebar\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(html, /\.mine-card-button,\s*\.pinned-candidate-button\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(html, /\.mine-card-button strong,\s*\.pinned-candidate-button strong\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(html, /\.mine-card-button\.is-selected,\s*\.pinned-candidate-button\.is-selected\s*\{[\s\S]*border:\s*3px solid/);
  assert.match(html, /\.mine-card-button\.is-selected\.is-profile-saved/);
  assert.match(html, /\.lab-quick-button\[data-motion-category\]\.is-selected/);
}

function testDescriptionFirstMiningUiAndRules() {
  const html = read(LAB_PATH);

  assert.match(html, /id="descriptionMiningPanel"/);
  assert.match(html, /描述採礦/);
  assert.match(html, /id="motionDescription"/);
  assert.match(html, /id="usageDescription"/);
  assert.match(html, /id="agentUsage"/);
  assert.match(html, /id="btnAnalyzeMotionDescription"/);
  assert.match(html, /分析動作並填入建議/);
  assert.match(html, /id="btnSaveDescribedEntry"/);
  assert.match(html, /id="btnSaveDescribedEntryNext"/);
  assert.match(html, /#quickReviewPanel\s*\{[\s\S]*display:\s*none;/);
  assert.match(html, /const\s+MOTION_DESCRIPTION_RULES\s*=/);
  assert.match(html, /right_hand_come_here/);
  assert.match(html, /hand_near_chin_thinking/);
  assert.match(html, /arm_forward_pointing/);
  assert.match(html, /function\s+buildMotionSignature\s*\(/);
  assert.match(html, /function\s+applyMotionDescriptionSuggestion\s*\(/);
  assert.match(html, /function\s+saveDescribedMiningEntry\s*\(/);
  assert.match(html, /motionDescription:\s*fields\.motionDescription/);
  assert.match(html, /usageDescription:\s*fields\.usageDescription/);
  assert.match(html, /agentUsage:\s*parseAgentUsage/);
  assert.match(html, /status:\s*'described'/);
  assert.match(html, /category:\s*null/);
  assert.match(html, /classificationSource:\s*'pending_llm'/);
  assert.match(html, /descriptionSource/);
  assert.match(html, /entry\.status\s*===\s*'described'/);
  assert.match(html, /MOTION_MINING_LOG_API_URL\s*=\s*'\/api\/motion-mining-log'/);
  assert.match(html, /async function\s+saveDescribedMiningEntryToServer\s*\(/);
  assert.match(html, /await\s+saveMotionProfileToServer\(profile\)/);
  assert.match(html, /await\s+saveDescribedMiningEntryToServer\(entry\)/);
  assert.match(html, /function\s+advanceToNextMineSource\s*\(/);
  assert.match(html, /loadExampleVrma\(nextFileName,\s*\{\s*autoplay:\s*true\s*\}\)/);
  assert.match(html, /advanceToNextMineSource\(entry\.source\s*\|\|\s*sourceFileName\)/);
}

function testReviewQueueSchemaAndBehaviorContracts() {
  const html = read(LAB_PATH);

  assert.match(html, /const\s+MINING_CATEGORIES\s*=/);
  assert.match(html, /status:\s*'pending'/);
  assert.match(html, /status:\s*'classified'/);
  assert.match(html, /duration\s*-\s*0\.001/);
  assert.match(html, /selectedReviewQueueId/);
  assert.match(html, /updatedAt/);
  assert.match(html, /reviewActionHistory/);
  assert.match(html, /entry\.status\s*===\s*'classified'/);
}

function testLabUsesAliciaMotionMineManagerUi() {
  const html = read(LAB_PATH);

  assert.match(html, /Alicia Motion Mine/);
  assert.match(html, /先定義動作，再釘選姿勢/);
  assert.match(html, /礦區/);
  assert.match(html, /候選片段/);
  assert.match(html, /id="mineList"/);
  assert.match(html, /id="pinnedCandidateList"/);
  assert.match(html, /id="btnPinMoment"/);
  assert.match(html, /id="minerCurrentSample"/);
  assert.match(html, /id="minerProgressText"/);
  assert.match(html, /id="minerProgressBar"/);
  assert.match(html, /id="sourceVrmaCount"/);
  assert.match(html, /id="pinnedCandidateCount"/);
  assert.match(html, /id="classifiedCandidateCount"/);
  assert.match(html, /id="minerAdvancedTools"/);
  assert.match(html, /進階工具/);
  assert.match(html, /只顯示必要資訊/);
  assert.doesNotMatch(html, />\s*Motion Mining Workbench\s*</);
}

function testLabIncludesRuleBasedMiningSuggestion() {
  const html = read(LAB_PATH);

  assert.match(html, /id="miningSuggestionPanel"/);
  assert.match(html, /自動推薦/);
  assert.match(html, /id="suggestedCategoryLabel"/);
  assert.match(html, /id="suggestionConfidence"/);
  assert.match(html, /id="suggestionReason"/);
  assert.match(html, /function\s+suggestMiningCategory\s*\(/);
  assert.match(html, /function\s+extractPoseFeatures\s*\(/);
  assert.match(html, /handNearFace/);
  assert.match(html, /headDown/);
  assert.match(html, /armExtended/);
  assert.match(html, /setRecommendedCategory/);
  assert.ok(
    html.indexOf("source.includes('angry')") < html.indexOf("source.includes('thinking')"),
    'Angry source heuristic should recommend warning before generic thinking posture rules',
  );
}

function testLabUsesPinThenClassifyMiningFlow() {
  const html = read(LAB_PATH);

  assert.doesNotMatch(html, /const\s+MINER_AUTO_ADVANCE/);
  assert.doesNotMatch(html, /generateReviewQueue\(\{\s*silent:\s*true\s*\}\)/);
  assert.doesNotMatch(html, /await\s+advanceToNextPendingReviewItem\(''\)/);
  assert.match(html, /function\s+renderMineList\s*\(/);
  assert.match(html, /function\s+pinCurrentMoment\s*\(/);
  assert.match(html, /function\s+renderPinnedCandidates\s*\(/);
  assert.match(html, /function\s+selectPinnedCandidate\s*\(/);
  assert.match(html, /釘選這一刻/);
  assert.match(html, /建議取樣點/);
  assert.match(html, /event\.key\s*===\s*' '/);
  assert.match(html, /event\.key\s*===\s*'ArrowRight'/);
  assert.match(html, /event\.key\.toUpperCase\(\)\s*===\s*'P'/);
  assert.match(html, /event\.key\.toUpperCase\(\)\s*===\s*'Z'/);
}

function testLabIncludesSemanticMotionPreviewBridge() {
  const html = read(LAB_PATH);

  assert.match(html, /Semantic Motion Preview/);
  assert.match(html, /semanticMotionSelect/);
  assert.match(html, /semanticMotionStyle/);
  assert.match(html, /semanticMotionIntensity/);
  assert.match(html, /btnPreviewSemanticVariant/);
  assert.match(html, /semanticVariantDecision/);
  assert.match(html, /semantic_motion_registry\.json/);
  assert.match(html, /selectSemanticMotionVariant/);
  assert.match(html, /buildSemanticMotionPreviewRequest/);
  assert.match(html, /loadSemanticMotionRegistry/);
  assert.match(html, /previewSelectedSemanticMotionVariant/);
  assert.match(html, /loadExampleVrma\(preview\.preferredMotion,\s*\{\s*autoplay:\s*true\s*\}\)/);
  assert.doesNotMatch(html, /performIntent\(/);
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
  const { clampSampleTime, SAMPLE_TIME_EPSILON } = await importImporterModule();

  assert.equal(clampSampleTime(-1, 2), 0);
  assert.equal(clampSampleTime(3, 2), 2 - SAMPLE_TIME_EPSILON);
  assert.equal(clampSampleTime(1.23456, 2), 1.23456);
  assert.equal(clampSampleTime(Number.NaN, 2), 0);
}

async function testClampSampleTimeAvoidsDurationLoopBoundary() {
  const { clampSampleTime, SAMPLE_TIME_EPSILON } = await importImporterModule();

  const duration = 2;
  const safeLastFrame = duration - SAMPLE_TIME_EPSILON;

  assert.equal(clampSampleTime(duration, duration), safeLastFrame);
  assert.equal(clampSampleTime(duration + 1, duration), safeLastFrame);
  assert.equal(clampSampleTime(safeLastFrame, duration), safeLastFrame);
}

async function run() {
  const tests = [
    testSpecRequiresDeterministicExport,
    testLabHtmlContractExists,
    testExampleVrmaSamplesAreDocumentedLocalAssets,
    testLabIncludesExampleAndPlaybackControls,
    testLabDefaultsToFrontFacingPreviewCamera,
    testLabReferencesVrmaCapabilityOnlyInLab,
    testLabDoesNotImportAgentRuntime,
    testUpperBodyWhitelistIsExplicitAndStable,
    testLowerBodyPreviewLockIsExplicitAndSeparateFromExportScope,
    testMotionMiningSchemaBuildsCandidateAndRejectEntries,
    testLabIncludesMotionMiningWorkbenchControls,
    testLabIncludesQuickReviewModeControls,
    testLabUsesMotionFirstCategoryModel,
    testLabShowsRecommendationForMotionCategory,
    testLabUsesCalmMotionCategoryButtonStates,
    testLabPersistsMotionProfilesToServer,
    testLabGuardsAccidentalDuplicateMiningEntries,
    testLabIncludesReviewQueueControls,
    testReviewQueueUsesChineseFirstLabels,
    testMineListSeparatesSavedAndUnsavedMotionProfiles,
    testMineCardClickLoadsAndAutoplaysMotion,
    testMotionMineLayoutPreventsSidebarOverlap,
    testDescriptionFirstMiningUiAndRules,
    testReviewQueueSchemaAndBehaviorContracts,
    testLabUsesAliciaMotionMineManagerUi,
    testLabIncludesRuleBasedMiningSuggestion,
    testLabUsesPinThenClassifyMiningFlow,
    testLabIncludesSemanticMotionPreviewBridge,
    testMotionMiningLogHasSprintReviewedSamples,
    testMotionMiningReportMatchesLog,
    testBuildNaturalPosePresetMergesUpperBodyOnly,
    testStableExportIsDeterministic,
    testClampSampleTime,
    testClampSampleTimeAvoidsDurationLoopBoundary,
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
