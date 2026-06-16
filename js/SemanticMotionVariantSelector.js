const DEFAULT_STYLE = 'default';
const DEFAULT_INTENSITY = 'medium';

const DEFAULT_CONSTRAINTS = Object.freeze({
  upperBodyOnly: true,
  avoidFaceCover: true,
  runtimePlaybackReadyOnly: false,
});

function normalizeToken(value, fallback) {
  const token = String(value || '').trim().toLowerCase();
  return token || fallback;
}

function cloneConstraints(constraints = {}) {
  return {
    upperBodyOnly: constraints.upperBodyOnly ?? DEFAULT_CONSTRAINTS.upperBodyOnly,
    avoidFaceCover: constraints.avoidFaceCover ?? DEFAULT_CONSTRAINTS.avoidFaceCover,
    runtimePlaybackReadyOnly: constraints.runtimePlaybackReadyOnly ?? DEFAULT_CONSTRAINTS.runtimePlaybackReadyOnly,
  };
}

function getRegistryEntry(registry, semanticMotionId) {
  const motions = registry?.motions || {};
  return motions[semanticMotionId] || null;
}

function confidenceForEntry(entry) {
  const base = Number.isFinite(entry.confidence) ? entry.confidence : 0.5;
  const sourceBoost = Array.isArray(entry.sourceMotions) && entry.sourceMotions.length > 1 ? 0.04 : 0;
  const recipeBoost = Array.isArray(entry.recipes) && entry.recipes.length > 0 ? 0.03 : 0;
  return Math.round(Math.min(0.99, base + sourceBoost + recipeBoost) * 100) / 100;
}

export function selectSemanticMotionVariant(request = {}, registry = {}) {
  const semanticMotionId = String(request.semanticMotionId || '').trim();
  if (!semanticMotionId) {
    return null;
  }

  const entry = getRegistryEntry(registry, semanticMotionId);
  if (!entry) {
    return null;
  }

  const constraints = cloneConstraints(request.constraints);
  if (constraints.runtimePlaybackReadyOnly && !entry.runtimeReady) {
    return null;
  }

  const preferredMotion = entry.preferredMotion && entry.preferredMotion !== 'none'
    ? entry.preferredMotion
    : (entry.sourceMotions || [])[0];
  if (!preferredMotion) {
    return null;
  }

  const style = normalizeToken(request.style, DEFAULT_STYLE);
  const intensity = normalizeToken(request.intensity, DEFAULT_INTENSITY);
  const runtimeStatus = entry.runtimeStatus || (entry.runtimeReady ? 'playback_ready' : 'data_ready');

  return {
    semanticMotionId,
    variantId: `${semanticMotionId}.${style}.${intensity}`,
    style,
    intensity,
    preferredMotion,
    runtimeStatus,
    runtimeReady: !!entry.runtimeReady,
    constraints,
    reason: entry.runtimeReady
      ? 'matched preferred registry motion; runtime playback enabled'
      : 'matched preferred registry motion; runtime playback not enabled',
    confidence: confidenceForEntry(entry),
    source: 'semantic_motion_registry',
  };
}

export function rankSemanticMotionVariants(request = {}, registry = {}) {
  const semanticMotionId = String(request.semanticMotionId || '').trim();
  const entry = getRegistryEntry(registry, semanticMotionId);
  if (!entry) {
    return [];
  }

  const variants = Array.isArray(entry.variants) && entry.variants.length
    ? entry.variants
    : [{
        style: normalizeToken(request.style, DEFAULT_STYLE),
        intensity: normalizeToken(request.intensity, DEFAULT_INTENSITY),
      }];

  return variants
    .map((variant) => selectSemanticMotionVariant({
      ...request,
      style: variant.style || request.style,
      intensity: variant.intensity || request.intensity,
    }, registry))
    .filter(Boolean);
}

export { DEFAULT_CONSTRAINTS };
