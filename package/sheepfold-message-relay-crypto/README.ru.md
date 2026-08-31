# Криптографический helper SFMR1

<!-- §mrelay1 §testwhy §docops1 -->

Состояние: исходный C helper реализован и проверяется отдельно. Это **не работающий OpenWrt
relay**: нет poller, provisioning, durable ledger, диспетчера команд и подключения Android UI.
Основной LuCI package не зависит от helper и не устанавливает его автоматически. Готовность
клиентов остаётся `clientsReady=no`, `realDataAllowed=no`.

## Ответственность

- `src/relayJson.c`: Jansson с запретом duplicate keys, числовые/размерные границы, exact поля,
  canonical base64url, allowlist payload, actionHash и ограничение глубины до выделения дерева.
- `src/sheepfold-message-relay-crypto.c`: fixed SFMR1 metadata/AAD, HMAC-SHA256 per-message key,
  AES-256-GCM с полным 16-byte tag. Plaintext не выходит до успешной проверки tag и payload.
- `Makefile`: отдельный ABI-dependent package с `jansson`, `libopenssl`, отдельным UID;
  сборка SDK 25.12.5/mediatek/filogic проверена, создание UID при установке ещё не проверено.

Используются [Jansson API](https://jansson.readthedocs.io/en/stable/apiref.html) и
[OpenSSL EVP AEAD](https://docs.openssl.org/3.0/man3/EVP_EncryptInit/). Криптографические
примитивы не реализованы вручную; executable wire source остаётся в
[`tools/messageRelay/`](../../tools/messageRelay/README.ru.md). Все разрешённые ключи полей
payload ASCII, поэтому `JSON_SORT_KEYS` совпадает с сортировкой SFMR1; это **не** универсальная
замена canonical JSON для объектов с произвольными Unicode-ключами.

## Локальный вызов

Helper не принимает аргументов. Один ограниченный JSON-запрос поступает в stdin, вызывающая
сторона закрывает pipe после записи. Секреты нельзя передавать argv, shell env или через журнал.

- Шифрование: exact поля `operation="encrypt"`, `envelope`, `keyRecord`, `now`, `payload`.
  Envelope уже содержит все SFMR1 поля, но `ciphertext=""`; stdout возвращает готовый envelope.
- Расшифрование: exact поля `operation="decrypt"`, `envelope`, `keyRecord`, `now`.
  Stdout возвращает только проверенный payload.
- `keyRecord`: `keyId`, `streamId`, `direction`, `keyBytes` (32 bytes в canonical base64url).
- `now`: проверенное вызывающей стороной Unix-время. Helper проверяет TTL/skew, но сам не
  доказывает правильность системных часов и не синхронизирует NTP.
- Предел stdin 32 КБ, plaintext 8 КБ, сериализованного envelope 16 КБ. На ошибке stdout пуст,
  stderr содержит только `{"error":"fixedCode"}`, exit code `1`. Успех имеет exit code `0`.
- Core dump выключен; рабочие key/plaintext buffers очищаются. Helper обрабатывает один запрос
  и завершается, не держит очередь, не открывает сеть/файлы и не вызывает shell.

Доверенный worker обязан ограничить размер исходного сетевого envelope до parser, ограничить
время дочернего процесса, обеспечить private pipes/UID, актуальные права устройства, durable
sequence и dedup. Валидный AES-GCM tag подтверждает ключ, а не административное право. Helper
сам по себе **не разрешает** выполнять команду и не защищает от повтора старого допустимого ID.

## Проверки

Рабочий каталог: корень public Sheepfold checkout. Linux, Node 22+, C11 compiler, заголовки
Jansson/OpenSSL; root не нужен. На отдельном Debian-стенде зависимости можно установить явно:

```sh
sudo apt-get install --no-install-recommends gcc libc6-dev libjansson-dev libssl-dev
sh tools/messageRelay/runNativeCryptoTests.sh
sh tools/messageRelay/runNativeCryptoTests.sh --sanitize
```

Скрипт создаёт бинарники только в `.build/relay-crypto/`; ничего не устанавливает, не использует
SSH/сеть и не меняет relay/Caddy/UCI. Ожидается exit code `0`, `fail 0`, `skipped 0`.
Проверяются общий Android/Node vector, tamper, scope ключа, expiry, parser, actionHash и все
классы payload на случайных синтетических ID/ключах. Sanitizer дополнительно проверяет доступ
к памяти и undefined behavior; leak detector выключен, поскольку ошибочный запрос завершает
одноразовый процесс. Это не проверка утечек долгоживущего daemon.

Обычный `npm test` запускает только дешёвый guard `tests/nativeMessageRelayCrypto.test.mjs`.
Полный native gate запускается вручную при изменении helper/protocol или перед его поставкой.
Можно использовать готовый **проверенный** бинарник без повторной сборки:

```sh
SHEEPFOLD_RELAY_CRYPTO=/absolute/path/relay-crypto node --test tools/messageRelay/nativeCrypto.test.mjs
```

Без абсолютного пути тест завершится ошибкой, а не пропуском. `jansson.h: No such file` означает
отсутствие dev headers; `undefined reference` означает неверный link set. Запуск shell-скрипта
непосредственно в PowerShell или попытка выполнить Linux ELF на Windows не поддерживаются.
Не копировать реальные key bundles в fixtures. На VPS запускать под обычным оператором в
отдельном временном каталоге, не внутри `/opt/.../current` и не от service UID.

## Проверка OpenWrt 30.08.2026

Обычный Linux amd64 gate и ASan/UBSan прошли по 6 тестов. Официальный SDK
25.12.5/mediatek/filogic собрал настоящий OpenWrt APK и aarch64 helper размером 33 624 байта.
На Cudy WR3000S v1 с OpenWrt 25.12.5 бинарник запущен из RAM `/tmp` от `nobody:nogroup`
через `start-stop-daemon -S -c nobody:nogroup -x <absolute-binary>` с JSON только в stdin.
Прошли golden decrypt/encrypt и отказы при tamper, expiry, duplicate JSON key и oversized input.
Проверялся только helper: package не устанавливался, службы и UCI не менялись, временный бинарник
после проверки удалён. Это не полный native fuzz gate на роутере и не проверка создания service UID.

SHA-256 проверенного бинарника:
`fc7c43b61e1894a8efc8db62426e5f09a10e58f7be464f05c02e8cf91271b585`.
Полный helper вместе с зависимостями занимает больше 33 КБ: на этом роутере Jansson/OpenSSL
уже установлены; размер зависимостей нельзя исключать из требований к новой установке.

Для повторной сборки используйте Linux и официальный SDK точной версии/target роутера,
проверенный по официальному `sha256sums`. Из корня распакованного SDK, после копирования
`package/sheepfold-message-relay-crypto/` в его `package/`, выполните:

```sh
./scripts/feeds update base
./scripts/feeds install -p base libopenssl jansson
make defconfig
nice -n 19 make package/sheepfold-message-relay-crypto/compile -j1 V=s
```

Для воспроизводимости этот проход использовал base feed
`f0a60eee2fe051741c643ea6118718aae1ef17fb`; новый проход должен сверить feed revision, а не
незаметно принимать новую версию. Успех: exit code `0` и пакет
`bin/packages/aarch64_cortex-a53/base/sheepfold-message-relay-crypto-0.1.0-r1.apk`.
Не устанавливайте непроверенную подпись этого лабораторного APK и не заменяйте доверенные ключи.

SDK требует `make`, `g++`, `gawk`, `git`, `zstd`, `unzip`, `rsync`, `patch`, `file`, `wget`,
`libncurses-dev`, `bzip2`; отсутствие prereq исправляется установкой зависимости, не `FORCE=1`.
Храните SDK на диске, не в RAM `/tmp`. Его стандартные `CONFIG_ALL*` могут вытянуть firmware,
kernel metadata и сборку OpenSSL даже для маленького helper. Перед новым стендом выбирайте
минимальный профиль; уже подготовленный проверенный SDK/cache стоит переиспользовать.
Не меняйте config и не запускайте второй `make` в том же SDK во время сборки.

SDK добавляет собственный `_FORTIFY_SOURCE`; `-Werror` запрещает повторное определение.
Поэтому Makefile после `TARGET_CFLAGS` сначала снимает прежнее определение через `-U`, затем
выставляет `2`. Удалять `-Werror` или защиту ради прохождения сборки не нужно.
При SSH-сборке включайте keepalive и сохраняйте лог: обрыв SSH не доказывает остановку `make`.
Сначала проверяйте процесс и конец лога, чтобы не запустить дублирующую сборку.

OpenWrt 24.10, остальные ABI, install/upgrade UID, procd, отключение электричества и сквозное
выполнение команды с телефона остаются в [плане интеграции](../../docs/family-message-relay-continuation-plan.ru.md).
