# Индекс документации для AI-агентов

> Этот файл — навигатор по репозиторию для AI-агентов (Claude, GPT, Gemini, DeepSeek и других).
> Читайте его первым, если не знаете с чего начать.

---

## Обязательные файлы (читать всегда)

| Файл | Зачем |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Правила именования, стиль кода, ограничения, архитектурные решения |
| [`docs/developer-task.ru.md`](developer-task.ru.md) | Точка входа: что делаем, порядок чтения, фокус следующего этапа |
| [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) | Детальный плейбук: продуктовые решения из обсуждения с владельцем |
| [`docs/product-requirements.md`](product-requirements.md) | Полные требования к продукту |

---

## Перед реализацией любой функции

1. Проверь `AGENTS.md` — нет ли запрета на эту функцию.
2. Прочитай соответствующий focused-doc из таблицы ниже.
3. Убедись, что тест-кейс в `docs/testing-cases.ru.md` покрывает эту функцию.
4. Если меняешь продуктовое решение — обнови `AGENTS.md` и `docs/developer-task.ru.md`.

---

## Карта документов по компонентам

### Роутер / OpenWRT

| Файл | Тема |
|---|---|
| [`docs/backend-design.ru.md`](backend-design.ru.md) | Архитектура бэкенда, API-эндпоинты, UCI, приоритеты правил |
| [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) | Полный справочник CGI-эндпоинтов |
| [`docs/live-router-testing.ru.md`](live-router-testing.ru.md) | Тестирование на живом роутере |
| [`docs/luci-cache.ru.md`](luci-cache.ru.md) | Cache-busting для LuCI-ассетов |
| [`docs/podkop-luci-notes.ru.md`](podkop-luci-notes.ru.md) | Совместная работа с Podkop |
| [`docs/integrations.md`](integrations.md) | AdGuard Home, Podkop |
| [`docs/github-install-setup.md`](github-install-setup.md) | Установка и обновление |

### Android

| Файл | Тема |
|---|---|
| [`docs/android-config.ru.md`](android-config.ru.md) | Конфигурация, сопряжение, детский APK, AI-ассистент |
| [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) | API, которое вызывает Android |

### Семейные функции

| Файл | Тема |
|---|---|
| [`docs/schedules.ru.md`](schedules.ru.md) | Расписания |
| [`docs/domain-allowlist.ru.md`](domain-allowlist.ru.md) | Белые списки доменов |
| [`docs/site-list-sources.ru.md`](site-list-sources.ru.md) | Источники списков сайтов |
| [`docs/device-detection.ru.md`](device-detection.ru.md) | Автоопределение типа устройства |
| [`docs/age-scenarios.ru.md`](age-scenarios.ru.md) | Сценарии по возрасту ребёнка |
| [`docs/contextual-help.ru.md`](contextual-help.ru.md) | Контекстная справка в UI |

### Мессенджеры

| Файл | Тема |
|---|---|
| [`docs/messaging.ru.md`](messaging.ru.md) | Telegram, VK, команды |
| [`docs/telegram-bot-setup.ru.md`](telegram-bot-setup.ru.md) | Пошаговая настройка Telegram |

### AI-ассистент

| Файл | Тема |
|---|---|
| [`docs/ai-assistant.ru.md`](ai-assistant.ru.md) | Описание AI-функций для родителя |
| [`docs/ai-context-sharing.ru.md`](ai-context-sharing.ru.md) | Правила передачи контекста |
| [`docs/ai-assistant-prompt-for-support-parent/`](ai-assistant-prompt-for-support-parent/) | Системные промпты |

### Конфиденциальность и безопасность

| Файл | Тема |
|---|---|
| [`docs/privacy.ru.md`](privacy.ru.md) | Политика конфиденциальности |
| [`docs/security.md`](security.md) | Модель угроз |
| [`docs/user-agreement.ru.md`](user-agreement.ru.md) | Пользовательское соглашение |
| [`docs/private-activity-logs.ru.md`](private-activity-logs.ru.md) | Журнал активности (opt-in) |
| [`docs/site-activity-logs.ru.md`](site-activity-logs.ru.md) | Журнал посещённых сайтов |
| [`docs/log-events.ru.md`](log-events.ru.md) | События административного журнала |

### Тестирование

| Файл | Тема |
|---|---|
| [`docs/testing-cases.ru.md`](testing-cases.ru.md) | Тест-кейсы (чеклист перед PR) |
| [`docs/live-router-testing.ru.md`](live-router-testing.ru.md) | Тестирование на живом роутере |
| [`docs/agent-environment.ru.md`](agent-environment.ru.md) | Окружение агента, нужные программы, сборка IPK/APK и рабочие команды проверок |

### Прочее

| Файл | Тема |
|---|---|
| [`docs/localization.ru.md`](localization.ru.md) | Локализация |
| [`docs/country-profiles.ru.md`](country-profiles.ru.md) | Страновые профили |
| [`docs/voice-assistants.ru.md`](voice-assistants.ru.md) | Голосовые ассистенты |
| [`docs/usb-storage-design.ru.md`](usb-storage-design.ru.md) | USB-хранилище |
| [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md) | Yandex Disk: WebDAV, зеркалирование журнала, бэкапы, LuCI |
| [`docs/development-ideas.md`](development-ideas.md) | Идеи для будущих версий |
| [`docs/project-presentation.ru.md`](project-presentation.ru.md) | Презентация проекта |

---

## Критические ограничения (запомни с первого раза)

1. **Не добавляй `yandex.ru`** в списки по умолчанию — только `ya.ru` для поиска.
2. **Не реализуй VPN/WireGuard** — удалённое управление только через мессенджер.
3. **Не храни секреты в QR, `router-info`, журнале.**
4. **Blocklist — наивысший приоритет**, ничто его не переопределяет.
5. **Сохранение настроек — только по кнопке «Сохранить»**, не автосохранение.
6. **Бэкенд-ожидания зафиксированы в `backend-design.ru.md`** — не переносить в UI-комментарии.
7. **Детский APK — без токенов и административных функций.**
8. **Диагностика интернета — страновая цепочка**, для России: `ya.ru`, `gosuslugi.ru`.

---

## Как предложить изменение продуктового решения

1. Опиши изменение в комментарии к PR.
2. Обнови `AGENTS.md` в том же PR.
3. Обнови `docs/developer-task.ru.md` и этот файл, если изменение затрагивает архитектуру.
4. Дождись одобрения владельца репозитория перед мержем.
