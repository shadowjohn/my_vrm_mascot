function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function cloneArray(values) {
  return Array.isArray(values) ? values.map((item) => item) : [];
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function pickPreferredMotion(sourceMotions) {
  const motions = uniqueSorted(sourceMotions);
  return motions[0] || 'none';
}

function buildRegistryEntry(motion) {
  const sourceMotions = uniqueSorted(motion.sourceMotions);
  const preferredMotion = pickPreferredMotion(sourceMotions);

  return {
    semanticMotionId: motion.id,
    displayName: motion.displayName || motion.id,
    category: motion.category || 'uncategorized',
    intentTags: cloneArray(motion.intentTags),
    agentTriggers: cloneArray(motion.agentTriggers),
    meanings: cloneArray(motion.meanings),
    recipes: cloneArray(motion.recipes),
    sourceMotions,
    preferredMotion,
    variants: [],
    confidence: Number.isFinite(motion.confidence) ? motion.confidence : 0,
    dataReady: sourceMotions.length > 0 && cloneArray(motion.recipes).length > 0,
    runtimeReady: false,
    runtimeStatus: 'data_ready',
    recipeSummary: motion.recipeSummary || '',
    poseHints: cloneObject(motion.poseHints),
  };
}

export function buildSemanticMotionRegistry(libraryDocument = {}) {
  const motions = Array.isArray(libraryDocument.motions) ? libraryDocument.motions : [];
  const registry = {};

  for (const motion of motions.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (!motion?.id) {
      continue;
    }
    registry[motion.id] = buildRegistryEntry(motion);
  }

  return registry;
}

export function buildSemanticMotionRegistryDocument(libraryDocument = {}, options = {}) {
  const motions = buildSemanticMotionRegistry(libraryDocument);
  const motionEntries = Object.values(motions);
  const categoryCounts = {};
  let dataReadyCount = 0;
  let preferredMotionCount = 0;

  for (const entry of motionEntries) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    if (entry.dataReady) {
      dataReadyCount += 1;
    }
    if (entry.preferredMotion !== 'none') {
      preferredMotionCount += 1;
    }
  }

  return {
    schemaVersion: 1,
    phase: 'M6.11 Semantic Motion Registry',
    source: 'semantic_motion_library.json',
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: {
      totalMotions: motionEntries.length,
      dataReadyCount,
      preferredMotionCount,
      runtimePlaybackReadyCount: 0,
      categoryCounts,
      motionIds: Object.keys(motions),
    },
    motions,
  };
}
