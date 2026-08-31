# План продолжения family message relay

<!-- §mrelay1 -->

Обновлено 31 августа 2026 года после перепроверки `gemini_v1`, физических Android-тестов и
появления native crypto helper. Дублирующий план ветки удалён: этот документ владеет
незавершённой relay-работой, а результаты проверки APK и установки записываются в
[Android runbook](android-test-lab.ru.md) и [памятку слияния](merge-readiness-plan.ru.md).
Владелец разрешил использовать CloudCore как тестовый сервер; это не означает разрешение
production/семейных данных. Server compatibility больше не является исходным блокером,
но OpenWrt runtime и Android product wiring остаются незавершёнными.

## Текущая точка

Исходные репозитории на компьютере владельца:

- public client: `C:\Users\User\Documents\pesochnica\luci-app-sheepfold-family-internet-control`;
- private server: `C:\Users\User\Documents\pesochnica\sheepfold-support-server`.

Перепроверка `gemini_v1` 30.08.2026 выполняется в отдельном public checkout:
`C:\Users\User\Documents\Codex\2026-08-23\openwrt-ip-podkop-x20-sheepfold-sheepfold\review-gemini-v1`.
Именно там находятся текущие незакоммиченные исправления и `.build`-отчёты. Не принимать
исходный checkout в `pesochnica` за автоматически синхронизированную копию этой работы.

Перед продолжением нужно снова проверить оба worktree и сохранить любые появившиеся
незакоммиченные изменения. Deployment state не следует выводить из git status.

Уже подготовлены:

- strict public protocol v1, schemas, `HMAC-SHA256+AES-256-GCM` golden vector и per-message KDF;
- private loopback-only server runtime с отдельными credentials, bounded mailbox, long poll,
  explicit ack, revoke и idempotency;
- private vendor manifest, закрепляющий exact public source revision внешним 40-hex; wire bytes
  происходят из protocol commit `fd41470d7487f8ee702fe3545021b31471c0d5f4`, byte-exact peer gate
  проверяет 11 файлов;
- synthetic-only deployment за публичной DNS/TLS-границей Caddy: relay остаётся loopback-only,
  health/negative gates текущего release пройдены; controlled reboot доказан для предыдущего
  immutable release, а последняя incident-версия после установки не перезагружалась;
- документация local-first маршрута, 25-секундного poll и целевого начала обработки до 30 секунд;
- ADR и документационные проверки в обоих проектах;
- разбор практик Tailscale DERP, Home Assistant Companion, ntfy и OpenWISP;
- незавершённый, выключенный Android foundation в
  `android/app/src/main/java/app/sheepfold/android/relay/` и его JVM/instrumented test sources;
- отдельный OpenWrt package `package/sheepfold-message-relay-crypto/` с native source на
  Jansson/OpenSSL, ручным Linux gate и успешной SDK 25.12.5/mediatek/filogic сборкой;
  шесть synthetic target checks прошли от `nobody`, без установки package;
- физический Android API 30 стенд без удаления данных: после QR-файла и исправления задержек
  авторизации все 8 проверок, включая paired-read, прошли без skips; отдельно прошли 10
  UI/lifecycle-проверок. Это не доказывает камеру QR, API 28 или relay E2E.

Product transport не готов. Android foundation не подключён к production provisioning, UI и
app lifecycle; часть safety gaps ниже уже исправлена, но API 28 и полный device E2E gate не пройдены.
OpenWrt runtime отсутствует. Поэтому `clientsReady=no`,
`realDataAllowed=no`; enrollment не создавался, реальные credentials и семейные данные не
использовались.

Каноническое описание доступных server endpoints, параметров соединения и local-first fallback
поддерживается в [`android-router-message-relay.ru.md`](android-router-message-relay.ru.md). Этот
handoff не дублирует его как второй источник истины, а фиксирует только незавершённые client steps.

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
| `LocalFirstMessageRelayCoordinator.kt` | один envelope/messageId, durable local/public attempt до HTTP I/O, local-first branching | router-side dedup и real power-loss |
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
reconstructed sources на момент восстановления (не hashes текущих исправленных файлов):

- `MessageRelayConnectionStore.kt` —
  `0519ad2448cc0c728bd7e49e7c4f188dccefcb1a155c10eff2219b7894691ebc`;
- `MessageRelayJson.kt` —
  `d76181a99f47991c03234dc40d60af4d9fffeb70a3c357c00766a0bf03665db5`.

**Почему выбран этот способ / нюансы.** Таблица разделяет наличие source от доказанного runtime.
Следующий агент должен проверять каждый слой отдельно: зелёный unit test не подтверждает Android
platform behavior, а наличие worker class не означает, что приложение его запускает. Bytecode
reconstruction вернула компилируемое поведение, но не авторский Kotlin text; эти два файла требуют
отдельного source review до дальнейшего редактирования.

## Исправленные границы и оставшаяся работа Android

При проверке исходного плана обнаружена ошибочная атрибуция: фильтр имён
`arp/dhcp/static`, разделение unknown/mismatch, приоритет detected type и запрет
polling при disabled/invalid config уже были в `main`. Их нельзя считать новыми
функциями этой ветки. Новая проверка усилила JSON/recovery/lookup и изоляцию
тестового хранилища. Enum ordinal не меняется: публичная попытка использует
существующий `RELAY_RETRYABLE`, а не добавленное произвольное состояние.

Отдельные исправления локальной авторизации и загрузки панелей не являются
relay runtime. В `list_devices` и token validation устранён полный allocator/commit
на каждую строку; allocator сохранён для повреждённых ID. После QR из файла
физический paired gate прошёл 8/8 без skips. Камера QR этим не проверена.
Оптимизация detector (POSIX awk, пустые TSV-поля, dedup источников, актуальный LAN IP,
отсутствие collectors без online-целей и nmap без IP) не меняет пороги, ручные типы,
identity baseline и права; полевая матрица остаётся в
[паспорте устройств](device-passport-and-control.ru.md).

Незакрытые gates из удалённого плана сохранены: lifecycle native package на 24.10 и
других ABI, unprivileged poller и durable ledger до side effect, local-authenticated
provisioning/revoke, Android consumer, API 28/35, Doze/process death, power loss,
synthetic E2E Wi-Fi/VPS с задержкой до 30 секунд и согласие до реальных данных.

1. Исправлено: перед public `enqueue()` durable сохраняется `RELAY_RETRYABLE` до начала HTTP I/O.
   Сохранён существующий enum ordinal; indirect retry/indeterminate-to-READY запрещён.
   Simulated crash после приёма сервером проверяет exact bytes после повторного открытия store,
   сохранение связи с `messageId` после TTL и неопределённый итог вместо ложного отказа.
   Даже явный 400/401/403/410 на последующем public retry не опровергает выполнение первой
   попытки с потерянным ответом: в этом случае сохраняется `INDETERMINATE`, не definite failure.
   **Почему это важно / нюансы:** server idempotency не помогает, если телефон забыл уже отправленную
   команду. Регрессии находятся в `MessageRelayRecoveryTest.kt`; реальный power-loss ещё не проверен.
2. Исправлено на Android: `NoRecord` требует exact `application/json` и canonical поля
   `protocolVersion=1`, `requestMessageId=<тот же ID>`, `error=notFound`, без лишних/повторных ключей.
   Ошибка lookup не делает прошлый POST доказанно неисполненным. На OpenWrt ещё нужно реализовать
   linearized lookup относительно durable pre-side-effect dedup.
   **Почему это важно / нюансы:** чужой/stale/generic 404 не должен разрешать новый путь команды.
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
5. `longValueExact()` заменён API-28-safe bounds comparison и `toLong()`; fractional input теперь
   даёт protocol error вместо необработанного ArithmeticException. После изменений JVM tests,
   `assembleDebug` и `assembleDebugAndroidTest` проходят. На физическом API 30 проверены provider,
   отдельный encrypted fixture store, discovery и неверный TLS pin. API 28, Doze, реальный
   process death и полная привязка пока не доказаны. Последний parent Kotlin diff прошёл
   56 JVM-тестов, debug/instrumentation build и `lintDebug` 30.08.2026.
   **Почему это важно / нюансы:** сборка/устройство API 30 не заменяют минимальную версию API 28.

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

В `package/sheepfold-message-relay-crypto/` добавлены `relay.h`, `relayJson.c` и
`sheepfold-message-relay-crypto.c`, исправлен link set `-lcrypto -ljansson -lm`.
Helper принимает один bounded stdin JSON без secrets в argv, проверяет scope ключа, TTL,
payload/actionHash и GCM tag до stdout. Обычный и ASan/UBSan Linux amd64 gate прошли по 6 тестов.
Официальный SDK 25.12.5/mediatek/filogic собрал native APK. Изолированный бинарник на роутере
прошёл шесть smoke checks от `nobody:nogroup`; package не устанавливался, `/tmp` очищен.
Другие ABI, 24.10, создание service UID и package lifecycle ещё не проверены. Команды и ограничения:
[README helper](../package/sheepfold-message-relay-crypto/README.ru.md).

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
Поэтому прошедшие Linux и отдельный target gate не разрешают включать product transport: permissions,
router lifecycle и side-effect ledger ещё требуют отдельной проверки.

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
- private vendor manifest перечисляет полный closure и SHA-256, а exact public source revision
  хранит внешним 40-hex без самоссылки public документа на собственный commit; исполняемые wire
  bytes остаются привязаны к protocol commit `fd41470d7487f8ee702fe3545021b31471c0d5f4`;
- private peer gate проверяет 11 канонических файлов byte-for-byte;
- current deployed synthetic-only pilot принимает `HMAC-SHA256+AES-256-GCM`; enrollment и реальные
  данные при синхронизации не создавались.

**Почему выбран этот способ / нюансы.** Per-message KDF защищает от повторения пары AES key/IV при
rollback sequence state и свежем `messageId`; durable sequence всё равно нужен для replay/order и
exact retry. Vendor закреплён за неизменяемым public commit, а не промежуточным diff. Peer gate
доказывает совпадение protocol bytes, тогда как HTTPS health проверяет только edge/readiness;
synthetic client E2E всё ещё требует готовых Android и OpenWrt runtime. Старые
`nonce`/signature terms возвращать нельзя.

## Следующий проход

1. Сначала проверить `git status` и полный diff в обоих репозиториях.
   **Почему выбран этот способ / нюансы:** оба working tree могут содержать параллельные правки;
   менять или переносить их без чтения нельзя.
2. Сохранить `clientsReady=no`, `realDataAllowed=no`; не создавать enrollment и не использовать
   реальные credentials/семейные данные.
   **Почему выбран этот способ / нюансы:** прошедшие server gates доказывают только synthetic
   DNS/TLS/Caddy boundary, а не готовность client runtime.
3. **Source/JVM/Lint выполнено.** Сохранить API-28-safe strict integer parser, min/max/overflow и
   fractional regression tests. Остаётся runtime на API 28 без повышения `minSdk` и без suppress.
   **Почему выбран этот способ / нюансы:** приложение заявляет API 28; API-31 method может пройти
   desktop compile и упасть на поддерживаемом телефоне, а повышение `minSdk` изменит продуктовый
   контракт ради одного заменяемого вызова.
4. **Выполнено в source/JVM.** Public-enqueue сохраняет `RELAY_RETRYABLE` до HTTP I/O;
   simulated restart проверяет exact retry. Остаётся физическая power-loss/lifecycle матрица.
   **Почему выбран этот способ / нюансы:** server exact-envelope idempotency допускает повтор, но
   только сохранённый outbox binding позволяет принять поздний result и не потерять исход команды.
5. Android request-bound contract уже проверен; реализовать соответствующий OpenWrt lookup:
   `protocolVersion`, точный `requestMessageId`, `error=notFound`, strict JSON/content-type и
   linearized lookup после durable dedup.
   **Почему выбран этот способ / нюансы:** generic `404` или чужой stale response не доказывает,
   что неоднозначный POST не исполнился, и не должен открывать public fallback.
6. Native helper реализован, normal и ASan/UBSan Linux gates пройдены (по 6 tests, без skips).
   SDK 25.12.5/mediatek/filogic и synthetic target vector проверены; завершить другие ABI,
   24.10 и package install/upgrade permissions.
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
   public protocol/architecture и private peer tests.
   **Почему выбран этот способ / нюансы:** byte-level vector ловит несовместимость AAD, derived IV,
   key binding и canonical JSON между runtime. Private peer check уже green для current server
   revision и должен оставаться зелёным после любой дальнейшей правки public protocol.
10. Если public protocol bytes изменятся, сначала зафиксировать новый public commit, затем обновить
    private vendor copy/manifest именно из него, повторить private contract/runtime/docs и peer
    gates и выпустить отдельный synthetic-only server release без enrollment.
    **Почему выбран этот способ / нюансы:** public repo владеет wire contract, private server хранит
    проверяемую копию; нынешняя синхронизация уже выполнена, но будущий односторонний protocol diff
    снова сделает client/server несовместимыми.
11. После готовности Android и OpenWrt runtime выполнить synthetic end-to-end client flow, затем
    field matrix с физическими Android и OpenWrt: outage, lost response, revoke, clock skew,
    reboot/power loss и 30-секундный бюджет.
    **Почему выбран этот способ / нюансы:** безопасные synthetic identities отделяют transport bugs
    от риска реальным данным. Reboot evidence предыдущего server release и no-reboot gates текущей
    incident-версии не заменяют client-side recovery и проверку реальных Android/OpenWrt runtime.
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
