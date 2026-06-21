import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('data.html', 'utf8');
const fn = html.match(/function rowActionsHtml\(item\) \{[\s\S]*?\n    \}/)?.[0] || '';

const vrmaBranch = fn.indexOf("if (item.source_kind === 'vrma')");
const previewBranch = fn.indexOf('if (canPreview)');
assert(vrmaBranch >= 0, 'rowActionsHtml must handle VRMA rows explicitly');
assert(previewBranch >= 0, 'rowActionsHtml must keep generic preview handling');
assert(vrmaBranch < previewBranch, 'VRMA rows with existing pose_json_path must re-run VRMA conversion, not /queue');
assert(fn.includes('data-action="convert-vrma-pose-json"'), 'VRMA recheck must call convert-vrma-pose-json');
assert(fn.includes('data-action="convert-pose-json-vrma"'), 'pose_json rows must expose pose_json to VRMA export');
assert(html.includes('demo_vrma.html?url='), 'rows with vrma_path must preview through demo_vrma.html');

console.log('data html vrma recheck action ok');
