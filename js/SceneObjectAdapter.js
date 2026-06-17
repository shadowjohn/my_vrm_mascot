function normalizeId(id) {
  return String(id || '').trim();
}

function cloneVerbConfig(config) {
  if (!config || typeof config !== 'object') return config;
  if (typeof config === 'function') return config;
  return { ...config };
}

function cloneSceneObject(object) {
  if (!object) return null;
  const verbs = {};
  for (const [verb, config] of Object.entries(object.verbs || {})) {
    verbs[verb] = cloneVerbConfig(config);
  }
  return {
    ...object,
    verbs,
  };
}

function resolveVerbEvent(verbConfig, context) {
  if (typeof verbConfig === 'function') {
    return verbConfig(context);
  }
  if (!verbConfig || typeof verbConfig !== 'object') {
    return null;
  }
  if (typeof verbConfig.event === 'function') {
    return verbConfig.event(context);
  }
  if ('event' in verbConfig) {
    return verbConfig.event;
  }
  if (verbConfig.eventId) {
    return {
      id: verbConfig.eventId,
      eventId: verbConfig.eventId,
    };
  }
  return null;
}

export class SceneObjectAdapter {
  #objects = new Map();
  #onPerform = null;

  constructor(options = {}) {
    this.#onPerform = typeof options.onPerform === 'function' ? options.onPerform : null;
  }

  registerObject(id, config = {}, options = {}) {
    const objectId = normalizeId(id);
    if (!objectId) {
      return { ok: false, reason: 'invalid_object_id', objectId };
    }
    if (this.#objects.has(objectId) && !options.replace) {
      return { ok: false, reason: 'duplicate_object', objectId };
    }

    const object = {
      ...config,
      id: objectId,
      label: config.label || objectId,
      type: config.type || 'scene_object',
      verbs: { ...(config.verbs || {}) },
    };
    this.#objects.set(objectId, object);
    return { ok: true, objectId, object: cloneSceneObject(object) };
  }

  listObjects() {
    return Array.from(this.#objects.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((object) => cloneSceneObject(object));
  }

  getObject(id) {
    return cloneSceneObject(this.#objects.get(normalizeId(id)));
  }

  perform(verb, objectId, meta = {}) {
    const normalizedObjectId = normalizeId(objectId);
    const normalizedVerb = normalizeId(verb);
    const object = this.#objects.get(normalizedObjectId);
    if (!object) {
      return {
        ok: false,
        reason: 'unknown_object',
        objectId: normalizedObjectId,
        verb: normalizedVerb,
      };
    }

    const verbConfig = object.verbs?.[normalizedVerb];
    if (!verbConfig) {
      return {
        ok: false,
        reason: 'unknown_verb',
        objectId: normalizedObjectId,
        verb: normalizedVerb,
      };
    }

    const publicObject = cloneSceneObject(object);
    const context = {
      adapter: this,
      object: publicObject,
      objectId: normalizedObjectId,
      verb: normalizedVerb,
      verbConfig: cloneVerbConfig(verbConfig),
      meta,
    };
    const event = resolveVerbEvent(verbConfig, context);
    const result = {
      ok: true,
      objectId: normalizedObjectId,
      verb: normalizedVerb,
      event,
    };
    const callback = typeof meta.onPerform === 'function' ? meta.onPerform : this.#onPerform;
    if (callback) {
      result.callbackResult = callback({
        ...context,
        event,
      });
    }
    return result;
  }
}
