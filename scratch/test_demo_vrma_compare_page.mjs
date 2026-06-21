import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('demo_vrma_vs_pose_json.html'), 'utf8');

assert.match(html, /DirectVrmaPreview/);
assert.match(html, /@pixiv\/three-vrm-animation/);
assert.match(html, /createVRMAnimationClip/);
assert.match(html, /VRMAnimationLoaderPlugin/);
assert.doesNotMatch(html, /vrmaMascot\.motion\.playVrmaFile/);

console.log('demo vrma compare page ok');
