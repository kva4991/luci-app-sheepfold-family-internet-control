# Исполнимый контракт family message relay

<!-- §mrelay1 -->

Этот каталог является публичным источником истины для коротких сообщений между родительским
Android APK и домашним роутером через недоверенный relay. Серверный проект обязан фиксировать
точную vendor-копию схем, reference-кода и golden vector; совпадение только номера версии
недостаточно. Manifest использует SHA-256 каждого exact path из `peer-project.json`, включая все
импортируемые executable-модули; пропущенный или лишний путь не считается совпадением контракта.

## Что здесь проверяется

- регистр и полный набор JSON-полей;
- 128-битные случайные идентификаторы и `sequence >= 1` в безопасном JSON-диапазоне;
- направление сообщения и максимальный срок жизни;
- фиксированный бинарный AAD, который связывает routing metadata с ciphertext;
- `HMAC-SHA256+AES-256-GCM`: отдельный message-key выводится из directional master key и exact
  authenticated metadata; IV остаётся `0x00000000 || uint64be(sequence)`, tag — 128 бит;
- точная привязка key record к `direction + streamId + keyId`;
- allowlist команд и `actionHash = SHA-256("SFMR1/actionHash\0" || canonicalJson({action, body}))`;
- exact body для каждого типа сообщения и абсолютный `grantUntil` для временного доступа;
- максимальный envelope 16 КБ и plaintext 8 КБ;
- повторяемый golden vector для Node, Android API 28 и OpenWrt helper.

## Почему не HPKE на каждое сообщение

Телефон и роутер уже имеют локальный pinned-HTTPS канал при сопряжении. Через него можно передать
две независимые случайные 256-битные ключевые строки: одну `phoneToRouter`, вторую
`routerToPhone`. Каждый stream получает новую пару ключей и начинает sequence с 1. Это сохраняет
сквозное шифрование от relay, не требует тяжёлой HPKE-реализации на маломощном роутере и разделяет
IV-пространства направлений.

Sender до шифрования durable-резервирует следующий sequence. Пропуск после сбоя допустим, повтор
sequence с тем же direction key запрещён. Ключ нельзя переносить в новый stream, восстанавливать
вместе с откатившимся счётчиком или использовать после исчерпания sequence. На OpenWrt разрешено
заранее durable-резервировать небольшой блок sequence, чтобы не записывать flash для каждого
сообщения.

Ключи никогда не отправляются на центральный сервер. На Android они шифруются отдельным ключом
Android Keystore, на роутере лежат в отдельных файлах `0600`. AES-GCM tag является проверкой
подлинности для участника с парным ключом, поэтому отдельная внешняя подпись в v1 не добавляется.
Роутер всё равно перед каждым side effect заново проверяет актуальную административную привязку.

Message-key вычисляется как `HMAC-SHA256(directionMasterKey, context || fixedMetadata)`, где
`context` — ASCII `SheepfoldFamilyMessageRelay/subkey` с терминальным NUL, а `fixedMetadata` —
big-endian version/direction/class, пять decoded 16-byte ID и три `uint64` времени/sequence в том
же порядке, что в AAD. Exact retry поэтому даёт те же key/IV/ciphertext, а свежий 128-битный
`messageId` меняет AES key даже после rollback счётчика.

**Почему выбран этот способ / нюансы.** API 28 не даёт portable rollback-resistant monotonic
counter. Один AtomicFile предотвращает partial write, но не replay всего старого файла; subkey от
fresh CSPRNG `messageId` разрывает опасную связь между rollback sequence и повтором пары key/IV.
Остаётся вероятностная граница коллизии 128-битного ID, поэтому ID генерируется только CSPRNG, а
повтор того же `messageId` с другими байтами всегда является conflict.

`decryptEnvelope()` возвращает уже проверенный payload и требует совпадения `messageClass` с
`messageType`. Replay/dedup state обновляет вызывающая сторона только после успешных GCM tag,
TTL и payload validation. `temporaryAccessGrant` передаёт абсолютный `grantUntil`, поэтому retry
не начинает новый интервал; выполняется `now < grantUntil`, `issuedAt < grantUntil` и
`grantUntil <= issuedAt + 86400`. `commandResult` имеет exact `status + errorCode + completedAt`;
неопределённый после сбоя результат обозначается `indeterminate/stateIndeterminate`.
Команда имеет TTL не больше 120 секунд, а `commandResult` и notification — не больше 24 часов.

**Почему выбран этот способ / нюансы.** Короткий TTL ограничивает окно исполнения side effect.
Более длинный TTL уже зашифрованного результата нужен из-за offline/Doze и минимального
15-минутного периода WorkManager; он не продлевает действие команды, а mailbox остаётся bounded.

Canonical JSON сортирует ключи по UTF-16 code units и допускает только finite safe integers без
`-0`; duplicate keys, NUL и непарные UTF-16 surrogate отклоняются до вычисления hash.

## Как проверять

```powershell
node --test tests/familyMessageRelayProtocol.test.mjs
```

**Почему выбран этот способ / нюансы.** Focused Node test быстро проверяет exact wire bytes,
strict JSON, TTL и tamper detection в canonical implementation. Он не доказывает Android API 28,
физическое устройство или OpenWrt target helper — эти gates выполняются отдельно.

Native реализация и ручной Linux gate описаны в
[README helper](../../package/sheepfold-message-relay-crypto/README.ru.md).
`runNativeCryptoTests.sh` собирает одноразовый helper, а `tools/messageRelay/nativeCrypto.test.mjs` сравнивает
его с этим reference-кодом на synthetic fixtures. Эти инструменты не входят в vendor
wire model и не включают relay, enrollment или исполнение команд на роутере.

При изменении любого поля сначала меняются executable model, схемы и vector, затем Android и
OpenWrt implementations, после чего обновляется pinned vendor manifest закрытого server project.
Старый major продолжает приниматься сервером до явно спланированного окончания совместимости.
