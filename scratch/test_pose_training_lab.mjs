import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const LAB_PATH = 'pose_training_lab.html';

function testLabHtmlFileExists() {
  assert.ok(existsSync(LAB_PATH), 'pose_training_lab.html file must exist');
}

function testLabHtmlContractElements() {
  const html = readFileSync(LAB_PATH, 'utf8');

  // Script tags check
  assert.match(html, /src="vendor\/three\.min\.js"/, 'must load three.min.js');
  assert.match(html, /src="vendor\/GLTFLoader\.js"/, 'must load GLTFLoader.js');
  assert.match(html, /src="vendor\/OrbitControls\.js"/, 'must load OrbitControls.js');
  assert.match(html, /src="vendor\/three-vrm\.min\.js"/, 'must load three-vrm.min.js');

  // HTML layout check
  assert.match(html, /id="viewport"/, 'must have viewport container');
  assert.match(html, /id="poseId"/, 'must have poseId input field');
  assert.match(html, /id="poseLabel"/, 'must have poseLabel input field');
  assert.match(html, /id="poseCategory"/, 'must have poseCategory select dropdown');
  assert.match(html, /id="poseModel"/, 'must have poseModel input field');
  assert.match(html, /id="boneSelect"/, 'must have boneSelect dropdown');
  assert.match(html, /id="mirrorMode"/, 'must have mirrorMode checkbox');
  assert.match(html, /id="boneSliders"/, 'must have boneSliders container');
  assert.match(html, /html,\s*body\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/, 'html/body must not create document-level scrolling');
  assert.match(html, /body\s*\{[\s\S]*height:\s*100vh;[\s\S]*overflow:\s*hidden;/, 'body must lock to the viewport height');
  assert.match(html, /\.topbar\s*\{[\s\S]*flex:\s*0\s+0\s+auto;/, 'topbar must not steal flexible stage height');
  assert.match(html, /\.main-layout\s*\{[\s\S]*overflow:\s*hidden;/, 'main layout must keep center stage from growing the document');
  assert.match(html, /\.viewport-container\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/, 'center viewport must stay inside the remaining screen height');
  assert.match(html, /#viewport\s*\{[\s\S]*display:\s*block;[\s\S]*min-height:\s*0;/, 'viewport must fill the center stage without adding scroll height');
  assert.match(html, /\.sidebar\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/, 'left pose library panel must own its scrolling');
  assert.match(html, /\.control-panel\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/, 'right control panel must own its scrolling');

  // QA panels check
  assert.match(html, /id="qaBalance"/, 'must have qaBalance range slider');
  assert.match(html, /id="qaSilhouette"/, 'must have qaSilhouette range slider');
  assert.match(html, /id="qaNoTpose"/, 'must have qaNoTpose checkbox');
  assert.match(html, /id="qaNoArmCross"/, 'must have qaNoArmCross checkbox');

  // Runtime QA check
  assert.match(html, /idleCompatibility/, 'must define idleCompatibility');
  assert.match(html, /clipCompatibility/, 'must define clipCompatibility');
  assert.match(html, /vrmaCompatibility/, 'must define vrmaCompatibility');
  assert.match(html, /transitionScore/, 'must define transitionScore');

  // Humanization check
  assert.match(html, /id="humanizationProfile"/, 'must have humanizationProfile dropdown');
  assert.match(html, /id="humanizationLevel"/, 'must have humanizationLevel dropdown');

  // Playground check
  assert.match(html, /id="btnPlaygroundL0"/, 'must have btnPlaygroundL0 button');
  assert.match(html, /id="badgePlaygroundBlink"/, 'must have badgePlaygroundBlink badge');
  assert.match(html, /id="btnTestTouchFace"/, 'must have btnTestTouchFace button');
  assert.match(html, /id="btnStopPlayground"/, 'must have btnStopPlayground button');

  // Motion Quality Tuner check
  assert.match(html, /Motion Quality Tuner/, 'must have Motion Quality Tuner panel');
  assert.match(html, /id="motionIntensity"/, 'must have motionIntensity control');
  assert.match(html, /id="breathingAmplitude"/, 'must have breathingAmplitude control');
  assert.match(html, /id="weightShiftAmplitude"/, 'must have weightShiftAmplitude control');
  assert.match(html, /id="shoulderRelax"/, 'must have shoulderRelax control');
  assert.match(html, /id="headDrift"/, 'must have headDrift control');
  assert.match(html, /id="gestureEase"/, 'must have gestureEase control');
  assert.match(html, /id="gestureDuration"/, 'must have gestureDuration control');
  assert.match(html, /id="idleAsymmetry"/, 'must have idleAsymmetry control');
  assert.match(html, /getMotionQualitySettings/, 'must collect motion quality settings');
  assert.match(html, /applyMotionQualityTuner/, 'must apply tuner settings live');
  assert.match(html, /motionQualityInputs/, 'must bind tuner input events');

  // Viewport bone picking check
  assert.match(html, /const\s+BONE_PICK_TARGETS\s*=\s*\[/, 'must define viewport bone picking targets');
  assert.match(html, /bone:\s*['"]hips['"]/, 'bone picking must include hips');
  assert.match(html, /bone:\s*['"]chest['"]/, 'bone picking must include chest');
  assert.match(html, /bone:\s*['"]rightHand['"]/, 'bone picking must include hands');
  assert.match(html, /function\s+projectBonePickTarget\s*\(/, 'must project bone targets into viewport space');
  assert.match(html, /function\s+findNearestBonePickTarget\s*\(/, 'must find nearest bone pick target');
  assert.match(html, /function\s+selectBoneFromViewportClick\s*\(/, 'must select a bone from viewport click');
  assert.match(html, /els\.boneSelect\.value\s*=\s*picked\.bone/, 'viewport click must update boneSelect');
  assert.match(html, /renderBoneSliders\(\)/, 'viewport click must refresh bone sliders');
  assert.match(html, /function\s+bindViewportBonePicking\s*\(/, 'must bind viewport bone picking');
  assert.match(html, /addEventListener\(\s*['"]click['"]\s*,\s*selectBoneFromViewportClick\s*\)/, 'must listen for viewport click events');
  assert.match(html, /bindViewportBonePicking\(\);/, 'must bind bone picking after mascot load');

  // Pose Lab camera framing check
  assert.match(html, /function\s+configurePoseLabCamera\s*\(\s*mascotInstance\s*\)/, 'must define Pose Lab camera framing helper');
  assert.match(html, /camera\.position\.set\(\s*0(?:\.0)?,\s*0\.48,\s*7\.2\s*\)/, 'must start with a lower and farther default camera distance');
  assert.match(html, /controls\.target\.set\(\s*0(?:\.0)?,\s*-0\.36,\s*0(?:\.0)?\s*\)/, 'must target the full body near the viewport center');
  assert.match(html, /await\s+mascot\.load\('models\/mascot\.vrm'\);\s*configurePoseLabCamera\(mascot\);/s, 'must apply Pose Lab camera framing after VRM load');

  // Auto Director check
  assert.match(html, /id="chkAutoDirector"/, 'must have chkAutoDirector checkbox');
  assert.match(html, /id="txtAutoDirectorStatus"/, 'must have txtAutoDirectorStatus readout');
  assert.match(html, /id="txtAutoDirectorTouchFaceSec"/, 'must have txtAutoDirectorTouchFaceSec readout');
  assert.match(html, /id="txtAutoDirectorCooldownSec"/, 'must have txtAutoDirectorCooldownSec readout');

  // Auto Director scheduler integration check
  assert.match(html, /import\s+\{\s*AutoDirectorLite\s*\}\s+from\s+['"]\.\/js\/AutoDirectorLite\.js['"]/, 'must import AutoDirectorLite');
  assert.match(html, /new\s+AutoDirectorLite/, 'must instantiate AutoDirectorLite');
  assert.match(html, /\.update\(/, 'must call update on AutoDirectorLite');
  assert.match(html, /\.notifyManualGesture\(/, 'must call notifyManualGesture on AutoDirectorLite');

  // Playground API calls check
  assert.match(html, /enableHumanization/, 'must call enableHumanization API');
  assert.match(html, /disableHumanization/, 'must call disableHumanization API');
  assert.match(html, /triggerGesture/, 'must call triggerGesture API');

  // Category options check
  assert.match(html, /value="standing"/, 'must have standing category option');
  assert.match(html, /value="walking"/, 'must have walking category option');
  assert.match(html, /value="crouching"/, 'must have crouching category option');
  assert.match(html, /value="stretch"/, 'must have stretch category option');
  assert.match(html, /value="touch_face"/, 'must have touch_face category option');
  assert.match(html, /value="breathing"/, 'must have breathing category option');

  // Action buttons check
  assert.match(html, /id="btnSavePose"/, 'must have btnSavePose button');
  assert.match(html, /id="btnCreateNew"/, 'must have btnCreateNew button');
  assert.match(html, /id="btnResetBone"/, 'must have btnResetBone button');
  assert.match(html, /id="btnResetAll"/, 'must have btnResetAll button');

  // ES module script import check
  assert.match(html, /import\s+\{\s*VrmMascot\s*\}\s+from\s+['"]\.\/js\/VrmMascot\.js['"]/, 'must import VrmMascot');
  assert.match(html, /fetch\(\s*['"]\/api\/pose-library['"]\s*\)/, 'must fetch manifest');
  assert.match(html, /fetch\(\s*['"]\/api\/pose-library['"]\s*,\s*\{\s*method:\s*['"]POST['"]/, 'must support saving pose via POST');
}

function run() {
  console.log('Running test_pose_training_lab.mjs...');
  testLabHtmlFileExists();
  testLabHtmlContractElements();
  console.log('test_pose_training_lab: ok');
}

run();
