import assert from 'node:assert/strict';
import {
  PoseEstimatorRegistry,
  createMediaPipePoseAdapter,
  createMoveNetPoseAdapter,
  createYoloPoseAdapter
} from '../js/PoseEstimatorAdapters.js';

const registry = new PoseEstimatorRegistry();
registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }));
registry.register('movenet', createMoveNetPoseAdapter({ detector: null }));
registry.register('yolo_pose', createYoloPoseAdapter({ detector: null }));

assert.deepEqual(registry.list().map((entry) => entry.id), [
  'mediapipe_pose',
  'movenet',
  'yolo_pose'
]);

assert.equal(registry.get('mediapipe_pose').label, 'MediaPipe Pose');
assert.equal(registry.get('mediapipe_pose').isAvailable, false);
assert.equal(registry.get('missing'), null);

const duplicate = registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }));
assert.equal(duplicate.ok, false);
assert.equal(duplicate.reason, 'duplicate_adapter');

const replaced = registry.register('mediapipe_pose', createMediaPipePoseAdapter({ poseLandmarker: null }), { replace: true });
assert.equal(replaced.ok, true);

const unavailable = await registry.get('mediapipe_pose').estimateFrame({ currentTime: 0 });
assert.equal(unavailable.ok, false);
assert.equal(unavailable.reason, 'pose_estimator_unavailable');

const mediaPipeRaw = { pose: 'mediapipe' };
const mediaPipeAdapter = createMediaPipePoseAdapter({
  poseLandmarker: {
    detectForVideo(videoElement, timestampMs) {
      assert.deepEqual(videoElement, { frame: 'media' });
      assert.equal(timestampMs, 123);
      return mediaPipeRaw;
    }
  }
});
const mediaPipeResult = await mediaPipeAdapter.estimateFrame({ frame: 'media' }, 123);
assert.equal(mediaPipeAdapter.isAvailable, true);
assert.equal(mediaPipeResult.ok, true);
assert.equal(mediaPipeResult.raw, mediaPipeRaw);

const moveNetRaw = [{ pose: 'movenet' }];
const moveNetAdapter = createMoveNetPoseAdapter({
  detector: {
    async estimatePoses(input) {
      assert.deepEqual(input, { frame: 'move' });
      return moveNetRaw;
    }
  }
});
const moveNetResult = await moveNetAdapter.estimateFrame({ frame: 'move' }, 456);
assert.equal(moveNetAdapter.isAvailable, true);
assert.equal(moveNetResult.ok, true);
assert.equal(moveNetResult.raw, moveNetRaw);

const yoloRaw = [{ pose: 'yolo' }];
const yoloAdapter = createYoloPoseAdapter({
  detector: {
    async detect(input) {
      assert.deepEqual(input, { frame: 'yolo' });
      return yoloRaw;
    }
  }
});
const yoloResult = await yoloAdapter.estimateFrame({ frame: 'yolo' }, 789);
assert.equal(yoloAdapter.isAvailable, true);
assert.equal(yoloResult.ok, true);
assert.equal(yoloResult.raw, yoloRaw);

const malformedMediaPipeAdapter = createMediaPipePoseAdapter({ poseLandmarker: {} });
const malformedMediaPipeResult = await malformedMediaPipeAdapter.estimateFrame({ frame: 'bad-media' });
assert.equal(malformedMediaPipeAdapter.isAvailable, false);
assert.equal(malformedMediaPipeResult.reason, 'pose_estimator_unavailable');

const malformedMoveNetAdapter = createMoveNetPoseAdapter({ detector: { estimatePoses: null } });
assert.equal(malformedMoveNetAdapter.isAvailable, false);

const malformedYoloAdapter = createYoloPoseAdapter({ detector: {} });
assert.equal(malformedYoloAdapter.isAvailable, false);

console.log('PASS test_pose_estimator_adapters');
