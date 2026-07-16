# Задача разработчика — Sheepfold

> **Точка входа для нового разработчика и AI-агента.**
> Читайте этот файл первым, затем переходите по ссылкам на детальные документы.
>
> План разделения одного общего кода на `Sheepfold` и `Sheepfold - AI Support`: [`product-variants.ru.md`](product-variants.ru.md). Прямое задание и боевой промпт: [`product-variants-implementation-task.ru.md`](product-variants-implementation-task.ru.md) (§prodvar).

---

## Что такое Sheepfold

Sheepfold — OpenWRT-пакет для семейного управления доступом в интернет. Родитель управляет через веб-интерфейс LuCI и Android-приложение. Управление включает: расписания, группы устройств, белый и чёрный списки устройств, отдельные списки сайтов, аварийно-полезные сайты, интеграции с Telegram/VK, AI-ассистент.

---

## Порядок чтения документации

1. [`docs/agent-fast-start.ru.md`](agent-fast-start.ru.md) — короткий маршрут нового чата: что проверить и читать, не загружая весь проект в контекст. (§fastagt)
2. [`docs/owner-communication-profile.ru.md`](owner-communication-profile.ru.md) — как понимать итеративные требования владельца, различать виды списков и сообщать результат (§usrcomm).
3. **Этот файл** — общая ориентация и карта детальных документов.
4. [`docs/agent-environment.ru.md`](agent-environment.ru.md) — локальное окружение Codex Desktop на Windows, нужные программы, сборка IPK/APK и команды проверок.
5. [`docs/agent-gotchas.ru.md`](agent-gotchas.ru.md) — реестр неочевидных мелочей (i18n, группы, детектор, IPK); **обязательно дополнять** при новых находках.
6. [`docs/troubleshooting.ru.md`](troubleshooting.ru.md) — практический справочник ошибок: симптомы, причины, проверки и безопасные исправления для Windows, тестов, Android, OpenWRT и LuCI. (§trouble)
7. [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) — детальный плейбук для AI: продуктовые решения, архитектурные ограничения, правила реализации.
8. [`docs/product-requirements.md`](product-requirements.md) — полные требования к продукту.
9. [`docs/ai-assistant-development/README.md`](ai-assistant-development/README.md) — точка входа для памяти, модулей, БД и политики диалога ИИ-помощника (§aiarch1).
10. [`docs/backend-design.ru.md`](backend-design.ru.md) — архитектура бэкенда роутера, API-эндпоинты, UCI-структура.
11. [`docs/uci-config-migration.ru.md`](uci-config-migration.ru.md) — шаблон UCI, `postinst`, миграции при обновлении `.ipk` (обязательно при изменении `/etc/config/sheepfold`).
12. [`docs/default-groups.ru.md`](default-groups.ru.md) — группы `no_restrictions` / `child_1`, язык при установке, миграция алиасов.
13. [`docs/hidden-settings.ru.md`](hidden-settings.ru.md) — UCI-параметры без поля в LuCI; обновлять при появлении/удалении полей.
14. [`docs/localization.ru.md`](localization.ru.md) — LuCI gettext, `.lmo`, два параметра языка.
15. [`docs/android-config.ru.md`](android-config.ru.md) — конфигурация Android-клиента, сопряжение, детский APK.
16. [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) — полный справочник API.
17. [`docs/testing-cases.ru.md`](testing-cases.ru.md) — обязательный чеклист тест-кейсов перед PR.
18. [`AGENTS.md`](../AGENTS.md) — правила для AI-агентов: именование, стиль, ограничения, фиксация gotchas.
19. [`CODING_RULES.md`](../CODING_RULES.md) — обязательные правила кодинга и ревью (§22 — куда писать мелочи).
20. [`docs/owner-open-questions.ru.md`](owner-open-questions.ru.md) — ещё не принятые продуктовые и архитектурные решения с рекомендуемыми вариантами (§ownques).

---

## Текущий статус реализации

См. [`docs/current-implementation-status.md`](current-implementation-status.md).

**Кратко:** LuCI, router backend, API и оба Android-приложения уже содержат рабочие части и незавершённые экраны. Не поддерживайте здесь второй быстро устаревающий перечень: доказательный статус, границы реализации и нужные живые проверки находятся в [`current-implementation-status.md`](current-implementation-status.md) и [`implementation-audit-2026-07-16.ru.md`](implementation-audit-2026-07-16.ru.md) (§implaudit).

---

## Ключевые архитектурные решения

### 1. Хранение данных
- Все настройки — на роутере в `/etc/config/sheepfold`.
- Android хранит только адрес роутера, порт, логин администратора и кэш последнего снимка.
- Секреты (токены, AI-ключи) — только на роутере, никогда в Android и никогда в QR.

### 2. Приоритеты правил доступа (от высшего к низшему)
1. Blocklist (всегда блокирует)
2. Allowlist (обходит расписания и глобальную блокировку)
3. Группа «Без ограничений» (обходит расписания, не обходит blocklist)
4. Глобальная блокировка
5. Временный доступ
6. Расписание
7. По умолчанию (`new_device_behavior`)

### 3. API-слой
- Эндпоинт: `/cgi-bin/sheepfold-api/*`
- LuCI вызывает только `/usr/libexec/sheepfold/sheepfold-router-control` — без динамических shell-команд.
- Опасные действия требуют confirm-токена.

### 4. Android
- Первая настройка: соглашение → домашняя сеть → MAC-проверка → QR → PIN.
- Продолжение по мобильным данным заблокировано.
- Детский APK — отдельная сборка без авторизации.
- Тема по умолчанию: «следовать системе».

### 5. Уведомление за 5 минут до ограничения
API `/cgi-bin/sheepfold-api/client-status` возвращает `warning_before_minutes: 5`. Android и детский APK должны показывать уведомление заблаговременно.

### 6. Диагностика (router-info)
В ответе **запрещены**: пароли Wi-Fi, токены, MAC-адреса клиентов, имена детей, списки устройств.
Для диагностики интернета — страновая цепочка (для России: `ya.ru`, `gosuslugi.ru`, `ntp1.vniiftri.ru`).

---

## Структура репозитория

```
/
├── android/                  # Android-приложение (Kotlin)
│   └── app/                  # Единственный app-модуль
├── package/
│   └── luci-app-sheepfold-family-internet-control/
│       ├── htdocs/luci-static/resources/view/sheepfold/
│       │   └── overview.js   # Визуальный прототип LuCI
│       └── Makefile
├── docs/                     # Документация
│   ├── agent-playbook.ru.md  # Плейбук для AI
│   ├── agent-environment.ru.md # Codex Desktop на Windows: окружение и команды
│   ├── backend-design.ru.md  # Архитектура бэкенда ← читать обязательно
│   ├── ai-assistant-development/ # Модули, БД и dialogue policy ИИ-помощника
│   ├── yandex-disk-storage.ru.md  # Yandex Disk: WebDAV, журнал, бэкапы
│   ├── android-config.ru.md  # Android-конфигурация ← читать обязательно
│   ├── testing-cases.ru.md   # Тест-кейсы ← прогнать перед PR
│   └── ...
├── AGENTS.md                 # Правила для AI-агентов ← читать обязательно
└── README.md
```

---

## Фокус следующего этапа реализации

### Приоритет 1 — Бэкенд роутера
- [ ] Реализовать `sheepfold-router-control` с командами из `docs/backend-design.ru.md`
- [ ] Реализовать CGI-эндпоинты `/cgi-bin/sheepfold-api/`
- [ ] Подключить nftables/firewall4 для device-allow/block
- [ ] Реализовать `/client-status` для детского APK

### Приоритет 2 — LuCI архитектура
- [ ] Разбить `overview.js` по модулям (Podkop-style)
- [ ] Подключить реальные UCI-вызовы вместо заглушек
- [ ] Реализовать редактор расписаний
- [ ] Реализовать редактор групп

### Приоритет 3 — Android
- [ ] Экран сопряжения (QR-сканер + ручной ввод)
- [ ] First-setup flow (соглашение → сеть → MAC → QR → PIN)
- [ ] Главный экран: статус устройств, глобальная блокировка
- [ ] Детский APK — отдельный модуль

---

## Важные ограничения для AI-агентов

- Не добавлять `yandex.ru` в списки по умолчанию (только `ya.ru` для поиска).
- Не реализовывать VPN/WireGuard туннели.
- Не показывать селектор роли в MVP.
- Не добавлять скрытые детские интерфейсы.
- Бэкенд-ожидания (long poll, update, cron) закреплены в `docs/backend-design.ru.md` — не переносить их в UI-комментарии.
- Не хранить секреты в QR, `router-info`, журнале.
- Не использовать `1.1.1.1` / `google.com` как единственные цели диагностики.

---

## Контрольные точки (Definition of Done)

Перед тем как считать задачу выполненной:

- [ ] Пройдены все 🔴 критические тест-кейсы из `docs/testing-cases.ru.md`
- [ ] `router-info` не содержит секретов (TC-API-01)
- [ ] Сохранение настроек только по явному «Сохранить» (TC-UI-02)
- [ ] Blocklist имеет наивысший приоритет (TC-API-05, TC-EDGE-07)
- [ ] QR не содержит секретов (TC-SEC-02)
- [ ] Обновлён `AGENTS.md` при изменении продуктовых решений

---

## Связанные документы

| Документ | Назначение |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Правила для AI-агентов |
| [`docs/agent-fast-start.ru.md`](agent-fast-start.ru.md) | Короткий маршрут нового агента и экономный порядок проверок |
| [`docs/agent-environment.ru.md`](agent-environment.ru.md) | Локальное окружение Codex Desktop на Windows и команды проверок |
| [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) | Детальный плейбук |
| [`docs/product-requirements.md`](product-requirements.md) | Полные требования |
| [`docs/backend-design.ru.md`](backend-design.ru.md) | Архитектура бэкенда |
| [`docs/android-config.ru.md`](android-config.ru.md) | Android-конфигурация |
| [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) | Справочник API |
| [`docs/testing-cases.ru.md`](testing-cases.ru.md) | Тест-кейсы |
| [`docs/live-router-testing.ru.md`](live-router-testing.ru.md) | Тестирование на роутере |
| [`docs/messaging.ru.md`](messaging.ru.md) | Интеграция мессенджеров |
| [`docs/privacy.ru.md`](privacy.ru.md) | Политика конфиденциальности |
| [`docs/ai-assistant-development/README.md`](ai-assistant-development/README.md) | Архитектура будущего ИИ-помощника и карта модулей |
