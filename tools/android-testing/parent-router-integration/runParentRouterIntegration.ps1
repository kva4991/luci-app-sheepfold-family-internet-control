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
    [string]$AndroidSdkRoot = '',
    [string]$RepositoryRoot = '',
    [switch]$RequirePairing,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = if ($RepositoryRoot) {
    (Resolve-Path -LiteralPath $RepositoryRoot).Path
} else {
    (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}
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
    param([string[]]$Arguments, [switch]$AllowFailure, [int]$TimeoutSeconds = 120)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $adb
    # Windows PowerShell 5 не имеет ArgumentList; экранируем argv по правилам Windows.
    $startInfo.Arguments = ($Arguments | ForEach-Object {
        '"' + ([regex]::Replace([regex]::Replace($_, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1')) + '"'
    }) -join ' '
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            # Завершаем только свою команду, не общий adb server и не приложение.
            $process.Kill()
            [void]$process.WaitForExit(5000)
            throw "adb не завершился за $TimeoutSeconds секунд: $($Arguments -join ' ')"
        }
        $exitCode = $process.ExitCode
        $output = @((($stdout.GetAwaiter().GetResult() + "`n" + $stderr.GetAwaiter().GetResult()) -split '\r?\n') | Where-Object { $_.Length -gt 0 })
    } finally {
        $process.Dispose()
    }
    $output | ForEach-Object { Write-IntegrationLog ([string]$_) }
    if ($exitCode -ne 0 -and -not $AllowFailure) { throw "adb завершился с кодом ${exitCode}: $($Arguments -join ' ')" }
    return [pscustomobject]@{ Output = @($output); ExitCode = $exitCode }
}

if ($DeviceSerial -notmatch '^[A-Za-z0-9._:-]+$') { throw 'Недопустимый DeviceSerial.' }
$routerIp = $null
if (-not [System.Net.IPAddress]::TryParse($RouterAddress, [ref]$routerIp) -or
    $routerIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    $RouterAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
    throw 'Укажите числовой IPv4 тестового роутера в частной домашней сети.'
}
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

Write-IntegrationLog 'Discovery, TLS и JSON API проверяются внутри телефона через ParentRouterIntegrationTest.'

$parentProject = Join-Path $repoRoot 'android'
$wrapper = Join-Path $parentProject 'gradlew.bat'
if (-not $SkipBuild) {
    Write-IntegrationLog 'Собираются debug APK родительского приложения и instrumentation APK.'
    $env:ANDROID_HOME = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
    & $wrapper -p $parentProject ':app:assembleDebug' ':app:assembleDebugAndroidTest' '--no-daemon' '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Сборка родительского APK завершилась ошибкой.' }
}
$appApk = Join-Path $parentProject 'app\build\outputs\apk\debug\app-debug.apk'
$testApk = Join-Path $parentProject 'app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
foreach ($apk in @($appApk, $testApk)) { if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "APK не найден: $apk" } }

Write-IntegrationLog 'Обновляются только debug APK Sheepfold; uninstall и очистка данных не выполняются.'
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'install', '-r', '-t', $appApk) | Out-Null
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'install', '-r', '-t', $testApk) | Out-Null
$instrumentationPath = Join-Path $runDirectory 'parent-instrumentation.txt'
$testClasses = 'app.sheepfold.android.SupportReportCryptoTest,app.sheepfold.android.relay.MessageRelayAndroidTest,app.sheepfold.android.router.ParentRouterIntegrationTest'
$result = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'routerIp', $RouterAddress, '-e', 'requirePairing', $RequirePairing.IsPresent.ToString().ToLowerInvariant(), '-e', 'class', $testClasses, 'app.sheepfold.android.test/androidx.test.runner.AndroidJUnitRunner') -AllowFailure -TimeoutSeconds 180
$result.Output | Set-Content -LiteralPath $instrumentationPath -Encoding UTF8
$resultText = $result.Output -join [Environment]::NewLine
if ($result.ExitCode -ne 0 -or $resultText -notmatch '(?m)^OK \([1-9][0-9]* tests?\)') { throw "Parent instrumentation завершился ошибкой. Отчёт: $instrumentationPath" }
$skipped = [regex]::Matches($resultText, '(?m)^INSTRUMENTATION_STATUS_CODE: -(3|4)\s*$').Count
Write-IntegrationLog "Пропущено проверок: $skipped. Подробности: $instrumentationPath"
if ($RequirePairing -and $skipped -gt 0) { throw 'Обязательный прогон с привязкой не допускает пропусков.' }

# Instrumentation завершает свой процесс уже после итогового OK; ранний start может попасть под это завершение.
$pidText = ''
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    Start-Sleep -Seconds 2
    $launch = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'am', 'start', '-n', 'app.sheepfold.android/.MainActivity') -AllowFailure -TimeoutSeconds 15
    if ($launch.ExitCode -ne 0 -or ($launch.Output -join [Environment]::NewLine) -match 'Error:|Exception') {
        throw 'Родительский Activity не запустился на телефоне.'
    }
    Start-Sleep -Seconds 2
    $appPid = Invoke-Adb -Arguments @('-s', $DeviceSerial, 'shell', 'pidof', 'app.sheepfold.android') -AllowFailure -TimeoutSeconds 10
    $pidText = ($appPid.Output -join '').Trim()
    if ($pidText -match '^\d+$') { break }
}
if ($pidText -notmatch '^\d+$') { throw 'После запуска процесс приложения не остался работающим; UI не проверен.' }
Invoke-Adb -Arguments @('-s', $DeviceSerial, 'logcat', '-d', '-t', '300', "--pid=$pidText", '-v', 'threadtime') -AllowFailure | Select-Object -ExpandProperty Output | Set-Content (Join-Path $runDirectory 'logcat.txt') -Encoding UTF8
Write-IntegrationLog "Стенд завершён успешно. Отчёт: $runDirectory"
