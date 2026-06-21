import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('demo_vrma.html'), 'utf8');

assert.match(html, /Alicia VRMA Demo/);
assert.match(html, /id="dropZone"/);
assert.match(html, /id="vrmaFile"/);
assert.match(html, /VRMAnimationLoaderPlugin/);
assert.match(html, /createVRMAnimationClip/);
assert.match(html, /URL\.createObjectURL/);
assert.match(html, /location\.search/);
assert.match(html, /loadVrmaUrl/);
assert.match(html, /loadFile/);
assert.match(html, /vrm\.scene\.rotation\.y\s*=\s*Math\.PI/);
assert.doesNotMatch(html, /motion\.playVrmaFile/);

console.log('demo vrma page ok');
