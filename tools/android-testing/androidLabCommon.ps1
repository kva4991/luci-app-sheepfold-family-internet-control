<#
.SYNOPSIS
Общие безопасные операции ручного Android-стенда Sheepfold.

.DESCRIPTION
Файл централизует поиск SDK, имена только проектных AVD, ожидание загрузки,
сбор logcat/UI/screenshot и точечный запуск adb. Он не устанавливает пакеты,
не запускает эмулятор и не меняет телефон сам по себе.

Процедуры могут писать только в выбранный каталог отчёта и во временное
состояние явно выбранного Android-устройства. Их наличие не доказывает работу
Wi-Fi, SIM, камеры, роутера или пользовательского сценария.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AndroidLabSdkRoot {
    param([string]$AndroidSdkRoot = '')

    $candidates = @(
        $AndroidSdkRoot,
        $env:ANDROID_SDK_ROOT,
        $env:ANDROID_HOME,
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw 'Android SDK не найден. Сначала выполните tools\windows\setup.ps1.'
}

function Get-AndroidLabTools {
    param([string]$AndroidSdkRoot = '')

    $sdkRoot = Get-AndroidLabSdkRoot -AndroidSdkRoot $AndroidSdkRoot
    return [pscustomobject]@{
        SdkRoot = $sdkRoot
        Adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
        Emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
        SdkManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
        AvdManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\avdmanager.bat'
    }
}

function Assert-AndroidLabTools {
    param([Parameter(Mandatory = $true)]$Tools)

    foreach ($entry in @(
        @{ Name = 'adb'; Path = $Tools.Adb },
        @{ Name = 'Android Emulator'; Path = $Tools.Emulator },
        @{ Name = 'sdkmanager'; Path = $Tools.SdkManager },
        @{ Name = 'avdmanager'; Path = $Tools.AvdManager }
    )) {
        if (-not (Test-Path -LiteralPath $entry.Path -PathType Leaf)) {
            throw "$($entry.Name) не найден: $($entry.Path)"
        }
    }

    if (-not (Get-Command java.exe -ErrorAction SilentlyContinue)) {
        throw 'java.exe не найден в PATH. Запустите tools\windows\setup.ps1 и откройте новый PowerShell.'
    }
}

function Get-AndroidLabAvdMap {
    # Обычный Hashtable нужен здесь намеренно: OrderedDictionary воспринимает
    # целочисленный ключ как позиционный индекс и ломает lookup API 28/35.
    return @{
        28 = 'SheepfoldLabApi28'
        35 = 'SheepfoldLabApi35'
    }
}

function Get-AndroidLabImageId {
    param([Parameter(Mandatory = $true)][int]$ApiLevel)

    return "system-images;android-$ApiLevel;default;x86_64"
}

function Get-AndroidLabScratchRoot {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    if (-not [string]::IsNullOrWhiteSpace($env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT)) {
        return $env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT
    }

    $ownerScratch = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'pesochnica'
    if (Test-Path -LiteralPath $ownerScratch) {
        return $ownerScratch
    }

    return (Join-Path $RepoRoot '.build\android-lab')
}

function New-AndroidLabRunDirectory {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $scratchRoot = Get-AndroidLabScratchRoot -RepoRoot $RepoRoot
    $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
    $runDirectory = Join-Path $scratchRoot "sheepfold-android-lab\$runId"
    New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
    return $runDirectory
}

function Invoke-AndroidLabCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure,
        [string]$OutputPath = ''
    )

    # Windows PowerShell 5 превращает любой native stderr в NativeCommandError,
    # хотя sdkmanager и emulator часто пишут туда обычные warnings с exit code 0.
    # Решение принимаем по коду процесса, но stderr всё равно сохраняем в отчёт.
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $FilePath @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    # adb в Windows иногда возвращает элементы уже с завершающим CR, после чего
    # Set-Content добавляет ещё CRLF. Нормализуем только этот терминатор строки.
    $output = @($output | ForEach-Object { ([string]$_).TrimEnd([char[]]@([char]13)) })
    if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
        $output | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    }
    if (($exitCode -ne 0) -and -not $AllowFailure) {
        throw "Команда завершилась с кодом ${exitCode}: $FilePath $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Invoke-AndroidLabCommandWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [int]$MaxAttempts = 5,
        [int]$DelaySeconds = 10
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            return Invoke-AndroidLabCommand -FilePath $FilePath -Arguments $Arguments
        } catch {
            if ($attempt -eq $MaxAttempts) {
                throw
            }
            Write-Warning "Команда не выполнена, попытка $attempt из $MaxAttempts. Повтор через $DelaySeconds секунд."
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Wait-AndroidLabBoot {
    param(
        [Parameter(Mandatory = $true)][string]$AdbPath,
        [Parameter(Mandatory = $true)][string]$Serial,
        [int]$TimeoutSeconds = 240
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $state = Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'get-state') -AllowFailure
        if (($state.ExitCode -eq 0) -and (($state.Output -join '').Trim() -eq 'device')) {
            $boot = Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'shell', 'getprop', 'sys.boot_completed') -AllowFailure
            if (($boot.Output -join '').Trim() -eq '1') {
                $packageManager = Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'shell', 'pm', 'path', 'android') -AllowFailure
                if ($packageManager.ExitCode -eq 0) {
                    return
                }
            }
        }
        Start-Sleep -Seconds 2
    }

    throw "Android-устройство $Serial не загрузилось за $TimeoutSeconds секунд."
}

function Save-AndroidLabScreenshot {
    param(
        [Parameter(Mandatory = $true)][string]$AdbPath,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $AdbPath
    $startInfo.Arguments = "-s $Serial exec-out screencap -p"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $stream = [System.IO.File]::Create($OutputPath)
    try {
        $process.StandardOutput.BaseStream.CopyTo($stream)
    } finally {
        $stream.Dispose()
    }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Не удалось сохранить screenshot: $($process.StandardError.ReadToEnd())"
    }
}

function Save-AndroidLabDiagnostics {
    param(
        [Parameter(Mandatory = $true)][string]$AdbPath,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][string]$OutputDirectory,
        [Parameter(Mandatory = $true)][string]$Prefix
    )

    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
    Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'logcat', '-d', '-v', 'threadtime') -AllowFailure -OutputPath (Join-Path $OutputDirectory "$Prefix-logcat.txt") | Out-Null
    Save-AndroidLabScreenshot -AdbPath $AdbPath -Serial $Serial -OutputPath (Join-Path $OutputDirectory "$Prefix-screen.png")

    $remoteDump = "/sdcard/sheepfold-$Prefix-window.xml"
    Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'shell', 'uiautomator', 'dump', $remoteDump) -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'pull', $remoteDump, (Join-Path $OutputDirectory "$Prefix-window.xml")) -AllowFailure | Out-Null
    Invoke-AndroidLabCommand -FilePath $AdbPath -Arguments @('-s', $Serial, 'shell', 'rm', '-f', $remoteDump) -AllowFailure | Out-Null
}
