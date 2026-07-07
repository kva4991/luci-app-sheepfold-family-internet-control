# Конфигурация Android-клиентов Sheepfold

## Тема приложения

По умолчанию тема следует системной настройке устройства (`ThemeMode.SYSTEM`).
Родитель может вручную выбрать `LIGHT` или `DARK` в разделе «Настройки» → «Тема».
Выбор сохраняется в `ThemePreferenceStore` (DataStore Preferences).

```kotlin
enum class ThemeMode { SYSTEM, LIGHT, DARK }
```

Передача темы в UI:
```kotlin
// MainActivity.kt
val themeMode by viewModel.themeMode.collectAsState()
SheepfoldApp(themeMode = themeMode)
```

> **Правило:** значение по умолчанию всегда `ThemeMode.SYSTEM`. Нельзя хардкодить светлую или тёмную тему без явного выбора пользователя.

---

## Локальное хранилище настроек

| Ключ | Тип | Описание |
|------|-----|----------|
| `theme_mode` | String | `SYSTEM` / `LIGHT` / `DARK` |
| `router_base_url` | String | Базовый URL API роутера (например `http://192.168.1.1`) |
| `router_pairing_token` | String | Токен привязки к роутеру (выдаётся при pairing) |
| `ai_provider` | String | Выбранный AI-провайдер (`openai`, `anthropic`, `gemini` и др.) |
| `parent_google_account` | String | Email Google-аккаунта родителя (опционально) |

Все настройки хранятся в `DataStore<Preferences>`, а не в `SharedPreferences`.

---

## Детский APK

Детский APK — отдельное упрощённое приложение без авторизации пользователя.

- Хранит только `router_base_url` (адрес роутера в локальной сети).
- Не хранит токены, пароли и MAC-адреса.
- Тема: `ThemeMode.SYSTEM` по умолчанию, без настройки в UI (детский APK не предоставляет экран настроек темы).
- MAC устройства **не передаётся** в запросе — роутер определяет его самостоятельно по IP клиента.

### Единственный сетевой запрос детского APK

```
GET /cgi-bin/sheepfold-api/client-status
```

Без параметров. Роутер использует `REMOTE_ADDR` для идентификации устройства.

---

## Уведомления детского APK

Если в ответе `/client-status` присутствует поле `accessEndsAt`:

1. APK сравнивает `accessEndsAt` с `serverTime` из ответа (не с локальным временем устройства — во избежание рассинхрона часов).
2. Если до окончания доступа больше 5 минут — ставит локальное уведомление на `accessEndsAt − 5 минут` через `AlarmManager` / `WorkManager`.
3. Если до окончания меньше 5 минут или уже прошло — уведомление не ставится (нет смысла показывать «запоздалое» предупреждение).
4. При каждом обновлении статуса — предыдущее уведомление отменяется и планируется новое.
5. Если `accessEndsAt = null` (постоянный доступ или постоянная блокировка) — уведомление не ставится.

---

## Архитектурные слои родительского APK

```
UI Layer          — Compose-экраны
ViewModel Layer   — состояние экранов, загрузка, ошибки
Repository Layer  — RouterApiRepository, InternetControlRepository
Network Layer     — HTTP-клиент к /cgi-bin/sheepfold-api/
Local Storage     — ThemePreferenceStore, SheepfoldConnectionStore
```

### Что является источником правды

- **Роутер** — список устройств, статусы доступа, расписания, временные разрешения.
- **Локальное хранилище** — только UI-настройки (тема, адрес роутера, выбор AI-провайдера).

Данные о доступе нельзя считать достоверными без актуального ответа от роутера. Кэш APK используется только для отображения предыдущего состояния в момент загрузки.

---

## Связанные документы

- [`docs/backend-design.ru.md`](./backend-design.ru.md) — backend-контракт, endpoint'ы API, логика MAC по IP
- [`docs/testing-cases.ru.md`](./testing-cases.ru.md) — тест-кейсы для Android, детского APK и backend
