# Автоматические тесты Sheepfold

В каталоге находится более ста пересекающихся контрактных, unit, runtime и
статических test-файлов. Этот README намеренно не перечисляет их вручную:
каноническая карта хранится в [`categories.mjs`](categories.mjs), а актуальный
список с количеством файлов выводит команда:

```powershell
npm.cmd run test:list
```

## Обычный запуск

Во время точечной работы запускайте ближайший файл, затем предметную категорию:

```powershell
node --test tests/devicePresence.test.mjs
npm.cmd run test:devices
```

Несколько категорий можно объединить без повторного запуска общих файлов:

```powershell
npm.cmd run test:category -- access devices security
```

Полный набор:

```powershell
npm.cmd test
```

Условия обязательного полного прогона, долгие категории и Windows-обход для
IPK-зависимых тестов описаны в
[`../docs/test-strategy.ru.md`](../docs/test-strategy.ru.md).
Каждый отдельный стенд документируется по операционному контракту `§docops1`: рабочий каталог,
предпосылки, точная команда, ожидаемый результат, изменяемое состояние, частые ошибки,
запрещённые способы запуска и границы доказательства. Обязательные соседние изменения сверяются
с [`../docs/mandatory-companion-changes.ru.md`](../docs/mandatory-companion-changes.ru.md) (§cmpchg1).

## Что доказывают разные уровни

- `*.test.mjs` проверяют кодовые контракты, чистые модели, изолированный runtime и
  статические свойства пакета. Некоторые backend-тесты запускают BusyBox-like
  shell harness либо локальный fake-server и поэтому могут быть долгими.
- `npm.cmd run lint:js` проверяет LuCI, Node-инструменты и тесты через проектный
  ESLint с глобалами LuCI.
- `npm.cmd run lint:android` запускает Android Lint обоих APK. Категория
  `test:android` не заменяет Lint, Gradle-сборку, эмулятор и физический телефон.
- `androidLab:*` запускает ручной гибридный Android-стенд и намеренно не входит в
  `npm.cmd test`. API 35 smoke нужен при прямой Android-правке, API 28/35 full —
  перед выдачей APK, а QR/Wi-Fi/SIM/TLS проверяются на выделенном телефоне и
  живом роутере по [`../docs/android-test-lab.ru.md`](../docs/android-test-lab.ru.md)
  (§andlab1).
- `supportReportTransport.test.mjs` быстро проверяет ciphertext-only границу APK и
  router API; реальный HPKE round-trip выполняет Android instrumentation test
  `SupportReportCryptoTest` и потому требует `androidLab:*` (§srep001).
- `supportEndpointDiscovery.test.mjs` запускает production shell verifier с временной
  Ed25519-парой и доказывает совместимость Node signer/OpenSSL, а также отказ после подмены
  endpoint. GitHub download и UCI persistence остаются live-router сценарием. Точные команды,
  ожидаемый вывод, распространённые ошибки и запрещённые запуски находятся в
  [`../docs/testing-support-endpoint-discovery.ru.md`](../docs/testing-support-endpoint-discovery.ru.md)
  (§srepdisc1, §docops1).
- `documentationOperations.test.mjs` защищает ссылки на нормативную матрицу, обязательные поля
  endpoint-runbook и дерево связей §-тегов. Он не доказывает содержательную полноту документации;
  текст всё равно читается при ревью (§cmpchg1, §docops1).
- `npm.cmd run icons:check` проверяет, что LuCI-реестр, HTML-каталог и Android
  Vector Drawable соответствуют `icons/catalog.json`; визуальную узнаваемость
  значков всё равно проверяют в `icons/catalog.html`.
- `router:*` не входят в `npm.cmd test`. Они проверяют установку пакета, UCI,
  fw4 и LuCI на настоящем OpenWrt. Полная DNS-матрица и hardware-in-loop требуют
  отдельных живых сценариев и пока не доказываются одним `router:allSafe`.
- `security:audit:manual` является внешним консультативным LLM-аудитом. Он не
  заменяет категорию `security` и запускается только с осознанным согласием на
  передачу исходников.

Зелёный статический тест не является доказательством работы реального Wi-Fi,
WPS, LED, Android lifecycle или конкретной версии OpenWrt.

## Вспомогательный shell-тест

[`test-lib-device.sh`](test-lib-device.sh) проверяет общие библиотеки
`sheepfold-lib-device` и `sheepfold-lib-uci` в отдельном
`UCI_CONFIG_DIR=/tmp/sheepfold-test-uci`. Он не должен трогать настоящий
`/etc/config/sheepfold`.

## Правило поддержки

Каждый новый `*.test.mjs` добавляется минимум в одну категорию. Это защищает
`testCategories.test.mjs`. Буквальные упоминания test-файлов и `npm run` в
Markdown проверяет `npm.cmd run quality:docs:all`, поэтому после переименования
теста документация не должна ссылаться на старое имя.
