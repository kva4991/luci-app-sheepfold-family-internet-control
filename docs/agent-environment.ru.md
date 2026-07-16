# Окружение агента и рабочие команды

Этот документ нужен следующему AI-агенту, чтобы быстро поднять рабочее окружение Sheepfold и не повторять уже найденные ошибки сборки.

Важно: этот документ в первую очередь про следующий чат Codex Desktop на компьютере пользователя с Windows. Для GitHub Actions, WSL или обычного Linux/macOS окружения смысл проверок тот же, но команды установки, пути и доступ к Android SDK будут отличаться.

## Где находится репозиторий

Текущая рабочая копия в Codex на Windows обычно лежит здесь:

```powershell
C:\Users\User\Documents\Codex\2026-07-02\luci-app-trafficctl-max-luci-app\work\remote-repo
```

Перед работой всегда проверь ветку и изменения:

```powershell
git status --short --branch
git remote -v
```

Не откатывай чужие изменения без прямой просьбы владельца проекта.

## Что должно быть установлено на Windows

<!-- §toolwin -->

Рекомендуемый способ — использовать сценарий из репозитория. Он проверяет окружение и скачивает только отсутствующие компоненты:

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows\setup.ps1 -Install -AcceptAndroidLicenses -AndroidSdkRoot "$env:LOCALAPPDATA\Android\Sdk"
```

Новый чат Codex на Windows должен либо самостоятельно выполнить эту команду с нужными разрешениями, либо передать её пользователю и объяснить, что команду запускают из корня репозитория в PowerShell. После установки надо открыть новый терминал/чат, чтобы он увидел обновлённые `PATH`, `JAVA_HOME`, `ANDROID_HOME` и `ANDROID_SDK_ROOT`.

Если агент продолжает работу в текущем PowerShell/Codex shell без перезапуска, перед проверками и сборками нужно один раз перечитать системный и пользовательский `PATH`:

```powershell
$env:Path = ([Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'))
```

Иначе свежеустановленные Git, Git Bash, Node.js, Python, JDK и Android SDK могут уже быть на диске, но команды `git`, `bash`, `node`, `python`, `java`, `adb` и `sdkmanager` в текущем процессе всё ещё будут не видны.

Только проверка без скачивания и установки:

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows\check.ps1
```

Подробности, состав и правила лицензирования: [`tools/README.ru.md`](../tools/README.ru.md). Тяжёлые программы и Android SDK не хранятся в истории Git; в репозитории находятся installer/check scripts, manifest версий и Gradle Wrapper.

Минимальный набор:

- Git for Windows с Git Bash в `PATH`;
- Python 3 в `PATH`;
- Node.js, подходящий для `node --test`;
- JDK 17;
- Gradle Wrapper из `android/` и `android-child/`, прогретый через `setup.ps1`;
- Android SDK с установленными platform/build-tools, которые требуют Android-проекты;
- Android SDK licenses должны быть приняты.

Полезно дополнительно:

- GitHub CLI `gh` для просмотра логов GitHub Actions;
- 7-Zip для ручной проверки архивов и ripgrep (`rg`) для быстрого поиска; оба устанавливаются общим Windows-скриптом;
- Android Studio для удобной установки SDK компонентов и принятия лицензий.

Проверка окружения:

```powershell
git --version
bash --version
python --version
node --version
java -version
android\gradlew.bat -p android --version
android-child\gradlew.bat -p android-child --version
adb version
sdkmanager --list
```

Если `python --version` открывает Microsoft Store или пишет, что Python не найден, отключи Windows App execution alias для Python или переустанови Python с галочкой `Add python.exe to PATH`.

Если `sdkmanager` не находится, проверь переменные:

```powershell
echo $env:ANDROID_HOME
echo $env:ANDROID_SDK_ROOT
```

Обычно они должны указывать на:

```powershell
C:\Users\User\AppData\Local\Android\Sdk
```

В пользовательский `Path` обычно нужны:

```powershell
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\cmdline-tools\latest\bin
```

## Git Bash в PATH

Для shell-тестов и GitHub Actions-совместимых проверок на Windows должен быть доступен `bash` и `sh`.

Проверка:

```powershell
bash --version
sh --version
```

Если Git Bash установлен, но не виден, добавь в пользовательский `Path`:

```powershell
C:\Program Files\Git\bin
C:\Program Files\Git\usr\bin
```

Команда PowerShell:

```powershell
$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$add = @('C:\Program Files\Git\bin', 'C:\Program Files\Git\usr\bin')
$newPath = (($oldPath -split ';') + $add | Where-Object { $_ } | Select-Object -Unique) -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
```

После этого нужно открыть новый PowerShell/Codex shell.

## Основные проверки перед коммитом

Запускать из корня репозитория.

Node-тесты:

```powershell
node --test tests/*.test.mjs
```

Android XML:

```powershell
python -c "from pathlib import Path; import xml.etree.ElementTree as ET; [ET.parse(str(p)) for project in (Path('android'), Path('android-child')) for p in project.rglob('*.xml')]; print('android xml ok')"
```

Проверка пробелов/хвостов:

```powershell
git diff --check
```

Shell syntax и runtime hardening:

```powershell
bash -lc 'set -euo pipefail; package_root="package/luci-app-sheepfold-family-internet-control/root"; find "$package_root/usr/libexec/sheepfold" -type f -print0 | xargs -0 -n1 sh -n; find "$package_root/usr/share/sheepfold/router-profiles" -type f \( -name apply-mode -o -name install -o -name uninstall \) -print0 | xargs -0 -n1 sh -n; find "$package_root/etc/hotplug.d" -type f -print0 | xargs -0 -n1 sh -n; sh -n "$package_root/www/cgi-bin/sheepfold-api"; sh -n "$package_root/www/.well-known/sheepfold.json.sh"; sh -n "$package_root/etc/init.d/sheepfold"; sh "$package_root/usr/libexec/sheepfold/sheepfold-runtime-hardening" "$package_root"; echo shell-ok'
```

Если проверяешь именно mDNS-инварианты, помни: в PowerShell легко сломать экранирование `$UCODE_SOURCE`. Надёжнее сначала открыть файл или запускать команду ровно как в `.github/workflows/placeholder.yml`.

## Сборка OpenWRT IPK

На Windows используй Python/PowerShell сборщик, а не ручной tar/ar.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-test-ipk.ps1
```

Готовые пакеты появляются в:

```powershell
.build\ipk-output\
```

Сборщик пишет `.ipk` в `.build/ipk-output`. Для другого пути: `python scripts/build-test-ipk.py --variant all --out-dir D:\artifacts`. В Downloads копировать только по прямой просьбе пользователя.

Правильный `.ipk` для OpenWRT `opkg` здесь является gzip-tar архивом с файлами:

```text
./debian-binary
./data.tar.gz
./control.tar.gz
```

Проверка структуры:

```powershell
python -c "from pathlib import Path; import tarfile; d=Path('.build/ipk-output'); p=sorted(d.glob('luci-app-sheepfold-*_all.ipk'))[-1]; print(p); tf=tarfile.open(p,'r:gz'); print('\n'.join(tf.getnames()))"
```

Не коммить `.ipk`.

### Права на helper-скрипты в тестовом IPK

Все файлы в `usr/libexec/sheepfold/` должны попадать в `.ipk` с режимом **0755**, и `postinst` после установки снова делает `find … -exec chmod 0755`. Иначе LuCI получит `Permission denied` при вызове `sheepfold-router-control` → `sheepfold-router-control-legacy` (вкладка «Информация о роутере», белые списки и т.д.).

Проверка: `node --test tests/testIpkPermissions.test.mjs`.

Быстрый обход на уже установленном роутере:

```sh
find /usr/libexec/sheepfold -type f -exec chmod 0755 {} +
```

### LuCI i18n в тестовом IPK

Тестовый сборщик **обязан** включать скомпилированный русский каталог:

```text
/usr/lib/lua/luci/i18n/sheepfold.ru.lmo
```

Компиляция: `scripts/po2lmo.py` из `po/ru/sheepfold.po` (вызывается из `scripts/build-test-ipk.py`). Без этого файла на роутере LuCI покажет английские msgid из `_()`, даже при `Application language = Russian`.

Проверка: `node --test tests/testIpkI18n.test.mjs`.

Подробнее о двух параметрах языка (LuCI vs Sheepfold): [`docs/localization.ru.md`](localization.ru.md).

## Версия пакета

Если изменение должно попасть в новый пакет для роутера, подними:

- `PKG_RELEASE` в `package/luci-app-sheepfold-family-internet-control/Makefile`;
- `option ui_asset_version` в `package/luci-app-sheepfold-family-internet-control/root/etc/config/sheepfold`.

Тест `tests/luciAssetVersioning.test.mjs` проверяет, что они синхронизированы.

## Android-сборки

Родительское приложение:

```powershell
android\gradlew.bat -p android assembleDebug --stacktrace
```

Детское приложение:

```powershell
android-child\gradlew.bat -p android-child assembleDebug --stacktrace
```

В Codex sandbox Gradle может не иметь доступа к `C:\Users\User\AppData\Local\Android\Sdk`. Если видишь `Permission denied` к SDK, повтори сборку вне песочницы через escalated command.

Типичные проблемы:

- `License for package ... not accepted` — принять лицензии через Android Studio SDK Manager или `sdkmanager --licenses`;
- `bad_record_mac` при скачивании AAR — сетевой/SSL сбой загрузки, часто проходит при повторе;
- `resource string/... not found` — отсутствующая Android string resource;
- Kotlin nullable/type mismatch — реальная ошибка кода, чинить.

Обычная Gradle-сборка оставляет два APK в `app/build/outputs/apk/debug`. Явные задачи `exportDebugApk` и `exportChildDebugApk` копируют их в заданный каталог; использовать их для Downloads только по прямой просьбе. Не коммить `android/app/build` и `android-child/app/build`.

## GitHub Actions

Workflow находится в:

```text
.github/workflows/placeholder.yml
```

В нём есть:

- `shell-and-node`;
- `android` matrix: `android`, `android-child`.

Если на GitHub видно 6 красных проверок, это часто дубли `push` и `pull_request`: фактически падают три job-семейства.

Для просмотра логов удобно установить `gh`:

```powershell
gh auth login
gh run view <run-id> --repo kva4991/luci-app-sheepfold-family-internet-control --log-failed
```

## Live-router тесты

Тесты с настоящим OpenWRT-роутером описаны отдельно:

```text
docs/live-router-testing.ru.md
```

Не запускай write/hardware тесты на семейном рабочем роутере без явного согласия владельца, backup UCI и нужных флагов окружения.

## Что недавно оказалось важным

Полный реестр операционных мелочей: [`docs/agent-gotchas.ru.md`](agent-gotchas.ru.md).

- `sheepfold-service` должен реагировать на изменение DHCP-аренд быстро, но не запускать тяжёлый nmap-скан на каждое DHCP-событие.
- Контрольный полный проход автообнаружения по умолчанию раз в 15 минут.
- Быстрый проход по DHCP-событию должен обновлять аренды, ARP, DHCP/mDNS-сигналы, а тяжёлые проверки портов оставлять для полного прохода.
- `.ipk` нужно собирать OpenWRT-совместимым gzip-tar форматом. Старый Debian `ar` формат уже отвергался роутером как `Malformed package file`.
- Публичное имя Android-приложения: `Sheepfold`, не `Овчарня`.
