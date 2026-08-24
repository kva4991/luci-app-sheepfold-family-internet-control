import { randomBytes } from 'node:crypto';

import {
  accessLifeSec,
  claimLifeSec,
  fail,
  requireTime,
  sessionStates,
} from './protocolValues.mjs';

const stateChanges = Object.freeze({
  disabled: Object.freeze({ enable: 'moduleReady' }),
  moduleReady: Object.freeze({ noWan: 'waitingForWan', openClaim: 'claimOpening' }),
  waitingForWan: Object.freeze({ wanReady: 'moduleReady' }),
  claimOpening: Object.freeze({ claimOpened: 'claimOpen', noWan: 'waitingForWan' }),
  claimOpen: Object.freeze({
    claimAccepted: 'sessionPreparing',
    attemptsExceeded: 'claimBlocked',
    claimDeadline: 'claimExpired',
    revoke: 'revoking',
  }),
  sessionPreparing: Object.freeze({ transportReady: 'sessionReady', revoke: 'revoking' }),
  sessionReady: Object.freeze({ sshConfirmed: 'sessionActive', revoke: 'revoking' }),
  sessionActive: Object.freeze({
    transportLost: 'reconnecting',
    failover: 'failingOver',
    accessDeadline: 'sessionExpired',
    revoke: 'revoking',
  }),
  reconnecting: Object.freeze({ transportReady: 'sessionReady', failover: 'failingOver', revoke: 'revoking' }),
  failingOver: Object.freeze({ transportReady: 'sessionReady', revoke: 'revoking' }),
  revoking: Object.freeze({ revokeDone: 'revoked' }),
});

export function advanceState(currentState, event) {
  if (!sessionStates.includes(currentState)) {
    fail('stateConflict', 'unknown local state');
  }
  if (event === 'securityViolation') {
    return 'securityBlocked';
  }
  const nextState = stateChanges[currentState]?.[event];
  if (!nextState) {
    fail('stateConflict', `event ${event} is forbidden in state ${currentState}`);
  }
  return nextState;
}

export function createClaimDeadline(now) {
  requireTime(now, 'now');
  const deadline = now + claimLifeSec;
  requireTime(deadline, 'claimDeadline');
  return deadline;
}

export function createAccessDeadline(now) {
  requireTime(now, 'now');
  const deadline = now + accessLifeSec;
  requireTime(deadline, 'accessDeadline');
  return deadline;
}

export function preserveDeadline(currentDeadline, proposedDeadline) {
  requireTime(currentDeadline, 'currentDeadline');
  requireTime(proposedDeadline, 'proposedDeadline');
  return Math.min(currentDeadline, proposedDeadline);
}

export function generateClaimCode(randomSource = randomBytes) {
  let code = '';
  let rounds = 0;
  while (code.length < 12) {
    rounds += 1;
    if (rounds > 128) {
      fail('internalError', 'random source did not provide usable bytes');
    }
    const chunk = Buffer.from(randomSource(24));
    if (chunk.length === 0) {
      fail('internalError', 'random source returned no bytes');
    }
    for (const byte of chunk) {
      // Отбрасывание 250..255 устраняет modulo bias для десяти цифр.
      if (byte < 250) {
        code += String(byte % 10);
        if (code.length === 12) {
          break;
        }
      }
    }
  }
  return code;
}
