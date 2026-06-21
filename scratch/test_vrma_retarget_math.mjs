import assert from 'node:assert/strict';
import { applyVrmaRestRotation } from '../js/MotionController.js';

const rest = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const values = new Float32Array([
  0, 0, 0, 1,
  Math.SQRT1_2, 0, 0, Math.SQRT1_2,
]);
const out = applyVrmaRestRotation(values, rest);

assert.deepEqual(Array.from(out.slice(0, 4)).map((v) => Number(v.toFixed(6))), [0, 0, 0.707107, 0.707107]);
assert.equal(out.length, values.length);
console.log('vrma retarget math ok');
