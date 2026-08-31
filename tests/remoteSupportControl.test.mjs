/*
 * Проверяет control-клиент на синтетических подписанных байтах без сети и private checkout
 * Назначение: обнаруживать рассогласование состояний/сроков/повторов до OpenWrt/FRP gate §rsup001 §testwhy
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ControlClient } from '../tools/remoteSupport/controlClient.mjs';
import {
  clientCapabilities, controlProfile, identityKeyId, routerFields, validateRouterMessage,
  validateServerMessage,
} from '../tools/remoteSupport/experimentalPayload.mjs';
import { createEnvelope, ReplayWindow, verifyEnvelope } from '../tools/remoteSupport/signedEnvelope.mjs';
import { accessLifeSec, claimLifeSec } from '../tools/remoteSupport/protocolValues.mjs';
import { parseStrictJson } from '../tools/remoteSupport/strictJson.mjs';

const id = (byte) => Buffer.alloc(16, byte).toString('base64url');
const hostKey = () => 'ssh-ed25519 ' + Buffer.concat([
  Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, 7),
]).toString('base64');
const readSchema = (name) => JSON.parse(readFileSync(
  new URL('../tools/remoteSupport/schemas/' + name, import.meta.url), 'utf8',
));

function fixture() {
  const server = generateKeyPairSync('ed25519'); const router = generateKeyPairSync('ed25519');
  const serverKeys = new Map([['server-test', server.publicKey]]);
  let now = 1788000000; let tick = 0; let nextId = 10;
  const client = new ControlClient({ privateKey: router.privateKey, serverKeys, now: () => now, uptime: () => tick });
  const rawKey = router.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
  const keyId = identityKeyId(rawKey);
  const routerKeys = new Map([[keyId, router.publicKey]]);
  const routerId = id(1); const controlId = id(2); const enrollmentId = id(3);
  const incoming = new Map();
  const sign = (message) => JSON.stringify(createEnvelope({ keyId: 'server-test', privateKey: server.privateKey,
    payloadBytes: Buffer.from(JSON.stringify(message)) }));
  const message = (type, payload, streamId, changes = {}) => {
    const sequence = incoming.get(streamId) ?? 0; incoming.set(streamId, sequence + 1);
    return { messageType: type, routerId: type === 'enrollChallenge' ? null : routerId,
      streamId, messageId: id(nextId++), sequence, issuedAt: now, notBefore: now, expiresAt: now + 60,
      payload, ...changes };
  };
  const verify = (wire) => validateRouterMessage(
    verifyEnvelope({ envelope: parseStrictJson(wire), publicKeys: routerKeys, now }).payload,
  );
  const enroll = () => {
    const start = client.enrollmentStart({ localConsent: true });
    const proof = client.acceptChallenge(sign(message('enrollChallenge', {
      challenge: Buffer.alloc(32, 8).toString('base64url'), clientNonce: start.clientNonce,
      candidateKeyId: keyId, profile: controlProfile,
    }, enrollmentId)));
    assert.equal(verify(proof).messageType, 'enrollProof');
    client.accept(sign(message('enrollAccepted', { routerId, keyId, profile: controlProfile }, controlId)));
    assert.deepEqual(verify(client.capabilities()).payload.capabilities, clientCapabilities);
    client.accept(sign(message('statusQuery', { profile: controlProfile, capabilities: ['claimV1'] }, controlId)));
  };
  const open = () => {
    const wire = client.openClaim({ localConsent: true, routerHostKey: hostKey() });
    const request = verify(wire);
    const status = { sessionId: request.streamId, state: 'claimOpen',
      claimExpiresAt: request.payload.claimExpiresAt, accessExpiresAt: null, leaseExpiresAt: null, ticketId: null };
    const response = sign(message('claimOpened', status, request.streamId));
    client.accept(response);
    return { wire, request, response, status };
  };
  return { client, serverKeys, routerKeys, router, keyId, routerId, controlId, enrollmentId,
    now: () => now, advance: (seconds) => { now += seconds; tick += Math.max(0, seconds); },
    tick: (seconds) => { tick += seconds; }, sign, message, verify, enroll, open };
}

test('controlEnrollmentRequiresConsentAndBindsIdentityNonceAndStream', () => {
  const f = fixture();
  assert.throws(() => f.client.enrollmentStart(), { code: 'stateConflict' });
  f.enroll();
  assert.equal(f.client.status().state, 'moduleReady');
  assert.equal(f.client.status().transportReady, false);
  assert.throws(() => f.client.openClaim({ routerHostKey: hostKey() }), { code: 'claimNotOpen' });
});

test('controlChallengeRejectsOtherIdentityOrNonce', () => {
  for (const wrongField of ['clientNonce', 'candidateKeyId']) {
    const f = fixture(); const start = f.client.enrollmentStart({ localConsent: true });
    const payload = { challenge: Buffer.alloc(32, 9).toString('base64url'),
      clientNonce: start.clientNonce, candidateKeyId: f.keyId, profile: controlProfile };
    payload[wrongField] = wrongField === 'clientNonce' ? id(5) : 'router-' + 'b'.repeat(40);
    assert.throws(() => f.client.acceptChallenge(f.sign(f.message('enrollChallenge', payload, f.enrollmentId))),
      { code: 'stateConflict' });
    assert.equal(f.client.status().state, 'securityBlocked');
  }
});

test('controlClaimKeepsCodeOutOfStatusAndRetriesIdenticalBytes', () => {
  const f = fixture(); f.enroll();
  const wire = f.client.openClaim({ localConsent: true, routerHostKey: hostKey() });
  const request = f.verify(wire);
  assert.equal(request.payload.diagnosticsAllowed, false);
  assert.equal(request.payload.claimExpiresAt, f.now() + claimLifeSec);
  assert.match(request.payload.code, /^[0-9]{12}$/);
  assert.equal(f.client.claimCode(), null);
  f.advance(10);
  assert.equal(f.client.retry(), wire);
  assert.equal(JSON.stringify(f.client.status()).includes(request.payload.code), false);
  assert.equal(JSON.stringify(f.client), '{}');
});

test('controlPreparingBurnsCodeWithoutPretendingSshIsActive', () => {
  const f = fixture(); f.enroll(); const claim = f.open();
  assert.equal(f.client.claimCode(), claim.request.payload.code);
  f.verify(f.client.queryStatus());
  const status = { ...claim.status, state: 'sessionPreparing', accessExpiresAt: f.now() + accessLifeSec, ticketId: 'T-1' };
  const response = f.sign(f.message('statusQuery', status, claim.request.streamId));
  f.client.accept(response);
  assert.equal(f.client.claimCode(), null);
  assert.equal(f.client.status().state, 'sessionPreparing');
  assert.equal(f.client.status().transportReady, false);
  assert.deepEqual(f.client.accept(response), f.client.status());
});

test('controlRejectsDeadlineExtensionAndScopeChange', () => {
  for (const field of ['sessionId', 'claimExpiresAt', 'accessExpiresAt']) {
    const f = fixture(); f.enroll(); const claim = f.open(); f.client.queryStatus();
    const status = { ...claim.status, state: 'sessionPreparing', ticketId: 'T-1', accessExpiresAt: f.now() + accessLifeSec };
    if (field === 'sessionId') status.sessionId = id(9);
    else status[field] += 1;
    assert.throws(() => f.client.accept(f.sign(f.message('statusQuery', status, claim.request.streamId))),
      { code: 'stateConflict' });
    assert.equal(f.client.status().state, 'securityBlocked');
    assert.equal(f.client.claimCode(), null);
  }
});

test('controlNeverAcceptsTransportOrCommandsFromExperimentalStatus', () => {
  for (const kind of ['claimAccepted', 'sessionActive', 'sessionCommand', 'fakeStatus']) {
    const f = fixture(); f.enroll(); const claim = f.open(); f.client.queryStatus();
    const response = f.message(kind === 'fakeStatus' ? 'statusQuery' : kind,
      { ...claim.status, state: 'sessionActive' }, claim.request.streamId);
    assert.throws(() => f.client.accept(f.sign(response)), { code: 'protocolUnsupported' });
    assert.equal(f.client.status().state, 'securityBlocked');
  }
});

test('controlLocalRevokeWinsOverLateReplyAndServerOutage', () => {
  const f = fixture(); f.enroll(); const claim = f.open(); f.client.queryStatus();
  assert.equal(f.client.localRevoke().state, 'revoked');
  assert.equal(f.client.claimCode(), null);
  assert.throws(() => f.client.retry(), { code: 'stateConflict' });
  f.client.accept(f.sign(f.message('statusQuery', { ...claim.status, state: 'sessionPreparing',
    accessExpiresAt: f.now() + accessLifeSec, ticketId: 'T-1' }, claim.request.streamId)));
  assert.equal(f.client.status().state, 'revoked');
  const revoke = f.client.revokeRequest();
  assert.equal(f.verify(revoke).messageType, 'revokeRequest');
  assert.equal(f.client.revokeRequest(), revoke);
});

test('controlRevokeResponseAndRetryAreIdempotent', () => {
  const f = fixture(); f.enroll(); const claim = f.open();
  f.client.revokeRequest();
  const response = f.sign(f.message('revokeConfirmed', { ...claim.status, state: 'revoked', leaseExpiresAt: 0 },
    claim.request.streamId));
  f.client.accept(response); f.client.accept(response);
  assert.equal(f.client.status().state, 'revoked');
  assert.equal(f.client.status().pendingResponse, false);
});

test('controlExpiryUsesMonotonicTimeAndRejectsBackwardClock', () => {
  const f = fixture(); f.enroll(); f.open();
  f.tick(claimLifeSec);
  assert.equal(f.client.status().state, 'claimExpired');
  assert.equal(f.client.claimCode(), null);
  const other = fixture(); other.enroll(); other.open(); other.advance(-1);
  assert.throws(() => other.client.status(), { code: 'clockUntrusted' });
});

test('controlExpiredPendingRequestDoesNotGetFreshCodeOrDeadline', () => {
  const f = fixture(); f.enroll();
  f.client.openClaim({ localConsent: true, routerHostKey: hostKey() }); f.advance(60);
  assert.throws(() => f.client.retry(), { code: 'messageExpired' });
  assert.equal(f.client.status().state, 'securityBlocked');
  assert.equal(f.client.claimCode(), null);
});

test('controlFreshInstanceDoesNotResumeOldSession', () => {
  const f = fixture(); f.enroll(); f.open();
  const restarted = new ControlClient({ privateKey: f.router.privateKey, serverKeys: f.serverKeys, now: f.now });
  assert.equal(restarted.status().state, 'disabled');
  assert.equal(restarted.status().sessionId, null);
  assert.throws(() => restarted.queryStatus(), { code: 'claimNotOpen' });
});

test('controlRejectsTamperDuplicateKeysAndOversizedWire', () => {
  for (const corrupt of [
    (wire) => wire.replace('"protocolVersion":1', '"protocolVersion":1,"protocolVersion":1'),
    () => ' '.repeat(24577),
    (wire) => wire.replace('"signature":"', '"signature":"A'),
  ]) {
    const f = fixture(); f.enroll(); const claim = f.open(); f.client.queryStatus();
    const wire = f.sign(f.message('statusQuery', claim.status, claim.request.streamId));
    assert.throws(() => f.client.accept(corrupt(wire)));
    assert.equal(f.client.status().state, 'securityBlocked');
  }
});

test('replayRejectsSameIdWithDifferentSignedBytes', () => {
  const f = fixture(); f.enroll(); const claim = f.open();
  const first = parseStrictJson(claim.response);
  const changed = parseStrictJson(claim.response);
  const payload = parseStrictJson(Buffer.from(first.signedPayload, 'base64url'));
  payload.payload.ticketId = 'T-2';
  const second = JSON.parse(f.sign(payload));
  const replay = new ReplayWindow();
  verifyEnvelope({ envelope: first, publicKeys: f.serverKeys, replayWindow: replay });
  assert.throws(() => verifyEnvelope({ envelope: second, publicKeys: f.serverKeys, replayWindow: replay }),
    { code: 'sequenceReplay' });
  assert.deepEqual(verifyEnvelope({ envelope: changed, publicKeys: f.serverKeys, replayWindow: replay }).replay,
    { duplicate: true });
});

test('controlSchemasAndRuntimeKeepExactFieldsAndCanonicalSsh', () => {
  const schema = readSchema('experimental-router-message-v1.schema.json');
  for (const branch of schema.allOf[1].oneOf) {
    const fields = branch.properties.payload;
    assert.equal(fields.additionalProperties, false);
    assert.deepEqual(fields.required, routerFields[branch.properties.messageType.const]);
  }
  const f = fixture(); f.enroll(); const claim = f.open();
  for (const value of [hostKey() + '=', hostKey() + ' comment', hostKey().replace('ssh-ed25519', 'ssh-rsa')]) {
    assert.throws(() => validateRouterMessage({ ...claim.request,
      payload: { ...claim.request.payload, routerHostKey: value } }), { code: 'messageMalformed' });
  }
  const response = verifyEnvelope({ envelope: parseStrictJson(claim.response), publicKeys: f.serverKeys }).payload;
  assert.throws(() => validateServerMessage({ ...response, payload: { ...response.payload, extra: true } }),
    { code: 'messageMalformed' });
  assert.equal(createPublicKey(f.router.privateKey).asymmetricKeyType, 'ed25519');
});
