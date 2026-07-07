# Сборка SheepfoldChild

Проект использует Android Gradle Plugin 8.7.3, Kotlin 2.0.21 и Java 11. Version catalog находится в `gradle/libs.versions.toml`.

Бинарный Gradle wrapper пока не хранится в репозитории. Проект можно открыть в Android Studio или один раз создать wrapper локально совместимым Gradle 8.9, после чего собрать debug APK обычной задачей `assembleDebug`.

## Контракты роутера

Статус устройства:

```text
GET /cgi-bin/sheepfold-api/client-status
```

Ответ имеет поля `ok`, `apiVersion`, `serverTime`, вложенный объект `data` и объект `error`. В `data` используются `deviceName`, `internetState`, `accessMode`, `accessEndsAt`, `minutesRemaining` и `message`.

ИИ-помощник:

```text
POST /cgi-bin/sheepfold-api/ai-assistant
Content-Type: application/x-www-form-urlencoded
```

Детское приложение отправляет только поле `message`. Провайдер, модель, диагностика и журналы выбираются или разрешаются на роутере. Клиент поддерживает нормализованный ответ `data.answer`, а также ответы DeepSeek и Gemini.

## Фоновая работа

WorkManager не используется. `PollingScheduler` создаёт неточные AlarmManager-события с интервалом 15 минут в активном режиме и 30 минут в фоне. `SafeBootReceiver` восстанавливает расписание после загрузки и всегда завершает асинхронный BroadcastReceiver через `PendingResult.finish()`.

## Хранилища

- `child_prefs` — адрес роутера и статусный клиент;
- `child_ai_prefs` — данные AI-клиента.

Адрес роутера записывается в оба файла. Делегаты DataStore не открывают один и тот же файл повторно.

## HTTP

Текущий прототип обращается к локальному роутеру по HTTP. Целевая схема HTTPS с закреплением сертификата описана в `docs/development-ideas-security.ru.md`. Нельзя отключать проверку сертификата или доверять любому самоподписанному сертификату.
