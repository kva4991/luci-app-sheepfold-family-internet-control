import { createHash } from 'node:crypto';

import { parseStrictJson } from './strictJson.mjs';
import {
  commandActions,
  commandResultErrorCodes,
  commandResultStatuses,
  decodeBase64Url,
  fail,
  messageTypes,
  payloadFields,
  requireExactKeys,
  requireId,
  requireRecord,
  requireSafeInteger,
  temporaryAccessMaxSeconds,
} from './protocolValues.mjs';

const actionHashContext = Buffer.from('SFMR1/actionHash\0', 'ascii');
const commandResultErrorsByStatus = Object.freeze({
  executed: Object.freeze([null]),
  rejected: Object.freeze([
    'actionRejected',
    'administratorDeviceUnbound',
    'clockInvalid',
    'deviceBlocked',
    'deviceNotFound',
    'deviceQuarantined',
  ]),
  expired: Object.freeze(['commandExpired']),
  indeterminate: Object.freeze(['stateIndeterminate']),
});

function hasInvalidSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function canonicalString(value) {
  if (value.includes('\0')) fail('messageMalformed', 'canonical JSON rejects NUL');
  if (hasInvalidSurrogate(value)) fail('messageMalformed', 'canonical JSON rejects unpaired unicode surrogates');
  return JSON.stringify(value);
}

function canonicalValue(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return canonicalString(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('messageMalformed', 'canonical JSON accepts safe integers only');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  requireRecord(value, 'canonical JSON value');
  return `{${Object.keys(value).sort().map((key) => `${canonicalString(key)}:${canonicalValue(value[key])}`).join(',')}}`;
}

export function canonicalJson(value) {
  return canonicalValue(value);
}

export function buildActionHash(action, body) {
  const bytes = Buffer.from(canonicalJson({ action, body }), 'utf8');
  return createHash('sha256').update(actionHashContext).update(bytes).digest('base64url');
}

function validateCommandBody(action, body, { envelope = null, now = null } = {}) {
  requireRecord(body, 'command body');
  if (action === 'globalInternetSet') {
    requireExactKeys(body, ['internetEnabled'], 'globalInternetSet body');
    if (typeof body.internetEnabled !== 'boolean') fail('messageMalformed', 'internetEnabled must be boolean');
    return;
  }
  if (action === 'temporaryAccessGrant') {
    requireExactKeys(body, ['deviceMac', 'grantUntil'], 'temporaryAccessGrant body');
    if (typeof body.deviceMac !== 'string' || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(body.deviceMac)) {
      fail('messageMalformed', 'deviceMac must use canonical uppercase notation');
    }
    requireSafeInteger(body.grantUntil, 'grantUntil', 1);
    if (envelope !== null) {
      requireSafeInteger(now, 'now');
      if (body.grantUntil <= envelope.issuedAt) {
        fail('messageMalformed', 'temporary access deadline must follow envelope issuance');
      }
      if (body.grantUntil <= now) fail('messageExpired', 'temporary access deadline has passed');
      if (body.grantUntil - envelope.issuedAt > temporaryAccessMaxSeconds) {
        fail('messageMalformed', 'temporary access deadline exceeds one day');
      }
    }
  }
}

function validateCommandResultBody(body) {
  requireExactKeys(body, ['status', 'errorCode', 'completedAt'], 'commandResult body');
  if (!commandResultStatuses.includes(body.status)) fail('messageMalformed', 'result status is invalid');
  if (body.errorCode !== null && !commandResultErrorCodes.includes(body.errorCode)) {
    fail('messageMalformed', 'result errorCode is invalid');
  }
  if (!commandResultErrorsByStatus[body.status].includes(body.errorCode)) {
    fail('messageMalformed', 'result status and errorCode do not match');
  }
  requireSafeInteger(body.completedAt, 'commandResult completedAt');
}

export function validateMessagePayload(value, { envelope = null, now = null } = {}) {
  requireExactKeys(value, payloadFields, 'message payload');
  if (value.schemaVersion !== 1) fail('protocolUnsupported', 'unsupported payload schema');
  if (!messageTypes.includes(value.messageType)) fail('protocolUnsupported', 'unsupported message type');
  requireRecord(value.body, 'message body');
  if (envelope !== null && value.messageType !== envelope.messageClass) {
    fail('messageMalformed', 'payload type does not match envelope class');
  }

  if (value.messageType === 'command') {
    if (!commandActions.includes(value.action)) fail('actionUnsupported', 'command is not allowlisted');
    if (value.requestMessageId !== null) fail('messageMalformed', 'command cannot reference another message');
    decodeBase64Url(value.actionHash, 'actionHash', 32);
    validateCommandBody(value.action, value.body, { envelope, now });
    if (buildActionHash(value.action, value.body) !== value.actionHash) {
      fail('actionHashMismatch', 'command body differs from actionHash');
    }
    return value;
  }

  if (value.messageType === 'commandResult') {
    if (!commandActions.includes(value.action)) fail('actionUnsupported', 'result action is not allowlisted');
    requireId(value.requestMessageId, 'requestMessageId');
    decodeBase64Url(value.actionHash, 'actionHash', 32);
    validateCommandResultBody(value.body);
    return value;
  }

  if (value.action !== null || value.actionHash !== null || value.requestMessageId !== null) {
    fail('messageMalformed', 'notification cannot contain command identity');
  }
  requireExactKeys(
    value.body,
    ['notificationId', 'category', 'title', 'message', 'createdAt'],
    'notification body',
  );
  requireId(value.body.notificationId, 'notificationId');
  requireSafeInteger(value.body.createdAt, 'notification createdAt');
  for (const field of ['category', 'title', 'message']) {
    if (typeof value.body[field] !== 'string'
        || value.body[field].length === 0
        || value.body[field].length > (field === 'message' ? 2048 : 128)) {
      fail('messageMalformed', `notification ${field} is invalid`);
    }
  }
  return value;
}

export function parseMessagePayload(bytes, context = {}) {
  return validateMessagePayload(parseStrictJson(bytes), context);
}
