import { readFileSync, writeFileSync } from 'node:fs';
import { buildPoseStyleRecipeDocument } from '../js/PoseStyleRecipeGenerator.js';

const PROFILE_PATH = 'examples/m6_7_vrma_samples/review/motion_profiles.json';
const RECIPES_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipes.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipe_report.md';

function formatTaipeiTimestamp(date = new Date()) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().replace('Z', '+08:00');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function renderRecipeReport(document) {
  const lines = [
    '# Pose Style Recipe Report',
    '',
    `Phase: ${document.phase}`,
    `Generated: ${document.generatedAt}`,
    `Source: ${document.source}`,
    '',
    '## Summary',
    '',
    `- Profiles scanned: ${document.summary.totalProfiles}`,
    `- Recipes generated: ${document.summary.recipeCount}`,
    `- Covered motions: ${document.summary.coveredMotionCount}`,
    '',
    '## Recipes',
    '',
  ];

  for (const recipe of document.recipes) {
    lines.push(`### ${recipe.displayName} (${recipe.recipeId})`);
    lines.push('');
    lines.push(`- Confidence: ${recipe.confidence}`);
    lines.push(`- Source motions: ${recipe.sourceMotions.length}`);
    lines.push(`- Matched keywords: ${recipe.matchedKeywords.join(', ') || 'none'}`);
    lines.push(`- Motion summary: ${recipe.motionSummary}`);
    lines.push(`- Pose hints: activeSide=${recipe.poseHints.activeSide}, primaryAction=${recipe.poseHints.primaryAction}, repeatable=${recipe.poseHints.repeatable}`);
    if (recipe.agentUsages.length) {
      lines.push(`- Agent usages: ${recipe.agentUsages.slice(0, 5).join(' / ')}`);
    }
    lines.push('');
    lines.push('Evidence:');
    for (const evidence of recipe.evidence.slice(0, 6)) {
      lines.push(`- ${evidence.source}: ${evidence.textSnippet}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const profileFile = readJson(PROFILE_PATH);
const profiles = profileFile.profiles || {};
const document = buildPoseStyleRecipeDocument(profiles, {
  generatedAt: formatTaipeiTimestamp(),
});

writeFileSync(RECIPES_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
writeFileSync(REPORT_PATH, renderRecipeReport(document), 'utf8');

console.log(`Pose style recipes written: ${RECIPES_PATH}`);
console.log(`Pose style recipe report written: ${REPORT_PATH}`);
console.log(`Profiles: ${document.summary.totalProfiles}`);
console.log(`Recipes: ${document.summary.recipeCount}`);
console.log(`Covered motions: ${document.summary.coveredMotionCount}`);
