import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const LAB_PATH = 'pose_training_lab.html';
const html = readFileSync(LAB_PATH, 'utf8');

assert.ok(existsSync(LAB_PATH), 'pose_training_lab.html file must exist');

for (const vendor of [
  'vendor/three.min.js',
  'vendor/GLTFLoader.js',
  'vendor/OrbitControls.js',
  'vendor/three-vrm.min.js'
]) {
  assert.match(html, new RegExp(`src="${vendor.replaceAll('/', '\\/')}"`), `must load ${vendor}`);
}

for (const id of [
  'trainingYoutubeUrl',
  'btnTrainingLoadYoutube',
  'trainingVideoPreview',
  'trainingCaptureRangeLabel',
  'trainingCaptureStartSlider',
  'trainingCaptureEndSlider',
  'trainingCaptureStartMs',
  'trainingCaptureEndMs',
  'btnTrainingSetStart',
  'btnTrainingSetEnd',
  'btnTrainingRunGvhmr',
  'gvhmrFrameSlider',
  'gvhmrFrameLabel',
  'aliciaPreview',
  'trainingOverlayEnabled',
  'trainingMirrorX',
  'trainingScale',
  'trainingOffsetX',
  'trainingOffsetY',
  'trainingOffsetZ',
  'trainingYaw',
  'trainingTimeOffsetMs',
  'trainingBoneSelect',
  'trainingBoneOffsetSliders',
  'btnTrainingCaptureKeyframe',
  'btnTrainingInferCalibration',
  'trainingCalibrationFrameStatus',
  'trainingCalibrationTrackList',
  'btnTrainingApplyCalibration',
  'btnTrainingSaveDefaultProfile',
  'btnTrainingLoadDefaultProfile',
  'btnTrainingClearDefaultProfile',
  'btnTrainingDownloadJson',
  'btnTrainingLoadJson',
  'trainingJsonInput',
  'trainingJsonOutput',
  'trainingProfileSummary',
  'trainingStatus'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `must have #${id}`);
}

assert.match(html, /Alicia GVHMR 姿勢校正台/);
assert.match(html, /GVHMR → Alicia 修正參數/);
assert.match(html, /載入 YouTube 影片/);
assert.match(html, /執行 GVHMR 動作重建/);
assert.match(html, /存成預設/);
assert.match(html, /DEFAULT_PROFILE_STORAGE_KEY/);
assert.match(html, /kind:\s*'gvhmr_alicia_calibration_session_v1'/);
assert.match(html, /kind:\s*'gvhmr_alicia_profile_v1'/);
assert.match(html, /fetch\('api\/capture\/youtube'/);
assert.match(html, /fetch\('api\/capture\/video\/world-motion'/);
assert.match(html, /startMs:\s*captureRange\.startMs/);
assert.match(html, /endMs:\s*captureRange\.endMs/);
assert.match(html, /function\s+loadYoutubeSource\(/);
assert.match(html, /function\s+runGvhmrWorldMotion\(/);
assert.match(html, /function\s+applyTrainingCalibration\(/);
assert.match(html, /function\s+scheduleTrainingJsonRefresh\(/);
assert.match(html, /function\s+scheduleBoneOffsetApply\(/);
assert.match(html, /function\s+captureTrainingKeyframe\(/);
assert.match(html, /function\s+renderCalibrationTrack\(/);
assert.match(html, /function\s+inferCalibrationForFrame\(/);
assert.match(html, /function\s+applyInferredCalibration\(/);
assert.match(html, /function\s+jumpToCalibrationKeyframe\(/);
assert.match(html, /function\s+applyCalibrationKeyframe\(/);
assert.match(html, /function\s+deleteCalibrationKeyframe\(/);
assert.match(html, /function\s+renderTrainingBoneSelect\(/);
assert.match(html, /function\s+buildGvhmrAliciaProfile\(/);
assert.match(html, /function\s+saveDefaultGvhmrProfile\(/);
assert.match(html, /function\s+loadDefaultGvhmrProfile\(/);
assert.match(html, /function\s+clearDefaultGvhmrProfile\(/);
assert.match(html, /function\s+buildPoseTrainingDocument\(/);
assert.match(html, /function\s+downloadPoseTrainingJson\(/);
assert.match(html, /function\s+loadPoseTrainingJson\(/);
assert.match(html, /function\s+buildGvhmrSkeletonOverlay\(/);
assert.match(html, /function\s+syncFrameToVideo\(/);
assert.match(html, /function\s+configureTrainingCamera\(/);
assert.match(html, /function\s+placeAliciaOnGround\(/);
assert.match(html, /function\s+bindAliciaBonePicker\(/);
assert.match(html, /function\s+pickNearestAliciaBone\(/);
assert.match(html, /function\s+selectTrainingBone\(/);
assert.match(html, /new VrmMascot\(\$\('aliciaPreview'\)/);
assert.match(html, /placeAliciaOnGround\(state\.mascot\)/);
assert.match(html, /configureTrainingCamera\(state\.mascot\)/);
assert.match(html, /bindAliciaBonePicker\(\)/);
assert.match(html, /new AliciaMotionPreviewAdapter\(\{\s*mascot:\s*state\.mascot\s*\}\)/);
assert.match(html, /previewAdapter\.previewPoseAtTimeMs/);
assert.match(html, /mascot\.addSceneObject/);
assert.match(html, /mascot\.removeSceneObject/);
assert.match(html, /window\.poseTrainingLab/);
assert.match(html, /localStorage\.setItem\(DEFAULT_PROFILE_STORAGE_KEY/);
assert.match(html, /localStorage\.getItem\(DEFAULT_PROFILE_STORAGE_KEY/);
assert.match(html, /gvhmrFrameSlider'\)\.addEventListener\('input', \(\) => \{[\s\S]*?applyTrainingCalibration\(\{ refreshJson: false, syncBoneOffsets: false \}\);[\s\S]*?scheduleTrainingJsonRefresh\(\);[\s\S]*?\}\);/);
assert.match(html, /gvhmrFrameSlider'\)\.addEventListener\('change', \(\) => \{[\s\S]*?seekVideoToMs\(frame\.timeMs\);[\s\S]*?applyTrainingCalibration\(\);[\s\S]*?\}\);/);
assert.match(html, /setTimeout\(refreshTrainingJson, 250\)/);
assert.match(html, /boneOffsetApplyRaf:\s*0/);
assert.match(html, /state\.boneOffsetApplyRaf = requestAnimationFrame/);
assert.match(html, /scheduleBoneOffsetApply\(\);[\s\S]*?scheduleTrainingJsonRefresh\(\);/);
assert.match(html, /const ALICIA_GROUND_Y = -0\.95/);
assert.match(html, /raycaster\.intersectObject\(vrmRoot, true\)/);
assert.match(html, /姿勢校正軌/);
assert.match(html, /BONE_PICK_ITEMS = Object\.freeze\(\[/);
assert.match(html, /value:\s*'upperChest'[\s\S]*?label:\s*'上胸'/);
assert.match(html, /value:\s*'leftToes'[\s\S]*?label:\s*'左腳趾'/);
assert.match(html, /value:\s*'rightToes'[\s\S]*?label:\s*'右腳趾'/);
assert.match(html, /option\.textContent = `\$\{index \+ 1\}\. \$\{item\.label\} \$\{item\.value\}`/);
assert.match(html, /class="bone-offset-slider"[\s\S]*?min="-180" max="180"/);
assert.match(html, /trainingBoneSelect'\)\.addEventListener\('change', renderBoneOffsetSliders/);
assert.match(html, /btnTrainingInferCalibration'\)\.addEventListener\('click', applyInferredCalibration/);
assert.match(html, /#gvhmrProgressBar[\s\S]*?background:\s*linear-gradient\(90deg,\s*var\(--accent\),\s*var\(--accent-2\)\)/);
assert.doesNotMatch(html, /var\(--warn\)/);

assert.doesNotMatch(html, /姿勢資料庫/);
assert.doesNotMatch(html, /Motion Quality Tuner/);
assert.doesNotMatch(html, /Auto Director/);

console.log('PASS test_pose_training_lab');
