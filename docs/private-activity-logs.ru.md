# Приватные логи активности устройств

## Назначение

Функция собирает DNS-запросы устройств, фильтрует системный шум
и предоставляет родителю агрегированный JSON: какие сайты
посещались, сколько раз, когда первый и последний раз.
AI может построить по этим данным психологический портрет пользователя.

> **По умолчанию отключено.** Включается галочкой в настройках LuCI.
> Путь папки (`/tmp/sheepfold/.private/`) **не отображается в UI**.

---

## Хранение

```
/tmp/sheepfold/.private/
    aabbccddeeff.log        <- текущий день
    archive/
        2026-07-06.tar.gz   <- суточный архив
```

Всё в RAM (tmpfs). Данные исчезают при перезагрузке — намеренно.
Права: папка `700`, файлы `600`.

### Ограничения размера

| Параметр | Значение |
|---|---|
| Макс всей папки | 2 МБ |
| Макс на одно устройство | 512 КБ (после — обрез головы) |
| Срок архивов | = `log_days` UCI, не больше 7 суток |

### Суточная архивация

Cron в 00:05 запускает `sheepfold-activity-log rotate`:
1. Текущие `.log` упаковываются в `archive/YYYY-MM-DD.tar.gz`.
2. Исходные файлы удаляются.
3. Архивы старше `log_days` дней удаляются.

---

## Формат сырого лога

```
<ISO8601>\t<mac>\t<event_type>\t<данные>
```

| `event_type` | Пример |
|---|---|
| `dns` | `youtube.com` |
| `http_host` | `vk.com` |
| `access_change` | `temporary_grant +30m` |

Сырые строки **никогда не возвращаются через API**.

---

## Фильтрация до записи

`sheepfold-dns-logger` отбрасывает:
- служебные домены (`.local`, `.lan`, `.arpa`, `.internal`)
- системные (Google APIs, Apple, telemetry, analytics, crashlytics)
- рекламные сети (doubleclick, googlesyndication)
- IP-адреса вместо доменов
- домены короче 5 символов

`enrich` дополнительно агрегирует:
- один домен = одна запись с `visits`, `first`, `last`
- время до часа (`2026-07-07T21`)
- не более 50 доменов в выдаче

---

## API endpoint

### `GET /cgi-bin/sheepfold-api/device-insights?mac=AA:BB:CC:DD:EE:FF`

Требует `X-Sheepfold-Token`. Возвращает агрегированный JSON:

```json
{
  "ok": true,
  "data": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "days_covered": 3,
    "domains": [
      {"domain": "youtube.com", "visits": 47, "first": "2026-07-05T16", "last": "2026-07-07T21"},
      {"domain": "minecraft.net", "visits": 12, "first": "2026-07-06T14", "last": "2026-07-07T18"}
    ],
    "access_changes": [{"time": "2026-07-07T19", "event": "temporary_grant +30m"}],
    "total_raw_lines": 412
  }
}
```

### `POST /cgi-bin/sheepfold-api/device-insights`

Тело: `{"mac": "...", "question": "Что интересует ребёнка?"}`

Backend передаёт `insights` + вопрос AI, возвращает `ai_answer`.

---

## UCI

```
option private_logs '0'   # по умолчанию выключено
option log_days '7'        # срок хранения (совпадает с общим журналом)
```

---

## Безопасность

- Endpoint требует родительский токен — ребёнок не может запросить свои логи.
- Сырые строки через API не передаются никогда.
- Данные исчезают при перезагрузке роутера — RAM-only намеренно.
- В `enrich`-выдаче нет IP и точных временных меток.

---

## Связанные файлы

- `root/usr/libexec/sheepfold/sheepfold-activity-log` — основной скрипт
- `root/usr/libexec/sheepfold/sheepfold-dns-logger` — перехватчик DNS
- `root/etc/cron.d/sheepfold-activity` — cron-задачи
- `root/www/cgi-bin/sheepfold-api/device-insights` — API endpoint

---

## CLI

```bash
# Включить логирование
uci set sheepfold.global.private_logs=1 && uci commit sheepfold

# Состояние
sheepfold-activity-log status

# Принудительная архивация
sheepfold-activity-log rotate

# Обогащённый JSON одного устройства
sheepfold-activity-log enrich AA:BB:CC:DD:EE:FF

# Очистить устройство
sheepfold-activity-log clean AA:BB:CC:DD:EE:FF

# Очистить всё
sheepfold-activity-log clean-all
```
