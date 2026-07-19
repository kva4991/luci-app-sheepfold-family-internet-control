<#
.SYNOPSIS
Запускает выбранный безопасный профиль backend/package-тестов на живом роутере.

.DESCRIPTION
Профили разделены по риску: readOnly ничего не меняет, install ставит пакет только
после внешнего backup, writeSafe проверяет UCI на фиктивном MAC и восстанавливает
состояние, fullSafe объединяет эти шаги. Системный менеджер пакетов определяется
автоматически: opkg для OpenWrt 24.10 и apk для OpenWrt 25.12.

Здесь принципиально нет reboot, Wi-Fi/WPS, sysupgrade, opkg upgrade или apk
upgrade: такие действия требуют отдельного hardware-контура.
#>
[CmdletBinding()]
param(
    [ValidateSet('readOnly', 'install', 'writeSafe', 'fullSafe')]
    [string]$Profile = 'readOnly',
    [ValidateSet('sheepfold', 'sheepfoldAi')]
    [string]$Variant = 'sheepfold',
    [string]$IpkPath = '',
    [string]$ApkPath = '',
    [switch]$AllowConfiguredSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'routerTestCommon.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workRoot = Get-SheepfoldWorkRoot -RepoRoot $repoRoot
$config = Get-SheepfoldRouterConfig
$runId = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$reportDir = Join-Path $workRoot "live-router\$runId"
$privateDir = Join-Path $reportDir 'private'
$remoteDir = "/tmp/sheepfold-live-test-$runId"
$packageManager = ''
New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
& icacls.exe $privateDir '/inheritance:r' '/grant:r' "$($env:USERNAME):(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось ограничить ACL каталога с резервной копией роутера.'
}

$logPath = Join-Path $reportDir 'run.log'
function Write-TestLog {
    param([string]$Message)

    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Invoke-LoggedSsh {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [switch]$AllowFailure
    )

    $result = Invoke-SheepfoldSsh -Config $config -RemoteCommand $Command -AllowFailure:$AllowFailure
    foreach ($line in $result.Output) {
        Write-TestLog ([string]$line)
    }
    return $result
}

function Assert-SafeSecretState {
    if ($Profile -eq 'readOnly') {
        return
    }

    # Возвращаем только число заполненных полей. Значения секретов не должны
    # попадать ни в PowerShell, ни в журнал тестового прохода.
    $secretProbe = @'
count=0
for key in \
    sheepfold.global.deepseek_api_key \
    sheepfold.global.gemini_api_key \
    sheepfold.global.grok_api_key \
    sheepfold.global.vk_access_token \
    sheepfold.global.telegram_bot_token \
    sheepfold.adguard.password \
    sheepfold.cloud.password \
    sheepfold.gdrive.client_secret \
    sheepfold.gdrive.refresh_token
do
    [ -n "$(uci -q get "$key" 2>/dev/null || true)" ] && count=$((count + 1))
done
printf 'configured-secret-count=%s\n' "$count"
'@
    $result = Invoke-LoggedSsh -Command $secretProbe
    $countLine = $result.Output |
        Where-Object { [string]$_ -match '^configured-secret-count=\d+$' } |
        Select-Object -Last 1
    if (-not $countLine) {
        throw 'Не удалось безопасно проверить наличие настроенных секретов.'
    }
    $secretCount = [int](([string]$countLine) -replace '^configured-secret-count=', '')
    if ($secretCount -gt 0 -and -not $AllowConfiguredSecrets) {
        throw "На роутере заполнены чувствительные поля ($secretCount). Изменяющий тест остановлен. Используйте отдельный тестовый конфиг без секретов либо осознанно передайте -AllowConfiguredSecrets."
    }
}

function New-RemoteBackup {
    Write-TestLog 'Создаётся резервная копия известных UCI-конфигов.'
    Invoke-LoggedSsh -Command "sh '$remoteDir/routerState.sh' backup '$remoteDir' '$packageManager'" | Out-Null

    $localBackup = Join-Path $privateDir 'config-backup.tgz'
    Receive-SheepfoldFile -Config $config -RemotePath "$remoteDir/config-backup.tgz" -LocalPath $localBackup
    if (-not (Test-Path -LiteralPath $localBackup) -or (Get-Item -LiteralPath $localBackup).Length -eq 0) {
        throw 'Резервная копия роутера не была получена; изменения запрещены.'
    }

    $remoteHashResult = Invoke-LoggedSsh -Command "sha256sum '$remoteDir/config-backup.tgz' | awk '{ print `$1 }'"
    $remoteHash = ($remoteHashResult.Output | Select-Object -Last 1).ToString().Trim().ToLowerInvariant()
    $localHash = (Get-FileHash -LiteralPath $localBackup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($localHash -ne $remoteHash) {
        throw 'SHA-256 локальной резервной копии не совпал с архивом на роутере; изменения запрещены.'
    }
    Write-TestLog "Резервная копия сохранена локально: $localBackup"
}

function Restore-RemoteBackup {
    Write-TestLog 'Восстанавливается точная резервная копия известных UCI-конфигов.'
    Invoke-LoggedSsh -Command "sh '$remoteDir/routerState.sh' restore '$remoteDir'" | Out-Null
}

function Resolve-TestPackage {
    if ($packageManager -eq 'opkg') {
        if ($ApkPath) {
            throw 'Для роутера с opkg передан OpenWrt .apk вместо .ipk.'
        }
        if ($IpkPath) {
            return (Resolve-Path -LiteralPath $IpkPath).Path
        }

        $buildDir = Join-Path $workRoot 'live-router-ipk'
        New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
        Write-TestLog "Собирается вариант $Variant в $buildDir"
        & python (Join-Path $repoRoot 'scripts\build-test-ipk.py') --variant $Variant --out-dir $buildDir
        if ($LASTEXITCODE -ne 0) {
            throw 'Сборка IPK завершилась с ошибкой.'
        }
        $prefix = if ($Variant -eq 'sheepfoldAi') {
            'luci-app-sheepfold-ai-support_'
        } else {
            'luci-app-sheepfold-family-internet-control_'
        }
        $candidate = Get-ChildItem -LiteralPath $buildDir -Filter "$prefix*.ipk" |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if (-not $candidate) {
            throw "Собранный IPK с префиксом $prefix не найден."
        }
        return $candidate.FullName
    }

    if ($IpkPath) {
        throw 'OpenWrt 25.12 использует apk и не принимает тестовый .ipk.'
    }
    if (-not $ApkPath) {
        throw 'Для OpenWrt 25.12 передайте официальный SDK-пакет через -ApkPath. Быстрый Windows IPK-builder формат apk не подменяет.'
    }
    return (Resolve-Path -LiteralPath $ApkPath).Path
}

function Install-TestPackage {
    $resolvedPackage = Resolve-TestPackage
    $fileName = Split-Path -Leaf $resolvedPackage
    if ($fileName -notmatch '^luci-app-sheepfold-(family-internet-control|ai-support)[_-].+\.(ipk|apk)$') {
        throw "Отказ от установки неожиданно названного файла: $fileName"
    }
    $expectedExtension = if ($packageManager -eq 'opkg') { '.ipk' } else { '.apk' }
    if ([System.IO.Path]::GetExtension($fileName) -ne $expectedExtension) {
        throw "Менеджер $packageManager ожидает пакет $expectedExtension, получен $fileName"
    }

    $requiredBytes = [Math]::Max(8MB, (Get-Item -LiteralPath $resolvedPackage).Length * 8)
    $space = Invoke-LoggedSsh -Command "df -k /overlay 2>/dev/null | awk 'NR == 2 { print `$4 * 1024 }'"
    $freeText = ($space.Output | Select-Object -Last 1).ToString().Trim()
    $freeBytes = 0L
    if (-not [long]::TryParse($freeText, [ref]$freeBytes) -or $freeBytes -lt $requiredBytes) {
        throw "Недостаточно свободного места в overlay: требуется минимум $requiredBytes байт, доступно $freeText."
    }

    $remotePackage = "$remoteDir/$fileName"
    Send-SheepfoldFile -Config $config -LocalPath $resolvedPackage -RemotePath $remotePackage
    $localHash = (Get-FileHash -LiteralPath $resolvedPackage -Algorithm SHA256).Hash.ToLowerInvariant()
    $hashResult = Invoke-LoggedSsh -Command "sha256sum '$remotePackage' | awk '{ print `$1 }'"
    $remoteHash = ($hashResult.Output | Select-Object -Last 1).ToString().Trim().ToLowerInvariant()
    if ($localHash -ne $remoteHash) {
        throw 'SHA-256 загруженного пакета не совпал с локальным файлом.'
    }
    Write-TestLog "SHA-256 пакета подтверждён: $localHash"

    if ($packageManager -eq 'opkg') {
        Invoke-LoggedSsh -Command 'opkg update' | Out-Null
        $installResult = Invoke-LoggedSsh -Command "opkg install '$remotePackage'" -AllowFailure
    } else {
        Invoke-LoggedSsh -Command 'apk update' | Out-Null
        $installResult = Invoke-LoggedSsh -Command "apk add --allow-untrusted --force-reinstall '$remotePackage'" -AllowFailure
    }
    if ($installResult.ExitCode -ne 0) {
        Restore-RemoteBackup
        throw "$packageManager не смог установить пакет; исходные конфиги восстановлены."
    }
}

function Invoke-RemoteChecks {
    param([ValidateSet('readOnly', 'writeSafe')][string]$Mode)

    $result = Invoke-LoggedSsh -Command "sh '$remoteDir/remoteChecks.sh' '$Mode' '$remoteDir'" -AllowFailure
    if ($result.ExitCode -ne 0) {
        throw "Проверки роутера $Mode завершились с ошибкой."
    }
}

function Remove-RemoteRunDirectory {
    # Удаляем только каталог с жёстко заданным префиксом и сгенерированным ID.
    # Пользовательский путь сюда не попадает, поэтому cleanup не может задеть систему.
    $cleanup = "case '$remoteDir' in /tmp/sheepfold-live-test-*) rm -rf '$remoteDir' ;; *) exit 70 ;; esac"
    Invoke-LoggedSsh -Command $cleanup -AllowFailure | Out-Null
}

$remoteDirReady = $false
Write-TestLog "Профиль: $Profile; роутер: $($config.routerHost):$($config.sshPort); вариант: $Variant"

try {
    $unixScripts = @{}
    foreach ($scriptName in @('remoteChecks.sh', 'routerState.sh')) {
        $sourcePath = Join-Path $PSScriptRoot $scriptName
        $copyPath = Join-Path $reportDir $scriptName
        $scriptText = (Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8).Replace("`r`n", "`n")
        [System.IO.File]::WriteAllText($copyPath, $scriptText, (New-Object System.Text.UTF8Encoding($false)))
        $unixScripts[$scriptName] = $copyPath
    }

    Write-TestLog 'Проверяется OpenWrt и системный менеджер пакетов.'
    $preflightCommand = @'
ubus call system board >/dev/null || exit 1
if command -v opkg >/dev/null 2>&1; then
    printf 'package-manager=opkg\n'
elif command -v apk >/dev/null 2>&1; then
    printf 'package-manager=apk\n'
else
    exit 127
fi
printf preflight-ok
'@
    $probe = Invoke-LoggedSsh -Command $preflightCommand
    if (($probe.Output -join "`n") -notmatch 'preflight-ok') {
        throw 'Предполётная проверка OpenWrt и системного менеджера пакетов не пройдена.'
    }
    $packageManagerLine = $probe.Output |
        Where-Object { [string]$_ -match '^package-manager=(opkg|apk)$' } |
        Select-Object -Last 1
    if (-not $packageManagerLine) {
        throw 'Не удалось определить системный менеджер пакетов роутера.'
    }
    $packageManager = ([string]$packageManagerLine) -replace '^package-manager=', ''
    Write-TestLog "Определён системный менеджер пакетов: $packageManager"

    Write-TestLog 'Проверяется наличие настроенных чувствительных полей без чтения их значений.'
    Assert-SafeSecretState
    Write-TestLog 'Создаётся изолированный временный каталог на роутере.'
    Invoke-LoggedSsh -Command "mkdir -p '$remoteDir' && chmod 700 '$remoteDir'" | Out-Null
    $remoteDirReady = $true
    Write-TestLog 'Передаются сценарии безопасных проверок и backup/restore.'
    foreach ($scriptName in @('remoteChecks.sh', 'routerState.sh')) {
        Send-SheepfoldFile -Config $config -LocalPath $unixScripts[$scriptName] -RemotePath "$remoteDir/$scriptName"
    }
    Write-TestLog 'Подготовка тестового контура завершена.'

    switch ($Profile) {
        'readOnly' {
            Invoke-RemoteChecks -Mode readOnly
        }
        'install' {
            New-RemoteBackup
            Install-TestPackage
            try {
                Invoke-RemoteChecks -Mode readOnly
            } catch {
                Restore-RemoteBackup
                throw
            }
        }
        'writeSafe' {
            New-RemoteBackup
            try {
                Invoke-RemoteChecks -Mode readOnly
                Invoke-RemoteChecks -Mode writeSafe
                Invoke-RemoteChecks -Mode readOnly
            } catch {
                Restore-RemoteBackup
                throw
            }
        }
        'fullSafe' {
            New-RemoteBackup
            Install-TestPackage
            try {
                Invoke-RemoteChecks -Mode readOnly
                Invoke-RemoteChecks -Mode writeSafe
                Invoke-RemoteChecks -Mode readOnly
            } catch {
                Restore-RemoteBackup
                throw
            }
        }
    }
    Write-TestLog "Профиль $Profile завершён успешно."
} catch {
    Write-TestLog "Профиль $Profile остановлен: $($_.Exception.Message)"
    throw
} finally {
    if ($remoteDirReady) {
        Remove-RemoteRunDirectory
    }
    Write-TestLog "Отчёт сохранён: $reportDir"
}
