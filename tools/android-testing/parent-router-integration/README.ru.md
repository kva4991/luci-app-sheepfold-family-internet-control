# Сквозной стенд: родительский APK и OpenWrt

<!-- §andlab1 -->

Стенд проверяет связку физического Android-телефона с установленным Sheepfold на тестовом OpenWrt-роутере. Все файлы стенда находятся в этой папке.

## Безопасность

- Требуется явный `-DeviceSerial` из `adb devices -l`.
- Скрипт не вызывает `uninstall`, `pm clear`, factory reset, reboot, смену Wi-Fi или запись UCI.
- APK устанавливается только через `adb install -r -t`, поэтому существующие данные приложения не удаляются.
- Допустимы только debug-пакеты `app.sheepfold.android` и `app.sheepfold.android.test`.
- Отчёты пишутся в `SHEEPFOLD_SCRIPT_SCRATCH_ROOT\parent-router-integration` или `.build\parent-router-integration`.

## Запуск

Из корня репозитория:

```powershell
$env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT = 'C:\Users\User\Documents\pesochnica\luci-app-sheepfold-family-internet-control\temp'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
& .\tools\android-testing\parent-router-integration\runParentRouterIntegration.ps1 `
  -DeviceSerial PHONE_SERIAL `
  -RouterAddress 192.168.4.1
```

Перед запуском нужно включить USB debugging и подтвердить RSA-запрос на телефоне. Телефон должен быть подключён к той же локальной Wi-Fi/Ethernet-сети, что и роутер.

## Что проверяется

1. Физический serial действительно находится в состоянии `device`, а не является эмулятором.
2. Телефон достигает роутера по локальному адресу через `ping`.
3. Роутер отдаёт `/.well-known/sheepfold.json` и `/cgi-bin/sheepfold-api/ping` с маркером Sheepfold.
4. Родительский debug APK и его instrumentation APK устанавливаются поверх существующей debug-версии без очистки данных.
5. Неразрушающие parent instrumentation-тесты запускаются на телефоне, а `MainActivity` стартует.
6. После запуска сохраняется logcat для диагностики.

## Ограничения

Тест чистого первого запуска намеренно не запускается: его выполнение потребовало бы удаления данных приложения, что запрещено этим стендом. Успех остальных проверок не доказывает QR-камеру, реальное сопряжение с одноразовым кодом, bearer-токен, TLS pin или изменение UCI: для этого нужен отдельный тестовый администратор и ручное подтверждение QR в LuCI. Скрипт намеренно не автоматизирует такие изменения и не хранит токены.
