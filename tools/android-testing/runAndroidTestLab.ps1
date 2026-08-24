<#
.SYNOPSIS
Запускает выбранный ручной профиль Android-стенда Sheepfold.

.DESCRIPTION
doctor ничего не запускает; emulatorSmoke использует только API 35;
emulatorFull последовательно проверяет API 28 и API 35, чтобы не держать две
виртуальные машины одновременно. physicalSmoke разрешён только для выделенного
тестового телефона с явным подтверждением удаления данных тестируемых APK.

Runner собирает оба debug APK и их androidTest APK, ставит их только на выбранное
устройство, запускает AndroidJUnitRunner и сохраняет logcat, screenshot и UI dump.
Он не подключается к роутеру, не меняет Wi-Fi и не доказывает аппаратные сценарии.
#>

[CmdletBinding()]
param(
    [ValidateSet('doctor', 'emulatorSmoke', 'emulatorFull', 'physicalSmoke')]
    [string]$Profile = 'doctor',
    [ValidateSet('parent', 'child', 'both')]
    [string]$AppScope = 'both',
    [string]$DeviceSerial = '',
    [switch]$ConfirmResetTestApps,
    [switch]$ShowEmulator,
    [switch]$KeepEmulator,
    [switch]$CollectBugreportOnFailure,
    [string]$AndroidSdkRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'androidLabCommon.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tools = Get-AndroidLabTools -AndroidSdkRoot $AndroidSdkRoot
Assert-AndroidLabTools -Tools $tools
$avdMap = Get-AndroidLabAvdMap

function Assert-AndroidLabAvds {
    param([int[]]$ApiLevels)

    $knownAvds = @(& $tools.Emulator -list-avds 2>&1)
    foreach ($apiLevel in $ApiLevels) {
        $avdName = $avdMap[$apiLevel]
        if ($avdName -notin $knownAvds) {
            throw "AVD $avdName не найден. Выполните npm.cmd run androidLab:setup -- -Install -AcceptAndroidLicenses."
        }
    }
}

function Invoke-AndroidLabBuild {
    param([ValidateSet('parent', 'child')][string]$App)

    $projectDirectory = if ($App -eq 'parent') { Join-Path $repoRoot 'android' } else { Join-Path $repoRoot 'android-child' }
    $wrapper = Join-Path $projectDirectory 'gradlew.bat'
    Write-Host "Собираются $App debug и androidTest APK"
    Invoke-AndroidLabCommand -FilePath $wrapper -Arguments @(
        '-p', $projectDirectory,
        ':app:assembleDebug',
        ':app:assembleDebugAndroidTest',
        '--stacktrace'
    ) | Out-Null
}

function Get-AndroidLabAppSpec {
    param([ValidateSet('parent', 'child')][string]$App)

    $projectDirectory = if ($App -eq 'parent') { Join-Path $repoRoot 'android' } else { Join-Path $repoRoot 'android-child' }
    $applicationId = if ($App -eq 'parent') { 'app.sheepfold.android' } else { 'app.sheepfold.child' }
    return [pscustomobject]@{
        Name = $App
        ApplicationId = $applicationId
        TestApplicationId = "$applicationId.test"
        LaunchComponent = if ($App -eq 'parent') {
            'app.sheepfold.android/.MainActivity'
        } else {
            'app.sheepfold.child/com.example.sheepfoldchild.MainActivity'
        }
        AppApk = Join-Path $projectDirectory 'app\build\outputs\apk\debug\app-debug.apk'
        TestApk = Join-Path $projectDirectory 'app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
    }
}

function Invoke-AndroidLabInstrumentation {
    param(
        [Parameter(Mandatory = $true)]$AppSpec,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$ReportDirectory
    )

    foreach ($path in @($AppSpec.AppApk, $AppSpec.TestApk)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Собранный APK не найден: $path"
        }
    }

    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $Serial, 'uninstall', $AppSpec.TestApplicationId) -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $Serial, 'uninstall', $AppSpec.ApplicationId) -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $Serial, 'install', '-r', '-t', $AppSpec.AppApk) | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $Serial, 'install', '-r', '-t', $AppSpec.TestApk) | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $Serial, 'logcat', '-c') -AllowFailure | Out-Null

    $resultPath = Join-Path $ReportDirectory "$($AppSpec.Name)-instrumentation.txt"
    $result = Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @(
        '-s', $Serial,
        'shell', 'am', 'instrument', '-w', '-r',
        "$($AppSpec.TestApplicationId)/androidx.test.runner.AndroidJUnitRunner"
    ) -AllowFailure -OutputPath $resultPath
    $resultText = $result.Output -join [Environment]::NewLine

    # Instrumentation закрывает Activity. Для полезного screenshot/UI dump
    # открываем точный Sheepfold-компонент, не используя случайные monkey events.
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @(
        '-s', $Serial, 'shell', 'am', 'start', '-W', '-n', $AppSpec.LaunchComponent
    ) -AllowFailure | Out-Null
    Start-Sleep -Seconds 2
    Save-AndroidLabDiagnostics -AdbPath $tools.Adb -Serial $Serial -OutputDirectory $ReportDirectory -Prefix $AppSpec.Name
    # AndroidJUnitRunner завершает успешный protocol report кодом -1. Некоторые
    # adb/Windows-связки переносят его в host exit code, поэтому проверяем сам
    # свежий отчёт, обязательное ненулевое число тестов и отсутствие failure.
    $instrumentationPassed =
        ($resultText -match '(?m)^OK \([1-9][0-9]* tests?\)\r?$') -and
        ($resultText -match '(?m)^INSTRUMENTATION_CODE: -1\r?$') -and
        ($resultText -notmatch '(?m)^(FAILURES!!!|INSTRUMENTATION_FAILED:)')
    if (-not $instrumentationPassed) {
        throw "Instrumentation $($AppSpec.Name) завершился с ошибкой (adb exit code $($result.ExitCode)). Отчёт: $resultPath"
    }
}

function Start-AndroidLabEmulator {
    param(
        [Parameter(Mandatory = $true)][int]$ApiLevel,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $avdName = $avdMap[$ApiLevel]
    $serial = "emulator-$Port"
    $existing = Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $serial, 'get-state') -AllowFailure
    if ($existing.ExitCode -eq 0) {
        throw "Порт $Port уже занят Android-устройством $serial. Стенд не будет трогать чужой процесс."
    }

    $arguments = @(
        '-avd', $avdName,
        '-port', $Port,
        '-wipe-data',
        '-no-snapshot',
        '-no-boot-anim',
        '-noaudio',
        '-gpu', 'swiftshader_indirect'
    )
    if (-not $ShowEmulator) {
        $arguments += '-no-window'
    }

    $start = @{
        FilePath = $tools.Emulator
        ArgumentList = $arguments
        PassThru = $true
    }
    if (-not $ShowEmulator) {
        $start.WindowStyle = 'Hidden'
    }
    $process = Start-Process @start
    try {
        Wait-AndroidLabBoot -AdbPath $tools.Adb -Serial $serial
    } catch {
        if (-not $process.HasExited) {
            $process.Kill()
        }
        throw
    }

    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $serial, 'shell', 'settings', 'put', 'global', 'window_animation_scale', '0') -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $serial, 'shell', 'settings', 'put', 'global', 'transition_animation_scale', '0') -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $serial, 'shell', 'settings', 'put', 'global', 'animator_duration_scale', '0') -AllowFailure | Out-Null

    return [pscustomobject]@{ Serial = $serial; Process = $process; AvdName = $avdName }
}

function Stop-AndroidLabEmulator {
    param([Parameter(Mandatory = $true)]$EmulatorSession)

    Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $EmulatorSession.Serial, 'emu', 'kill') -AllowFailure | Out-Null
    if (-not $EmulatorSession.Process.HasExited) {
        [void]$EmulatorSession.Process.WaitForExit(15000)
    }
}

function Invoke-AndroidLabOnDevice {
    param(
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$ReportDirectory
    )

    foreach ($app in $apps) {
        Invoke-AndroidLabInstrumentation -AppSpec (Get-AndroidLabAppSpec -App $app) -Serial $Serial -ReportDirectory $ReportDirectory
    }
}

$apps = switch ($AppScope) {
    'parent' { @('parent') }
    'child' { @('child') }
    default { @('parent', 'child') }
}

if ($Profile -eq 'doctor') {
    $acceleration = Invoke-AndroidLabCommand -FilePath $tools.Emulator -Arguments @('-accel-check') -AllowFailure
    if ($acceleration.ExitCode -ne 0) {
        throw 'Аппаратное ускорение Android Emulator недоступно.'
    }
    Assert-AndroidLabAvds -ApiLevels @(28, 35)
    Write-Host "SDK: $($tools.SdkRoot)"
    $acceleration.Output | ForEach-Object { Write-Host $_ }
    Write-Host 'Android test lab готов. Эмуляторы не запускались.' -ForegroundColor Green
    exit 0
}

foreach ($app in $apps) {
    Invoke-AndroidLabBuild -App $app
}
$runDirectory = New-AndroidLabRunDirectory -RepoRoot $repoRoot
Write-Host "Отчёты: $runDirectory"

if ($Profile -eq 'physicalSmoke') {
    if ([string]::IsNullOrWhiteSpace($DeviceSerial)) {
        throw 'Для physicalSmoke укажите -DeviceSerial из adb devices -l.'
    }
    if (-not $ConfirmResetTestApps) {
        throw 'physicalSmoke удаляет данные тестируемых Sheepfold APK. Используйте только выделенный тестовый телефон и добавьте -ConfirmResetTestApps.'
    }
    if ($DeviceSerial -notmatch '^[A-Za-z0-9._:-]+$') {
        throw 'DeviceSerial содержит недопустимые символы. Скопируйте точное значение из adb devices -l.'
    }
    $connectedDevices = @(Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('devices'))
    $deviceLines = @($connectedDevices.Output | Where-Object { $_ -match "^$([regex]::Escape($DeviceSerial))\s+device$" })
    if ($deviceLines.Count -ne 1) {
        throw "Физический телефон $DeviceSerial не найден в состоянии device. Проверьте adb devices -l и подтверждение USB debugging."
    }
    $isEmulator = Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $DeviceSerial, 'shell', 'getprop', 'ro.kernel.qemu') -AllowFailure
    if (($isEmulator.Output -join '').Trim() -eq '1') {
        throw 'Для виртуального устройства используйте emulatorSmoke или emulatorFull.'
    }
    Wait-AndroidLabBoot -AdbPath $tools.Adb -Serial $DeviceSerial -TimeoutSeconds 60
    Invoke-AndroidLabOnDevice -Serial $DeviceSerial -ReportDirectory $runDirectory
    Write-Host 'Physical smoke завершён.' -ForegroundColor Green
    exit 0
}

$acceleration = Invoke-AndroidLabCommand -FilePath $tools.Emulator -Arguments @('-accel-check') -AllowFailure
if ($acceleration.ExitCode -ne 0) {
    throw 'Аппаратное ускорение Android Emulator недоступно.'
}

$apiLevels = if ($Profile -eq 'emulatorSmoke') { @(35) } else { @(28, 35) }
Assert-AndroidLabAvds -ApiLevels $apiLevels
$ports = @{ 28 = 5570; 35 = 5572 }

foreach ($apiLevel in $apiLevels) {
    $session = $null
    $apiReportDirectory = Join-Path $runDirectory "api$apiLevel"
    New-Item -ItemType Directory -Force -Path $apiReportDirectory | Out-Null
    try {
        $session = Start-AndroidLabEmulator -ApiLevel $apiLevel -Port $ports[$apiLevel]
        Invoke-AndroidLabOnDevice -Serial $session.Serial -ReportDirectory $apiReportDirectory
    } catch {
        if ($CollectBugreportOnFailure -and $null -ne $session) {
            Invoke-AndroidLabCommand -FilePath $tools.Adb -Arguments @('-s', $session.Serial, 'bugreport', (Join-Path $apiReportDirectory 'bugreport.zip')) -AllowFailure | Out-Null
        }
        throw
    } finally {
        if (($null -ne $session) -and -not $KeepEmulator) {
            Stop-AndroidLabEmulator -EmulatorSession $session
        }
    }
}

Write-Host "Android $Profile завершён. Отчёты: $runDirectory" -ForegroundColor Green
