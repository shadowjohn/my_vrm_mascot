const PROFILE_DEFINITIONS = {
  neutral: {
    values: {},
  },
  happy: {
    values: {
      joy: 0.82,
    },
  },
  thinking: {
    values: {
      fun: 0.22,
      sorrow: 0.12,
    },
  },
  surprised: {
    values: {
      fun: 0.72,
    },
  },
  sad: {
    values: {
      sorrow: 0.78,
    },
  },
  angry: {
    values: {
      angry: 0.72,
    },
  },
};

export const EXPRESSION_PROFILE_NAMES = Object.freeze([
  'neutral',
  'happy',
  'thinking',
  'surprised',
  'sad',
  'angry',
]);

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function cloneValues(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, clamp01(value)])
  );
}

export const ExpressionProfiles = Object.freeze(
  Object.fromEntries(
    EXPRESSION_PROFILE_NAMES.map((name) => [
      name,
      Object.freeze({
        name,
        values: Object.freeze(cloneValues(PROFILE_DEFINITIONS[name]?.values)),
      }),
    ])
  )
);

export function normalizeExpressionProfileName(name) {
  const key = String(name || '').trim().toLowerCase();
  return ExpressionProfiles[key] ? key : 'neutral';
}

export function getExpressionProfile(name) {
  return ExpressionProfiles[normalizeExpressionProfileName(name)];
}

export function clampExpressionWeight(value, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? clamp01(num) : clamp01(fallback);
}
