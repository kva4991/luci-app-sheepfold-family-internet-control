# Исполняемый контракт удалённой техподдержки

<!-- §rsup001 -->

Эта папка содержит исполняемый reference-контракт и локальный стенд экспериментального
control-профиля. Он проверяет точные байты подписи, строгий JSON, сроки, replay-защиту и обмен
с настоящим private control service до появления OpenWrt manager.

Она **не является runtime Sheepfold** и не должна импортироваться в LuCI, shell/ucode backend или APK:

- модели не открывают сеть; только явно запущенный `runControlPeer.mjs` и HTTP-тест используют
  HTTPS на `127.0.0.1`, без SSH или FRP;
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
- `experimentalPayload.mjs` - точные поля обеих сторон, canonical ID/SSH key, привязка stream/session и запрет преждевременного active;
- `controlClient.mjs` - последовательный клиентский автомат enrollment/capabilities/claim/status/revoke; только volatile state, без network/file side effects;
- `transportPayload.mjs`, `transportClient.mjs` - отдельный экспериментальный CSR/grant-профиль и RAM-only клиент проверки сертификата; не FRP/SSH manager;
- `labChannel.mjs` - HTTPS исключительно к localhost, CA + hostname + certificate pin, два router route, bounded bytes/timeout, без redirect;
- `runControlPeer.mjs` - ручной двусторонний стенд с private HTTPS service, отдельным сертификатом оператора и настоящим TOTP; не читает конфигурацию действующего сервера;
- `schemas/signed-envelope-v1.schema.json` - внешняя JSON Schema;
- `schemas/signed-payload-v1.schema.json` - общая JSON Schema подписанного сообщения;
- `schemas/enrollment-start-v1.schema.json` - единственное узкое неподписанное bootstrap-тело до регистрации публичного ключа роутера; оно всё равно передаётся только через проверенный TLS;
- `schemas/experimental-router-message-v1.schema.json` и `experimental-server-message-v1.schema.json` - рабочие предметные схемы control-профиля; ещё не immutable release;
- `schemas/experimental-transport-message-v1.schema.json` - отдельный one-shot профиль `transportRequest/transportGrant`, без endpoint, CA и приватных ключей;
- `fixtures/protocol-v1-golden.json` - синтетический ключ, точные байты и ожидаемая подпись;
- `peer-project.json` - machine-readable граница с закрытым `sheepfold-support-server`;
- `checkPeerContract.mjs` - симметричная cross-repo проверка contract ID, protocol major и владельца canonical protocol;
- `tests/remoteSupportProtocol.test.mjs` и `tests/remoteSupportSessionSimulator.test.mjs` - исполняемые проверки контракта.

Для полного transport-профиля ещё нужны предметные схемы `claimAccepted/sessionActive`,
relay map, safe-apply, проверенный native adapter и durable manager. CSR/lease теперь описаны
отдельным экспериментальным профилем, не включённым в старый control verifier. Валидация
experimental status намеренно строже общей формы JSON Schema: без transport lease нельзя
принять `sessionReady/sessionActive/reconnecting` или ненулевую lease. Заглушку LuCI не разблокировать.

## Клиентский автомат

`ControlClient` получает отдельный Ed25519 private key, ограниченную карту доверенных server
public keys, часы и monotonic uptime. В стенде ключи синтетические; production trust manifest
и хранилище ключей этот конструктор не заменяет.

| Операция | Результат и ограничения |
|---|---|
| `enrollmentStart({localConsent:true})` | bootstrap с новым nonce, ещё без router ID |
| `acceptChallenge(bytes)` | проверяет server signature, nonce и candidate key ID; возвращает подписанный proof |
| `accept(bytes)` | принимает только ответ текущего запроса, после проверки подписи, полей, scope, deadline и sequence |
| `capabilities()` | объявляет только реально моделируемые `claimV1/localRevokeV1`, не FRP |
| `openClaim({localConsent:true,routerHostKey})` | новый случайный session/code и 72 часа; diagnostic consent по умолчанию false |
| `queryStatus()` | спрашивает только текущую session |
| `localRevoke()` | немедленно закрывает локальное состояние/видимость кода, даже без ответа сервера |
| `revokeRequest()` | после локального закрытия готовит подписанный отзыв; один незавершённый запрос за раз |
| `retry()` | те же bytes/ID/sequence до исходных 60 секунд, без нового кода и продления |
| `status()` / `claimCode()` | безопасная metadata отдельно от кода; `transportReady` всегда false |

Вызовы сами не являются проверкой LuCI ACL, root-password gate или Android credentials.
Caller будущего backend обязан проверить права до передачи `localConsent:true`. Все private
поля живут только в RAM; JavaScript GC не гарантирует немедленное физическое затирание strings.
Нельзя журналировать аргументы, signed request body или результат `claimCode()`.

**Почему выбран этот способ / нюансы.** Разделение автомата, предметной проверки и транспорта
позволяет одинаково проверять contract без Node.js на маломощном роутере. Состояния сериализованы:
новый запрос ждёт ответа предыдущего; потеря ответа не сбрасывает sequence. Replay fingerprint
учитывает все подписанные bytes, а не только ID. Проверка истечения выполняется при вызове
метода; это не фоновый watchdog реального SSH.

При отзыве во время незавершённого запроса поздний ответ не открывает состояние снова.
Открывающие bytes больше не повторяются. Если ответ навсегда потерян, автомат остаётся закрытым:
бесшовный signed status-sync ещё надо специфицировать и реализовать. Создание нового экземпляра
не восстанавливает старые claims или доверие к backup. Это намеренный блокирующий runtime gate,
не обещание durable recovery.

Недостоверные часы необратимо блокируют текущий экземпляр: код и pending bytes очищаются,
а восстановление времени не возобновляет запросы или доступ. Точный контракт
[`clockUntrusted`](../../docs/remote-support-protocol.ru.md) проверяется на уже открытом claim;
это защита RAM-автомата, не watchdog живого SSH.

## Проверка

### Отдельный клиент transport credentials

`TransportClient` получает `identityPrivateKey`, `serverKeys`, `routerId`, `sessionId`, заранее
подтверждённый `accessExpiresAt`, отдельный `transportPublicKey` и закреплённый
`transportCaCertificate`; необязательные `now/uptime` нужны детерминированному стенду.
Сертификат CA задаётся как PEM, DER Buffer или `X509Certificate`. Он не принимается из ответа.
Приватный transport key не является аргументом: caller создаёт CSR и оставляет ключ у себя.

| Метод | Результат |
| --- | --- |
| `request(csrDerBuffer)` | подписанная JSON-строка с отдельным случайным stream и sequence 0; только один запрос на экземпляр |
| `retry()` | исходная строка только до исходного срока запроса; без нового nonce/CSR |
| `accept(wire)` | проверка подписи, binding, CA/SPKI/EKU/срока; возвращает только безопасный status |
| `credentials()` | явная RAM-копия grant, включая секретный token и base64url DER; не писать в журнал/backup/argv |
| `localRevoke()` | очищает pending/reply/grant; поздний ответ не возвращает доступ |
| `status()` | state, IDs, deadlines и булевы признаки; `transportReady:false`, без token/DER |

Состояния: `idle`, `requestPending`, `grantReady`, `revoked`, `sessionExpired`, `securityBlocked`.
Полученный сертификат не подтверждает FRP/SSH: для этого нужен ещё не реализованный native manager.
Expiry проверяется при вызове метода; это не фоновый watchdog. Очистка RAM-ссылок не гарантирует
немедленное физическое затирание JavaScript strings. Полный wire-контракт и причины ограничений:
[`экспериментальный transport-профиль`](../../docs/remote-support-protocol.ru.md#экспериментальный-transport-профиль).

`ControlClient({transportCredentials:true,...})` явно добавляет только `transportCredentialsV1`.
По умолчанию остаются `claimV1/localRevokeV1`; `typedGatewayV1` и готовность SSH не объявляются.

Из корня public checkout, Node.js 20+ и `openssl` в PATH, без сети/private repo:

```powershell
node --test tests/remoteSupportTransport.test.mjs tests/remoteSupportControl.test.mjs
```

Ожидается exit 0/fail 0. Тест создаёт только случайный `sheepfold-transport-client-*` в OS temp,
синтетические Ed25519 keys/CSR/CA/leaves и удаляет каталог в `after`. Ключи не берутся из проекта
или роутера. После аварийного kill удалять только проверенный каталог завершённого запуска.
`ENOENT` обычно означает отсутствие OpenSSL; `EPERM/EACCES` — запрет temp/child process.
Не заменять точный `notAfter` суточным сертификатом ради зелёного теста и не отключать CA/SPKI.
Проверки не доказывают серверный CSR proof-of-possession, публичный HTTP route, FRP/SSH,
установку/reboot на OpenWrt, production trust manifest или активацию поддержки.

### Общий reference-контракт

Рабочий каталог: корень public Sheepfold checkout; PowerShell или POSIX shell, Node.js 20+.
Без private repo и без сети:

```powershell
node --test tests/remoteSupportProtocol.test.mjs tests/remoteSupportControl.test.mjs tests/remoteSupportSessionSimulator.test.mjs tests/remoteSupportArchitecture.test.mjs
```

Если рядом доступен закрытый checkout, дополнительно проверить обе стороны:

```powershell
node tools/remoteSupport/checkPeerContract.mjs --peer C:\path\to\sheepfold-support-server
```

Отсутствие private checkout не ломает обычные public tests и не разрешает считать server runtime реализованным (§rsuppeer).

Golden key намеренно синтетический и публичный. Запрещено использовать его либо производные от него ключи в сервере, пакете или тестовом роутере.

### HTTPS и два проекта

Предварительные условия: `openssl` в PATH, разрешённый loopback socket, два доверенных checkout.
Путь `C:\path\to\sheepfold-support-server` заменить абсолютным путём private repo. Скрипт
импортирует его JS-код: нельзя передавать неизвестный/скачанный непроверенный каталог.

```powershell
node --test tests/remoteSupportControlHttp.test.mjs
node tools/remoteSupport/runControlPeer.mjs --peer C:\path\to\sheepfold-support-server
```

Первый тест входит в категории `security/tooling`, private checkout ему не нужен. Сквозной
стенд запускается вручную при изменении support contract/service или перед полным gate;
обычный public CI не зависит от закрытого репозитория.

Ожидание: exit 0, fail 0. Сквозной стенд печатает одну JSON-строку:
`ok:true,checks:12,tls:true,operatorMfa:true,transportReady:false,immutableRelease:false`.
Он создаёт случайный каталог `sheepfold-control-peer-*` в OS temp, отдельные однодневные
сертификаты server/operator, ephemeral signing/identity keys, store и TLS listener на
`127.0.0.1:0`. В `finally` listener/store закрываются, удаляется только созданный каталог.
При аварийном kill автоматическая очистка не гарантирована; удалять только проверенный каталог
этого запуска после завершения процесса. Реальные key stores, Git, UCI и VPS не затрагиваются.

Проверки: enrollment и обе подписи; честные capabilities; потерянный claim response; отсутствие
открытого кода в store; mTLS + TOTP оператора; сгорание кода и 24 часа; запрет prepare без
transport capability; отказ оператору без сертификата; неправильный server pin; потерянный
revoke response без нового sequence; status после отзыва; реальное закрытие/reopen server store.
Отдельный HTTP-тест проверяет redirects, неверный Content-Type, duplicate JSON, oversized body,
rate limit, разрыв socket и timeout.

Типовые ошибки: `ENOENT` означает отсутствующий openssl/checkout; `EPERM/EACCES` означает
запрет запуска дочернего процесса или записи temp/loopback в среде, а не повод отключить TLS.
`supportPeerFailed` содержит только безопасный `stage`, без ключей/кода/ответа. Не добавлять
дамп private input ради отладки. `storageBusy` не исправлять удалением реального server lock:
стенд использует только свежий temp store.

Запрещены запуск helper на роутере с установкой Node ради теста, WAN bind, настоящий endpoint,
`rejectUnauthorized:false`, обход pin, общий production key или FRP token. Green Node/HTTPS
gate не доказывает native crypto, нагрузку Xiaomi AX3000T, firewall isolation, reboot manager,
работу FRP/Dropbear, safe-apply или production готовность. Публикация public commit и обновление
private vendor revision/SHA-256 остаются отдельным release-шагом.
