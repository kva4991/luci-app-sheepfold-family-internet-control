# Задача: разделить Sheepfold на Standard и AI Support

<!-- §prodvar -->

## Прямое задание разработчику

Раздели текущий проект Sheepfold на два поставляемых варианта без создания двух копий общего кода:

- **Sheepfold** — стандартное семейное управление интернетом без любых AI-функций и без журналов активности устройств для ИИ;
- **Sheepfold - AI Support** — полный функционал стандартного Sheepfold плюс ИИ-помощник, router-side AI proxy и явно включаемый сбор контекста.

Работай в текущем репозитории. Не создавай второй репозиторий на первом этапе. Общие изменения должны попадать в оба варианта из одного commit SHA и проверяться общей CI matrix.

Источник архитектурных требований: [`docs/product-variants.ru.md`](product-variants.ru.md).

## Обязательные ограничения

1. Не дублируй firewall, detector, schedules, groups, pairing, messenger или Android router client между вариантами.
2. Не реализуй Standard как AI-сборку со скрытой вкладкой. AI-файлы и activity collector физически не должны входить в стандартные артефакты.
3. Не меняй существующие UCI-ключи и API общего контроля без миграции и тестов обратной совместимости.
4. Не удаляй обычный технический/административный журнал из Standard. Убираются только подробные журналы активности устройств, предназначенные для AI-контекста.
5. Не отправляй AI-провайдеру MAC, IP, имена, список устройств, логи или семейный контекст без предпросмотра и отдельного подтверждения родителя.
6. AI не применяет настройки самостоятельно: сначала показывает предложение, затем требует явного подтверждения администратора.
7. Не создавай ручной скрипт, который «одновременно пушит» одинаковый код в два репозитория. Такой процесс неатомарен и создаёт рассинхронизацию.
8. Сохрани совместимость с OpenWrt, AdGuard Home, Podkop, LuCI cache-busting, импортом/экспортом и текущей HTTPS-привязкой Android.

## Этапы выполнения

### Этап 1. Карта зависимостей

- Составь машинно проверяемый список AI-only файлов, endpoint, UCI-опций, переводов, Android экранов и зависимостей.
- Отдельно перечисли common-функции.
- Найди смешанные файлы, особенно `overview.js`, API facade/legacy backend, defaults, ACL, init scripts и Android navigation.
- Добавь characterization tests до переноса кода.

### Этап 2. Точка расширения LuCI и API

- Создай registry модулей/вкладок, через который AI-пакет добавляет UI.
- Вынеси AI UI из общего `overview.js`.
- Вынеси AI endpoint routing, provider handlers, prompts и activity logger из стандартного package payload.
- При отсутствии AI-модуля API должен возвращать предсказуемое `404 feature_not_installed`, а не `undefined` или shell error.

### Этап 3. OpenWrt packages

- Сохрани существующий стандартный package name для бесшовного обновления.
- Создай AI backend package и AI LuCI addon.
- Опиши `DEPENDS`, `CONFLICTS`, `PROVIDES` и удаление так, чтобы AI-addon можно было безопасно добавить или удалить.
- Не удаляй `/etc/config/sheepfold`, клиентов, группы и расписания при удалении AI-addon.
- Добавь миграцию старой единой установки: AI выключен — Standard; AI настроен/включён — предложить установить AI-addon без потери ключей.

### Этап 4. Android flavors

- Введи flavors `standard` и `aiSupport` с общим `main` source set.
- Оставь pairing, HTTPS, widgets, device control и настройки роутера в `main`.
- Помести AI tab, AI client/context preview и AI-ресурсы только в `aiSupport`.
- Собирай APK с понятными именами и разными `applicationId`, пока не принято решение о магазинном upgrade path.
- Проверь первый запуск, QR-подключение и все главные меню в обоих variants.

### Этап 5. CI и доказательство отсутствия AI в Standard

- Добавь matrix: OpenWrt Standard, OpenWrt AI Support, Android Standard, Android AI Support.
- Общий набор тестов контроля запускай против обоих вариантов.
- Добавь негативные archive tests: в Standard отсутствуют `sheepfold-ai-*`, prompts, provider keys, AI routes, activity logger, AI strings и AI Android classes/resources.
- Добавь позитивные тесты, что AI-артефакты всё это содержат и используют тот же common API.
- Проверяй установку Standard → AI, AI → Standard и обновление обеих версий на живом тестовом роутере.

### Этап 6. Документация и релиз

- Раздели README feature tables и инструкции установки.
- Обнови privacy policy: для Standard явно указать отсутствие AI activity collection; для AI Support описать opt-in и внешнего провайдера.
- В одном GitHub Release публикуй оба комплекта, указывая commit SHA и совместимые версии.
- Не называй экспериментальный AI-функционал частью Standard.

## Обязательные тестовые сценарии

- Добавление устройства в allowlist/blocklist одинаково работает в обеих версиях.
- Расписание и временный доступ дают одинаковый effective state.
- Standard не создаёт файлы журналов активности даже при оставшихся старых UCI-опциях.
- Standard не слушает AI endpoint и не содержит provider key fields.
- AI Support без согласия не запускает activity collection.
- AI Support после удаления оставляет управление интернетом работоспособным.
- Импорт Standard backup в AI Support сохраняет клиентов и правила.
- Импорт AI backup в Standard игнорирует AI-секреты безопасно и сообщает об этом.
- Обе Android-сборки подключаются одним форматом pairing QR и работают с common API version.

## Боевой промпт для ИИ-разработчика

```text
Ты работаешь в репозитории Sheepfold. Раздели продукт на Sheepfold Standard и
Sheepfold - AI Support согласно docs/product-variants.ru.md и
docs/product-variants-implementation-task.ru.md.

Сначала прочитай AGENTS.md, docs/agent-fast-start.ru.md,
docs/current-implementation-status.md, docs/security.md, docs/privacy.ru.md,
docs/android-openwrt-api.ru.md и документы, найденные по тегу §prodvar.

Не создавай второй репозиторий и не копируй общее ядро. Сначала составь карту
common и AI-only зависимостей по реальному коду. Добавь characterization tests,
затем выполняй миграцию маленькими проверяемыми этапами.

Standard обязан содержать всё управление устройствами, но не должен физически
содержать AI backend, AI prompts, AI UI, provider keys или подробный activity
logger. Обычный административный журнал Sheepfold остаётся common.

AI Support должен зависеть от того же общего ядра и добавлять AI возможности
через явные module/plugin boundaries. Не скрывай AI только визуально.

Для Android используй product flavors с общим main source set. Для OpenWrt
используй общий core/standard package и отдельные AI backend/LuCI addons.
Сохрани существующие UCI и API контракты общего контроля либо добавь миграцию.

После каждого этапа запускай точечные тесты. Перед завершением собери обе пары
IPK/APK, проверь содержимое архивов, затем запусти полный Node/shell/Android CI.
Артефакты положи в Downloads, но не коммить их. Обнови focused docs, §-теги,
tag-map, current implementation status и инструкции установки.

Не останавливайся на плане: реализуй текущий согласованный этап до работающей,
протестированной точки. Не заявляй, что разделение готово, пока негативные тесты
не доказали отсутствие AI-кода в Standard.
```

## Точка остановки первого этапа

Первый PR не обязан сразу выпускать четыре продукта. Он должен:

- закрепить feature matrix;
- добавить тесты границы Standard/AI;
- создать module registry;
- вынести один вертикальный AI-сценарий целиком (UI → API → handler → prompt);
- сохранить поведение текущей полной сборки;
- оставить репозиторий в состоянии, где следующий AI-сценарий переносится тем же способом.

