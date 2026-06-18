import assert from 'node:assert/strict';
import { LookAtController } from '../js/LookAtController.js';

function bone() {
  return { rotation: { x: 0, y: 0, z: 0 } };
}

const head = bone();
const neck = bone();
const ctrl = new LookAtController();
ctrl.setVrm({
  humanoid: {
    getBoneNode(name) {
      return name === 'head' ? head : name === 'neck' ? neck : null;
    }
  }
});

ctrl.setPreviewGaze({ yawDegrees: 20, pitchDegrees: -10, confidence: 0.8 });
ctrl.update(0.016);

assert.ok(head.rotation.y > 0.2, `head yaw should be positive, got ${head.rotation.y}`);
assert.ok(neck.rotation.y > 0.05, `neck yaw should be positive, got ${neck.rotation.y}`);
assert.ok(head.rotation.x < -0.1, `head pitch should be negative, got ${head.rotation.x}`);
assert.equal(ctrl.debugValues.mode, 'preview');

ctrl.setPreviewGaze({ yawDegrees: 40, pitchDegrees: 20, confidence: 0.1 });
ctrl.update(0.016);
assert.ok(Math.abs(head.rotation.y) < 0.001);
assert.equal(ctrl.debugValues.mode, 'preview_low_confidence');

console.log('PASS test_look_at_preview_gaze');
