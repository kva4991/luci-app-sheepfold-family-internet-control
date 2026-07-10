param(
    [string]$OutDir,
    [string]$DownloadsDir = $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'Downloads' } else { 'C:\Users\User\Downloads' }),
    [switch]$NoDownloadsCopy
)

$ErrorActionPreference = 'Stop'

function Test-PythonCommand([string]$Command, [string[]]$VersionArgs) {
    $candidate = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $candidate) {
        return $null
    }

    try {
        & $candidate.Source @VersionArgs *> $null
        if ($LASTEXITCODE -eq 0) {
            return @{ Path = $candidate.Source; PrefixArgs = @() }
        }
    }
    catch {
        return $null
    }

    return $null
}

$python = Test-PythonCommand 'python' @('--version')
if (-not $python) {
    $candidate = Get-Command py -ErrorAction SilentlyContinue
    if ($candidate) {
        try {
            & $candidate.Source -3 --version *> $null
            if ($LASTEXITCODE -eq 0) {
                $python = @{ Path = $candidate.Source; PrefixArgs = @('-3') }
            }
        }
        catch {
            $python = $null
        }
    }
}
if (-not $python -and $env:USERPROFILE) {
    $codexPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $codexPython) {
        & $codexPython --version *> $null
        if ($LASTEXITCODE -eq 0) {
            $python = @{ Path = $codexPython; PrefixArgs = @() }
        }
    }
}
if (-not $python) {
    throw 'Python is required for Windows .ipk test builds because Windows tar cannot set Unix executable modes.'
}

$argsList = @((Join-Path $PSScriptRoot 'build-test-ipk.py'))
if ($OutDir) {
    $argsList += @('--out-dir', $OutDir)
}
if ($DownloadsDir) {
    $argsList += @('--downloads-dir', $DownloadsDir)
}
if ($NoDownloadsCopy) {
    $argsList += '--no-downloads-copy'
}

& $python.Path @($python.PrefixArgs + $argsList)
