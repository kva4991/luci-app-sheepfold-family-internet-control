# Этот ручной runner создаёт отдельный локальный clone зафиксированного commit и
# запускает только detection-стадии VVAH. Он не исправляет код, не работает с
# незакоммиченными изменениями и передаёт исходники LLM только после явного согласия.
# Результат доказывает лишь наличие кандидатов для ручного security review. §secaudit1
[CmdletBinding()]
param(
    [string]$RepoPath = '',
    [string]$ScratchRoot = '',
    [string]$ApplicationId = 'sheepfold',
    [switch]$RunScan,
    [switch]$ConfirmSourceUpload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$CommandArguments,

        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    & $FilePath @CommandArguments 2>&1 | Tee-Object -FilePath $LogPath
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Command failed with exit code $exitCode. See $LogPath"
    }
}

function Save-AuditManifest {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.IDictionary]$Manifest,

        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $Manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding UTF8
}

if ($RunScan -and -not $ConfirmSourceUpload) {
    throw 'Use -ConfirmSourceUpload together with -RunScan after reviewing the configured LLM provider and its data policy.'
}

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    $RepoPath = Join-Path $PSScriptRoot '..\..'
}
$resolvedRepoPath = (Resolve-Path -LiteralPath $RepoPath).Path

if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepoPath '.git'))) {
    throw "RepoPath is not a Git checkout: $resolvedRepoPath"
}

if ([string]::IsNullOrWhiteSpace($ScratchRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT)) {
        $ScratchRoot = $env:SHEEPFOLD_SCRIPT_SCRATCH_ROOT
    }
    else {
        $ScratchRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'pesochnica'
    }
}
$resolvedScratchRoot = [IO.Path]::GetFullPath($ScratchRoot)
$repoPrefix = $resolvedRepoPath.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (
    $resolvedScratchRoot.Equals($resolvedRepoPath, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedScratchRoot.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)
) {
    throw 'ScratchRoot must be outside the source repository.'
}

$gitCommand = (Get-Command git -ErrorAction Stop).Source
$vvaharnessCommand = (Get-Command vvaharness -ErrorAction Stop).Source

$dirtyLines = @(& $gitCommand -C $resolvedRepoPath status --porcelain=v1)
if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect the source repository.'
}
if ($dirtyLines.Count -gt 0) {
    throw 'The source repository has uncommitted changes. Commit them first so the audited revision is unambiguous.'
}

$sourceCommit = (& $gitCommand -C $resolvedRepoPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($sourceCommit)) {
    throw 'Could not resolve the source commit.'
}
$sourceBranch = (& $gitCommand -C $resolvedRepoPath branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Could not resolve the source branch.'
}

$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$shortCommit = $sourceCommit.Substring(0, 8)
$auditRoot = Join-Path $resolvedScratchRoot "sheepfold-security-audit\$timestamp-$shortCommit-$PID"
$scanRepoPath = Join-Path $auditRoot 'source'
$gitMetadataPath = Join-Path $auditRoot 'source-git-metadata'
$manifestPath = Join-Path $auditRoot 'sheepfold-audit-manifest.json'

New-Item -ItemType Directory -Force -Path $auditRoot | Out-Null

$manifest = [ordered]@{
    schemaVersion = 1
    status = 'preparing'
    mode = if ($RunScan) { 'detection-only' } else { 'estimate-only' }
    sourceCommit = $sourceCommit
    sourceBranch = $sourceBranch
    sourceWasClean = $true
    applicationId = $ApplicationId
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    runner = 'tools/security/runVvaharnessAudit.ps1'
    harnessCommand = $vvaharnessCommand
    stopAfter = 's9'
    autoRemediation = $false
    sourceUploadConfirmed = [bool]$ConfirmSourceUpload
    auditRoot = $auditRoot
    scanRepo = $scanRepoPath
    gitMetadata = $gitMetadataPath
    artifacts = [ordered]@{
        doctorLog = (Join-Path $auditRoot 'doctor.log')
        estimateLog = (Join-Path $auditRoot 'estimate.log')
        scanLog = (Join-Path $auditRoot 'scan.log')
        scannerManifest = (Join-Path $auditRoot 'run_manifest.json')
        reportDirectory = (Join-Path $scanRepoPath 'security-scan')
    }
}
Save-AuditManifest -Manifest $manifest -Path $manifestPath

try {
    Invoke-LoggedCommand -FilePath $gitCommand -CommandArguments @(
        'clone',
        '--local',
        '--no-hardlinks',
        '--no-checkout',
        $resolvedRepoPath,
        $scanRepoPath
    ) -LogPath (Join-Path $auditRoot 'clone.log')

    Invoke-LoggedCommand -FilePath $gitCommand -CommandArguments @(
        '-C',
        $scanRepoPath,
        'checkout',
        '--detach',
        $sourceCommit
    ) -LogPath (Join-Path $auditRoot 'checkout.log')

    # История Git не нужна модели и может содержать удалённые ранее чувствительные данные
    Move-Item -LiteralPath (Join-Path $scanRepoPath '.git') -Destination $gitMetadataPath

    $manifest['status'] = 'checking-backend'
    Save-AuditManifest -Manifest $manifest -Path $manifestPath
    Invoke-LoggedCommand -FilePath $vvaharnessCommand -CommandArguments @(
        'doctor'
    ) -LogPath $manifest['artifacts']['doctorLog']

    $manifest['status'] = 'estimating'
    Save-AuditManifest -Manifest $manifest -Path $manifestPath
    Invoke-LoggedCommand -FilePath $vvaharnessCommand -CommandArguments @(
        'estimate',
        '--repo',
        $scanRepoPath
    ) -LogPath $manifest['artifacts']['estimateLog']

    if (-not $RunScan) {
        $manifest['status'] = 'estimated'
        $manifest['finishedAtUtc'] = [DateTime]::UtcNow.ToString('o')
        Save-AuditManifest -Manifest $manifest -Path $manifestPath
        Write-Host "Estimate completed without sending source code for analysis: $auditRoot"
        Write-Host 'Run again with -RunScan -ConfirmSourceUpload only after reviewing the provider and estimate.'
        return
    }

    $manifest['status'] = 'scanning'
    Save-AuditManifest -Manifest $manifest -Path $manifestPath

    Push-Location $auditRoot
    try {
        Invoke-LoggedCommand -FilePath $vvaharnessCommand -CommandArguments @(
            'scan',
            '--repo',
            $scanRepoPath,
            '--application-id',
            $ApplicationId,
            '--no-auto-step1',
            '--stop-after',
            's9'
        ) -LogPath $manifest['artifacts']['scanLog']
    }
    finally {
        Pop-Location
    }

    $manifest['status'] = 'completed'
    $manifest['finishedAtUtc'] = [DateTime]::UtcNow.ToString('o')
    Save-AuditManifest -Manifest $manifest -Path $manifestPath
    Write-Host "Detection-only security audit completed: $auditRoot"
}
catch {
    $manifest['status'] = 'failed'
    $manifest['finishedAtUtc'] = [DateTime]::UtcNow.ToString('o')
    $manifest['error'] = $_.Exception.Message
    Save-AuditManifest -Manifest $manifest -Path $manifestPath
    throw
}
