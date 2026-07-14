[CmdletBinding()]
param(
    [string]$AndroidSdkRoot = (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$manifestPath = Join-Path $repoRoot 'tools\toolchain.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$results = [System.Collections.Generic.List[object]]::new()

function Add-ToolResult {
    param(
        [string]$Name,
        [bool]$Required,
        [bool]$Ready,
        [string]$Details
    )

    $results.Add([pscustomobject]@{
        Status = if ($Ready) { 'OK' } elseif ($Required) { 'MISSING' } else { 'OPTIONAL' }
        Tool = $Name
        Details = $Details
        Required = $Required
        Ready = $Ready
    })
}

function Get-CommandVersion {
    param(
        [string]$Command,
        [string[]]$Arguments = @('--version')
    )

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        return $null
    }

    try {
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $output = & $Command @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorAction
        if ($exitCode -ne 0) {
            return $null
        }
        return (($output | Select-Object -First 1) -as [string]).Trim()
    }
    catch {
        $ErrorActionPreference = $previousErrorAction
        return $null
    }
}

function Test-PackageVersion {
    param(
        [object]$Package,
        [string]$VersionText
    )

    if (-not $VersionText) {
        return $false
    }

    $match = [regex]::Match($VersionText, '(\d+)(?:\.(\d+))?(?:\.(\d+))?')
    if (-not $match.Success) {
        return -not ($Package.minimumVersion -or $Package.requiredMajorVersion)
    }

    $major = [int]$match.Groups[1].Value
    $minor = if ($match.Groups[2].Success) { [int]$match.Groups[2].Value } else { 0 }
    $patch = if ($match.Groups[3].Success) { [int]$match.Groups[3].Value } else { 0 }
    $actual = [version]::new($major, $minor, $patch)
    if ($Package.requiredMajorVersion -and $major -ne [int]$Package.requiredMajorVersion) {
        return $false
    }
    if ($Package.minimumVersion -and $actual -lt [version]$Package.minimumVersion) {
        return $false
    }
    return $true
}

foreach ($package in $manifest.windowsPackages) {
    $arguments = if ($package.command -eq 'java') { @('-version') } else { @('--version') }
    $command = [string]$package.command
    if ($command -eq 'java' -and $env:JAVA_HOME) {
        $javaFromHome = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $javaFromHome) {
            $command = $javaFromHome
        }
    }
    $version = Get-CommandVersion -Command $command -Arguments $arguments
    $ready = Test-PackageVersion -Package $package -VersionText $version
    Add-ToolResult -Name $package.name -Required ([bool]$package.required) -Ready $ready -Details $(
        if ($ready) { $version }
        elseif ($version) { "Неподходящая версия: $version" }
        else { "Команда $($package.command) не работает" }
    )
}

$bashVersion = Get-CommandVersion -Command 'bash'
Add-ToolResult -Name 'Git Bash' -Required $true -Ready ($null -ne $bashVersion) -Details $(
    if ($bashVersion) { $bashVersion } else { 'bash не найден в PATH' }
)

$androidChecks = @(
    @{ Name = 'Android sdkmanager'; Path = (Join-Path $AndroidSdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat') },
    @{ Name = 'Android Platform Tools'; Path = (Join-Path $AndroidSdkRoot 'platform-tools\adb.exe') },
    @{ Name = 'Android Platform 35'; Path = (Join-Path $AndroidSdkRoot 'platforms\android-35\android.jar') },
    @{ Name = 'Android Build Tools 35.0.0'; Path = (Join-Path $AndroidSdkRoot 'build-tools\35.0.0\aapt2.exe') }
)

foreach ($check in $androidChecks) {
    Add-ToolResult -Name $check.Name -Required $true -Ready (Test-Path -LiteralPath $check.Path) -Details $check.Path
}

foreach ($project in @('android', 'android-child')) {
    $wrapper = Join-Path $repoRoot "$project\gradlew.bat"
    $properties = Join-Path $repoRoot "$project\gradle\wrapper\gradle-wrapper.properties"
    $ready = (Test-Path -LiteralPath $wrapper) -and (Test-Path -LiteralPath $properties)
    Add-ToolResult -Name "Gradle Wrapper: $project" -Required $true -Ready $ready -Details $wrapper
}

Write-Host ''
Write-Host 'Sheepfold Windows toolchain' -ForegroundColor Cyan
$results | Select-Object Status, Tool, Details | Format-Table -AutoSize -Wrap

$requiredFailures = @($results | Where-Object { $_.Required -and -not $_.Ready })
if ($requiredFailures.Count -gt 0) {
    Write-Host "Не готово обязательных компонентов: $($requiredFailures.Count)." -ForegroundColor Red
    Write-Host 'Запустите tools\windows\setup.ps1 -Install -AcceptAndroidLicenses' -ForegroundColor Yellow
    exit 1
}

Write-Host 'Окружение готово к сборке Sheepfold.' -ForegroundColor Green
