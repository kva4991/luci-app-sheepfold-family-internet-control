/*
 * Rejects corrupted token metadata and failed authentication dependencies using
 * real shell/CGI code. Checks full replies, exit status and protected dispatch,
 * not source substrings. Faults and synthetic records live only in .build and
 * are removed in finally. Does not prove real flash, uhttpd or phone behavior.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createAuthFixture, authRecord, authHash, authNow, quote, runDigestFixture } from './helpers/tokenAuthenticationFixture.mjs';
import { installExecutable } from './helpers/controlRuntimeFixture.mjs';
import { parseCgi } from './helpers/routerRuntimeFixture.mjs';

const withFixture = (body, record, extra) => {
  const f = createAuthFixture(record, extra);
  try { return body(f); } finally { f.close(); }
};
const denied = (f, command) => {
  const result = f.runAuth(command);
  assert.ifError(result.error);
  if (command === 'check-token') assert.equal(result.stdout, 'fail\n', result.stderr);
  else assert.notEqual(result.status, 0, result.stdout + result.stderr);
};
const commands = ['authenticate-token', 'check-token', 'token-login'];

function failHash(f) {
  installExecutable(f, 'sha256sum', `#!/bin/sh\ncat >/dev/null\nprintf '${authHash}  -\\n'\nexit 7\n`);
}
function failReader(f) {
  // Both old sed-based and new awk-based readers see the same I/O failure.
  for (const tool of ['sed', 'awk']) installExecutable(f, tool, `#!/bin/sh\nfor arg do
[ "$arg" != ${quote(f.recordPath)} ] || exit 7
done\nexec /usr/bin/${tool} "$@"\n`);
}

describe('Stored token validation agreement', () => {
  it('accepts a valid bound record through all three consumers', () => withFixture((f) => {
    assert.equal(f.runAuth('authenticate-token').status, 0);
    assert.equal(f.runAuth('check-token').stdout, 'ok\n');
    assert.equal(f.runAuth('token-login').stdout, 'Parent\n');
  }));
  for (const [name, record] of [
    ['missing expiration', authRecord({ expires_at: null })],
    ['invalid expiration', authRecord({ expires_at: 'damaged' })],
    ['negative expiration', authRecord({ expires_at: '-1' })],
    ['missing issue time', authRecord({ issued_at: null })],
    ['invalid issue time', authRecord({ issued_at: 'damaged' })],
    ['wrong record owner', authRecord({ login: 'AnotherParent' })],
    ['duplicate login', authRecord() + 'login=AnotherParent\n'],
    ['duplicate expiration', authRecord() + 'expires_at=1\n'],
    ['conflicting duplicate device ID', authRecord() + 'device_id=2\n'],
    ['embedded NUL', authRecord({ login: 'Parent\u0000' })],
    ['unexpected malformed line', authRecord() + 'broken-record-line\n'],
  ]) it(`rejects ${name} consistently`, () => withFixture((f) => {
    for (const command of commands) denied(f, command);
  }, record));
  it('accepts the complete final field without a trailing newline', () => withFixture((f) => {
    for (const command of commands) assert.equal(f.runAuth(command).status, 0);
    assert.equal(f.runAuth('check-token').stdout, 'ok\n');
  }, authRecord().trimEnd()));
  it('retains the MAC-bound old permanent ID alias', () => withFixture((f) => {
    assert.equal(f.runAuth('authenticate-token').status, 0);
    assert.equal(f.runAuth('check-token', undefined, 'D-0001').stdout, 'ok\n');
    assert.equal(f.runAuth('token-login', undefined, 'D-0001').stdout, 'Parent\n');
  }, authRecord({ device_id: 'D-0001' })));
  for (const expires of ['0', '1700000001', authNow]) it(`preserves the existing valid deadline ${expires}`, () => withFixture((f) => {
    assert.equal(f.runAuth('authenticate-token').status, 0);
    assert.equal(f.runAuth('check-token').stdout, 'ok\n');
    assert.equal(f.runAuth('token-login').stdout, 'Parent\n');
  }, authRecord({ expires_at: expires })));
  it('rejects an expired record in every consumer', () => withFixture((f) => {
    for (const command of commands) denied(f, command);
  }, authRecord({ expires_at: '1699999999' })));
  it('keeps empty legacy records out of the public server-bound API', () => withFixture((f) => {
    assert.equal(f.runAuth('authenticate-token').status, 4);
    assert.equal(f.runAuth('check-token').stdout, 'ok\n');
  }, ''));
  it('does not grant a syntactically valid record for a revoked device', () => withFixture((f) => {
    for (const command of commands) denied(f, command);
  }, undefined, { 'sheepfold.phone.admin_device': '0' }));
});

describe('Authentication dependency failures do not confirm or revoke sessions', () => {
  it('rejects the plausible output of a failed SHA-256 process in all consumers', () => withFixture((f) => {
    failHash(f);
    for (const command of commands) denied(f, command);
    assert.equal(f.runAuth('authenticate-token').status, 5);
  }));
  for (const name of ['test-auth-cgi', 'sheepfold-api-legacy']) {
    it(`returns one 503 without protected dispatch after hash failure in ${name}`, () => withFixture((f) => {
      failHash(f);
      const result = f.request(name);
      const response = parseCgi(result);
      assert.equal(response.status, 503);
      assert.equal(response.body.error, 'auth_backend_unavailable');
      assert.equal((result.stdout.match(/Status:/g) || []).length, 1);
      assert.equal(f.actions(), '');
      assert.ok(existsSync(f.recordPath));
    }));
    it(`returns 503 on record read failure in ${name}`, () => withFixture((f) => {
      failReader(f);
      const result = f.request(name);
      assert.equal(parseCgi(result).status, 503);
      assert.equal(parseCgi(result).body.error, 'auth_backend_unavailable');
      assert.equal(f.actions(), '');
    }));
    it(`keeps 401 for an unknown bearer in ${name}`, () => withFixture((f) => {
      assert.equal(parseCgi(f.request(name, 'wrong-synthetic-bearer')).status, 401);
      assert.equal(f.actions(), '');
    }));
    it(`keeps 401 for malformed metadata in ${name}`, () => withFixture((f) => {
      assert.equal(parseCgi(f.request(name)).status, 401);
      assert.equal(f.actions(), '');
    }, authRecord({ expires_at: 'damaged' })));
  }
  it('does not classify unavailable clock as a revoked credential', () => withFixture((f) => {
    installExecutable(f, 'date', '#!/bin/sh\nexit 1\n');
    assert.equal(f.runAuth('authenticate-token').status, 5);
    assert.equal(parseCgi(f.request()).status, 503);
    assert.equal(f.actions(), '');
  }));
  it('recovers with the same token after a transient hash failure', () => withFixture((f) => {
    const before = readFileSync(f.recordPath, 'utf8');
    failHash(f);
    assert.equal(parseCgi(f.request()).status, 503);
    installExecutable(f, 'sha256sum', '#!/bin/sh\nexec /usr/bin/sha256sum "$@"\n');
    assert.equal(f.runAuth('authenticate-token').status, 0);
    assert.equal(readFileSync(f.recordPath, 'utf8'), before);
  }));
  it('refuses a partially printed field even if a failed reader emitted valid data', () => withFixture((f) => {
    for (const tool of ['sed', 'awk']) installExecutable(f, tool, `#!/bin/sh\nfor arg do
if [ "$arg" = ${quote(f.recordPath)} ]; then /usr/bin/${tool} "$@"; exit 7; fi
done\nexec /usr/bin/${tool} "$@"\n`);
    assert.equal(f.runAuth('authenticate-token').status, 5);
    assert.equal(f.actions(), '');
  }));
  it('reads updated metadata on the next request rather than caching an authorization', () => withFixture((f) => {
    assert.equal(f.runAuth('authenticate-token').status, 0);
    writeFileSync(f.recordPath, authRecord({ expires_at: '1' }));
    denied(f, 'authenticate-token');
  }));
});


describe('Authentication digest provider boundary', () => {
  for (const provider of ['sha256sum', 'openssl']) {
    const output = provider === 'openssl' ? `SHA2-256(stdin)= ${authHash}` : `${authHash}  -`;
    it(`accepts successful ${provider} with the existing digest format`, () => withFixture((f) => {
      const result = runDigestFixture(f, { provider, output });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), authHash);
    }));
    it(`discards a complete-looking digest from failed ${provider}`, () => withFixture((f) => {
      const result = runDigestFixture(f, { provider, output, status: 7 });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    }));
    it(`rejects malformed successful output from ${provider}`, () => withFixture((f) => {
      const result = runDigestFixture(f, { provider, output: 'not-a-sha256-digest' });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    }));
  }
  it('fails without any supported SHA-256 provider', () => withFixture((f) => {
    assert.notEqual(runDigestFixture(f, { provider: 'missing' }).status, 0);
  }));
  for (const name of ['test-auth-cgi', 'sheepfold-api-legacy']) {
    it(`dispatches a healthy authenticated read in ${name}`, () => withFixture((f) => {
      assert.equal(parseCgi(f.request(name)).status, 200);
      assert.match(f.actions(), /devices/);
    }));
  }
});
