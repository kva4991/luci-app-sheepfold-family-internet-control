# SheepfoldChild — детское приложение

Приложение показывает текущий статус интернета, точное время следующего изменения доступа и может уведомить незадолго до завершения временного разрешения. Когда интернет разрешён, интерфейс не объясняет, какое правило роутера дало доступ: достаточно статуса и времени, если оно известно.

## Совместимость

- минимальная версия: Android 5.0 / API 21, выпущенный в 2014 году;
- target SDK: 35;
- современный `java.time` используется через core library desugaring;
- на Android 5.0–5.1 точные события планируются через `AlarmManager.setExact`, на новых версиях используются доступные более современные API.

## Архитектура

```text
android-child/
└── app/src/main/java/com/example/sheepfoldchild/
    ├── SheepfoldChildApp.kt
    ├── MainActivity.kt
    ├── data/
    │   ├── ClientStatusRepository.kt
    │   ├── ClientStatusResponse.kt
    │   └── AiRepository.kt
    ├── viewmodel/
    │   ├── ChildStatusViewModel.kt
    │   └── AiChatViewModel.kt
    ├── notification/
    │   ├── AccessEndingScheduler.kt
    │   ├── AccessEndingAlarmReceiver.kt
    │   └── SafeBootReceiver.kt
    ├── polling/
    │   └── StatusPollWorker.kt
    └── ui/
        ├── ChildStatusScreen.kt
        ├── AccessInfoScreen.kt
        ├── AiChatScreen.kt
        └── SetupScreen.kt
```

## Сеть

1. При первом запуске приложение до 30 секунд ищет Sheepfold на шлюзе активной Wi-Fi/Ethernet-сети через `/.well-known/sheepfold.json` и `/cgi-bin/sheepfold-api/ping`.
2. Если сервер не найден, приложение предлагает проверить Wi-Fi, повторить поиск или вручную ввести IP-адрес роутера.
3. Приложение обращается к HTTPS API Sheepfold на едином порту приложения, по умолчанию `5201`.
4. При первом корректном ответе Sheepfold приложение закрепляет SHA-256-отпечаток сертификата локального роутера.
5. При следующих запросах изменение сертификата считается ошибкой безопасности.

Cleartext HTTP не используется.

## Идентификация

- MAC не передаётся приложением;
- роутер определяет MAC по `REMOTE_ADDR` и DHCP/ARP;
- endpoint статуса возвращает проверенный `deviceId`, `clientRole` и `isAdministrator`;
- AI-запрос обязан вернуть эти значения, после чего роутер повторно сверяет их с фактическим LAN-устройством.

## Уведомления

- при каждом запуске Android 13+ проверяется разрешение на уведомления;
- отказ не блокирует приложение;
- если точные alarm недоступны, используется обычный alarm;
- уведомление содержит рассчитанное количество минут на момент срабатывания, а не значение старого опроса;
- `SafeBootReceiver` восстанавливает polling и уведомление после перезагрузки.

## Детский ИИ-помощник

Функция выключена на роутере по умолчанию. Для работы требуется родительское согласие версии `child-ai-v1`.

Передаются:

- вопрос ребёнка;
- ограниченная история текущего чата;
- проверенный ID и роль устройства;
- безопасный контекст доступа.

Не передаются полная диагностика роутера, индивидуальные журналы, MAC, IP, аккаунт родителя и выбор AI-провайдера.

Шаблон согласия находится в `docs/child-ai-parental-consent-template.ru.md`.

## Сборка

Используйте Gradle Wrapper 8.10.2 из репозитория. На Windows из корня репозитория:

```powershell
android-child\gradlew.bat -p android-child :app:assembleDebug --stacktrace
```

Глобальный Gradle не требуется. CI использует этот же wrapper через `gradle/actions/setup-gradle`.

## Endpoint статуса

```text
GET /cgi-bin/sheepfold-api/client-status
```

Пример ответа:

```json
{
  "ok": true,
  "apiVersion": "2",
  "serverTime": "2026-07-07T18:00:00Z",
  "data": {
    "deviceId": "device_582f40aa1810",
    "deviceName": "Телефон ребёнка",
    "isAdministrator": false,
    "clientRole": "child",
    "internetState": "enabled",
    "accessMode": "scheduled",
    "accessEndsAt": "1783458000",
    "minutesRemaining": 27,
    "nextAccessChangeTime": "19:30",
    "message": "Доступ определяется расписанием."
  },
  "error": null
}
```
