import assert from 'node:assert/strict';
import { SceneObjectAdapter } from '../js/SceneObjectAdapter.js';

function testRegistersObjectAndListsDeterministically() {
  const adapter = new SceneObjectAdapter();

  assert.equal(adapter.registerObject('warning_probe', {
    label: 'Warning Probe',
    type: 'prop',
    verbs: { warn: { eventId: 'warn_warning_probe' } },
  }).ok, true);
  assert.equal(adapter.registerObject('cake', {
    label: 'Birthday Cake',
    type: 'prop',
    verbs: { celebrate: { eventId: 'birthday_cake' } },
  }).ok, true);

  assert.deepEqual(
    adapter.listObjects().map((object) => object.id),
    ['cake', 'warning_probe']
  );
}

function testReturnsObjectById() {
  const adapter = new SceneObjectAdapter();
  const position = () => ({ x: 1, y: 2, z: 3 });

  adapter.registerObject('release_box', {
    label: 'Release Box',
    type: 'prop',
    position,
    verbs: { inspect: { eventId: 'inspect_release_box' } },
  });

  const object = adapter.getObject('release_box');
  assert.equal(object.id, 'release_box');
  assert.equal(object.label, 'Release Box');
  assert.equal(object.position, position);
}

function testRejectsDuplicateIdUnlessReplaced() {
  const adapter = new SceneObjectAdapter();

  assert.equal(adapter.registerObject('cake', {
    label: 'Birthday Cake',
    verbs: { focus: { eventId: 'focus_cake' } },
  }).ok, true);

  const duplicate = adapter.registerObject('cake', {
    label: 'Duplicate Cake',
    verbs: { focus: { eventId: 'focus_duplicate_cake' } },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate_object');

  const replaced = adapter.registerObject('cake', {
    label: 'Replacement Cake',
    verbs: { focus: { eventId: 'focus_replacement_cake' } },
  }, { replace: true });
  assert.equal(replaced.ok, true);
  assert.equal(adapter.getObject('cake').label, 'Replacement Cake');
}

function testReturnsUnknownObject() {
  const adapter = new SceneObjectAdapter();

  const result = adapter.perform('focus', 'missing_object');

  assert.deepEqual(result, {
    ok: false,
    reason: 'unknown_object',
    objectId: 'missing_object',
    verb: 'focus',
  });
}

function testReturnsUnknownVerb() {
  const adapter = new SceneObjectAdapter();
  adapter.registerObject('cake', {
    label: 'Birthday Cake',
    verbs: { celebrate: { eventId: 'birthday_cake' } },
  });

  const result = adapter.perform('warn', 'cake');

  assert.deepEqual(result, {
    ok: false,
    reason: 'unknown_verb',
    objectId: 'cake',
    verb: 'warn',
  });
}

function testPerformCallbackReceivesObjectAndVerbMetadata() {
  const calls = [];
  const adapter = new SceneObjectAdapter({
    onPerform: (context) => {
      calls.push(context);
      return 'callback-result';
    },
  });

  adapter.registerObject('cake', {
    label: 'Birthday Cake',
    type: 'prop',
    verbs: {
      celebrate: {
        eventId: 'birthday_cake',
        event: { id: 'birthday_cake', topic: 'cake', prop: 'birthdayCake' },
      },
    },
  });

  const result = adapter.perform('celebrate', 'cake', { source: 'unit-test' });

  assert.equal(result.ok, true);
  assert.equal(result.objectId, 'cake');
  assert.equal(result.verb, 'celebrate');
  assert.deepEqual(result.event, { id: 'birthday_cake', topic: 'cake', prop: 'birthdayCake' });
  assert.equal(result.callbackResult, 'callback-result');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].object.id, 'cake');
  assert.equal(calls[0].verb, 'celebrate');
  assert.equal(calls[0].verbConfig.eventId, 'birthday_cake');
  assert.deepEqual(calls[0].meta, { source: 'unit-test' });
}

function testSupportsDomOnlyObjectsWithoutObject3d() {
  const adapter = new SceneObjectAdapter();
  const domElement = { dataset: { sceneObject: 'asset_manifest_panel' } };

  adapter.registerObject('asset_manifest_panel', {
    label: 'Asset Manifest Panel',
    type: 'dom',
    domElement,
    verbs: { inspect: { eventId: 'inspect_asset_manifest_panel' } },
  });

  const object = adapter.getObject('asset_manifest_panel');
  assert.equal(object.object3d, undefined);
  assert.equal(object.domElement, domElement);
  assert.equal(adapter.perform('inspect', 'asset_manifest_panel').ok, true);
}

async function run() {
  const tests = [
    testRegistersObjectAndListsDeterministically,
    testReturnsObjectById,
    testRejectsDuplicateIdUnlessReplaced,
    testReturnsUnknownObject,
    testReturnsUnknownVerb,
    testPerformCallbackReceivesObjectAndVerbMetadata,
    testSupportsDomOnlyObjectsWithoutObject3d,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
