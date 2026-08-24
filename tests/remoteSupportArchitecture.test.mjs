/*
 * Защищает документальный security-контракт будущей удалённой техподдержки:
 * заглушка остаётся неактивной, порт не подменяет аутентификацию, а сообщения
 * имеют версию, подпись, сроки и replay-защиту. Тест только читает исходники,
 * ничего не меняет и не доказывает безопасность ещё не реализованных сервера,
 * FRP, bastion, firewall или живого роутера. §rsup001 §testwhy
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const agents = read('AGENTS.md');
const decision = read('docs/architecture/decisions/0022-temporary-remote-support-access.ru.md');
const developerTask = read('docs/developer-task.ru.md');
const implementationStatus = read('docs/current-implementation-status.md');
const integrations = read('docs/integrations.md');
const plan = read('docs/remote-support-access-plan.ru.md');
const protocol = read('docs/remote-support-protocol.ru.md');
const security = read('docs/security.ru.md');
const tagMap = read('docs/dev/tag-map.md');
const threatModel = read('docs/remote-support-threat-model.ru.md');
const referenceReadme = read('tools/remoteSupport/README.ru.md');

describe('temporary remote support architecture §rsup001', () => {
  it('keeps the current feature explicitly inert', () => {
    assert.match(plan, /в LuCI реализована только неактивная заглушка/);
    assert.match(threatModel, /Статус: проектный документ/);
    assert.match(protocol, /Статус: проектный контракт `v1`/);
    assert.match(implementationStatus, /no part of that runtime is active/);
    assert.match(implementationStatus, /No transport, server, router backend or remote route is enabled/);
  });

  it('does not treat a port or the spoken code as authentication', () => {
    assert.match(threatModel, /^## Порт не является секретом$/m);
    assert.match(protocol, /^### Почему порт не входит в код$/m);
    assert.match(protocol, /Постоянный порт на каждый роутер запрещён/);
    assert.match(protocol, /sessionRoutePort[\s\S]*слушает только loopback\/private-интерфейс relay/);
    assert.match(protocol, /Номер порта не показывается владельцу и сотруднику, не входит в код/);
    assert.match(agents, /random per-session relay port[\s\S]*not a secret/);
  });

  it('requires independent router identity and short-lived transport credentials', () => {
    assert.match(protocol, /создаёт отдельную Ed25519 identity-пару локально/);
    assert.match(protocol, /Общий FRP token для всех установок запрещён/);
    assert.match(protocol, /короткоживущий клиентский сертификат/);
    assert.match(threatModel, /Один ключ не используется одновременно для package signing, server messages, TLS и SSH/);
    assert.match(decision, /каждый роутер имеет отдельную криптографическую identity/);
  });

  it('defines a strict signed and replay-resistant v1 message boundary', () => {
    for (const field of [
      'protocolVersion',
      'keyId',
      'signedPayload',
      'signature',
      'messageType',
      'routerId',
      'streamId',
      'sessionId',
      'messageId',
      'sequence',
      'issuedAt',
      'notBefore',
      'expiresAt',
    ]) {
      assert.match(protocol, new RegExp(`"${field}"`), `protocol lost ${field}`);
    }
    assert.match(protocol, /Подпись проверяется[\s\S]*до разбора JSON/);
    assert.match(protocol, /не содержит shell-строку/);
    assert.match(protocol, /Heartbeat, reconnect и safe-apply подтверждение никогда не меняют `accessExpiresAt`/);
    assert.match(protocol, /sequenceReplay/);
    assert.match(protocol, /claimAlreadyUsed/);
    assert.match(protocol, /signatureInvalid/);
    assert.match(protocol, /tools\/remoteSupport/);
    assert.match(referenceReadme, /не является runtime Sheepfold/);
  });

  it('keeps the focused documents linked from project entry points', () => {
    for (const path of [
      'remote-support-access-plan.ru.md',
      'remote-support-threat-model.ru.md',
      'remote-support-protocol.ru.md',
    ]) {
      assert.match(decision, new RegExp(path.replaceAll('.', '\\.')));
      assert.match(developerTask, new RegExp(path.replaceAll('.', '\\.')));
      assert.match(tagMap, new RegExp(path.replaceAll('.', '\\.')));
    }
    assert.match(integrations, /remote-support-threat-model\.ru\.md/);
    assert.match(security, /remote-support-protocol\.ru\.md/);
    assert.match(tagMap, /remoteSupportArchitecture\.test\.mjs/);
    assert.match(tagMap, /remoteSupportProtocol\.test\.mjs/);
    assert.match(tagMap, /remoteSupportSessionSimulator\.test\.mjs/);
    assert.match(developerTask, /tools\/remoteSupport\/README\.ru\.md/);
  });
});
