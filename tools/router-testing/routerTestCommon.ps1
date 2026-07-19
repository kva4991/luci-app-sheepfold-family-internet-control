<#
.SYNOPSIS
Общие функции безопасного подключения к тестовому OpenWrt-роутеру.

.DESCRIPTION
Файл вынесен отдельно, чтобы setup, backend- и frontend-сценарии одинаково проверяли
частный IPv4, использовали один профиль и один SSH-ключ. Здесь намеренно включён
BatchMode: после первоначальной настройки автоматический тест не должен зависнуть
в невидимом ожидании пароля и не должен принимать пароль из командной строки.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SheepfoldRouterConfigPath {
    $configDir = Join-Path $env:LOCALAPPDATA 'Sheepfold'
    return Join-Path $configDir 'routerTest.json'
}

function Get-SheepfoldRouterCredentialPath {
    $configDir = Join-Path $env:LOCALAPPDATA 'Sheepfold'
    return Join-Path $configDir 'routerTestCredential.xml'
}

function Get-SheepfoldLuciBaseUrl {
    param([Parameter(Mandatory = $true)]$Config)

    # LuCI и API приложения могут использовать разные протоколы и порты. На
    # тестовом роутере LuCI открыт по HTTP:80, а Sheepfold API — по HTTPS:5201.
    # Старые профили не содержат luciScheme/luciPort, поэтому безопасный локальный
    # fallback для них тоже HTTP:80, а не прежнее ошибочное HTTPS:443.
    $propertyNames = @($Config.PSObject.Properties.Name)
    $scheme = if ($propertyNames -contains 'luciScheme' -and $Config.luciScheme) {
        [string]$Config.luciScheme
    } else {
        'http'
    }
    if ($scheme -notin @('http', 'https')) {
        throw "Протокол LuCI должен быть http или https, получено: $scheme"
    }

    $defaultPort = if ($scheme -eq 'https') { 443 } else { 80 }
    $port = if ($propertyNames -contains 'luciPort' -and $Config.luciPort) {
        [int]$Config.luciPort
    } else {
        $defaultPort
    }
    if ($port -lt 1 -or $port -gt 65535) {
        throw 'Порт LuCI должен быть в диапазоне 1..65535.'
    }

    $portSuffix = if ($port -eq $defaultPort) { '' } else { ':' + [string]$port }
    return '{0}://{1}{2}' -f $scheme, $Config.routerHost, $portSuffix
}

function Get-SheepfoldWorkRoot {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $scratchRoot = [Environment]::GetEnvironmentVariable('SHEEPFOLD_SCRIPT_SCRATCH_ROOT', 'Process')
    if ([string]::IsNullOrWhiteSpace($scratchRoot)) {
        return Join-Path $RepoRoot '.build'
    }

    if (-not [System.IO.Path]::IsPathRooted($scratchRoot)) {
        throw 'SHEEPFOLD_SCRIPT_SCRATCH_ROOT должен быть абсолютным локальным путём.'
    }

    # Все временные файлы Sheepfold остаются в собственном подкаталоге: корень,
    # выбранный пользователем для других программ, сценарий никогда не очищает.
    return Join-Path ([System.IO.Path]::GetFullPath($scratchRoot)) 'sheepfold-temp'
}

function Test-SheepfoldPrivateIpv4 {
    param([Parameter(Mandatory = $true)][string]$Address)

    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) {
        return $false
    }
    $bytes = $parsed.GetAddressBytes()
    if ($bytes.Length -ne 4) {
        return $false
    }
    return $bytes[0] -eq 10 -or
        ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
        ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
}

function Get-SheepfoldRouterConfig {
    $configPath = Get-SheepfoldRouterConfigPath
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw "Профиль тестового роутера не найден: $configPath. Сначала выполните npm.cmd run router:setup."
    }

    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($env:SHEEPFOLD_ROUTER_HOST) { $config.routerHost = $env:SHEEPFOLD_ROUTER_HOST }
    if ($env:SHEEPFOLD_ROUTER_USER) { $config.routerUser = $env:SHEEPFOLD_ROUTER_USER }
    if ($env:SHEEPFOLD_ROUTER_SSH_PORT) { $config.sshPort = [int]$env:SHEEPFOLD_ROUTER_SSH_PORT }
    if ($env:SHEEPFOLD_ROUTER_IDENTITY_FILE) { $config.identityFile = $env:SHEEPFOLD_ROUTER_IDENTITY_FILE }

    if (-not (Test-SheepfoldPrivateIpv4 -Address $config.routerHost)) {
        throw "Разрешён только буквальный частный IPv4-адрес тестового роутера, получено: $($config.routerHost)"
    }
    if ($config.routerUser -notmatch '^[a-zA-Z0-9_.-]+$') {
        throw 'Имя SSH-пользователя содержит недопустимые символы.'
    }
    if ([int]$config.sshPort -lt 1 -or [int]$config.sshPort -gt 65535) {
        throw 'SSH-порт должен быть в диапазоне 1..65535.'
    }
    if (-not (Test-Path -LiteralPath $config.identityFile)) {
        throw "SSH-ключ не найден: $($config.identityFile)"
    }
    return $config
}

function Get-SheepfoldSshArgs {
    param([Parameter(Mandatory = $true)]$Config)

    return @(
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        '-o', 'ServerAliveInterval=5',
        '-o', 'ServerAliveCountMax=2',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-i', [string]$Config.identityFile,
        '-p', [string]$Config.sshPort
    )
}

function Get-SheepfoldScpArgs {
    param([Parameter(Mandatory = $true)]$Config)

    return @(
        # OpenSSH 9 по умолчанию переключил scp на SFTP, которого обычно нет в
        # минимальном OpenWrt. -O явно выбирает совместимый legacy SCP-протокол.
        '-O',
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-i', [string]$Config.identityFile,
        '-P', [string]$Config.sshPort
    )
}

function Invoke-SheepfoldSsh {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$RemoteCommand,
        [switch]$AllowFailure
    )

    $target = '{0}@{1}' -f $Config.routerUser, $Config.routerHost
    # Git выдаёт PowerShell-файлы с CRLF, но многострочная команда исполняется
    # BusyBox ash на роутере. Оставшийся CR превращает `then` в другой токен и
    # ломает if/elif ещё до запуска проверки, поэтому нормализуем команды здесь.
    $normalizedCommand = $RemoteCommand.Replace("`r`n", "`n").Replace("`r", "`n")
    $previousPreference = $ErrorActionPreference
    try {
        # OpenSSH пишет диагностику в stderr; в Windows PowerShell 5 это не должно
        # стать исключением раньше, чем мы прочитаем настоящий process exit code.
        $ErrorActionPreference = 'Continue'
        $output = & ssh.exe @(Get-SheepfoldSshArgs -Config $Config) $target $normalizedCommand 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "SSH-команда завершилась с кодом $exitCode.`n$($output -join [Environment]::NewLine)"
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = @($output) }
}

function Send-SheepfoldFile {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$RemotePath
    )

    $target = '{0}@{1}:{2}' -f $Config.routerUser, $Config.routerHost, $RemotePath
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & scp.exe @(Get-SheepfoldScpArgs -Config $Config) $LocalPath $target
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "Не удалось скопировать $LocalPath на роутер."
    }
}

function Receive-SheepfoldFile {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [Parameter(Mandatory = $true)][string]$LocalPath
    )

    $source = '{0}@{1}:{2}' -f $Config.routerUser, $Config.routerHost, $RemotePath
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & scp.exe @(Get-SheepfoldScpArgs -Config $Config) $source $LocalPath
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "Не удалось получить $RemotePath с роутера."
    }
}
