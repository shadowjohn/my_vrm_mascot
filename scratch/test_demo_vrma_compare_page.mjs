import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('demo_vrma_vs_pose_json.html'), 'utf8');

assert.match(html, /DirectVrmaPreview/);
assert.match(html, /@pixiv\/three-vrm-animation/);
assert.match(html, /createVRMAnimationClip/);
assert.match(html, /VRMAnimationLoaderPlugin/);
assert.match(html, /getRequestedPoseId/);
assert.match(html, /params\.get\('poseId'\)/);
assert.match(html, /params\.get\('postId'\)/);
assert.match(html, /vrm\.scene\.rotation\.y\s*=\s*Math\.PI/);
assert.match(html, /tunePosePreviewQuality/);
assert.doesNotMatch(html, /vrmaMascot\.motion\.playVrmaFile/);

console.log('demo vrma compare page ok');
