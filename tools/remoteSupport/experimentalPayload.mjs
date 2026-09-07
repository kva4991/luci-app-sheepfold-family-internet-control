/*
 * Строгие предметные проверки экспериментального control-профиля §rsup001
 * Дополняют общую подпись, но не доказывают TLS, local consent или готовность SSH
 */
import { createHash } from 'node:crypto';
import { validatePayload } from './signedEnvelope.mjs';
import { decodeBase64Url, fail, requireExactKeys, requireTime } from './protocolValues.mjs';

export const controlProfile = 'sheepfold-support-server-experimental-1';
export const clientCapabilities = Object.freeze(['claimV1', 'localRevokeV1']);
const allCapabilities = [...clientCapabilities, 'mutualTlsTransportV1', 'typedGatewayV1', 'safeApplyV1', 'transportCredentialsV1'];
export const terminalStates = Object.freeze([
  'claimBlocked', 'claimExpired', 'revoked', 'sessionExpired', 'securityBlocked',
]);
const statusFields = [
  'sessionId', 'state', 'claimExpiresAt', 'accessExpiresAt', 'leaseExpiresAt', 'ticketId',
];
export const routerFields = Object.freeze({
  enrollProof: ['challenge', 'clientNonce'],
  capabilityReport: ['profile', 'capabilities'],
  claimOpen: ['sessionId', 'code', 'claimExpiresAt', 'routerHostKey', 'diagnosticsAllowed'],
  sessionReady: ['sessionId', 'leaseId', 'bootId'],
  heartbeat: ['sessionId', 'leaseId', 'bootId'],
  revokeRequest: ['sessionId'],
  statusQuery: ['sessionId'],
});

export function identityKeyId(rawPublicKey) {
  const bytes = decodeBase64Url(rawPublicKey, 'identity public key', 32);
  return 'router-' + createHash('sha256').update(bytes).digest('hex').slice(0, 40);
}

export function requireSshKey(value) {
  if (typeof value !== 'string' || !/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(value)) {
    fail('messageMalformed', 'invalid SSH host key');
  }
  const bytes = Buffer.from(value.slice(12), 'base64');
  const prefix = '0000000b7373682d6564323535313900000020';
  if (bytes.length !== 51 || bytes.toString('base64') !== value.slice(12) ||
      bytes.subarray(0, 19).toString('hex') !== prefix) {
    fail('messageMalformed', 'invalid SSH host key');
  }
}

function requireCapabilities(value, allowed) {
  if (value.profile !== controlProfile || !Array.isArray(value.capabilities) ||
      value.capabilities.length > allowed.length ||
      new Set(value.capabilities).size !== value.capabilities.length ||
      value.capabilities.some((entry) => !allowed.includes(entry))) {
    fail('protocolUnsupported', 'unsupported capability profile');
  }
}

function requireSession(message) {
  decodeBase64Url(message.payload.sessionId, 'sessionId', 16);
  if (message.streamId !== message.payload.sessionId) fail('stateConflict', 'wrong session stream');
}

export function validateRouterMessage(message) {
  validatePayload(message);
  if (!Object.hasOwn(routerFields, message.messageType)) fail('protocolUnsupported');
  const value = message.payload;
  requireExactKeys(value, routerFields[message.messageType], 'router payload');
  if ('sessionId' in value) requireSession(message);
  switch (message.messageType) {
    case 'enrollProof':
      decodeBase64Url(value.challenge, 'challenge', 32);
      decodeBase64Url(value.clientNonce, 'clientNonce', 16);
      break;
    case 'capabilityReport':
      requireCapabilities(value, allCapabilities);
      break;
    case 'claimOpen':
      if (typeof value.code !== 'string' || !/^[0-9]{12}$/.test(value.code) ||
          typeof value.diagnosticsAllowed !== 'boolean') fail('messageMalformed');
      requireTime(value.claimExpiresAt, 'claimExpiresAt');
      requireSshKey(value.routerHostKey);
      break;
    case 'sessionReady':
    case 'heartbeat':
      decodeBase64Url(value.leaseId, 'leaseId', 16);
      decodeBase64Url(value.bootId, 'bootId', 16);
      break;
  }
  return message;
}

function validateStatus(message) {
  const value = message.payload;
  requireExactKeys(value, statusFields, 'server status');
  requireSession(message);
  if (!['claimOpen', 'sessionPreparing', ...terminalStates].includes(value.state)) {
    // Без согласованной lease обычный status не может заявить активный транспорт
    fail('protocolUnsupported', 'transport is not implemented by this profile');
  }
  requireTime(value.claimExpiresAt, 'claimExpiresAt');
  if (value.accessExpiresAt !== null) requireTime(value.accessExpiresAt, 'accessExpiresAt');
  if (value.leaseExpiresAt !== null && value.leaseExpiresAt !== 0) fail('messageMalformed');
  if (value.ticketId !== null &&
      (typeof value.ticketId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.ticketId))) {
    fail('messageMalformed');
  }
  if (value.state === 'claimOpen' && (value.accessExpiresAt !== null || value.ticketId !== null)) {
    fail('stateConflict');
  }
  if (value.state === 'sessionPreparing' && (value.accessExpiresAt === null || value.ticketId === null)) {
    fail('stateConflict');
  }
  if (message.messageType === 'claimOpened' && value.state !== 'claimOpen') fail('stateConflict');
  if (message.messageType === 'revokeConfirmed' && !terminalStates.includes(value.state)) fail('stateConflict');
}

export function validateServerMessage(message) {
  validatePayload(message);
  const value = message.payload;
  switch (message.messageType) {
    case 'enrollChallenge':
      requireExactKeys(value, ['challenge', 'clientNonce', 'candidateKeyId', 'profile'], 'challenge');
      decodeBase64Url(value.challenge, 'challenge', 32);
      decodeBase64Url(value.clientNonce, 'clientNonce', 16);
      if (!/^router-[a-f0-9]{40}$/.test(value.candidateKeyId ?? '') ||
          value.profile !== controlProfile) fail('messageMalformed');
      break;
    case 'enrollAccepted':
      requireExactKeys(value, ['routerId', 'keyId', 'profile'], 'enrollment result');
      if (value.routerId !== message.routerId || !/^router-[a-f0-9]{40}$/.test(value.keyId ?? '') ||
          value.profile !== controlProfile) fail('stateConflict');
      break;
    case 'statusQuery':
      if (Object.hasOwn(value, 'capabilities')) {
        requireExactKeys(value, ['profile', 'capabilities'], 'server capabilities');
        requireCapabilities(value, ['claimV1']);
        break;
      }
      validateStatus(message);
      break;
    case 'claimOpened':
    case 'revokeConfirmed':
      validateStatus(message);
      break;
    default:
      fail('protocolUnsupported', 'unsupported server message');
  }
  return message;
}
