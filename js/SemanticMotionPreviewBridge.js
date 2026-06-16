function hasPreferredMotion(decision) {
  return typeof decision?.preferredMotion === 'string'
    && decision.preferredMotion.trim() !== ''
    && decision.preferredMotion !== 'none';
}

export function canPreviewSemanticMotionVariant(decision) {
  if (!decision || typeof decision !== 'object') {
    return {
      ok: false,
      reason: 'missing_decision',
    };
  }

  if (!decision.semanticMotionId) {
    return {
      ok: false,
      reason: 'missing_semantic_motion_id',
    };
  }

  if (!hasPreferredMotion(decision)) {
    return {
      ok: false,
      reason: 'missing_preferred_motion',
    };
  }

  if (decision.constraints?.runtimePlaybackReadyOnly && !decision.runtimeReady) {
    return {
      ok: false,
      reason: 'runtime_playback_ready_only',
    };
  }

  return {
    ok: true,
    reason: 'lab_preview_allowed',
  };
}

export function buildSemanticMotionPreviewRequest(decision) {
  const guard = canPreviewSemanticMotionVariant(decision);
  if (!guard.ok) {
    return {
      ok: false,
      reason: guard.reason,
    };
  }

  return {
    ok: true,
    previewMode: 'lab',
    semanticMotionId: decision.semanticMotionId,
    variantId: decision.variantId,
    preferredMotion: decision.preferredMotion,
    runtimeStatus: decision.runtimeStatus || 'data_ready',
    runtimeReady: !!decision.runtimeReady,
    reason: guard.reason,
    confidence: decision.confidence ?? 0,
  };
}
