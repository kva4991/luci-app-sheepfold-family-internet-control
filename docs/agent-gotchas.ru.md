# Операционные мелочи (agent gotchas)

Этот документ — **индекс** неочевидных продуктовых и эксплуатационных деталей Sheepfold, которые легко забыть при следующей сессии разработки или у нового агента.

Правила кодинга, стиль и ревью — в [`CODING_RULES.md`](../CODING_RULES.md). Здесь только то, что не помещается в комментарий кода, но влияет на поведение продукта, сборку или отладку.

- Две редакции роутерного пакета не означают два репозитория или четыре Android-сборки: Standard физически не содержит AI/activity-backend, а два единых Android APK скрывают ИИ до положительной capability роутера. Каждая редакция отдельно собирается в IPK для 24.10 и apk-tools v3 APK для 25.12 (§prodvar, §owrtci1).

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
| Сборка IPK, `po2lmo`, явный экспорт артефактов | [`docs/agent-environment.ru.md`](agent-environment.ru.md) |
| Версия ассетов LuCI, cache-busting | [`docs/luci-cache.ru.md`](luci-cache.ru.md) |
| Имена `*-legacy`, deprecate HTTP | [`CODING_RULES.md`](../CODING_RULES.md) §8.4, [`docs/apps/router-app-ru.md`](apps/router-app-ru.md) |
| UCI, `postinst`, миграции | [`docs/uci-config-migration.ru.md`](uci-config-migration.ru.md) |
| Скрытые / неотображаемые UCI-опции | [`docs/hidden-settings.ru.md`](hidden-settings.ru.md) |
| Yandex Disk, зеркалирование журнала, бэкапы | [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md) |
| Продуктовые решения, scope | [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) |
| Стиль кода, тесты, ревью | [`CODING_RULES.md`](../CODING_RULES.md) |
| Категории автотестов и условия полного прогона | [`docs/test-strategy.ru.md`](test-strategy.ru.md) (§testcat) |
| Быстрый вход нового агента без повторного чтения всего проекта | [`docs/agent-fast-start.ru.md`](agent-fast-start.ru.md) |
| Как понимать владельца и формулировать ответы | [`docs/owner-communication-profile.ru.md`](owner-communication-profile.ru.md) (§usrcomm) |
| Архитектура памяти, БД, модулей и диалога ИИ-помощника | [`docs/ai-assistant-development/README.md`](ai-assistant-development/README.md) (§aiarch1) |
| Ошибки Windows, тестов, Android, IPK, UCI, LuCI, Git и сети | [`docs/troubleshooting.ru.md`](troubleshooting.ru.md) |
| Внешние белые/чёрные списки сайтов, кэш и повторы | [`docs/site-list-sources.ru.md`](site-list-sources.ru.md) (§slstres) |
| Безопасное обновление IPK и восстановление конфига | [`docs/update-safety.ru.md`](update-safety.ru.md) (§updsafe) |
| Решения, которые ещё должен принять владелец | [`docs/owner-open-questions.ru.md`](owner-open-questions.ru.md) (§ownques) |

## Зафиксированные мелочи

Краткий реестр. Подробности — по ссылкам.

### Локализация LuCI

- Строки в JS — только `_('English msgid')`; локальный словарь `T()` **не использовать** (см. [`CODING_RULES.md`](../CODING_RULES.md) §8.2).
- Русский UI требует бинарного каталога **`/usr/lib/lua/luci/i18n/sheepfold.ru.lmo`** на роутере; без `.lmo` LuCI покажет английские msgid даже при русском языке браузера.
- Тестовый IPK собирает `.lmo` через `scripts/po2lmo.py` (см. [`docs/agent-environment.ru.md`](agent-environment.ru.md)); тест `tests/testIpkI18n.test.mjs`.
- Для русского UI Sheepfold нужны `sheepfold.global.language=ru` и `sheepfold/i18n/ru.json` (модуль `sheepfold/i18n.js`). `luci.main.lang` меняется только при установке (`install.sh` / `postinst`), не из настроек приложения (см. [`docs/localization.ru.md`](localization.ru.md)).
- Windows PowerShell 5 `ConvertFrom-Json` считает ключи без учёта регистра и может молча уничтожить один из переводов `Clear log` / `clear log`. Файлы `sheepfold/i18n/*.json` не редактировать этим конвертером: источник истины — `.po`, JSON создаётся только командой `python scripts/po2json.py <input.po> <output.json>`. Автотест проверяет сохранение обоих ключей. (§i18ncase)
- В длинном Windows workspace `po2json.py` может получить `OSError 22` из-за `MAX_PATH`, хотя файл существует. Передавайте входной и выходной путь в расширенном виде `\\?\C:\...`; это ограничение пути, а не повреждение `.po`. `xgettext.sh` дополнительно требует GNU `find`/`sort` и установленный `gettext` (`xgettext`, `msgmerge`), поэтому отсутствие `msgmerge` нельзя выдавать за ошибку переводов.

### Группы по умолчанию

- Канонические UCI-секции: `no_restrictions`, `child_1` — **singleton**, не создавать вторую группу через `_('No restrictions')` в UI (см. [`docs/default-groups.ru.md`](default-groups.ru.md)).
- Отображаемое имя группы — **пользовательская сущность** в `sheepfold.<section>.name`, не gettext-строка из JS.
- Имена по языку задаются **один раз** при первой установке (`install.sh` → `/etc/sheepfold/install.language` → `sheepfold-default-groups`); `postinst` при обновлении **не перезаписывает** уже заданные имена.
- Выбор **English** в `install.sh` бесполезен, если не синхронизировать `luci.main.lang` — с 0.1.0-157 `sheepfold-default-groups` и `postinst` делают это автоматически; тест `tests/installLanguage.test.mjs`.
- Старые алиасы RU/EN в `device.group` мигрируются скриптом `sheepfold-default-groups`; в LuCI — `LEGACY_GROUP_ALIASES` в `overview.js`.

### Детектор устройств

- Метка источника **`arp`** в сырых данных — не имя устройства; имена `arp`/`dhcp`/`static` в UCI очищаются (см. [`docs/device-detection.ru.md`](device-detection.ru.md)).
- Автоназначение в «Без ограничений» сравнивает группу с **каноническим именем из UCI** (`sheepfold-default-groups name`), а не с фиксированной английской строкой.
- При объединении DHCP leases, ARP и постоянных аренд сохранять `host['.name']` в модели устройства. Потеря имени секции заставляет редактор создать вторую постоянную аренду вместо изменения существующей; это проверяет `frontendDomainModels.test.mjs`. (§devinv)

### Сборка и пакет

- Процесс Codex может не видеть `winget` в `PATH` и одновременно видеть временный встроенный `rg`. Установщик находит `winget` через Microsoft App Installer и не принимает Codex-копию `rg` за пользовательскую установку (см. [`tools/README.ru.md`](../tools/README.ru.md)). (§toolwin)
- После установки Windows toolchain текущий PowerShell/Codex-процесс может не видеть уже установленные `git`, `node`, `python`, `java`, `adb` и `sdkmanager`; один раз перечитать Machine/User `PATH` или открыть новый shell (см. [`docs/agent-environment.ru.md`](agent-environment.ru.md)). (§toolwin)
- Windows `setup.ps1` прогревает Gradle Wrapper запуском `gradlew.bat --version`: wrapper-файлы остаются в Git, а скачанный Gradle distribution живёт только в `%USERPROFILE%\.gradle\wrapper\dists` и не коммитится (см. [`tools/README.ru.md`](../tools/README.ru.md)). (§toolwin)
- Fallback-поиск Windows toolchain выбирает одну наиболее новую установку Python и только JDK 17; повтор `sdkmanager` удаляет лишь неполный компонент, а не уже исправные Android SDK-пакеты. (§toolwin)
- В PowerShell нельзя называть параметр функции `$Home`: имена переменных нечувствительны к регистру, а `$HOME` является встроенной read-only переменной. Для пути JDK используется `$JavaHomePath`; это закреплено тестом Windows toolchain. (§toolwin)
- В Windows PowerShell 5 не распаковывать Android command-line tools через `Expand-Archive`: официальный ZIP способен вызвать внутреннюю ошибку `Remove-Item`. Установщик использует `.NET ZipFile` и короткий `%TEMP%`-путь; тест не даёт вернуть проблемную реализацию (см. [`tools/README.ru.md`](../tools/README.ru.md)). (§zipps51)
- Windows PowerShell 5 требует UTF-8 BOM для `.ps1` с русским текстом, удаляет настоящий пустой аргумент `ssh-keygen -N ''` и не разрешает `Export-ModuleMember` из обычного `.ps1`. Live-router scripts защищены BOM-тестом, используют `-N '""'` и dot-source; подробности в [`troubleshooting.ru.md`](troubleshooting.ru.md). (§routerharness)
- После изменения LuCI JS/CSS поднимать **`PKG_RELEASE`** и синхронный **`ui_asset_version`** (см. [`docs/luci-cache.ru.md`](luci-cache.ru.md), тест `tests/luciAssetVersioning.test.mjs`).
- Локальный тестовый `.ipk` — gzip-tar с `debian-binary` / `data.tar.gz` / `control.tar.gz`; по умолчанию пишется в `.build/ipk-output`. В Downloads копировать только по прямой просьбе пользователя (см. [`docs/agent-environment.ru.md`](agent-environment.ru.md)).
- Тестовый IPK: все `usr/libexec/sheepfold/*` — **0755** в архиве + `find … chmod 0755` в `postinst`; иначе `router-control-legacy: Permission denied` (тест `tests/testIpkPermissions.test.mjs`).

### `*-legacy` и deprecate

- `sheepfold-router-control-legacy` и `sheepfold-api-legacy` — **текущий рабочий монолит** за фасадом, не «совместимость со старым релизом» (см. [`CODING_RULES.md`](../CODING_RULES.md) §8.4).
- Устаревшие маршруты (`/pair-token`, `/settings/save`, `token=` в query) должны отдавать **404/410/400**, а не оставаться рабочими.
- Временный доступ не должен превращаться в постоянный allowlist: backend ставит `temp_access_allowlist_added`, `sheepfold-service` вызывает `expire-temp-access`, а blocklist/`status=blocked` остаются сильнее временного доступа и WPS allowlist-режима (см. [`docs/backend-design.ru.md`](backend-design.ru.md) §84azytj).

### UCI-list в LuCI

- `uci.set(config, section, option, values)` принимает UCI-list одним массивом. Не вызывать `uci.set()` по одному разу для каждого элемента: каждый следующий вызов перезапишет предыдущий, и после сохранения останется только последний MAC, день недели или объект расписания.
- При полной замене списка сначала использовать `uci.unset()`, затем один `uci.set(..., values)`, только если массив не пуст. Это закреплено тестами `allowlistUi.test.mjs` и `schedulePriorityUi.test.mjs`.

### Интерфейс выглядит правильно, но runtime-контракт разорван

<!-- §uirunfx -->

Это как раз тот класс ошибок, который визуально выглядит нормально, а на роутере ломает правила. Статическая разметка, перевод и даже всплывающее сообщение могут работать, хотя отсутствует JS-адаптер после выноса модуля, UCI не применён, backend не прочитал новую опцию либо firewall не пересчитан.

- После переноса функции в модуль искать все старые вызовы и определения символа; либо менять всех потребителей атомарно, либо оставлять проверенный тонкий адаптер.
- Для каждой настройки проверять не только DOM, но и полный контракт: черновик → `Сохранить` → UCI после apply → backend → фактическое правило → повторное чтение → журнал.
- Тест интерфейсного текста не заменяет тест backend-контракта. Для правил доступа нужен целевой тест вычислителя/firewall и, перед релизом, сценарий на живом роутере.
- Ошибка особенно опасна для расписаний, списков устройств, глобальной блокировки и административного доступа: UI может показать ожидаемое состояние, пока nftables продолжает применять старое.

### Хранение журналов и Yandex Disk

- Журнал всегда в RAM (`/tmp/sheepfold/events.log`); `log_storage` задаёт **дополнительное** зеркалирование (`ram` / `usb` / `yandex_disk`).
- Yandex Disk — **WebDAV** + пароль приложения, не OAuth REST; helper: `sheepfold-yandex-disk`, диспетчер: `sheepfold-log-storage`.
- Debounce выгрузки живых событий: **300 с** (`YANDEX_PUSH_INTERVAL` в `sheepfold-log`).
- Восстановление конфига с диска — `yandex-disk-restore-config`; в UI есть выбор бэкапа и confirm; safety backup в `/tmp/sheepfold/`.
- Подробности: [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md).

### LuCI: списки и администраторы

- Добавление в белый/чёрный список из модалки LuCI: `updateMacList` сбрасывает `list mac` через `uci.unset`, затем одним `uci.set` передаёт весь массив MAC; отдельные вызовы на каждый MAC перезаписывают предыдущие значения (см. `persistDeviceListMembership` в `overview.js`).
- Белый и чёрный списки устройств взаимоисключающие, но конфликт нельзя «исправлять» скрытым переносом MAC: LuCI и backend отклоняют операцию, пока родитель явно не удалит устройство из прежнего списка. (§lstxcl1)
- Кнопка «Привязать устройства» в таблице администраторов не должна удаляться в `overview-secure.js`; запрещена только выдача прав из общего списка устройств.
- Модалка «Добавить в белый список» — две панели «Сохранить» (сверху и снизу таблицы), как у привязки администратора.
- После добавления или удаления устройства из белого/чёрного списка обновлять только три таблицы и счётчики; полный `window.location.reload()` закрывает контекст пользователя и не нужен.
- Полный перечень UCI без полей в UI: [`docs/hidden-settings.ru.md`](hidden-settings.ru.md).

### Android: автопоиск и QR-сопряжение

- Автопоиск сначала читает `/.well-known/sheepfold.json` через штатный HTTPS роутера, затем проверяет объявленный порт API; один жёстко заданный `:5201` не позволяет обнаружить изменённый порт.
- Ошибка QR-сопряжения должна различать «API недоступен», «телефон ещё не найден в DHCP/neighbour/ARP», использованный код и blocklist; пустые `null`/`undefined` пользователю не показываются.
- При определении MAC по IP сначала используйте DHCP lease, затем `ip neigh`, затем `/proc/net/arp`: на современных OpenWrt neighbour-запись может появиться раньше старой ARP-таблицы.

### OpenWrt release-сборка

- Одинаковое расширение `.apk` используется и apk-tools v3 на OpenWrt 25.12, и Android. OpenWrt APK собирается только официальным SDK; переименование IPK создаёт повреждённый пакет, даже если имя выглядит правильно (§owrtci1).
- Быстрый `scripts/build-test-ipk.py` доказывает состав/права тестового архива, но не совместимость Makefile с feeds/luci и package format целевой версии. Перед Release обязателен Actions matrix и живой роутер (§owrtci1).
- Standard/AI-фильтрацию нельзя копировать в YAML: один источник истины — `scripts/sheepfold_variants.py`. Иначе тестовый IPK и SDK release могут незаметно получить разный payload (§prodvar, §owrtci1).

### Внешние списки сайтов

- URL страницы проекта не является URL списка. Заводские значения должны вести на plain/hosts/Adblock/archive-файл; HTML-ответ никогда не заменяет рабочий кэш (§slstres).
- Один источник обновляется независимо от остальных. Сначала ограниченно скачать и распаковать, затем нормализовать и дедуплицировать во временный файл, и лишь потом атомарно заменить его кэш.
- Ограничения нужны на всех уровнях: время запроса, размер скачанного и распакованного файла, строки одного источника, число источников и суммарные строки до сортировки. Иначе каждый файл по отдельности безопасен, но их объединение всё равно может исчерпать RAM.
- Непустая, но полностью некорректная настройка URL не равна команде «очистить список». Иначе одна опечатка родителя незаметно снимает защиту.
- Git Bash на Windows может вызвать `C:\Windows\System32\sort.exe` вместо GNU `sort`; поведенческий тест передаёт `/usr/bin/sort` через `SHEEPFOLD_SITE_LIST_SORT_HELPER`.
- Скачанный кэш ещё не доказывает фильтрацию. До проверки потребителя `allowlist.domains` / `blocklist.domains` нельзя помечать белый/чёрный список сайтов как работающий runtime (§uirunfx).

### AdGuard Home API

- В POSIX `sh` переменные функций глобальны. Парсер не должен использовать имя вроде `current_url`, если вызывающая функция хранит в нём адрес управляемого фильтра: вложенный вызов незаметно перезапишет значение. Для сложных shell-модулей использовать префиксы функции (`pf_*`, `sync_*`) и защищать такие коллизии поведенческим тестом (§aghplan).
- При смене приватного feed token старый URL не исчезает из AdGuard Home сам. Хранить последний принадлежащий Sheepfold URL в файле `0600`, строго проверять локальный формат, подтверждённо отключать прежний URL и никогда не считать совпадение имени фильтра доказательством владения (§aghplan).
- `check_host` может подтвердить старое правило из кэша, даже если `uhttpd` уже не отдаёт ленту. Перед refresh локально скачать собственный feed без токена в argv и сравнить содержимое с активным файлом (§aghplan).
- Ответ `POST /control/filtering/refresh` со значением `updated: 0` корректен. Не превращать его в ошибку: после него проверяются собственный URL, состояние фильтра и контрольные правила.

- Перед каждым HTTP-запросом удалять прежний response-файл. Иначе сетевой сбой может оставить старый успешный JSON, который следующий шаг ошибочно примет за свежий ответ (§aghplan).
- Любой helper, которому передаются `method` и `path`, обязан сам проверять allowlist endpoints. Недостаточно считать пути безопасными только потому, что текущие callers используют строковые константы.
- Не вставлять буквальные управляющие символы CR/LF внутрь многострочного shell-pattern `case`: на Git Bash такой шаблон уже превратил проверку credentials в срабатывающую для пустой строки. Сравнивать исходное значение с вариантом после `tr -d '\r\n'` и защищать сценарий поведенческим тестом.
- Успешный `HTTP 200` недостаточен: проверять ограничение размера, JSON-синтаксис, обязательные поля и допустимые типы до изменения runtime-состояния.
- `/control/dns_info` нужен для диагностики, но не должен ломать уже подтверждённый собственный фильтр при отсутствии endpoint или повреждённом ответе. `/control/status` с `running=0` или `protection_enabled=0`, напротив, доказывает, что фильтр сейчас не исполняется, и требует fallback.
- Не сохранять сами upstream/fallback/bootstrap адреса в status, журнал или LuCI: для диагностики достаточно количества. Реальный DNS-путь LAN-клиентов хранить отдельным полем и не подменять его фактом доступности API.
- Windows-тест `adguardIntegration.test.mjs` эмулирует каждую операцию `jshn.sh` отдельным Node-процессом и потому может идти несколько минут. Это стоимость тестового harness-а; production OpenWrt использует нативный `jshn.sh`. Увеличивать тайм-аут допустимо, ослаблять проверку схемы production-кода нельзя.
- `filtering/check_host` разрешён только для фиксированных контрольных доменов Sheepfold в зарезервированной зоне `.test`; query-параметры проверяет тот же HTTP-helper, который проверяет method/path. Не превращать endpoint в прокси для произвольного домена или клиента.
- Подтверждение контрольного правила требует одновременно точного `rules[].text` и `rules[].filter_list_id` собственного фильтра. Устаревшие верхнеуровневые поля `rule`/`filter_id` не использовать. Тип `rules` и тип элементов проверять явно: строка в JSON не должна выглядеть как массив и превращаться в обычное несовпадение правила.
- Контрольная проверка движка и сквозной DNS-путь — разные факты. `check_host` не доказывает, что телефон отправляет DNS-запросы через AdGuard Home; до отдельного клиентского теста LuCI обязан оставлять жёлтый статус.

### Обновление IPK

- В shell нельзя рассчитывать только на `set -e`, если функция вызывается внутри `cmd || code=$?`: в таком контексте некоторые ошибки внутри функции не остановят выполнение. Критические шаги updater проверяются явным `if ! ...; then return` (§updsafe).
- Сообщение `opkg: Malformed package file` приходит слишком поздно. Updater до `opkg` обязан проверить официальный URL asset, `debian-binary`, единственные `control.tar.gz`/`data.tar.gz`, безопасные пути, имя пакета, версию и `Architecture: all`.
- `postinst` не удаляет временную копию `/tmp/sheepfold/update/sheepfold-config-before-update`: updater удаляет её только после получения и проверки результата `opkg`. Иначе ошибка `postinst` уничтожит единственную оперативную копию до попытки восстановления.
- Восстановление UCI-конфига не равно откату бинарного пакета. Updater не должен обещать полный rollback, пока предыдущий IPK действительно не сохранён и не проверен.
