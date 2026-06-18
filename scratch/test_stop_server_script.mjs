import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync('python', ['scripts/stop_server.py', '--port', '65530', '--dry-run'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /port 65530/);
assert.match(result.stdout, /No listening process found|Would stop PID/);

console.log('PASS test_stop_server_script');
