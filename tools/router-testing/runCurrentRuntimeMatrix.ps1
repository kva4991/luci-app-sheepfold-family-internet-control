<#
.SYNOPSIS
Проверяет текущие backend-helper'ы на тестовом роутере без установки пакета.

.DESCRIPTION
Сценарий нужен в узком промежутке между локальными тестами и сборкой OpenWrt:
он временно подставляет только helper-файлы, участвующие в матрице доступа,
запускает восстанавливаемый профиль writeSafe, а затем возвращает прежние
файлы и подтверждает их контрольные суммы профилем readOnly (§fwlock1).

Установленный пакет, UCI-конфигурация и прочие файлы роутера не заменяются.
Даже при ошибке теста блок finally восстанавливает исходный runtime. §routerharness
#>
[CmdletBinding()]
param(
    [ValidateSet('sheepfold', 'sheepfoldAi')]
    [string]$Variant = 'sheepfold',
    [switch]$AllowConfiguredSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'routerTestCommon.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$config = Get-SheepfoldRouterConfig
$runtimeSource = Join-Path $repoRoot 'package\luci-app-sheepfold-family-internet-control\root\usr\libexec\sheepfold'
$runtimeTarget = '/usr/libexec/sheepfold'
$runId = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$remoteRoot = "/tmp/sheepfold-current-runtime-$runId"
$runRouterTests = Join-Path $PSScriptRoot 'runRouterTests.ps1'

# Общие зависимости идут раньше потребителей, а firewall заменяется последним.
# При восстановлении порядок разворачивается, чтобы старый firewall больше не
# ссылался на уже удалённый новый helper.
$runtimeFiles = @(
    'sheepfold-hash-common',
    'sheepfold-lock-common',
    'sheepfold-schedule-evaluator',
    'sheepfold-router-control-legacy',
    'sheepfold-client-status-effective',
    'sheepfold-firewall'
)

function Invoke-RouterCommand {
    param([Parameter(Mandatory = $true)][string]$Command)

    $result = Invoke-SheepfoldSsh -Config $config -RemoteCommand $Command -AllowFailure
    if ($result.ExitCode -ne 0) {
        throw "SSH-команда временного runtime завершилась с кодом $($result.ExitCode).`n$($result.Output -join [Environment]::NewLine)"
    }
    return $result
}

function Join-ShellLines {
    param([Parameter(Mandatory = $true)][string[]]$Lines)

    return ($Lines -join "`n")
}

$staged = $false
$matrixError = $null
$restoreError = $null
$readOnlyError = $null

try {
    Invoke-RouterCommand -Command "mkdir -p '$remoteRoot/stage' '$remoteRoot/backup' '$remoteRoot/present'" | Out-Null

    foreach ($name in $runtimeFiles) {
        $source = Join-Path $runtimeSource $name
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Не найден runtime-helper: $source"
        }
        Send-SheepfoldFile -Config $config -LocalPath $source -RemotePath "$remoteRoot/stage/$name"
    }

    $activateLines = @('set -eu')
    foreach ($name in $runtimeFiles) {
        $target = "$runtimeTarget/$name"
        $activateLines += "if [ -e '$target' ]; then cp -p '$target' '$remoteRoot/backup/$name'; : > '$remoteRoot/present/$name'; sha256sum '$target' | cut -d' ' -f1 > '$remoteRoot/backup/$name.sha256'; fi"
        $activateLines += "cp '$remoteRoot/stage/$name' '$target.sheepfold-stage'"
        $activateLines += "chmod 0755 '$target.sheepfold-stage'"
        $activateLines += "mv -f '$target.sheepfold-stage' '$target'"
    }
    $activateLines += "printf 'runtime-stage-ok\\n'"
    Invoke-RouterCommand -Command (Join-ShellLines -Lines $activateLines) | Out-Null
    $staged = $true

    if ($AllowConfiguredSecrets) {
        & $runRouterTests -Profile writeSafe -Variant $Variant -AllowConfiguredSecrets
    } else {
        & $runRouterTests -Profile writeSafe -Variant $Variant
    }
} catch {
    $matrixError = $_
} finally {
    if ($staged) {
        try {
            $restoreLines = @('set -eu')
            $restoreFiles = @($runtimeFiles)
            [array]::Reverse($restoreFiles)
            foreach ($name in $restoreFiles) {
                $target = "$runtimeTarget/$name"
                $restoreLines += "if [ -e '$remoteRoot/present/$name' ]; then cp -p '$remoteRoot/backup/$name' '$target.sheepfold-restore'; mv -f '$target.sheepfold-restore' '$target'; else rm -f '$target'; fi"
            }
            foreach ($name in $runtimeFiles) {
                $target = "$runtimeTarget/$name"
                $restoreLines += "if [ -e '$remoteRoot/present/$name' ]; then expected=`$(cat '$remoteRoot/backup/$name.sha256'); actual=`$(sha256sum '$target' | cut -d' ' -f1); [ `"`$actual`" = `"`$expected`" ] || exit 41; else [ ! -e '$target' ] || exit 42; fi"
            }
            $restoreLines += "rm -rf '$remoteRoot'"
            $restoreLines += "printf 'runtime-restore-ok\\n'"
            Invoke-RouterCommand -Command (Join-ShellLines -Lines $restoreLines) | Out-Null
        } catch {
            $restoreError = $_
        }
    } else {
        Invoke-SheepfoldSsh -Config $config -RemoteCommand "rm -rf '$remoteRoot'" -AllowFailure | Out-Null
    }
}

try {
    & $runRouterTests -Profile readOnly -Variant $Variant
} catch {
    $readOnlyError = $_
}

if ($restoreError) {
    throw "Не удалось подтвердить восстановление runtime-файлов.`n$restoreError"
}
if ($readOnlyError) {
    throw "После восстановления не прошла read-only проверка.`n$readOnlyError"
}
if ($matrixError) {
    throw $matrixError
}

Write-Host 'Текущая backend-матрица проверена; исходный runtime роутера восстановлен.'
