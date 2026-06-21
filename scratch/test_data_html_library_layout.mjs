import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('data.html', 'utf8');

assert.match(html, /id="kindDialog"/);
assert.match(html, /id="itemDialog"/);
assert.match(html, /id="openItemDialogBtn"/);
assert.match(html, /data-action="edit"/);
assert.match(html, /target="_blank"/);
assert.match(html, /<th>用途<\/th>/);
assert.match(html, /kindItemCount/);
assert.match(html, /deleteKindBtn/);
assert.doesNotMatch(html, /class="panel side"/);

console.log('data html library layout ok');
