<#
.SYNOPSIS
Один раз готовит Windows и тестовый роутер к автономным проверкам Sheepfold.

.DESCRIPTION
Создаёт отдельный SSH-ключ, сохраняет несекретный профиль подключения и по явным
флагам устанавливает открытый ключ на роутер и шифрует LuCI-учётные данные через
Windows DPAPI. Скрипт не пытается тайно включать Dropbear через веб-интерфейс:
закрытый SSH-порт требует одного осознанного действия владельца роутера.
#>
[CmdletBinding()]
param(
    [string]$RouterHost = '',
    [string]$RouterUser = 'root',
    [int]$SshPort = 22,
    [ValidateSet('http', 'https')]
    [string]$LuciScheme = 'http',
    [int]$LuciPort = 80,
    [int]$AppPort = 5201,
    [string]$IdentityFile = (Join-Path $HOME '.ssh\sheepfold_test_router_ed25519'),
    [switch]$InstallPublicKey,
    [switch]$SaveLuciCredential,
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'routerTestCommon.ps1')

if (-not $RouterHost -or -not (Test-SheepfoldPrivateIpv4 -Address $RouterHost)) {
    throw 'Явно укажите буквальный частный IPv4 тестового роутера через -RouterHost. Значения по умолчанию намеренно нет.'
}
if ($RouterUser -notmatch '^[a-zA-Z0-9_.-]+$') {
    throw 'Имя SSH-пользователя содержит недопустимые символы.'
}
if ($LuciPort -lt 1 -or $LuciPort -gt 65535) {
    throw 'Порт LuCI должен быть в диапазоне 1..65535.'
}

$configPath = Get-SheepfoldRouterConfigPath
$configDir = Split-Path -Parent $configPath
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $IdentityFile) | Out-Null

if (-not $VerifyOnly -and -not (Test-Path -LiteralPath $IdentityFile)) {
    Write-Host 'Создаётся отдельный SSH-ключ только для тестового роутера...'
    # Windows PowerShell 5 удаляет настоящий пустой аргумент; строка "" доходит до
    # native parser ssh-keygen именно как пустая passphrase и не вызывает prompt.
    & ssh-keygen.exe -q -t ed25519 -f $IdentityFile -N '""' -C 'sheepfold-test-router'
    if ($LASTEXITCODE -ne 0) {
        throw 'ssh-keygen не смог создать ключ.'
    }
    # Закрытый ключ остаётся доступен только текущему пользователю Windows.
    # icacls принимает переключатель /grant:r и SID отдельными аргументами.
    # Склеенный вариант /grant:r:User:(F) выглядит правдоподобно, но отклоняется Windows.
    & icacls.exe $IdentityFile '/inheritance:r' '/grant:r' "$($env:USERNAME):(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Не удалось ограничить ACL закрытого SSH-ключа.'
    }
}

if (-not (Test-Path -LiteralPath $IdentityFile)) {
    throw "Закрытый ключ не найден: $IdentityFile"
}

$profile = [ordered]@{
    routerHost = $RouterHost
    routerUser = $RouterUser
    sshPort = $SshPort
    luciScheme = $LuciScheme
    luciPort = $LuciPort
    appPort = $AppPort
    identityFile = [System.IO.Path]::GetFullPath($IdentityFile)
    luciPath = '/cgi-bin/luci/admin/services/sheepfold'
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($profile | ConvertTo-Json) + "`n", $utf8NoBom)
Write-Host "Профиль сохранён: $configPath"

$portOpen = Test-NetConnection -ComputerName $RouterHost -Port $SshPort -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $portOpen) {
    Write-Warning "SSH-порт $SshPort на $RouterHost закрыт. Один раз включите SSH/Dropbear в LuCI, затем повторите команду с -InstallPublicKey."
    exit 2
}

if ($InstallPublicKey) {
    $publicKeyPath = "$IdentityFile.pub"
    if (-not (Test-Path -LiteralPath $publicKeyPath)) {
        throw "Открытый ключ не найден: $publicKeyPath"
    }
    $publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw -Encoding UTF8).Trim()
    if ($publicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/]+={0,2} sheepfold-test-router$') {
        throw 'Открытый ключ имеет неожиданный формат или комментарий.'
    }
    # Чистый OpenWrt может не содержать base64. Выделенный ключ состоит только из
    # проверенных безопасных символов, поэтому передаём его как shell-литерал и
    # отдельно запрещаем пустое значение: пустая строка не должна считаться успехом.
    $remoteCommand = "umask 077; mkdir -p /etc/dropbear; key='$publicKey'; test -n `"`$key`" || exit 71; touch /etc/dropbear/authorized_keys; grep -qxF `"`$key`" /etc/dropbear/authorized_keys || printf '%s\n' `"`$key`" >> /etc/dropbear/authorized_keys; chmod 600 /etc/dropbear/authorized_keys; grep -qxF `"`$key`" /etc/dropbear/authorized_keys"
    $target = '{0}@{1}' -f $RouterUser, $RouterHost
    Write-Host 'Сейчас может один раз потребоваться root-пароль роутера для установки открытого ключа.'
    & ssh.exe -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -p $SshPort $target $remoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw 'Не удалось установить открытый SSH-ключ на роутер.'
    }
}

if ($SaveLuciCredential) {
    $credential = Get-Credential -UserName $RouterUser -Message 'Введите логин и пароль LuCI тестового роутера. Windows зашифрует их для текущего пользователя.'
    $credentialPath = Get-SheepfoldRouterCredentialPath
    $credential | Export-Clixml -LiteralPath $credentialPath
    & icacls.exe $credentialPath '/inheritance:r' '/grant:r' "$($env:USERNAME):(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Не удалось ограничить ACL файла с LuCI-учётными данными.'
    }
    Write-Host "Учётные данные LuCI сохранены через DPAPI: $credentialPath"
}

$config = Get-SheepfoldRouterConfig
$probe = Invoke-SheepfoldSsh -Config $config -RemoteCommand 'printf sheepfold-ssh-ok'
if (($probe.Output -join '') -notmatch 'sheepfold-ssh-ok') {
    throw 'SSH-проверка не вернула ожидаемый ответ.'
}

Write-Host 'Готово: SSH-ключ работает без запроса пароля.'
Write-Host 'Безопасный полный прогон: npm.cmd run router:fullSafe'
Write-Host 'Только интерфейс LuCI: npm.cmd run router:frontend'
