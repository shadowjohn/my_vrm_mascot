export const UPPER_BODY_BONES = Object.freeze([
  'spine',
  'chest',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
]);

export const LOWER_BODY_PREVIEW_LOCK_BONES = Object.freeze([
  'hips',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot',
  'leftToes',
  'rightToes',
]);

export const MOTION_MINING_CATEGORIES = Object.freeze([
  'present',
  'point',
  'think',
  'warning',
  'success',
  'candidate_future',
  'reject',
]);

export const MOTION_MINING_REJECT_REASONS = Object.freeze([
  'too_large_motion',
  'hands_cover_face',
  'off_balance',
  'too_dance_like',
  'bad_silhouette',
  'arm_cross_body',
  'not_agentic',
  'costume_clip',
  'unclear_intent',
  'requires_lower_body',
  'requires_hips',
  'requires_weight_shift',
  'requires_locomotion',
]);

export const DEFAULT_EXPORT_PRECISION = 2;
export const SAMPLE_TIME_EPSILON = 0.001;

const UPPER_BODY_BONE_SET = new Set(UPPER_BODY_BONES);

export function clampSampleTime(value, duration = 0) {
  const numeric = Number(value);
  const max = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 0;
  const safeMax = Math.max(0, max - SAMPLE_TIME_EPSILON);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric >= safeMax) return safeMax;
  return numeric;
}

export function roundDegrees(value, precision = DEFAULT_EXPORT_PRECISION) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  const rounded = Math.round((numeric + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeRotation(rotation = {}, precision = DEFAULT_EXPORT_PRECISION) {
  return {
    x: roundDegrees(rotation.x, precision),
    y: roundDegrees(rotation.y, precision),
    z: roundDegrees(rotation.z, precision),
  };
}

export function normalizeRotationMap(rotations = {}, precision = DEFAULT_EXPORT_PRECISION) {
  const result = {};

  for (const bone of UPPER_BODY_BONES) {
    if (!Object.prototype.hasOwnProperty.call(rotations, bone)) continue;
    result[bone] = normalizeRotation(rotations[bone], precision);
  }

  return result;
}

export function buildNaturalPosePreset({
  basePreset = {},
  rotations = {},
  source = {},
  warnings = [],
  precision = DEFAULT_EXPORT_PRECISION,
} = {}) {
  const basePose = basePreset.basePose || {};
  const baseRotation = basePose.rotation || {};
  const basePosition = basePose.position || {};
  const importedRotations = normalizeRotationMap(rotations, precision);
  const mergedRotation = {};

  for (const bone of Object.keys(baseRotation).sort()) {
    if (UPPER_BODY_BONE_SET.has(bone) && importedRotations[bone]) {
      continue;
    }
    mergedRotation[bone] = normalizeRotation(baseRotation[bone], precision);
  }

  for (const bone of UPPER_BODY_BONES) {
    if (!importedRotations[bone]) continue;
    mergedRotation[bone] = importedRotations[bone];
  }

  return sortObjectDeep({
    model: basePreset.model || 'AliciaSolid',
    source: normalizeSource(source, warnings),
    basePose: {
      rotation: mergedRotation,
      position: clonePosition(basePosition, precision),
    },
  });
}

export function stableStringifyPreset(preset) {
  return JSON.stringify(sortObjectDeep(preset), null, 2);
}

export function buildMotionMiningEntry({
  source = '',
  sampleTime = 0,
  category = 'present',
  score = 3,
  sourceScore,
  agentScore,
  rejectReason = '',
  reason = '',
  note = '',
  tags = [],
  sequence = 1,
  createdAt = formatLocalIsoDateTime(),
} = {}) {
  const normalizedCategory = MOTION_MINING_CATEGORIES.includes(category) ? category : 'reject';
  const numericSequence = Math.max(1, Math.trunc(Number(sequence) || 1));
  const id = `${normalizedCategory}_${String(numericSequence).padStart(3, '0')}`;
  const entry = {
    id,
    source: String(source || ''),
    sampleTime: roundDegrees(sampleTime, 4),
    category: normalizedCategory,
    score: clampScore(score),
    sourceScore: clampScore(sourceScore ?? score),
    agentScore: clampScore(agentScore ?? score),
    note: String(note || '').trim(),
    tags: normalizeTags(tags),
  };

  if (normalizedCategory === 'reject') {
    entry.rejectReason = MOTION_MINING_REJECT_REASONS.includes(rejectReason)
      ? rejectReason
      : 'unclear_intent';
  } else if (normalizedCategory === 'candidate_future') {
    entry.reason = MOTION_MINING_REJECT_REASONS.includes(reason)
      ? reason
      : 'requires_lower_body';
    entry.exportedPoseFile = `${id}.json`;
  } else {
    entry.exportedPoseFile = `${id}.json`;
  }

  entry.createdAt = String(createdAt || formatLocalIsoDateTime());
  return entry;
}

export function stableStringifyMiningLog(entries = []) {
  return JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
}

export function formatLocalIsoDateTime(date = new Date()) {
  const pad = (value) => String(Math.trunc(Math.abs(value))).padStart(2, '0');
  const timezoneMinutes = -date.getTimezoneOffset();
  const sign = timezoneMinutes >= 0 ? '+' : '-';
  const hours = pad(timezoneMinutes / 60);
  const minutes = pad(timezoneMinutes % 60);

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
    sign,
    hours,
    ':',
    minutes,
  ].join('');
}

function normalizeSource(source = {}, warnings = []) {
  const normalizedWarnings = Array.from(new Set(
    (Array.isArray(warnings) ? warnings : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )).sort();

  return sortObjectDeep({
    type: String(source.type || 'vrma'),
    fileName: String(source.fileName || ''),
    sampleTime: roundDegrees(source.sampleTime || 0, 4),
    boneScope: 'upper_body',
    warnings: normalizedWarnings,
  });
}

function clampScore(value) {
  const numeric = Math.trunc(Number(value) || 1);
  return Math.max(1, Math.min(5, numeric));
}

function normalizeTags(tags = []) {
  const values = Array.isArray(tags)
    ? tags
    : String(tags || '').split(/[,，\s]+/);

  return Array.from(new Set(
    values
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ));
}

function clonePosition(position = {}, precision = DEFAULT_EXPORT_PRECISION) {
  const result = {};

  for (const bone of Object.keys(position).sort()) {
    const value = position[bone] || {};
    result[bone] = {
      x: roundDegrees(value.x, precision + 3),
      y: roundDegrees(value.y, precision + 3),
      z: roundDegrees(value.z, precision + 3),
    };
  }

  return result;
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObjectDeep(value[key]);
      return acc;
    }, {});
}
