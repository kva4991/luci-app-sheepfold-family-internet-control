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
    assert.match(cgi, /\/ping\)[\s\S]*enforce_rate_limit discovery 30 60[\s\S]*run_legacy/);
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

  it('starts a newly issued QR with fresh limits and counts only rejected credentials', () => {
    const pairApi = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-pair');
    const pairActivate = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-activate');
    const bodyRead = pairApi.indexOf('body="$(read_body)"');
    const limitCheck = pairApi.indexOf('attempt_limit_allows ||');
    const pairingCall = pairApi.indexOf('sheepfold-router-control pair-admin-device');
    const failedAttempt = pairApi.indexOf('record_failed_attempt || true');

    assert.ok(bodyRead >= 0 && bodyRead < limitCheck);
    assert.ok(limitCheck < pairingCall && pairingCall < failedAttempt);
    assert.match(pairApi, /device_not_resolved[\s\S]*device_blocklisted[\s\S]*token_generation_failed[\s\S]*record_failed_attempt/);
    assert.match(pairActivate, /reset_old_pairing_attempts/);
    assert.match(pairActivate, /reset-bucket pair/);
    assert.match(pairActivate, /pair-attempts/);
  });

  it('parses the Android form body without a BusyBox pipeline subshell', () => {
    const pairApi = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-pair');
    const parserStart = pairApi.indexOf('form_get()');
    const parserEnd = pairApi.indexOf('\n}\n\nkv_get()', parserStart);
    const parser = pairApi.slice(parserStart, parserEnd);
    const executableParser = parser
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    assert.match(parser, /form_rest="\$\{form_rest#\*&\}"/);
    assert.match(parser, /form_item_key="\$\{form_item%%=\*\}"/);
    assert.doesNotMatch(executableParser, /\|\s*while/);
  });

  it('uses a fixed window counter per bucket and client id', () => {
    const script = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-rate-limit');
    assert.match(script, /rate_limit_check/);
    assert.match(script, /rate_limit_reset_bucket/);
    assert.match(script, /window_start/);
    assert.doesNotMatch(script, /^\s+now count window_start/m);

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
