import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SkeletonSequenceAdapter } from '../js/SkeletonSequenceAdapter.js';

const sampleText = readFileSync('motions/capture_samples/walk_reference_001.json', 'utf8');
const adapter = new SkeletonSequenceAdapter({ sourceId: 'walk_reference_001' });
const result = adapter.loadFromText(sampleText);

assert.equal(result.ok, true);
assert.equal(result.sequence.id, 'walk_reference_001');
assert.equal(result.sequence.sourceType, 'skeleton_json');
assert.equal(result.sequence.frames.length, 9);
assert.equal(result.sequence.frames[0].frameIndex, 0);
assert.equal(result.sequence.frames[8].timeMs, 960);
assert.equal(result.durationMs, 960);

const frameAt240 = adapter.getFrameAtMs(result.sequence, 250);
assert.equal(frameAt240.frameIndex, 2);
assert.equal(frameAt240.timeMs, 240);

const badJson = adapter.loadFromText('{');
assert.equal(badJson.ok, false);
assert.equal(badJson.reason, 'invalid_json');

const badSequence = adapter.load({ id: 'empty', sourceType: 'skeleton_json', frames: [] });
assert.equal(badSequence.ok, false);
assert.equal(badSequence.reason, 'empty_frames');

const nullSequence = adapter.load(null);
assert.equal(nullSequence.ok, false);
assert.equal(nullSequence.reason, 'invalid_sequence');

const objectFrames = adapter.load({ id: 'bad', sourceType: 'skeleton_json', frames: {} });
assert.equal(objectFrames.ok, false);
assert.equal(objectFrames.reason, 'empty_frames');

const nullText = adapter.loadFromText('null');
assert.equal(nullText.ok, false);
assert.equal(nullText.reason, 'invalid_sequence');

const objectFramesText = adapter.loadFromText('{"id":"bad","sourceType":"skeleton_json","frames":{}}');
assert.equal(objectFramesText.ok, false);
assert.equal(objectFramesText.reason, 'empty_frames');

const nullFrame = adapter.load({ id: 'bad', sourceType: 'skeleton_json', frames: [null] });
assert.equal(nullFrame.ok, false);
assert.equal(nullFrame.reason, 'invalid_frame');

const missingLandmarks = adapter.load({ id: 'bad', sourceType: 'skeleton_json', frames: [{ timeMs: 0 }] });
assert.equal(missingLandmarks.ok, false);
assert.equal(missingLandmarks.reason, 'missing_landmarks');

console.log('PASS test_skeleton_sequence_adapter');
