const CONTEXT_SIGNAL_TAGS = Object.freeze({
  blocked: ['not_allowed', 'deny', 'reject', 'stop', 'warning'],
  failed: ['surprised', 'unexpected', 'pause'],
  running: ['thinking', 'analyzing', 'waiting', 'reasoning'],
  pending: ['thinking', 'waiting'],
  done: ['success', 'done', 'completed'],
});

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(' ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key} ${normalizeText(item)}`)
      .filter(Boolean)
      .join(' ');
  }
  return String(value || '').trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function includesText(haystack, needle) {
  if (!haystack || !needle) {
    return false;
  }
  return haystack.includes(needle) || needle.includes(haystack);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function requestSignals(request = {}) {
  const intent = normalizeText(request.intent || request.category);
  const trigger = normalizeText(request.trigger);
  const context = request.context || {};
  const contextText = normalizeText(context);
  const toolStatus = normalizeText(context.toolStatus);
  const selectedFeature = Boolean(context.selectedFeature);
  const statusTags = CONTEXT_SIGNAL_TAGS[toolStatus] || [];

  return {
    intent,
    trigger,
    contextText,
    toolStatus,
    selectedFeature,
    statusTags,
    allText: [intent, trigger, contextText, ...statusTags].filter(Boolean).join(' '),
  };
}

function scoreMotion(motion, signals) {
  const hits = [];
  let score = 0;
  const category = normalizeText(motion.category);
  const displayName = normalizeText(motion.displayName);
  const intentTags = (motion.intentTags || []).map(normalizeText);
  const meanings = (motion.meanings || []).map(normalizeText);
  const triggers = (motion.agentTriggers || []).map(normalizeText);
  const haystack = [
    category,
    displayName,
    ...intentTags,
    ...meanings,
    ...triggers,
  ].filter(Boolean);

  if (signals.intent && category === signals.intent) {
    score += 5.5;
    hits.push(`category:${signals.intent}`);
  } else if (signals.intent && intentTags.includes(signals.intent)) {
    score += 3.2;
    hits.push(`intent-tag:${signals.intent}`);
  }

  for (const tag of intentTags) {
    if (signals.intent && tag !== signals.intent && includesText(tag, signals.intent)) {
      score += 1.6;
      hits.push(`tag:${tag}`);
    }
    if (signals.trigger && includesText(signals.trigger, tag)) {
      score += 1.2;
      hits.push(`trigger-tag:${tag}`);
    }
  }

  for (const trigger of triggers) {
    if (signals.trigger && includesText(trigger, signals.trigger)) {
      score += 2.4;
      hits.push(`trigger:${trigger}`);
    }
  }

  for (const meaning of meanings) {
    if (signals.trigger && includesText(meaning, signals.trigger)) {
      score += 2;
      hits.push(`meaning:${meaning}`);
    }
  }

  for (const statusTag of signals.statusTags) {
    if (category === statusTag || intentTags.includes(statusTag)) {
      score += 1.8;
      hits.push(`status:${statusTag}`);
    }
  }

  if (signals.selectedFeature && (intentTags.includes('spatial_reference') || category === 'guide' || category === 'point')) {
    score += 0.9;
    hits.push('context:selectedFeature');
  }

  if (signals.allText) {
    for (const item of haystack) {
      if (item && includesText(signals.allText, item)) {
        score += 0.35;
      }
    }
  }

  if (motion.runtimeReady) {
    score += 0.25;
  }

  return {
    motion,
    score,
    hits: unique(hits),
  };
}

function confidenceFromScore(score, libraryConfidence) {
  if (score <= 0) {
    return 0;
  }
  const base = Math.min(0.98, 0.45 + score / 14);
  const libraryBoost = Math.max(0, Math.min(1, libraryConfidence || 0)) * 0.08;
  return round2(Math.min(0.99, base + libraryBoost));
}

export function pickSemanticMotion(request = {}, semanticLibrary = {}) {
  const motions = Array.isArray(semanticLibrary.motions) ? semanticLibrary.motions : [];
  if (motions.length === 0) {
    return null;
  }

  const signals = requestSignals(request);
  const scored = motions
    .map((motion) => scoreMotion(motion, signals))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const confidenceDiff = (b.motion.confidence || 0) - (a.motion.confidence || 0);
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }
      return a.motion.id.localeCompare(b.motion.id);
    });

  if (!scored.length) {
    return null;
  }

  const best = scored[0];
  const confidence = confidenceFromScore(best.score, best.motion.confidence);
  if (confidence < 0.5) {
    return null;
  }

  return {
    motionId: best.motion.id,
    displayName: best.motion.displayName,
    reason: `${request.intent || request.category || 'intent'} + ${request.trigger || 'context'} matched ${best.hits.join(', ')}`,
    confidence,
    source: 'semantic_motion_library',
  };
}

export function rankSemanticMotions(request = {}, semanticLibrary = {}) {
  const motions = Array.isArray(semanticLibrary.motions) ? semanticLibrary.motions : [];
  const signals = requestSignals(request);

  return motions
    .map((motion) => {
      const scored = scoreMotion(motion, signals);
      return {
        motionId: motion.id,
        displayName: motion.displayName,
        score: round2(scored.score),
        confidence: confidenceFromScore(scored.score, motion.confidence),
        hits: scored.hits,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.motionId.localeCompare(b.motionId);
    });
}
