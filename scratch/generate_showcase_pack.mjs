import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const ROOT = process.cwd();
const REVIEW_DIR = join(ROOT, 'examples', 'm6_7_vrma_samples', 'review');
const PROFILE_PATH = join(REVIEW_DIR, 'motion_profiles.json');
const REGISTRY_PATH = join(REVIEW_DIR, 'semantic_motion_registry.json');
const LIBRARY_PATH = join(REVIEW_DIR, 'semantic_motion_library.json');
const PACK_PATH = join(REVIEW_DIR, 'showcase_motion_pack.json');
const EVENTS_PATH = join(REVIEW_DIR, 'showcase_events.json');
const REPORT_PATH = join(REVIEW_DIR, 'showcase_motion_pack_report.md');

const SHOWCASE_LIMIT = 28;
const MAX_PER_SEMANTIC = 4;

const APPROVED_DEMO_VRMA = new Set([
  'Angry.vrma',
  'Blush.vrma',
  'Clapping.vrma',
  'Goodbye.vrma',
  'Jump.vrma',
  'LookAround.vrma',
  'Relax.vrma',
  'Sad.vrma',
  'Sleepy.vrma',
  'Surprised.vrma',
  'Thinking.vrma',
]);

const SEMANTIC_ORDER = [
  'angry_hands_waist',
  'cross_no',
  'thinking_chin',
  'point_target',
  'come_here',
  'wave_goodbye',
  'victory_pose',
  'look_around',
  'hands_up_surrender',
  'shy_head_touch',
];

const CATEGORY_FALLBACK_SEMANTIC = {
  point: 'point_target',
  present: 'come_here',
  think: 'thinking_chin',
  warning: 'angry_hands_waist',
  success: 'victory_pose',
  candidate_future: 'look_around',
};

const CATEGORY_WEIGHTS = {
  point: 7,
  warning: 7,
  think: 6,
  present: 5,
  success: 5,
  candidate_future: 2,
};

const EVENT_TEMPLATES = {
  come_here: {
    topic: 'release',
    prop: 'releaseCore',
    intent: 'greeting',
    motion: 'wave',
    animation: 'touch_model',
    sceneAction: 'touch',
    walkTo: { x: -66, y: 5, scale: 1.05 },
    gaze: { x: -0.46, y: 0.12 },
    marker: { left: '31%', bottom: '42%' },
  },
  point_target: {
    topic: 'target',
    prop: 'warningTarget',
    intent: 'explain',
    motion: 'presenting',
    animation: 'point_right',
    sceneAction: 'touch',
    walkTo: { x: 72, y: -5, scale: 1.06 },
    gaze: { x: 0.5, y: -0.1 },
    marker: { left: '68%', bottom: '23%' },
    tone: 'hot',
  },
  cross_no: {
    topic: 'target',
    prop: 'warningTarget',
    intent: 'warning',
    motion: 'warning_nod',
    animation: 'hands_waist',
    walkTo: { x: 54, y: -3, scale: 1.05 },
    gaze: { x: 0.46, y: -0.12 },
    marker: { left: '69%', bottom: '24%' },
    tone: 'hot',
  },
  thinking_chin: {
    topic: 'motion',
    prop: 'motionOrb',
    intent: 'explain',
    motion: 'idle',
    actState: 'thinking',
    animation: 'touch_model',
    sceneAction: 'touch',
    walkTo: { x: -36, y: 3, scale: 1.04 },
    gaze: { x: -0.34, y: -0.16 },
    marker: { left: '36%', bottom: '24%' },
  },
  angry_hands_waist: {
    topic: 'target',
    prop: 'warningTarget',
    intent: 'warning',
    motion: 'warning_nod',
    animation: 'hands_waist',
    walkTo: { x: 58, y: -2, scale: 1.06 },
    gaze: { x: 0.46, y: -0.12 },
    marker: { left: '70%', bottom: '24%' },
    tone: 'hot',
  },
  shy_head_touch: {
    topic: 'release',
    prop: 'releaseCore',
    intent: 'explain',
    motion: 'shake_head',
    animation: 'shy_wave',
    sceneAction: 'touch',
    walkTo: { x: -56, y: 3, scale: 1.04 },
    gaze: { x: -0.48, y: 0.12 },
    marker: { left: '31%', bottom: '42%' },
  },
  wave_goodbye: {
    topic: 'release',
    prop: 'releaseCore',
    intent: 'greeting',
    motion: 'wave',
    animation: 'shy_wave',
    walkTo: { x: -50, y: 2, scale: 1.04 },
    gaze: { x: -0.44, y: 0.12 },
    marker: { left: '30%', bottom: '42%' },
  },
  look_around: {
    topic: 'motion',
    prop: 'motionOrb',
    intent: 'searching',
    motion: 'dance_short',
    animation: 'walk_cycle',
    walkTo: { x: -48, y: 7, scale: 1.03 },
    gaze: { x: -0.35, y: -0.18 },
    marker: { left: '36%', bottom: '24%' },
  },
  victory_pose: {
    topic: 'assets',
    prop: 'assetCrate',
    intent: 'success',
    motion: 'victory',
    animation: 'twirl',
    sceneAction: 'touch',
    walkTo: { x: 40, y: 0, scale: 1.05 },
    gaze: { x: 0.48, y: 0.08 },
    marker: { left: '65%', bottom: '41%' },
  },
  hands_up_surrender: {
    topic: 'target',
    prop: 'warningTarget',
    intent: 'error',
    motion: 'shake_head',
    animation: 'kick_forward',
    sceneAction: 'kick-back',
    walkTo: { x: 74, y: -5, scale: 1.06, roomPath: 'right-front-return' },
    gaze: { x: 0.48, y: -0.1 },
    marker: { left: '70%', bottom: '24%' },
    tone: 'hot',
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

function normalizeProfiles(document) {
  const profiles = document?.profiles || {};
  return Object.entries(profiles).map(([source, profile]) => ({
    source,
    agentUsage: normalizeStringArray(profile.agentUsage),
    description: String(profile.description || profile.motionDescription || profile.note || '').trim(),
    usageDescription: String(profile.usageDescription || '').trim(),
    motionCategory: String(profile.motionCategory || profile.category || '').trim(),
    motionScore: clampScore(profile.motionScore ?? profile.score ?? 3),
    updatedAt: String(profile.updatedAt || document.updatedAt || '').trim(),
  }));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\n|,|，|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampScore(value) {
  const numeric = Math.trunc(Number(value) || 3);
  return Math.max(1, Math.min(5, numeric));
}

function normalizeRegistry(document) {
  const motions = document?.motions || {};
  if (Array.isArray(motions)) {
    return Object.fromEntries(motions.map((motion) => [motion.semanticMotionId || motion.id, motion]));
  }
  return motions;
}

function normalizeLibrary(document) {
  const motions = document?.motions || [];
  return Object.fromEntries(motions.map((motion) => [motion.id, motion]));
}

function buildVrmaIndex() {
  const roots = [
    join(ROOT, 'local_assets', 'vrma'),
    join(ROOT, 'examples', 'm6_7_vrma_samples'),
  ];
  const index = new Map();

  for (const root of roots) {
    if (!existsSync(root)) continue;
    walk(root, (path) => {
      if (!path.toLowerCase().endsWith('.vrma')) return;
      const name = basename(path);
      if (!index.has(name)) {
        index.set(name, path);
      }
    });
  }

  return index;
}

function walk(dir, onFile) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, onFile);
    } else {
      onFile(path);
    }
  }
}

function inferSemanticMotion(profile, registry) {
  const textSemantic = inferSemanticFromText(profile);
  if (textSemantic) {
    return textSemantic;
  }

  for (const id of SEMANTIC_ORDER) {
    const motion = registry[id];
    const sources = Array.isArray(motion?.sourceMotions) ? motion.sourceMotions : [];
    if (sources.includes(profile.source)) {
      return id;
    }
  }
  return CATEGORY_FALLBACK_SEMANTIC[profile.motionCategory] || '';
}

function inferSemanticFromText(profile) {
  const text = [
    profile.source,
    profile.description,
    profile.usageDescription,
    profile.agentUsage.join(' '),
  ].join(' ').toLowerCase();

  if (matchAny(text, ['不對', '不是這樣', '不行', '禁止', '制止', '交叉', '拒絕', 'stop'])) {
    return 'cross_no';
  }
  if (matchAny(text, ['插腰', '生氣', '氣噗噗', '警告', '提醒', 'angry'])) {
    return 'angry_hands_waist';
  }
  if (matchAny(text, ['投降', '舉手', '雙手往上', 'hands up', 'surrender'])) {
    return 'hands_up_surrender';
  }
  if (matchAny(text, ['害羞', '不好意思', '摸頭', '後腦', '臉紅', 'blush'])) {
    return 'shy_head_touch';
  }
  if (matchAny(text, ['思考', '想事情', '下巴', '托腮', '分析', 'think'])) {
    return 'thinking_chin';
  }
  if (matchAny(text, ['環看', '四週', '找東西', '往左看', '往右看', 'look around'])) {
    return 'look_around';
  }
  if (matchAny(text, ['靠近', '跟過來', '過來', 'come here', 'come on'])) {
    return 'come_here';
  }
  if (matchAny(text, ['指向', '指給', '指示', '位置', '目標', '伸出右手', '看這邊'])) {
    return 'point_target';
  }
  if (matchAny(text, ['再見', '揮手', '打招呼', 'goodbye', 'hello'])) {
    return 'wave_goodbye';
  }
  if (matchAny(text, ['勝利', '完成', '成功', '開心', 'happy'])) {
    return 'victory_pose';
  }

  return '';
}

function matchAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function selectionScore(profile, semanticMotionId, registry) {
  const semantic = registry[semanticMotionId] || {};
  const isPreferred = semantic.preferredMotion === profile.source;
  const approved = APPROVED_DEMO_VRMA.has(profile.source);
  const textLength = `${profile.description} ${profile.usageDescription} ${profile.agentUsage.join(' ')}`.length;
  const textScore = Math.min(3, Math.floor(textLength / 80));
  return (
    profile.motionScore * 10
    + (Number(semantic.confidence || 0) * 10)
    + (CATEGORY_WEIGHTS[profile.motionCategory] || 0)
    + (isPreferred ? 20 : 0)
    + (approved ? 5 : 0)
    + textScore
  );
}

function selectShowcaseMotions(profiles, registry, library, vrmaIndex) {
  const candidates = profiles
    .filter((profile) => profile.source && profile.motionCategory !== 'reject')
    .filter((profile) => profile.description && profile.usageDescription)
    .filter((profile) => vrmaIndex.has(profile.source))
    .map((profile) => {
      const semanticMotionId = inferSemanticMotion(profile, registry);
      const semantic = registry[semanticMotionId] || library[semanticMotionId] || {};
      return {
        ...profile,
        semanticMotionId,
        semanticDisplayName: semantic.displayName || semanticMotionId,
        semanticCategory: semantic.category || '',
        selectionScore: selectionScore(profile, semanticMotionId, registry),
        isPreferred: semantic.preferredMotion === profile.source,
      };
    })
    .filter((profile) => profile.semanticMotionId);

  const selected = [];
  const seen = new Set();
  const countsBySemantic = new Map();
  for (const semanticMotionId of SEMANTIC_ORDER) {
    const best = candidates
      .filter((profile) => profile.semanticMotionId === semanticMotionId)
      .sort((a, b) => b.selectionScore - a.selectionScore || a.source.localeCompare(b.source))[0];
    if (!best || seen.has(best.source)) continue;
    selected.push(best);
    seen.add(best.source);
    countsBySemantic.set(semanticMotionId, 1);
  }

  const ordered = [...candidates].sort((a, b) => {
    const semanticOrderDelta = SEMANTIC_ORDER.indexOf(a.semanticMotionId) - SEMANTIC_ORDER.indexOf(b.semanticMotionId);
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    if (semanticOrderDelta !== 0) return semanticOrderDelta;
    if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
    return a.source.localeCompare(b.source);
  });

  for (const profile of ordered) {
    if (selected.length >= SHOWCASE_LIMIT) break;
    if (seen.has(profile.source)) continue;
    const count = countsBySemantic.get(profile.semanticMotionId) || 0;
    if (count >= MAX_PER_SEMANTIC) continue;
    selected.push(profile);
    seen.add(profile.source);
    countsBySemantic.set(profile.semanticMotionId, count + 1);
  }

  if (selected.length < SHOWCASE_LIMIT) {
    const fallback = [...candidates].sort((a, b) => b.selectionScore - a.selectionScore || a.source.localeCompare(b.source));
    for (const profile of fallback) {
      if (selected.length >= SHOWCASE_LIMIT) break;
      if (seen.has(profile.source)) continue;
      selected.push(profile);
      seen.add(profile.source);
    }
  }

  return selected;
}

function buildPack(selected, registry, vrmaIndex, generatedAt) {
  const categoryCounts = {};
  const semanticCounts = {};
  const motions = selected.map((profile, index) => {
    categoryCounts[profile.motionCategory] = (categoryCounts[profile.motionCategory] || 0) + 1;
    semanticCounts[profile.semanticMotionId] = (semanticCounts[profile.semanticMotionId] || 0) + 1;
    const sourcePath = vrmaIndex.get(profile.source);
    const releasePath = `motions/showcase/${profile.source}`;
    const registryMotion = registry[profile.semanticMotionId] || {};
    return {
      id: `showcase_${String(index + 1).padStart(3, '0')}`,
      sourceMotion: profile.source,
      releasePath,
      localSourcePath: relative(ROOT, sourcePath).replaceAll('\\', '/'),
      semanticMotionId: profile.semanticMotionId,
      semanticDisplayName: profile.semanticDisplayName,
      displayName: `${profile.semanticDisplayName} / ${profile.source}`,
      motionCategory: profile.motionCategory,
      motionScore: profile.motionScore,
      description: profile.description,
      usageDescription: profile.usageDescription,
      agentUsage: profile.agentUsage,
      selectionScore: Number(profile.selectionScore.toFixed(3)),
      selectionReason: profile.isPreferred
        ? 'preferred semantic motion source'
        : 'high-scoring human-described motion sample',
      licenseStatus: APPROVED_DEMO_VRMA.has(profile.source) ? 'approved' : 'research_preview',
      distributable: APPROVED_DEMO_VRMA.has(profile.source),
      sourceProvider: APPROVED_DEMO_VRMA.has(profile.source) ? 'tk256ailab/vrm-viewer' : 'local_mining_corpus',
      poseHints: registryMotion.poseHints || {},
    };
  });

  return {
    schemaVersion: 1,
    phase: 'v0.1.2 Alicia Showcase Pack',
    source: [
      'motion_profiles.json',
      'semantic_motion_registry.json',
      'semantic_motion_library.json',
    ],
    generatedAt,
    summary: {
      totalSelectedMotions: motions.length,
      categoryCounts,
      semanticMotionCounts: semanticCounts,
      approvedCount: motions.filter((motion) => motion.licenseStatus === 'approved').length,
      researchPreviewCount: motions.filter((motion) => motion.licenseStatus === 'research_preview').length,
      note: 'research_preview motions are included for local/showcase evaluation and require license review before broad redistribution.',
    },
    motions,
  };
}

function buildEvents(pack, registry, generatedAt) {
  const events = pack.motions.map((motion, index) => {
    const template = EVENT_TEMPLATES[motion.semanticMotionId] || EVENT_TEMPLATES.point_target;
    const semantic = registry[motion.semanticMotionId] || {};
    const firstUsage = motion.agentUsage[0] || motion.usageDescription;
    const description = shorten(motion.description, 88);
    const usage = shorten(motion.usageDescription, 72);
    return {
      id: `showcase_event_${String(index + 1).padStart(3, '0')}`,
      ...template,
      semanticMotionId: motion.semanticMotionId,
      semanticLabel: motion.semanticDisplayName,
      sourceMotion: motion.sourceMotion,
      sourceMotionPath: motion.releasePath,
      motionCategory: motion.motionCategory,
      motionScore: motion.motionScore,
      label: `${motion.semanticDisplayName} · ${motion.sourceMotion}`,
      storyBeat: `Showcase ${String(index + 1).padStart(2, '0')} / ${motion.motionCategory}`,
      directive: `Alicia replays a mined human description from ${motion.sourceMotion}.`,
      text: `我從 ${motion.sourceMotion} 挖到這個：${description}。用途像是「${usage}」，可以拿來${firstUsage}。`,
      minedDescription: motion.description,
      usageDescription: motion.usageDescription,
      agentUsage: motion.agentUsage,
      selectionReason: motion.selectionReason,
      runtimeMotionStatus: semantic.runtimeReady ? 'semantic_ready' : 'metadata_ready',
    };
  });

  return {
    schemaVersion: 1,
    phase: 'v0.1.2 Alicia Showcase Events',
    source: 'showcase_motion_pack.json',
    generatedAt,
    summary: {
      totalEvents: events.length,
      sourceMotionCount: new Set(events.map((event) => event.sourceMotion)).size,
      semanticMotionCount: new Set(events.map((event) => event.semanticMotionId)).size,
    },
    events,
  };
}

function shorten(text, maxLength) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function latestUpdatedAt(profiles) {
  return profiles
    .map((profile) => profile.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || '2026-06-16T00:00:00+08:00';
}

function buildReport(pack, events) {
  const lines = [
    '# Alicia Showcase Pack Report',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Selected motions: ${pack.summary.totalSelectedMotions}`,
    `- Showcase events: ${events.summary.totalEvents}`,
    `- Approved motions: ${pack.summary.approvedCount}`,
    `- Research preview motions: ${pack.summary.researchPreviewCount}`,
    '',
    '## Semantic Coverage',
    '',
    ...Object.entries(pack.summary.semanticMotionCounts)
      .sort((a, b) => SEMANTIC_ORDER.indexOf(a[0]) - SEMANTIC_ORDER.indexOf(b[0]))
      .map(([id, count]) => `- ${id}: ${count}`),
    '',
    '## Selected Motions',
    '',
    ...pack.motions.map((motion) => [
      `### ${motion.id} ${motion.sourceMotion}`,
      '',
      `- Semantic: ${motion.semanticMotionId}`,
      `- Category: ${motion.motionCategory}`,
      `- Score: ${motion.motionScore}`,
      `- License: ${motion.licenseStatus}`,
      `- Description: ${motion.description}`,
      `- Usage: ${motion.usageDescription}`,
      '',
    ].join('\n')),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}

function main() {
  const profiles = normalizeProfiles(readJson(PROFILE_PATH));
  const registry = normalizeRegistry(readJson(REGISTRY_PATH));
  const library = normalizeLibrary(readJson(LIBRARY_PATH));
  const vrmaIndex = buildVrmaIndex();
  const generatedAt = latestUpdatedAt(profiles);
  const selected = selectShowcaseMotions(profiles, registry, library, vrmaIndex);
  const pack = buildPack(selected, registry, vrmaIndex, generatedAt);
  const events = buildEvents(pack, registry, generatedAt);

  writeJson(PACK_PATH, pack);
  writeJson(EVENTS_PATH, events);
  writeText(REPORT_PATH, buildReport(pack, events));

  console.log(`showcase pack: ${pack.summary.totalSelectedMotions} motions, ${events.summary.totalEvents} events`);
}

main();
