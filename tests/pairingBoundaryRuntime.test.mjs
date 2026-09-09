/*
 * Настоящий CGI получает формы с дубликатами, битым хвостом и ошибками чтения.
 * Backend записи заменён счётчиком, чтобы доказать отказ до расходования QR.
 * Меняются только удаляемые fixtures; результат не проверяет uhttpd или телефон.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPairingFixture, testCode } from './helpers/pairingRuntimeFixture.mjs';
import { installExecutable } from './helpers/controlRuntimeFixture.mjs';
import { parseCgi } from './helpers/routerRuntimeFixture.mjs';

const validBody = `login=Parent&code=${encodeURIComponent(testCode)}`;
function checkRequest(body, expected, env = {}, setup = () => {}) {
  const f = createPairingFixture();
  try {
    setup(f);
    const result = f.request(body, env);
    const response = parseCgi(result);
    assert.equal((result.stdout.match(/Status:/g) || []).length, 1, result.stdout);
    assert.equal(response.status, expected, result.stdout + result.stderr);
    if (expected !== 200) assert.deepEqual(f.pairCalls(), [], 'bad input must not call pairing backend');
    return { ...response, calls: f.pairCalls() };
  } finally { f.close(); }
}

describe('Pairing CGI strict form boundary', () => {
  for (const suffix of ['', '&']) {
    it(`preserves the final encoded pairing code${suffix ? ' with trailing separator' : ''}`, () => {
      const result = checkRequest(validBody + suffix, 200);
      assert.equal(result.calls[0][1], 'Parent');
      assert.equal(result.calls[0][2], testCode);
      assert.equal(result.body.paired, true);
    });
  }
  for (const tail of ['&code=Different', '&%63ode=Different', '&login=Other',
    '&unused=%GG', '&unused=%', '&unused=%00', '&=missingKey', '&unused=x&unused=y']) {
    it(`rejects the complete malformed form ${tail}`, () => {
      assert.equal(checkRequest(validBody + tail, 400).body.error, 'invalid_form');
    });
  }
  for (const control of ['\n', '\r', '\u001c', '\0']) {
    const options = {
      skip: process.platform === 'win32' && control === '\r'
        ? 'MSYS normalizes a raw CR before the shell parser; covered by Linux CI'
        : false,
    };
    it(`rejects a raw control byte ${control.charCodeAt(0)}`, options, () => {
      checkRequest(validBody + control, 400);
    });
  }
  it('does not reinterpret a literal backslash as a shell escape inside a pairing code', () => {
    checkRequest('login=Parent&code=Va\\x6Cid%2BCode', 400);
  });
  it('accepts encoded keys and percent-encoded unused multiline text', () => {
    const result = checkRequest('%6Cogin=Parent&%63ode=Valid%2BCode&note=one%0Atwo', 200);
    assert.equal(result.calls[0][2], testCode);
  });
  for (const [length, status] of [['4097', 413], ['9999999999999999999999999', 413],
    ['-1', 400], ['broken', 400], [String(validBody.length + 5), 400]]) {
    it(`returns a single error response for Content-Length ${length}`, () => {
      checkRequest(validBody, status, { CONTENT_LENGTH: length });
    });
  }
  it('accepts leading zeros in a valid decimal Content-Length', () => {
    checkRequest(validBody, 200, { CONTENT_LENGTH: '000' + Buffer.byteLength(validBody) });
  });
  it('discards even a complete body if the read command failed', () => {
    checkRequest(validBody, 400, {}, (f) => installExecutable(f, 'dd', '#!/bin/sh\ncat\nexit 1\n'));
  });
  it('keeps the client header gate before parsing', () => {
    checkRequest(validBody, 403, { HTTP_X_SHEEPFOLD_CLIENT: '', HTTP_USER_AGENT: '' });
  });
  it('keeps the unsupported-method gate', () => {
    checkRequest(validBody, 405, { REQUEST_METHOD: 'GET' });
  });
});
