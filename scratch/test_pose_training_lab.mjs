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
