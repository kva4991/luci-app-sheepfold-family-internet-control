/*
 * Проверяет без сети жизненный цикл будущей заявки техподдержки: MFA gate,
 * одноразовый код, пять ошибок, независимые сроки 72/24 часа, reboot без
 * автоматического входа и локальный отзыв при недоступном сервере. Симулятор
 * не является production backend и не открывает SSH/FRP/firewall. §rsup001 §testwhy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ProtocolError } from '../tools/remoteSupport/protocolModel.mjs';
import { SupportSessionSimulator } from '../tools/remoteSupport/sessionSimulator.mjs';

const idFor = (byte) => Buffer.alloc(16, byte).toString('base64url');
const baseNow = 1787421000;

function createSimulator() {
  return new SupportSessionSimulator({
    routerId: idFor(0x11),
    claimId: idFor(0x22),
    sessionId: idFor(0x33),
    pepper: Buffer.alloc(32, 0x44),
    lookupKey: Buffer.alloc(32, 0x55),
  });
}

function expectCode(action, code) {
  assert.throws(action, (error) => error instanceof ProtocolError && error.code === code);
}

function openSimulator(code = '482173061594') {
  const sim = createSimulator();
  sim.enable(baseNow);
  assert.equal(sim.openClaim({ code, now: baseNow }), code);
  return sim;
}

function acceptSimulator(sim, now = baseNow + 60) {
  return sim.submitCode({
    code: '482173061594',
    now,
    authenticated: true,
    mfaPassed: true,
    caseId: 'SUP-2026-0001',
    routePort: 43117,
  });
}

describe('remote-support claim/session simulator §rsup001', () => {
  it('stores only keyed server verifiers and hides the private route from status', () => {
    const sim = openSimulator();
    assert.deepEqual(sim.secretAudit(), {
      serverStoresPlainCode: false,
      verifierBytes: 32,
      lookupTagBytes: 32,
      privateRouteAssigned: false,
    });
    assert.doesNotMatch(JSON.stringify(sim.status()), /482173061594|43117|verifier|lookupTag/);

    acceptSimulator(sim);
    assert.equal(sim.displayCode(), null);
    assert.equal(sim.secretAudit().privateRouteAssigned, true);
    assert.doesNotMatch(JSON.stringify(sim.status()), /482173061594|43117|verifier|lookupTag/);
  });

  it('requires authenticated support with MFA without consuming the owner claim', () => {
    const sim = openSimulator();
    expectCode(() => sim.submitCode({
      code: '482173061594',
      now: baseNow + 1,
      authenticated: true,
      mfaPassed: false,
      caseId: 'SUP-2026-0001',
      routePort: 43117,
    }), 'securityBlocked');
    assert.equal(sim.status().claimState, 'open');
    assert.equal(sim.status().attemptsUsed, 0);
  });

  it('burns a claim after five wrong codes and never revives it', () => {
    const sim = openSimulator();
    for (let attempt = 1; attempt < 5; attempt += 1) {
      expectCode(() => sim.submitCode({
        code: `00000000000${attempt}`,
        now: baseNow + attempt,
        authenticated: true,
        mfaPassed: true,
        caseId: 'SUP-2026-0001',
        routePort: 43117,
      }), 'claimCodeInvalid');
    }
    expectCode(() => sim.submitCode({
      code: '000000000005',
      now: baseNow + 5,
      authenticated: true,
      mfaPassed: true,
      caseId: 'SUP-2026-0001',
      routePort: 43117,
    }), 'claimAttemptsExceeded');
    expectCode(() => acceptSimulator(sim, baseNow + 6), 'claimAttemptsExceeded');
    assert.equal(sim.status().state, 'claimBlocked');
    assert.equal(sim.displayCode(), null);
  });

  it('accepts one claim once and opens access only after a new SSH handshake', () => {
    const sim = openSimulator();
    const accepted = acceptSimulator(sim);
    assert.equal(accepted.state, 'sessionPreparing');
    assert.equal(accepted.localAccessOpen, false);
    assert.equal(accepted.accessExpiresAt - accepted.accessStartsAt, 24 * 60 * 60);
    expectCode(() => acceptSimulator(sim, baseNow + 61), 'claimAlreadyUsed');

    sim.markTransportReady(baseNow + 62);
    const active = sim.confirmSsh(baseNow + 63);
    assert.equal(active.state, 'sessionActive');
    assert.equal(active.localAccessOpen, true);
  });

  it('does not extend access after heartbeat, reconnect or reboot', () => {
    const sim = openSimulator();
    const accepted = acceptSimulator(sim);
    const deadline = accepted.accessExpiresAt;
    sim.markTransportReady(baseNow + 62);
    sim.confirmSsh(baseNow + 63);
    assert.equal(sim.heartbeat(baseNow + 3600).accessExpiresAt, deadline);
    sim.loseTransport(baseNow + 3700);
    assert.equal(sim.markTransportReady(baseNow + 3800).accessExpiresAt, deadline);
    sim.confirmSsh(baseNow + 3801);

    const rebooted = sim.reboot({ now: baseNow + 3900, serverAvailable: false });
    assert.equal(rebooted.state, 'reconnecting');
    assert.equal(rebooted.localAccessOpen, false);
    assert.equal(rebooted.accessExpiresAt, deadline);
    expectCode(() => sim.markTransportReady(baseNow + 3901), 'stateConflict');
    expectCode(() => sim.restoreAcceptedSession({
      now: baseNow + 3902,
      serverConfirmed: false,
    }), 'stateConflict');
    sim.restoreAcceptedSession({ now: baseNow + 3903, serverConfirmed: true });
    sim.markTransportReady(baseNow + 3904);
    assert.equal(sim.confirmSsh(baseNow + 3905).accessExpiresAt, deadline);
  });

  it('keeps an expired claim closed even if reported time moves backwards', () => {
    const sim = openSimulator();
    sim.tick(baseNow + (72 * 60 * 60));
    assert.equal(sim.status().state, 'claimExpired');
    expectCode(() => acceptSimulator(sim, baseNow + 10), 'claimExpired');
  });

  it('cancels an unclaimed code when volatile router state is lost on reboot', () => {
    const sim = openSimulator();
    const rebooted = sim.reboot({ now: baseNow + 30, serverAvailable: false });
    assert.equal(rebooted.state, 'revoked');
    assert.equal(rebooted.claimState, 'revoked');
    assert.equal(rebooted.serverRevokePending, true);
    assert.equal(sim.displayCode(), null);
    expectCode(() => acceptSimulator(sim, baseNow + 31), 'claimNotOpen');
  });

  it('closes the router first when the server is unavailable and syncs later', () => {
    const sim = openSimulator();
    acceptSimulator(sim);
    sim.markTransportReady(baseNow + 62);
    sim.confirmSsh(baseNow + 63);

    const revoked = sim.revoke({ now: baseNow + 64, serverAvailable: false });
    assert.equal(revoked.state, 'revoked');
    assert.equal(revoked.localAccessOpen, false);
    assert.equal(revoked.serverRevokePending, true);
    assert.equal(revoked.serverRouteOpen, true);

    const synced = sim.syncServerRevoke(baseNow + 120);
    assert.equal(synced.serverRevokePending, false);
    assert.equal(synced.serverRouteOpen, false);
  });

  it('keeps logs free from the code, verifier and internal route port', () => {
    const sim = openSimulator();
    acceptSimulator(sim);
    sim.markTransportReady(baseNow + 62);
    sim.confirmSsh(baseNow + 63);
    const events = JSON.stringify(sim.events());
    assert.doesNotMatch(events, /482173061594|43117|verifier|lookupTag/);
    assert.match(events, /SUP-2026-0001/);
    assert.match(events, /Sheepfold Support/);
  });
});
