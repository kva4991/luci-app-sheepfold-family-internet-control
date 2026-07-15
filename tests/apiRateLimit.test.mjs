import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

/** Mirrors sheepfold-api-rate-limit counter semantics for portable tests. */
function rateLimitWouldAllow(state, bucket, clientId, limit, windowSeconds, now) {
  if (!Number.isInteger(limit) || limit <= 0) return true;
  const key = `${bucket}_${clientId}`;
  const current = state.get(key);
  if (!current || now - current.windowStart >= windowSeconds) {
    state.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

describe('API rate limit', () => {
  it('wires per-route buckets in sheepfold-api CGI', () => {
    const cgi = readProjectFile('root/www/cgi-bin/sheepfold-api');

    assert.match(cgi, /sheepfold-api-rate-limit/);
    assert.match(cgi, /enforce_rate_limit pair 12 60/);
    assert.match(cgi, /enforce_rate_limit client_status 120 60/);
    assert.match(cgi, /enforce_rate_limit admin_read 120 60/);
    assert.match(cgi, /enforce_rate_limit ai_assistant 30 60/);
    assert.match(cgi, /enforce_rate_limit api_write 90 60/);
    assert.match(cgi, /rate_limited/);
    assert.match(cgi, /429 Too Many Requests/);
    assert.match(cgi, /Retry-After: %s/);
    assert.match(cgi, /header_json "429 Too Many Requests" "60"/);
  });

  it('uses a fixed window counter per bucket and client id', () => {
    const script = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-rate-limit');
    assert.match(script, /rate_limit_check/);
    assert.match(script, /window_start/);

    const state = new Map();
    const now = 1_700_000_000;
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.50', 3, 60, now), true);
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.50', 3, 60, now + 1), true);
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.50', 3, 60, now + 2), true);
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.50', 3, 60, now + 3), false);
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.51', 3, 60, now + 3), true);
    assert.equal(rateLimitWouldAllow(state, 'pair', '192.168.1.50', 3, 60, now + 61), true);
  });
});
