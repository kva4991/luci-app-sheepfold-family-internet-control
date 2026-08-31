/*
 * Ручной cross-runtime gate C/OpenSSL/Jansson против канонического Node SFMR1.
 * Использует только публичный vector и случайные fixtures, не сеть/ключи/настройки семьи.
 * Запускает переданный executable с ограничениями времени/вывода; успех не доказывает
 * target ABI, durable ledger, provisioning или выполнение команд. §mrelay1 §testwhy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import test from 'node:test';
import { buildActionHash, canonicalJson, decryptEnvelope, encryptEnvelope } from './protocolModel.mjs';

const binary = process.env.SHEEPFOLD_RELAY_CRYPTO;
assert.ok(binary && isAbsolute(binary), 'Set SHEEPFOLD_RELAY_CRYPTO to the reviewed absolute executable path');
const vector = JSON.parse(readFileSync(new URL('./fixtures/protocol-v1-golden.json', import.meta.url)));
const keyBytes = Buffer.from(vector.keyHex, 'hex');
const keyRecord = {
  direction: vector.envelope.direction,
  streamId: vector.envelope.streamId,
  keyId: vector.envelope.keyId,
  keyBytes: keyBytes.toString('base64url'),
};
const payload = JSON.parse(vector.payloadUtf8);

function call(request, accepted = true) {
  const result = spawnSync(binary, [], {
    input: typeof request === 'string' || Buffer.isBuffer(request) ? request : JSON.stringify(request),
    encoding: 'utf8', timeout: 3_000, maxBuffer: 32_768, shell: false,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  if (accepted) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  }
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '', 'Failed authentication must not expose partial plaintext');
  const error = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(error), ['error']);
  assert.match(error.error, /^[A-Za-z]+$/);
  return error.error;
}

function request(operation = 'decrypt') {
  return { operation, envelope: { ...vector.envelope }, keyRecord: { ...keyRecord }, now: vector.envelope.issuedAt };
}

test('native decrypt and encrypt exactly match the Android and Node golden vector', () => {
  assert.deepEqual(call(request()), payload);
  const input = request('encrypt');
  input.envelope.ciphertext = '';
  input.payload = payload;
  assert.deepEqual(call(input), vector.envelope);
});

test('key scope, metadata, GCM tag and expiry fail closed', () => {
  for (const change of [
    input => { input.keyRecord.keyBytes = randomBytes(32).toString('base64url'); },
    input => { input.keyRecord.streamId = randomBytes(16).toString('base64url'); },
    input => { input.keyRecord.direction = 'routerToPhone'; },
    input => { input.envelope.sequence++; },
    input => { input.envelope.messageId = randomBytes(16).toString('base64url'); },
    input => { input.now = input.envelope.expiresAt; },
    input => { input.now = input.envelope.issuedAt - 61; },
    input => { input.envelope.ciphertext = `${input.envelope.ciphertext.slice(0, -1)}!`; },
    input => { input.envelope.phoneId = `${input.envelope.phoneId.slice(0, -1)}h`; },
    input => { input.envelope.ciphertext += '='; },
    input => { input.envelope.unknown = 'do not print this'; },
    input => { input.keyRecord.keyBytes = ''; },
  ]) {
    const input = request();
    change(input);
    call(input, false);
  }
});

test('strict parser rejects duplicates, negative zero, fractional/unsafe numbers and invalid strings', () => {
  const input = JSON.stringify(request());
  for (const bad of [
    input.replace('"sequence":7', '"sequence":7,"sequence":7'),
    input.replace('"sequence":7', '"sequence":-0'),
    input.replace('"sequence":7', '"sequence":-0.0e1'),
    input.replace('"sequence":7', '"sequence":1.5'),
    input.replace('"sequence":7', '"sequence":9007199254740992'),
    input.replace('"sequence":7', '"sequence":1e999'),
    input.replace('"decrypt"', '"decr\\u0000ypt"'),
    input.replace('"decrypt"', '"\\ud800"'),
    `${input} {}`,
    '['.repeat(100) + ']'.repeat(100),
    Buffer.from([0xff, 0xfe]),
    ' '.repeat(32_769),
    '-'.repeat(32_768),
  ]) call(bad, false);
  assert.deepEqual(call(input.replace('"sequence":7', '"sequence":7e0')), payload);
});

test('bounded malformed input never crashes or emits plaintext', () => {
  const original = Buffer.from(JSON.stringify(request()));
  for (let index = 0; index < 80; index++) {
    const changed = Buffer.from(original);
    const position = (index * 37) % changed.length;
    changed[position] = 0;
    call(changed, false);
  }
  const input = request('encrypt');
  input.envelope.ciphertext = '';
  input.payload = {
    ...payload, action: 'temporaryAccessGrant',
    body: { deviceMac: '02:00:00:00:00:01', grantUntil: input.now + 86401 },
  };
  input.payload.actionHash = buildActionHash(input.payload.action, input.payload.body);
  call(input, false);
});

test('action allowlist, actionHash and body contracts cannot be bypassed', () => {
  for (const change of [
    value => { value.action = 'shell'; },
    value => { value.body.internetEnabled = 'false'; },
    value => { value.body.internetEnabled = true; },
    value => { value.body.extra = true; },
    value => { value.requestMessageId = vector.envelope.messageId; },
    value => { value.messageType = 'notification'; },
  ]) {
    const input = request('encrypt');
    input.envelope.ciphertext = '';
    input.payload = structuredClone(payload);
    change(input.payload);
    call(input, false);
  }
});

test('fresh IDs and all payload classes interoperate in both directions', () => {
  const now = vector.envelope.issuedAt;
  const body = { deviceMac: '02:00:00:00:00:01', grantUntil: now + 1800 };
  const temporary = {
    ...payload, action: 'temporaryAccessGrant', body, actionHash: buildActionHash('temporaryAccessGrant', body),
  };
  const result = {
    ...payload, messageType: 'commandResult', requestMessageId: vector.envelope.messageId,
    body: { status: 'executed', errorCode: null, completedAt: now },
  };
  const notification = {
    schemaVersion: 1, messageType: 'notification', action: null, actionHash: null, requestMessageId: null,
    body: { notificationId: vector.envelope.messageId, category: 'test', title: 'Проверка', message: 'Привет\n中文 😀 / "', createdAt: now },
  };
  for (let sequence = 1; sequence <= 24; sequence++) {
    const message = [payload, temporary, result, notification][sequence % 4];
    const direction = message.messageType === 'command' ? 'phoneToRouter' : 'routerToPhone';
    const metadata = {
      ...vector.envelope, messageId: randomBytes(16).toString('base64url'), sequence,
      direction, messageClass: message.messageType,
    };
    const record = { ...keyRecord, direction, keyBytes: randomBytes(32) };
    const expected = encryptEnvelope({ metadata, plaintext: Buffer.from(canonicalJson(message)), keyRecord: record });
    const base = { envelope: expected, keyRecord: { ...record, keyBytes: record.keyBytes.toString('base64url') }, now };
    assert.deepEqual(call({ ...base, operation: 'decrypt' }), message);
    const encrypted = call({ ...base, envelope: { ...expected, ciphertext: '' }, operation: 'encrypt', payload: message });
    assert.deepEqual(encrypted, expected);
    assert.deepEqual(decryptEnvelope({ envelope: encrypted, keyRecord: record, now }), message);
  }
});
