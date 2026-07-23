# Узкие persistence-адаптеры LuCI

<!-- §persist1 -->

Актуально для прохода `0.1.0-r247` от 22 июля 2026 года.

## Цель

Persistence-слой отделяет три разные стадии изменяющего действия:

1. подготовку UCI-изменений;
2. сохранение и применение конфигурации;
3. применение runtime-состояния — firewall, DNS policy, Wi-Fi reload или service refresh.

DOM, модальные окна, тексты кнопок и toast не входят в этот слой. Иначе ошибка третьей стадии легко превращается в ложное сообщение «настройка не сохранена», хотя конфигурация уже записана.

## Модули

### `core/persistence/uci.js`

Общий низкоуровневый адаптер:

- получает или создаёт именованную секцию;
- заменяет UCI-list одним массивом;
- дедуплицирует список конфигов;
- выполняет `uci.save()` для каждого конфига и одну точку apply;
- явно перечитывает или отбрасывает локальный UCI-кэш.

Он не запускает router-команды и не знает о Sheepfold-политиках.

### `features/devices/persistence.js`

Владеет совместной записью Sheepfold/DHCP для карточки устройства:

- постоянная device-секция;
- статус и семейная группа;
- взаимное исключение allowlist/blocklist;
- ручной тип и источник имени;
- optional static DHCP lease;
- запрет детских ограничений для admin device;
- AI-only `activity_log_enabled` только внутри variant-маркеров;
- ordered runtime `schedule-sync → site-lists-apply → status refresh`.

Если UCI уже сохранён, а runtime не применился, ошибка получает `persisted=true`. UI обязан перечитать фактический UCI и сообщить о частичном результате, а не изображать rollback.

### `features/wifi/persistence.js`

Владеет только wireless UCI и reload:

- один commit/apply для `wireless`;
- сначала `/sbin/wifi reload`;
- совместимый fallback `/sbin/wifi`;
- `persisted=true`, если reload не прошёл после успешного сохранения;
- editor принимает уже записанный draft, показывает отдельное предупреждение и не оставляет unhandled Promise rejection.

### `features/settings/backup-persistence.js`

Владеет импортом и rollback:

- подготавливает полный Sheepfold/DHCP/Wi-Fi payload;
- сохраняет один фиксированный набор конфигов;
- при ошибке commit восстанавливает предыдущий снимок и повторно применяет его;
- сохраняет исходную ошибку, прикладывая `rollbackError`, если откат тоже не удался;
- не откатывает уже сохранённый импорт только потому, что последующий refresh сервисов не прошёл.

### `features/pairing/persistence.js`

Владеет:

- именованными administrator-секциями;
- `allow_child_access_requests`;
- активацией одноразового кода и чтением статуса pairing;
- переводом выбранного устройства в admin state;
- удалением обычной группы, расписаний и activity journal;
- allowlist/blocklist-инвариантом;
- снятием старой admin-привязки.

QR, таймер polling и отображение временного кода остаются UI-задачами.

## Инварианты

- Ни один persistence-модуль не использует `document`, `window`, `E()` или `ui.showModal()`.
- Один модуль не выполняет скрытый page reload.
- Post-commit runtime failure не называется ошибкой сохранения.
- Backup commit failure пытается восстановить предыдущий снимок.
- Pairing не может назначить blocklisted-устройство администраторским.
- Static DHCP и Sheepfold device config сохраняются одним пользовательским действием.
- Wi-Fi UCI считается сохранённым даже тогда, когда отдельный reload требует повторной попытки.

## Проверки

Focused-тест `tests/luciPersistenceAdapters.test.mjs` проверяет:

- дедупликацию UCI-save и единственную apply-точку;
- device/DHCP/list staging;
- порядок firewall/domain runtime;
- `persisted=true` после post-commit ошибки;
- Wi-Fi fallback и reload-only failure;
- сохранение masked secrets при импорте;
- backup rollback;
- admin binding и ранний отказ для blocklist;
- отсутствие DOM-зависимостей.

Focused-тесты не заменяют живой проход `LuCI → rpcd → UCI → fw4/Wi-Fi`.

## Финальная coordinator-граница (`r248`)

После `§coordclean1` `overview.js` не содержит локальных alias-функций для
`save`, `ensureSection`, device/list staging, pairing status или backup staging.
Координатор вызывает предметные adapters напрямую. Удаление устройства из allowlist
или blocklist также выполняет `features/devices/persistence.js::removeFromList()`;
страница оставляет у себя только confirmation, action key, уведомление и local refresh.
