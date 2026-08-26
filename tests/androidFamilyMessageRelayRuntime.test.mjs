/*
 * Защищает Android-only trust boundaries и disabled-by-default wiring быстрым source-level gate.
 * Почему этот уровень: JVM/Android tests проверяют поведение, а этот тест ловит случайное смешение
 * public system CA с local pin/admin Bearer. Тест только читает source и не меняет состояние.
 * Green не доказывает Keystore, WorkManager, сеть, live peers или физический API 28.
 * §mrelay1 §testwhy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const relayRoot = 'android/app/src/main/java/app/sheepfold/android/relay';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const relay = (name) => read(`${relayRoot}/${name}`);

describe('Android family message relay runtime §mrelay1', () => {
  it('keeps public system-CA transport separate from pinned local credentials', () => {
    const publicClient = relay('PublicMessageRelayHttpsClient.kt');
    const localClient = relay('PinnedLocalMessageRelayTransport.kt');
    assert.match(publicClient, /url\.openConnection\(\) as HttpsURLConnection/);
    assert.doesNotMatch(publicClient, /RouterHttps|tlsPinSha256|tlsSpkiSha256|bearerToken/);
    assert.match(publicClient, /Authorization", "Bearer \$\{secrets\.phoneCredential\}"/);
    assert.match(localClient, /RouterHttps\.open/);
    assert.match(localClient, /allowTrustOnFirstUse = false/);
    assert.match(localClient, /"Content-Type", "application\/json"/);
    assert.doesNotMatch(localClient, /application\/json; charset/);
  });

  it('keeps one exact local-first envelope and closes the timeout race', () => {
    const coordinator = relay('LocalFirstMessageRelayCoordinator.kt');
    const localClient = relay('PinnedLocalMessageRelayTransport.kt');
    assert.match(coordinator, /reserveOutboundSequence[\s\S]*encrypt[\s\S]*enqueueOutbound/);
    const localAttempt = coordinator.indexOf('RelayOutboxStatus.LOCAL_ATTEMPT');
    const localSubmit = coordinator.indexOf('localTransport.submit(attempting.envelopeJson)');
    assert.ok(localAttempt >= 0 && localAttempt < localSubmit);
    assert.match(coordinator, /LocalRelayDelivery\.Unreachable[\s\S]*RelayOutboxStatus\.READY[\s\S]*routeThroughPublic\(ready\)/);
    assert.match(coordinator, /LocalRelayDelivery\.Indeterminate[\s\S]*LOCAL_ATTEMPT remains/);
    assert.match(coordinator, /lookupResult\(messageId\)[\s\S]*LocalRelayLookup\.NoRecord/);
    assert.match(localClient, /localProbeBudgetMillis = 2_500L/);
    assert.match(localClient, /compareAndSet\(LocalPostPhase\.PRE_BODY, LocalPostPhase\.MAY_HAVE_REACHED\)/);
    assert.match(localClient, /LocalPostPhase\.CANCELLED/);
    assert.match(localClient, /canonicalNotFoundResponse/);
    assert.match(localClient, /response\.contentType == "application\/json"/);
  });

  it('binds secrets and state in one Keystore encrypted atomic bundle', () => {
    const connectionStore = relay('MessageRelayConnectionStore.kt');
    const stateStore = relay('MessageRelayStateStore.kt');
    assert.match(connectionStore, /sheepfold-message-relay-secrets-v1/);
    assert.match(connectionStore, /relay-bundle-v1\.bin/);
    assert.match(connectionStore, /AndroidKeyStore/);
    assert.match(connectionStore, /AtomicFile/);
    assert.match(connectionStore, /MessageRelaySecrets\(\[redacted\]\)/);
    assert.doesNotMatch(connectionStore, /state-v1\.bin/);
    assert.match(stateStore, /stateGeneration/);
    assert.match(stateStore, /reserveOutboundSequence[\s\S]*persist\(state\)[\s\S]*reserved/);
    assert.match(stateStore, /MessageRelayProtocol\.decrypt[\s\S]*val state = readState\(\)/);
    assert.match(stateStore, /pendingServerAcknowledgements/);
    assert.match(stateStore, /cannot be consumed before its durable server acknowledgement/);
    const protocol = relay('MessageRelayProtocol.kt');
    assert.match(protocol, /HMAC-SHA256\+AES-256-GCM/);
    assert.match(protocol, /SheepfoldFamilyMessageRelay\/subkey\\u0000/);
    assert.match(protocol, /deriveEnvelopeMessageKey/);
  });

  it('leaves relay off and background polling bounded without production endpoint data', () => {
    const settings = relay('MessageRelayConnectionStore.kt');
    const worker = relay('MessageRelayPollWorker.kt');
    const synchronizer = relay('MessageRelaySynchronizer.kt');
    const allRuntime = [settings, worker, synchronizer, relay('PublicMessageRelayHttpsClient.kt')].join('\n');
    assert.match(settings, /val enabled: Boolean = false/);
    assert.match(settings, /val baseUrl: String = ""/);
    assert.match(worker, /waitSeconds = 0/);
    assert.match(worker, /15, TimeUnit\.MINUTES/);
    assert.match(worker, /setBackoffCriteria\(BackoffPolicy\.EXPONENTIAL, 5, TimeUnit\.MINUTES\)/);
    assert.doesNotMatch(worker, /WebSocket|Socket\(/);
    assert.match(synchronizer, /waitSeconds in 0\.\.25/);
    assert.match(synchronizer, /clock\(\)/);
    assert.doesNotMatch(allRuntime, /\.duckdns\.org/);
  });
});
