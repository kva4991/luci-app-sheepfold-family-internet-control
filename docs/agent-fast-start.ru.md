# Быстрый старт нового агента

<!-- §fastagt -->

Цель этого маршрута — не экономить на проверках, а не тратить контекст на повторное чтение всего проекта и повторное расследование уже известных проблем.

## Первые пять минут

1. Прочитать корневой `AGENTS.md`, [`owner-communication-profile.ru.md`](owner-communication-profile.ru.md) и этот файл. Профиль нужен, чтобы не смешивать разные виды списков и не потерять поздние уточнения владельца (§usrcomm).
2. Выполнить `git status --short --branch` и посмотреть последние 10 коммитов. Не менять и не откатывать чужие незакоммиченные правки.
3. На Windows выполнить `powershell -ExecutionPolicy Bypass -File tools\windows\check.ps1`. Если проверка не прошла, использовать полную команду из `tools/README.ru.md` самому; если среда не разрешает установку, дать эту команду пользователю.
4. Найти код и документацию задачи через установленный общим Windows-скриптом `rg`: `rg -n "ключевое слово|§тег"`. Затем прочитать только найденные focused-документы, связанные вхождения §-тега и действующий ADR из [`architecture/decisions/`](architecture/decisions/README.ru.md), если меняется архитектурная граница (§adrproc).
5. Перед продолжением общей разработки прочитать [`project-development-roadmap.ru.md`](project-development-roadmap.ru.md) (§roadmap). Перед коммитом или слиянием большого набора изменений дополнительно прочитать `docs/merge-readiness-plan.ru.md`; для обычной узкой задачи весь merge-план не нужен. Сначала проверить настоящее имя ветки и состояние worktree, а не полагаться на старое название из документации.

## Куда смотреть по типу задачи

| Задача | Первая точка входа |
| --- | --- |
| LuCI | `luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/` |
| API и роутерный backend | `luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/` |
| UCI и установка | `root/etc/config/sheepfold`, `root/etc/uci-defaults/`, `install.sh`, `docs/uci-config-migration.ru.md` |
| Родительский Android | `android/`, `docs/android-config.ru.md`, `docs/android-openwrt-api.ru.md` |
| Детский Android | `android-child/` и контракт `/client-status` |
| Автоопределение | detector-скрипты, `docs/device-detection.ru.md` |
| Сборка и окружение | `tools/README.ru.md`, `docs/agent-environment.ru.md`; публичные IPK/OpenWrt APK — `docs/github-actions-openwrt-build.ru.md` (§owrtci1) |
| Живой тестовый роутер и LuCI | `docs/live-router-automation.ru.md`, затем полная матрица `docs/live-router-testing.ru.md` (§routerharness) |
| Известная странность | `docs/agent-gotchas.ru.md`, затем поиск по указанному §-тегу |
| Ошибка команды, сборки, установки или сохранения | `docs/troubleshooting.ru.md` (§trouble) |
| Архитектурное решение и причины | `docs/architecture/decisions/README.ru.md`, затем профильный документ (§adrproc) |
| Дефект между UI, API, UCI и runtime | `docs/debugging-and-verification.ru.md` (§debug01) |
| Области и тесты затронутой правки | `docs/change-impact-review.ru.md`, `npm.cmd run review:impact` (§impact1) |
| Единый быстрый quality gate | `docs/quality-assistants/README.ru.md`, `npm.cmd run quality:plan`, затем `quality:changed` (§qassist) |
| Следующая общая работа | `docs/project-development-roadmap.ru.md`; профильные требования и ADR читать по указанным там §-тегам (§roadmap) |

## Проверки по слоям

1. Во время правки запускать синтаксическую проверку и ближайший целевой тест.
2. После завершения подсистемы запускать её набор тестов.
3. После узкой правки запускать категорию из [`test-strategy.ru.md`](test-strategy.ru.md) (§testcat), при пересечении — объединять категории. Полный `npm.cmd test` запускать перед push/PR/merge/release либо раньше, если изменён общий backend/API/UCI/package/security-контракт. Не повторять долгий полный набор после каждой мелкой правки.
4. Перед итоговым прогоном выполнить `npm.cmd run quality:plan`; для обычной итерации использовать `quality:changed`, а перед push исполняемого кода `quality:gate`. Неизвестный путь разобрать вручную (§impact1, §qassist).
5. Android собирать соответствующим wrapper только после Android-изменений: `android\gradlew.bat -p android ...` или `android-child\gradlew.bat -p android-child ...`. Глобальный Gradle не нужен.
6. Перед коммитом всегда выполнить `git diff --check`, проверить `git diff --stat`, §-теги и отсутствие скачанных SDK, APK, IPK и кэшей в индексе.

## Как не повторять известные ошибки

- В PowerShell вызывать `npm.cmd`, когда execution policy мешает `npm.ps1`.
- PowerShell-скрипты для Windows PowerShell 5 сохранять с UTF-8 BOM; учитывать CRLF из `.gitattributes`.
- Android ZIP не распаковывать через `Expand-Archive`; действует контракт `§zipps51`.
- Не судить об успехе по одной UI-всплывашке: проверить ответ backend, UCI после reload/commit и exit code.
- Не читать дерево репозитория целиком. Сначала `rg --files` с фильтром и `rg -n` по функции, UCI-опции, endpoint или §-тегу.
- Если процесс в песочнице вернул `status: null`, `EPERM` или не смог создать дочерний процесс, повторить именно нужную проверку с разрешённым запуском, а не менять код наугад.
- При новой неочевидной находке обновить focused-документ, `docs/agent-gotchas.ru.md` и карту §-тегов в той же правке.

## Принятые инструменты

| Действие | Использовать | Не использовать |
| --- | --- | --- |
| Поиск по проекту | `rg`, `rg --files`, поиск по §-тегу | полный рекурсивный вывод дерева и чтение всех документов |
| Сборка тестового IPK в Windows | `python scripts/build-test-ipk.py` | 7-Zip, ручной `ar`, Windows `tar` |
| Публичные IPK/OpenWrt APK | `Build OpenWrt packages` в GitHub Actions | переименование/перепаковка тестового IPK, snapshot SDK |
| Просмотр APK/IPK/ZIP | 7-Zip | пересборку архива после ручного редактирования |
| Android | Gradle Wrapper соответствующего проекта | глобальный `gradle` |
| Node-тесты | целевой `node --test`, затем `npm.cmd run test:<category>`, перед публикацией `npm.cmd test` | повторный полный прогон после каждой мелочи |
| GitHub CI | `gh run`, `gh pr checks` | догадки по одной красной плашке GitHub |
| Тестовый роутер | `npm.cmd run router:readOnly`, `router:fullSafe`, `router:frontend` по `docs/live-router-automation.ru.md` | разрозненные ручные команды, `opkg upgrade` и изменение живого роутера без backup |

## Критерий хорошего завершения

Агент должен уметь назвать изменённый контракт, показать проверку, которая ловит его регрессию, и перечислить то, что не удалось проверить. Только после этого коммит и push считаются готовыми.
