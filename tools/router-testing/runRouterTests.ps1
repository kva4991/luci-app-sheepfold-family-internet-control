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
$config = Get-SheepfoldRouterConfig
$runId = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$reportDir = Join-Path $repoRoot ".build\live-router\$runId"
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
    $template = @'
set -eu
run_dir='__RUN_DIR__'
mkdir -p "$run_dir/config"
chmod 700 "$run_dir" "$run_dir/config"
: > "$run_dir/absent-configs"
for name in sheepfold dhcp wireless firewall; do
    if [ -f "/etc/config/$name" ]; then
        cp -p "/etc/config/$name" "$run_dir/config/$name"
    else
        printf '%s\n' "$name" >> "$run_dir/absent-configs"
    fi
done
case '__PACKAGE_MANAGER__' in
    opkg)
        if opkg status luci-app-sheepfold-family-internet-control >/dev/null 2>&1; then
            opkg status luci-app-sheepfold-family-internet-control > "$run_dir/package-status.txt"
        elif opkg status luci-app-sheepfold-ai-support >/dev/null 2>&1; then
            opkg status luci-app-sheepfold-ai-support > "$run_dir/package-status.txt"
        else
            : > "$run_dir/package-status.txt"
        fi
        ;;
    apk)
        if apk info -e luci-app-sheepfold-family-internet-control >/dev/null 2>&1; then
            apk info --from installed --fields name,version --format json luci-app-sheepfold-family-internet-control > "$run_dir/package-status.txt"
        elif apk info -e luci-app-sheepfold-ai-support >/dev/null 2>&1; then
            apk info --from installed --fields name,version --format json luci-app-sheepfold-ai-support > "$run_dir/package-status.txt"
        else
            : > "$run_dir/package-status.txt"
        fi
        ;;
esac
tar -czf "$run_dir/config-backup.tgz" -C "$run_dir" config absent-configs package-status.txt
tar -tzf "$run_dir/config-backup.tgz" >/dev/null
chmod 600 "$run_dir/config-backup.tgz"
'@
    $backupCommand = $template.Replace('__RUN_DIR__', $remoteDir).Replace('__PACKAGE_MANAGER__', $packageManager)
    Invoke-LoggedSsh -Command $backupCommand | Out-Null

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
    $template = @'
set -eu
run_dir='__RUN_DIR__'
for name in sheepfold dhcp wireless firewall; do
    if grep -qx "$name" "$run_dir/absent-configs"; then
        rm -f "/etc/config/$name"
    elif [ -f "$run_dir/config/$name" ]; then
        cp -p "$run_dir/config/$name" "/etc/config/$name"
    fi
done
uci -q commit sheepfold || true
if [ -x /usr/libexec/sheepfold/sheepfold-router-control ]; then
    /usr/libexec/sheepfold/sheepfold-router-control settings-import-applied >/dev/null 2>&1 || true
fi
for name in sheepfold dhcp wireless firewall; do
    if grep -qx "$name" "$run_dir/absent-configs"; then
        [ ! -e "/etc/config/$name" ] || exit 1
    elif [ -f "$run_dir/config/$name" ]; then
        cmp -s "$run_dir/config/$name" "/etc/config/$name" || exit 1
    fi
done
'@
    Invoke-LoggedSsh -Command ($template.Replace('__RUN_DIR__', $remoteDir)) | Out-Null
}

function Resolve-TestPackage {
    if ($packageManager -eq 'opkg') {
        if ($ApkPath) {
            throw 'Для роутера с opkg передан OpenWrt .apk вместо .ipk.'
        }
        if ($IpkPath) {
            return (Resolve-Path -LiteralPath $IpkPath).Path
        }

        $buildDir = Join-Path $repoRoot '.build\live-router-ipk'
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

Write-TestLog "Профиль: $Profile; роутер: $($config.routerHost):$($config.sshPort); вариант: $Variant"
$remoteScriptSource = Join-Path $PSScriptRoot 'remoteChecks.sh'
$normalizedScript = Join-Path $reportDir 'remoteChecks.sh'
$scriptText = (Get-Content -LiteralPath $remoteScriptSource -Raw -Encoding UTF8).Replace("`r`n", "`n")
[System.IO.File]::WriteAllText($normalizedScript, $scriptText, (New-Object System.Text.UTF8Encoding($false)))

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

Assert-SafeSecretState
Invoke-LoggedSsh -Command "mkdir -p '$remoteDir' && chmod 700 '$remoteDir'" | Out-Null
Send-SheepfoldFile -Config $config -LocalPath $normalizedScript -RemotePath "$remoteDir/remoteChecks.sh"

try {
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
    Remove-RemoteRunDirectory
    Write-TestLog "Отчёт сохранён: $reportDir"
}
