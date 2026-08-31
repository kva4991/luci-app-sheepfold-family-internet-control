/*
 * Исполняемый клиентский автомат control-профиля, только для Node.js стенда §rsup001
 * Вход: явное локальное разрешение и подписанные server bytes; выход: запросы и безопасный status
 * Не открывает сеть/SSH, не пишет ключи на flash и не заменяет OpenWrt manager
 */
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { createEnvelope, ReplayWindow, verifyEnvelope } from './signedEnvelope.mjs';
import { parseStrictJson } from './strictJson.mjs';
import { accessLifeSec, claimLifeSec, fail, requireTime } from './protocolValues.mjs';
import { generateClaimCode } from './sessionState.mjs';
import {
  clientCapabilities, controlProfile, identityKeyId, requireSshKey, terminalStates,
  validateRouterMessage, validateServerMessage,
} from './experimentalPayload.mjs';

const newId = () => randomBytes(16).toString('base64url');
const digest = (envelope) => createHash('sha256').update(JSON.stringify([
  envelope.protocolVersion, envelope.keyId, envelope.signedPayload, envelope.signature,
])).digest('hex');

export class ControlClient {
  #privateKey; #serverKeys; #now; #uptime; #anchor; #lastWall; #lastTick;
  #rawKey; #keyId; #bootstrap = null; #pending = null; #lastReply = null;
  #routerId = null; #controlId = null; #outgoing = new Map(); #incoming = new ReplayWindow();
  #state = 'disabled'; #session = null; #code = null; #localClosed = false; #serverReady = false;

  constructor({ privateKey, serverKeys, now = () => Math.floor(Date.now() / 1000),
    uptime = () => performance.now() / 1000 }) {
    if (privateKey?.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519' ||
        !(serverKeys instanceof Map) || !serverKeys.size || serverKeys.size > 8 ||
        [...serverKeys.values()].some((key) => key.type !== 'public' || key.asymmetricKeyType !== 'ed25519')) {
      throw new TypeError('Invalid control client keys');
    }
    this.#privateKey = privateKey; this.#serverKeys = new Map(serverKeys);
    this.#now = now; this.#uptime = uptime;
    this.#rawKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
      .subarray(-32).toString('base64url');
    this.#keyId = identityKeyId(this.#rawKey);
  }

  #time() {
    const wall = this.#now(); const tick = this.#uptime();
    requireTime(wall, 'clock');
    if (!Number.isFinite(tick) || tick < 0 || tick < this.#lastTick || wall < this.#lastWall) {
      this.#close('securityBlocked'); fail('clockUntrusted');
    }
    this.#anchor ??= { wall, tick };
    this.#lastWall = wall; this.#lastTick = tick;
    const now = Math.max(wall, this.#anchor.wall + Math.floor(tick - this.#anchor.tick));
    if (this.#session && !this.#localClosed &&
        now >= (this.#session.accessExpiresAt ?? this.#session.claimExpiresAt)) {
      this.#close(this.#session.accessExpiresAt === null ? 'claimExpired' : 'sessionExpired');
    }
    return now;
  }

  #close(state) {
    this.#state = state; this.#localClosed = true; this.#code = null;
    if (state === 'securityBlocked') this.#serverReady = false;
    // Поздний ответ можно сверить, но открывающий запрос после локального отзыва уже не повторяется
    if (this.#pending && this.#pending.type !== 'revokeRequest') this.#pending.wire = null;
  }

  status() {
    this.#time();
    return { state: this.#state, routerId: this.#routerId, sessionId: this.#session?.sessionId ?? null,
      claimExpiresAt: this.#session?.claimExpiresAt ?? null,
      accessExpiresAt: this.#session?.accessExpiresAt ?? null,
      ticketId: this.#session?.ticketId ?? null, transportReady: false,
      pendingResponse: this.#pending !== null };
  }

  claimCode() {
    this.#time();
    return this.#state === 'claimOpen' && !this.#localClosed ? this.#code : null;
  }

  enrollmentStart({ localConsent = false } = {}) {
    if (localConsent !== true || this.#state !== 'disabled') fail('stateConflict');
    const now = this.#time();
    this.#bootstrap = { identityPublicKey: this.#rawKey, clientNonce: newId(), supportedVersions: [1] };
    this.#state = 'enrolling';
    this.#anchor = { wall: now, tick: this.#lastTick };
    return structuredClone(this.#bootstrap);
  }

  #build(type, payload, streamId, routerId = this.#routerId) {
    if (this.#pending) fail('stateConflict', 'a request is already outstanding');
    const now = this.#time();
    const sequence = this.#outgoing.get(streamId) ?? 0;
    const message = validateRouterMessage({ messageType: type, routerId, streamId, messageId: newId(),
      sequence, issuedAt: now, notBefore: now, expiresAt: now + 60, payload });
    const envelope = createEnvelope({ keyId: this.#keyId, privateKey: this.#privateKey,
      payloadBytes: Buffer.from(JSON.stringify(message)) });
    this.#pending = { type, streamId, sequence, expiresAt: message.expiresAt, wire: JSON.stringify(envelope) };
    this.#outgoing.set(streamId, sequence + 1);
    return this.#pending.wire;
  }

  acceptChallenge(wire) {
    if (!this.#bootstrap || this.#pending || this.#state !== 'enrolling') fail('stateConflict');
    try {
      const envelope = parseStrictJson(wire, 24576);
      const { payload: message } = verifyEnvelope({ envelope, publicKeys: this.#serverKeys, now: this.#time() });
      validateServerMessage(message);
      if (message.messageType !== 'enrollChallenge' ||
          message.payload.clientNonce !== this.#bootstrap.clientNonce ||
          message.payload.candidateKeyId !== this.#keyId) fail('stateConflict');
      this.#incoming.accept(message, digest(envelope));
      this.#bootstrap = null;
      return this.#build('enrollProof', {
        challenge: message.payload.challenge, clientNonce: message.payload.clientNonce,
      }, message.streamId, null);
    } catch (error) {
      this.#close('securityBlocked'); throw error;
    }
  }

  capabilities() {
    if (!this.#controlId || this.#session || this.#localClosed) fail('stateConflict');
    return this.#build('capabilityReport', { profile: controlProfile, capabilities: [...clientCapabilities] },
      this.#controlId);
  }

  openClaim({ localConsent = false, routerHostKey, diagnosticsAllowed = false } = {}) {
    const now = this.#time();
    if (localConsent !== true || !this.#serverReady || this.#pending ||
        (this.#session && !terminalStates.includes(this.#state))) fail('claimNotOpen');
    requireSshKey(routerHostKey);
    if (typeof diagnosticsAllowed !== 'boolean') fail('messageMalformed');
    if (this.#session) {
      this.#outgoing.delete(this.#session.sessionId);
      this.#incoming.sessions.delete(this.#routerId + ':' + this.#session.sessionId);
    }
    const sessionId = newId();
    this.#session = { sessionId, claimExpiresAt: now + claimLifeSec, accessExpiresAt: null, ticketId: null };
    this.#localClosed = false; this.#code = generateClaimCode(); this.#state = 'claimOpening';
    return this.#build('claimOpen', { sessionId, code: this.#code, claimExpiresAt: this.#session.claimExpiresAt,
      routerHostKey, diagnosticsAllowed }, sessionId);
  }

  queryStatus() {
    if (!this.#session) fail('claimNotOpen');
    return this.#build('statusQuery', { sessionId: this.#session.sessionId }, this.#session.sessionId);
  }

  localRevoke() {
    this.#close('revoked');
    return this.status();
  }

  revokeRequest() {
    this.localRevoke();
    if (this.#pending?.type === 'revokeRequest') return this.retry();
    if (!this.#session) fail('claimNotOpen');
    return this.#build('revokeRequest', { sessionId: this.#session.sessionId }, this.#session.sessionId);
  }

  retry() {
    const now = this.#time();
    if (!this.#pending?.wire) fail('stateConflict', 'no retryable request');
    if (now >= this.#pending.expiresAt) {
      this.#close('securityBlocked'); fail('messageExpired');
    }
    return this.#pending.wire;
  }

  #checkResponse(message) {
    const pending = this.#pending;
    if (!pending) fail('stateConflict', 'unsolicited server response');
    if (pending.type === 'enrollProof') {
      if (message.messageType !== 'enrollAccepted' || message.payload.keyId !== this.#keyId ||
          message.streamId === pending.streamId) fail('stateConflict');
      return;
    }
    if (message.routerId !== this.#routerId || message.streamId !== pending.streamId) fail('stateConflict');
    if (pending.type === 'capabilityReport') {
      if (message.messageType !== 'statusQuery' || !message.payload.capabilities?.includes('claimV1')) {
        fail('protocolUnsupported');
      }
      return;
    }
    const expected = { claimOpen: 'claimOpened', statusQuery: 'statusQuery', revokeRequest: 'revokeConfirmed' };
    if (message.messageType !== expected[pending.type]) fail('stateConflict');
    const value = message.payload;
    if (value.sessionId !== this.#session.sessionId || value.claimExpiresAt !== this.#session.claimExpiresAt) {
      fail('stateConflict', 'claim scope or deadline changed');
    }
    if (this.#session.accessExpiresAt !== null && value.accessExpiresAt !== this.#session.accessExpiresAt) {
      fail('stateConflict', 'access deadline changed');
    }
    if (value.accessExpiresAt !== null &&
        value.accessExpiresAt > message.issuedAt + accessLifeSec) fail('stateConflict', 'access deadline too long');
    if (this.#session.ticketId !== null && value.ticketId !== this.#session.ticketId) fail('stateConflict');
    if (this.#state === 'sessionPreparing' && value.state === 'claimOpen') fail('stateConflict');
  }

  accept(wire) {
    try {
      const envelope = parseStrictJson(wire, 24576);
      const { payload: message } = verifyEnvelope({ envelope, publicKeys: this.#serverKeys, now: this.#time() });
      validateServerMessage(message);
      const fingerprint = digest(envelope);
      if (!this.#pending && fingerprint === this.#lastReply) return this.status();
      this.#checkResponse(message);
      const replay = this.#incoming.accept(message, fingerprint);
      if (replay.duplicate) fail('sequenceReplay', 'old response cannot acknowledge another request');
      const type = this.#pending.type;
      this.#pending = null; this.#lastReply = fingerprint;
      if (type === 'enrollProof') {
        this.#routerId = message.routerId; this.#controlId = message.streamId;
        if (!this.#localClosed) this.#state = 'moduleReady';
      } else if (type === 'capabilityReport') {
        this.#serverReady = true;
      } else if (!this.#localClosed) {
        const value = message.payload;
        this.#session = { sessionId: value.sessionId, claimExpiresAt: value.claimExpiresAt,
          accessExpiresAt: value.accessExpiresAt, ticketId: value.ticketId };
        this.#state = value.state;
        if (value.state !== 'claimOpen') this.#code = null;
        if (terminalStates.includes(value.state)) this.#close(value.state);
      }
      return this.status();
    } catch (error) {
      this.#close('securityBlocked'); throw error;
    }
  }
}
