/*
 * B50–B52: ревизия не скрывает отказ UCI/hash, JSON не меняет текст,
 * списки UCI/form не раскрываются в имена файлов. Настоящие shell-entrypoints;
 * состояние и отказы UCI синтетические, без сети/роутера/пользовательских данных.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminFixture } from './helpers/adminConfigRuntimeFixture.mjs';

function fixture(t, values = {}, wireless = {}) {
  const value = createAdminFixture(values, wireless); t.after(() => value.close()); return value;
}
function success(result) {
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}
function rejected(result, code) {
  assert.notEqual(result.status, null, result.error?.message);
  assert.notEqual(result.status, 0, 'Failed boundary must not report success');
  assert.equal(result.stdout, '');
  if (code) assert.match(result.stderr, new RegExp(code));
}
const form = (fields) => new URLSearchParams(fields).toString();
const notice = (revision) => form({ schemaVersion: '1', expectedRevision: revision,
  simChangeMode: 'all', childWifiMode: 'network_only' });
const schedule = (revision, fields = {}) => form({ schemaVersion: '1', expectedRevision: revision,
  section: 'daily', name: 'Evening', description: 'Test', enabled: '1', action: 'block',
  targetType: 'group', targets: 'family', weekdays: 'mon', timeRanges: '21:00-22:00', ...fields });

for (const config of ['sheepfold', 'wireless']) {
  for (const partial of ['0', '1']) test(`revision refuses failed ${config} read (partial=${partial})`, (t) => {
    const f = fixture(t);
    rejected(f.run('get', '', { TEST_FAIL_SHOW: config, TEST_PARTIAL_SHOW: partial }), 'config_read_failed');
    assert.equal(f.actions(), '');
  });
}

test('missing optional wireless config keeps a wired router readable', (t) => {
  const f = fixture(t); rmSync(join(f.configs, 'wireless'));
  const model = success(f.run());
  assert.deepEqual(model.wifiNetworks, []);
  assert.equal(model.wifiEnabled, false);
  assert.equal(model.wifiRevision, createHash('sha256').update('').digest('hex'));
});

test('failed partial revision cannot authorize a settings write', (t) => {
  const f = fixture(t), before = f.values(), revision = success(f.run()).revision;
  rejected(f.run('notification-settings-save', notice(revision), { TEST_FAIL_SHOW: 'sheepfold', TEST_PARTIAL_SHOW: '1' }), 'config_read_failed');
  assert.deepEqual(f.values(), before); assert.equal(f.actions(), '');
});

test('failed empty read cannot authorize a settings write with the empty hash', (t) => {
  const f = fixture(t), before = f.values();
  const revision = createHash('sha256').update('').digest('hex');
  rejected(f.run('notification-settings-save', notice(revision), { TEST_FAIL_SHOW: 'sheepfold' }), 'config_read_failed');
  assert.deepEqual(f.values(), before); assert.equal(f.actions(), '');
});

test('genuine stale revision remains a conflict before any write', (t) => {
  const f = fixture(t); const result = f.run('notification-settings-save', notice('a'.repeat(64)));
  rejected(result, 'revision_conflict'); assert.equal(result.status, 3); assert.equal(f.actions(), '');
});

test('matching revision still saves and verifies notification settings', (t) => {
  const f = fixture(t); const before = success(f.run());
  const after = success(f.run('notification-settings-save', notice(before.revision)));
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.mutation.kind, 'notification-settings-save');
  assert.equal(f.values()['sheepfold.global.sim_change_notifications'], 'all');
});

for (const tool of ['sha256sum', 'openssl']) {
  for (const [label, output, status] of [['nonzero with valid digest', 'a'.repeat(64), 1],
    ['empty success', '', 0], ['malformed success', 'not-a-sha256', 0]]) {
    test(`${tool} ${label} is not a revision`, (t) => {
      const f = fixture(t);
      f.put(tool, `#!/bin/sh\nprintf '%s\\n' '${tool === 'openssl' ? 'SHA2-256(stdin)= ' : ''}${output}'\nexit ${status}\n`);
      let setup = '';
      if (tool === 'openssl') {
        // Отдельный PATH без sha256sum реально выбирает fallback, не меняя продукт.
        const tools = join(f.root, 'hash-tools'); mkdirSync(tools);
        for (const name of ['awk', 'grep', 'tr', 'sed']) symlinkSync(`/usr/bin/${name}`, join(tools, name));
        symlinkSync(join(f.bin, 'openssl'), join(tools, 'openssl'));
        setup = `PATH='${tools}'\n`;
      }
      rejected(f.shell(`${setup}hash_state 'synthetic state'`), 'revision_hash_unavailable');
    });
  }
}

test('normal SHA-256 revision format and value remain compatible', (t) => {
  const f = fixture(t), input = 'synthetic state';
  const result = f.shell(`hash_state '${input}'`);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), createHash('sha256').update(input).digest('hex'));
});

test('read failure reaches CGI as 503, not a successful empty family', (t) => {
  const f = fixture(t); const result = f.cgi('', { TEST_FAIL_SHOW: 'sheepfold' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Status: 503 Service Unavailable\r?\n/);
  const model = JSON.parse(result.stdout.split(/\r?\n\r?\n/)[1]);
  assert.equal(model.error, 'config_read_failed'); assert.equal(model.ok, false);
  assert.equal(f.actions(), '');
});

for (const value of ['Line 1\nLine 2', 'Tab\there', 'Carriage\rreturn', 'Control\u0001end',
  'Backspace\bend', 'Form\ffeed', 'Unit\u001fseparator', 'Кружок «Музыка» 🎼 " \\']) {
  test(`admin snapshot preserves JSON text ${JSON.stringify(value)}`, (t) => {
    const f = fixture(t, { 'sheepfold.family.description': value });
    assert.equal(success(f.run()).groups[0].description, value);
  });
}

test('all representable control bytes are escaped by the serializer', (t) => {
  const f = fixture(t), text = Array.from({ length: 31 }, (_, index) => String.fromCharCode(index + 1)).join('');
  const result = f.shell('json_string "$TEST_TEXT"', { TEST_TEXT: text });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout), text);
});

test('serializer preserves trailing newlines passed directly to it', (t) => {
  const f = fixture(t), text = 'name\n\n';
  const result = f.shell('json_string "$TEST_TEXT"', { TEST_TEXT: text });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout), text);
});

for (const pattern of ['*', 'famil?', '[f]amily']) {
  test(`schedule target ${pattern} cannot select cwd files`, (t) => {
    const f = fixture(t); f.file('family');
    const before = f.values(), revision = success(f.run()).revision;
    rejected(f.run('schedule-save', schedule(revision, { targets: pattern })), 'invalid_schedule_target');
    assert.deepEqual(f.values(), before); assert.equal(f.actions(), '');
  });
}

test('wildcard weekdays cannot become a valid day via a cwd file', (t) => {
  const f = fixture(t); f.file('mon');
  const revision = success(f.run()).revision;
  rejected(f.run('schedule-save', schedule(revision, { weekdays: '*' })), 'invalid_schedule_weekdays');
  assert.equal(f.actions(), '');
});

test('wildcard device IDs cannot move whichever devices match cwd files', (t) => {
  const f = fixture(t); f.file('42');
  const revision = success(f.run()).revision, before = f.values();
  rejected(f.run('group-save', form({ schemaVersion: '1', expectedRevision: revision, section: 'family',
    name: 'Family', description: 'Test', color: '#123456', personal: '0', allowlistOnly: '0', deviceIds: '*' })), 'invalid_group_device');
  assert.deepEqual(f.values(), before); assert.equal(f.actions(), '');
});

test('read model does not leak cwd entries through a stored wildcard target', (t) => {
  const f = fixture(t, { 'sheepfold.daily.targets': ['*'] }); f.file('not-a-device');
  const model = success(f.run()); assert.deepEqual(model.schedules[0].targets, ['*']);
});

test('explicit schedule selection works even beside matching filesystem entries', (t) => {
  const f = fixture(t); f.file('family');
  const revision = success(f.run()).revision;
  const model = success(f.run('schedule-save', schedule(revision)));
  assert.deepEqual(model.schedules[0].targets, ['family']);
  assert.equal(model.mutation.runtimeApplied, true);
});

test('OpenSSL fallback preserves the SHA-256 revision when sha256sum is absent', (t) => {
  const f = fixture(t), tools = join(f.root, 'hash-tools'), value = 'synthetic state';
  mkdirSync(tools);
  for (const name of ['awk', 'grep', 'tr', 'sed', 'openssl']) symlinkSync(`/usr/bin/${name}`, join(tools, name));
  const result = f.shell(`PATH='${tools}'\nhash_state '${value}'`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), createHash('sha256').update(value).digest('hex'));
});
