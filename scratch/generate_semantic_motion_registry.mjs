import { readFileSync, writeFileSync } from 'node:fs';
import { buildSemanticMotionRegistryDocument } from '../js/SemanticMotionRegistryBuilder.js';

const LIBRARY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_library.json';
const REGISTRY_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_registry.json';
const REPORT_PATH = 'examples/m6_7_vrma_samples/review/semantic_motion_registry_report.md';

function formatTaipeiTimestamp(date = new Date()) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taipei.toISOString().replace('Z', '+08:00');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function renderReport(document) {
  const lines = [
    '# Semantic Motion Registry Report',
    '',
    `Phase: ${document.phase}`,
    `Generated: ${document.generatedAt}`,
    `Source: ${document.source}`,
    '',
    '## Summary',
    '',
    `- Motions: ${document.summary.totalMotions}`,
    `- Data ready: ${document.summary.dataReadyCount}`,
    `- Preferred motions: ${document.summary.preferredMotionCount}`,
    `- Runtime playback ready: ${document.summary.runtimePlaybackReadyCount}`,
    '',
    '## Registry',
    '',
  ];

  for (const entry of Object.values(document.motions)) {
    lines.push(`### ${entry.displayName} (${entry.semanticMotionId})`);
    lines.push('');
    lines.push(`- Category: ${entry.category}`);
    lines.push(`- Runtime status: ${entry.runtimeStatus}`);
    lines.push(`- Runtime ready: ${entry.runtimeReady}`);
    lines.push(`- Data ready: ${entry.dataReady}`);
    lines.push(`- Preferred motion: ${entry.preferredMotion}`);
    lines.push(`- Recipes: ${entry.recipes.join(', ') || 'none'}`);
    lines.push(`- Source motions: ${entry.sourceMotions.join(', ') || 'none'}`);
    lines.push(`- Variants: ${entry.variants.length}`);
    lines.push(`- Meanings: ${entry.meanings.join(' / ') || 'none'}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const libraryDocument = readJson(LIBRARY_PATH);
const document = buildSemanticMotionRegistryDocument(libraryDocument, {
  generatedAt: formatTaipeiTimestamp(),
});

writeFileSync(REGISTRY_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
writeFileSync(REPORT_PATH, renderReport(document), 'utf8');

console.log(`Semantic motion registry written: ${REGISTRY_PATH}`);
console.log(`Semantic motion registry report written: ${REPORT_PATH}`);
console.log(`Motions: ${document.summary.totalMotions}`);
console.log(`Data ready: ${document.summary.dataReadyCount}`);
console.log(`Runtime playback ready: ${document.summary.runtimePlaybackReadyCount}`);
