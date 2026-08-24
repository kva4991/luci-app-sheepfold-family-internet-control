import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import {
  ProtocolError,
  accessLifeSec,
  advanceState,
  claimLifeSec,
  createAccessDeadline,
  createClaimDeadline,
} from './protocolModel.mjs';

const idPattern = /^[A-Za-z0-9_-]{22}$/;
const codePattern = /^\d{12}$/;
const casePattern = /^[A-Za-z0-9._-]{1,64}$/;
const activeStates = new Set([
  'sessionPreparing',
  'sessionReady',
  'sessionActive',
  'reconnecting',
  'failingOver',
]);

function protocolFail(code, detail) {
  throw new ProtocolError(code, detail);
}

function requireId(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    protocolFail('messageMalformed', `${label} must encode 128 bits`);
  }
}

function requireSecret(value, label) {
  const secret = Buffer.from(value);
  if (secret.length < 32) {
    protocolFail('internalError', `${label} must contain at least 256 bits`);
  }
  return secret;
}

function makeDigest(secret, purpose, claimId, code) {
  return createHmac('sha256', secret)
    .update('SheepfoldRemoteSupportClaim\0', 'ascii')
    .update(purpose, 'ascii')
    .update('\0', 'ascii')
    .update(claimId, 'ascii')
    .update('\0', 'ascii')
    .update(code, 'ascii')
    .digest();
}

export class SupportSessionSimulator {
  #routerId;
  #claimId;
  #sessionId;
  #pepper;
  #lookupKey;
  #routerCode = null;
  #verifier = null;
  #lookupTag = null;
  #routePort = null;
  #state = 'disabled';
  #claimState = 'none';
  #attempts = 0;
  #claimExpiresAt = null;
  #accessStartsAt = null;
  #accessExpiresAt = null;
  #maxServerTime = 0;
  #caseId = null;
  #tempKeyInstalled = false;
  #transportReady = false;
  #localAccessOpen = false;
  #serverRouteOpen = false;
  #serverRevokePending = false;
  #events = [];

  constructor({ routerId, claimId, sessionId, pepper, lookupKey }) {
    requireId(routerId, 'routerId');
    requireId(claimId, 'claimId');
    requireId(sessionId, 'sessionId');
    this.#routerId = routerId;
    this.#claimId = claimId;
    this.#sessionId = sessionId;
    this.#pepper = requireSecret(pepper, 'pepper');
    this.#lookupKey = requireSecret(lookupKey, 'lookupKey');
  }

  #serverNow(now) {
    createClaimDeadline(now);
    this.#maxServerTime = Math.max(this.#maxServerTime, now);
    return this.#maxServerTime;
  }

  #record(type, at, extra = {}) {
    this.#events.push(Object.freeze({
      type,
      at,
      routerId: this.#routerId,
      sessionId: this.#sessionId,
      ...extra,
    }));
  }

  #clearClaimSecrets() {
    this.#routerCode = null;
    this.#verifier = null;
    this.#lookupTag = null;
  }

  #closeLocalAccess() {
    this.#tempKeyInstalled = false;
    this.#transportReady = false;
    this.#localAccessOpen = false;
  }

  #closeServerRoute() {
    this.#serverRouteOpen = false;
    this.#serverRevokePending = false;
    this.#routePort = null;
  }

  enable(now) {
    const effectiveNow = this.#serverNow(now);
    this.#state = advanceState(this.#state, 'enable');
    this.#record('moduleEnabled', effectiveNow);
    return this.status();
  }

  openClaim({ code, now }) {
    const effectiveNow = this.#serverNow(now);
    if (!codePattern.test(code)) {
      protocolFail('internalError', 'claim code must contain 12 digits');
    }
    this.#state = advanceState(this.#state, 'openClaim');
    this.#routerCode = code;
    this.#verifier = makeDigest(this.#pepper, 'verifier', this.#claimId, code);
    this.#lookupTag = makeDigest(this.#lookupKey, 'lookup', this.#claimId, code);
    this.#claimExpiresAt = createClaimDeadline(effectiveNow);
    this.#claimState = 'open';
    this.#state = advanceState(this.#state, 'claimOpened');
    this.#record('claimOpened', effectiveNow, { claimExpiresAt: this.#claimExpiresAt });
    return this.displayCode();
  }

  displayCode() {
    return this.#state === 'claimOpen' ? this.#routerCode : null;
  }

  submitCode({ code, now, authenticated, mfaPassed, caseId, routePort }) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    if (!authenticated || !mfaPassed) {
      protocolFail('securityBlocked', 'support account and MFA are required');
    }
    if (!casePattern.test(caseId || '')) {
      protocolFail('messageMalformed', 'invalid support case id');
    }
    if (!Number.isInteger(routePort) || routePort < 1024 || routePort > 65535) {
      protocolFail('messageMalformed', 'invalid private route port');
    }
    if (this.#claimState === 'blocked') {
      protocolFail('claimAttemptsExceeded', 'claim is permanently blocked');
    }
    if (this.#claimState === 'expired') {
      protocolFail('claimExpired', 'claim deadline has passed');
    }
    if (this.#claimState === 'claimed') {
      protocolFail('claimAlreadyUsed', 'claim was already consumed');
    }
    if (this.#claimState !== 'open' || !this.#verifier) {
      protocolFail('claimNotOpen', 'claim is not open');
    }

    const candidate = codePattern.test(code || '')
      ? makeDigest(this.#pepper, 'verifier', this.#claimId, code)
      : Buffer.alloc(this.#verifier.length);
    if (!timingSafeEqual(candidate, this.#verifier)) {
      this.#attempts += 1;
      if (this.#attempts >= 5) {
        this.#claimState = 'blocked';
        this.#state = advanceState(this.#state, 'attemptsExceeded');
        this.#clearClaimSecrets();
        this.#record('claimBlocked', effectiveNow, { errorCode: 'claimAttemptsExceeded' });
        protocolFail('claimAttemptsExceeded', 'five invalid attempts consumed the claim');
      }
      this.#record('claimRejected', effectiveNow, { errorCode: 'claimCodeInvalid' });
      protocolFail('claimCodeInvalid', 'claim code was not accepted');
    }

    this.#claimState = 'claimed';
    this.#caseId = caseId;
    this.#routePort = routePort;
    this.#accessStartsAt = effectiveNow;
    this.#accessExpiresAt = createAccessDeadline(effectiveNow);
    this.#serverRouteOpen = true;
    this.#tempKeyInstalled = true;
    this.#state = advanceState(this.#state, 'claimAccepted');
    this.#clearClaimSecrets();
    this.#record('claimAccepted', effectiveNow, {
      caseId,
      actor: 'Sheepfold Support',
      accessExpiresAt: this.#accessExpiresAt,
    });
    return this.status();
  }

  markTransportReady(now) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    if (!this.#tempKeyInstalled || !this.#serverRouteOpen) {
      protocolFail('stateConflict', 'accepted key and private server route are required');
    }
    this.#state = advanceState(this.#state, 'transportReady');
    this.#transportReady = true;
    this.#record('sessionReady', effectiveNow);
    return this.status();
  }

  confirmSsh(now) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    if (!this.#serverRouteOpen || !this.#tempKeyInstalled || !this.#transportReady) {
      protocolFail('stateConflict', 'route, key and transport are required');
    }
    this.#state = advanceState(this.#state, 'sshConfirmed');
    this.#localAccessOpen = true;
    this.#record('sessionActive', effectiveNow, {
      caseId: this.#caseId,
      actor: 'Sheepfold Support',
    });
    return this.status();
  }

  heartbeat(now) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    this.#record('heartbeat', effectiveNow, { state: this.#state });
    return this.status();
  }

  loseTransport(now) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    this.#state = advanceState(this.#state, 'transportLost');
    this.#transportReady = false;
    this.#localAccessOpen = false;
    this.#record('transportLost', effectiveNow);
    return this.status();
  }

  reboot({ now, serverAvailable }) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    if (this.#state === 'claimOpen') {
      this.#claimState = 'revoked';
      this.#state = 'revoked';
      this.#clearClaimSecrets();
      this.#serverRevokePending = true;
      this.#record('claimCancelledByRestart', effectiveNow, {
        serverAvailable: Boolean(serverAvailable),
      });
      if (serverAvailable) {
        this.#closeServerRoute();
      }
      return this.status();
    }
    this.#closeLocalAccess();
    if (activeStates.has(this.#state)) {
      this.#state = 'reconnecting';
    }
    this.#record('routerRestarted', effectiveNow, {
      serverAvailable: Boolean(serverAvailable),
      accessRestored: false,
    });
    return this.status();
  }

  restoreAcceptedSession({ now, serverConfirmed }) {
    const effectiveNow = this.#serverNow(now);
    this.tick(effectiveNow);
    if (this.#state !== 'reconnecting' || !serverConfirmed || !this.#serverRouteOpen) {
      protocolFail('stateConflict', 'signed server confirmation is required after reboot');
    }
    this.#tempKeyInstalled = true;
    this.#record('sessionRestoreAuthorized', effectiveNow, {
      accessExpiresAt: this.#accessExpiresAt,
    });
    return this.status();
  }

  revoke({ now, serverAvailable }) {
    const effectiveNow = this.#serverNow(now);
    if (this.#state === 'revoked') {
      return this.status();
    }
    this.#clearClaimSecrets();
    this.#closeLocalAccess();
    this.#claimState = 'revoked';
    if (serverAvailable) {
      this.#closeServerRoute();
    } else {
      this.#serverRevokePending = this.#serverRouteOpen;
    }
    this.#state = 'revoked';
    this.#record('sessionRevoked', effectiveNow, {
      serverConfirmed: Boolean(serverAvailable),
    });
    return this.status();
  }

  syncServerRevoke(now) {
    const effectiveNow = this.#serverNow(now);
    if (this.#state !== 'revoked' || !this.#serverRevokePending) {
      protocolFail('stateConflict', 'no pending server revoke exists');
    }
    this.#closeServerRoute();
    this.#record('serverRevokeConfirmed', effectiveNow);
    return this.status();
  }

  tick(now) {
    const effectiveNow = this.#serverNow(now);
    if (this.#claimState === 'open' && effectiveNow >= this.#claimExpiresAt) {
      this.#claimState = 'expired';
      this.#state = 'claimExpired';
      this.#clearClaimSecrets();
      this.#record('claimExpired', effectiveNow, { errorCode: 'claimExpired' });
    }
    if (activeStates.has(this.#state)
      && this.#accessExpiresAt !== null
      && effectiveNow >= this.#accessExpiresAt) {
      this.#state = 'sessionExpired';
      this.#claimState = 'expired';
      this.#clearClaimSecrets();
      this.#closeLocalAccess();
      this.#closeServerRoute();
      this.#record('sessionExpired', effectiveNow, { errorCode: 'sessionExpired' });
    }
    return this.status();
  }

  secretAudit() {
    return Object.freeze({
      serverStoresPlainCode: false,
      verifierBytes: this.#verifier?.length || 0,
      lookupTagBytes: this.#lookupTag?.length || 0,
      privateRouteAssigned: this.#routePort !== null,
    });
  }

  events() {
    return this.#events.map((event) => ({ ...event }));
  }

  status() {
    return Object.freeze({
      routerId: this.#routerId,
      sessionId: this.#sessionId,
      state: this.#state,
      claimState: this.#claimState,
      attemptsUsed: this.#attempts,
      attemptsLeft: Math.max(0, 5 - this.#attempts),
      claimExpiresAt: this.#claimExpiresAt,
      accessStartsAt: this.#accessStartsAt,
      accessExpiresAt: this.#accessExpiresAt,
      caseId: this.#caseId,
      transportReady: this.#transportReady,
      localAccessOpen: this.#localAccessOpen,
      serverRouteOpen: this.#serverRouteOpen,
      serverRevokePending: this.#serverRevokePending,
      claimLifeSec,
      accessLifeSec,
    });
  }
}
