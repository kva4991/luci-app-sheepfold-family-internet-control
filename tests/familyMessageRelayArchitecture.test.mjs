/*
 * Защищает границу частично реализованного family message relay: real-data режим остаётся
 * выключенным, local pinned HTTPS имеет приоритет, а VPS не превращается в прокси
 * полного Android API. Тест сам по себе не доказывает deployment, Android или живой OpenWrt.
 * §mrelay1 §testwhy
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const agents = read('AGENTS.md');
const androidConfig = read('docs/android-config.ru.md');
const decision = read('docs/architecture/decisions/0027-local-first-family-message-relay.ru.md');
const developerTask = read('docs/developer-task.ru.md');
const focused = read('docs/android-router-message-relay.ru.md');
const continuation = read('docs/family-message-relay-continuation-plan.ru.md');
const implementationStatus = read('docs/current-implementation-status.md');
const messaging = read('docs/messaging.ru.md');
const privacyEn = read('docs/privacy.md');
const privacyRu = read('docs/privacy.ru.md');
const productRequirements = read('docs/product-requirements.md');
const security = read('docs/security.ru.md');
const tagMap = read('docs/dev/tag-map.md');
const agreementEn = read('docs/user-agreement.md');
const agreementRu = read('docs/user-agreement.ru.md');

describe('family message relay architecture §mrelay1', () => {
  it('keeps the feature disabled until clients and the real-data gate are ready', () => {
    assert.match(decision, /synthetic-only server pilot за DNS\/TLS\/Caddy реализованы/);
    assert.match(focused, /частично реализовано, production-включение запрещено/);
    assert.match(focused, /`clientsReady=no`, `realDataAllowed=no`/);
    assert.match(focused, /`sheepfold\.message_relay_global`[\s\S]*отсутствует/);
    assert.match(focused, /Android client foundation[\s\S]*незавершённый source handoff/);
    assert.match(focused, /OpenWrt client\/runtime[\s\S]*отсутствует/);
    assert.match(focused, /message_relay\.enabled` не вводится[\s\S]*остаётся `0`/);
    assert.match(continuation, /Перед public `enqueue\(\)` нет durable состояния `RELAY_ATTEMPT`/);
    assert.match(continuation, /`requestMessageId=<тот же ID>`/);
    assert.match(continuation, /каркас OpenWrt package[\s\S]*не собирается/);
    assert.match(implementationStatus, /family message relay[\s\S]*`clientsReady=no`, `realDataAllowed=no`/i);
  });

  it('preserves local Wi-Fi and forbids a full remote API proxy', () => {
    assert.match(decision, /HTTPS long poll с local-first fallback/);
    assert.match(focused, /policy \| `local_preferred`/);
    assert.match(focused, /^## Local-first и защита от повтора$/m);
    assert.match(focused, /Relay недоступен, телефон дома[\s\S]*local pinned HTTPS/);
    assert.match(focused, /не переносит полный Android API, LuCI, SSH/);
    assert.match(agents, /family message relay[\s\S]*not a proxy for the full Android API/i);
    assert.match(productRequirements, /local_preferred/);
  });

  it('keeps separate credentials and a server-blind message boundary', () => {
    assert.match(focused, /не под[\s\S]*`sheepfold-admin-token`/);
    assert.match(focused, /два независимых случайных 256-битных ключа/);
    assert.match(focused, /AES-256-GCM/);
    assert.match(focused, /HMAC-SHA256/);
    assert.match(focused, /ключи содержимого никогда не передаются relay/);
    assert.match(security, /local Android Bearer[\s\S]*не передаются relay/i);
    assert.match(decision, /message relay и техническая поддержка имеют разные[\s\S]*credentials/);
    assert.match(focused, /Отзыв локального administrator[\s-]*device отзывает phone identity/i);
    assert.match(focused, /перед каждым[\s\S]*чёрный список устройств[\s\S]*identity quarantine/i);
    assert.match(security, /перед каждым[\s\S]*administrator-device binding[\s\S]*blocklist[\s\S]*identity quarantine/i);
  });

  it('defines exact bounded connection parameters and replay protection', () => {
    for (const uciOption of ['enabled', 'base_url', 'protocol_version']) {
      assert.match(focused, new RegExp(`option ${uciOption.replaceAll('_', '\\_')} `));
    }
    for (const value of [
      '25 секунд',
      '35 секунд',
      '16 КБ',
      '120 секунд',
      'messageId',
      'sequence',
      'expiresAt',
      'ciphertext',
      'messageClass',
    ]) {
      assert.match(focused, new RegExp(value), `relay contract lost ${value}`);
    }
    assert.match(focused, /Команда получает `messageId`/);
    assert.match(focused, /`requestMessageId=<тот же messageId>`/);
    assert.match(focused, /Empty\/generic `404`[\s\S]*не разрешают/);
    assert.match(focused, /до side effect атомарно сохраняет dedup record[\s\S]*Повтор возвращает прежний результат/);
    assert.match(focused, /`POST \/router\/poll`/);
    assert.match(focused, /`POST \/phone\/messages`/);
    assert.match(focused, /confirmation_required/);
    assert.match(focused, /actionHash/);
    assert.match(focused, /`SFMR1-\.\.\.` действует 10 минут/);
    assert.match(continuation, /sourceRevision=fd41470d7487f8ee702fe3545021b31471c0d5f4/);
    assert.match(continuation, /peer gate проверяет 11 файлов/);
    assert.match(focused, /checkPublicMessageRelayVendor\.mjs --peer/);
    assert.match(decision, /lost-wakeup race/);
    assert.match(decision, /Boot jitter/);
  });

  it('records the inactive privacy and agreement companion before real-data activation', () => {
    for (const legalText of [privacyEn, privacyRu, agreementEn, agreementRu]) {
      assert.match(legalText, /§mrelay1/);
      assert.match(legalText, /не действует|not active/i);
    }
    assert.match(privacyRu, /routerId[\s\S]*phoneId[\s\S]*messageId/);
    assert.match(privacyRu, /120 секунд[\s\S]*суток/);
    assert.match(agreementRu, /отдельн[а-яё]* явн[а-яё]* согласи/i);
  });

  it('keeps the canonical page reachable from project entry points', () => {
    for (const documentText of [androidConfig, continuation, developerTask, messaging, tagMap]) {
      assert.match(documentText, /android-router-message-relay\.ru\.md/);
    }
    assert.match(tagMap, /§mrelay1/);
    assert.match(tagMap, /familyMessageRelayArchitecture\.test\.mjs/);
  });
});
