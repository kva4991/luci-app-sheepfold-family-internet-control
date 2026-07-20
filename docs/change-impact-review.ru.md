# Карта влияния изменений

<!-- §impact1 -->

Sheepfold состоит из связанных LuCI, OpenWrt backend, UCI, nftables/DNS, двух Android APK, бота и двух редакций пакета. Маленькая правка в общем контракте часто требует больше одной тестовой категории.

## Автоматический советник

```powershell
npm.cmd run review:impact
node scripts/inspectChangeImpact.mjs package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt
```

Первая команда сравнивает рабочее дерево с `origin/main`, включая tracked-изменения и новые untracked-файлы. Явный список удобен для точечной гипотезы и в тестах. Советник не запускает тесты и не доказывает полноту: он показывает затронутые области, рекомендуемые категории, обязательный полный прогон и вопросы ревью.

Для выполнения безопасной локальной части плана используется единый gate:

```powershell
npm.cmd run quality:plan
npm.cmd run quality:changed
npm.cmd run quality:gate
```

Первый только печатает план, второй запускает минимальный объединённый набор, третий добавляет полный suite и запрещает неизвестные карте пути. Живой роутер, Android build и GitHub SDK остаются явно перечисленными ручными проверками. Полный контракт описан в [`quality-assistants/change-impact-and-gate.ru.md`](quality-assistants/change-impact-and-gate.ru.md) (§qassist).

## Базовая карта

| Изменённая область | Проверить рядом | Минимальные категории |
|---|---|---|
| LuCI view/core/shared | переводы, cache version, mobile layout, сохранение состояния | `luci` |
| LuCI устройства/группы/расписания/администраторы | backend-команду, UCI, списки и access evaluator | `luci devices access` |
| CGI или общий API helper | Android-клиенты, status/error codes, auth, timeout | `backendFast android security` |
| UCI defaults/postinst/migration | старая установка, upgrade, secrets, named sections | `backendFast packaging security` |
| firewall/nftables/schedules | приоритет, lock, rollback, Podkop/AdGuard | `access sites security networkIntegration` |
| AdGuard/DNS/site lists | последний рабочий cache, fallback, чужие объекты | `sites security networkIntegration` |
| Parent/child Android | server capability, TLS pin, recovery, строки | `android security` |
| Makefile/build/release/updater | обе редакции и оба package format | `packaging tooling security` |
| §-тег или ADR | индекс, профильный документ, тест контракта | `tooling` |

## Review риска

Для каждой затронутой границы ответить:

1. Каков blast radius: один экран, оба APK, все установки, firewall либо migration старого конфига?
2. Что произойдёт при пустом, повреждённом, старом или неожиданном значении?
3. Default безопасен и понятен или незаметно расширяет доступ/сбор данных?
4. Можно ли повторить операцию без дублей и частичного состояния?
5. Есть ли rollback либо сохранение последнего рабочего состояния?
6. Не стал ли опасный путь проще случайного нажатия, чем безопасный?
7. Не доверяет ли решение имени, IP, MAC, Android-отчёту или внешнему API сильнее, чем разрешено паспортом устройства?

## Когда нужен полный набор

`npm.cmd test` обязателен перед push/PR/merge/release, а также после изменения общего API, UCI migration, package identity, security boundary, access evaluator или общего helper, которым пользуются несколько подсистем. Долгие live-router и Android проверки запускаются отдельно по [`test-strategy.ru.md`](test-strategy.ru.md).
