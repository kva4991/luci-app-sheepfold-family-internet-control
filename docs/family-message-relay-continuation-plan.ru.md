# План продолжения family message relay

<!-- §mrelay1 -->

Обновлено 26 августа 2026 года после развёртывания synthetic-only server pilot и остановки
незавершённого Android/OpenWrt client pass по прямому указанию владельца. Этот файл является
handoff следующему агенту: текущий проход больше не меняет client runtime, а фиксирует факты,
риски и порядок продолжения. Отдельная команда владельца разрешает текущему агенту commit/push
этой зафиксированной точки; она не разрешает установку на роутер, enrollment или production-включение.

## Текущая точка

Затронуты два рабочих дерева:

- public client: `C:\Users\User\Documents\pesochnica\luci-app-sheepfold-family-internet-control`;
- private server: `C:\Users\User\Documents\pesochnica\sheepfold-support-server`.

Public working tree содержит незакоммиченные чужие изменения: перед продолжением их нужно снова
прочитать и сохранить. Deployment state не следует выводить из git status.

Уже подготовлены:

- strict public protocol v1, schemas, `HMAC-SHA256+AES-256-GCM` golden vector и per-message KDF;
- private loopback-only server runtime с отдельными credentials, bounded mailbox, long poll,
  explicit ack, revoke и idempotency;
- synthetic-only deployment за публичной DNS/TLS-границей Caddy: relay остаётся loopback-only,
  health, negative и reboot gates пройдены;
- документация local-first маршрута, 25-секундного poll и целевого начала обработки до 30 секунд;
- ADR и документационные проверки в обоих проектах;
- разбор практик Tailscale DERP, Home Assistant Companion, ntfy и OpenWISP;
- незавершённый, выключенный Android foundation в
  `android/app/src/main/java/app/sheepfold/android/relay/` и его JVM/instrumented test sources;
- только каркас OpenWrt package `package/sheepfold-message-relay-crypto/Makefile` без `src`, relay
  service, UCI, provisioning, poller, durable ledger или dispatcher; этот каркас не собирается.

Product transport не готов. Android foundation не подключён к production provisioning, UI и
app lifecycle, имеет перечисленные ниже незакрытые safety gaps и не прошёл итоговый Gradle/API 28/
physical-device gate. OpenWrt runtime отсутствует. Поэтому `clientsReady=no`,
`realDataAllowed=no`; enrollment не создавался, реальные credentials и семейные данные не
использовались.

**Почему выбран этот способ / нюансы.** Уже созданные client files сохранены, потому что владелец
попросил не удалять внесённые изменения и передать их другому агенту. Они описываются как
незавершённый foundation, а не как готовая функция: сохранение work-in-progress не отменяет
security gates и не разрешает подключать live endpoint.

## Что фактически сделано в Android source

| Файл/слой | Что уже заложено | Что это пока не доказывает |
|---|---|---|
| `MessageRelayJson.kt` | bounded strict JSON, canonical encoding, запрет duplicate/unknown fields | совместимость с router runtime |
| `MessageRelayProtocol.kt` | envelope/payload v1, HMAC per-message KDF, AES-256-GCM, TTL/actionHash/ID checks | Android Keystore и cross-runtime vector на API 28/OpenWrt |
| `MessageRelayConnectionStore.kt` | выключенные defaults, endpoint validation, отдельный Keystore-backed atomic bundle secrets/state | production provisioning, backup/rollback resistance на реальном устройстве |
| `MessageRelayStateStore.kt` | durable sequence/high-water, outbox/inbox/dedup и server-ack state | power-loss recovery на filesystem реального телефона |
| `PinnedLocalMessageRelayTransport.kt` | прежний SPKI/local Bearer, общий 2500 мс budget, pre/post-body classification | совместимый linearized local endpoint на OpenWrt |
| `PublicMessageRelayHttpsClient.kt` | system-CA HTTPS к `/v1/phone/*`, bounded responses, отдельный phone bearer | live credential lifecycle и сетевые/OEM edge cases |
| `LocalFirstMessageRelayCoordinator.kt` | один envelope/messageId, durable local-attempt state, local-first branching | безопасное завершение всех crash windows; один P1 указан ниже |
| `MessageRelaySynchronizer.kt` | bounded poll, durable inbox, ack после сохранения | доставка consumer/UI и process-death flow |
| `MessageRelayPollWorker.kt` | выключенный periodic WorkManager skeleton с minimum 15 минут | мгновенный background push; worker нигде не scheduled production lifecycle |
| relay tests | protocol/golden/state/transport/coordinator и один Android storage source | instrumented API 28, физический телефон, router peer и end-to-end field flow |

Все settings остаются `enabled=false`, `baseUrl=""`; source не содержит live DuckDNS hostname,
IP, enrollment code, bearer или семейных данных. `scheduleIfProvisioned()` не подключён к app
lifecycle, пользовательского toggle/provisioning flow нет.

`MessageRelayConnectionStore.kt` и `MessageRelayJson.kt` были случайно удалены во время
остановленного pass и восстановлены только функциональной реконструкцией из `.class`/DEX последней
зелёной debug-сборки. Исходные Kotlin bytes не сохранились. После восстановления команда
`:app:compileDebugKotlin :app:testDebugUnitTest` завершилась `BUILD SUCCESSFUL`; hashes текущих
reconstructed sources:

- `MessageRelayConnectionStore.kt` —
  `0519ad2448cc0c728bd7e49e7c4f188dccefcb1a155c10eff2219b7894691ebc`;
- `MessageRelayJson.kt` —
  `d76181a99f47991c03234dc40d60af4d9fffeb70a3c357c00766a0bf03665db5`.

**Почему выбран этот способ / нюансы.** Таблица разделяет наличие source от доказанного runtime.
Следующий агент должен проверять каждый слой отдельно: зелёный unit test не подтверждает Android
platform behavior, а наличие worker class не означает, что приложение его запускает. Bytecode
reconstruction вернула компилируемое поведение, но не авторский Kotlin text; эти два файла требуют
отдельного source review до дальнейшего редактирования.

## Известные незавершённые места в сохранённом Android foundation

1. Перед public `enqueue()` нет durable состояния `RELAY_ATTEMPT` до начала HTTP I/O. Process kill
   после передачи body/server accept может оставить outbox в `READY`; после TTL результат способен
   стать «unknown» и запись может быть очищена неверно.
   **Почему это важно / нюансы:** exact-envelope server idempotency делает повтор безопасным только
   пока client сохраняет связь с исходным `messageId`. Следующий агент должен сначала persist
   retryable/attempt marker, затем начать сеть, а crash-before-return закрепить regression test.
   Если добавляется новый enum value, нельзя молча менять ordinal уже сохранённого binary state:
   нужен stable wire code либо явная migration.
2. Local lookup сейчас признаёт `NoRecord` только по exact `application/json` и canonical
   `{"error":"notFound"}`, но ответ не связан с запрошенным ID/version.
   **Почему это важно / нюансы:** stale/cached/misrouted `notFound` способен открыть public fallback
   после неоднозначного local POST. Контракт нужно усилить strict полями `protocolVersion=1`,
   `requestMessageId=<тот же ID>`, `error=notFound`, запретить unknown/duplicate fields и проверить
   другой ID/version/content-type. Даже после parser fix OpenWrt обязан доказать linearized lookup
   относительно durable pre-side-effect dedup.
3. Android foundation не подключён к production provisioning, UI, consumer и lifecycle:
   `MessageRelayConnectionStore.write()`, `scheduleIfProvisioned()`, coordinator,
   `pendingInboundRecords()` и `consumeInbox()` не имеют production caller; revoke основного pairing
   не очищает relay identity и не отменяет worker.
   **Почему это важно / нюансы:** wiring до закрытия двух предыдущих пунктов превратит test-only
   draft в доступный пользователю небезопасный путь; сначала correctness, затем provisioning/
   revocation, durable consumer и только потом UX.
4. Свободное поле public URL недопустимо: endpoint, phone bearer и E2E keys должны приходить из
   аутентифицированного local router provisioning с явным согласием. Сначала атомарно сохраняются
   secrets/state, затем включается setting.
   **Почему это важно / нюансы:** обратный порядок оставит `enabled=true` без полного key/state
   bundle после crash; свободный URL позволит направить metadata/bearer не тому relay.
5. После восстановления проходят `compileDebugKotlin`, `testDebugUnitTest`,
   `compileDebugAndroidTestKotlin` и `assembleDebug`, но `lintDebug` падает:
   `MessageRelayJson.kt:263` вызывает `BigInteger.longValueExact()`, доступный Android только с
   API 31 при project `minSdk=28`. Lint зафиксировал 1 error и 80 warnings; warnings в этом handoff
   отдельно не классифицированы. Instrumented API 28, process-death/Doze и physical-device tests
   также не выполнены.
   **Почему это важно / нюансы:** это реальная runtime-несовместимость, поэтому suppress/`TargetApi`
   использовать нельзя. Следующий агент должен выполнить API-28-compatible bounds comparison с
   `Long.MIN_VALUE/MAX_VALUE`, затем обычный `toLong()`, и закрепить boundary tests + lint. Даже
    зелёные compile/JVM/assemble не воспроизводят Keystore/AtomicFile, cancellation, OEM background
    restrictions или фактическую TLS сеть.

## Проверенный baseline перед документирующим commit

На 2026-08-26 выполнены следующие проверки текущего сохранённого состояния:

- полный `npm.cmd test` — все `117/117` настроенных групп test-файлов прошли ровно один раз;
- focused relay-прогон
  `node --test tests/familyMessageRelayProtocol.test.mjs tests/familyMessageRelayArchitecture.test.mjs tests/androidFamilyMessageRelayRuntime.test.mjs tests/testCategories.test.mjs`
  — `32/32` tests passed;
- Android `:app:compileDebugKotlin :app:testDebugUnitTest` — `BUILD SUCCESSFUL`;
- Android `:app:compileDebugAndroidTestKotlin :app:assembleDebug` — успешно;
- Android `:app:lintDebug` — не пройден: один API 31 error в
  `MessageRelayJson.kt:263` при `minSdk=28` и 80 ещё не классифицированных warnings.

Instrumented tests на API 28, physical-device/Doze/process-death и live-router end-to-end не
запускались. Успешные Node/JVM/build проверки не меняют `clientsReady=no` и
`realDataAllowed=no`.

**Почему выбран этот способ / нюансы.** В handoff записаны и зелёные проверки, и отрицательный
результат lint, а также точные непроверенные среды. Это позволяет воспроизвести исходную точку и не
выдать compile/test coverage за доказательство production-связи телефона, relay и роутера.

## Что фактически сделано и не сделано на OpenWrt

Сохранён только `package/sheepfold-message-relay-crypto/Makefile`. Он объявляет отдельный
architecture-dependent helper и зависимости `+jansson +libopenssl`, но `src/` пуст, ожидаемый
`sheepfold-message-relay-crypto.c` отсутствует, а linker command пока не содержит `-ljansson`.
Следовательно, package заведомо не собирается и не устанавливался.

Также отсутствуют:

- добавление helper в SDK feed/workflow/artifact collector для IPK и APK;
- зависимость/optional-install contract основного `all/noarch` LuCI package;
- UCI `message_relay`, secrets store `0600`, procd service и boot jitter;
- unprivileged poll/crypto worker, durable outbox/sequence/dedup/result lookup;
- узкий root dispatcher и повторная локальная проверка прав перед side effect;
- fresh-install/upgrade/reboot/power-loss и live-router tests.

Целевая topology оставляет native helper отдельным package рядом с основным LuCI package. Встраивать
binary в основной `all/noarch` package нельзя: иначе весь LuCI artifact станет зависеть от ABI и
усложнит обе редакции Sheepfold. `USERID:=sheepfold-relay:sheepfold-relay` требует отдельной
fresh-install/upgrade проверки на OpenWrt 25.12 из-за известного apk upgrade defect для нового
`USERID`: [официальный OpenWrt issue #18527](https://github.com/openwrt/openwrt/issues/18527).

**Почему выбран этот способ / нюансы.** Отдельный Jansson + OpenSSL EVP/HMAC helper безопаснее
handwritten JSON и shell `openssl` на границе keys/nonces, но ошибка здесь имеет высокий ущерб.
Поэтому дальнейшая native реализация остаётся под отдельным подтверждением владельца, target-SDK
build и cross-runtime vector; один Makefile не считается доказательством runtime.

## Как клиент должен обращаться к серверу

Public transport использует один origin:

```text
base_url = https://REPLACE_WITH_DNS_NAME
TCP port = 443
API prefix = /v1
TLS trust = Android/OpenWrt system CA + exact DNS hostname
```

Точный live DNS хранится не в public Git, а в локальном deployment-state:
`C:\Users\User\Documents\Sheepfold CloudCore SSH\SHEEPFOLD-CLOUDCORE-DEPLOYMENT-STATE.md`.
SSH `50293` является только административным портом VPS и никогда не используется приложением или
роутером. Backend `127.0.0.1:8790` доступен только Caddy на VPS и также не является client endpoint.

Телефон использует только:

- `POST /v1/phone/messages` — положить один уже зашифрованный envelope;
- `POST /v1/phone/poll` — получить до 20 router-to-phone envelopes;
- `POST /v1/phone/ack` — подтвердить только durable сохранённые/обработанные IDs.

Роутер использует `/v1/router/enroll`, `/v1/router/phones`, `/v1/router/phones/revoke`,
`/v1/router/messages`, `/v1/router/poll` и `/v1/router/ack`. Public `tools/messageRelay/` содержит
только strict envelope/payload schemas, canonical JSON и golden vector; HTTP request/response
contract принадлежит private
`sheepfold-support-server/contracts/message-relay-server-v1.json`.

Точные обязательные поля HTTP v1:

| Path | Request JSON | Success JSON |
|---|---|---|
| `/v1/router/enroll` | `protocolVersion`, `enrollmentCode` | `protocolVersion`, `routerId`, `credential` |
| `/v1/router/phones` | `protocolVersion`, `routerId`, `phoneId`, `streamId` | те же IDs, `credential`, `credentialVersion` |
| `/v1/router/phones/revoke` | `protocolVersion`, `routerId`, `phoneId` | те же IDs, `revoked` |
| `/v1/router/messages` | `protocolVersion`, `routerId`, `envelope` | `accepted`, `duplicate`, `messageId` |
| `/v1/router/poll` | `protocolVersion`, `routerId`, `limit`, `waitSeconds` | `protocolVersion`, `messages` |
| `/v1/router/ack` | `protocolVersion`, `routerId`, `messageIds` | `protocolVersion`, `acknowledgedMessageIds` |
| `/v1/phone/messages` | `protocolVersion`, `routerId`, `phoneId`, `streamId`, `envelope` | `accepted`, `duplicate`, `messageId` |
| `/v1/phone/poll` | `protocolVersion`, IDs, `limit`, `waitSeconds` | `protocolVersion`, `messages` |
| `/v1/phone/ack` | `protocolVersion`, IDs, `messageIds` | `protocolVersion`, `acknowledgedMessageIds` |

`IDs` в phone rows означает exact `routerId`, `phoneId`, `streamId`; сокращение не является
дополнительным JSON-полем. Новый enqueue возвращает HTTP `202`, точный повтор — `200` с
`duplicate=true`; тот же `messageId` с другими bytes получает `409 messageConflict`. ACK response
возвращает отсортированный проверенный request set и должен оставаться идемпотентным после потери
предыдущего ответа. Ошибка имеет bounded форму `{"error":"<code>"}`.

Public Android запросы используют `Authorization: Bearer <отдельный relay credential>` и
`Content-Type: application/json; charset=utf-8`; server должен разобрать JSON независимо от
порядка object keys, но отклонить duplicate/unknown/missing fields. Local transport отправляет
`application/json`, а будущий request-bound `NoRecord` принимает только exact local
`Content-Type: application/json`. Local Android Bearer, content keys, UCI, LuCI/SSH credentials и
plaintext public server не получает. Redirect, cleartext HTTP, raw-IP endpoint, userinfo/query/
fragment/path в `base_url` запрещены. Ограничения: envelope 16 КБ, plaintext до шифрования 8 КБ,
command TTL 120 секунд, result/notification TTL 24 часа, poll до 20 записей и 25 секунд.

**Почему выбран этот способ / нюансы.** Единственный HTTPS origin с public CA работает за NAT без
входящего порта на роутере. Отдельный relay bearer позволяет отозвать public transport, не ломая
local pairing; E2E keys остаются у endpoints. Placeholder вместо live DNS не публикует deployment
inventory, но следующий агент обязан прочитать локальный state перед synthetic live test и не
копировать оттуда секреты в Git или логи.

**Почему таблица полей дана отдельно / нюансы.** Envelope schema не описывает outer HTTP body, а
догадки по endpoint names приводят к несовместимым clients. Таблица фиксирует только sanitised wire
shape без bearer/real IDs; private executable contract и tests остаются source of truth при любом
расхождении.

## Protocol source of truth и private vendor

Канонический executable protocol находится в public `tools/messageRelay/`:

- текущая модель использует `IV = 0x00000000 || uint64be(sequence)` без передаваемого случайного
  nonce;
- directional master key не шифрует данные напрямую: HMAC-SHA256 выводит отдельный AES key из
  exact fixed metadata, включая свежий 128-битный `messageId`;
- current API требует связанный `keyRecord` (`direction + streamId + keyId + keyBytes`);
- sender обязан durable-резервировать `sequence`, новый stream получает новые направленные ключи;
- отдельной подписи envelope в protocol v1 нет: сообщение аутентифицирует AES-GCM tag;
- private vendor manifest перечисляет полный closure и SHA-256, но пока относится к предыдущей
  public версии с `cryptoSuite=AES-256-GCM` и `sourceRevision=development-uncommitted`.

На момент handoff hash-аудит подтверждает шесть отличающихся public paths:

- `docs/android-router-message-relay.ru.md`;
- `tools/messageRelay/README.ru.md`;
- `tools/messageRelay/protocolValues.mjs`;
- `tools/messageRelay/relayEnvelope.mjs`;
- `tools/messageRelay/schemas/envelope-v1.schema.json`;
- `tools/messageRelay/fixtures/protocol-v1-golden.json`.

Следовательно, current private/deployed pilot с прежним `AES-256-GCM` отклонит новый Android
envelope `HMAC-SHA256+AES-256-GCM`. Vendor gate и client/server compatibility остаются red, пока
private copy/manifest не обновлены от зафиксированного public commit, tests не зелёные и новый
synthetic-only release не развёрнут без enrollment.

**Почему выбран этот способ / нюансы.** Per-message KDF защищает от повторения пары AES key/IV при
rollback sequence state и свежем `messageId`; durable sequence всё равно нужен для replay/order и
exact retry. Vendor обновляется после public commit, чтобы manifest ссылался на неизменяемую ревизию,
а не на очередной промежуточный diff. HTTPS health проверяет edge/readiness, но не crypto suite;
поэтому до sync/redeploy запрещён даже synthetic cross-client test. Старые `nonce`/signature terms
возвращать нельзя.

## Следующий проход

1. Сначала проверить `git status` и полный diff в обоих репозиториях.
   **Почему выбран этот способ / нюансы:** оба working tree могут содержать параллельные правки;
   менять или переносить их без чтения нельзя.
2. Сохранить `clientsReady=no`, `realDataAllowed=no`; не создавать enrollment и не использовать
   реальные credentials/семейные данные.
   **Почему выбран этот способ / нюансы:** прошедшие server gates доказывают только synthetic
   DNS/TLS/Caddy boundary, а не готовность client runtime.
3. Устранить Android API 28 lint blocker в strict JSON integer parser и добавить min/max/overflow
   regression tests без повышения `minSdk` и без suppress.
   **Почему выбран этот способ / нюансы:** приложение заявляет API 28; API-31 method может пройти
   desktop compile и упасть на поддерживаемом телефоне, а повышение `minSdk` изменит продуктовый
   контракт ради одного заменяемого вызова.
4. Закрыть Android public-enqueue crash window: durable перевести запись из `READY` в
   retryable/attempt state до HTTP I/O и добавить simulated process-death regression.
   **Почему выбран этот способ / нюансы:** server exact-envelope idempotency допускает повтор, но
   только сохранённый outbox binding позволяет принять поздний result и не потерять исход команды.
5. Одновременно зафиксировать request-bound local `NoRecord` contract на Android и OpenWrt:
   `protocolVersion`, точный `requestMessageId`, `error=notFound`, strict JSON/content-type и
   linearized lookup после durable dedup.
   **Почему выбран этот способ / нюансы:** generic `404` или чужой stale response не доказывает,
   что неоднозначный POST не исполнился, и не должен открывать public fallback.
6. Только после отдельного подтверждения владельца закончить OpenWrt native helper вместо
   несобираемого Makefile-only scaffold, затем собрать его target SDK для всех поддерживаемых ABI.
   **Почему выбран этот способ / нюансы:** `jansson` нужен вместо handwritten JSON, а OpenSSL
   EVP/HMAC — вместо shell `openssl`; ошибка native boundary может раскрыть key или повторить nonce,
   поэтому approval и target build являются отдельным security gate.
7. Реализовать выключенный OpenWrt runtime: отдельный unprivileged poll/crypto worker, `0600`
   secrets, durable outbox/sequence/dedup/result ledger и узкий root dispatcher, который повторно
   проверяет administrator binding/blocklist/quarantine перед allowlisted side effect.
   **Почему выбран этот способ / нюансы:** ciphertext-only server не может проверять локальные права;
   разделение worker/root уменьшает последствия сетевого/parser defect и не открывает WAN listener.
8. После закрытия P1/P2 подключить Android provisioning/revocation, durable consumer, UI и
   lifecycle, сохранив `enabled=false`, пустой endpoint и отсутствие автоматического enrollment по
   умолчанию. UI различает server `accepted`, router `executed/rejected` и `INDETERMINATE`; последний
   не предлагает слепо повторить команду, а OS notification не является единственным store.
   **Почему выбран этот способ / нюансы:** wiring делается последним, чтобы незавершённый transport
   не стал доступен пользователю только из-за наличия source classes.
9. Прогнать один и тот же golden vector на Android API 28 и OpenWrt 24.10/25.12, затем повторить
   public protocol/architecture tests.
   **Почему выбран этот способ / нюансы:** byte-level vector ловит несовместимость AAD, derived IV,
   key binding и canonical JSON между runtime. Private vendor check здесь ещё не должен быть green:
   он проверяет предыдущую server copy до следующего шага.
10. После публикации зафиксированного public commit обновить private vendor copy/manifest именно из
    него, повторить private contract/runtime/docs и vendor gates, затем выпустить и развернуть
    отдельный synthetic-only server release без enrollment.
    **Почему выбран этот способ / нюансы:** public repo владеет wire contract, private server хранит
    проверяемую копию; sync до стабилизации public bytes создаст недостоверную provenance, а E2E до
    sync/redeploy заведомо встретит несовместимый server crypto suite.
11. Только после зелёного private vendor gate и synthetic-only redeploy выполнить synthetic
    end-to-end client flow, затем field matrix с физическими Android и OpenWrt: outage, lost
    response, revoke, clock skew, reboot/power loss и 30-секундный бюджет.
    **Почему выбран этот способ / нюансы:** безопасные synthetic identities отделяют transport bugs
    от риска реальным данным, а server reboot gate не заменяет client-side recovery; обновлённый
    server является обязательной предпосылкой проверки совместимости clients.
12. Обновить privacy/agreement с отдельным пользовательским согласием и только после всех client
    gates отдельно решать, можно ли менять `clientsReady` и `realDataAllowed`.
    **Почему выбран этот способ / нюансы:** разрешение реальных данных является отдельным
    юридическим и продуктовым решением, не автоматическим следствием успешного pilot.
13. Перед завершением каждого прохода выполнить релевантные category tests, `git diff --check` и
    ручной просмотр diff; полные tests/build запускать перед решением о release.
    **Почему выбран этот способ / нюансы:** focused checks дают быстрый сигнал по изменённой границе,
    а полный gate нужен перед поставкой и не должен маскировать сохранённые чужие изменения.

## Что отдельно проверить в коде

- один и тот же AES-GCM key никогда не используется с повторным `sequence`, в том числе после
  reboot, crash, rollback state или исчерпания заранее зарезервированного блока;
- два направления имеют разные ключи и независимые sequence/IV пространства;
- повтор `messageId` с тем же envelope идемпотентен, с другим envelope получает conflict;
- long-poll waiter регистрируется до повторного чтения mailbox и освобождается при disconnect;
- `ack` выполняется только после durable обработки получателем;
- server acceptance не считается исполнением команды;
- router перед side effect повторно проверяет administrator binding, чёрный список устройств,
  identity quarantine, TTL, sequence и dedup;
- live synthetic mailbox сейчас persistent в `/var/lib/sheepfold-message-relay` на VPS disk и
  остаётся пустым без enrollment/real data; это не считается доказательством backup/restore;
- credentials, mailbox, report plane и техподдержка не переиспользуют UID, storage или keys;
- health/access logs не раскрывают bearer, family plaintext или tenant counts;
- 25-секундный poll даёт целевой бюджет до 30 секунд только в исправной сети, не обещание при outage.

## Что пока не реализовывать и не включать

- не открывать `8790` в WAN и не добавлять firewall rule;
- не указывать APK/домашнему роутеру лабораторный HTTP IP;
- не включать `message_relay.enabled` в production;
- не делать полный proxy `/api/v1/*`, LuCI, SSH или домашней LAN;
- не считать WorkManager способом гарантировать 30-секундную доставку спящему Android;
- не публиковать в public repo точный private hostname, IP, tokens или другие deployment secrets;
- не создавать enrollment и не начинать реальную передачу семейных данных, пока clients не
  реализованы и не проверены, `clientsReady=no`/`realDataAllowed=no`, отсутствуют legal consent,
  cross-runtime и live-router tests;
- после текущего документирующего push не выполнять новый commit/push/deploy без отдельной команды
  владельца.

## Ожидаемая точка готовности следующего прохода

Android и OpenWrt clients используют текущий byte-exact derived-IV protocol, проходят cross-runtime
и field gates, а документация честно отделяет уже работающий synthetic server pilot от ещё не
разрешённой передачи реальных данных. Даже после этого изменение `clientsReady` и
`realDataAllowed`, enrollment, commit/push и rollout остаются отдельными решениями владельца.
