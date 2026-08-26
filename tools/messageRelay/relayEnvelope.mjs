import {
  createCipheriv,
  createDecipheriv,
  createHmac,
} from 'node:crypto';

import { parseMessagePayload } from './messagePayload.mjs';
import { parseStrictJson } from './strictJson.mjs';
import {
  clockSkewSeconds,
  commandResultTtlSeconds,
  commandTtlSeconds,
  cryptoSuite,
  decodeBase64Url,
  directions,
  envelopeFields,
  fail,
  maxEnvelopeBytes,
  maxPlaintextBytes,
  messageClasses,
  notificationTtlSeconds,
  protocolVersion,
  requireExactKeys,
  requireId,
  requireSafeInteger,
} from './protocolValues.mjs';

const aadContext = Buffer.from('SheepfoldFamilyMessageRelay\0', 'ascii');
const messageKeyContext = Buffer.from('SheepfoldFamilyMessageRelay/subkey\0', 'ascii');
const directionCodes = Object.freeze({ phoneToRouter: 1, routerToPhone: 2 });
const classCodes = Object.freeze({ command: 1, commandResult: 2, notification: 3 });
const keyRecordFields = Object.freeze(['keyId', 'streamId', 'direction', 'keyBytes']);

function writeUInt64(buffer, offset, value) {
  requireSafeInteger(value, 'binary integer');
  buffer.writeBigUInt64BE(BigInt(value), offset);
}

function buildFixedEnvelopeMetadata(envelope) {
  validateEnvelope(envelope, { validateCiphertext: false });
  const fixed = Buffer.alloc(4 + 1 + 1 + (16 * 5) + (8 * 3));
  let offset = 0;
  fixed.writeUInt32BE(envelope.protocolVersion, offset);
  offset += 4;
  fixed.writeUInt8(directionCodes[envelope.direction], offset);
  offset += 1;
  fixed.writeUInt8(classCodes[envelope.messageClass], offset);
  offset += 1;
  for (const field of ['routerId', 'phoneId', 'streamId', 'messageId', 'keyId']) {
    decodeBase64Url(envelope[field], field, 16).copy(fixed, offset);
    offset += 16;
  }
  for (const field of ['sequence', 'issuedAt', 'expiresAt']) {
    writeUInt64(fixed, offset, envelope[field]);
    offset += 8;
  }
  return fixed;
}

export function buildEnvelopeAad(envelope) {
  return Buffer.concat([aadContext, buildFixedEnvelopeMetadata(envelope)]);
}

export function buildEnvelopeIv(sequence) {
  requireSafeInteger(sequence, 'sequence', 1);
  const iv = Buffer.alloc(12);
  iv.writeBigUInt64BE(BigInt(sequence), 4);
  return iv;
}

export function deriveEnvelopeMessageKey(masterKeyBytes, envelope) {
  if (!Buffer.isBuffer(masterKeyBytes) && !(masterKeyBytes instanceof Uint8Array)) {
    fail('keyInvalid', 'direction master key must be bytes');
  }
  const masterKey = Buffer.from(masterKeyBytes);
  if (masterKey.length !== 32) fail('keyInvalid', 'direction master key must contain 32 bytes');
  return createHmac('sha256', masterKey)
    .update(messageKeyContext)
    .update(buildFixedEnvelopeMetadata(envelope))
    .digest();
}

function validateKeyRecord(keyRecord, envelope) {
  requireExactKeys(keyRecord, keyRecordFields, 'keyRecord');
  if (!directions.includes(keyRecord.direction)) fail('keyInvalid', 'keyRecord direction is invalid');
  requireId(keyRecord.streamId, 'keyRecord streamId');
  requireId(keyRecord.keyId, 'keyRecord keyId');
  if (keyRecord.direction !== envelope.direction
      || keyRecord.streamId !== envelope.streamId
      || keyRecord.keyId !== envelope.keyId) {
    fail('keyInvalid', 'keyRecord does not match authenticated envelope metadata');
  }
  if (!Buffer.isBuffer(keyRecord.keyBytes) && !(keyRecord.keyBytes instanceof Uint8Array)) {
    fail('keyInvalid', 'keyRecord keyBytes must be bytes');
  }
  const keyBytes = Buffer.from(keyRecord.keyBytes);
  if (keyBytes.length !== 32) fail('keyInvalid', 'direction master key must contain 32 bytes');
  return keyBytes;
}

export function validateEnvelope(value, {
  now = null,
  validateCiphertext = true,
  encodedBytes = null,
} = {}) {
  requireExactKeys(value, envelopeFields, 'relay envelope');
  if (value.protocolVersion !== protocolVersion) fail('protocolUnsupported', 'unsupported major version');
  if (value.cryptoSuite !== cryptoSuite) fail('protocolUnsupported', 'unsupported crypto suite');
  if (!directions.includes(value.direction)) fail('messageMalformed', 'direction is invalid');
  if (!messageClasses.includes(value.messageClass)) fail('messageMalformed', 'messageClass is invalid');
  if (value.messageClass === 'command' && value.direction !== 'phoneToRouter') {
    fail('messageMalformed', 'commands only travel from phone to router');
  }
  if (value.messageClass !== 'command' && value.direction !== 'routerToPhone') {
    fail('messageMalformed', 'results and notifications only travel from router to phone');
  }
  for (const field of ['routerId', 'phoneId', 'streamId', 'messageId', 'keyId']) requireId(value[field], field);
  requireSafeInteger(value.sequence, 'sequence', 1);
  requireSafeInteger(value.issuedAt, 'issuedAt');
  requireSafeInteger(value.expiresAt, 'expiresAt');
  if (value.expiresAt <= value.issuedAt) fail('messageMalformed', 'message lifetime is empty');
  const maximumLifetime = value.messageClass === 'command'
    ? commandTtlSeconds
    : value.messageClass === 'commandResult'
      ? commandResultTtlSeconds
      : notificationTtlSeconds;
  if (value.expiresAt - value.issuedAt > maximumLifetime) fail('messageMalformed', 'message lifetime is too long');
  if (validateCiphertext) {
    const ciphertext = decodeBase64Url(value.ciphertext, 'ciphertext');
    if (ciphertext.length < 17 || ciphertext.length > maxPlaintextBytes + 16) {
      fail('messageMalformed', 'ciphertext size is outside the allowed range');
    }
  } else if (typeof value.ciphertext !== 'string') {
    fail('messageMalformed', 'ciphertext must be a string');
  }
  const measuredBytes = encodedBytes ?? Buffer.byteLength(JSON.stringify(value));
  if (!Number.isSafeInteger(measuredBytes) || measuredBytes < 1 || measuredBytes > maxEnvelopeBytes) {
    fail('messageTooLarge', 'encoded envelope exceeds the limit');
  }
  if (now !== null) {
    requireSafeInteger(now, 'now');
    if (value.issuedAt > now + clockSkewSeconds) fail('messageNotYetValid', 'issuedAt is in the future');
    if (value.expiresAt <= now) fail('messageExpired', 'message lifetime has ended');
  }
  return value;
}

export function parseRelayEnvelope(bytes, { now = null } = {}) {
  const input = Buffer.from(bytes);
  if (input.length === 0 || input.length > maxEnvelopeBytes) {
    fail('messageTooLarge', 'encoded envelope exceeds the limit');
  }
  return validateEnvelope(parseStrictJson(input, maxEnvelopeBytes), { now, encodedBytes: input.length });
}

export function encryptEnvelope({ metadata, plaintext, keyRecord }) {
  const plaintextBytes = Buffer.from(plaintext);
  if (plaintextBytes.length === 0 || plaintextBytes.length > maxPlaintextBytes) {
    fail('messageMalformed', 'plaintext size is outside the allowed range');
  }
  const envelope = {
    ...metadata,
    protocolVersion,
    cryptoSuite,
    ciphertext: '',
  };
  const keyBytes = validateKeyRecord(keyRecord, envelope);
  const payload = parseMessagePayload(plaintextBytes, { envelope, now: envelope.issuedAt });
  if (payload.messageType !== envelope.messageClass) {
    fail('messageMalformed', 'payload type does not match envelope class');
  }
  const aad = buildEnvelopeAad(envelope);
  const messageKey = deriveEnvelopeMessageKey(keyBytes, envelope);
  const cipher = createCipheriv('aes-256-gcm', messageKey, buildEnvelopeIv(envelope.sequence), { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: plaintextBytes.length });
  const encrypted = Buffer.concat([cipher.update(plaintextBytes), cipher.final(), cipher.getAuthTag()]);
  envelope.ciphertext = encrypted.toString('base64url');
  validateEnvelope(envelope);
  return envelope;
}

export function decryptEnvelope({ envelope, keyRecord, now }) {
  requireSafeInteger(now, 'now');
  validateEnvelope(envelope, { now });
  const keyBytes = validateKeyRecord(keyRecord, envelope);
  const encrypted = decodeBase64Url(envelope.ciphertext, 'ciphertext');
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const messageKey = deriveEnvelopeMessageKey(keyBytes, envelope);
  const decipher = createDecipheriv('aes-256-gcm', messageKey, buildEnvelopeIv(envelope.sequence), { authTagLength: 16 });
  decipher.setAAD(buildEnvelopeAad(envelope), { plaintextLength: ciphertext.length });
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail('authenticationFailed', 'ciphertext or authenticated metadata was changed');
  }
  // Replay/dedup state обновляет только вызывающая сторона после успешной проверки tag и payload
  return parseMessagePayload(plaintext, { envelope, now });
}
