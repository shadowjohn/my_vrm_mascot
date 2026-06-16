import assert from 'node:assert/strict';
import { createSuggestedActions } from '../js/VrmMascot.js';

function makeHarness(options = {}) {
  const tools = new Set(options.tools || ['query_pipe', 'query_cctv', 'download_report']);
  const blockedTools = new Set(options.blockedTools || []);
  const mapCalls = [];

  return {
    mapCalls,
    hasTool(name) {
      return tools.has(name);
    },
    checkPolicy(toolName, parameters) {
      if (blockedTools.has(toolName)) {
        return { ok: false, reason: 'blocked_for_test' };
      }
      if (!parameters || Object.values(parameters).some(value => value === undefined || value === null || value === '')) {
        return { ok: false, reason: 'missing_required_arg' };
      }
      return { ok: true };
    },
    mapCenterToGridXY(mapCenter) {
      mapCalls.push(mapCenter);
      return { x: 120650, y: 24150 };
    },
  };
}

function getAction(actions, id) {
  return actions.find(action => action.id === id);
}

function assertNoArgsShape(action) {
  assert.equal(Object.hasOwn(action, 'args'), false);
  assert.equal(Object.hasOwn(action.intentPayload, 'args'), false);
}

function testNoSelectedFeatureReturnsEmptyActions() {
  const harness = makeHarness();
  const actions = createSuggestedActions({
    spatialContext: {
      selectedFeature: 'none',
      activeLayer: 'none',
      mapCenter: [120.6, 24.1],
    },
    ...harness,
  });

  assert.deepEqual(actions, []);
  assert.deepEqual(harness.mapCalls, []);
}

function testPipeFeatureReturnsPipeDetailsAndReportActions() {
  const harness = makeHarness();
  const actions = createSuggestedActions({
    spatialContext: {
      selectedFeature: 'PIPE-008',
      activeLayer: 'sewer',
      mapCenter: [120.65, 24.15],
    },
    ...harness,
  });

  assert.deepEqual(actions.map(action => action.id), ['pipe_details', 'download_report']);
  assert.deepEqual(harness.mapCalls, [[120.65, 24.15]]);

  const pipeDetails = getAction(actions, 'pipe_details');
  assert.equal(pipeDetails.tool, 'query_pipe');
  assert.equal(pipeDetails.target, 'PIPE-008');
  assert.deepEqual(pipeDetails.parameters, { x: 120650, y: 24150 });
  assert.deepEqual(pipeDetails.intentPayload.parameters, { x: 120650, y: 24150 });
  assert.equal(pipeDetails.intentPayload.action, 'query_pipe');
  assertNoArgsShape(pipeDetails);

  const report = getAction(actions, 'download_report');
  assert.equal(report.tool, 'download_report');
  assert.deepEqual(report.parameters, { featureId: 'PIPE-008' });
  assert.deepEqual(report.intentPayload.parameters, { featureId: 'PIPE-008' });
  assert.equal(report.intentPayload.action, 'download_report');
  assertNoArgsShape(report);
}

function testCctvFeatureReturnsCctvStatusAndReportActions() {
  const harness = makeHarness();
  const actions = createSuggestedActions({
    spatialContext: {
      selectedFeature: 'CCTV-042',
      activeLayer: 'monitoring',
      mapCenter: [120.63, 24.16],
    },
    ...harness,
  });

  assert.deepEqual(actions.map(action => action.id), ['cctv_status', 'download_report']);
  assert.deepEqual(harness.mapCalls, [[120.63, 24.16]]);
  assert.equal(getAction(actions, 'cctv_status').tool, 'query_cctv');
  assert.deepEqual(getAction(actions, 'cctv_status').parameters, { x: 120650, y: 24150 });
  assert.deepEqual(getAction(actions, 'download_report').parameters, { featureId: 'CCTV-042' });
}

function testUnavailableToolsAreHidden() {
  const harness = makeHarness({ tools: ['download_report'] });
  const actions = createSuggestedActions({
    spatialContext: {
      selectedFeature: 'PIPE-008',
      activeLayer: 'sewer',
      mapCenter: [120.65, 24.15],
    },
    ...harness,
  });

  assert.deepEqual(actions.map(action => action.id), ['download_report']);
}

function testPolicyBlockedActionsAreHidden() {
  const harness = makeHarness({ blockedTools: ['download_report'] });
  const actions = createSuggestedActions({
    spatialContext: {
      selectedFeature: 'PIPE-008',
      activeLayer: 'sewer',
      mapCenter: [120.65, 24.15],
    },
    ...harness,
  });

  assert.deepEqual(actions.map(action => action.id), ['pipe_details']);
}

const tests = [
  testNoSelectedFeatureReturnsEmptyActions,
  testPipeFeatureReturnsPipeDetailsAndReportActions,
  testCctvFeatureReturnsCctvStatusAndReportActions,
  testUnavailableToolsAreHidden,
  testPolicyBlockedActionsAreHidden,
];

for (const test of tests) {
  test();
  console.log(`PASS ${test.name}`);
}
