<#
.SYNOPSIS
Единая команда полного безопасного прохода backend и LuCI на тестовом роутере.

.DESCRIPTION
Сначала выполняет fullSafe: backup, сборку/установку IPK и восстанавливаемые UCI-
проверки. Только после его успеха запускает read-only frontend. Такая очередность
не позволяет красивому интерфейсу скрыть неудачную установку или поломку backend.
#>
[CmdletBinding()]
param(
    [ValidateSet('sheepfold', 'sheepfoldAi')]
    [string]$Variant = 'sheepfold',
    [string]$IpkPath = '',
    [switch]$AllowConfiguredSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$routerArgs = @('-Profile', 'fullSafe', '-Variant', $Variant)
if ($IpkPath) {
    $routerArgs += @('-IpkPath', $IpkPath)
}
if ($AllowConfiguredSecrets) {
    $routerArgs += '-AllowConfiguredSecrets'
}
& (Join-Path $PSScriptRoot 'runRouterTests.ps1') @routerArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Backend-проверки живого роутера завершились с ошибкой; frontend не запускается.'
}

& (Join-Path $PSScriptRoot 'runFrontendTests.ps1')
if ($LASTEXITCODE -ne 0) {
    throw 'Frontend-проверки живого роутера завершились с ошибкой.'
}
