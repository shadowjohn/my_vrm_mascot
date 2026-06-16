export const FIRST_BATCH_RECIPE_IDS = Object.freeze([
  'come_here',
  'point_target',
  'cross_no',
  'thinking_chin',
  'angry_hands_waist',
  'shy_head_touch',
  'wave_goodbye',
  'look_around',
  'victory_pose',
  'hands_up_surrender',
]);

const RECIPE_DEFINITIONS = Object.freeze([
  {
    recipeId: 'come_here',
    displayName: '招手靠近',
    keywords: ['招手', '靠近', '過來', '跟上', '往這邊', 'come'],
    requiredAny: ['招手', '過來', '跟上', '往這邊', 'come'],
    summary: '手部向自己方向連續招手，像是在請對方靠近或跟上。',
    poseHints: {
      activeSide: 'right',
      primaryAction: 'beckon',
      bodyLean: 'slight_forward',
      repeatable: true,
      rhythm: 'short_loop',
    },
  },
  {
    recipeId: 'point_target',
    displayName: '指向目標',
    keywords: ['指向', '指出', '指示', '指著', '方向', '位置', '目標', '那邊', '這邊'],
    summary: '手臂伸出並指向目標方向，用於提示使用者看向指定位置。',
    poseHints: {
      activeSide: 'right',
      primaryAction: 'point',
      bodyLean: 'slight_forward',
      repeatable: false,
      gaze: 'target',
    },
  },
  {
    recipeId: 'cross_no',
    displayName: '交叉制止',
    keywords: ['交叉', '不對', '不行', '禁止', '不能', '制止', '拒絕', '阻止'],
    summary: '雙手在身前交叉或阻擋，語意接近否定、禁止與制止。',
    poseHints: {
      activeSide: 'both',
      primaryAction: 'cross_block',
      bodyLean: 'slight_back',
      repeatable: false,
      expression: 'serious',
    },
  },
  {
    recipeId: 'thinking_chin',
    displayName: '托腮思考',
    keywords: ['下巴', '思考', '分析', '等待', '困惑', '疑惑', '猶豫', '想事情'],
    summary: '手部靠近下巴或臉側，頭部微低，呈現思考與分析中的狀態。',
    poseHints: {
      activeSide: 'right',
      primaryAction: 'chin_touch',
      bodyLean: 'slight_forward',
      repeatable: false,
      gaze: 'up_left',
    },
  },
  {
    recipeId: 'angry_hands_waist',
    displayName: '插腰生氣',
    keywords: ['插腰', '叉腰', '生氣', '氣噗噗', '犯錯', '講不聽'],
    summary: '雙手插腰並帶有頭部晃動或身體前壓，呈現有態度的提醒。',
    poseHints: {
      activeSide: 'both',
      primaryAction: 'hands_on_waist',
      bodyLean: 'slight_forward',
      repeatable: false,
      expression: 'angry',
    },
  },
  {
    recipeId: 'shy_head_touch',
    displayName: '害羞摸頭',
    keywords: ['不好意思', '害羞', '摸頭', '後腦', '臉紅', '犯錯'],
    requiredAny: ['不好意思', '害羞', '摸頭', '後腦', '臉紅'],
    summary: '手摸後腦或臉側，帶有害羞、不好意思或小失誤後的反應。',
    poseHints: {
      activeSide: 'left',
      primaryAction: 'head_touch',
      bodyLean: 'slight_side',
      repeatable: false,
      expression: 'shy',
    },
  },
  {
    recipeId: 'wave_goodbye',
    displayName: '揮手告別',
    keywords: ['揮手', '再見', '告別', '打招呼', '問候', '歡迎'],
    summary: '手部向外揮動，可用於打招呼、歡迎或告別。',
    poseHints: {
      activeSide: 'right',
      primaryAction: 'wave',
      bodyLean: 'neutral',
      repeatable: true,
      rhythm: 'friendly_loop',
    },
  },
  {
    recipeId: 'look_around',
    displayName: '左右觀察',
    keywords: ['左看', '右看', '左右看', '環看', '四週', '四周', '回頭看', '查看'],
    summary: '頭部或上半身左右查看，像是在尋找、觀察或確認周遭狀況。',
    poseHints: {
      activeSide: 'none',
      primaryAction: 'look_around',
      bodyLean: 'neutral',
      repeatable: true,
      gaze: 'scan',
    },
  },
  {
    recipeId: 'victory_pose',
    displayName: '勝利完成',
    keywords: ['勝利', '成功', '完成', '達成', '開心', '高興', '慶祝'],
    summary: '帶有完成、勝利或開心語意的姿勢，適合工具成功後的短演出。',
    poseHints: {
      activeSide: 'both',
      primaryAction: 'victory',
      bodyLean: 'slight_up',
      repeatable: false,
      expression: 'happy',
    },
  },
  {
    recipeId: 'hands_up_surrender',
    displayName: '舉手投降',
    keywords: ['投降', '雙手往上', '雙手上舉', '手往上', '舉高', '嚇了一跳'],
    summary: '雙手上舉，語意可能是投降、驚訝、暫停或被嚇到。',
    poseHints: {
      activeSide: 'both',
      primaryAction: 'hands_up',
      bodyLean: 'slight_back',
      repeatable: false,
      expression: 'surprised',
    },
  },
]);

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(' ');
  }
  return String(value || '').trim();
}

function profileText(profile) {
  return [
    normalizeText(profile.description),
    normalizeText(profile.usageDescription),
    normalizeText(profile.agentUsage),
    normalizeText(profile.note),
  ].filter(Boolean).join(' ');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function collectAgentUsages(matches) {
  const usages = [];
  for (const match of matches) {
    const rawUsages = Array.isArray(match.profile.agentUsage)
      ? match.profile.agentUsage
      : [match.profile.agentUsage];
    for (const usage of rawUsages) {
      const text = normalizeText(usage);
      if (text) {
        usages.push(text);
      }
    }
  }
  return uniqueSorted(usages).slice(0, 12);
}

function findMatches(profiles, definition) {
  const matches = [];

  for (const source of Object.keys(profiles).sort((a, b) => a.localeCompare(b))) {
    const profile = profiles[source] || {};
    const text = profileText(profile);
    const lowerText = text.toLowerCase();
    const matchedKeywords = definition.keywords.filter((keyword) => lowerText.includes(keyword.toLowerCase()));
    const hasRequiredKeyword = !definition.requiredAny
      || definition.requiredAny.some((keyword) => lowerText.includes(keyword.toLowerCase()));

    if (matchedKeywords.length === 0 || !hasRequiredKeyword) {
      continue;
    }

    matches.push({
      source,
      profile,
      matchedKeywords,
      textSnippet: text.slice(0, 140),
    });
  }

  return matches;
}

function confidenceForMatches(matches, definition) {
  if (matches.length === 0) {
    return 0;
  }
  const keywordCoverage = new Set(matches.flatMap((match) => match.matchedKeywords)).size / definition.keywords.length;
  const evidenceScore = Math.min(matches.length / 6, 1);
  const confidence = 0.48 + keywordCoverage * 0.3 + evidenceScore * 0.22;
  return Math.round(Math.min(0.96, confidence) * 100) / 100;
}

function buildRecipe(definition, matches) {
  return {
    recipeId: definition.recipeId,
    displayName: definition.displayName,
    sourceMotions: matches.map((match) => match.source),
    matchedKeywords: uniqueSorted(matches.flatMap((match) => match.matchedKeywords)),
    motionSummary: definition.summary,
    agentUsages: collectAgentUsages(matches),
    poseHints: { ...definition.poseHints },
    confidence: confidenceForMatches(matches, definition),
    evidence: matches.slice(0, 12).map((match) => ({
      source: match.source,
      matchedKeywords: match.matchedKeywords,
      textSnippet: match.textSnippet,
    })),
  };
}

export function buildPoseStyleRecipes(profiles = {}) {
  const recipes = [];

  for (const definition of RECIPE_DEFINITIONS) {
    const matches = findMatches(profiles, definition);
    if (matches.length === 0) {
      continue;
    }
    recipes.push(buildRecipe(definition, matches));
  }

  return recipes.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    if (b.sourceMotions.length !== a.sourceMotions.length) {
      return b.sourceMotions.length - a.sourceMotions.length;
    }
    return a.recipeId.localeCompare(b.recipeId);
  });
}

export function buildPoseStyleRecipeDocument(profiles = {}, options = {}) {
  const recipes = buildPoseStyleRecipes(profiles);
  const coveredSources = new Set(recipes.flatMap((recipe) => recipe.sourceMotions));

  return {
    schemaVersion: 1,
    phase: 'M6.7.6B Pose Style Recipe Generator',
    source: 'motion_profiles.json',
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: {
      totalProfiles: Object.keys(profiles).length,
      recipeCount: recipes.length,
      coveredMotionCount: coveredSources.size,
      recipeIds: recipes.map((recipe) => recipe.recipeId),
    },
    recipes,
  };
}

export { RECIPE_DEFINITIONS };
