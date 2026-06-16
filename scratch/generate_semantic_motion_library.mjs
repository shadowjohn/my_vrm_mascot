import { readFileSync, writeFileSync } from 'node:fs';
import { buildSemanticMotionLibraryDocument } from '../js/SemanticMotionLibraryBuilder.js';

const RECIPES_PATH = 'examples/m6_7_vrma_samples/review/pose_style_recipes.json';
const LIBRARY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library_report.md';

function formatTaipeiTimestamp(date = new Date()) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().replace('Z', '+08:00');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function renderReport(document) {
  const lines = [
    '# Semantic Motion Library Report',
    '',
    `Phase: ${document.phase}`,
    `Generated: ${document.generatedAt}`,
    `Source: ${document.source}`,
    '',
    '## Summary',
    '',
    `- Motions: ${document.summary.totalMotions}`,
    `- Runtime ready: ${document.summary.runtimeReadyCount}`,
    '',
    '## Category Counts',
    '',
  ];

  for (const [category, count] of Object.entries(document.summary.categoryCounts)) {
    lines.push(`- ${category}: ${count}`);
  }

  lines.push('', '## Motions', '');

  for (const motion of document.motions) {
    lines.push(`### ${motion.displayName} (${motion.id})`);
    lines.push('');
    lines.push(`- Category: ${motion.category}`);
    lines.push(`- Confidence: ${motion.confidence}`);
    lines.push(`- Runtime ready: ${motion.runtimeReady}`);
    lines.push(`- Intent tags: ${motion.intentTags.join(', ')}`);
    lines.push(`- Meanings: ${motion.meanings.join(' / ')}`);
    lines.push(`- Triggers: ${motion.agentTriggers.join(' / ')}`);
    lines.push(`- Recipes: ${motion.recipes.join(', ')}`);
    lines.push(`- Source motions: ${motion.sourceMotions.length}`);
    lines.push(`- Summary: ${motion.recipeSummary}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const recipesDocument = readJson(RECIPES_PATH);
const document = buildSemanticMotionLibraryDocument(recipesDocument, {
  generatedAt: formatTaipeiTimestamp(),
});

writeFileSync(LIBRARY_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
writeFileSync(REPORT_PATH, renderReport(document), 'utf8');

console.log(`Semantic motion library written: ${LIBRARY_PATH}`);
console.log(`Semantic motion library report written: ${REPORT_PATH}`);
console.log(`Motions: ${document.summary.totalMotions}`);
console.log(`Runtime ready: ${document.summary.runtimeReadyCount}`);
