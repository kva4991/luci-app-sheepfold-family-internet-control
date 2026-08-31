/*
 * Строгий экспериментальный CSR/grant-контракт временной техподдержки §rsup001
 * Вход: уже подписанное сообщение, выход: проверенные поля без сетевых или файловых действий
 * DER framing не заменяет серверную проверку CSR proof-of-possession и клиентскую проверку X.509
 */
import { validatePayload } from './signedEnvelope.mjs';
import { decodeBase64Url, fail, requireExactKeys, requireTime } from './protocolValues.mjs';

export const transportProfile = 'sheepfold-support-transport-experimental-1';
export const transportCapability = 'transportCredentialsV1';
const requestFields = ['profile', 'sessionId', 'csrDer'];
const grantFields = ['profile', 'sessionId', 'csrSha256', 'leaseId', 'accessExpiresAt',
  'leaseExpiresAt', 'certificateDer', 'proxyName', 'proxyPort', 'token'];

function exactPlain(value, fields) {
  requireExactKeys(value, fields, 'transport payload');
  if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((field) => !('value' in field))) {
    fail('messageMalformed');
  }
}

export function decodeTransportDer(value) {
  if (typeof value !== 'string' || value.length > 5462) { fail('messageMalformed'); }
  const bytes = decodeBase64Url(value, 'transport DER');
  if (bytes.length < 2 || bytes.length > 4096 || bytes[0] !== 0x30) { fail('messageMalformed'); }
  let header = 2; let length = bytes[1];
  if (length >= 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 2 || bytes.length <= 2 + count || bytes[2] === 0) { fail('messageMalformed'); }
    header += count; length = 0;
    for (let index = 2; index < header; index++) { length = length * 256 + bytes[index]; }
    if (length < 128 || (count === 2 && length < 256)) { fail('messageMalformed'); }
  }
  if (length === 0 || length + header !== bytes.length) { fail('messageMalformed'); }
  return bytes;
}

export function validateTransportMessage(message) {
  validatePayload(message);
  if (!['transportRequest', 'transportGrant'].includes(message.messageType)) { fail('protocolUnsupported'); }
  const value = message.payload;
  exactPlain(value, message.messageType === 'transportRequest' ? requestFields : grantFields);
  decodeBase64Url(value.sessionId, 'sessionId', 16);
  if (value.profile !== transportProfile || message.streamId === value.sessionId || message.sequence !== 0 ||
      message.expiresAt - message.issuedAt > 60) { fail('messageMalformed'); }
  if (message.messageType === 'transportRequest') {
    decodeTransportDer(value.csrDer);
    return message;
  }
  decodeBase64Url(value.leaseId, 'leaseId', 16);
  decodeTransportDer(value.certificateDer);
  requireTime(value.accessExpiresAt, 'accessExpiresAt'); requireTime(value.leaseExpiresAt, 'leaseExpiresAt');
  if (typeof value.csrSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.csrSha256) ||
      typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) ||
      typeof value.proxyName !== 'string' || !/^support-[a-f0-9]{32}$/.test(value.proxyName) ||
      !Number.isInteger(value.proxyPort) || value.proxyPort < 1024 || value.proxyPort > 65535 ||
      value.accessExpiresAt > message.issuedAt + 86400 ||
      value.leaseExpiresAt <= message.issuedAt || value.leaseExpiresAt > message.issuedAt + 120 ||
      value.leaseExpiresAt > value.accessExpiresAt || message.expiresAt > value.leaseExpiresAt) {
    fail('messageMalformed');
  }
  return message;
}
