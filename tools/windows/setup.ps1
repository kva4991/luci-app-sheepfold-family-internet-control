[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$AcceptAndroidLicenses,
    [string]$AndroidSdkRoot = (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$manifestPath = Join-Path $repoRoot 'tools\toolchain.json'
$checkScript = Join-Path $PSScriptRoot 'check.ps1'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machinePath, $userPath) | Where-Object { $_ }) -join ';'
}

function Add-UserPathEntry {
    param([string]$Path)

    if (-not $Path) {
        return
    }

    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($current -split ';' | Where-Object { $_ })
    $normalizedPath = $Path.Trim('"').TrimEnd('\')
    $alreadyStored = @($entries | Where-Object {
        $_.Trim('"').TrimEnd('\') -ieq $normalizedPath
    }).Count -gt 0
    if (-not $alreadyStored) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $Path) -join ';'), 'User')
    }

    $storedEntries = @([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_ })
    $stored = @($storedEntries | Where-Object {
        $_.Trim('"').TrimEnd('\') -ieq $normalizedPath
    }).Count -gt 0
    if (-not $stored) {
        throw "Не удалось добавить в пользовательский PATH: $Path"
    }
}

function Set-UserEnvironmentVariable {
    param(
        [string]$Name,
        [string]$Value
    )

    [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
    $stored = [Environment]::GetEnvironmentVariable($Name, 'User')
    if ($stored -ne $Value) {
        throw "Не удалось сохранить пользовательскую переменную $Name."
    }
    Set-Item -Path "Env:$Name" -Value $Value
}

function Get-WorkingCommandVersion {
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

function Test-PackageReady {
    param([object]$Package)

    $arguments = if ($Package.command -eq 'java') { @('-version') } else { @('--version') }
    $command = [string]$Package.command
    if ($command -eq 'java' -and $env:JAVA_HOME) {
        $javaFromHome = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $javaFromHome) {
            $command = $javaFromHome
        }
    }
    $versionText = Get-WorkingCommandVersion -Command $command -Arguments $arguments
    if (-not $versionText) {
        return $false
    }

    $match = [regex]::Match($versionText, '(\d+)(?:\.(\d+))?(?:\.(\d+))?')
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

function Install-WingetPackage {
    param(
        [string]$Name,
        [string]$PackageId
    )

    Write-Host "Устанавливается: $Name ($PackageId)" -ForegroundColor Cyan
    & winget install --id $PackageId --exact --source winget --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        throw "winget не смог установить $Name ($PackageId), код $LASTEXITCODE."
    }
    Refresh-ProcessPath
}

function Find-JavaHome {
    $javaCommand = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCommand) {
        $candidate = Split-Path (Split-Path $javaCommand.Source -Parent) -Parent
        if (Test-Path -LiteralPath (Join-Path $candidate 'bin\javac.exe')) {
            return $candidate
        }
    }

    $adoptiumRoot = Join-Path $env:ProgramFiles 'Eclipse Adoptium'
    $candidate = Get-ChildItem -LiteralPath $adoptiumRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'jdk-17*' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }
    return $null
}

function Get-AndroidCommandLineArchive {
    $repositoryUrl = [string]$manifest.androidSdk.repositoryUrl
    Write-Host 'Читается официальный каталог Android SDK...' -ForegroundColor Cyan
    [xml]$repository = (Invoke-WebRequest -UseBasicParsing -Uri $repositoryUrl).Content
    $package = $repository.SelectSingleNode("//*[local-name()='remotePackage' and @path='cmdline-tools;latest']")
    if (-not $package) {
        throw 'В официальном каталоге Android SDK не найден cmdline-tools;latest.'
    }

    foreach ($archive in $package.SelectNodes(".//*[local-name()='archive']")) {
        $hostNode = $archive.SelectSingleNode(".//*[local-name()='host-os']")
        if (-not $hostNode -or $hostNode.InnerText -ne 'windows') {
            continue
        }

        $complete = $archive.SelectSingleNode("./*[local-name()='complete']")
        $urlNode = $complete.SelectSingleNode("./*[local-name()='url']")
        $checksumNode = $complete.SelectSingleNode("./*[local-name()='checksum']")
        if ($urlNode -and $checksumNode) {
            return [pscustomobject]@{
                FileName = [IO.Path]::GetFileName($urlNode.InnerText)
                Url = ([string]$manifest.androidSdk.archiveBaseUrl) + $urlNode.InnerText
                Checksum = $checksumNode.InnerText.Trim().ToLowerInvariant()
                ChecksumType = $checksumNode.GetAttribute('type').ToUpperInvariant()
            }
        }
    }

    throw 'В официальном каталоге Android SDK не найден Windows-архив command-line tools.'
}

function Install-AndroidCommandLineTools {
    $sdkManager = Join-Path $AndroidSdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
    if (Test-Path -LiteralPath $sdkManager) {
        return $sdkManager
    }

    $archive = Get-AndroidCommandLineArchive
    $cacheRoot = Join-Path $repoRoot 'tools\.cache\android-sdk'
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
    $archivePath = Join-Path $cacheRoot $archive.FileName

    $algorithm = switch ($archive.ChecksumType) {
        'SHA-1' { 'SHA1' }
        'SHA1' { 'SHA1' }
        'SHA-256' { 'SHA256' }
        'SHA256' { 'SHA256' }
        default {
            if ($archive.Checksum.Length -eq 40) { 'SHA1' }
            elseif ($archive.Checksum.Length -eq 64) { 'SHA256' }
            else { throw "Неизвестный формат checksum Android SDK: $($archive.ChecksumType)." }
        }
    }

    $downloadRequired = $true
    if (Test-Path -LiteralPath $archivePath) {
        $downloadRequired = (Get-FileHash -LiteralPath $archivePath -Algorithm $algorithm).Hash.ToLowerInvariant() -ne $archive.Checksum
    }
    if ($downloadRequired) {
        Write-Host "Скачивается $($archive.FileName)..." -ForegroundColor Cyan
        Invoke-WebRequest -UseBasicParsing -Uri $archive.Url -OutFile $archivePath
    }

    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm $algorithm).Hash.ToLowerInvariant()
    if ($actualHash -ne $archive.Checksum) {
        throw "Контрольная сумма Android command-line tools не совпала. Файл оставлен для проверки: $archivePath"
    }

    $extractRoot = Join-Path $cacheRoot ("extract-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
    $extractedTools = Join-Path $extractRoot 'cmdline-tools'
    if (-not (Test-Path -LiteralPath (Join-Path $extractedTools 'bin\sdkmanager.bat'))) {
        throw 'Скачанный Android command-line tools archive имеет неожиданную структуру.'
    }

    $targetParent = Join-Path $AndroidSdkRoot 'cmdline-tools'
    $target = Join-Path $targetParent 'latest'
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    if (Test-Path -LiteralPath $target) {
        $backup = Join-Path $targetParent ("latest.backup-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Move-Item -LiteralPath $target -Destination $backup
        Write-Host "Предыдущие command-line tools сохранены: $backup" -ForegroundColor Yellow
    }
    Move-Item -LiteralPath $extractedTools -Destination $target

    # Удаляем только уникальный временный каталог внутри repository-local cache.
    $resolvedCache = [IO.Path]::GetFullPath($cacheRoot).TrimEnd('\') + '\'
    $resolvedExtract = [IO.Path]::GetFullPath($extractRoot)
    if ($resolvedExtract.StartsWith($resolvedCache, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }

    return $sdkManager
}

if (-not $Install) {
    & $checkScript -AndroidSdkRoot $AndroidSdkRoot
    exit $LASTEXITCODE
}

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget не найден. Установите или обновите Microsoft App Installer, затем повторите команду.'
}

foreach ($package in $manifest.windowsPackages) {
    if (-not (Test-PackageReady -Package $package)) {
        Install-WingetPackage -Name $package.name -PackageId $package.wingetId
    }
    else {
        Write-Host "Уже установлено: $($package.name)" -ForegroundColor DarkGreen
    }
}

foreach ($gitPath in @('C:\Program Files\Git\bin', 'C:\Program Files\Git\usr\bin')) {
    if (Test-Path -LiteralPath $gitPath) {
        Add-UserPathEntry -Path $gitPath
    }
}

Refresh-ProcessPath

# winget-пакеты обычно настраивают PATH сами, но Sheepfold не полагается на это:
# явно закрепляем каталоги реально найденных инструментов без дубликатов.
foreach ($commandName in @('git', 'bash', 'python', 'node', 'gh')) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        Add-UserPathEntry -Path (Split-Path $command.Source -Parent)
    }
}

$javaHome = Find-JavaHome
if (-not $javaHome) {
    throw 'JDK 17 установлен, но JAVA_HOME определить не удалось.'
}
Set-UserEnvironmentVariable -Name 'JAVA_HOME' -Value $javaHome
Add-UserPathEntry -Path (Join-Path $javaHome 'bin')

New-Item -ItemType Directory -Path $AndroidSdkRoot -Force | Out-Null
$sdkManager = Install-AndroidCommandLineTools
Set-UserEnvironmentVariable -Name 'ANDROID_HOME' -Value $AndroidSdkRoot
Set-UserEnvironmentVariable -Name 'ANDROID_SDK_ROOT' -Value $AndroidSdkRoot
foreach ($androidPath in @(
    (Join-Path $AndroidSdkRoot 'platform-tools'),
    (Join-Path $AndroidSdkRoot 'cmdline-tools\latest\bin')
)) {
    Add-UserPathEntry -Path $androidPath
    if ($env:Path -notlike "*$androidPath*") {
        $env:Path += ";$androidPath"
    }
}

Refresh-ProcessPath

if (-not $AcceptAndroidLicenses) {
    Write-Host ''
    Write-Host 'Android command-line tools готовы, но лицензии и SDK-компоненты не устанавливались.' -ForegroundColor Yellow
    Write-Host 'Прочитайте лицензию Google и повторите команду с -AcceptAndroidLicenses.' -ForegroundColor Yellow
    exit 2
}

Write-Host 'Открывается стандартное принятие лицензий Android SDK...' -ForegroundColor Cyan
1..100 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$AndroidSdkRoot" --licenses
if ($LASTEXITCODE -ne 0) {
    throw "sdkmanager --licenses завершился с кодом $LASTEXITCODE."
}

$androidPackages = @($manifest.androidSdk.packages | ForEach-Object { [string]$_ })
Write-Host "Устанавливаются Android SDK-компоненты: $($androidPackages -join ', ')" -ForegroundColor Cyan
& $sdkManager "--sdk_root=$AndroidSdkRoot" @androidPackages
if ($LASTEXITCODE -ne 0) {
    throw "sdkmanager завершился с кодом $LASTEXITCODE."
}

Refresh-ProcessPath
Write-Host ''
Write-Host 'Установка завершена. Для надёжного обновления PATH откройте новый PowerShell/Codex shell.' -ForegroundColor Green
& $checkScript -AndroidSdkRoot $AndroidSdkRoot
