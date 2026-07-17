<#
.SYNOPSIS
Готовит и запускает read-only browser smoke-тест настоящей страницы LuCI.

.DESCRIPTION
Сценарий использует установленный Chrome/Edge и компактный playwright-core вместо
скачивания второго браузера. LuCI-пароль читается из DPAPI, передаётся дочернему
процессу только через временное окружение и очищается после теста. Никакие кнопки
сохранения не нажимаются: этот проход проверяет загрузку, верстку и JS-ошибки.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'routerTestCommon.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$config = Get-SheepfoldRouterConfig
$credentialPath = Get-SheepfoldRouterCredentialPath
if (-not (Test-Path -LiteralPath $credentialPath)) {
    throw "Учётные данные LuCI не найдены. Один раз выполните router:setup с явным -RouterHost, -InstallPublicKey и -SaveLuciCredential."
}
$credential = Import-Clixml -LiteralPath $credentialPath
$plainPassword = $credential.GetNetworkCredential().Password

$browserCandidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserPath) {
    throw 'Не найден установленный Google Chrome или Microsoft Edge.'
}

$playwrightRoot = Join-Path $repoRoot 'tools\local\routerFrontend'
$playwrightEntry = Join-Path $playwrightRoot 'node_modules\playwright-core\index.js'
if (-not (Test-Path -LiteralPath $playwrightEntry)) {
    New-Item -ItemType Directory -Force -Path $playwrightRoot | Out-Null
    Write-Host 'Устанавливается компактный playwright-core@1.61.1 без отдельного Chromium...'
    & npm.cmd install --prefix $playwrightRoot playwright-core@1.61.1 --no-save --package-lock=false --ignore-scripts
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $playwrightEntry)) {
        throw 'Не удалось автоматически установить playwright-core.'
    }
}

$runId = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$reportDir = Join-Path $repoRoot ".build\live-router\$runId\frontend"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
# Failure-скриншот может захватить SSID или заполненное поле. Поэтому весь
# browser-отчёт защищается так же строго, как конфигурационный backup роутера.
& icacls.exe $reportDir '/inheritance:r' '/grant:r' "$($env:USERNAME):(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось ограничить ACL каталога с browser-артефактами LuCI.'
}
$portSuffix = if ([int]$config.httpsPort -eq 443) { '' } else { ':' + [string]$config.httpsPort }
$baseUrl = 'https://{0}{1}' -f $config.routerHost, $portSuffix

$previousValues = @{}
foreach ($name in @('SHEEPFOLD_PLAYWRIGHT_ROOT', 'SHEEPFOLD_BROWSER_PATH', 'SHEEPFOLD_LUCI_URL', 'SHEEPFOLD_LUCI_USER', 'SHEEPFOLD_LUCI_PASSWORD', 'SHEEPFOLD_FRONTEND_REPORT_DIR')) {
    $previousValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    $env:SHEEPFOLD_PLAYWRIGHT_ROOT = $playwrightRoot
    $env:SHEEPFOLD_BROWSER_PATH = $browserPath
    $env:SHEEPFOLD_LUCI_URL = $baseUrl + [string]$config.luciPath
    $env:SHEEPFOLD_LUCI_USER = $credential.UserName
    $env:SHEEPFOLD_LUCI_PASSWORD = $plainPassword
    $env:SHEEPFOLD_FRONTEND_REPORT_DIR = $reportDir
    & node (Join-Path $PSScriptRoot 'frontendSmoke.mjs')
    if ($LASTEXITCODE -ne 0) {
        throw "LuCI frontend smoke-тест завершился с ошибкой. Артефакты: $reportDir"
    }
    Write-Host "PASS: LuCI проверен на desktop и mobile. Артефакты: $reportDir"
} finally {
    $plainPassword = $null
    foreach ($name in $previousValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process')
    }
}
