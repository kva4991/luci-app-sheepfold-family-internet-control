# Проверка резервного адреса сервера баг-репортов

<!-- §srepdisc1 §docops1 §testwhy -->

## Цель и граница проверки

Этот runbook проверяет связку private Node signer -> OpenWrt shell/OpenSSL verifier -> router
fallback. Он нужен после изменения формата manifest, endpoint validator, подписи, sequence,
UCI-опции, HTTP-статусов повторной попытки или server-side signer.

Тесты используют временные Ed25519-ключи и синтетические адреса. Они не публикуют manifest,
не обращаются к production server, не меняют UCI настоящего роутера и не доказывают работу
GitHub, DNS, TLS-сертификата либо внешнего endpoint. Эти границы проверяются отдельно.

## Предварительные условия

Все команды публичного проекта выполняются из его корня, где находятся `package.json`,
`tests/` и `package/`.

На Windows должны быть доступны:

```powershell
node --version
npm.cmd --version
bash --version
openssl version
```

Ожидается exit code `0` и непустая версия каждой программы. `bash` должен быть Git Bash.
Глобальный Gradle, Android SDK и подключённый роутер для этого набора не нужны.

## 1. Синтаксис production shell

```powershell
bash -n package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-support-report package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-support-endpoint-discovery
```

Ожидаемый результат: нет вывода, exit code `0`. Любой текст ошибки и ненулевой код означают
ошибку shell-синтаксиса. Успех этой команды не проверяет подпись, UCI или HTTP-поведение.

## 2. Основной локальный контракт

```powershell
node --test tests/supportEndpointDiscovery.test.mjs tests/supportReportTransport.test.mjs tests/testCategories.test.mjs
```

Ожидаемый результат:

- `supportEndpointDiscovery ...` имеет отметку `pass`;
- все восемь проверок suite `encrypted support report transport` проходят;
- карта категорий принимает новый test-файл;
- итог содержит `fail 0` и процесс возвращает exit code `0`.

На момент записи runbook набор содержит 14 тестов. Число может вырасти; источником истины
являются имена обязательных проверок, `fail 0` и exit code, а не навсегда закреплённое число.
Первый тест реально запускает OpenSSL и на Windows с антивирусом может идти 5-20 секунд.

## 3. Упаковка OpenWrt

```powershell
node --test tests/testIpkPermissions.test.mjs tests/productVariants.test.mjs
```

Ожидаемый результат: обе редакции тестового IPK собираются, libexec-файлы присутствуют с
правильными правами, зависимости `curl`/`openssl-util` сохранены, `fail 0`. На момент записи это
26 тестов.

В Codex sandbox команда может завершиться `spawnSync python EPERM` или `status: null` ещё до
запуска `scripts/build-test-ipk.py`. Это ограничение запуска дочернего Python. Повторить только
эти два файла вне песочницы с разрешением пользователя. Не изменять production-код и не
ослаблять assertions из-за `EPERM`.

## 4. Документация и JavaScript

```powershell
npm.cmd run lint:js
npm.cmd run quality:docs:all
git diff --check
```

Ожидаемый результат:

- ESLint завершается без diagnostics;
- документационный аудит сообщает, что ссылки, §-теги, имена тестов и npm-команды исправны;
- `git diff --check` не печатает ошибок пробелов и возвращает `0`.

Количество Markdown-файлов в сообщении аудита меняется по мере развития проекта и не является
контрактом.

## 5. Закрытый server-side signer

Команды выполняются из корня соседнего private `sheepfold-support-server`:

```powershell
npm.cmd test
node scripts/checkPeerContract.mjs --peer C:\path\to\luci-app-sheepfold-family-internet-control
node scripts/checkPublicProtocolVendor.mjs --peer C:\path\to\luci-app-sheepfold-family-internet-control
```

Ожидается:

- `endpointManifest accepts the exact signed HTTPS endpoint` проходит;
- подмена endpoint, HTTP и дополнительное поле отклоняются;
- `npm.cmd test` заканчивается `fail 0`;
- без `SHEEPFOLD_CLIENT_REPO` один peer-test может штатно показываться как `skipped`;
- две явные peer-команды возвращают JSON со `status: "ok"`.

Не запускать `endpoint:manifest` с production private key ради обычной проверки. Unit-тест сам
создаёт временную пару. Настоящий signer используется только по церемонии выпуска из
`sheepfold-support-server/docs/endpoint-discovery.ru.md`.

## 6. Проверка на тестовом роутере

До публикации production manifest безопасно проверяется только локальная верификация заранее
подписанного синтетического файла:

```sh
/bin/sh /usr/libexec/sheepfold/sheepfold-support-endpoint-discovery verify-file /tmp/support-report-endpoint-v1.txt '<test-public-key>'
```

Ожидаемый stdout:

```text
endpoint=https://<synthetic-host>/v1/reports
sequence=<number>
```

Изменённый после подписи файл обязан завершиться ненулевым кодом и
`error=manifest_signature`. Команда `verify-file` не меняет UCI и accepted state.

Полный `resolve -> POST -> accept` выполняется только на тестовом роутере после появления
действительного test HTTPS endpoint и подписанного test manifest по фиксированному пути. Перед
проверкой сохранить `/etc/config/sheepfold`; после неё подтвердить новый endpoint, state-файл,
журнал и отсутствие изменений HPKE keyset. Production private key на роутер не копируется.

## Распространённые ошибки

| Ошибка | Что означает | Правильное действие |
|---|---|---|
| `error=discovery_not_configured` | В UCI пустой verification key | Для обычной поставки это ожидаемый безопасный default; не подставлять случайный ключ |
| `error=discovery_unavailable` | GitHub-файл отсутствует, сеть недоступна или превышен лимит | Основной endpoint остаётся источником истины; проверить URL/CA/DNS, не отключать подпись |
| `error=manifest_signature` | Файл, endpoint, переводы строк или подпись изменились | Выпустить manifest заново offline signer; не править подпись вручную |
| `error=manifest_rollback` | Sequence меньше последнего успешно принятого | Выпустить новую версию с большим sequence |
| `error=manifest_sequence_conflict` | Тот же sequence подписывает другой endpoint | Не переиспользовать номер; увеличить sequence и пройти review |
| `mkdir ... /c/Users/... Permission denied` | В Git Bash под sandbox передан абсолютный Windows/MSYS-путь | Запускать Node-test из корня: он использует относительные `.build`-пути |
| `spawnSync python EPERM` | Sandbox запретил Node запускать builder Python | Повторить только packaging-тесты вне sandbox; код не переписывать |
| Долгое отсутствие вывода | OpenSSL/антивирус или большой category runner ещё работает | Проверить процесс и дождаться одного запуска; не запускать дубликат |

## Как запускать нельзя

- Не запускать два `npm.cmd test` или два одинаковых category runner параллельно: сетевые
  harness-процессы конкурируют и создают ложное впечатление зависания.
- Не добавлять `supportEndpointDiscovery.test.mjs` в `smoke` или `backendFast`: реальный OpenSSL
  на Windows имеет заметное и нестабильное время старта.
- Не вызывать helper из Git Bash с абсолютными `C:\...` путями; используйте проектный Node-test
  либо POSIX-относительный путь.
- Не считать `bash -n`, статический regexp-test или успешную сборку доказательством всей цепочки.
- Не публиковать `.example.txt` под production-именем и не включать UCI key до готовности
  рабочего endpoint.
- Не редактировать подписанный файл редактором, меняющим CRLF/LF, пробелы или кодировку.
- Не хранить discovery private key в public/private Git, CI, server, router или APK.
- Не разрешать manifest менять HPKE keyset, key ID, токены или настройки семьи.

## Когда проверка считается завершённой

Для обычной правки verifier/signer нужны пункты 1-5 и свежий `git diff --check`. Для включения
production fallback дополнительно обязательны test-router пункт 6, security review, проверка
TLS endpoint, offline-key ceremony и обновление ADR-0026/операционной документации.
