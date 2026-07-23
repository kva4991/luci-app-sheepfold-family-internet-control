# Финальная зачистка LuCI-координатора

<!-- §coordclean1 -->

Актуально для прохода `0.1.0-r248` от 22 июля 2026 года.

## Цель

`overview.js` должен оставаться компоновщиком страницы, а не скрытым вторым backend. Он вправе:

- запросить подтверждение опасного действия;
- передать фактическую кнопку общему action runner;
- открыть или закрыть модальное окно;
- обновить затронутую таблицу или карточку;
- сохранить общий порядок одного пользовательского сценария.

UCI-поля, list-операции, rollback и предметный runtime-порядок принадлежат отдельным модулям.

## Извлечённые границы

### `features/schedules/persistence.js`

Модуль владеет:

- созданием или выбором schedule-секции;
- полями `name`, `description`, `enabled`, `action`, `target_type`;
- списками `targets`, `weekdays`, `time_ranges`;
- единым commit `sheepfold`;
- вызовом `schedule-sync` после commit;
- состояниями `persisted` и `runtimeApplied`.

Confirmation конфликта, modal lifecycle и локальная перерисовка остаются в `overview.js`.

### `features/groups/persistence.js`

Модуль владеет:

- group-секцией и её параметрами;
- вычислением membership changes;
- записью выбранной группы в device-секции;
- сохранением ручных исключений из автогрупп;
- commit и применением общего device access runtime;
- классификацией post-commit ошибки.

Он возвращает membership changes координатору, чтобы интерфейс обновил только уже видимые объекты после подтверждённого commit.

### `features/settings/side-effects.js`

Модуль сохраняет порядок действий после общего Settings Save:

1. site-list cron;
2. site policy и status refresh;
3. LED;
4. IPv6 compatibility;
5. schedule sync;
6. emergency sites;
7. discovery JSON и restart локального сервиса;
8. AI-only OpenSSL preparation;
9. после сохранения — country profile, перечитывание Sheepfold и последняя reload страницы при смене языка.

Страница передаёт все DOM- и reload-callbacks явно. Модуль сам не использует `document`, `window` или `ui.showModal()`.

### `features/router/discovery.js`

Чистый модуль строит:

- `/.well-known/sheepfold.json`;
- `SF2` pairing payload;
- адрес роутера из `window.location`;
- quick-allowlist URL.

IPv6 literal в URL заключается в квадратные скобки. Сетевых запросов, UCI и хранения секретов в этом модуле нет.

## Удалённые forwarding-функции

После извлечения модулей coordinator больше не содержит локальные aliases для:

- `saveUciChanges`, `ensureSection` и list staging;
- device/DHCP/access runtime;
- backup staging;
- administrator staging, pairing activation/status и binding persistence;
- Settings side effects.

`settingsPersistence` получает `uciPersistence.save` напрямую. Остальные вызовы также используют имя предметного адаптера, поэтому ownership виден из call site.

## Последняя list-транзакция

Удаление устройства из allowlist/blocklist раньше оставалось прямой UCI-операцией страницы. Теперь `features/devices/persistence.js::removeFromList()` выполняет:

1. проверку списка и MAC;
2. удаление MAC из выбранного списка;
3. установку `status=new`;
4. commit;
5. `schedule-sync → site-lists-apply`;
6. маркировку частичного результата при runtime-ошибке.

Страница оставляет confirmation, action key, toast и local refresh.

## Инварианты

- В coordinator нет прямых `uci.save()` или `uci.apply()`.
- В coordinator нет прямого `/sbin/wifi reload`.
- Извлечённые четыре модуля DOM-free и меньше 700 строк.
- Ошибка после commit не называется полным rollback.
- Повторное применение installer не удваивает namespace и не возвращает helpers.
- `shared/icons.js` передаёт callback исходный click event, чтобы action runner получил фактическую кнопку.
- Standard-сборка остаётся синтаксически корректной после удаления AI-блоков.

## Проверки

- `tests/luciCoordinatorCleanup.test.mjs` проверяет чистые модели, порядок эффектов, schedule/group partial result и отсутствие прямого staging в coordinator.
- `tests/luciCoordinatorForwarderCleanup.test.mjs` проверяет удалённые aliases, list persistence, отсутствие UCI/Wi-Fi runtime в странице и событие icon button.
- Source-shape миграции обновляют существующие device/group/schedule/admin/backup/frontend regression-тесты.
- Browser smoke и живой `LuCI → rpcd → UCI → firewall/DNS/Wi-Fi` остаются обязательными доказательствами.

## Следующая работа

Широкая P1-декомпозиция координатора считается завершённой. Дальнейшее извлечение допустимо только при появлении самостоятельного контракта rollback/runtime или доказанно мёртвого кода. Следующий активный поток roadmap — mobile hit targets и живые router/phone проверки, а не дробление ради числа строк.
