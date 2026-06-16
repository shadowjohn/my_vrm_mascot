import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/SemanticMotionPreviewBridge.js';

async function importBridge() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function decision(overrides = {}) {
  return {
    semanticMotionId: 'cross_no',
    variantId: 'cross_no.default.medium',
    preferredMotion: 'Clapping.vrma',
    runtimeStatus: 'data_ready',
    runtimeReady: false,
    constraints: {
      upperBodyOnly: true,
      avoidFaceCover: true,
      runtimePlaybackReadyOnly: false,
    },
    reason: 'matched preferred registry motion; runtime playback not enabled',
    confidence: 0.92,
    source: 'semantic_motion_registry',
    ...overrides,
  };
}

async function testDecisionWithPreferredMotionCanPreviewInLab() {
  const { buildSemanticMotionPreviewRequest } = await importBridge();

  const preview = buildSemanticMotionPreviewRequest(decision());

  assert.equal(preview.ok, true);
  assert.equal(preview.semanticMotionId, 'cross_no');
  assert.equal(preview.variantId, 'cross_no.default.medium');
  assert.equal(preview.preferredMotion, 'Clapping.vrma');
  assert.equal(preview.previewMode, 'lab');
  assert.equal(preview.reason, 'lab_preview_allowed');
}

async function testRuntimeReadyFalseStillAllowsLabPreview() {
  const { canPreviewSemanticMotionVariant } = await importBridge();

  const result = canPreviewSemanticMotionVariant(decision({
    runtimeReady: false,
    runtimeStatus: 'data_ready',
  }));

  assert.equal(result.ok, true);
}

async function testRuntimePlaybackReadyOnlyBlocksPreview() {
  const { buildSemanticMotionPreviewRequest } = await importBridge();

  const preview = buildSemanticMotionPreviewRequest(decision({
    constraints: {
      runtimePlaybackReadyOnly: true,
    },
  }));

  assert.equal(preview.ok, false);
  assert.equal(preview.reason, 'runtime_playback_ready_only');
}

async function testUnknownOrNullDecisionDoesNotPreview() {
  const { buildSemanticMotionPreviewRequest } = await importBridge();

  assert.equal(buildSemanticMotionPreviewRequest(null).ok, false);
  assert.equal(buildSemanticMotionPreviewRequest({}).ok, false);
  assert.equal(buildSemanticMotionPreviewRequest({ semanticMotionId: 'x' }).ok, false);
}

async function testBridgeDoesNotExposeActingRuntimeTerms() {
  const { buildSemanticMotionPreviewRequest } = await importBridge();
  const preview = buildSemanticMotionPreviewRequest(decision());
  const source = readFileSync(MODULE_PATH, 'utf8');

  assert.equal('actingState' in preview, false);
  assert.equal('performIntent' in preview, false);
  assert.equal('clip' in preview, false);
  assert.doesNotMatch(source, /ActingPolicy|ActionQueue|ActingBridge|performIntent/);
}

await testDecisionWithPreferredMotionCanPreviewInLab();
await testRuntimeReadyFalseStillAllowsLabPreview();
await testRuntimePlaybackReadyOnlyBlocksPreview();
await testUnknownOrNullDecisionDoesNotPreview();
await testBridgeDoesNotExposeActingRuntimeTerms();

console.log('test_semantic_motion_preview_bridge: ok');
