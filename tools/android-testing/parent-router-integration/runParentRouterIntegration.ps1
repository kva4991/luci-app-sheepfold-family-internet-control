<#
.SYNOPSIS
Безопасно проверяет родительский APK на физическом телефоне рядом с OpenWrt.

.DESCRIPTION
Стенд не удаляет приложения или данные. Он обновляет только debug APK Sheepfold
через adb install -r, проверяет локальную достижимость роутера и запускает
неразрушающие parent instrumentation-тесты. Реальное QR-сопряжение намеренно
остаётся ручным, чтобы не создавать и не сохранять bearer-токены в отчёте.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DeviceSerial,
    [string]$RouterAddress = '192.168.4.1',
    [string]$AndroidSdkRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$sdkRoot = if ($AndroidSdkRoot) { $AndroidSdkRoot } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb -PathType Leaf)) { throw "adb не найден: $adb" }

$scratchRoot = if ($env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT) {
    Join-Path $env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT 'parent-router-integration'
} else {
    Join-Path $repoRoot '.build\parent-router-integration'
}
$runDirectory = Join-Path $scratchRoot (Get-Date -Format 'yyyyMMddHHmmss')
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$logPath = Join-Path $runDirectory 'run.log'

function Write-IntegrationLog {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Invoke-Adb {
    param([string[]]$Arguments, [switch]$AllowFailure)
    $output = & $adb @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-IntegrationLog ([string]$_) }
    if ($exitCode -ne 0 -and -not $AllowFailure) { throw "adb завершился с кодом ${exitCode}: $($Arguments -join ' ')" }
    return [pscustomobject]@{ Output = @($output); ExitCode = $exitCode }
}

if ($DeviceSerial -notmatch '^[A-Za-z0-9._:-]+$') { throw 'Недопустимый DeviceSerial.' }
$deviceList = Invoke-Adb -Arguments @('devices')
if (@($deviceList.Output | Where-Object { $_ -match "^$([regex]::Escape($DeviceSerial))\s+device$" }).Count -ne 1) {
    throw "Телефон $DeviceSerial не найден в состоянии device. Включите USB debugging и подтвердите RSA-запрос."
}
$isEmulator = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'getprop', 'ro.kernel.qemu') -AllowFailure
if (($isEmulator.Output -join '').Trim() -eq '1') { throw 'Этот стенд предназначен только для физического телефона.' }
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'wait-for-device') | Out-Null

Write-IntegrationLog "Проверяется локальная сеть телефона до роутера $RouterAddress."
$route = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'ip', 'route') -AllowFailure
if ($route.ExitCode -ne 0 -or ($route.Output -join '').Trim().Length -eq 0) {
    throw 'Не удалось прочитать маршрут телефона; проверка локальной сети остановлена.'
}
$route.Output | ForEach-Object { Write-IntegrationLog ("phone-route: {0}" -f $_) }
$ping = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'ping', '-c', '1', '-W', '2', $RouterAddress) -AllowFailure
if ($ping.ExitCode -ne 0) {
    throw "Телефон не достиг роутер $RouterAddress по локальной сети. Переключите телефон в Wi-Fi/Ethernet сеть тестового роутера; маршрут записан в отчёт."
}

Write-IntegrationLog 'Проверяется discovery и ping роутера с компьютера без записи состояния.'
$discoveryUrl = "https://$RouterAddress/.well-known/sheepfold.json"
$discoveryText = & curl.exe --insecure --silent --show-error --fail --max-time 10 $discoveryUrl
if ($LASTEXITCODE -ne 0) { throw "Discovery недоступен: $discoveryUrl" }
$discovery = $discoveryText | ConvertFrom-Json
if ($discovery.service -ne 'sheepfold') { throw 'Discovery не содержит service=sheepfold.' }
$apiPath = if ($discovery.apiPath) { [string]$discovery.apiPath } elseif ($discovery.apiBase) { [string]$discovery.apiBase } else { '/cgi-bin/sheepfold-api' }
$apiPort = if ($discovery.httpsPort) { [int]$discovery.httpsPort } elseif ($discovery.appPort) { [int]$discovery.appPort } else { 5201 }
$apiUrl = "https://$RouterAddress`:$apiPort$apiPath/ping"
$pingText = & curl.exe --insecure --silent --show-error --fail --max-time 10 $apiUrl
if ($LASTEXITCODE -ne 0) { throw "Sheepfold API ping недоступен: $apiUrl" }
$apiPing = $pingText | ConvertFrom-Json
if (($apiPing.service -ne 'sheepfold') -and ($apiPing.app -ne 'sheepfold')) { throw 'API ping не содержит маркер Sheepfold.' }

function Get-RouterHttpStatus {
    param([string]$Path)
    $status = & curl.exe --insecure --silent --output NUL --write-out '%{http_code}' --max-time 10 "$apiRoot$Path"
    if ($LASTEXITCODE -ne 0) { throw "Не удалось выполнить read-only запрос $Path." }
    return ([string]$status).Trim()
}

$apiRoot = "https://$RouterAddress`:$apiPort$apiPath"
$clientStatus = Get-RouterHttpStatus '/client-status'
if ($clientStatus -ne '200') { throw "client-status должен отвечать 200, получен $clientStatus." }
$routerInfo = Get-RouterHttpStatus '/router-info'
if ($routerInfo -ne '401') { throw "router-info без токена должен отвечать 401, получен $routerInfo." }
$adminConfig = Get-RouterHttpStatus '/api/v1/admin-config'
if ($adminConfig -ne '401') { throw "admin-config без токена должен отвечать 401, получен $adminConfig." }
$devices = Get-RouterHttpStatus '/devices'
if ($devices -ne '401') { throw "devices без токена должен отвечать 401, получен $devices." }
$notifications = Get-RouterHttpStatus '/notifications'
if ($notifications -ne '401') { throw "notifications без токена должен отвечать 401, получен $notifications." }
$accessRequests = Get-RouterHttpStatus '/access-requests'
if ($accessRequests -ne '401') { throw "access-requests без токена должен отвечать 401, получен $accessRequests." }

$parentProject = Join-Path $repoRoot 'android'
$wrapper = Join-Path $parentProject 'gradlew.bat'
Write-IntegrationLog 'Собираются debug APK родительского приложения и instrumentation APK.'
& $wrapper -p $parentProject ':app:assembleDebug' ':app:assembleDebugAndroidTest' '--no-daemon' '--console=plain'
if ($LASTEXITCODE -ne 0) { throw 'Сборка родительского APK завершилась ошибкой.' }
$appApk = Join-Path $parentProject 'app\build\outputs\apk\debug\app-debug.apk'
$testApk = Join-Path $parentProject 'app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
foreach ($apk in @($appApk, $testApk)) { if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "APK не найден: $apk" } }

Write-IntegrationLog 'Обновляются только debug APK Sheepfold; uninstall и очистка данных не выполняются.'
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'install', '-r', '-t', $appApk) | Out-Null
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'install', '-r', '-t', $testApk) | Out-Null
$instrumentationPath = Join-Path $runDirectory 'parent-instrumentation.txt'
$testClasses = 'app.sheepfold.android.SupportReportCryptoTest,app.sheepfold.android.relay.MessageRelayAndroidTest'
$result = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', $testClasses, 'app.sheepfold.android.test/androidx.test.runner.AndroidJUnitRunner') -AllowFailure
$result.Output | Set-Content -LiteralPath $instrumentationPath -Encoding UTF8
$resultText = $result.Output -join [Environment]::NewLine
if ($result.ExitCode -ne 0 -or $resultText -notmatch '(?m)^OK \([1-9][0-9]* tests?\)') { throw "Parent instrumentation завершился ошибкой. Отчёт: $instrumentationPath" }

$launch = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'am', 'start', '-W', '-n', 'app.sheepfold.android/.MainActivity') -AllowFailure
if ($launch.ExitCode -ne 0 -or ($launch.Output -join [Environment]::NewLine) -match 'Error:|Exception') {
    throw 'Родительский Activity не запустился на телефоне.'
}

Invoke-Adb -Arguments @('-s', $DeviceSerial, 'logcat', '-d', '-v', 'threadtime') -AllowFailure | Select-Object -ExpandProperty Output | Set-Content (Join-Path $runDirectory 'logcat.txt') -Encoding UTF8
Write-IntegrationLog "Стенд завершён успешно. Отчёт: $runDirectory"
