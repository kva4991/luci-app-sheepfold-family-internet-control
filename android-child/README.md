# SheepfoldChild — детское приложение

Простое приложение для ребёнка: показывает текущий статус интернета, 
оставшееся время доступа и уведомляет за 5 минут до отключения.

## Архитектура

```
android-child/
└── app/src/main/java/com/example/sheepfoldchild/
    ├── SheepfoldChildApp.kt          // Application, создаёт канал уведомлений
    ├── MainActivity.kt               // Entry point, тема SYSTEM по умолчанию
    ├── data/
    │   ├── ClientStatusRepository.kt // HTTP GET /client-status, парсинг JSON
    │   └── ClientStatusResponse.kt   // Data классы ответа
    ├── viewmodel/
    │   └── ChildStatusViewModel.kt   // Состояния: Loading/Success/Error
    ├── notification/
    │   ├── AccessEndingScheduler.kt  // AlarmManager за 5 мин до accessEndsAt
    │   ├── AccessEndingAlarmReceiver.kt // BroadcastReceiver → показывает уведомление
    │   └── BootReceiver.kt           // Восстановление уведомления после перезагрузки
    └── ui/
        ├── ChildStatusScreen.kt      // Главный экран статуса
        └── SetupScreen.kt            // Первичная настройка адреса роутера
```

## Ключевые принципы

- **MAC никогда не передаётся** с устройства. Роутер определяет MAC по `REMOTE_ADDR`.
- **Авторизации нет** — только адрес роутера в DataStore.
- **Тема по умолчанию — системная** (`isSystemInDarkTheme()`).
- **Уведомление** планируется за 5 минут до `accessEndsAt` через `AlarmManager`.
  Если до конца осталось менее 5 минут — уведомление не ставится.
  При каждом обновлении статуса предыдущее уведомление отменяется и планируется новое.
- **После перезагрузки** `BootReceiver` заново запрашивает статус и перепланирует уведомление.

## Сборка

```bash
cd android-child
./gradlew assembleDebug
```

## Endpoint роутера

```
GET /cgi-bin/sheepfold-api/client-status
```

Ответ:
```json
{
  "ok": true,
  "apiVersion": "1",
  "serverTime": "2026-07-07T21:00:00+03:00",
  "data": {
    "deviceName": "Телефон ребёнка",
    "internetState": "enabled",
    "accessMode": "scheduled",
    "accessEndsAt": "2026-07-07T21:00:00+03:00",
    "minutesRemaining": 27,
    "message": "Интернет доступен до 21:00 по расписанию."
  },
  "error": null
}
```
