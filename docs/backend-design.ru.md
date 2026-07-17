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
│   control  (POSIX shell/ucode)               │
└────────┬────────────────────┬───────────────┘
         │ uci                │ nftables/iptables
┌────────▼────┐    ┌──────────▼──────────────┐
│ /etc/config │    │ firewall4 / nftables     │
│ /sheepfold  │    │ dnsmasq                  │
└─────────────┘    └─────────────────────────┘
```

Sheepfold не закрепляет собственную старую версию Lua: `luci-base` использует runtime, совместимый с установленной версией OpenWrt/LuCI. Не добавлять `lua5.x` как отдельную зависимость без конкретного модуля, которому она действительно нужна (§luarunt).

---

## Firewall4 и четыре режима совместимости

Sheepfold использует штатные package-author drop-in файлы `firewall4`:

- `usr/share/nftables.d/table-pre/30-sheepfold.nft` — только собственные sets/chains;
- `usr/share/nftables.d/chain-pre/forward/30-sheepfold.nft` — переход в forward guard;
- `usr/share/nftables.d/chain-pre/input/30-sheepfold.nft` — запрет доступа устройств из чёрного списка к роутеру;
- `sheepfold-firewall sync` — изменение только элементов `sheepfold_*` sets.

Запрещено выполнять `flush ruleset`, удалять чужие таблицы, менять `meta mark`/`ct mark`, `ip rule`, `ip route`, Dnsmasq или sing-box. Это сохраняет таблицу и маркировку Podkop. Чёрный список устройств проверяется первым для запрета доступа к самому роутеру; затем белый список устройств, администраторы и группа «Без ограничений» образуют исключения глобальной блокировки. Временный доступ не является исключением глобальной кнопки (§84azytj, §v7x2k9p).

Один firewall-движок работает во всех четырёх `integration_mode`:

| Режим | Что меняет Sheepfold |
| --- | --- |
| `none` | Собственные правила доступа устройств; списки сайтов применяет выбранный backend |
| `adguard` | Правила доступа устройств остаются в Sheepfold; автоматический backend может управлять одним собственным URL-фильтром AdGuard Home |
| `podkop` | Podkop сохраняет собственную маршрутизацию и packet marks; списки сайтов применяет встроенный backend Sheepfold |
| `adguard_podkop` | Sheepfold решает доступ устройства, AdGuard фильтрует DNS, Podkop маршрутизирует разрешённый трафик |

Автоопределение выбирает профиль при первой установке. `integration_mode_user_set=1` защищает ручной выбор от повторной установки. Топология `integration_mode` и исполнитель `site_filter_backend=auto|adguard|sheepfold` являются разными настройками. Sheepfold не редактирует YAML AdGuard Home, не вызывает `filtering/set_rules` и не меняет Podkop; при включённом `adguard_auto_manage` он владеет только фильтром `Sheepfold family site policy`.

Четыре режима не являются четырьмя копиями firewall-кода. Они задают совместимость и подсказки интеграции, а решение о доступе устройства всегда применяет один `sheepfold-firewall`. Это уменьшает риск, что исправление приоритета blocklist попадёт только в часть комбинаций.

Текущий firewall-этап вычисляет активные расписания отдельных устройств и групп, применяет расписание устройства как более конкретное и разрешает конфликт по `schedule_conflict_internet`. `sheepfold-firewall sync` запускается после сохранения расписания и раз в минуту; хеш состояния не даёт переписывать nftables без изменения результата. Аварийно-полезные домены применяются отдельным helper через dnsmasq nftset или резервное разрешение базового домена и разрешают только web-трафик (§emerg1).

Внешние белые и чёрные списки сайтов применяет `sheepfold-domain-policy`: новый dnsmasq-конфиг сначала проверяется, затем DNS и firewall переключаются как одна транзакция, а при ошибке восстанавливается прежняя рабочая пара. Для AdGuard Home `sheepfold-adguard` строит отдельную ленту, ограничивает правила наблюдаемыми IPv4 клиентов и через официальный API добавляет, включает, обновляет или отключает только собственный URL-фильтр. Локальная политика снимается лишь после повторного подтверждения API; при ошибке используется встроенный fallback (§dompol). Расписания и доменные правила требуют проверки на живом роутере, поэтому весь access engine пока нельзя считать завершённым. Официальный механизм drop-in: <https://openwrt.org/docs/guide-user/firewall/firewall_configuration>. Рекомендованная DNS-связка Podkop/AdGuard Home: <https://podkop.net/docs/adguard/>.

---

## CGI-эндпоинты (`/cgi-bin/sheepfold-api/`)

### Обязательные эндпоинты MVP

| Метод | Путь | Описание |
|---|---|---|
| GET | `/router-info` | Диагностический снимок (без секретов) (§oh9sdbd) |
| GET | `/client-status` | Статус текущего клиента (детский APK) |
| POST | `/device/allow` | Разрешить устройство |
| POST | `/device/block` | Заблокировать устройство |
| POST | `/device/temp-access` | Временный доступ (+N минут) |
| GET | `/devices` | Список всех устройств |
| POST | `/global-block` | Включить/выключить глобальную блокировку (§qjiujv6) |
| POST | `/admin/pairing/activate` | Активировать одноразовый код сопряжения |
| GET | `/admin/pairing/status` | Проверить статус сопряжения |
| POST | `/settings/save` | Сохранить UCI-настройки |
| GET | `/log` | Административный журнал |
| POST | `/log/clear` | Очистить журнал (с подтверждением) (§qjiujv6) |

### Правила безопасности API

- Каждый запрос проверяет Bearer-токен администратора (§h75lxo6).
- Токены хранятся на роутере как HMAC-хэши; plaintext не хранится.
- Опасные действия (reboot, update, global-block, clear-log) требуют повторного подтверждения через отдельный `confirm`-токен (§qjiujv6).
- Ответы всегда JSON; ошибки — `{"error": "...", "code": N}`.

---

## `/cgi-bin/sheepfold-api/router-info`

Возвращает структуру без секретов (§oh9sdbd):

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

> **Запрещено** включать в ответ: пароли Wi-Fi, токены ботов/AI, имена детей, MAC-адреса устройств, списки клиентов (§oh9sdbd).

---

## `/cgi-bin/sheepfold-api/client-status`

Endpoint для детского APK. Не требует токена администратора — идентифицирует устройство по IP из DHCP (§b5wkq2e). Он не принимает MAC, имя или статус от телефона: роутер сам сопоставляет `REMOTE_ADDR -> MAC -> UCI device`. Endpoint возвращает только собственный статус текущего LAN-клиента и безопасные флаги для интерфейса детского APK.

Запрос: `GET /cgi-bin/sheepfold-api/client-status`

Ответ:
```json
{
  "status": "allowed",
  "schedule_name": "Учебные дни",
  "next_change_at": "20:30",
  "warning_before_minutes": 5,
  "childAiAllowed": false,
  "personalGroupRequired": true
}
```

Возможные значения `status`: `allowed`, `restricted`, `scheduled`, `blocked`.

Если на роутере настроен AI-provider, но устройство не состоит в личной группе, детский APK может показывать вкладку ИИ с баннером “Попросите родителя поместить ваше устройство в вашу личную группу”. Сам endpoint `/ai-assistant` всё равно обязан повторно проверить это условие на backend.

---

## sheepfold-router-control

Скрипт `/usr/libexec/sheepfold/sheepfold-router-control` — центральный исполнитель бэкенд-команд (§8drc11e).

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
| `global-block-on` | — | Включить глобальную блокировку (§84azytj) |
| `global-block-off` | — | Выключить глобальную блокировку (§84azytj) |
| `wifi-on` | — | Включить все Wi-Fi радио |
| `wifi-off` | — | Выключить все Wi-Fi радио |
| `reboot` | — | Перезагрузка (записывает запрос в файл) |
| `update-check` | — | Проверить обновление |
| `update-install` | — | Установить обновление |
| `log-storage-status` | — | JSON-статус выбранного backend журналов (RAM / USB / Yandex Disk) |
| `yandex-disk-test` | — | Проверка логина Yandex Disk (WebDAV) |
| `yandex-disk-list` | — | JSON: файлы в `logs/` и `backups/` на диске |
| `yandex-disk-download` | remote local | Скачать файл в `/tmp/...` |
| `yandex-disk-restore-config` | [file] | Восстановить `/etc/config/sheepfold` из бэкапа на диске |
| `yandex-disk-sync-status` | — | JSON: последняя синхронизация push-events / archive-push |

Вывод — построчные пары `key=value` или JSON (зависит от команды).

Хранение журналов и облако: [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md), USB — [`docs/usb-storage-design.ru.md`](usb-storage-design.ru.md).

---

## UCI-конфиг `/etc/config/sheepfold`

> Обновление схемы UCI, `postinst`, шаблон `sheepfold.uci.defaults` и почему в пакет не кладут `/etc/config/sheepfold`: см. [`docs/uci-config-migration.ru.md`](uci-config-migration.ru.md).

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

config messenger_global 'messenger_global'  # (§w2pcn9t)
  option telegram_token ''
  option telegram_chat_id ''
  option vk_token ''
  option vk_community_id ''
  option vk_admin_user_id ''

config pairing_global 'pairing_global'  # (§w2pcn9t)
  option discovery_file '/www/.well-known/sheepfold.json'
```

> Правило: в одном UCI-файле не должно быть двух секций с одним именем (§w2pcn9t).
> Используйте уникальные имена: `messenger_global`, `pairing_global`, `export_global`.

---

## Приоритеты правил доступа (§84azytj)

Порядок от наивысшего к низшему:

Аварийно-полезные сайты являются отдельным доменным исключением перед запретами forwarding и никогда не открывают LuCI, SSH или Sheepfold API (§emerg1). Порядок решений для устройства:

1. **Чёрный список устройств** — блокирует обычный интернет и всегда запрещает административные службы роутера (§xepq85j).
2. **Админские устройства**.
3. **No restrictions** (группа) — доверенные инфраструктурные устройства, которые не находятся в чёрном списке устройств.
4. **Белый список устройств** — обходит правила ниже него (§sg65kxv).
5. **Глобальная блокировка**.
6. **Временный доступ**.
7. **Расписание отдельного устройства**.
8. **Расписание группы**.
9. **Обычный доступ** (`new_device_policy`).

Целевой порядок хранится в `sheepfold.global.access_priority`. Пока backend не применяет его единообразно, `Настройки → Разное` показывает только фактический фиксированный порядок без кнопок перестановки. Перед включением редактора backend обязан валидировать полный список без дублей и применять один порядок в status API, schedule evaluator и nftables. Доменные исключения и запрет доступа к самому роутеру остаются отдельными защитными слоями: перестановка публичных internet-правил не должна открыть административные интерфейсы устройству из чёрного списка устройств.

При одновременном действии расписаний включения и отключения одного уровня backend читает `sheepfold.global.schedule_conflict_internet`: `off` означает «интернет выключен» и является безопасным значением по умолчанию, `on` означает «интернет включён». Конфликт при любом выборе остаётся видимым в LuCI и записывается в журнал только при изменении набора конфликтующих правил или результата.

Временный доступ хранится в UCI как `temp_access_until` и `status=temp_access`. Если backend временно добавляет MAC в `allowlist`, он помечает это флагом `temp_access_allowlist_added=1`, чтобы `expire-temp-access` удалил только временное разрешение и не тронул ручной allowlist. Команда вызывается из `sheepfold-service` на каждом tick. При стандартном порядке blocklist сильнее временного доступа. WPS-режим `allow_wifi_and_allowlist` не добавляет устройство из blocklist или с `status=blocked`.

---

## Диагностическая цепочка интернет-соединения (§f1t2tal)

Проверяется последовательно:

1. WAN link state через `ubus call network.interface.wan status`
2. Default route / gateway (`ip route`)
3. DNS — разрешение `ya.ru`, `gosuslugi.ru` (для России) (§a753lc5)
4. HTTP(S) — лёгкий запрос к `ya.ru` (HEAD/GET)

Если шаг 1–2 провален — статус `offline`.
Если 3 провален — `limited` (интернет есть, DNS сломан).
Если 4 провален — `limited` (HTTP заблокирован).

> Не используйте `1.1.1.1`, `8.8.8.8`, `google.com` как единственные цели диагностики (§a753lc5).

---

## Безопасность и ограничения

- LuCI вызывает только `/usr/libexec/sheepfold/sheepfold-router-control` — не строит shell-команды динамически (§8drc11e).
- rpcd ACL явно перечисляет разрешённые файлы, UCI-конфиги и exec-пути.
- Секреты (токены, ключи AI) никогда не попадают в `router-info`, журнал или QR-коды (§oh9sdbd).
- Ожидание в бэкенде (long poll, cron, update) не отображается в UI-комментариях как требование — оно закреплено здесь.
- Журнал хранится в RAM (`/tmp/sheepfold/events.log`). При `log_storage=usb` или `yandex_disk` события зеркалируются на внешнее хранилище (см. [`docs/yandex-disk-storage.ru.md`](yandex-disk-storage.ru.md)). При экспорте маскируются MAC-адреса и IP (§rtj5pht).

---

## Связанные документы

- [`docs/android-openwrt-api.ru.md`](android-openwrt-api.ru.md) — полный справочник эндпоинтов
- [`docs/android-config.ru.md`](android-config.ru.md) — конфигурация Android-клиента
- [`docs/developer-task.ru.md`](developer-task.ru.md) — точка входа
- [`docs/agent-playbook.ru.md`](agent-playbook.ru.md) — плейбук для AI-агентов
- [`docs/live-router-testing.ru.md`](live-router-testing.ru.md) — тестирование на живом роутере
