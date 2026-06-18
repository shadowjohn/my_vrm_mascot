import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';
import { MotionCycleDetector } from '../js/MotionCycleDetector.js';
import { exportWalkStyle } from '../js/WalkStyleExtractor.js';

const html = readFileSync('motion_capture_lab.html', 'utf8');
const forbiddenSceneAdapter = ['Scene', 'ObjectAdapter'].join('');
const forbiddenMoveTo = ['mascot', 'moveTo'].join('.');

const requiredIds = [
  'captureSourceType',
  'captureVideoInput',
  'captureYoutubeUrlInput',
  'btnCaptureYoutube',
  'btnExtractVideoSkeleton',
  'captureRangeLabel',
  'captureRangeStartSlider',
  'captureRangeEndSlider',
  'captureRangeStartMs',
  'captureRangeEndMs',
  'btnUseCurrentAsRangeStart',
  'btnUseCurrentAsRangeEnd',
  'captureWebcamButton',
  'captureSkeletonJsonInput',
  'captureVrmaInput',
  'btnLoadSampleSkeleton',
  'captureStatus',
  'videoPreview',
  'btnSkeletonMode2d',
  'btnSkeletonMode3d',
  'skeletonModeStatus',
  'skeletonPreviewCanvas',
  'skeleton3dControls',
  'skeleton3dYaw',
  'skeleton3dPitch',
  'motionBertLeadFoot',
  'motionBertDepthConfidence',
  'motionBertViewpoint',
  'motionBertDebugPanel',
  'motionBertDebugOutput',
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
  'motionClipOutput',
  'advancedDebugToggle',
  'videoInfoDuration',
  'videoInfoResolution',
  'videoInfoFps',
  'loopSummaryRange',
  'loopSummaryDuration',
  'loopSummaryConfidence',
  'walkParamStride',
  'walkParamCadence',
  'walkParamArmSwing',
  'walkParamHipBob',
  'walkParamBounce',
  'walkParamBodyLean',
  'walkConfidenceSummary',
  'previewSpeedSelect',
  'btnRefreshWalkPreview',
  'traceOverlayToggle',
  'walkSummaryType',
  'walkSummaryPreviewSource',
  'walkSummaryPoseMode',
  'walkSummaryDepthSource',
  'walkSummaryMotionBert',
  'walkSummaryLeadFoot',
  'walkSummaryTraceOverlay',
  'walkSummaryFootDelta',
  'walkSummaryLoop',
  'walkSummaryCadence',
  'walkSummaryStride',
  'walkSummaryConfidence',
  'walkJsonDetails'
];

for (const id of requiredIds) {
  assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
}

const requiredImports = [
  './js/MotionCaptureTypes.js',
  './js/SkeletonSequenceAdapter.js',
  './js/PoseEstimatorAdapters.js',
  './js/MotionCycleDetector.js',
  './js/WalkStyleExtractor.js',
  './js/AliciaMotionPreviewAdapter.js',
  './js/TraceSkeletonOverlay.js',
  './js/VrmMascot.js'
];

for (const specifier of requiredImports) {
  assert.ok(html.includes(specifier), `missing import ${specifier}`);
}

assert.match(html, /fetch\('motions\/capture_samples\/walk_reference_001\.json'\)/);
assert.match(html, /<option value="youtube">YouTube URL<\/option>/);
assert.match(html, /id="captureYoutubeUrlInput"/);
assert.match(html, /id="btnCaptureYoutube"/);
assert.match(html, /id="btnExtractVideoSkeleton"/);
assert.match(html, /id="captureRangeStartSlider"[^>]*type="range"/);
assert.match(html, /id="captureRangeEndSlider"[^>]*type="range"/);
assert.match(html, /id="captureRangeStartMs"[^>]*type="number"/);
assert.match(html, /id="captureRangeEndMs"[^>]*type="number"/);
assert.match(html, /id="btnUseCurrentAsRangeStart"/);
assert.match(html, /id="btnUseCurrentAsRangeEnd"/);
assert.match(html, /M20\.3 - Walk Style Extractor/);
assert.match(html, /Advanced Debug/);
assert.match(html, /Input Source/);
assert.match(html, /Walk Cycle Analysis/);
assert.match(html, /Skeleton Analysis/);
assert.match(html, />2D<\/button>/);
assert.match(html, />3D<\/button>/);
assert.match(html, /3D Lifted Pose/);
assert.match(html, /MotionBERT 3D Skeleton/);
assert.match(html, /Alicia Walk Preview/);
assert.match(html, /Detect Walk Cycle/);
assert.match(html, /Walk Parameters \(Extracted\)/);
assert.match(html, /Walk Style Summary/);
assert.match(html, /Show JSON/);
assert.match(html, /Preview Source/);
assert.match(html, /Pose Mode/);
assert.match(html, /Depth Source/);
assert.match(html, /MotionBERT/);
assert.match(html, /Lead Foot/);
assert.match(html, /Skeleton Overlay/);
assert.match(html, /Trace Foot/);
assert.match(html, /grid-template-columns:\s*minmax\(320px,\s*0\.9fr\)\s+minmax\(380px,\s*1\.1fr\)\s+minmax\(420px,\s*1\.2fr\)/);
assert.match(html, /#skeletonPreviewCanvas\s*\{[\s\S]*min-height:\s*280px/);
assert.match(html, /fetch\('api\/capture\/youtube'/);
assert.match(html, /fetch\('api\/capture\/video\/skeleton'/);
assert.match(html, /JSON\.stringify\(\{\s*url\s*\}\)/);
assert.match(html, /captureRange:\s*\{\s*startMs:\s*0,\s*endMs:\s*0,\s*durationMs:\s*0\s*\}/);
assert.match(html, /function syncCaptureRangeControls\(\)/);
assert.match(html, /function updateCaptureRangeFromVideoMetadata\(\)/);
assert.match(html, /function updateVideoInfo\(\)/);
assert.match(html, /function setParamMeter\(id,\s*value,\s*display\)/);
assert.match(html, /function updateWalkStylePanels\(style\)/);
assert.match(html, /function previewSourceLabel\(result\)/);
assert.match(html, /function setCurrentTimeAsCaptureRangeStart\(\)/);
assert.match(html, /function setCurrentTimeAsCaptureRangeEnd\(\)/);
assert.match(html, /const captureRange = getCaptureRangeForRequest\(\)/);
assert.match(html, /JSON\.stringify\(\{\s*videoUrl:\s*state\.currentVideoUrl,\s*startMs:\s*captureRange\.startMs,\s*endMs:\s*captureRange\.endMs/);
assert.match(html, /enable3dLift:\s*true/);
assert.match(html, /sourceType:\s*'youtube'/);
assert.match(html, /applyLoadedSequence\(result,\s*`Video skeleton:/);
assert.match(html, /const SKELETON_BONES = Object\.freeze/);
assert.match(html, /\['leftShoulder',\s*'leftElbow'\]/);
assert.match(html, /\['leftElbow',\s*'leftWrist'\]/);
assert.match(html, /\['rightShoulder',\s*'rightElbow'\]/);
assert.match(html, /\['rightElbow',\s*'rightWrist'\]/);
assert.match(html, /\['hips',\s*'leftKnee'\]/);
assert.match(html, /\['leftKnee',\s*'leftAnkle'\]/);
assert.match(html, /\['hips',\s*'rightKnee'\]/);
assert.match(html, /\['rightKnee',\s*'rightAnkle'\]/);
assert.match(html, /const DEPTH_MARKERS = Object\.freeze/);
assert.match(html, /const MOTIONBERT_DEBUG_JOINTS = Object\.freeze/);
assert.match(html, /skeletonAnalysisMode:\s*'2d'/);
assert.match(html, /skeleton3d:\s*\{\s*yaw:/);
assert.match(html, /function setSkeletonAnalysisMode\(mode\)/);
assert.match(html, /function setSkeleton3dRotation\(yaw,\s*pitch\)/);
assert.match(html, /function getDepthValue\(point\)/);
assert.match(html, /function depthRank\(point,\s*zMin,\s*zMax\)/);
assert.match(html, /function depthColor\(rank\)/);
assert.match(html, /function normalizedDepth\(point,\s*zMin,\s*zMax\)/);
assert.match(html, /function projectSkeleton3dPoint\(point,\s*bounds,\s*canvas\)/);
assert.match(html, /function drawSkeletonCanvas2d\(ctx,\s*canvas,\s*frame\)/);
assert.match(html, /function drawSkeletonCanvas3d\(ctx,\s*canvas,\s*frame\)/);
assert.match(html, /function updateMotionBertDebugPanel\(style\)/);
assert.match(html, /function skeletonMotionBertDebugPayload\(style\)/);
assert.match(html, /state\.skeletonAnalysisMode === '3d'/);
assert.match(html, /Lead Foot :/);
assert.match(html, /Depth Conf :/);
assert.match(html, /Viewpoint :/);
assert.match(html, /function depthRelationLabel\(point,\s*anchor\)/);
assert.match(html, /function depthRelationConfidence\(point,\s*anchor\)/);
assert.match(html, /function drawDepthBadge\(ctx,\s*label,\s*x,\s*y,\s*rank\)/);
assert.match(html, /ctx\.globalAlpha = depthAlpha\(rank\)/);
assert.match(html, /depthRadius\(name,\s*rank\)/);
assert.match(html, /for \(const marker of DEPTH_MARKERS\)/);
assert.match(html, /near camera/);
assert.match(html, /near /);
assert.match(html, /far /);
assert.match(html, /uncertain/);
assert.match(html, /btnSkeletonMode2d'\)\.addEventListener\('click'/);
assert.match(html, /btnSkeletonMode3d'\)\.addEventListener\('click'/);
assert.match(html, /skeleton3dYaw'\)\.addEventListener\('input'/);
assert.match(html, /skeleton3dPitch'\)\.addEventListener\('input'/);
assert.match(html, /skeletonPreviewCanvas'\)\.addEventListener\('pointerdown'/);
assert.match(html, /skeletonPreviewCanvas'\)\.addEventListener\('pointermove'/);
assert.match(html, /skeletonPreviewCanvas'\)\.addEventListener\('pointerup'/);
assert.match(html, /function getCurrentSkeletonPreviewTimeMs\(\)/);
assert.match(html, /state\.adapter\.getFrameAtMs\(state\.sequence,\s*previewTimeMs\)/);
assert.match(html, /for \(const \[from,\s*to\] of SKELETON_BONES\)/);
assert.match(html, /addEventListener\('timeupdate',\s*\(\) => drawSkeletonCanvas\(\)\)/);
assert.match(html, /addEventListener\('seeked',\s*\(\) => drawSkeletonCanvas\(\)\)/);
assert.match(html, /addEventListener\('loadedmetadata',\s*\(\) => \{\s*updateCaptureRangeFromVideoMetadata\(\);\s*drawSkeletonCanvas\(\);\s*\}\)/);
assert.match(html, /captureRangeStartSlider'\)\.addEventListener\('input'/);
assert.match(html, /captureRangeEndSlider'\)\.addEventListener\('input'/);
assert.match(html, /captureRangeStartMs'\)\.addEventListener\('input'/);
assert.match(html, /captureRangeEndMs'\)\.addEventListener\('input'/);
assert.match(html, /btnUseCurrentAsRangeStart'\)\.addEventListener\('click',\s*setCurrentTimeAsCaptureRangeStart\)/);
assert.match(html, /btnUseCurrentAsRangeEnd'\)\.addEventListener\('click',\s*setCurrentTimeAsCaptureRangeEnd\)/);
assert.match(html, /previewSpeedSelect'\)\.addEventListener\('change'/);
assert.match(html, /btnRefreshWalkPreview'\)\.addEventListener\('click'/);
assert.match(html, /adapter\.loadFromText/);
assert.match(html, /detector\.seedEvenWalkPhases/);
assert.match(html, /exportWalkStyle/);
assert.match(html, /walk_style_v1/);
assert.match(html, /Export Walk Style/);
assert.match(html, /id="btnSeedCyclePhases"[\s\S]*Detect Walk Cycle/);
assert.match(html, /function attachPreviewFramesToClip\(clip\)/);
assert.match(html, /state\.detector\.extractCycleFrames\(state\.sequence\)/);
assert.match(html, /clip\.previewFrames = previewFrames/);
assert.match(html, /traceOverlay:\s*new TraceSkeletonOverlay\(\)/);
assert.match(html, /function updateTraceOverlayForClip\(clip,\s*result\)/);
assert.match(html, /state\.traceOverlay\.play\(\{[\s\S]*frames:\s*clip\.previewFrames/);
assert.match(html, /traceOverlayToggle'\)\.addEventListener\('change'/);
assert.match(html, /mirrorX:\s*!!state\.traceOverlay\?\.sceneAlignmentOptions\?\.\(\)\.mirrorX/);
assert.match(html, /previewAdapter\.previewClip/);
assert.match(html, /const clip = exportCurrentClip\(\{\s*silent:\s*true\s*\}\)/);
assert.match(html, /attachPreviewFramesToClip\(clip\)/);
assert.match(html, /previewAdapter\.previewClip\(clip\)/);
assert.match(html, /walk_style_skeleton_trace/);
assert.match(html, /extracted skeleton trace/);
assert.match(html, /walkSummaryPreviewSource/);
assert.match(html, /walkSummaryPoseMode/);
assert.match(html, /walkSummaryDepthSource/);
assert.match(html, /walkSummaryMotionBert/);
assert.match(html, /walkSummaryLeadFoot/);
assert.match(html, /function motionBertSummaryLabel\(style\)/);
assert.match(html, /strict3dLift:\s*false/);
assert.match(html, /const retargetLabel = result\.retargetMode/);
assert.doesNotMatch(html, /const clip = state\.clip \|\| exportCurrentClip/);
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
assert.match(html, /function stopWebcamStream\(\)/);
assert.match(html, /\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
assert.match(html, /video\.srcObject = null/);
assert.match(html, /function clearVideoObjectUrl\(\)[\s\S]*URL\.revokeObjectURL\(state\.videoObjectUrl\)/);
assert.match(html, /function attachVideoPreview\(url,\s*\{\s*sourceType,\s*label,\s*objectUrl = false,\s*serverVideoUrl = null\s*\}\)[\s\S]*stopWebcamStream\(\);[\s\S]*clearVideoObjectUrl\(\);[\s\S]*state\.currentVideoUrl = serverVideoUrl;[\s\S]*video\.src = url/);
assert.match(html, /stopWebcamStream\(\);\s*\n\s*const stream = await navigator\.mediaDevices\.getUserMedia/);
assert.match(html, /const stream = await navigator\.mediaDevices\.getUserMedia[\s\S]*clearVideoObjectUrl\(\);[\s\S]*videoPreview'\)\.srcObject = stream/);
assert.match(html, /const objectUrl = URL\.createObjectURL\(file\);[\s\S]*attachVideoPreview\(objectUrl,\s*\{[\s\S]*sourceType:\s*'video'/);
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

const style = exportWalkStyle({
  id: 'walk_style_001',
  label: 'Walk Style 001',
  sequence: loadResult.sequence,
  detector,
  source: {
    type: 'skeleton_json',
    adapter: 'SkeletonSequenceAdapter',
    sourceId: 'walk_reference_001'
  }
});
assert.equal(style.kind, 'walk_style_v1');
assert.equal(style.phases.contact_left.timeMs, 0);
assert.ok(style.parameters.cadence > 0);
assert.equal(Object.hasOwn(style, 'keyPoses'), false);

console.log('PASS test_motion_capture_lab');
