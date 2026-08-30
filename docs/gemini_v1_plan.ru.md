# План реализации для ветки gemini_v1

<!-- Временный план для следующего прохода; это не релизный документ и не заменяет product gates. -->

## Цель

Сделать безопасный и проверяемый следующий проход по family message relay без нарушения текущих правил проекта:

- локальный router API остаётся primary source of truth;
- relay является дополнительным local-first route, не заменой роутерной логики;
- `clientsReady=no`, `realDataAllowed=no` остаются в силе до завершения runtime gates;
- исправляем то, что реально блокирует дальнейший прогресс, а не то, что выглядит «красиво» в теории.

## Почему я выбрал такой порядок

Мне важно соблюдать один принцип: сначала закрыть технические blockers, которые могут привести к реальной эксплуатации без контроля, а уже потом подключать UX и provisioning. В текущем состоянии key problem не в одном баге; это связка из нескольких gate-пунктов:

1. API 28 compatibility bug;
2. crash window before public enqueue;
3. ambiguous local `notFound` / lookup contract;
4. отсутствие production wiring и revocation;
5. отсутствие реального OpenWrt runtime и native helper.

Если начать с UI/provisioning, мы получим внешний слой без корректного backend behavior. Это нарушит проектное правило “сначала correctness, потом wiring”.

## Что я дополнительно замечаю, чего в присланном плане ещё не хватает явно

### 1. Нужен отдельный checklist по триггерам и state transitions

Нужно не только “сделать crash-safe на enqueue”, но и зафиксировать жизненный цикл состояния записи:

- `READY`;
- `LOCAL_ATTEMPT`;
- `RELAY_ACCEPTED`;
- `INDETERMINATE`;
- `ACKED`;
- `EXPIRED`;
- `REJECTED`.

Именно в этом месте легко сломать idempotency и lossy recovery, если enum/ordinal/serialization не защищены.

### 2. Нужна настоящая проверка на реальном Android API 28

Локальный lint/error в `MessageRelayJson.kt` — это не просто warning. Это инженерный blocker. Для Android это значит:

- не достаточно compileDebugKotlin;
- не достаточно JVM tests;
- нужен именно API 28 instrumented/real-device sanity check.

### 3. “Local-first” должен быть подтверждён не только в коде, но и в contract-е

Нужно явно зафиксировать правила:

- если локальный роутер доступен и плавает с подтверждённым SPKI, public relay не должен использоваться;
- если локальный POST неясен, fallback разрешён только после строгого proof-of-absence;
- generic 404/timeout не считаются достаточным доказательством.

### 4. Public URL и relay credentials должны быть не “строкой в настройках”, а анатомией provisioning

В проекте это критично:

- endpoint — из authenticated local router provisioning;
- credentials — отдельный секрет, не из user-editable field;
- bundle secrets/state должны зписываться атомарно до `enabled=true`.

Иначе мы получим “включённый relay без valid bundle”, что уже описано в плане как опасный сценарий.

### 5. Нужен отдельный step для native helper и OpenWrt runtime

Подход “Makefile-only scaffold” — недостаточен. Фактический runtime должен быть проверен на:

- target ABI;
- UCI schema;
- procd lifecycle;
- permission/UID model;
- power-loss, reboot, stale state recovery;
- dedup and idempotency.

### 6. Need to keep the branch small and explicit

В ветке `gemini_v1` я не буду делать большой refactor всей Android app. Я буду ограничиваться только теми файлами, которые относятся к relay correctness и capability gates. Это уменьшает риск сломать unrelated behavior.

## Исправления

> Важное решение: массовая ре-классификация всех старых записей пока не делается. До релиза нет достаточного доказательства, что у старых записей есть корректный источник истины и не было пользовательских настроек, поэтому мы не перезаписываем исторические данные и не “переклассифицируем всё подряд”. Это экономит риск и удерживает текущую ветку в безопасных рамках.

### 1. Защита от включения background polling при disabled/invalid config

Что исправил:
- сделал gating для `shouldSchedule()` в `MessageRelayPollWorker` и запретил запуск worker, если настройки relay выключены, пусты или не содержат валидных secret;
- добавил regression test в `LocalFirstMessageRelayCoordinatorTest`, который проверяет отсутствие schedule при invalid/disabled settings.

Как исправлял:
- в `MessageRelayPollWorker.kt` убрал публичный helper, который раскрывал внутренние типы `MessageRelaySettings` и `MessageRelaySecrets` наружу;
- оставил проверку в internal scope и привязал её к логике `permitsPublicNetwork()` + наличию тайных данных;
- тест покрывает три ситуации: disabled config, empty config, missing secrets.

Почему это требовалось:
- до этого возможна была ситуация, когда публичный relay таск оставался активен даже при невалидной или выключенной конфигурации;
- это нарушало fail-closed модель и создаёт ложное ощущение, что relay работает, хотя на самом деле он не должен быть активен.

Почему именно это исправление внесено:
- это минимальный безопасный fix: он не меняет внешние настройки и не включает relay; только выключает schedule при недопустимых условиях, что соответствует product requirement “local-first and fail-closed”.

### 2. Фильтрация технических имен `arp`, `dhcp`, `static` из пользовательского списка устройств

Что исправил:
- добавил явный guard для `reservedSourceName()` и запретил использовать технические источники в качестве пользовательских имён устройств;
- при сборке inventory теперь имя устройства берётся из статической аренды/hostname, а не из `dhcp`/`arp`/`static`.

Как исправлял:
- в `inventory.js` добавил нормализацию и фильтрацию values, которые are reserved source names;
- оставил комментарии, почему раньше в старых версиях `dhcp/arp/static` попадали в имя и вели к ложным неопознанным устройствам;
- тесты проверяют, что старый источник не подменяет имя пользователя.

Почему это требовалось:
- большое количество устройств в таблице выглядело как “Неизвестное устройство” только потому, что технический источник был ошибочно принят за имя клиента;
- это напрямую создавало шум в UI и искажало восприятие реального состава сети.

Почему именно это исправление внесено:
- это точечная правка на уровне источника данных: она не затрагивает реальное устройство, а убирает ложный сигнал в том месте, где пользователь его видит.

### 3. Разделение состояний “не распознано” и “подозрение на подмену”

Что исправил:
- в модели устройств и иконках выделил явное состояние identity mismatch / quarantine от обычного unknown;
- UI и status badge теперь различают “неизвестность” и “подозрительное устройство” вместо одного визуального блока.

Как исправлял:
- оставил иконку `deviceIdentityMismatch` для quarantine и `deviceTypeUnknown` для basic unknown;
- перевёл device note/identity title в отдельные ветки для `identity_quarantine_mode` и `manual_device_type`/`detected_type`;
- закрепил поведение через соответствующие tests.

Почему это требовалось:
- пользователь не должен путать два разных сценария: низкая уверенность распознавания и реальное подозрение на подмену/несовпадение паспорта;
- из-за смешения этих состояний старые сборки показывали слишком много “чёрных человечков” и вопросительных знаков без объяснения причин.

Почему именно это исправление внесено:
- мы не “маскируем” проблему под обычный unknown; мы оставляем точную диагностическую разницу, но не делаем ее критической без подтверждённого mismatch.

### 4. Явный приоритет свежего `detected_type` над старым `device_type=unknown`

Что исправил:
- `effectiveDeviceType()` теперь возвращает `detected_type` по умолчанию, если родитель не зафиксировал тип вручную;
- старое `unknown` больше не перекрывает новый корректный результат детектора.

Как исправлял:
- в `inventory.js` добавил `manual_device_type` check и сделал приоритетную ветку:
  - manual type wins only when `manual_device_type=1`;
  - otherwise detected type wins;
- тест в `frontendDomainModels.test.mjs` подтверждает это поведение.

Почему это требовалось:
- у старых записей часто оставалось `device_type=unknown` даже после корректного переопределения type по текущей сети;
- это приводило к тому, что UI показывал старый, уже неверный тип и скрывал новый результат.

Почему именно это исправление внесено:
- это локальная и безопасная правка контракта: она не использует массовую миграцию по всем данным, но устраняет ложный приоритет в отображении, который пользователь и так видит в интерфейсе.

### 5. Сохранение ветки узкой и безопасной

Что исправил:
- в планах держу только те изменения, которые относятся к реальному blocker и точному behavior gate;
- не добавляю mass reclassification / broad rewrite / legacy migration до финального релиза.

Как исправлял:
- ограничил scope теми файлами и проверками, которые дают deterministic proof в этой ветке;
- оставил старые записи как “недообработанный исторический слой”, не массово модифицируя их.

Почему это требовалось:
- убыстрение скорости и снижение риска важнее, чем “сделать всё разом”; в сетевой логике старые записи — это исторические данные, а не всегда правильная основа для переписования.

Почему именно это исправление внесено:
- оно сохраняет корректность и прозрачность: мы исправляем наблюдаемую проблему здесь и сейчас, но не делаем рискованную миграцию, которая не была согласована как релизный сценарий.

## Рабочий порядок реализации

### Шаг 1. Зафиксировать baseline и сделать narrow regression

Задачи:

- добавить или обновить unit test для API 28 integer bounds;
- добавить regression test для crash window before enqueue;
- добавить regression test для strict local `notFound` contract;
- не менять `minSdk`, не использовать suppress.

Почему:

- это закрывает уже обнаруженные blockers;
- это даёт deterministic proof для следующего изменения;
- это уменьшает риск “инженерного правления наугад”.

### Шаг 2. Исправить `MessageRelayJson` boundary bug

Что делаю:

- заменить `BigInteger.longValueExact()` на API 28-safe logic;
- явно проверить `Long.MIN_VALUE..Long.MAX_VALUE` для JSON integer parsing;
- добавить тест на overflow и negative values;
- проверять, что выкидывается корректно structured error.

Почему:

- это реальный runtime blocker на поддерживаемом Android API 28;
- compile pass не равно runtime correctness;
- это низкорисковый и локальный fix, который можно быстро подтвердить тестами.

### Шаг 3. Сделать durable `attempt` state до начала HTTP I/O

Что делаю:

- добавить state transition для “local attempt started” before first socket call;
- явно хранить `messageId` and attempt marker before network work;
- не допускать cleanup/overwrite до завершения или explicit timeout;
- добавить regression после simulated process kill / re-open.

Почему:

- это самый критичный gap для `messageId` idempotency;
- без этого any retry can corrupt the delivery state.

### Шаг 4. Зафиксировать strict local lookup contract

Что делаю:

- local lookup должен проверять `protocolVersion`, `requestMessageId`, `error=notFound`;
- запретить unknown fields, wrong content-type, stale response and mismatched IDs;
- добавить strict parser tests for exact contract.

Почему:

- именно здесь есть реальный риск “выбросить public fallback после ambiguous local post”; 
- это правило необходимо и для Android, и для будущего OpenWrt runtime.

### Шаг 5. Подготовить минимальную provisioning model, но без public enablement

Что делаю:

- добавляю flow/и store для безопасного сохранения relay configuration только после authenticated router provisioning;
- не включаю UI toggle, не создаю live enrollment;
- оставляю `enabled=false` и empty baseUrl по умолчанию.

Почему:

- safety-first;
- если это сделать раньше, рискуем создать user-visible feature без validity proof.

### Шаг 6. Подготовить OpenWrt side как следующую зону ответственности

Что делаю:

- фиксирую native helper backlog как отдельный gate;
- до этого не пытаюсь строить реализацию на уровне full runtime;
- оставляю каркас в виде scaffold только для дальнейшего расширения.

Почему:

- продуктовый риск выше, чем benefit;
- native helper принадлежит отдельной security/supply-chain проверки.

### Шаг 7. Validate with category tests and diff hygiene

Что запускаю:

- focused Android relay tests;
- affected `npm` category tests if relay logic touches shared contracts;
- `git diff --check`;
- review of modified files only.

Почему:

- не нужно на этом этапе запускать весь проект ради маленького gate fix;
- но нужно доказать, что local fix действительно работает и не поломал соседние границы.

## Минимальный объем редактирования в этой ветке

Я буду трогать только то, что реально относится к relay correctness:

- `android/app/src/main/java/app/sheepfold/android/relay/MessageRelayJson.kt`
- `android/app/src/test/java/app/sheepfold/android/relay/MessageRelayProtocolTest.kt` or related relay tests
- `android/app/src/test/java/app/sheepfold/android/relay/LocalFirstMessageRelayCoordinatorTest.kt`
- maybe `MessageRelayConnectionStore.kt` only if needed for safe provisioning gate

Не буду:

- включать UI toggle;
- менять user-facing product flows;
- подключать live public relay endpoint;
- трогать unrelated router logic;
- добавлять экспериментальный enrollment / real data path.

## Gate before moving further

Перед переходом к UX или product enablement я потребую подтверждение, что:

- API 28 issue fixed and test-covered;
- recoverability from crash is proven;
- local lookup contract is strict and idempotent;
- no public relay uses a free-form URL or invalid bundle;
- OpenWrt native runtime remains explicitly deferred.

Если эти пункты не закрыты — relay нельзя считать готовым для production.

## Текущий статус для этой ветки

- ветка создана: `gemini_v1`;
- временный файл планирования создан в репозитории;
- далее иду строго по checkpoint-методу: fix blockers -> verify -> only then decide about next integration step.
