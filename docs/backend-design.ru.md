# Backend-дизайн Sheepfold API

## Принципы

1. **Android-клиенты используют Sheepfold Product API** — собственные endpoint'ы поверх `uhttpd`, а не прямой LuCI JSON-RPC.
2. **LuCI и Android-приложения опираются на одно backend-ядро** — бизнес-логика не дублируется.
3. **MAC определяется на роутере по IP** — клиентскому устройству не доверяем никогда.
4. **Единый формат ответов** для всех endpoint'ов.

---

## Формат ответа

Все endpoint'ы возвращают JSON в едином конверте:

```json
{
  "ok": true,
  "apiVersion": "1",
  "serverTime": "2026-07-07T15:30:00+03:00",
  "data": { ... },
  "error": null
}
```

При ошибке:

```json
{
  "ok": false,
  "apiVersion": "1",
  "serverTime": "2026-07-07T15:30:00+03:00",
  "data": null,
  "error": {
    "code": "device_unknown",
    "message": "Роутер не смог однозначно определить это устройство."
  }
}
```

---

## Endpoint'ы

### GET /cgi-bin/sheepfold-api/ping

Проверка связности. Не требует авторизации.

```json
{ "ok": true, "apiVersion": "1", "serverTime": "...", "data": { "status": "ok" }, "error": null }
```

### GET /cgi-bin/sheepfold-api/router-info

Безопасный снэпшот состояния роутера. **Не содержит** паролей, токенов, MAC-адресов, сырых логов.

Поля `data`: `uptime`, `wanState`, `localTime`, `countryProfile`, `sheepfoldVersion`.

### GET /cgi-bin/sheepfold-api/devices

Нормализованный список устройств для родительского APK.

Каждый элемент массива `data.devices`:

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "ip": "192.168.1.43",
  "displayName": "Телефон Маши",
  "group": "children",
  "note": "",
  "status": "Scheduled",
  "currentAccessState": "enabled",
  "accessEndsAt": "2026-07-07T21:00:00+03:00",
  "minutesRemaining": 89
}
```

Возможные значения `status`: `Allow`, `Blocked`, `Scheduled`, `Restricted`, `New`.

### GET /cgi-bin/sheepfold-api/schedules

Список расписаний. Каждый элемент:

```json
{
  "id": "sched_001",
  "deviceMac": "AA:BB:CC:DD:EE:FF",
  "days": [1,2,3,4,5],
  "allowFrom": "07:00",
  "allowUntil": "21:00"
}
```

### POST /cgi-bin/sheepfold-api/device/action

Единый endpoint для действий с устройствами.

Тело запроса:

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "actionType": "temporary_grant",
  "payload": { "duration": "30m" }
}
```

Возможные `actionType`: `allow`, `block`, `temporary_grant`, `set_group`, `set_name`, `set_note`, `mark_reviewed`.

Возможные `duration` для `temporary_grant`: `15m`, `30m`, `60m`, `end_of_day`, `until_bedtime`.

### POST /cgi-bin/sheepfold-api/internet/state

Глобальное управление интернетом.

```json
{ "state": "disabled" }
```

Ответ `data`: `{ "internetState": "disabled", "appliedAt": "..." }`.

### POST /cgi-bin/sheepfold-api/ai/ask

Серверный прокси к AI-провайдеру.

```json
{ "question": "Как правильно выставить расписание для подростка?", "contextFlags": ["devices", "schedules"] }
```

Backend добавляет системный промпт и контекст (устройства, расписания), отправляет к провайдеру и возвращает текст ответа.

### GET /cgi-bin/sheepfold-api/client-status

Для детского APK. **Без параметров. MAC определяется на роутере по IP.**

Ответ `data`:

```json
{
  "deviceName": "Телефон ребёнка",
  "internetState": "enabled",
  "accessMode": "scheduled",
  "accessEndsAt": "2026-07-07T21:00:00+03:00",
  "minutesRemaining": 27,
  "message": "Интернет доступен до 21:00 по расписанию."
}
```

Если MAC не удалось определить — `ok: false`, код ошибки `device_unknown`.

---

## Логика определения MAC по IP

> **Правило:** endpoint `client-status` никогда не доверяет MAC или другому идентификатору, приходящему с клиентского устройства. MAC определяется строго на роутере по IP и таблицам клиентов.

Алгоритм функции `resolve_mac_from_ip(ip)`:

1. Получить IP клиента: `os.getenv("REMOTE_ADDR")` в CGI/Lua-обработчике.
2. Попробовать через neighbor-таблицу:
   ```sh
   ip neigh show <IP> | awk '/lladdr/ {print $5}'
   ```
3. Если не найдено — попробовать через hostapd/Wi-Fi:
   ```sh
   ubus call hostapd.wlan0 get_clients
   ```
   Сопоставить IP/станцию и MAC.
4. Нормализовать MAC: верхний регистр, формат `AA:BB:CC:DD:EE:FF`.
5. Если MAC не найден — вернуть `nil` и ответить ошибкой `device_unknown`.

---

## Нормализованная модель Device

Источники данных (собираются и объединяются backend-ядром):

- DHCP-аренды (`/var/dhcp.leases` или ubus)
- Статические DHCP-записи (UCI)
- ARP/neighbor (`ip neigh show`)
- Wi-Fi клиенты (hostapd, iwinfo)
- Внутренние списки Sheepfold (allowlist, blocklist, расписания, временные разрешения)

## Расчёт статуса и приоритет правил

Функция `compute_device_access(device, global_state, schedules, temporary_grants)`:

Приоритет (от высшего к низшему):

1. `Blocked` — всегда отключён, игнорирует всё остальное
2. Активное временное разрешение (`temporary_grant`) — включает доступ до `accessEndsAt`
3. `Allow` — всегда включён (если нет блокировки)
4. Активное расписание (`Scheduled`) — включён в разрешённое окно
5. `Restricted` — ограниченный доступ (только белый список доменов)
6. Глобальное состояние интернета (`internetState`)
7. `New` — устройство ещё не классифицировано

## Временные окна и accessEndsAt

| Тип | Расчёт accessEndsAt |
|-----|--------------------|
| `15m` / `30m` / `60m` | `startTime + duration` |
| `end_of_day` | Сегодня 23:59:59 по локальному времени роутера |
| `until_bedtime` | Время отбоя из семейной настройки |
| Расписание | Конец ближайшего активного окна для текущего дня недели |
| Постоянный Allow/Block | `null` |

---

## Аутентификация

### Родительский APK

- При первичной настройке — pairing через QR или одноразовый код.
- Роутер выдаёт `deviceId` и `pairingToken`.
- Все запросы идут с заголовком `X-Sheepfold-Token: <token>`.
- Административные endpoint'ы (`/device/action`, `/internet/state`, `/ai/ask`) требуют валидный токен.

### Детский APK

- Без авторизации пользователя.
- Endpoint `/client-status` доступен только из локальной сети.
- Никаких паролей, токенов и MAC не передаётся.

---

## Связанные документы

- [`docs/android-config.ru.md`](./android-config.ru.md) — конфигурация Android-клиентов
- [`docs/testing-cases.ru.md`](./testing-cases.ru.md) — тест-кейсы
- [`docs/developer-task.ru.md`](./developer-task.ru.md) — задача разработчика
