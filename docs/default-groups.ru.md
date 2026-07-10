# Группы устройств по умолчанию

Sheepfold создаёт две стартовые группы при первой установке. Их поведение отличается от обычных пользовательских групп: фиксированные UCI-секции, защита от дублей в UI и отдельная логика языка при установке.

## Канонические секции UCI

| Секция | Тип | Назначение |
| --- | --- | --- |
| `no_restrictions` | `group` | «Без ограничений» / `No restrictions` — доверенная инфраструктура |
| `child_1` | `group` | «Первый ребёнок» / `Child number 1` — первая личная группа ребёнка |

**Важно:** это **singleton**-секции с фиксированными именами в UCI (`no_restrictions`, `child_1`). LuCI и backend ссылаются на них по id секции, а не по произвольному `config group 'group_xyz'`.

Нельзя создавать вторую группу «Без ограничений» через gettext-строку `_('No restrictions')` в `overview.js`: раньше это давало дубль в списке групп (RU + EN одновременно).

## Отображаемое имя ≠ перевод UI

- Поле `sheepfold.no_restrictions.name` и `sheepfold.child_1.name` — **имена сущностей пользователя**, которые видны в списках устройств и в `device.group`.
- Они **не** подставляются из `_()` при каждом рендере экрана.
- Переименование группы родителем меняет только UCI `name`; секция `no_restrictions` / `child_1` остаётся той же.

Детектор и классификатор читают актуальное имя «Без ограничений» через:

```sh
/usr/libexec/sheepfold/sheepfold-default-groups name
```

## Язык только при первой установке

1. `install.sh` спрашивает Application language и пишет выбор в `/etc/sheepfold/install.language` **до** установки пакета.
2. При первом `postinst` / `sheepfold-default-groups apply` скрипт переносит язык в `sheepfold.global.language`, синхронизирует `luci.main.lang`, выставляет `luci_language_synced=1` и задаёт **пустые** `name` только если их ещё нет:
   - `ru` → `Без ограничений`, `Первый ребёнок`, владелец по умолчанию `Родитель`
   - `en` → `No restrictions`, `Child number 1`, владелец по умолчанию `Parent`
3. При **обновлении** пакета `postinst` **не перезаписывает** уже существующие имена групп — иначе русские имена сбрасывались бы на английские при каждом IPK.

Файл `install.language` одноразовый: после чтения удаляется.

## Алиасы и миграция

Исторически устройства могли ссылаться на группу по старым строкам (RU/EN). Поддерживаемые алиасы:

| Алиас | Каноническая секция |
| --- | --- |
| `No restrictions`, `Без ограничений` | `no_restrictions` |
| `Child number 1`, `Первый ребёнок`, `Ребёнок номер 1` | `child_1` |

- **Backend:** `sheepfold-default-groups` в `migrate_device_group_aliases` переписывает `device.group` на текущее каноническое имя из UCI.
- **LuCI:** `LEGACY_GROUP_ALIASES` и `normalizeGroupName()` в `overview.js` схлопывают алиасы при отображении и в выпадающих списках.

## Связанные файлы

- `root/usr/libexec/sheepfold/sheepfold-default-groups`
- `install.sh` (запись `install.language`)
- `htdocs/.../overview.js` — `DEFAULT_GROUP_SECTION_IDS`, `ensureDefaultGroupSections`
- `tests/defaultGroups.test.mjs`
- `tests/installLanguage.test.mjs`