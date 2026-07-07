# Архитектура бэкенда Sheepfold (OpenWRT)

> Для AI-агентов: этот файл описывает бэкенд-слой роутера. Читать вместе с `docs/developer-task.ru.md`, `docs/android-openwrt-api.ru.md` и `AGENTS.md`.

---

## Уровни системы

```
┌─────────────────────────────────────────────┐
│              Android-приложение              │  родительский интерфейс
│              LuCI (overview.js)              │  веб-интерфейс
│              Мессенджер (Telegram/VK)        │  удалённые команды
└────────────────────┬────────────────────────┘
                     │ HTTP(S)
┌────────────────────▼────────────────────────┐
│   /cgi-bin/sheepfold-api/*  (CGI-шлюз)      │  API-слой
└────────────────────┬────────────────────────┘
                     │ exec
┌────────────────────▼────────────────────────┐
│   /usr/libexec/sheepfold/sheepfold-router-   │  бизнес-логика
│   control  (shell/Lua/Python)                │
└────────┬────────────────────┬───────────────┘
         │ uci                │ nftables/iptables
┌────────▼────┐    ┌──────────▼──────────────┐
│ /etc/config │    │ firewall4 / nftables     │
│ /sheepfold  │    │ dnsmasq                  │
└─────────────┘    └─────────────────────────┘
```

---

## CGI-эндпоинты (`/cgi-bin/sheepfold-api/`)

### Обязательные эндпоинты MVP

| Метод | Путь | Описание |
|---|---|---|
| GET | `/router-info` | Диагностический снимок (без секретов) |
| GET | `/client-status` | Статус текущего клиента (детский APK) |
| POST | `/device/allow` | Разрешить устройство |
| POST | `/device/block` | Заблокировать устройство |
| POST | `/device/temp-access` | Временный доступ (+N минут) |
| GET | `/devices` | Список всех устройств |
| POST | `/global-block` | Включить/выключить глобальную блокировку |
| POST | `/admin/pairing/activate` | Активировать одноразовый код сопряжения |
| GET | `/admin/pairing/status` | Проверить статус сопряжения |
| POST | `/settings/save` | Сохранить UCI-настройки |
| GET | `/log` | Административный журнал |
| POST | `/log/clear` | Очистить журнал (с подтверждением) |

### Правила безопасности API

- Каждый запрос проверяет Bearer-токен администратора.
- Токены хранятся на роутере как HMAC-хэши; plaintext не хранится.
- Опасные действия (reboot, update, global-block, clear-log) требуют повторного подтверждения через отдельный `confirm`-токен.
- Ответы всегда JSON; ошибки — `{"error": "...", "code": N}`.

---

## `/cgi-bin/sheepfold-api/router-info`

Возвращает структуру без секретов:

```json
{
  "current_time": "07.07.2026 17:00:00",
  "sheepfold_version": "0.1.0-1",
  "internet_status": "online",
  "internet_reason": "WAN link up, DNS ok",
  "ping_yandex_ms": 12,
  "firmware_version": "OpenWrt 23.05.3",
  "openwrt_release": "23.05.3",
  "kernel_version": "5.15.150",
  "router_model": "Xiaomi AX3000T",
  "uptime": "3d 12h 05m",
  "load_average": "0.12 0.10 0.08",
  "memory": "128 MB / 512 MB",
  "lan_ports_count": 3,
  "lan_ports": "eth0, eth1, eth2",
  "podkop_installed": "yes",
  "podkop_version": "1.2.3",
  "adguard_installed": "yes",
  "adguard_version": "0.107.x",
  "wifi_count": 2,
  "wifi_1_name": "radio0",
  "wifi_1_status": "enabled",
  "wifi_1_band": "2.4 GHz",
  "wifi_1_channel": "6",
  "wifi_1_type": "mac80211",
  "wifi_1_path": "platform/soc/...",
  "wifi_1_country": "RU",
  "wifi_1_mode": "Master"
}
```

> **Запрещено** включать в ответ: пароли Wi-Fi, токены ботов/AI, имена детей, MAC-адреса устройств, списки клиентов.

---

## `/cgi-bin/sheepfold-api/client-status`

Endpoint для детского APK. Не требует токена администратора — идентифицирует устройство по IP из DHCP.

Запрос: `GET /cgi-bin/sheepfold-api/client-status`

Ответ:
```json
{
  "status": "allowed",
  "schedule_name": "Учебные дни",
  "next_change_at": "20:30",
  "warning_before_minutes": 5
}
```

Возможные значения `status`: `allowed`, `restricted`, `scheduled`, `blocked`.

---

## sheepfold-router-control

Скрипт `/usr/libexec/sheepfold/sheepfold-router-control` — центральный исполнитель бэкенд-команд.

### Вызов

```sh
/usr/libexec/sheepfold/sheepfold-router-control <команда> [аргументы...]
```

### Команды

| Команда | Аргументы | Действие |
|---|---|---|
| `router-info` | — | Вывод диагностики key=value |
| `led-apply` | — | Применить LED-настройки |
| `site-lists-cron-apply` | — | Перепланировать cron обновления списков |
| `activate-admin-pairing-code` | login code name ttl | Активировать одноразовый код |
| `admin-pairing-status` | login since | Проверить статус сопряжения |
| `device-allow` | mac | Добавить в allowlist |
| `device-block` | mac | Добавить в blocklist |
| `device-temp-access` | mac minutes | Временный доступ |
| `global-block-on` | — | Включить глобальную блокировку |
| `global-block-off` | — | Выключить глобальную блокировку |
| `wifi-on` | — | Включить все Wi-Fi радио |
| `wifi-off` | — | Выключить все Wi-Fi радио |
| `reboot` | — | Перезагрузка (записывает запрос в файл) |
| `update-check` | — | Проверить обновление |
| `update-install` | — | Установить обновление |

Вывод — построчные пары `key=value` или JSON (зависит от команды).

---

## UCI-конфиг `/etc/config/sheepfold`

### Структура секций

```uci
config sheepfold 'global'
  option app_port '5201'
  option ui_asset_version '0.1.0-1'
  option log_cache_path '/tmp/sheepfold/events.log'
  option site_lists_update_interval 'daily'
  option new_device_behavior 'allow'
  option auto_configure '1'
  option detection_mode 'full'
  option wifi_auto_disable_mode 'never'
  option wifi_auto_disable_time '23:00'
  option router_led_control 'router_default'
  option bedtime '22:00'
  option active_messenger 'disabled'
  option ai_provider 'gemini_free'

config administrator 'owner'
  option login 'SuperParent'
  option name 'Родитель'
  option role 'owner'

config messenger_global 'messenger_global'
  option telegram_token ''
  option telegram_chat_id ''
  option vk_token ''
  option vk_community_id ''
  option vk_admin_user_id ''

config pairing_global 'pairing_global'
  option discovery_file '/www/.well-known/sheepfold.json'
```

> Правило: в одном UCI-файле не должно быть двух секций с одним именем (например, двух `'global'`).
> Используйте уникальные имена: `messenger_global`, `pairing_global`, `export_global`.

---

## Приоритеты правил доступа

Порядок от наивысшего к низшему:

1. **Blocklist** — блокирует всегда, ничто не переопределяет.
2. **Allowlist** — обходит расписания, временный доступ, глобальную блокировку.
3. **No restrictions** (группа) — обходит расписания и глобальную блокировку, но не blocklist.
4. **Глобальная блокировка** — блокирует всех, кроме allowlist и No restrictions.
5. **Временный доступ** — переопределяет расписания, но не blocklist.
6. **Расписание** — применяется к устройствам, не охваченным выше.
7. **По умолчанию** (`new_device_behavior`) — для новых устройств.

---

## Диагностическая цепочка интернет-соединения

Проверяется последовательно:

1. WAN link state через `ubus call network.interface.wan status`
2. Default route / gateway (`ip route`)
3. DNS — разрешение `ya.ru`, `gosuslugi.ru` (для России)
4. HTTP(S) — лёгкий запрос к `ya.ru` (HEAD/GET)

Если шаг 1–2 провален — статус `offline`.
Если 3 провален — `limited` (интернет есть, DNS сломан).
Если 4 провален — `limited` (HTTP заблокирован).

> Не используйте `1.1.1.1`, `8.8.8.8`, `google.com` как единственные цели диагностики.

---

## Безопасность и ограничения

- LuCI вызывает только `/usr/libexec/sheepfold/sheepfold-router-control` — не строит shell-команды динамически.
- rpcd ACL явно перечисляет разрешённые файлы, UCI-конфиги и exec-пути.
- Секреты (токены, ключи AI) никогда не попадают в `router-info`, журнал или QR-коды.
- Ожидание в бэкенде (long poll, cron, update) не отображается в UI-комментариях как требование — оно закреплено здесь.
- Журнал хранится в RAM (`/tmp/sheepfold/events.log`). При экспорте маскируются MAC-адреса и IP.

---

## Связанные документы

- [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) — полный справочник эндпоинтов
- [`docs/android-config.ru.md`](android-config.ru.md) — конфигурация Android-клиента
- [`docs/developer-task.ru.md`](developer-task.ru.md) — точка входа
- [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) — плейбук для AI-агентов
- [`docs/live-router-testing.ru.md`](live-router-testing.ru.md) — тестирование на живом роутере
