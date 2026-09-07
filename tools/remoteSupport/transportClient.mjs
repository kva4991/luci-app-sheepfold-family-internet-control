/*
 * RAM-only клиент отдельного экспериментального transport-профиля §rsup001
 * Создаёт подписанный CSR-запрос и проверяет ответ; не пишет ключи, не открывает сеть/FRP/SSH
 * Caller хранит transport private key и проверяет local consent; этот автомат не заменяет manager
 */
import { createHash, createPublicKey, randomBytes, X509Certificate } from 'node:crypto';
import { createEnvelope, verifyEnvelope } from './signedEnvelope.mjs';
import { identityKeyId } from './experimentalPayload.mjs';
import { decodeBase64Url, fail, keyIdPattern, requireTime } from './protocolValues.mjs';
import { parseStrictJson } from './strictJson.mjs';
import { decodeTransportDer, transportProfile, validateTransportMessage } from './transportPayload.mjs';

const newId = () => randomBytes(16).toString('base64url');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const publicDer = (key) => key.export({ format: 'der', type: 'spki' });

function derNode(bytes, offset, boundary) {
  if (offset + 2 > boundary || (bytes[offset] & 0x1f) === 0x1f) { fail('serverIdentityInvalid'); }
  const tag = bytes[offset++]; let size = bytes[offset++];
  if (size >= 128) {
    const count = size & 127;
    if (count < 1 || count > 2 || offset + count > boundary || bytes[offset] === 0) { fail('serverIdentityInvalid'); }
    size = 0;
    for (let index = 0; index < count; index++) { size = size * 256 + bytes[offset++]; }
    if (size < 128 || (count === 2 && size < 256)) { fail('serverIdentityInvalid'); }
  }
  const end = offset + size;
  if (end > boundary) { fail('serverIdentityInvalid'); }
  return { tag, body: offset, end };
}

function derChildren(bytes, parent, limit) {
  const result = []; let offset = parent.body;
  while (offset < parent.end) {
    if (result.length >= limit) { fail('serverIdentityInvalid'); }
    const child = derNode(bytes, offset, parent.end); result.push(child); offset = child.end;
  }
  return result;
}

function requireLeafExtensions(bytes) {
  // X509Certificate.ca учитывает keyUsage и может скрыть CA:TRUE без keyCertSign
  // Поэтому фиксированный leaf-профиль отдельно требует DER BasicConstraints = SEQUENCE {}
  const certificate = derNode(bytes, 0, bytes.length);
  const fields = derChildren(bytes, certificate, 3);
  if (certificate.tag !== 0x30 || certificate.end !== bytes.length || fields.length !== 3 || fields[0].tag !== 0x30) {
    fail('serverIdentityInvalid');
  }
  const tbs = derChildren(bytes, fields[0], 10);
  const extensions = tbs.filter((field) => field.tag === 0xa3);
  if (extensions.length !== 1 || extensions[0] !== tbs.at(-1)) { fail('serverIdentityInvalid'); }
  const wrapped = derChildren(bytes, extensions[0], 1);
  if (wrapped.length !== 1 || wrapped[0].tag !== 0x30) { fail('serverIdentityInvalid'); }
  const seen = new Set(); let nonCa = false; let signatureOnly = false;
  const allowed = new Set(['551d13', '551d0f', '551d25', '551d0e', '551d23']);
  for (const extension of derChildren(bytes, wrapped[0], 16)) {
    if (extension.tag !== 0x30) { fail('serverIdentityInvalid'); }
    const parts = derChildren(bytes, extension, 3);
    if (parts.length < 2 || parts[0].tag !== 0x06 || parts.at(-1).tag !== 0x04) { fail('serverIdentityInvalid'); }
    if (parts.length === 3 && (parts[1].tag !== 0x01 || parts[1].end - parts[1].body !== 1 ||
        bytes[parts[1].body] !== 0xff)) { fail('serverIdentityInvalid'); }
    const oid = bytes.subarray(parts[0].body, parts[0].end);
    if (oid.length === 0 || oid.length > 32 || (oid.at(-1) & 0x80)) { fail('serverIdentityInvalid'); }
    for (let index = 0; index < oid.length; index++) {
      if ((index === 0 || !(oid[index - 1] & 0x80)) && oid[index] === 0x80) { fail('serverIdentityInvalid'); }
    }
    const identifier = oid.toString('hex');
    if (!allowed.has(identifier) || seen.has(identifier)) { fail('serverIdentityInvalid'); }
    seen.add(identifier);
    if (identifier === '551d13') {
      nonCa = parts.length === 3 &&
        bytes.subarray(parts.at(-1).body, parts.at(-1).end).equals(Buffer.from([0x30, 0]));
      if (!nonCa) { fail('serverIdentityInvalid'); }
    }
    if (identifier === '551d0f') {
      signatureOnly = parts.length === 3 &&
        bytes.subarray(parts.at(-1).body, parts.at(-1).end).equals(Buffer.from([0x03, 0x02, 0x07, 0x80]));
      if (!signatureOnly) { fail('serverIdentityInvalid'); }
    }
  }
  if (!nonCa || !signatureOnly) { fail('serverIdentityInvalid'); }
}

export class TransportClient {
  #privateKey; #serverKeys; #routerId; #sessionId; #accessExpiresAt; #transportKey; #ca;
  #now; #uptime; #anchor = null; #lastWall = null; #lastTick = null; #keyId;
  #state = 'idle'; #pending = null; #reply = null; #grant = null; #clockBlocked = false;

  constructor({ identityPrivateKey, serverKeys, routerId, sessionId, accessExpiresAt,
    transportPublicKey, transportCaCertificate, now = () => Math.floor(Date.now() / 1000),
    uptime = () => performance.now() / 1000 }) {
    try {
      if (identityPrivateKey?.type !== 'private' || identityPrivateKey.asymmetricKeyType !== 'ed25519' ||
          transportPublicKey?.type !== 'public' || transportPublicKey.asymmetricKeyType !== 'ed25519' ||
          !(serverKeys instanceof Map) || serverKeys.size < 1 || serverKeys.size > 8 ||
          [...serverKeys].some(([id, key]) => typeof id !== 'string' || !keyIdPattern.test(id) ||
            key?.type !== 'public' || key.asymmetricKeyType !== 'ed25519') ||
          typeof now !== 'function' || typeof uptime !== 'function') { fail('messageMalformed'); }
      decodeBase64Url(routerId, 'routerId', 16); decodeBase64Url(sessionId, 'sessionId', 16);
      requireTime(accessExpiresAt, 'accessExpiresAt');
      const identityDer = publicDer(createPublicKey(identityPrivateKey));
      if (identityDer.equals(publicDer(transportPublicKey))) { fail('messageMalformed'); }
      const caInput = transportCaCertificate instanceof X509Certificate ? transportCaCertificate.raw : transportCaCertificate;
      if ((!Buffer.isBuffer(caInput) && typeof caInput !== 'string') || Buffer.byteLength(caInput) > 8192) {
        fail('messageMalformed');
      }
      const ca = new X509Certificate(caInput);
      if (!ca.ca || ca.publicKey.asymmetricKeyType !== 'ed25519' ||
          !Number.isFinite(Date.parse(ca.validFrom)) || !Number.isFinite(Date.parse(ca.validTo))) {
        fail('messageMalformed');
      }
      this.#privateKey = identityPrivateKey; this.#serverKeys = new Map(serverKeys);
      this.#routerId = routerId; this.#sessionId = sessionId; this.#accessExpiresAt = accessExpiresAt;
      this.#transportKey = transportPublicKey; this.#ca = ca; this.#now = now; this.#uptime = uptime;
      this.#keyId = identityKeyId(identityDer.subarray(-32).toString('base64url'));
      const current = this.#time();
      if (accessExpiresAt <= current || accessExpiresAt > current + 86400 ||
          Date.parse(ca.validFrom) / 1000 > current || Date.parse(ca.validTo) / 1000 <= current) {
        fail('messageMalformed');
      }
    } catch { throw new TypeError('Invalid transport client configuration'); }
  }

  #close(state) {
    this.#state = this.#clockBlocked ? 'securityBlocked' : state;
    this.#pending = null; this.#reply = null; this.#grant = null;
  }

  #time() {
    let wall; let tick; let current;
    try {
      wall = this.#now(); tick = this.#uptime(); requireTime(wall, 'clock');
      if (!Number.isFinite(tick) || tick < 0 || tick > Number.MAX_SAFE_INTEGER || Object.is(tick, -0) ||
          (this.#lastTick !== null && (tick < this.#lastTick || wall < this.#lastWall))) { fail('clockUntrusted'); }
      const anchor = this.#anchor ?? { wall, tick };
      const projected = anchor.wall + Math.floor(tick - anchor.tick);
      current = Math.max(wall, projected); requireTime(current, 'clock');
      if (wall > projected) { this.#anchor = { wall, tick }; }
    } catch {
      this.#clockBlocked = true; this.#close('securityBlocked'); fail('clockUntrusted');
    }
    this.#anchor ??= { wall, tick }; this.#lastWall = wall; this.#lastTick = tick;
    if (!['revoked', 'sessionExpired', 'securityBlocked'].includes(this.#state) &&
        (current >= this.#accessExpiresAt || (this.#grant && current >= this.#grant.leaseExpiresAt) ||
          (this.#state === 'requestPending' && current >= this.#pending.expiresAt))) {
      this.#close('sessionExpired');
    }
    return current;
  }

  #requireOpen() {
    if (this.#clockBlocked) { fail('clockUntrusted'); }
    if (['revoked', 'sessionExpired', 'securityBlocked'].includes(this.#state)) { fail('sessionRevoked'); }
  }

  status() {
    this.#time();
    return { state: this.#state, routerId: this.#routerId, sessionId: this.#sessionId,
      accessExpiresAt: this.#accessExpiresAt, leaseExpiresAt: this.#grant?.leaseExpiresAt ?? null,
      pendingResponse: this.#state === 'requestPending', credentialsAvailable: this.#grant !== null,
      transportReady: false };
  }

  request(csrDer) {
    const current = this.#time(); this.#requireOpen();
    if (this.#state !== 'idle') { fail('stateConflict'); }
    if (!Buffer.isBuffer(csrDer) || csrDer.length > 4096) { fail('messageMalformed'); }
    const encoded = csrDer.toString('base64url'); decodeTransportDer(encoded);
    let streamId;
    do { streamId = newId(); } while (streamId === this.#sessionId);
    const message = validateTransportMessage({ messageType: 'transportRequest', routerId: this.#routerId,
      streamId, messageId: newId(), sequence: 0, issuedAt: current, notBefore: current,
      expiresAt: Math.min(current + 60, this.#accessExpiresAt),
      payload: { profile: transportProfile, sessionId: this.#sessionId, csrDer: encoded } });
    const wire = JSON.stringify(createEnvelope({ keyId: this.#keyId, privateKey: this.#privateKey,
      payloadBytes: Buffer.from(JSON.stringify(message)) }));
    this.#pending = { wire, streamId, csrSha256: sha256(csrDer), expiresAt: message.expiresAt, issuedAt: current };
    this.#state = 'requestPending';
    return wire;
  }

  retry() {
    const current = this.#time(); this.#requireOpen();
    if (this.#state !== 'requestPending' || !this.#pending) { fail('stateConflict'); }
    if (current >= this.#pending.expiresAt) { this.#close('securityBlocked'); fail('messageExpired'); }
    return this.#pending.wire;
  }

  accept(wire) {
    const current = this.#time(); this.#requireOpen();
    try {
      if (!this.#pending || !['requestPending', 'grantReady'].includes(this.#state)) { fail('stateConflict'); }
      if (typeof wire === 'string' && wire.length > 24576) { fail('messageMalformed'); }
      const input = typeof wire === 'string' ? Buffer.from(wire) : wire;
      if (!Buffer.isBuffer(input) || input.length > 24576) { fail('messageMalformed'); }
      const envelope = parseStrictJson(input, 24576);
      const { payload: message } = verifyEnvelope({ envelope, publicKeys: this.#serverKeys, now: current });
      validateTransportMessage(message);
      const grant = message.payload;
      if (message.messageType !== 'transportGrant' || message.routerId !== this.#routerId ||
          message.streamId !== this.#pending.streamId || grant.sessionId !== this.#sessionId ||
          grant.csrSha256 !== this.#pending.csrSha256 || grant.accessExpiresAt !== this.#accessExpiresAt ||
          message.issuedAt < this.#pending.issuedAt) { fail('stateConflict'); }
      if (this.#reply) {
        if (!input.equals(this.#reply)) { fail('sequenceReplay'); }
        return this.status();
      }
      if (current >= this.#pending.expiresAt) { fail('messageExpired'); }
      const certificateDer = decodeTransportDer(grant.certificateDer);
      const certificate = new X509Certificate(certificateDer);
      requireLeafExtensions(certificateDer);
      const validFrom = Date.parse(certificate.validFrom) / 1000;
      const validTo = Date.parse(certificate.validTo) / 1000;
      if (!certificate.raw.equals(certificateDer) || certificate.ca ||
          certificate.subject !== 'CN=Sheepfold temporary support' ||
          certificate.publicKey.asymmetricKeyType !== 'ed25519' ||
          !publicDer(certificate.publicKey).equals(publicDer(this.#transportKey)) ||
          !certificate.checkIssued(this.#ca) || !certificate.verify(this.#ca.publicKey) ||
          !Array.isArray(certificate.keyUsage) || certificate.keyUsage.length !== 1 ||
          certificate.keyUsage[0] !== '1.3.6.1.5.5.7.3.2' || !Number.isFinite(validFrom) || validFrom > current ||
          validTo !== grant.leaseExpiresAt || Date.parse(this.#ca.validFrom) / 1000 > validFrom ||
          Date.parse(this.#ca.validTo) / 1000 < validTo) { fail('serverIdentityInvalid'); }
      // Принятый token не попадает в status/retry; копия ответа живёт только до исходной lease
      this.#grant = structuredClone(grant); this.#reply = Buffer.from(input);
      this.#pending.wire = null; this.#state = 'grantReady';
      return this.status();
    } catch (error) {
      this.#close('securityBlocked');
      if (typeof error?.code === 'string' && ['messageMalformed', 'protocolUnsupported', 'signatureInvalid',
        'messageExpired', 'messageNotYetValid', 'stateConflict', 'sequenceReplay', 'serverIdentityInvalid'].includes(error.code)) {
        fail(error.code);
      }
      fail('serverIdentityInvalid');
    }
  }

  credentials() {
    this.#time(); this.#requireOpen();
    if (!this.#grant || this.#state !== 'grantReady') { fail('sessionRevoked'); }
    return structuredClone(this.#grant);
  }

  localRevoke() {
    this.#close('revoked');
    return this.status();
  }
}
