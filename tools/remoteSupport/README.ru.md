# Исполняемый контракт удалённой техподдержки

<!-- §rsup001 -->

Эта папка содержит только автономную reference-модель будущего протокола. Она нужна, чтобы до появления сервера и router backend одинаково проверить байты подписи, строгий JSON, сроки, replay-защиту и переходы состояний.

Она **не является runtime Sheepfold** и не должна импортироваться в LuCI, shell/ucode backend или APK:

- не открывает сеть, SSH или FRP;
- не создаёт ключи на роутере;
- не устанавливает пакеты;
- не меняет UCI, firewall, Podkop или IPv6;
- использует Node.js только как независимый тестовый эталон.

## Состав

- `protocolModel.mjs` - стабильный фасад публичных экспортов reference-контракта;
- `protocolValues.mjs` - версии, лимиты, имена сообщений, состояния и общие проверки полей;
- `strictJson.mjs` - ограниченный duplicate-safe UTF-8/JSON parser;
- `signedEnvelope.mjs` - подписываемый preimage, Ed25519 envelope, common payload и replay window;
- `sessionState.mjs` - сроки, генерация кода без modulo bias и чистая state machine;
- `sessionSimulator.mjs` - автономная модель router/control-plane заявки, которая проверяет MFA gate, сгорание кода, сроки, reboot и локальный отзыв;
- `schemas/signed-envelope-v1.schema.json` - внешняя JSON Schema;
- `schemas/signed-payload-v1.schema.json` - общая JSON Schema подписанного сообщения;
- `schemas/enrollment-start-v1.schema.json` - единственное узкое неподписанное bootstrap-тело до регистрации публичного ключа роутера; оно всё равно передаётся только через проверенный TLS;
- `fixtures/protocol-v1-golden.json` - синтетический ключ, точные байты и ожидаемая подпись;
- `peer-project.json` - machine-readable граница с закрытым `sheepfold-support-server`;
- `checkPeerContract.mjs` - симметричная cross-repo проверка contract ID, protocol major и владельца canonical protocol;
- `tests/remoteSupportProtocol.test.mjs` и `tests/remoteSupportSessionSimulator.test.mjs` - исполняемые проверки контракта.

Предметные схемы `payload` для каждого `messageType` ещё должны появиться вместе с server/router simulator. До этого заглушку LuCI разблокировать нельзя.

## Проверка

```powershell
node --test tests/remoteSupportProtocol.test.mjs tests/remoteSupportSessionSimulator.test.mjs tests/remoteSupportArchitecture.test.mjs
```

Если рядом доступен закрытый checkout, дополнительно проверить обе стороны:

```powershell
node tools/remoteSupport/checkPeerContract.mjs --peer C:\path\to\sheepfold-support-server
```

Отсутствие private checkout не ломает обычные public tests и не разрешает считать server runtime реализованным (§rsuppeer).

Golden key намеренно синтетический и публичный. Запрещено использовать его либо производные от него ключи в сервере, пакете или тестовом роутере.
