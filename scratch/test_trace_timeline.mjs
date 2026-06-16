import assert from 'node:assert/strict';
import { ActionQueue } from '../js/ActionQueue.js';
import {
  createIntentTrace,
  updateTraceStep,
} from '../js/VrmMascot.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getStep(trace, step) {
  return trace.find((item) => item.step === step);
}

function makeFakeMascot(executeHandler) {
  const traceUpdates = [];

  return {
    traceUpdates,
    state: {
      cancelCurrentState() {},
    },
    dispatch(_name, params = {}) {
      params.onComplete?.();
    },
    performIntent() {},
    emitIntentUpdate() {},
    memory: {
      add() {},
    },
    tools: {
      execute: executeHandler,
    },
    updateIntentTrace(intentObj, step, patch) {
      updateTraceStep(intentObj, step, patch);
      traceUpdates.push({
        step,
        status: getStep(intentObj.trace, step)?.status,
        reason: getStep(intentObj.trace, step)?.reason,
      });
    },
  };
}

async function runToolAction(executeHandler, actionOverrides = {}) {
  const intentObj = {
    action: 'download_report',
    tool: 'download_report',
    parameters: { featureId: 'PIPE-008' },
    trace: createIntentTrace({
      isTool: true,
      selfHealStatus: 'healed',
      selfHealArgs: ['featureId'],
      policyStatus: 'ok',
      executeStatus: 'pending',
    }),
  };

  const mascot = makeFakeMascot(executeHandler);
  const queue = new ActionQueue(mascot);
  const result = await new Promise((resolve) => {
    queue.enqueue({
      type: 'tool',
      name: 'download_report',
      args: { featureId: 'PIPE-008' },
      timeout: 80,
      intentObj,
      onToolComplete: resolve,
      ...actionOverrides,
    });
  });

  await sleep(0);
  return { result, intentObj, mascot };
}

async function testCreateNormalToolTrace() {
  const trace = createIntentTrace({
    isTool: true,
    selfHealStatus: 'healed',
    selfHealArgs: ['featureId'],
    policyStatus: 'ok',
    executeStatus: 'pending',
  });

  assert.deepEqual(trace, [
    { step: 'normalize', status: 'ok' },
    { step: 'self_heal', status: 'healed', args: ['featureId'] },
    { step: 'policy_check', status: 'ok' },
    { step: 'execute_tool', status: 'pending' },
  ]);
}

async function testCreateBlockedTrace() {
  const trace = createIntentTrace({
    isTool: true,
    selfHealStatus: 'skipped',
    policyStatus: 'blocked',
    policyReason: 'target_prefix_not_allowed',
    executeStatus: 'skipped',
    executeReason: 'policy_blocked',
  });

  assert.deepEqual(trace, [
    { step: 'normalize', status: 'ok' },
    { step: 'self_heal', status: 'skipped' },
    { step: 'policy_check', status: 'blocked', reason: 'target_prefix_not_allowed' },
    { step: 'execute_tool', status: 'skipped', reason: 'policy_blocked' },
  ]);
}

async function testCreateNonToolTrace() {
  const trace = createIntentTrace({ isTool: false });

  assert.deepEqual(trace, [
    { step: 'normalize', status: 'ok' },
    { step: 'self_heal', status: 'none' },
    { step: 'policy_check', status: 'none' },
    { step: 'execute_tool', status: 'none' },
  ]);
}

async function testActionQueueMarksToolDone() {
  const { result, intentObj, mascot } = await runToolAction(async () => ({
    ok: true,
  }));

  assert.equal(result.ok, true);
  assert.equal(getStep(intentObj.trace, 'execute_tool').status, 'done');
  assert.deepEqual(
    mascot.traceUpdates
      .filter((item) => item.step === 'execute_tool')
      .map((item) => item.status),
    ['running', 'done']
  );
}

async function testActionQueueMarksToolFailedResponse() {
  const { result, intentObj, mascot } = await runToolAction(async () => ({
    ok: false,
    error: 'download failed',
  }));

  assert.equal(result.ok, false);
  assert.equal(getStep(intentObj.trace, 'execute_tool').status, 'failed');
  assert.deepEqual(
    mascot.traceUpdates
      .filter((item) => item.step === 'execute_tool')
      .map((item) => item.status),
    ['running', 'failed']
  );
}

async function testActionQueueMarksToolTimeout() {
  const { result, intentObj } = await runToolAction(
    () => new Promise(() => {}),
    { timeout: 20 }
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /timeout/i);
  assert.equal(getStep(intentObj.trace, 'execute_tool').status, 'failed');
  assert.equal(getStep(intentObj.trace, 'execute_tool').reason, 'timeout');
}

const tests = [
  testCreateNormalToolTrace,
  testCreateBlockedTrace,
  testCreateNonToolTrace,
  testActionQueueMarksToolDone,
  testActionQueueMarksToolFailedResponse,
  testActionQueueMarksToolTimeout,
];

for (const test of tests) {
  await test();
  console.log(`PASS ${test.name}`);
}
