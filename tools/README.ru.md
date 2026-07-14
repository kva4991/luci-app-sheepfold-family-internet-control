# Инструменты разработки Sheepfold

<!-- §toolwin -->

В этой папке лежат воспроизводимые сценарии подготовки окружения. Тяжёлые бинарные дистрибутивы не коммитятся в Git: это раздувает каждый clone, усложняет обновления и может нарушить правила распространения сторонних SDK.

## Windows: установить всё необходимое

Из корня репозитория откройте PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows\setup.ps1 -Install -AcceptAndroidLicenses -AndroidSdkRoot "$env:LOCALAPPDATA\Android\Sdk"
```

Это команда полной автоматической установки для стандартного пользовательского пути. Более короткая команда без `-AndroidSdkRoot` делает то же самое, потому что этот путь задан по умолчанию.

Скрипт автоматически задаёт пользовательские `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT` и добавляет в `PATH` найденные каталоги Git, Git Bash, Python, Node.js, GitHub CLI, 7-Zip, ripgrep, JDK, `adb` и `sdkmanager`. Повторные запуски не создают дубли в `PATH`.

Если работу начинает новый чат Codex на Windows, агент должен сначала попробовать выполнить эту команду сам, запросив необходимые разрешения на сеть и установку. Если установка из среды агента недоступна или пользователь должен лично подтвердить лицензии, агент обязан дать пользователю полную команду выше и кратко объяснить:

1. открыть PowerShell;
2. перейти командой `cd` в корень репозитория;
3. выполнить команду установки;
4. после успешного завершения закрыть и заново открыть PowerShell или чат Codex, чтобы обновились переменные окружения.

Скрипт проверит и при необходимости скачает/установит:

- Git for Windows и Git Bash;
- Python 3;
- Node.js LTS;
- Temurin JDK 17;
- GitHub CLI;
- 7-Zip для диагностики архивов, APK и IPK;
- ripgrep (`rg`) для быстрого точечного поиска по репозиторию;
- Android SDK command-line tools;
- Android Platform 35;
- Android Build Tools 35.0.0;
- Android Platform Tools (`adb`).

Обычные программы устанавливаются через `winget`. Android command-line tools выбираются из официального Google Android SDK repository XML, а скачанный архив проверяется по опубликованной там контрольной сумме.

Если `winget` установлен вместе с Microsoft App Installer, но не виден в `PATH` текущего процесса Codex, скрипт находит его через пакет App Installer. Каталоги WindowsApps и WinGet Links также добавляются в пользовательский `PATH`. (§toolwin)

При сетевой ошибке `winget` автоматически повторяет установку один раз через 10 секунд. Если обе попытки завершились ошибкой наподобие `0x80072ee2`, проверьте доступ к интернету и повторите всю команду: уже установленные компоненты заново скачиваться не будут.

7-Zip используется только для просмотра и ручной диагностики архивов. Не собирайте им `.ipk`: Sheepfold использует `python scripts/build-test-ipk.py`, чтобы сохранить совместимый с OpenWrt формат и Unix-права файлов.

Архив Android распаковывается системным `.NET ZipFile` во временный короткий путь. Не заменяйте этот код на `Expand-Archive`: модуль `Microsoft.PowerShell.Archive` из Windows PowerShell 5 может падать на официальном Android ZIP с ошибкой внутреннего `Remove-Item`, особенно в длинном пути рабочего каталога. (§zipps51)

Флаг `-AcceptAndroidLicenses` означает, что пользователь предварительно прочитал и согласен с лицензиями Android SDK. Скрипт намеренно не принимает их молча. Без флага он установит только command-line tools, покажет объяснение и не станет устанавливать SDK packages.

По умолчанию Android SDK располагается здесь:

```text
%LOCALAPPDATA%\Android\Sdk
```

Другой путь можно указать явно:

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows\setup.ps1 `
  -Install `
  -AcceptAndroidLicenses `
  -AndroidSdkRoot D:\Android\Sdk
```

## Только проверить окружение

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows\check.ps1
```

Или запустите `setup.ps1` без `-Install`: он выполнит ту же проверку и ничего не скачает.

## Gradle

Глобальный Gradle больше не обязателен. В обоих Android-проектах хранится стандартный Gradle Wrapper версии `8.10.2`. При первой сборке wrapper скачивает официальный Gradle distribution в пользовательский Gradle cache.

```powershell
android\gradlew.bat -p android assembleDebug --stacktrace
android-child\gradlew.bat -p android-child assembleDebug --stacktrace
```

## Что хранится вне Git

- `tools/.cache/` — проверенные скачанные архивы установщика;
- `tools/local/` — место для временных портативных инструментов, если они понадобятся;
- `%LOCALAPPDATA%\Android\Sdk` — Android SDK;
- `%USERPROFILE%\.gradle` — Gradle distributions и dependency cache.

Эти каталоги не должны попадать в коммиты. Версии и требования проекта фиксируются в `tools/toolchain.json`.

Официальные источники:

- [Android command-line tools и лицензия SDK](https://developer.android.com/studio#command-tools);
- [sdkmanager](https://developer.android.com/tools/sdkmanager);
- [Gradle Wrapper](https://docs.gradle.org/current/userguide/gradle_wrapper.html).
