/*
 * B54–B56: редактор не сохраняет заведомо недопустимые SSID/PSK и не требует
 * пароль для OWE. Исполняются настоящие CLI/CGI; UCI и перезапуск радио заменены
 * локальной моделью. Нет сети и реальных секретов; каждый временный каталог
 * удаляется. Успех не доказывает поддержку OWE, SAE или перезапуск точки на железе.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminFixture } from './helpers/adminConfigRuntimeFixture.mjs';

function fixture(t) {
  const f = createAdminFixture();
  t.after(() => f.close());
  return f;
}
function success(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
function request(f, fields = {}) {
  const revision = success(f.run()).wifiRevision;
  return new URLSearchParams({ expectedWifiRevision: revision, section: 'default_radio0',
    ssid: 'Home', password: 'synthetic-password', encryption: 'psk2',
    channel: 'auto', enabled: '1', confirm: '1', ...fields }).toString();
}
function rejected(result, error) {
  assert.equal(result.status, 2, result.stderr || result.error?.message);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, new RegExp(`^${error}\\n$`));
}
for (const [label, ssid] of [['33 ASCII bytes', 's'.repeat(33)],
  ['17 Cyrillic letters (34 bytes)', 'Я'.repeat(17)], ['9 emoji (36 bytes)', '🎭'.repeat(9)]]) {
  test(`SSID rejects ${label} before saving or reloading`, (t) => {
    const f = fixture(t), before = f.values('wireless');
    rejected(f.run('wifi-save', request(f, { ssid })), 'invalid_wifi_ssid');
    assert.deepEqual(f.values('wireless'), before);
    assert.equal(f.actions(), '');
  });
}
for (const ssid of ['s', 's'.repeat(32), 'Я'.repeat(16), '🎭'.repeat(8), ' Home ', ' ']) {
  test(`SSID preserves the exact valid byte sequence ${JSON.stringify(ssid)}`, (t) => {
    const f = fixture(t);
    const result = success(f.run('wifi-save', request(f, { ssid }), { LC_ALL: 'C.UTF-8' }));
    assert.equal(f.values('wireless')['wireless.default_radio0.ssid'], ssid);
    assert.equal(result.mutation.runtimeApplied, true);
    assert.match(f.actions(), /wifi reload/);
  });
}
test('empty SSID stays invalid', (t) => {
  const f = fixture(t);
  rejected(f.run('wifi-save', request(f, { ssid: '' })), 'invalid_wifi_ssid');
  assert.equal(f.actions(), '');
});
for (const encryption of ['psk', 'psk2', 'psk-mixed']) {
  for (const [label, password] of [['7 bytes', '1234567'], ['64 nonhex bytes', 'g'.repeat(64)],
    ['65 bytes', 'a'.repeat(65)]]) {
    test(`${encryption} rejects ${label} before saving`, (t) => {
      const f = fixture(t), before = f.values('wireless');
      rejected(f.run('wifi-save', request(f, { encryption, password })), 'invalid_wifi_password');
      assert.deepEqual(f.values('wireless'), before);
      assert.equal(f.actions(), '');
    });
  }
}
for (const password of ['12345678', 'x'.repeat(63), '0123456789aBcDeF'.repeat(4)]) {
  test(`PSK preserves a valid ${password.length}-byte value`, (t) => {
    const f = fixture(t);
    success(f.run('wifi-save', request(f, { password })));
    assert.equal(f.values('wireless')['wireless.default_radio0.key'], password);
  });
}
test('multibyte PSK passphrase is bounded in bytes, not characters', (t) => {
  const f = fixture(t);
  rejected(f.run('wifi-save', request(f, { password: 'Я'.repeat(33) }), { LC_ALL: 'C.UTF-8' }), 'invalid_wifi_password');
  assert.equal(f.actions(), '');
});
test('empty PSK still returns the existing required-password error', (t) => {
  const f = fixture(t);
  rejected(f.run('wifi-save', request(f, { password: '' })), 'wifi_password_required');
  assert.equal(f.actions(), '');
});
test('pure SAE is not inadvertently subjected to the WPA-PSK minimum', (t) => {
  const f = fixture(t);
  success(f.run('wifi-save', request(f, { encryption: 'sae', password: 'x' })));
  assert.equal(f.values('wireless')['wireless.default_radio0.key'], 'x');
});
for (const encryption of ['none', 'owe']) {
  for (const password of ['', 'leftover-from-form']) {
    test(`${encryption} does not retain or require a ${password ? 'leftover' : 'missing'} PSK`, (t) => {
      const f = fixture(t);
      success(f.run('wifi-save', request(f, { encryption, password })));
      assert.equal(f.values('wireless')['wireless.default_radio0.encryption'], encryption);
      assert.equal(Object.hasOwn(f.values('wireless'), 'wireless.default_radio0.key'), false);
    });
  }
}
test('invalid SSID reaches the authenticated CGI as 400 without effects', (t) => {
  const f = fixture(t);
  const result = f.cgi(request(f, { ssid: 's'.repeat(33) }), {
    REQUEST_METHOD: 'POST', PATH_INFO: '/api/v1/admin-config/wifi/save' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Status: 400 Bad Request/);
  assert.equal(JSON.parse(result.stdout.split(/\r?\n\r?\n/)[1]).error, 'invalid_wifi_ssid');
  assert.equal(f.actions(), '');
});
test('OWE without a password succeeds through the authenticated CGI', (t) => {
  const f = fixture(t);
  const result = f.cgi(request(f, { encryption: 'owe', password: '' }), {
    REQUEST_METHOD: 'POST', PATH_INFO: '/api/v1/admin-config/wifi/save' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Status: 200 OK/);
  assert.equal(JSON.parse(result.stdout.split(/\r?\n\r?\n/)[1]).mutation.runtimeApplied, true);
  assert.equal(Object.hasOwn(f.values('wireless'), 'wireless.default_radio0.key'), false);
});
