/*
 * Проверяет шифрование, валидацию и восстановление экспорта настроек в изолированном
 * VM-контексте Node. Реальные UCI/DHCP/Wi-Fi файлы не затрагиваются; зелёный результат
 * не заменяет backup/restore на тестовом роутере.
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const resources = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const backupPath = join(resources, 'sheepfold/features/settings/backup.js');
const overview = readFileSync(join(resources, 'view/sheepfold/overview.js'), 'utf8');
const routerControl = readFileSync(join(
  root,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy'
), 'utf8');

function loadBackupModel() {
  const source = readFileSync(backupPath, 'utf8').replace(/^'require .*?';\r?\n/gm, '');
  const context = {
    module: { exports: {} },
    baseclass: { extend: (value) => value },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Promise,
    Date,
    JSON,
    Object,
    Array,
    String,
    RegExp,
    Error
  };
  vm.runInNewContext(`(function () { ${source.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context);
  return context.module.exports;
}

function sourceSections(secret = 'telegram-secret') {
  return {
    sheepfold: [
      { '.name': 'global', '.type': 'sheepfold', language: 'ru', telegram_bot_token: secret },
      { '.name': 'allowlist', '.type': 'list', mac: ['00:11:22:33:44:55'] },
      { '.name': 'blocklist', '.type': 'list', mac: ['AA:BB:CC:DD:EE:FF'] },
      { '.name': 'messenger_global', '.type': 'messenger', active: 'telegram' },
      { '.name': 'device_phone', '.type': 'device', id: '1', mac: '00:11:22:33:44:55' }
    ],
    dhcp: [{ '.name': 'phone', '.type': 'host', mac: '00:11:22:33:44:55', ip: '192.168.1.20' }],
    wireless: [
      { '.name': 'radio0', '.type': 'wifi-device', channel: 'auto' },
      { '.name': 'default_radio0', '.type': 'wifi-iface', ssid: 'Home', key: 'wifi-secret' }
    ]
  };
}

describe('settings backup and restore', () => {
  it('exports every Sheepfold section type while masking secrets in readable JSON', () => {
    const backup = loadBackupModel();
    const payload = backup.build(sourceSections(), false, '2026-07-16T00:00:00Z');
    const global = payload.configs.sheepfold.find((section) => section.name === 'global');
    const wifi = payload.configs.wireless.find((section) => section.type === 'wifi-iface');

    assert.equal(payload.format, 'sheepfold-settings-export-v2');
    assert.ok(payload.configs.sheepfold.some((section) => section.type === 'messenger'));
    assert.equal(global.options.telegram_bot_token, '[secret]');
    assert.equal(wifi.options.key, '[secret]');
    assert.equal(backup.validate(payload).configs.dhcp.length, 1);
  });

  it('rejects a backup that puts one MAC in both device access lists', () => {
    const backup = loadBackupModel();
    const sections = sourceSections();
    sections.sheepfold.find((section) => section['.name'] === 'blocklist').mac = ['00:11:22:33:44:55'];
    const payload = backup.build(sections, false);

    assert.throws(() => backup.validate(payload), /conflicting_device_lists/);
  });

  it('does not allow readable JSON to smuggle unencrypted secrets', () => {
    const backup = loadBackupModel();
    const payload = backup.build(sourceSections(), false);
    const global = payload.configs.sheepfold.find((section) => section.name === 'global');
    global.options.telegram_bot_token = 'plain-text-token';

    assert.throws(() => backup.validate(payload), /unencrypted_secrets_forbidden/);
  });

  it('round-trips full secrets only inside a password-encrypted envelope', async () => {
    const backup = loadBackupModel();
    const full = backup.build(sourceSections(), true);
    const envelope = await backup.encrypt(full, 'correct horse battery staple');
    const restored = await backup.decrypt(envelope, 'correct horse battery staple');
    const global = restored.configs.sheepfold.find((section) => section.name === 'global');

    assert.equal(envelope.format, 'sheepfold-settings-encrypted-v1');
    assert.equal(envelope.cipher, 'AES-256-GCM');
    assert.equal(global.options.telegram_bot_token, 'telegram-secret');
    await assert.rejects(backup.decrypt(envelope, 'wrong password'), /OperationError|decrypt/i);
  });

  it('applies managed UCI configs, preserves placeholders and refreshes router services', () => {
    assert.match(overview, /require sheepfold\.features\.settings\.backup as settingsBackupModel/);
    assert.match(overview, /function stageImportedConfig\(config, importedSections, currentSections, managedTypes\)/);
    assert.match(overview, /value === settingsBackupModel\.secretPlaceholder/);
    assert.match(overview, /payload\.containsSecrets[\s\S]*unencrypted_secrets_forbidden/);
    assert.match(overview, /saveUciChanges\(\['sheepfold', 'dhcp', 'wireless'\]\)/);
    assert.match(overview, /routerControl\(\['settings-import-applied'\]\)/);
    assert.doesNotMatch(overview, /Applying imported settings will be added after backend/);
    assert.match(routerControl, /settings_import_applied\(\)/);
    assert.match(routerControl, /settings-import-applied\)/);
    assert.match(routerControl, /settings_import_applied\(\)[\s\S]*sheepfold-ipv6-control apply/);
    assert.match(routerControl, /sleep 3[\s\S]*dnsmasq reload[\s\S]*wifi reload/);
  });
});
