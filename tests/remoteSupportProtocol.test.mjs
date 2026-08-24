/*
 * Проверяет исполняемый reference-контракт будущей удалённой техподдержки:
 * точные подписываемые байты, строгий JSON, безопасный диапазон sequence,
 * replay-защиту, неизменяемые сроки, генерацию кода и state machine. Тест не
 * открывает сеть и не доказывает безопасность ещё не созданного runtime. §rsup001 §testwhy
 */
import {
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ProtocolError,
  ReplayWindow,
  accessLifeSec,
  advanceState,
  buildSignInput,
  claimLifeSec,
  createAccessDeadline,
  createClaimDeadline,
  createEnvelope,
  generateClaimCode,
  maxSafeSequence,
  messageTypes,
  parseStrictJson,
  preserveDeadline,
  protocolVersion,
  validatePayload,
  verifyEnvelope,
} from '../tools/remoteSupport/protocolModel.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
const vector = readJson('tools/remoteSupport/fixtures/protocol-v1-golden.json');
const envelopeSchema = readJson('tools/remoteSupport/schemas/signed-envelope-v1.schema.json');
const payloadSchema = readJson('tools/remoteSupport/schemas/signed-payload-v1.schema.json');
const enrollSchema = readJson('tools/remoteSupport/schemas/enrollment-start-v1.schema.json');

const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const privateKey = createPrivateKey({
  key: Buffer.concat([pkcs8Prefix, Buffer.from(vector.seedHex, 'hex')]),
  format: 'der',
  type: 'pkcs8',
});
const publicKey = createPublicKey(privateKey);
const publicKeys = new Map([[vector.envelope.keyId, publicKey]]);

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof ProtocolError && error.code === code);
}

function decodePayload(envelope = vector.envelope) {
  return JSON.parse(Buffer.from(envelope.signedPayload, 'base64url').toString('utf8'));
}

const idFor = (byte) => Buffer.alloc(16, byte).toString('base64url');

describe('remote-support protocol reference model §rsup001', () => {
  it('matches the fixed Ed25519 golden vector byte for byte', () => {
    const payloadBytes = Buffer.from(vector.payloadUtf8, 'utf8');
    const actual = createEnvelope({
      keyId: vector.envelope.keyId,
      payloadBytes,
      privateKey,
    });
    assert.deepEqual(actual, vector.envelope);
    assert.equal(
      publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      vector.publicKeySpkiBase64,
    );
    assert.ok(buildSignInput(protocolVersion, vector.envelope.keyId, payloadBytes).length > payloadBytes.length);

    const verified = verifyEnvelope({
      envelope: vector.envelope,
      publicKeys,
      now: 1787421030,
    });
    assert.equal(verified.payload.messageType, 'sessionCommand');
    assert.equal(verified.payload.payload.command, 'revokeSession');
  });

  it('binds payload, keyId and protocol version to the signed contract', () => {
    const changedPayload = structuredClone(vector.envelope);
    const bytes = Buffer.from(changedPayload.signedPayload, 'base64url');
    bytes[20] ^= 1;
    changedPayload.signedPayload = bytes.toString('base64url');
    expectCode(() => verifyEnvelope({ envelope: changedPayload, publicKeys }), 'signatureInvalid');

    const changedKey = { ...vector.envelope, keyId: 'server-test-2026-02' };
    const twoKeys = new Map([[changedKey.keyId, publicKey]]);
    expectCode(() => verifyEnvelope({ envelope: changedKey, publicKeys: twoKeys }), 'signatureInvalid');

    const changedVersion = { ...vector.envelope, protocolVersion: 2 };
    expectCode(() => verifyEnvelope({ envelope: changedVersion, publicKeys }), 'protocolUnsupported');
  });

  it('rejects ambiguous JSON and unsafe common fields', () => {
    expectCode(() => parseStrictJson(Buffer.from('{"a":1,"a":2}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"name":1,"n\\u0061me":2}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"a":"\\u0000"}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from('{"a":"\\ud800"}')), 'messageMalformed');
    expectCode(() => parseStrictJson(Buffer.from([0xc3, 0x28])), 'messageMalformed');

    const payload = decodePayload();
    expectCode(() => validatePayload({ ...payload, MessageType: payload.messageType }), 'messageMalformed');
    expectCode(() => validatePayload({ ...payload, sequence: maxSafeSequence + 1 }), 'messageMalformed');
    expectCode(() => validatePayload({ ...payload, messageType: 'runShell' }), 'protocolUnsupported');
    expectCode(() => validatePayload({ ...payload, routerId: null }), 'messageMalformed');
    assert.equal(validatePayload({
      ...payload,
      messageType: 'enrollChallenge',
      routerId: null,
    }).routerId, null);
  });

  it('detects duplicate, reused and skipped sequences without a side effect', () => {
    const replay = new ReplayWindow();
    const first = { ...decodePayload(), sequence: 0 };
    assert.deepEqual(replay.accept(first), { duplicate: false });
    assert.deepEqual(replay.accept(first), { duplicate: true });
    expectCode(
      () => replay.accept({ ...first, messageId: idFor(0x44) }),
      'sequenceReplay',
    );
    expectCode(
      () => replay.accept({ ...first, sequence: 2, messageId: idFor(0x55) }),
      'sequenceGap',
    );
    assert.deepEqual(
      replay.accept({ ...first, sequence: 1, messageId: idFor(0x66) }),
      { duplicate: false },
    );
    const freshWindow = new ReplayWindow();
    expectCode(() => freshWindow.accept({ ...first, sequence: 7 }), 'sequenceGap');
  });

  it('keeps claim/access deadlines bounded across reconnects', () => {
    const now = 1787421000;
    const claimDeadline = createClaimDeadline(now);
    const accessDeadline = createAccessDeadline(now);
    assert.equal(claimDeadline - now, claimLifeSec);
    assert.equal(accessDeadline - now, accessLifeSec);
    assert.equal(preserveDeadline(accessDeadline, accessDeadline + 3600), accessDeadline);
    assert.equal(preserveDeadline(accessDeadline, accessDeadline - 60), accessDeadline - 60);
    expectCode(() => createClaimDeadline(maxSafeSequence), 'messageMalformed');
  });

  it('keeps the claim code random-only and free from modulo bias', () => {
    const chunks = [
      Buffer.from([250, 251, 252, 253, 254, 255]),
      Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    ];
    const code = generateClaimCode(() => chunks.shift() || Buffer.from([12]));
    assert.equal(code, '012345678901');
    assert.match(code, /^\d{12}$/);
    expectCode(() => generateClaimCode(() => Buffer.alloc(24, 255)), 'internalError');
  });

  it('allows only explicit state transitions and fails closed on security violations', () => {
    let state = 'disabled';
    for (const event of [
      'enable',
      'openClaim',
      'claimOpened',
      'claimAccepted',
      'transportReady',
      'sshConfirmed',
    ]) {
      state = advanceState(state, event);
    }
    assert.equal(state, 'sessionActive');
    assert.equal(advanceState(state, 'securityViolation'), 'securityBlocked');
    expectCode(() => advanceState('claimOpen', 'sshConfirmed'), 'stateConflict');
  });

  it('keeps JSON schemas aligned with the executable common model', () => {
    assert.equal(envelopeSchema.properties.protocolVersion.const, protocolVersion);
    assert.deepEqual(payloadSchema.properties.messageType.enum, messageTypes);
    assert.equal(payloadSchema.properties.sequence.maximum, maxSafeSequence);
    assert.equal(envelopeSchema.additionalProperties, false);
    assert.equal(payloadSchema.additionalProperties, false);
    assert.deepEqual(enrollSchema.required, [
      'identityPublicKey',
      'clientNonce',
      'supportedVersions',
    ]);
    assert.equal(enrollSchema.additionalProperties, false);
    assert.match(enrollSchema.description, /authenticated server TLS/);
  });
});
