export const protocolVersion = 1;
export const cryptoSuite = 'HMAC-SHA256+AES-256-GCM';
export const maxEnvelopeBytes = 16 * 1024;
export const maxPlaintextBytes = 8 * 1024;
export const commandTtlSeconds = 120;
export const commandResultTtlSeconds = 24 * 60 * 60;
export const notificationTtlSeconds = 24 * 60 * 60;
export const clockSkewSeconds = 60;
export const maxSafeSequence = Number.MAX_SAFE_INTEGER;
export const temporaryAccessMaxSeconds = 24 * 60 * 60;

export const directions = Object.freeze(['phoneToRouter', 'routerToPhone']);
export const messageClasses = Object.freeze(['command', 'commandResult', 'notification']);
export const messageTypes = Object.freeze(['command', 'commandResult', 'notification']);
export const commandActions = Object.freeze([
  'globalInternetSet',
  'temporaryAccessGrant',
]);
export const commandResultStatuses = Object.freeze([
  'executed',
  'rejected',
  'expired',
  'indeterminate',
]);
export const commandResultErrorCodes = Object.freeze([
  'actionRejected',
  'administratorDeviceUnbound',
  'clockInvalid',
  'commandExpired',
  'deviceBlocked',
  'deviceNotFound',
  'deviceQuarantined',
  'stateIndeterminate',
]);

export const envelopeFields = Object.freeze([
  'protocolVersion',
  'cryptoSuite',
  'direction',
  'messageClass',
  'routerId',
  'phoneId',
  'streamId',
  'messageId',
  'sequence',
  'issuedAt',
  'expiresAt',
  'keyId',
  'ciphertext',
]);

export const payloadFields = Object.freeze([
  'schemaVersion',
  'messageType',
  'action',
  'actionHash',
  'requestMessageId',
  'body',
]);

export const idPattern = /^[A-Za-z0-9_-]{22}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export class MessageRelayProtocolError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MessageRelayProtocolError';
    this.code = code;
  }
}

export function fail(code, detail) {
  throw new MessageRelayProtocolError(code, detail);
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireRecord(value, label) {
  if (!isRecord(value)) fail('messageMalformed', `${label} must be an object`);
}

export function requireExactKeys(value, expected, label) {
  requireRecord(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('messageMalformed', `${label} has unknown or missing fields`);
  }
}

export function requireSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) {
    fail('messageMalformed', `${label} is outside the interoperable JSON integer range`);
  }
}

export function decodeBase64Url(value, label, expectedBytes = null) {
  if (typeof value !== 'string' || !base64UrlPattern.test(value) || value.includes('=')) {
    fail('messageMalformed', `${label} is not canonical base64url`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    fail('messageMalformed', `${label} is not canonical base64url`);
  }
  if (expectedBytes !== null && decoded.length !== expectedBytes) {
    fail('messageMalformed', `${label} has the wrong byte length`);
  }
  return decoded;
}

export function requireId(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    fail('messageMalformed', `${label} must encode exactly 128 bits`);
  }
  decodeBase64Url(value, label, 16);
}
