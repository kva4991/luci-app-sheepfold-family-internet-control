import {
  createHash,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';

import { parseStrictJson } from './strictJson.mjs';
import {
  decodeBase64Url,
  envelopeFields,
  fail,
  idPattern,
  keyIdPattern,
  maxMessageBytes,
  maxMessageLifeSec,
  messageTypes,
  payloadFields,
  protocolVersion,
  requireExactKeys,
  requireRecord,
  requireTime,
} from './protocolValues.mjs';

const signContext = Buffer.from('SheepfoldRemoteSupport\0', 'ascii');

export function validatePayload(value) {
  requireExactKeys(value, payloadFields, 'signed payload');
  if (!messageTypes.includes(value.messageType)) {
    fail('protocolUnsupported', 'unknown message type');
  }
  const enrollmentType = ['enrollChallenge', 'enrollProof'].includes(value.messageType);
  if (enrollmentType ? value.routerId !== null : value.routerId === null) {
    fail('messageMalformed', 'routerId nullability does not match messageType');
  }
  for (const field of ['streamId', 'messageId']) {
    if (typeof value[field] !== 'string' || !idPattern.test(value[field])) {
      fail('messageMalformed', `${field} must encode exactly 128 bits`);
    }
    decodeBase64Url(value[field], field, 16);
  }
  if (value.routerId !== null) {
    if (typeof value.routerId !== 'string' || !idPattern.test(value.routerId)) {
      fail('messageMalformed', 'routerId must encode exactly 128 bits');
    }
    decodeBase64Url(value.routerId, 'routerId', 16);
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0 || Object.is(value.sequence, -0)) {
    fail('messageMalformed', 'sequence is outside the interoperable JSON integer range');
  }
  for (const field of ['issuedAt', 'notBefore', 'expiresAt']) {
    requireTime(value[field], field);
  }
  if (value.issuedAt > value.notBefore || value.notBefore >= value.expiresAt) {
    fail('messageMalformed', 'message timestamps are inconsistent');
  }
  if (value.expiresAt - value.issuedAt > maxMessageLifeSec) {
    fail('messageMalformed', 'message lifetime is too long');
  }
  requireRecord(value.payload, 'payload');
  if (Object.keys(value.payload).length > 32) {
    fail('messageMalformed', 'payload has too many fields');
  }
  return value;
}

export function validateEnvelope(value) {
  requireExactKeys(value, envelopeFields, 'signed envelope');
  if (value.protocolVersion !== protocolVersion) {
    fail('protocolUnsupported', 'unsupported major version');
  }
  if (typeof value.keyId !== 'string' || !keyIdPattern.test(value.keyId)) {
    fail('messageMalformed', 'invalid keyId');
  }
  const payloadBytes = decodeBase64Url(value.signedPayload, 'signedPayload');
  if (payloadBytes.length === 0 || payloadBytes.length > maxMessageBytes) {
    fail('messageMalformed', 'signedPayload size is outside the allowed range');
  }
  const signature = decodeBase64Url(value.signature, 'signature', 64);
  return { payloadBytes, signature };
}

export function buildSignInput(version, keyId, payloadBytes) {
  if (!Number.isInteger(version) || version < 0 || version > 0xffffffff) {
    fail('messageMalformed', 'protocol version cannot be encoded');
  }
  if (typeof keyId !== 'string' || !keyIdPattern.test(keyId)) {
    fail('messageMalformed', 'invalid keyId');
  }
  const keyBytes = Buffer.from(keyId, 'ascii');
  const payload = Buffer.from(payloadBytes);
  if (payload.length === 0 || payload.length > maxMessageBytes) {
    fail('messageMalformed', 'payload size is outside the allowed range');
  }

  const sizes = Buffer.alloc(10);
  sizes.writeUInt32BE(version, 0);
  sizes.writeUInt16BE(keyBytes.length, 4);
  sizes.writeUInt32BE(payload.length, 6);
  return Buffer.concat([signContext, sizes, keyBytes, payload]);
}

export function createEnvelope({ keyId, payloadBytes, privateKey }) {
  const payload = Buffer.from(payloadBytes);
  validatePayload(parseStrictJson(payload));
  const signedInput = buildSignInput(protocolVersion, keyId, payload);
  const signature = signBytes(null, signedInput, privateKey);
  return {
    protocolVersion,
    keyId,
    signedPayload: payload.toString('base64url'),
    signature: signature.toString('base64url'),
  };
}

export function verifyEnvelope({ envelope, publicKeys, now = null, replayWindow = null }) {
  const { payloadBytes, signature } = validateEnvelope(envelope);
  const publicKey = publicKeys instanceof Map
    ? publicKeys.get(envelope.keyId)
    : publicKeys?.[envelope.keyId];
  if (!publicKey) {
    fail('signatureInvalid', 'unknown signing key');
  }
  const signedInput = buildSignInput(envelope.protocolVersion, envelope.keyId, payloadBytes);
  if (!verifyBytes(null, signedInput, publicKey, signature)) {
    fail('signatureInvalid', 'signature verification failed');
  }

  const payload = validatePayload(parseStrictJson(payloadBytes));
  if (now !== null) {
    requireTime(now, 'now');
    if (now < payload.notBefore) {
      fail('messageNotYetValid', 'message validity has not started');
    }
    if (now >= payload.expiresAt) {
      fail('messageExpired', 'message validity has ended');
    }
  }
  const replay = replayWindow
    ? replayWindow.accept(payload, createHash('sha256').update(signedInput).digest('hex'))
    : { duplicate: false };
  return { payload, replay };
}

export class ReplayWindow {
  constructor() {
    this.sessions = new Map();
  }

  accept(payload, fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')) {
    validatePayload(payload);
    const key = `${payload.routerId || 'unassigned'}:${payload.streamId}`;
    const previous = this.sessions.get(key);
    if (!previous) {
      if (payload.sequence !== 0) {
        fail('sequenceGap', 'a new directional sequence must start at zero');
      }
      this.sessions.set(key, { sequence: payload.sequence, messageId: payload.messageId, fingerprint });
      return { duplicate: false };
    }
    if (payload.sequence < previous.sequence) {
      fail('sequenceReplay', 'sequence is older than the accepted value');
    }
    if (payload.sequence === previous.sequence) {
      if (payload.messageId === previous.messageId && fingerprint === previous.fingerprint) {
        return { duplicate: true };
      }
      fail('sequenceReplay', 'sequence was reused by another message');
    }
    if (payload.sequence !== previous.sequence + 1) {
      fail('sequenceGap', 'sequence contains a gap');
    }
    this.sessions.set(key, { sequence: payload.sequence, messageId: payload.messageId, fingerprint });
    return { duplicate: false };
  }
}
