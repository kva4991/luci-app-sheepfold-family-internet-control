# Операционные мелочи (agent gotchas)

Этот документ — **индекс** неочевидных продуктовых и эксплуатационных деталей Sheepfold, которые легко забыть при следующей сессии разработки или у нового агента.

Правила кодинга, стиль и ревью — в [`CODING_RULES.md`](../CODING_RULES.md). Здесь только то, что не помещается в комментарий кода, но влияет на поведение продукта, сборку или отладку.

## Обязательное правило для агентов

При обнаружении **неочевидной** находки (баг, ловушка окружения, два разных «языка», дубли в UI, неверная интерпретация `*-legacy` и т.п.) агент **обязан** вести реестр в документации в **той же сессии**, что и исправление кода:

1. **Добавить** — новая находка → строка в «Зафиксированные мелочи» + подробности в тематическом `docs/*.ru.md`.
2. **Обновить** — поведение изменилось → поправить тематический документ и формулировку в индексе (не оставлять устаревший текст).
3. **Удалить** — ловушка устранена в продукте (кнопка возвращена, поле появилось в UI, баг исправлен) → убрать пункт из индекса и из тематического документа; если настройка стала видимой в LuCI — убрать из [`docs/hidden-settings.ru.md`](hidden-settings.ru.md).

Маршрутизация по типу находки:

1. **Не программирование** (продукт, установка, LuCI-поведение, роутер, i18n, группы, детектор, скрытые UCI) → соответствующий файл в `docs/` (см. таблицу ниже) **и** краткая строка в разделе «Зафиксированные мелочи» этого файла.
2. **Программирование** (стиль JS/shell, `_()` vs `T()`, обёртки LuCI-view, chmod в `postinst`, deprecate-маршруты в `*-legacy`) → [`CODING_RULES.md`](../CODING_RULES.md), при необходимости со ссылкой из этого индекса.
3. Не дублировать длинные объяснения: в индексе — **одна строка + ссылка**; подробности — в тематическом документе.
4. Не писать в README длинные технические заметки; README остаётся для пользователя, детали — в `docs/`.

Если подходящего документа нет, создать новый focused-файл в `docs/` и добавить ссылку в [`docs/developer-task.ru.md`](developer-task.ru.md).

## Куда что писать

| Тема | Куда |
| --- | --- |
| LuCI gettext, `.lmo`, два параметра языка | [`docs/localization.ru.md`](localization.ru.md) |
| Группы по умолчанию, дубли «Без ограничений» | [`docs/default-groups.ru.md`](default-groups.ru.md) |
| Детектор, ARP, автогруппа | [`docs/device-detection.ru.md`](device-detection.ru.md) |
| Сборка IPK, `po2lmo`, копия в Downloads | [`docs/agent-environment.ru.md`](agent-environment.ru.md) |
| Версия ассетов LuCI, cache-busting | [`docs/luci-cache.ru.md`](luci-cache.ru.md) |
| Имена `*-legacy`, deprecate HTTP | [`CODING_RULES.md`](../CODING_RULES.md) §8.4, [`docs/apps/router-app-ru.md`](apps/router-app-ru.md) |
| UCI, `postinst`, миграции | [`docs/uci-config-migration.ru.md`](uci-config-migration.ru.md) |
| Скрытые / неотображаемые UCI-опции | [`docs/hidden-settings.ru.md`](hidden-settings.ru.md) |
| Yandex Disk, зеркалирование журнала, бэкапы | [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md) |
| Продуктовые решения, scope | [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) |
| Стиль кода, тесты, ревью | [`CODING_RULES.md`](../CODING_RULES.md) |
| Быстрый вход нового агента без повторного чтения всего проекта | [`docs/agent-fast-start.ru.md`](agent-fast-start.ru.md) |

## Зафиксированные мелочи

Краткий реестр. Подробности — по ссылкам.

### Локализация LuCI

- Строки в JS — только `_('English msgid')`; локальный словарь `T()` **не использовать** (см. [`CODING_RULES.md`](../CODING_RULES.md) §8.2).
- Русский UI требует бинарного каталога **`/usr/lib/lua/luci/i18n/sheepfold.ru.lmo`** на роутере; без `.lmo` LuCI покажет английские msgid даже при русском языке браузера.
- Тестовый IPK собирает `.lmo` через `scripts/po2lmo.py` (см. [`docs/agent-environment.ru.md`](agent-environment.ru.md)); тест `tests/testIpkI18n.test.mjs`.
- Для русского UI Sheepfold нужны `sheepfold.global.language=ru` и `sheepfold/i18n/ru.json` (модуль `sheepfold/i18n.js`). `luci.main.lang` меняется только при установке (`install.sh` / `postinst`), не из настроек приложения (см. [`docs/localization.ru.md`](localization.ru.md)).

### Группы по умолчанию

- Канонические UCI-секции: `no_restrictions`, `child_1` — **singleton**, не создавать вторую группу через `_('No restrictions')` в UI (см. [`docs/default-groups.ru.md`](default-groups.ru.md)).
- Отображаемое имя группы — **пользовательская сущность** в `sheepfold.<section>.name`, не gettext-строка из JS.
- Имена по языку задаются **один раз** при первой установке (`install.sh` → `/etc/sheepfold/install.language` → `sheepfold-default-groups`); `postinst` при обновлении **не перезаписывает** уже заданные имена.
- Выбор **English** в `install.sh` бесполезен, если не синхронизировать `luci.main.lang` — с 0.1.0-157 `sheepfold-default-groups` и `postinst` делают это автоматически; тест `tests/installLanguage.test.mjs`.
- Старые алиасы RU/EN в `device.group` мигрируются скриптом `sheepfold-default-groups`; в LuCI — `LEGACY_GROUP_ALIASES` в `overview.js`.

### Детектор устройств

- Метка источника **`arp`** в сырых данных — не имя устройства; имена `arp`/`dhcp`/`static` в UCI очищаются (см. [`docs/device-detection.ru.md`](device-detection.ru.md)).
- Автоназначение в «Без ограничений» сравнивает группу с **каноническим именем из UCI** (`sheepfold-default-groups name`), а не с фиксированной английской строкой.

### Сборка и пакет

- Процесс Codex может не видеть `winget` в `PATH` и одновременно видеть временный встроенный `rg`. Установщик находит `winget` через Microsoft App Installer и не принимает Codex-копию `rg` за пользовательскую установку (см. [`tools/README.ru.md`](../tools/README.ru.md)). (§toolwin)
- В Windows PowerShell 5 не распаковывать Android command-line tools через `Expand-Archive`: официальный ZIP способен вызвать внутреннюю ошибку `Remove-Item`. Установщик использует `.NET ZipFile` и короткий `%TEMP%`-путь; тест не даёт вернуть проблемную реализацию (см. [`tools/README.ru.md`](../tools/README.ru.md)). (§zipps51)
- После изменения LuCI JS/CSS поднимать **`PKG_RELEASE`** и синхронный **`ui_asset_version`** (см. [`docs/luci-cache.ru.md`](luci-cache.ru.md), тест `tests/luciAssetVersioning.test.mjs`).
- Локальный тестовый `.ipk` — gzip-tar с `debian-binary` / `data.tar.gz` / `control.tar.gz`; по умолчанию пишется в `Downloads`, не в `dist\` (см. [`docs/agent-environment.ru.md`](agent-environment.ru.md)).
- Тестовый IPK: все `usr/libexec/sheepfold/*` — **0755** в архиве + `find … chmod 0755` в `postinst`; иначе `router-control-legacy: Permission denied` (тест `tests/testIpkPermissions.test.mjs`).

### `*-legacy` и deprecate

- `sheepfold-router-control-legacy` и `sheepfold-api-legacy` — **текущий рабочий монолит** за фасадом, не «совместимость со старым релизом» (см. [`CODING_RULES.md`](../CODING_RULES.md) §8.4).
- Устаревшие маршруты (`/pair-token`, `/settings/save`, `token=` в query) должны отдавать **404/410/400**, а не оставаться рабочими.

### Хранение журналов и Yandex Disk

- Журнал всегда в RAM (`/tmp/sheepfold/events.log`); `log_storage` задаёт **дополнительное** зеркалирование (`ram` / `usb` / `yandex_disk`).
- Yandex Disk — **WebDAV** + пароль приложения, не OAuth REST; helper: `sheepfold-yandex-disk`, диспетчер: `sheepfold-log-storage`.
- Debounce выгрузки живых событий: **300 с** (`YANDEX_PUSH_INTERVAL` в `sheepfold-log`).
- Восстановление конфига с диска — `yandex-disk-restore-config`; в UI есть выбор бэкапа и confirm; safety backup в `/tmp/sheepfold/`.
- Подробности: [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md).

### LuCI: списки и администраторы

- Добавление в белый/чёрный список из модалки LuCI: `updateMacList` сбрасывает `list mac` через `uci.unset`, затем пишет каждый MAC отдельным `uci.set`; иначе MAC не сохраняется (см. `persistDeviceListMembership` в `overview.js`).
- Кнопка «Привязать устройства» в таблице администраторов не должна удаляться в `overview-secure.js`; запрещена только выдача прав из общего списка устройств.
- Модалка «Добавить в белый список» — две панели «Сохранить» (сверху и снизу таблицы), как у привязки администратора.
- Полный перечень UCI без полей в UI: [`docs/hidden-settings.ru.md`](hidden-settings.ru.md).
