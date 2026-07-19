# Сборка SheepfoldChild

Проект использует Android Gradle Plugin 8.7.3, Kotlin 2.0.21, JDK 17 для запуска Gradle и JVM target 11 для приложения. Version catalog находится в `gradle/libs.versions.toml`.

Стандартный Gradle Wrapper 8.10.2 хранится в репозитории. Сборка из корня репозитория на Windows:

```powershell
android-child\gradlew.bat -p android-child :app:assembleDebug --stacktrace
```

Глобальный Gradle не требуется.

## Контракты роутера

Автоматическое обнаружение:

```text
GET /.well-known/sheepfold.json
GET /cgi-bin/sheepfold-api/ping
```

Приложение берёт только шлюз активной Wi-Fi/Ethernet-сети, ищет до 30 секунд и лишь после неудачи раскрывает ручной ввод адреса.

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

## HTTPS

Детское приложение использует только HTTPS. При первом корректном ответе Sheepfold оно закрепляет отпечаток сертификата роутера, затем отклоняет другой сертификат. Нельзя возвращать HTTP fallback или безусловное доверие любому сертификату.
