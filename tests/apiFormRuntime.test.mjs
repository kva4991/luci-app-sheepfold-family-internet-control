/*
 * Выполняет настоящий CGI с формами Android: потерянный хвост, неверная длительность
 * и ошибочный отказ не должны приводить к другой backend-команде
 * Авторизация и системные службы изолированы; меняются только удаляемые fixtures
 * Это не HTTP/TLS-проверка и не проверка применения на реальном OpenWrt
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRouterFixture, parseCgi, testMac } from './helpers/routerRuntimeFixture.mjs';

function request(path, body, env = {}, values = {}) {
  const fixture = createRouterFixture(values);
  try {
    const result = fixture.run('sheepfold-api-legacy', [], { input: body, env: {
      REQUEST_METHOD: 'POST', PATH_INFO: path, CONTENT_LENGTH: String(Buffer.byteLength(body)),
      ...env,
    } });
    const response = parseCgi(result);
    assert.equal((result.stdout.match(/Status:/g) || []).length, 1, result.stdout);
    return { ...response, calls: fixture.calls() };
  } finally {
    fixture.close();
  }
}

const macBody = `mac=${encodeURIComponent(testMac)}`;
describe('Legacy API runtime form regressions', () => {
  for (const [path, body, command] of [
    ['/device/allow', macBody, `device-allow ${testMac}`],
    ['/device/block', macBody, `device-block ${testMac}`],
    ['/device/temp-access', `${macBody}&minutes=5`, `device-temp-access ${testMac} 5`],
    ['/global-block', 'enable=1&confirm=1', 'global-block-on'],
    ['/global-block', 'enable=0&confirm=1', 'global-block-off'],
    ['/log/clear', 'confirm=1', null],
  ]) {
    for (const suffix of ['', '&']) {
      it(`${path} consumes the final field${suffix ? ' with a trailing separator' : ''}`, () => {
        const result = request(path, body + suffix);
        assert.equal(result.status, 200);
        assert.deepEqual(result.calls, command ? [command] : []);
      });
    }
  }
  for (const minutes of ['', '0', '-1', 'word', '1441', '999999999999999999999999']) {
    it(`rejects invalid duration ${JSON.stringify(minutes)} without a default grant`, () => {
      const result = request('/device/temp-access', `${macBody}&minutes=${minutes}`);
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'invalid_minutes');
      assert.deepEqual(result.calls, []);
    });
  }
  for (const control of ['\n', '\r', '\u001c']) {
    it(`rejects a trailing raw control byte ${control.charCodeAt(0)}`, () => {
      const result = request('/global-block', 'enable=1&confirm=1' + control);
      assert.equal(result.status, 400);
      assert.deepEqual(result.calls, []);
    });
  }
  it('retains valid percent-encoded multiline form values', () => {
    const result = request('/global-block', 'enable=1&note=first%0Asecond&confirm=1');
    assert.equal(result.status, 200);
    assert.deepEqual(result.calls, ['global-block-on']);
  });
  it('normalizes decimal leading zeros instead of passing octal arithmetic to ash', () => {
    const result = request('/device/temp-access', `${macBody}&minutes=0008`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.calls, [`device-temp-access ${testMac} 8`]);
  });
  for (const bad of ['confirm=1&confirm=0', 'confirm=1&%63onfirm=0', 'confirm=1&x=%00',
    'confirm=1&x=%GG', 'confirm=1&x=%', 'confirm=%00']) {
    it(`rejects the complete invalid form ${bad}`, () => {
      const result = request('/global-block', `enable=1&${bad}`);
      assert.equal(result.status, 400);
      assert.deepEqual(result.calls, []);
    });
  }
  for (const [length, code] of [['65537', 413], ['999999999999999999', 413], ['-1', 400], ['broken', 400], ['30', 400]]) {
    it(`stops CGI exactly once for invalid Content-Length ${length}`, () => {
      const result = request('/global-block', 'enable=1&confirm=1', { CONTENT_LENGTH: length });
      assert.equal(result.status, code);
      assert.deepEqual(result.calls, []);
    });
  }
  it('reports a failed log clear rather than claiming success', () => {
    const fixture = createRouterFixture();
    try {
      fixture.setValues({ 'sheepfold.global.log_cache_path': `${fixture.runtime}/missing/events.log` });
      const result = parseCgi(fixture.run('sheepfold-api-legacy', [], {
        input: 'confirm=1', env: { REQUEST_METHOD: 'POST', PATH_INFO: '/log/clear', CONTENT_LENGTH: '9' },
      }));
      assert.equal(result.status, 500);
      assert.equal(result.body.error, 'log_clear_failed');
    } finally { fixture.close(); }
  });
  it('rejects damaged query parameters before dispatch', () => {
    const result = request('/log', '', { REQUEST_METHOD: 'GET', QUERY_STRING: 'lines=5&bad=%00' });
    assert.equal(result.status, 400);
  });
});
