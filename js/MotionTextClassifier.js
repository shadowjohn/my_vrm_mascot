const CATEGORY_RULES = Object.freeze([
  {
    category: 'warning',
    signals: [
      { id: 'not_allowed', terms: ['不對', '不行', '禁止', '不能', '不要', '嚴格'], weight: 2.2 },
      { id: 'angry_attitude', terms: ['生氣', '氣噗噗', '警告', '提醒', '制止', '阻止'], weight: 1.9 },
      { id: 'negative_response', terms: ['拒絕', '否定', '搖頭', '晃頭', '錯誤', '犯錯'], weight: 1.5 },
      { id: 'danger_or_surprise', terms: ['危險', '嚇', '害怕', '異常'], weight: 1.1 },
    ],
  },
  {
    category: 'candidate_future',
    signals: [
      { id: 'requires_lower_body', terms: ['坐', '站起', '起身', '蹲', '跪', '腳', '腿', '下半身', '膝'], weight: 2.3 },
      { id: 'requires_locomotion', terms: ['走', '跑', '跳', '退著走', '往前', '移動', '行進'], weight: 1.9 },
      { id: 'requires_weight_shift', terms: ['重心', '跌倒', '躺', '落地', '划船', '轉身'], weight: 1.8 },
      { id: 'dance_or_scene_motion', terms: ['跳舞', '舞步', '全身', '場景', '高爾夫', '打籃球'], weight: 1.4 },
    ],
  },
  {
    category: 'think',
    signals: [
      { id: 'thinking_state', terms: ['思考', '分析', '等待', '想事情', '想', '查詢中'], weight: 2 },
      { id: 'confused_or_shy', terms: ['困惑', '疑惑', '猶豫', '不好意思', '害羞', '緊張'], weight: 1.8 },
      { id: 'face_touch', terms: ['下巴', '摸頭', '後腦', '臉', '嘴邊', '哈欠'], weight: 1.5 },
      { id: 'searching_motion', terms: ['找', '尋找', '確認', '看看'], weight: 1.1 },
    ],
  },
  {
    category: 'point',
    signals: [
      { id: 'point_target', terms: ['指向', '指出', '指示', '指著', '指'], weight: 2 },
      { id: 'guide_direction', terms: ['方向', '位置', '目標', '那邊', '這邊', '引導'], weight: 1.8 },
      { id: 'invite_or_follow', terms: ['招手', '靠近', '過來', '跟上', 'come'], weight: 1.7 },
      { id: 'look_attention', terms: ['看向', '查看', '注意', '左右看'], weight: 1.1 },
    ],
  },
  {
    category: 'present',
    signals: [
      { id: 'presentation', terms: ['介紹', '展示', '說明', '呈現', '開場'], weight: 2 },
      { id: 'greeting_stage', terms: ['歡迎', '打招呼', '問候', '自我介紹', '登場', '邀請'], weight: 1.7 },
      { id: 'open_body', terms: ['攤手', '張開', '往外', '亮相'], weight: 1.2 },
    ],
  },
  {
    category: 'success',
    signals: [
      { id: 'success_state', terms: ['成功', '完成', '達成', '答對', '勝利'], weight: 2 },
      { id: 'happy_state', terms: ['開心', '高興', '慶祝', '鼓掌', '可愛'], weight: 1.6 },
      { id: 'farewell_thanks', terms: ['再見', '揮手', '謝謝', '告別'], weight: 1.4 },
    ],
  },
  {
    category: 'reject',
    signals: [
      { id: 'bad_silhouette', terms: ['T 字', 'T字', '校正', '無明確', '不自然'], weight: 2.2 },
      { id: 'not_agentic', terms: ['不適合', '用途不明', '怪', '太大'], weight: 1.8 },
      { id: 'blocked_face_or_combat', terms: ['遮住臉', '暴力', '攻擊', '打架'], weight: 1.7 },
    ],
  },
]);

const CATEGORY_LABELS = Object.freeze({
  present: '介紹',
  point: '指向',
  think: '思考',
  warning: '警告',
  success: '成功',
  candidate_future: '未來候選',
  reject: '淘汰',
  none: '未分類',
});

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(' ');
  }
  return String(value || '').trim();
}

function normalizeCategory(category) {
  return CATEGORY_LABELS[category] ? category : 'none';
}

function collectHumanText(profile) {
  return [
    normalizeText(profile.description),
    normalizeText(profile.usageDescription),
    normalizeText(profile.agentUsage),
    normalizeText(profile.note),
  ].filter(Boolean).join(' ');
}

function scoreCategory(text, rule) {
  const lowerText = text.toLowerCase();
  let score = 0;
  const matchedSignals = [];
  const matchedTerms = [];

  for (const signal of rule.signals) {
    const signalTerms = signal.terms.filter((term) => lowerText.includes(term.toLowerCase()));
    if (signalTerms.length === 0) {
      continue;
    }
    score += signal.weight * signalTerms.length;
    matchedSignals.push(signal.id);
    matchedTerms.push(...signalTerms);
  }

  return { category: rule.category, score, matchedSignals, matchedTerms };
}

function buildReason(result) {
  if (!result.matchedTerms.length) {
    return '文字描述未命中明確語意，暫時維持原分類。';
  }

  const terms = result.matchedTerms.slice(0, 6).join('、');
  return `文字描述命中「${terms}」，較符合「${CATEGORY_LABELS[result.suggestedCategory] || result.suggestedCategory}」。`;
}

function confidenceFromScore(score, totalScore) {
  if (score <= 0) {
    return 0.25;
  }
  const separationBonus = totalScore > 0 ? Math.min(score / totalScore, 1) * 0.18 : 0;
  return Math.min(0.96, Math.max(0.35, score / (score + 3) + separationBonus));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function classifyMotionProfile(source, profile = {}, options = {}) {
  const currentCategory = normalizeCategory(profile.motionCategory || profile.category);
  const text = collectHumanText(profile);
  const threshold = typeof options.reclassThreshold === 'number' ? options.reclassThreshold : 0.56;

  const scored = CATEGORY_RULES.map((rule) => scoreCategory(text, rule));
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.category.localeCompare(b.category);
  });

  const top = scored[0];
  const suggestedCategory = top.score > 0 ? top.category : currentCategory;
  const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
  const confidence = round2(confidenceFromScore(top.score, totalScore));
  const alternativeCategories = scored
    .filter((item) => item.score > 0 && item.category !== suggestedCategory)
    .slice(0, 3)
    .map((item) => ({
      category: item.category,
      label: CATEGORY_LABELS[item.category],
      score: round2(item.score),
      matchedSignals: item.matchedSignals,
    }));

  const result = {
    source,
    currentCategory,
    currentLabel: CATEGORY_LABELS[currentCategory] || currentCategory,
    suggestedCategory,
    suggestedLabel: CATEGORY_LABELS[suggestedCategory] || suggestedCategory,
    confidence,
    shouldReclassify: suggestedCategory !== currentCategory && confidence >= threshold,
    score: round2(top.score),
    matchedSignals: top.matchedSignals,
    matchedTerms: top.matchedTerms.slice(0, 12),
    reason: '',
    alternativeCategories,
  };
  result.reason = buildReason(result);

  return result;
}

function addCount(target, key) {
  target[key] = (target[key] || 0) + 1;
}

export function buildMotionTextReclassReport(profiles = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const entries = Object.keys(profiles).sort((a, b) => a.localeCompare(b)).map((source) => (
    classifyMotionProfile(source, profiles[source], options)
  ));
  const currentCategoryCounts = {};
  const suggestedCategoryCounts = {};

  for (const entry of entries) {
    addCount(currentCategoryCounts, entry.currentCategory);
    addCount(suggestedCategoryCounts, entry.suggestedCategory);
  }

  const reclassCandidates = entries
    .filter((entry) => entry.shouldReclassify)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.source.localeCompare(b.source);
    });

  return {
    schemaVersion: 1,
    phase: 'M6.7.6A Text Mining Classifier',
    source: 'motion_profiles.json',
    generatedAt,
    summary: {
      totalProfiles: entries.length,
      reclassCandidateCount: reclassCandidates.length,
      currentCategoryCounts,
      suggestedCategoryCounts,
    },
    reclassCandidates,
    entries,
  };
}

export { CATEGORY_LABELS, CATEGORY_RULES };
