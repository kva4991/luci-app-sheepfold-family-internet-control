# Обмен короткими сообщениями между родительским APK и роутером

<!-- §mrelay1 -->

Статус на 30 августа 2026 года: **частично реализовано, production-включение запрещено**.
В репозитории присутствует исполнимый protocol v1, строгие схемы и golden vector. Android relay
source содержит fail-closed local-first coordinator, durable state machine, strict URL/endpoint
validation, SecureStore и WorkManager scheduling. Он проходит целевой Android relay unit-test subset,
но не подключён к production provisioning, UI или app lifecycle. Криптография/store/discovery и
защита локального API проверены на физическом Android API 30; после сопряжения через QR-файл
paired-read также прошёл (8 тестов без skips). API 28 не проверен. Native crypto helper реализован и прошёл Linux amd64 Node vector/ASan/UBSan;
SDK 25.12.5/mediatek/filogic и шесть isolated helper checks на роутере от `nobody` пройдены.
OpenWrt runtime отсутствует; установка service UID, другие ABI и полный live-router gate не проверены.
Поэтому `clientsReady=no`, `realDataAllowed=no`. Enrollment не создавался,
реальные credentials и семейные данные не использовались.

Wire protocol private vendor синхронизирован с protocol commit
`fd41470d7487f8ee702fe3545021b31471c0d5f4`, а manifest/byte-exact peer gate закрепляет public
source revision точным 40-hex в private manifest и проверяет 11 канонических файлов. Synthetic-only
release на VPS уже принимает `cryptoSuite=HMAC-SHA256+AES-256-GCM`. Это закрывает только
совместимость server protocol;
Android/OpenWrt clients и разрешение реальных данных по-прежнему не готовы.

## Точное текущее состояние

| Слой | Состояние |
|---|---|
| Канонический envelope и payload v1 | реализованы в `tools/messageRelay/` |
| HMAC-SHA256+AES-256-GCM golden vector | проходит Node-тест |
| Private vendor source | wire protocol синхронизирован с protocol commit `fd41470d7487f8ee702fe3545021b31471c0d5f4`; manifest/peer gate закрепляет exact public source revision в private manifest и проверяет 11 файлов |
| Private server credential store | реализован, токены хешируются на диске |
| Private server bounded mailbox/long poll/ack | реализованы и покрыты unit/HTTP-тестами |
| Private server process | synthetic-only pilot работает на loopback за Caddy и принимает канонический `HMAC-SHA256+AES-256-GCM` envelope |
| Публичная DNS/TLS-граница | развёрнута; health/negative gates текущего release пройдены без реальных данных; reboot evidence относится к предыдущему immutable release |
| Deployment gates | `clientsReady=no`, `realDataAllowed=no` |
| `sheepfold.message_relay_global` на семейном роутере | отсутствует |
| Android client foundation | незавершённый source handoff, выключен; известные gaps перечислены в continuation plan |
| Native crypto helper | Linux cross-runtime gate, SDK 25.12.5/mediatek/filogic и isolated target smoke пройдены; package install/UID и остальные ABI не проверены |
| OpenWrt client/runtime | отсутствует: нужны provisioning, poller, durable ledger, dispatcher и target/live-router gates |
| Пользовательский переключатель | не показывается, включать нечего |

Нельзя указывать в APK или UCI лабораторный `http://<IP>:8790`, открывать `8790` в WAN либо
считать тестовый IPK доказательством готовности интернет-сервиса.

**Почему выбран этот способ / нюансы.** Byte-exact peer gate отделяет подтверждённую совместимость
server protocol от ещё неготового client runtime. Android foundation оставлен без production wiring, а
OpenWrt runtime не подменён shell-заглушкой: зелёный JVM/source test не доказывает Android
Keystore/WorkManager на API 28, а desktop crypto не доказывает target OpenWrt ABI и поведение после
power loss. Выключенные defaults позволяют проверять код без enrollment и семейных данных; рабочий
HTTPS health сам по себе всё равно не доказывает client E2E flow.

## Назначение и границы

Relay нужен только для коротких сообщений между уже локально сопряжённым родительским APK и его
роутером:

- `globalInternetSet`;
- `temporaryAccessGrant`;
- результат выполнения команды;
- короткое уведомление роутера;
- delivery acknowledgement.

Relay не переносит полный Android API, LuCI, SSH, Wi-Fi password, UCI, журнал, произвольный URL,
shell либо поток трафика домашней сети. Редакторы устройств, групп, расписаний, Wi-Fi и журнала
остаются LAN-only. Роутер остаётся единственным source of truth для прав и результата команды.

Детский APK не участвует в protocol v1. Его будущие запросы сначала приходят на домашний роутер,
а уже роутер может отправить родителю короткое уведомление.

## Схема

```text
Телефон дома
  -> короткая проверка сохранённого SPKI
  -> локальный pinned HTTPS -> Sheepfold API

Телефон вне дома или local endpoint недоступен
  -> HTTPS 443 -> opaque relay <- HTTPS long poll <- домашний роутер

Opaque relay
  -> видит routerId/phoneId/messageId, сроки и размер
  -> хранит и выдаёт ciphertext до явного ack
  -> не получает local admin Bearer, ключи содержимого, UCI или пароль роутера
```

Оба клиента сами создают исходящие HTTPS-соединения. На WAN домашнего роутера не появляется
listener, port forwarding, VPN либо постоянный support tunnel.

## Что взято из похожих проектов

- Как в Tailscale, прямой путь и relay являются маршрутами одного логического сообщения:
  `messageId` не меняется при fallback, а relay не расшифровывает данные.
- Как в Home Assistant Companion, внутренний и внешний адрес выбираются централизованно. Но
  Sheepfold не доверяет одному SSID/BSSID: локальным считается только endpoint, который реально
  ответил за ограниченное время и подтвердил сохранённый SPKI.
- Как в ntfy, непрочитанное хранится до явного `ack`; poll поддерживает bounded batch и срок
  жизни. Между первым чтением и подпиской выполняется повторная проверка, поэтому сообщение не
  получает лишнюю задержку из-за lost-wakeup race.
- Как в OpenWISP, OpenWrt-клиент использует UCI, проверку TLS, ограниченные retries, случайную
  задержку после boot и procd. Принятие сервером не считается успешным применением команды.

WebSocket и MQTT для v1 не выбраны: один 25-секундный HTTPS long poll проще, уже совместим с
`curl`/`ca-bundle` и не требует постоянно работающего Android-сокета. FCM также не является
источником команд и не нужен для первой версии.

## Фиксированный профиль соединения

### Домашний роутер

Планируемая минимальная UCI-секция клиента:

```uci
config message_relay 'message_relay_global'
	option enabled '0'
	option base_url ''
	option protocol_version '1'
```

| Параметр | Значение |
|---|---:|
| transport | исходящий HTTPS POST/long poll, TCP 443 |
| connect timeout | 8 секунд |
| long poll | 25 секунд |
| полный request timeout | 35 секунд |
| heartbeat при отсутствии сообщений | 60 секунд |
| reconnect | 1..60 секунд, jitter 20% |
| boot jitter | 0..15 секунд |
| batch | не больше 20 envelope |
| envelope | не больше 16 КБ |
| plaintext | не больше 8 КБ |
| команда | TTL не больше 120 секунд |
| результат команды | TTL не больше 24 часов |
| уведомление | TTL не больше 24 часов |
| mailbox | не больше 100 сообщений и 256 КБ на получателя |

`Retry-After` принимается только в диапазоне 5..300 секунд. Один здоровый poll обычно позволяет
роутеру начать обработку команды не позднее 30 секунд после её приёма сервером. Это целевой
предел, а не обещание при обрыве интернета, backoff, неверном времени либо перезапуске сервера.

`base_url` допускает только HTTPS URL с DNS hostname, без userinfo, query и fragment. Raw IP,
обычный HTTP и URL из неподписанного текста GitHub отклоняются. Клиент хранит последний успешно
проверенный endpoint; обновить его можно только подписанным endpoint manifest.

**Почему выбран этот способ / нюансы.** Короткий TTL команды ограничивает окно, в котором router
может выполнить side effect. Для уже сформированного зашифрованного `commandResult` выбран отдельный
TTL 24 часа: это не продлевает право выполнить команду, но позволяет телефону получить результат
после offline/Doze/15-минутного окна WorkManager. Mailbox остаётся ограничен количеством и байтами,
поэтому более длинное окно ответа не превращается в неограниченное server storage.

### Родительский Android APK

| Параметр | Значение |
|---|---:|
| policy | `local_preferred` |
| local probe | 2500 мс |
| relay connect timeout | 5000 мс |
| foreground long poll | 25 секунд |
| read timeout | 30 секунд |
| foreground reconnect | 2..60 секунд, jitter 20% |
| durable outbox | не больше 100 сообщений |
| background best effort | WorkManager, не чаще 15 минут |

30-секундная реакция относится к роутеру, который постоянно поддерживает long poll. Android в
фоне без push-провайдера не обещает мгновенное получение уведомления: WorkManager может дать
задержку 15 минут и больше. В foreground APK может использовать тот же 25-секундный poll.

**Почему выбран этот способ / нюансы.** Постоянный background long poll конфликтует с Android
power-management, поэтому он разрешён только в foreground, а WorkManager выполняет короткие
bounded cycles. Отдельный 24-часовой TTL результата делает такую задержку переносимой; one-time
worker после команды остаётся только ускорением и не считается гарантией доставки при Doze/offline.

## Исполнимый protocol v1

Публичный source of truth находится в [`../tools/messageRelay/README.ru.md`](../tools/messageRelay/README.ru.md):

- два независимых случайных 256-битных ключа `phoneToRouter` и `routerToPhone`;
- `HMAC-SHA256+AES-256-GCM`: message-key выводится HMAC-SHA256 из directional master key и exact
  fixed metadata; IV `0x00000000 || uint64be(sequence)` (96 бит), tag 128 бит;
- фиксированный бинарный AAD связывает metadata с ciphertext;
- ID являются случайными 128-битными base64url значениями;
- отдельной подписи в v1 нет: GCM tag аутентифицирует сообщение участнику с парным ключом;
- `actionHash` связывает allowlisted action с каноническим body;
- ключи содержимого никогда не передаются relay.

Внешний envelope имеет точный регистр и полный набор полей:

```json
{
  "protocolVersion": 1,
  "cryptoSuite": "HMAC-SHA256+AES-256-GCM",
  "direction": "phoneToRouter",
  "messageClass": "command",
  "routerId": "<22-char-base64url>",
  "phoneId": "<22-char-base64url>",
  "streamId": "<22-char-base64url>",
  "messageId": "<22-char-base64url>",
  "sequence": 7,
  "issuedAt": 1787421000,
  "expiresAt": 1787421120,
  "keyId": "<22-char-base64url>",
  "ciphertext": "<base64url-ciphertext-plus-tag>"
}
```

Sender до шифрования durable-резервирует следующий `sequence`; повтор sequence с тем же
направленным ключом запрещён. На OpenWrt можно заранее резервировать небольшой блок, чтобы не
писать flash для каждого сообщения. Новый stream получает новые ключи и начинает sequence с 1.

Duplicate JSON keys, другой регистр, неизвестные поля, padding base64url, неправильный TTL и
изменённый AAD отклоняются. Сервер проверяет внешний envelope; телефон и роутер после успешной
проверки GCM отдельно проверяют строгий decrypted payload.

**Почему выбран этот способ / нюансы.** Отдельный per-message key, связанный с exact metadata и
свежим 128-битным `messageId`, не повторяет пару AES key/IV даже при rollback durable sequence;
сам sequence всё равно сохраняется до шифрования для replay/order и exact retry. Это специально
выбрано вместо надежды на неоткатываемый Android API 28 counter, которого portable foundation не
имеет.

## Server API v1

Закрытый server runtime уже реализует следующие loopback endpoints относительно `/v1`:

| Endpoint | Участник | Результат |
|---|---|---|
| `GET /health` | reverse proxy/monitor | только readiness и protocol major |
| `POST /router/enroll` | роутер | одноразовая регистрация router identity |
| `POST /router/phones` | роутер | выпуск отдельного phone credential |
| `POST /router/phones/revoke` | роутер | отзыв телефона и очистка его очередей |
| `POST /router/messages` | роутер | enqueue ciphertext телефону |
| `POST /router/poll` | роутер | long poll phone-to-router |
| `POST /router/ack` | роутер | удалить только обработанные сообщения |
| `POST /phone/messages` | телефон | enqueue ciphertext роутеру |
| `POST /phone/poll` | телефон | long poll router-to-phone |
| `POST /phone/ack` | телефон | удалить только обработанные сообщения |

Router и phone credentials являются независимыми случайными 256-битными bearer. Они передаются
только в `Authorization`, никогда в URL, и хранятся сервером только как SHA-256. Это transport
credentials, а не ключи содержимого. Компрометация relay может вызвать отказ или повтор ciphertext,
но GCM, TTL, sequence, dedup и повторная router-side проверка не дают выполнить новую команду.

HTTP `200/202 accepted` означает только «ciphertext принят в очередь». Команда считается
выполненной после расшифрованного и аутентифицированного `commandResult` от роутера.

`ack` идемпотентен: успешный ответ содержит отсортированный проверенный набор запрошенных
`messageId`, даже если предыдущий такой же `ack` уже удалил записи, но его HTTP-ответ потерялся.

Сервис в private repo:

- слушает только `127.0.0.1:8790`;
- работает отдельным UID `sheepfold-relay`;
- имеет отдельные credential и mailbox каталоги;
- ограничивает запросы, poll, размер и заполнение файловой системы до 90%;
- хранит сообщение до `ack` или TTL;
- принимает точный повтор `messageId`, но отклоняет тот же ID с другим envelope;
- умеет локально отозвать весь роутер вместе с телефонами и очередями.

**Почему выбран этот способ / нюансы.** At-least-once delivery требует durable приёма до `ack`, а
идемпотентный ответ на повторный `ack` закрывает окно «удаление произошло, ответ потерян». Это не
делает server acceptance исполнением команды: side effect и его результат подтверждает только
роутер после локальной проверки прав.

Публичная DNS/TLS-граница Caddy развёрнута только для synthetic pilot; сам relay по-прежнему
слушает `127.0.0.1:8790`, а порт `8790` не открыт в WAN. Health/negative gates текущей версии
пройдены; reboot gate относится к предыдущему immutable release, последняя incident-версия не
перезагружалась. Ни одна из этих server-проверок не проверяет Android production/device flow или
отсутствующий OpenWrt runtime. Поэтому
`clientsReady=no`, `realDataAllowed=no`, router-side client UCI `message_relay.enabled` не вводится
либо остаётся `0`, enrollment не создавался и реальные credentials/семейные данные не использовались.

## Enrollment и ключи

### Роутер на сервере

Это проектируемая последовательность; до готового и проверенного OpenWrt runtime выполнять её с
live server запрещено.

1. Оператор локально выполняет `sheepfold-message-relay-admin create-enrollment`.
   **Почему / нюансы:** code создаёт оператор в доверенной SSH-сессии, чтобы public endpoint не
   выдавал новые router identities без отдельного административного действия.
2. Полученный `SFMR1-...` действует 10 минут и используется один раз.
   **Почему / нюансы:** короткий одноразовый срок ограничивает окно кражи; повторное использование
   после любого подтверждённого ответа запрещено.
3. Роутер отправляет code и `protocolVersion=1` по HTTPS с обычной проверкой CA/hostname.
   **Почему / нюансы:** system CA и exact DNS hostname дают переносимую server authentication;
   raw IP/HTTP и самоподписанное доверие здесь не допускаются.
4. Server атомарно сжигает code и возвращает случайные `routerId` и router credential.
   **Почему / нюансы:** атомарность не даёт двум запросам получить identity по одному code; потеря
   неоднозначного ответа не разрешает оживлять тот же code.
5. Роутер сохраняет credential в файле `0600`; UCI содержит только несекретные connection options.
   **Почему / нюансы:** UCI легко попадает в backup/diagnostics, поэтому bearer отделён от
   reviewable `enabled/base_url/protocol_version`.

Код нельзя передавать в query, сохранять в UCI или журнал. Потерянный ответ не восстанавливает
старый код: оператор создаёт новый. При компрометации router identity оператор выполняет
`sheepfold-message-relay-admin revoke-router <routerId>`.

### Родительский телефон

Это design-only provisioning flow: текущий Android foundation не вызывает его из UI/lifecycle.

1. Телефон завершает обычное локальное `SF2` pairing и проверяет router SPKI.
   **Почему / нюансы:** relay identity выдаётся только уже локально подтверждённому администратору,
   а не неизвестному интернет-клиенту.
2. APK создаёт случайные `phoneId`, `streamId`, два направленных master key и `keyId`.
   **Почему / нюансы:** разные направления исключают reflection/key reuse; новые stream/key нужны
   при повторной регистрации, а IDs должны поступать из CSPRNG.
3. Только по локальному pinned HTTPS APK передаёт роутеру IDs и ключи содержимого.
   **Почему / нюансы:** public relay остаётся ciphertext-only и никогда не получает content keys.
4. Роутер повторно проверяет admin Bearer/binding и вызывает server `/router/phones`.
   **Почему / нюансы:** одна успешная TLS-сессия не заменяет актуальную локальную авторизацию и
   проверку отзыва administrator-device.
5. Роутер возвращает APK отдельный phone credential; server не получает AES-ключи.
   **Почему / нюансы:** transport bearer можно отозвать на server, не раскрывая и не переиспользуя
   local Android Bearer или E2E keys.
6. APK хранит credential и ключи под отдельным Android Keystore alias, не под
   `sheepfold-admin-token`.
   **Почему / нюансы:** отдельный alias/bundle ограничивает смешение trust domains и позволяет
   отключить relay, не удаляя рабочее локальное сопряжение.

Повторная регистрация меняет `streamId`, credential и ключи. Отзыв локального administrator
device отзывает phone identity; даже при недоступном сервере router dispatcher перед каждым
side effect заново проверяет актуальную привязку, чёрный список устройств и identity quarantine.

## Local-first и защита от повтора

1. Команда получает `messageId`, `sequence`, `issuedAt`, `expiresAt`, шифруется один раз и durable
   попадает в outbox.
   **Почему / нюансы:** local и public route обязаны нести одни bytes; новый ID при retry создал бы
   вторую логическую команду.
2. До любого local I/O APK durable отмечает `LOCAL_ATTEMPT`, затем максимум 2500 мс пробует только
   сохранённый endpoint со старым SPKI.
   **Почему / нюансы:** marker закрывает crash-window до POST, а короткий total deadline сохраняет
   local-first UX; SSID сам по себе не является доверием.
3. Public fallback разрешён сразу только при доказанном `Unreachable` до передачи HTTP body.
   **Почему / нюансы:** DNS/connect/TLS failure до body доказывает, что router не мог исполнить
   команду; любой post-body сбой такого доказательства не даёт.
4. После возможной передачи body, timeout, malformed/oversize ответа или crash APK сохраняет
   `INDETERMINATE` и выполняет lookup результата того же `messageId`, не создавая новую команду.
   **Почему / нюансы:** потерянный ответ не сообщает, был ли side effect; безопаснее показать
   неопределённость, чем повторить действие вслепую.
5. Только strict authenticated local response с exact `Content-Type: application/json`, полями
   `protocolVersion=1`, `requestMessageId=<тот же messageId>`, `error=notFound` и без неизвестных
   полей разрешает public fallback. Empty/generic `404`, другой ID/version/content-type не разрешают.
   **Почему / нюансы:** request-bound ответ не позволяет stale/cached/misrouted `notFound` другого
   запроса открыть fallback. OpenWrt lookup должен быть linearized с durable pre-side-effect dedup;
   пока runtime отсутствует, это обязательный integration gate, а не доказанное production-свойство.
6. Роутер до side effect атомарно сохраняет dedup record. Повтор возвращает прежний результат.
   **Почему / нюансы:** server даёт at-least-once delivery, поэтому exactly-once network delivery
   недостижима; durable dedup превращает повторы одного ID в один side effect.
7. Server ack отправляется только после durable приёма/обработки получателем, а не сразу после GET.
   **Почему / нюансы:** crash после GET не должен удалить единственную копию; повторный idempotent
   ack безопасен, если предыдущий HTTP-ответ потерян.

Это обязательный target contract, а не описание полностью готового Android runtime. Сохранённый
Android handoff ещё не ставит durable public-attempt marker до HTTP I/O и принимает старую
непривязанную форму local `{"error":"notFound"}`. Точный порядок исправлений и regression gates
зафиксирован в [`family-message-relay-continuation-plan.ru.md`](family-message-relay-continuation-plan.ru.md).

**Почему выбран этот способ / нюансы.** Явное расхождение current/target не позволяет следующему
агенту принять подробную схему за уже доказанное поведение и случайно подключить unfinished client
к production endpoint.

Окончательные состояния: `executed`, `rejected`, `expired`, `indeterminate`. Последнее означает,
что после сбоя роутер не может доказать итог side effect: APK не повторяет действие вслепую, а
показывает неопределённый результат и ждёт безопасной сверки состояния. `accepted` означает только
ожидание, а `confirmation_required` требует отдельного локально согласованного protocol extension;
в текущую allowlist v1 опасные произвольные действия не входят.

## Отказы

| Ситуация | Поведение |
|---|---|
| Relay недоступен, телефон дома | local pinned HTTPS продолжает работать |
| Relay недоступен, телефон вне дома | `Офлайн`; local token не удаляется |
| Local endpoint недоступен до HTTP body | после 2500 мс fallback с тем же `messageId` |
| Local POST мог дойти, но ответ потерян/повреждён | `INDETERMINATE`, lookup того же `messageId`; generic `404` не открывает fallback |
| TLS hostname/CA не совпал | relay остановлен, HTTP fallback запрещён |
| Server `401/403` | relay credential считается отозванным; local pairing сохраняется |
| `429` | bounded `Retry-After` и jitter, без busy loop |
| `503 storageCapacityReached` | outbox сохраняется, повтор позднее |
| Ответ server потерян после enqueue | точный retry даёт duplicate, не вторую команду |
| Время роутера явно неверно | команды не исполняются до NTP sync; родителю показывается ошибка |

## Данные и хранение

Relay видит `routerId`, `phoneId`, `streamId`, `messageId`, направление, класс, sequence, сроки,
`keyId`, размер ciphertext, IP/TLS metadata ingress и времена доставки. Он не видит
команду, параметры, семейные правила, MAC, SSID, local Bearer и текст уведомления.

Команда хранится максимум 120 секунд, уведомление максимум сутки; `ack` удаляет раньше. Credential
state хранится постоянно до revoke. Live synthetic pilot хранит пустое persistent mailbox state в
`/var/lib/sheepfold-message-relay` на VPS NVMe; enrollment и реальные данные не использовались.
Это не доказывает backup/restore или client-side durability. Телефон и роутер всё равно должны
держать bounded outbox до окончательного результата.

## Оставшиеся блокеры

1. Сохранить `clientsReady=no`, `realDataAllowed=no` и не выпускать enrollment до готовности
   обоих clients.
   **Почему выбран этот способ / нюансы:** прошедшие server gates доказывают только synthetic
   transport boundary, а не безопасную обработку команды реальными получателями.
2. Завершить package install/UID и ABI-проверки уже реализованного native helper; реализовать
   OpenWrt relay client, linearized dedup/result lookup и root dispatcher.
   **Почему выбран этот способ / нюансы:** router должен durable принять сообщение и повторно
   проверить локальные права до side effect; server этого доказать не может.
3. Подключить существующий выключенный Android foundation к reviewed production provisioning,
   UI/lifecycle только после instrumented API 28 и физического device gate.
   **Почему выбран этот способ / нюансы:** JVM/source tests проверяют protocol/state transitions, но
   не доказывают реальный Keystore, process death, WorkManager/Doze и network cancellation races.
4. Пройти один golden vector на Android API 28 и OpenWrt 24.10/25.12.
   **Почему выбран этот способ / нюансы:** одинаковый vector проверяет byte-level совместимость
   AAD, derived IV и canonical JSON между тремя runtime.
5. Проверить server outage, lost response, revoke, clock skew, client power loss и 30-секундный
   бюджет на Xiaomi AX3000T или более слабом поддерживаемом роутере.
   **Почему выбран этот способ / нюансы:** прежний server release прошёл reboot gate, а текущий
   incident release имеет только no-reboot post-deploy evidence; ни один server gate не заменяет
   client-side recovery и проверку реального OpenWrt/Android поведения.
6. Обновить privacy/agreement отдельным пользовательским согласием и только затем показать toggle.
   **Почему выбран этот способ / нюансы:** включение real-data processing является отдельным
   пользовательским и юридическим решением, а не следствием успешного synthetic pilot.

## Проверки

Публичный контракт:

```powershell
node --test tests/familyMessageRelayProtocol.test.mjs tests/familyMessageRelayArchitecture.test.mjs
```

**Почему выбран этот способ / нюансы:** одна focused-команда одновременно проверяет exact wire
contract и документационную границу выключенной функции, не запуская client runtime или deploy.

Private server, из корня `sheepfold-support-server`:

```powershell
npm.cmd --prefix . run test:contracts
npm.cmd --prefix . run test:runtime
npm.cmd --prefix . run test:openwrt
node scripts/checkPublicMessageRelayVendor.mjs --peer C:\path\to\luci-app-sheepfold-family-internet-control
```

**Почему выбран этот способ / нюансы:** `--prefix .` явно привязывает npm scripts к открытому
корню private repo; в public `package.json` этих script names нет. Vendor check сравнивает точные
public bytes, но не разрешает enrollment или реальные данные.

Зелёные Node-тесты доказывают строгий формат, очередь и loopback HTTP flow. Отдельные synthetic
deployment gates доказывают DNS/TLS/Caddy boundary, negative cases и восстановление server после
reboot без реальных данных. Ни то ни другое не доказывает Android background delivery, client на
живом OpenWrt или client-side устойчивость к потере питания: эти проверки остаются обязательными
перед включением.
