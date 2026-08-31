# Сквозной стенд: родительский APK и OpenWrt

<!-- §andlab1 -->

Стенд проверяет связку физического Android-телефона с установленным Sheepfold на тестовом OpenWrt-роутере. Запускается вручную при работе над Android/сетью или перед полной приёмкой. Instrumentation находится в `android/app/src/androidTest/`, а быстрый контракт скрипта в `tests/parentRouterIntegration.test.mjs` (категории `android`, `tooling`). Обычный `npm test` не подключает телефон.

## Безопасность

- Требуется явный `-DeviceSerial` из `adb devices -l`.
- Скрипт не вызывает `uninstall`, `pm clear`, factory reset, reboot, смену Wi-Fi или запись UCI.
- APK устанавливается только через `adb install -r -t`, поэтому существующие данные приложения не удаляются.
- Допустимы только debug-пакеты `app.sheepfold.android` и `app.sheepfold.android.test`.
- Отчёты пишутся в `SHEEPFOLD_SCRIPT_SCRATCH_ROOT\parent-router-integration` или `.build\parent-router-integration`.
- Криптографические тесты используют отдельный случайный Keystore alias и каталог. Они не очищают рабочую привязку, relay settings или рабочие ключи; после тестов удаляются только собственные fixtures.
- Сохранённая привязка читается штатным store приложения; его обычная миграция устаревшего формата допускается. Значения токенов и тела ответов API в отчёт не выводятся. Последние 300 строк logcat только процесса Sheepfold могут содержать приватные данные, поэтому отчёт не публикуют целиком.

## Запуск

Из корня репозитория:

```powershell
$repo = (Get-Location).Path
$lab = 'C:\Users\User\Documents\pesochnica\sheepfold-parent-router-lab'
New-Item -ItemType Directory -Force -Path $lab | Out-Null
Copy-Item -LiteralPath '.\tools\android-testing\parent-router-integration\runParentRouterIntegration.ps1' -Destination $lab
$env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT = $lab
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
$env:ANDROID_USER_HOME = Join-Path $env:USERPROFILE '.android'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$lab\runParentRouterIntegration.ps1" `
  -RepositoryRoot $repo `
  -DeviceSerial PHONE_SERIAL `
  -RouterAddress 192.168.4.1
```

Перед запуском нужны JDK, Android SDK, Gradle Wrapper dependencies, USB debugging и подтверждение RSA-запроса на телефоне. Телефон должен быть подключён к той же локальной Wi-Fi/Ethernet-сети, что и роутер. `PHONE_SERIAL` заменить значением из `adb devices -l`. OpenServer не нужен и не изменяется.

Для обязательной проверки авторизованных GET сначала выполнить обычное сопряжение родительского APK со свежим одноразовым кодом QR в LuCI, затем добавить `-RequirePairing`. Этот флаг запрещает успешный результат с пропущенными проверками. `-SkipBuild` разрешён только при уже собранных актуальных debug APK обоих модулей; APK всё равно обновляются через `install -r -t`.

## Что проверяется

1. Физический serial действительно находится в состоянии `device`, а не является эмулятором.
2. Телефон достигает роутера по локальному адресу через `ping`.
3. Штатный Android discovery находит именно заданный роутер; HTTP/TLS/API-запросы выполняет телефон, а не ноутбук.
4. Публичный `/client-status` отвечает непустым JSON без известных административных полей, а `/router-info`, `/api/v1/admin-config`, `/devices`, `/notifications` и `/access-requests` без Bearer-токена отвечают `401`. Заведомо неверный TLS pin приводит к отказу соединения.
5. Родительский debug APK и его instrumentation APK устанавливаются поверх существующей debug-версии без очистки данных.
6. Android provider выполняет HPKE/AES-GCM и проверку зашифрованного store/блокировок. При сохранённой привязке GET `/router-info`, `/devices`, `/notifications` отвечают `200` с проверкой сохранённого TLS pin. Без привязки этот тест явно пропускается, кроме режима `-RequirePairing`.
7. После тестов открывается `MainActivity`, проверяется наличие процесса и сохраняется его ограниченный logcat. Это не визуальный аудит экрана.
8. `pairedPanelsUseProductionClient` использует настоящий `RouterAdminClient` и `RouterPanelLoader`:
   читает девять рабочих панелей, включая config, Wi-Fi, журнал, запросы и уведомления;
   проверяет revision, отсутствие повторных ID, присутствие своего администраторского устройства
   и сохранность привязки. Содержимое ответов/журнала в отчёт не выводится. Записывающих API нет.

## Результат и ошибки

Успех: exit code `0`, строка `Стенд завершён успешно`, путь отчёта и отдельный счётчик пропусков. `OK (9 tests)` AndroidJUnitRunner включает assumption-skips, поэтому сама эта строка не доказывает девять пройденных тестов. Ошибка или отсутствие обязательной привязки дают ненулевой exit code. Исторический прогон из восьми тестов ниже предшествует добавлению production panel reads.

- `unauthorized`/`offline`: разблокировать телефон, подтвердить USB RSA, проверить кабель. Не запускать автоматический `adb kill-server`, если другие инструменты используют ADB.
- Нет маршрута/ping/discovery: проверить Wi-Fi телефона, а не только доступность роутера с ноутбука. LuCI HTTP:80 и Android API HTTPS:5201 являются разными endpoint.
- `GET /devices` или `/router-info timed out`: измерить helper и общий путь авторизации отдельно, не поднимать тайм-аут вслепую. Оба прежних пути запускали allocator/commit на каждую строку. Теперь чтение корректных ID не пишет UCI; авторизация исправляет только некорректный ID подходящего административного MAC. Тест показывает путь и elapsed time без Bearer или тела ответа. История замера: [паспорт устройства](../../../docs/device-passport-and-control.ru.md).
- `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: подпись установленного APK отличается. Сверить `:app:signingReport` и существующий debug key: Java `user.home` в песочнице может отличаться от `USERPROFILE`, поэтому в команде явно задан `ANDROID_USER_HOME`. Не делать `uninstall`/`pm clear` для обхода и не перегенерировать ключ; если прежнего ключа нет, согласовать отдельный тестовый телефон/пакет.
- Зависший ADB ограничен таймером: обычная команда 120 секунд, instrumentation 180, запуск Activity 15. Завершается только созданный дочерний ADB-процесс. Повторять тест следует после проверки телефона, не отключая антивирус.
- Не использовать `am start -W`: на тестовом OEM он зависал уже после фактического открытия. Кроме того, окончание instrumentation с запозданием закрывает свой процесс; runner допускает три коротких запуска и проверяет, что процесс остался жив.
- Не запускать destructive first-launch сценарии или общий эмуляторный reset на личном телефоне. Не считать проверку API ноутбуком доказательством телефонного маршрута.

## Ограничения

Тест чистого первого запуска намеренно не запускается: его выполнение потребовало бы удаления данных приложения. Успех не доказывает QR-камеру, визуальную геометрию, изменение UCI, relay VPS, уведомления в фоне или API 28, если телефон имеет другую версию. Без `-RequirePairing` успешный результат может не включать bearer-authentication. Проверка публичного JSON запрещает известные секретные поля, но не заменяет аудит всего API. Нет дополнительного подтверждающего кода при QR-сопряжении: используется штатное однократное сканирование.

### Проверенный запуск 30.08.2026

Повтор 31.08.2026 после добавления production panel reads: **9/9 без skips**, 36,103 секунды,
ZTE API 30, `-RequirePairing -SkipBuild` с актуальными APK. Проверены все девять панелей и
сохранность pairing; записи в UCI не вызывались. Отчёт:
`C:\Users\User\Documents\pesochnica\sheepfold-parent-router-lab\parent-router-integration\20260831010252`.
Component-тесты экранов выполняются отдельно, по [Android runbook](../../../docs/android-test-lab.ru.md#рабочие-панели-родительского-приложения).

После обычного сопряжения через QR-файл на ZTE Blade A51RU (API 30) режим `-RequirePairing`
прошёл **8 из 8 тестов, без skips**, instrumentation 10,897 секунды. Локальный отчёт:
`C:\Users\User\Documents\pesochnica\sheepfold-parent-router-lab\parent-router-integration\20260830213628`.
До исправления общего token helper тот же paired GET `/router-info` превышал 10 секунд.
Проверены точечные исправления `list_devices` и `token_device_is_admin_paired` на тестовом
роутере, а не установка нового release package. Снимок UCI при контрольном чтении не изменился.
До разделения загрузки по панелям с телефона также успешно прочитаны все пять запросов главного экрана: `/devices` (1860 мс),
`/api/v1/admin-config` (1607 мс), `/router-info` (1720 мс), `/access-requests` (596 мс),
`/notifications` (1316 мс). Экран со статусом и значком-ключом осмотрен отдельно. Камера QR,
API 28 и relay E2E этим запуском не проверялись; личные данные приложения не очищались.

## Отдельная проверка настройки, поворота и кнопки «Далее»

Это дополнительный ручной профиль, а не часть восьми сетевых проверок runner. Он нужен после
изменений мастера настройки или при полной Android-приёмке. `RouterSetupLifecycleTest` содержит
четыре проверки: единственная операция при пересоздании Activity, сохранение результата до
завершения, отмена при закрытии Activity без ложной ошибки роутера, восстановление шага Compose.
`SetupNextButtonTest` содержит шесть: пиксели активной/неактивной стрелки в двух темах, двойной
размер шрифта и прокрутка «Далее» вместе с содержимым. Пустая Activity и synthetic connector
не меняют привязку, защиту приложения, Android-разрешения или UCI. Сеть не вызывается.

Из корня репозитория в PowerShell, с разблокированным разрешённым USB-телефоном:

```powershell
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Gradle failed' }
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = 'PHONE_SERIAL'
& $adb -s $serial install -r -t android/app/build/outputs/apk/debug/app-debug.apk
if ($LASTEXITCODE -ne 0) { throw 'App install failed' }
& $adb -s $serial install -r -t android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
if ($LASTEXITCODE -ne 0) { throw 'Test install failed' }
& $adb -s $serial shell am instrument -w -r -e class app.sheepfold.android.setup.RouterSetupLifecycleTest,app.sheepfold.android.setup.SetupNextButtonTest app.sheepfold.android.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s $serial shell am start -n app.sheepfold.android/.MainActivity
```

Заменить `PHONE_SERIAL` реальным serial. Ожидается `BUILD SUCCESSFUL`, две строки `Success`,
`OK (10 tests)` без отрицательных status-кодов отдельных тестов и без skips. Финальный
`INSTRUMENTATION_CODE: -1` нормален и не является ошибкой теста; один лишь exit code ADB не
доказывает успех JUnit. На ZTE API 30 30.08.2026 профиль прошёл все 10 тестов без skips.
При отсутствии результата более 180 секунд остановить созданную команду ADB, проверить экран
и logcat Sheepfold; не убивать общий ADB server и не обходить PIN.

Тесты сохраняют пять небольших PNG кнопки в собственном app-specific каталоге. Некоторые OEM
не разрешают `adb pull` из Android/data даже при USB debugging: не расширять ради этого права
приложения или устройства. Реальный экран можно проверить штатным `screencap`; не публиковать
снимок, если на нём есть QR, токен или личные данные. Синтетические снимки не содержат этих данных.

Нельзя запускать вместо этого профиля `ParentFirstLaunchSmokeTest` на рабочем телефоне: его
сценарий требует чистой установки. Нельзя считать rotation-тест доказательством восстановления
после гибели процесса или настоящего QR. Успех пикселей не отменяет визуальный просмотр страницы.
`StateRestorationTester` здесь импортируется из `androidx.compose.ui.test.junit4`, поскольку
тест использует JUnit `ComposeContentTestRule`; одноимённый класс нового API не взаимозаменяем.

Быстрые проверки без телефона:

```powershell
npm.cmd run icons:check
node --test tests/iconCatalog.test.mjs tests/androidUiContrast.test.mjs tests/androidRouterSessionRecovery.test.mjs
```

Ожидается exit code `0`. Они проверяют генерацию стрелки, вычисляемый контраст и source-контракт
жизненного цикла, но не исполняют Android UI. Не запускать Gradle с унаследованным
`GRADLE_USER_HOME` чужого проекта: это загрязняет его кеш и может повторно скачивать зависимости.

## Обновление открытой панели

<!-- §andpanel1 -->

Этот профиль нужен при изменении навигации или набора запросов родительского APK. Каноническая
[таблица панелей и запросов](../../../docs/android-config.ru.md#обновление-данных-открытой-панели)
определяет ожидаемые обращения к роутеру. Проверки не меняют UCI, правила доступа или привязку.

Из корня репозитория в PowerShell, без телефона и сети роутера:

```powershell
node --test tests/androidParentManagement.test.mjs tests/androidRouterSessionRecovery.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Source contracts failed' }
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
.\android\gradlew.bat -p android :app:testDebugUnitTest --tests app.sheepfold.android.ui.main.RouterPanelLoaderTest --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Panel loader tests failed' }
```

Нужны установленный Node.js, JDK, Android SDK и зависимости Gradle. Для первого скачивания
зависимостей может потребоваться сеть. Ожидается exit code `0`, 20 успешных Node-тестов и
`BUILD SUCCESSFUL`. JVM-отчёт
`android/app/build/test-results/testDebugUnitTest/TEST-app.sheepfold.android.ui.main.RouterPanelLoaderTest.xml`
должен содержать `tests="9"`, без failures/errors/skips. JVM исполняет настоящий загрузчик
с подставными источниками: набор и порядок вызовов, повторное чтение, запрет частичного результата,
отсутствие чтения журнала без прав и отбрасывание отменённого ответа. Node проверяет связывание
с Compose и отсутствие второго загрузчика журнала. Это не проверка живого UI или HTTP.

После изменения экранного координатора дополнительно запустить `npm.cmd run test:category -- android`
и parent build/Lint из предыдущего раздела. Сборки и отчёты остаются в локальных build-каталогах;
сбрасывать данные приложения или переустанавливать SDK для этих тестов не нужно.

Для физической проверки установить актуальный debug APK поверх существующего, как описано
в разделе проверки поворота, и открыть уже привязанное приложение. Нужны разрешённый USB-телефон,
разблокированный экран и локальное соединение с тестовым роутером. Перед каждым нажатием отметить
время в безопасных событиях запросов; после завершения загрузки проверить новые события:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial = 'PHONE_SERIAL'
& $adb -s $serial logcat -d -s SheepfoldDiag:D '*:S' |
    Select-String 'router.request' |
    ForEach-Object { $_.Line }
```

Заменить `PHONE_SERIAL` значением из `adb devices -l`. Эта команда не очищает logcat и выводит
только method/path/time/status, не Bearer и тела ответа. Не публиковать полный logcat вместо
этого фильтра. Последовательно проверить:

1. Главный экран и его «Обновить»: один `/router-info` на действие.
2. «Меню»: нет запросов. «Устройства»: `/devices`, затем `/api/v1/admin-config`.
3. Wi-Fi: `/api/v1/admin-config`, затем `/router-info`. «Журнал»: config и `/log` при `logRead`.
4. «Уведомления»: config, `/access-requests`, `/notifications`; повторное обновление работает так же.
5. Возврат на «Управление»: новый `/router-info`. При быстрых переходах старое чтение не меняет
   ошибку или индикатор новой вкладки. Уже отправленный GET может закончиться на роутере.

У каждого начатого запроса ожидается completed без failed. Независимый WorkManager может в это
же время читать `/access-requests` и `/notifications`: сверить время/поток и повторить короткий
контрольный интервал, не отключая worker ради красивого отчёта. Ошибка сети должна быть видна
только на текущей панели, не означать успешное обновление кеша и не удалять токен.

Не использовать старые координаты после неуспешного `uiautomator dump`, не обходить PIN, не
делать `pm clear`, uninstall или `logcat -c`. Не нажимать изменение правил или очистку журнала:
это другой профиль с отдельными последствиями. Подтверждённый read-back команды проверяет
source-контракт; этот сценарий не доказывает фактическую запись на роутере, QR-камеру, relay,
доставку уведомлений в Doze или работу всех версий Android.

30.08.2026 на ZTE API 30 после установки APK без очистки данных подтверждены главный экран
(1757 мс), ручное обновление (1501 мс), «Устройства» (1729 + 1620 мс), «Меню» (0 запросов),
«Журнал» (2058 + 700 мс), Wi-Fi (2020 + 1732 мс), «Уведомления» (1667 + 499 + 852 мс),
возврат в управление (1467 мс). Это отдельный замер после разделения, не прежние пять GET управления.
Локальные source/JVM-проверки, Android-категория (154 теста) и Lint обоих APK успешны; отчёты:
`.build/panel-refresh-tests.log`, `.build/panel-refresh-build.log`, `.build/panel-refresh-lint.log`.

## Совместная работа с владельцем телефона

Только по разрешению владельца можно включить `adb -s PHONE_SERIAL shell svc power stayon usb`:
экран останется включённым при питании от USB, но PIN и блокировка не отключаются. Исходное
значение проверить через `settings get global stay_on_while_plugged_in` и сохранить в локальном
отчёте; восстановить по просьбе владельца. В текущем стенде владелец попросил оставить USB-режим.

Если агенту долго управлять системным выбором QR-файла, попросить владельца выполнить один
жест. Выпускать свежий QR лишь перед сканированием; предыдущая неудачная попытка могла уже
погасить код на роутере. Не повторять его автоматически. При совместной работе заново читать
UI после каждого перехода: `uiautomator dump` мог завершиться ошибкой и оставить старый XML.
Отсутствие нового успешного dump запрещает использовать координаты из прежнего файла.
