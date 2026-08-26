/*
 * Проверяет точные байты E2E envelope, строгий JSON, сроки, actionHash и
 * tamper detection. Сеть не открывается; Android JVM foundation проверяется отдельно, а
 * instrumented API 28 и OpenWrt helper остаются самостоятельными gates. §mrelay1 §testwhy
 */
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  MessageRelayProtocolError,
  buildActionHash,
  buildEnvelopeAad,
  buildEnvelopeIv,
  canonicalJson,
  cryptoSuite,
  decryptEnvelope,
  deriveEnvelopeMessageKey,
  encryptEnvelope,
  maxEnvelopeBytes,
  parseRelayEnvelope,
  parseStrictJson,
  protocolVersion,
  validateEnvelope,
  validateMessagePayload,
} from '../tools/messageRelay/protocolModel.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
const vector = readJson('tools/messageRelay/fixtures/protocol-v1-golden.json');
const envelopeSchema = readJson('tools/messageRelay/schemas/envelope-v1.schema.json');
const payloadSchema = readJson('tools/messageRelay/schemas/payload-v1.schema.json');
const peerProject = readJson('tools/messageRelay/peer-project.json');

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof MessageRelayProtocolError && error.code === code);
}

function keyRecord(overrides = {}) {
  return {
    keyId: vector.envelope.keyId,
    streamId: vector.envelope.streamId,
    direction: vector.envelope.direction,
    keyBytes: Buffer.from(vector.keyHex, 'hex'),
    ...overrides,
  };
}

function vectorMetadata(overrides = {}) {
  return {
    direction: vector.envelope.direction,
    messageClass: vector.envelope.messageClass,
    routerId: vector.envelope.routerId,
    phoneId: vector.envelope.phoneId,
    streamId: vector.envelope.streamId,
    messageId: vector.envelope.messageId,
    sequence: vector.envelope.sequence,
    issuedAt: vector.envelope.issuedAt,
    expiresAt: vector.envelope.expiresAt,
    keyId: vector.envelope.keyId,
    ...overrides,
  };
}

function commandPayload(action, body) {
  return {
    schemaVersion: 1,
    messageType: 'command',
    action,
    actionHash: buildActionHash(action, body),
    requestMessageId: null,
    body,
  };
}

function notificationPayload(bodyOverrides = {}) {
  return {
    schemaVersion: 1,
    messageType: 'notification',
    action: null,
    actionHash: null,
    requestMessageId: null,
    body: {
      notificationId: vector.envelope.messageId,
      category: 'access',
      title: 'Доступ изменён',
      message: 'Правило семейного доступа обновлено.',
      createdAt: vector.envelope.issuedAt,
      ...bodyOverrides,
    },
  };
}

// Test-only sealer: создаёт аутентифицированный envelope с намеренно неверной
// парой messageClass/messageType, минуя защиту encryptEnvelope.
function sealUnchecked(metadata, payload, encryptionKeyRecord = keyRecord()) {
  const plaintext = Buffer.from(canonicalJson(payload), 'utf8');
  const envelope = {
    ...metadata,
    protocolVersion,
    cryptoSuite,
    ciphertext: '',
  };
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveEnvelopeMessageKey(encryptionKeyRecord.keyBytes, envelope),
    buildEnvelopeIv(envelope.sequence),
    { authTagLength: 16 },
  );
  cipher.setAAD(buildEnvelopeAad(envelope), { plaintextLength: plaintext.length });
  envelope.ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64url');
  return envelope;
}

describe('family message relay protocol v1 §mrelay1', () => {
  it('matches the fixed HMAC-SHA256 plus AES-256-GCM vector byte for byte', () => {
    const actual = encryptEnvelope({
      metadata: vectorMetadata(),
      plaintext: Buffer.from(vector.payloadUtf8, 'utf8'),
      keyRecord: keyRecord(),
    });
    assert.deepEqual(actual, vector.envelope);
    assert.equal(
      deriveEnvelopeMessageKey(keyRecord().keyBytes, actual).toString('hex'),
      vector.messageKeyHex,
    );
    assert.equal(buildEnvelopeAad(actual).toString('hex'), vector.aadHex);
    assert.equal(buildEnvelopeIv(actual.sequence).toString('hex'), vector.ivHex);
    assert.equal(
      canonicalJson(decryptEnvelope({ envelope: actual, keyRecord: keyRecord(), now: 1787421030 })),
      vector.payloadUtf8,
    );
    assert.deepEqual(
      parseRelayEnvelope(Buffer.from(JSON.stringify(actual)), { now: 1787421030 }),
      actual,
    );
    assert.equal(Object.hasOwn(actual, 'nonce'), false);
  });

  it('rejects changed ciphertext and changed routing metadata', () => {
    const ciphertext = structuredClone(vector.envelope);
    const bytes = Buffer.from(ciphertext.ciphertext, 'base64url');
    bytes[0] ^= 1;
    ciphertext.ciphertext = bytes.toString('base64url');
    expectCode(
      () => decryptEnvelope({ envelope: ciphertext, keyRecord: keyRecord(), now: 1787421030 }),
      'authenticationFailed',
    );

    const metadata = { ...vector.envelope, sequence: 8 };
    expectCode(
      () => decryptEnvelope({ envelope: metadata, keyRecord: keyRecord(), now: 1787421030 }),
      'authenticationFailed',
    );
    expectCode(
      () => decryptEnvelope({
        envelope: vector.envelope,
        keyRecord: keyRecord({ streamId: 'RERERERERERERERERERERA' }),
        now: 1787421030,
      }),
      'keyInvalid',
    );
  });

  it('derives the IV from sequence and rejects zero sequence and tag-only ciphertext', () => {
    assert.equal(buildEnvelopeIv(1).toString('hex'), '000000000000000000000001');
    assert.equal(buildEnvelopeIv(Number.MAX_SAFE_INTEGER).toString('hex'), '00000000001fffffffffffff');
    expectCode(() => buildEnvelopeIv(0), 'messageMalformed');
    expectCode(() => validateEnvelope({ ...vector.envelope, sequence: 0 }), 'messageMalformed');
    expectCode(
      () => validateEnvelope({ ...vector.envelope, ciphertext: Buffer.alloc(16).toString('base64url') }),
      'messageMalformed',
    );
    expectCode(() => validateEnvelope({ ...vector.envelope, nonce: 'AAAAAAAAAAAAAAAA' }), 'messageMalformed');
  });

  it('derives a different AES key when a rolled-back sequence gets a fresh messageId', () => {
    const rolledBackMetadata = vectorMetadata({
      messageId: 'ZmZmZmZmZmZmZmZmZmZmZg',
    });
    const originalKey = deriveEnvelopeMessageKey(keyRecord().keyBytes, vector.envelope);
    const rolledBackKey = deriveEnvelopeMessageKey(
      keyRecord().keyBytes,
      { ...rolledBackMetadata, protocolVersion, cryptoSuite, ciphertext: '' },
    );
    assert.notDeepEqual(rolledBackKey, originalKey);
    assert.equal(buildEnvelopeIv(rolledBackMetadata.sequence).toString('hex'), vector.ivHex);
  });

  it('parses raw envelopes with their actual byte limit and rejects duplicate fields', () => {
    const duplicateDirection = JSON.stringify(vector.envelope).replace(
      '{"direction":"phoneToRouter",',
      '{"direction":"phoneToRouter","direction":"phoneToRouter",',
    );
    expectCode(() => parseRelayEnvelope(Buffer.from(duplicateDirection)), 'messageMalformed');
    expectCode(() => parseRelayEnvelope(Buffer.alloc(maxEnvelopeBytes + 1, 0x20)), 'messageTooLarge');
  });

  it('rejects all non-interoperable JSON numbers recursively', () => {
    expectCode(() => parseStrictJson(Buffer.from('{"a":1,"\\u0061":2}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"a":[{"value":1e309}]}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"a":[{"value":9007199254740992}]}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"a":[{"value":-0}]}')), 'messageMalformed');
  });

  it('rejects unpaired UTF-16 surrogates during in-memory canonicalization', () => {
    expectCode(() => canonicalJson({ value: '\0' }), 'messageMalformed');
    expectCode(() => canonicalJson({ value: '\ud800' }), 'messageMalformed');
    expectCode(() => canonicalJson({ ['\udfff']: 'value' }), 'messageMalformed');
    assert.equal(canonicalJson({ value: '\ud83d\ude00' }), '{"value":"😀"}');
  });

  it('rejects ambiguous JSON, wrong field case and unbounded lifetimes', () => {
    expectCode(() => parseStrictJson(Buffer.from('{"a":1,"a":2}')), 'messageMalformed');
    expectCode(() => validateEnvelope({ ...vector.envelope, Direction: 'phoneToRouter' }), 'messageMalformed');
    expectCode(
      () => validateEnvelope({ ...vector.envelope, expiresAt: vector.envelope.issuedAt + 121 }),
      'messageMalformed',
    );
    const resultEnvelope = {
      ...vector.envelope,
      direction: 'routerToPhone',
      messageClass: 'commandResult',
      expiresAt: vector.envelope.issuedAt + 86_400,
    };
    assert.equal(validateEnvelope(resultEnvelope), resultEnvelope);
    expectCode(
      () => validateEnvelope({ ...resultEnvelope, expiresAt: vector.envelope.issuedAt + 86_401 }),
      'messageMalformed',
    );
    expectCode(
      () => validateEnvelope({ ...vector.envelope, expiresAt: 1787421020 }, { now: 1787421030 }),
      'messageExpired',
    );
  });

  it('binds key bytes to exact direction, streamId and keyId metadata', () => {
    expectCode(
      () => encryptEnvelope({
        metadata: vectorMetadata(),
        plaintext: Buffer.from(vector.payloadUtf8),
        keyRecord: keyRecord({ keyId: vector.envelope.phoneId }),
      }),
      'keyInvalid',
    );
    for (const overrides of [
      { direction: 'routerToPhone' },
      { streamId: vector.envelope.routerId },
      { keyId: vector.envelope.phoneId },
      { keyBytes: Buffer.alloc(31) },
    ]) {
      expectCode(
        () => decryptEnvelope({
          envelope: vector.envelope,
          keyRecord: keyRecord(overrides),
          now: 1787421030,
        }),
        'keyInvalid',
      );
    }
    expectCode(
      () => decryptEnvelope({
        envelope: vector.envelope,
        keyRecord: keyRecord({ label: 'unexpected' }),
        now: 1787421030,
      }),
      'messageMalformed',
    );
  });

  it('returns a validated payload and rejects an authenticated class/type mismatch', () => {
    const payload = notificationPayload();
    const plaintext = Buffer.from(canonicalJson(payload));
    expectCode(
      () => encryptEnvelope({ metadata: vectorMetadata(), plaintext, keyRecord: keyRecord() }),
      'messageMalformed',
    );
    const envelope = sealUnchecked(vectorMetadata(), payload);
    expectCode(
      () => decryptEnvelope({ envelope, keyRecord: keyRecord(), now: 1787421030 }),
      'messageMalformed',
    );
  });

  it('binds allowlisted command bodies to domain-separated action hashes', () => {
    const body = { deviceMac: 'AA:BB:CC:DD:EE:FF', grantUntil: 1787424600 };
    const payload = commandPayload('temporaryAccessGrant', body);
    assert.equal(validateMessagePayload(payload), payload);
    assert.equal(
      buildActionHash('globalInternetSet', { internetEnabled: false }),
      JSON.parse(vector.payloadUtf8).actionHash,
    );
    assert.equal(canonicalJson({ action: payload.action, body }), '{"action":"temporaryAccessGrant","body":{"deviceMac":"AA:BB:CC:DD:EE:FF","grantUntil":1787424600}}');
    expectCode(() => validateMessagePayload({ ...payload, body: { ...body, grantUntil: 1787424601 } }), 'actionHashMismatch');
    expectCode(() => validateMessagePayload({ ...payload, action: 'runShell' }), 'actionUnsupported');
  });

  it('checks temporary access against now and the authenticated issue time', () => {
    const now = vector.envelope.issuedAt + 30;
    const body = {
      deviceMac: 'AA:BB:CC:DD:EE:FF',
      grantUntil: vector.envelope.issuedAt + 3600,
    };
    const payload = commandPayload('temporaryAccessGrant', body);
    const envelope = encryptEnvelope({
      metadata: vectorMetadata(),
      plaintext: Buffer.from(canonicalJson(payload)),
      keyRecord: keyRecord(),
    });
    assert.deepEqual(decryptEnvelope({ envelope, keyRecord: keyRecord(), now }), payload);

    const elapsed = commandPayload('temporaryAccessGrant', { ...body, grantUntil: now });
    const elapsedEnvelope = encryptEnvelope({
      metadata: vectorMetadata(),
      plaintext: Buffer.from(canonicalJson(elapsed)),
      keyRecord: keyRecord(),
    });
    expectCode(
      () => decryptEnvelope({ envelope: elapsedEnvelope, keyRecord: keyRecord(), now }),
      'messageExpired',
    );

    const unbounded = commandPayload('temporaryAccessGrant', {
      ...body,
      grantUntil: vector.envelope.issuedAt + (24 * 60 * 60) + 1,
    });
    expectCode(
      () => encryptEnvelope({
        metadata: vectorMetadata(),
        plaintext: Buffer.from(canonicalJson(unbounded)),
        keyRecord: keyRecord(),
      }),
      'messageMalformed',
    );

    const beforeIssue = commandPayload('temporaryAccessGrant', {
      ...body,
      grantUntil: vector.envelope.issuedAt,
    });
    expectCode(
      () => encryptEnvelope({
        metadata: vectorMetadata(),
        plaintext: Buffer.from(canonicalJson(beforeIssue)),
        keyRecord: keyRecord(),
      }),
      'messageMalformed',
    );
  });

  it('accepts only exact command results and the closed status/error mapping', () => {
    const result = {
      schemaVersion: 1,
      messageType: 'commandResult',
      action: 'globalInternetSet',
      actionHash: JSON.parse(vector.payloadUtf8).actionHash,
      requestMessageId: vector.envelope.messageId,
      body: {
        status: 'executed',
        errorCode: null,
        completedAt: vector.envelope.issuedAt + 10,
      },
    };
    assert.equal(validateMessagePayload(result), result);
    assert.equal(
      validateMessagePayload({
        ...result,
        body: { ...result.body, status: 'indeterminate', errorCode: 'stateIndeterminate' },
      }).body.status,
      'indeterminate',
    );
    expectCode(
      () => validateMessagePayload({ ...result, body: { ...result.body, detail: 'extra' } }),
      'messageMalformed',
    );
    expectCode(
      () => validateMessagePayload({
        ...result,
        body: { ...result.body, status: 'executed', errorCode: 'actionRejected' },
      }),
      'messageMalformed',
    );
    expectCode(
      () => validateMessagePayload({
        ...result,
        body: { ...result.body, status: 'rejected', errorCode: 'arbitraryRemoteText' },
      }),
      'messageMalformed',
    );
    expectCode(
      () => validateMessagePayload({ ...result, actionHash: `${'A'.repeat(42)}B` }),
      'messageMalformed',
    );
  });

  it('accepts exactly five notification body fields', () => {
    const notification = notificationPayload();
    assert.equal(validateMessagePayload(notification), notification);
    expectCode(
      () => validateMessagePayload({
        ...notification,
        body: { ...notification.body, severity: 'info' },
      }),
      'messageMalformed',
    );
    expectCode(
      () => validateMessagePayload({
        ...notification,
        body: { ...notification.body, category: '' },
      }),
      'messageMalformed',
    );
  });

  it('keeps Unicode canonicalization identical across runtimes', () => {
    assert.equal(canonicalJson(vector.canonicalUnicodeInput), vector.canonicalUnicodeUtf8);
  });

  it('keeps schemas aligned with the executable contract', () => {
    assert.equal(envelopeSchema.properties.protocolVersion.const, vector.protocolVersion);
    assert.equal(envelopeSchema.properties.cryptoSuite.const, vector.cryptoSuite);
    assert.equal(envelopeSchema.properties.sequence.minimum, 1);
    assert.equal(Object.hasOwn(envelopeSchema.properties, 'nonce'), false);
    assert.equal(envelopeSchema.additionalProperties, false);
    assert.equal(payloadSchema.additionalProperties, false);
    assert.equal(payloadSchema.oneOf.length, 3);
    assert.equal(payloadSchema.oneOf[0].oneOf.length, 2);
    assert.equal(payloadSchema.oneOf[0].oneOf[1].properties.body.additionalProperties, false);
    assert.equal(payloadSchema.oneOf[1].properties.body.additionalProperties, false);
    assert.equal(payloadSchema.oneOf[2].properties.body.additionalProperties, false);
    assert.deepEqual([...envelopeSchema.required].sort(), Object.keys(vector.envelope).sort());
  });

  it('pins the complete executable module closure in the peer vendor manifest contract', () => {
    const executablePaths = [
      'tools/messageRelay/messagePayload.mjs',
      'tools/messageRelay/protocolModel.mjs',
      'tools/messageRelay/protocolValues.mjs',
      'tools/messageRelay/relayEnvelope.mjs',
      'tools/messageRelay/strictJson.mjs',
    ];
    assert.deepEqual(
      peerProject.protocol.canonicalPaths.filter((path) => path.endsWith('.mjs')).sort(),
      executablePaths,
    );
    assert.deepEqual(peerProject.protocol.vendorIntegrity, {
      algorithm: 'SHA-256',
      pathSet: 'exact',
      coverage: 'everyCanonicalPath',
    });
    for (const path of peerProject.protocol.canonicalPaths) {
      assert.ok(readFileSync(resolve(repoRoot, path)).length > 0, `${path} must be a non-empty file`);
    }
  });
});
