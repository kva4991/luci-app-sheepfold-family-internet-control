# Загрузка логов с устройства ребёнка

> Статус: **идея / готово к проектированию**

## Концепция

На устройстве ребёнка (Android APK) накапливаются логи активности локально. При подключении к домашнему Wi-Fi логи автоматически отправляются на роутер. Если подключения нет более 24 часов — логи архивируются прямо на устройстве в формате аналогичном серверному.

## Жизненный цикл лога на устройстве

```
[накопление] → [подключение к Wi-Fi] → [отправка на роутер] → [удаление с устройства]
                                                ↓ если нет Wi-Fi > 24 часов
                                        [архивирование на устройстве]
```

## Эндпоинт приёма логов на роутере

```
POST /cgi-bin/sheepfold-api/child-log-upload
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "dev_7f3a9c",
  "personalGroupId": "pg_a1b2c3",
  "logEntries": [
    {
      "ts": 1720375200,
      "type": "dns_query",
      "domain": "youtube.com",
      "durationSeconds": 1800
    }
  ]
}
```

Роутер принимает, дописывает в `/tmp/sheepfold/child-logs/<deviceId>.jsonl`, возвращает `{"accepted": true}`.

## Хранение на роутере

- Активный файл: `/tmp/sheepfold/child-logs/<deviceId>.jsonl` (RAM)
- Архив: `/etc/sheepfold/child-logs-archive/<deviceId>-<date>.jsonl.gz`
- Архивирование происходит если активный файл > 1 МБ или старше 7 дней.
- Переданные логи с устройства удаляются на устройстве только после получения `{"accepted": true}`.

## Что нужно сделать в коде

- [ ] CGI `child-log-upload`: валидация Bearer-токена + запись в файл
- [ ] Android APK: накопление событий локально (Room DB или flat file)
- [ ] Android APK: триггер при подключении к Wi-Fi (NetworkCallback)
- [ ] Android APK: архивирование если нет Wi-Fi > 24 часов
- [ ] `sheepfold-service`: ротация и архивирование логов на роутере
