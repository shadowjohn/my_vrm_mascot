import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODULE_PATH = 'js/SemanticMotionVariantSelector.js';
const REGISTRY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_registry.json';

async function importSelector() {
  return import(`${pathToFileURL(MODULE_PATH).href}?t=${Date.now()}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function registryFixture() {
  return {
    schemaVersion: 1,
    motions: {
      cross_no: {
        semanticMotionId: 'cross_no',
        displayName: '交叉制止 / 不可以',
        category: 'warning',
        recipes: ['cross_no'],
        sourceMotions: ['Clapping.vrma', 'Other.vrma'],
        preferredMotion: 'Clapping.vrma',
        variants: [],
        confidence: 0.96,
        dataReady: true,
        runtimeReady: false,
        runtimeStatus: 'data_ready',
      },
    },
  };
}

function assertDecisionShape(decision) {
  assert.equal(typeof decision.semanticMotionId, 'string');
  assert.equal(typeof decision.variantId, 'string');
  assert.equal(typeof decision.preferredMotion, 'string');
  assert.equal(typeof decision.runtimeStatus, 'string');
  assert.equal(typeof decision.reason, 'string');
  assert.equal(typeof decision.confidence, 'number');
}

async function testSelectsPreferredMotionWithDefaultStyleAndMediumIntensity() {
  const { selectSemanticMotionVariant } = await importSelector();

  const decision = selectSemanticMotionVariant({ semanticMotionId: 'cross_no' }, registryFixture());

  assertDecisionShape(decision);
  assert.equal(decision.semanticMotionId, 'cross_no');
  assert.equal(decision.variantId, 'cross_no.default.medium');
  assert.equal(decision.style, 'default');
  assert.equal(decision.intensity, 'medium');
  assert.equal(decision.preferredMotion, 'Clapping.vrma');
  assert.equal(decision.runtimeStatus, 'data_ready');
  assert.equal(decision.runtimeReady, false);
  assert.match(decision.reason, /preferred registry motion/i);
  assert.ok(decision.confidence >= 0.8);
}

async function testRealRegistryKeepsShyHeadTouchPreferredMotion() {
  const { selectSemanticMotionVariant } = await importSelector();
  const registry = readJson(REGISTRY_PATH);

  const decision = selectSemanticMotionVariant({ semanticMotionId: 'shy_head_touch' }, registry);

  assertDecisionShape(decision);
  assert.equal(decision.preferredMotion, 'Blush.vrma');
  assert.equal(decision.variantId, 'shy_head_touch.default.medium');
}

async function testRuntimePlaybackReadyOnlyReturnsNullWhenNotReady() {
  const { selectSemanticMotionVariant } = await importSelector();
  const decision = selectSemanticMotionVariant({
    semanticMotionId: 'cross_no',
    constraints: {
      runtimePlaybackReadyOnly: true,
    },
  }, registryFixture());

  assert.equal(decision, null);
}

async function testUnknownSemanticMotionReturnsNull() {
  const { selectSemanticMotionVariant } = await importSelector();
  const decision = selectSemanticMotionVariant({ semanticMotionId: 'not_real' }, registryFixture());

  assert.equal(decision, null);
}

async function testSelectorIsDeterministicAndDoesNotMutateRegistry() {
  const { selectSemanticMotionVariant } = await importSelector();
  const registry = registryFixture();
  const before = JSON.stringify(registry);
  const request = {
    semanticMotionId: 'cross_no',
    style: 'cute',
    intensity: 'high',
    constraints: {
      upperBodyOnly: true,
      avoidFaceCover: true,
      runtimePlaybackReadyOnly: false,
    },
  };

  const a = selectSemanticMotionVariant(request, registry);
  const b = selectSemanticMotionVariant(request, registry);

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(registry), before);
  assert.equal(a.variantId, 'cross_no.cute.high');
  assert.deepEqual(a.constraints, {
    upperBodyOnly: true,
    avoidFaceCover: true,
    runtimePlaybackReadyOnly: false,
  });
}

await testSelectsPreferredMotionWithDefaultStyleAndMediumIntensity();
await testRealRegistryKeepsShyHeadTouchPreferredMotion();
await testRuntimePlaybackReadyOnlyReturnsNullWhenNotReady();
await testUnknownSemanticMotionReturnsNull();
await testSelectorIsDeterministicAndDoesNotMutateRegistry();

console.log('test_semantic_motion_variant_selector: ok');
