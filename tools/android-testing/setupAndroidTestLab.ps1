<#
.SYNOPSIS
Проверяет или устанавливает выделенные Android-эмуляторы Sheepfold.

.DESCRIPTION
Без -Install сценарий только проверяет SDK, WHPX и наличие двух проектных AVD.
С -Install он скачивает официальные AOSP x86_64 images API 28/35 и создаёт AVD
SheepfoldLabApi28/SheepfoldLabApi35. Существующие AVD не удаляются; пересоздание
разрешено только отдельным -RecreateAvds и только для этих двух точных имён.

Сценарий меняет Android SDK и %USERPROFILE%\.android\avd, но не репозиторий,
роутер и телефоны. Успех доказывает готовность окружения, а не работу APK.
#>

[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$AcceptAndroidLicenses,
    [switch]$RecreateAvds,
    [string]$AndroidSdkRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'androidLabCommon.ps1')

$tools = Get-AndroidLabTools -AndroidSdkRoot $AndroidSdkRoot
Assert-AndroidLabTools -Tools $tools
$avdMap = Get-AndroidLabAvdMap

if ($RecreateAvds -and -not $Install) {
    throw '-RecreateAvds требует -Install, чтобы проектные AVD не остались удалёнными.'
}

Write-Host "Android SDK: $($tools.SdkRoot)"
$acceleration = Invoke-AndroidLabCommand -FilePath $tools.Emulator -Arguments @('-accel-check') -AllowFailure
$acceleration.Output | ForEach-Object { Write-Host $_ }
if ($acceleration.ExitCode -ne 0) {
    throw 'Аппаратное ускорение Android Emulator недоступно. На Windows включите WHPX и виртуализацию BIOS.'
}

if ($Install) {
    if (-not $AcceptAndroidLicenses) {
        throw 'Для загрузки SDK images нужен явный флаг -AcceptAndroidLicenses после ознакомления с лицензиями Android SDK.'
    }

    1..40 | ForEach-Object { 'y' } | & $tools.SdkManager --licenses | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw 'Не удалось принять Android SDK licenses.'
    }

    foreach ($apiLevel in @($avdMap.Keys | Sort-Object)) {
        $imageId = Get-AndroidLabImageId -ApiLevel ([int]$apiLevel)
        Write-Host "Устанавливается $imageId"
        Invoke-AndroidLabCommandWithRetry -FilePath $tools.SdkManager -Arguments @('emulator', $imageId) | Out-Null
    }
}

$knownAvds = @(& $tools.Emulator -list-avds 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw 'Android Emulator не смог получить список AVD.'
}

foreach ($apiLevel in @($avdMap.Keys | Sort-Object)) {
    $avdName = $avdMap[$apiLevel]
    $exists = $knownAvds -contains $avdName

    if ($exists -and $RecreateAvds) {
        if ($avdName -notin @('SheepfoldLabApi28', 'SheepfoldLabApi35')) {
            throw "Отказано в удалении постороннего AVD: $avdName"
        }
        Invoke-AndroidLabCommand -FilePath $tools.AvdManager -Arguments @('delete', 'avd', '--name', $avdName) | Out-Null
        $exists = $false
    }

    if (-not $exists -and $Install) {
        $imageId = Get-AndroidLabImageId -ApiLevel ([int]$apiLevel)
        Write-Host "Создаётся $avdName"
        'no' | & $tools.AvdManager create avd --name $avdName --package $imageId --device pixel_2 --sdcard 512M --force | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось создать AVD $avdName."
        }
        $exists = $true
    }

    if ($exists) {
        Write-Host "OK: $avdName"
    } else {
        Write-Host "MISSING: $avdName" -ForegroundColor Yellow
    }
}

$finalAvds = @(& $tools.Emulator -list-avds 2>&1)
$missingAvds = @(@(28, 35) | ForEach-Object { $avdMap[$_] } | Where-Object { $_ -notin $finalAvds })
if ($missingAvds.Count -gt 0) {
    throw "Стенд не готов. Отсутствуют AVD: $($missingAvds -join ', '). Запустите сценарий с -Install -AcceptAndroidLicenses."
}

Write-Host 'Android test lab готов.' -ForegroundColor Green
