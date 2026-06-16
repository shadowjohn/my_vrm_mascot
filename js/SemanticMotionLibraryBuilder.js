export const SEMANTIC_MOTION_IDS = Object.freeze([
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

const SEMANTIC_DEFINITIONS = Object.freeze({
  come_here: {
    displayName: '招手靠近 / 跟我來',
    category: 'guide',
    intentTags: ['guide', 'come_here', 'follow_me', 'attention'],
    agentTriggers: ['引導使用者查看指定位置', '呼叫使用者注意某個目標', '帶使用者往下一步操作'],
    meanings: ['過來', '跟上', '往這裡', '請看這邊'],
  },
  point_target: {
    displayName: '指向目標 / 看這裡',
    category: 'point',
    intentTags: ['point', 'target', 'show_result', 'spatial_reference'],
    agentTriggers: ['指向地圖目標', '提示使用者查看查詢結果', '強調畫面中的指定位置'],
    meanings: ['看這裡', '目標在這裡', '指向', '提示位置'],
  },
  cross_no: {
    displayName: '交叉制止 / 不可以',
    category: 'warning',
    intentTags: ['deny', 'reject', 'stop', 'not_allowed'],
    agentTriggers: ['政策阻擋', '使用者操作不合法', '工具結果有風險'],
    meanings: ['不行', '停止', '禁止', '拒絕'],
  },
  thinking_chin: {
    displayName: '托腮思考 / 分析中',
    category: 'thinking',
    intentTags: ['thinking', 'analyzing', 'waiting', 'reasoning'],
    agentTriggers: ['等待 LLM 回覆', '等待工具結果', '正在分析資料'],
    meanings: ['思考中', '分析中', '稍等一下', '正在確認'],
  },
  angry_hands_waist: {
    displayName: '插腰生氣 / 有態度提醒',
    category: 'warning',
    intentTags: ['warning', 'attitude', 'strict_reminder', 'frustrated'],
    agentTriggers: ['使用者重複犯錯', '需要強烈提醒', '限制或異常狀態'],
    meanings: ['不可以喔', '你又來了', '請注意', '有點生氣'],
  },
  shy_head_touch: {
    displayName: '害羞摸頭 / 不好意思',
    category: 'thinking',
    intentTags: ['shy', 'apology', 'uncertain', 'minor_error'],
    agentTriggers: ['回覆不確定', '小錯誤後修正', '需要柔和道歉'],
    meanings: ['不好意思', '有點害羞', '我想一下', '剛剛可能不太對'],
  },
  wave_goodbye: {
    displayName: '揮手告別 / 打招呼',
    category: 'social',
    intentTags: ['greeting', 'farewell', 'hello', 'goodbye'],
    agentTriggers: ['使用者進入頁面', '對話結束', '任務完成後友善收尾'],
    meanings: ['你好', '再見', '嗨', '下次見'],
  },
  look_around: {
    displayName: '左右觀察 / 搜尋中',
    category: 'attention',
    intentTags: ['scan', 'look_around', 'searching', 'spatial_awareness'],
    agentTriggers: ['搜尋地圖目標', '檢查周遭物件', '等待空間上下文'],
    meanings: ['找找看', '我看看周圍', '正在搜尋', '確認附近狀況'],
  },
  victory_pose: {
    displayName: '勝利完成 / 做到了',
    category: 'success',
    intentTags: ['success', 'done', 'celebrate', 'completed'],
    agentTriggers: ['工具執行成功', '下載完成', '查詢完成'],
    meanings: ['完成了', '成功', '做到了', '太好了'],
  },
  hands_up_surrender: {
    displayName: '舉手投降 / 嚇一跳',
    category: 'surprised',
    intentTags: ['surprised', 'surrender', 'pause', 'unexpected'],
    agentTriggers: ['非預期錯誤', '使用者提出難題', '需要暫停確認'],
    meanings: ['嚇一跳', '先等等', '我投降', '這有點意外'],
  },
});

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function runtimeReadyFor(recipe) {
  return recipe.confidence >= 0.7 && Array.isArray(recipe.sourceMotions) && recipe.sourceMotions.length > 0;
}

function buildMotionEntry(recipe) {
  const definition = SEMANTIC_DEFINITIONS[recipe.recipeId];
  if (!definition) {
    return null;
  }

  return {
    id: recipe.recipeId,
    displayName: definition.displayName,
    category: definition.category,
    intentTags: [...definition.intentTags],
    agentTriggers: [...definition.agentTriggers],
    meanings: [...definition.meanings],
    recipes: [recipe.recipeId],
    sourceMotions: uniqueSorted(recipe.sourceMotions || []),
    confidence: round2(recipe.confidence || 0),
    runtimeReady: runtimeReadyFor(recipe),
    recipeSummary: recipe.motionSummary || '',
    poseHints: { ...(recipe.poseHints || {}) },
    evidence: Array.isArray(recipe.evidence) ? recipe.evidence.slice(0, 8) : [],
  };
}

export function buildSemanticMotionLibrary(recipesDocument = {}) {
  const recipes = Array.isArray(recipesDocument.recipes) ? recipesDocument.recipes : [];
  const entries = [];

  for (const recipeId of SEMANTIC_MOTION_IDS) {
    const recipe = recipes.find((item) => item.recipeId === recipeId);
    if (!recipe) {
      continue;
    }
    const entry = buildMotionEntry(recipe);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

export function buildSemanticMotionLibraryDocument(recipesDocument = {}, options = {}) {
  const motions = buildSemanticMotionLibrary(recipesDocument);
  const categoryCounts = {};
  let runtimeReadyCount = 0;

  for (const motion of motions) {
    categoryCounts[motion.category] = (categoryCounts[motion.category] || 0) + 1;
    if (motion.runtimeReady) {
      runtimeReadyCount += 1;
    }
  }

  return {
    schemaVersion: 1,
    phase: 'M6.8 Semantic Motion Library',
    source: 'pose_style_recipes.json',
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: {
      totalMotions: motions.length,
      runtimeReadyCount,
      categoryCounts,
      motionIds: motions.map((motion) => motion.id),
    },
    motions,
  };
}

export { SEMANTIC_DEFINITIONS };
