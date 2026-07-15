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

function Add-ProcessPathEntry {
    param(
        [string]$Path,
        [switch]$Prepend
    )

    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
        return
    }

    $entries = @($env:Path -split ';' | Where-Object { $_ })
    $normalizedPath = $Path.Trim('"').TrimEnd('\')
    $exists = @($entries | Where-Object {
        $_.Trim('"').TrimEnd('\') -ieq $normalizedPath
    }).Count -gt 0
    if (-not $exists) {
        $env:Path = if ($Prepend) {
            (@($Path, $env:Path) | Where-Object { $_ }) -join ';'
        }
        else {
            (@($env:Path, $Path) | Where-Object { $_ }) -join ';'
        }
    }
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machinePath, $userPath) | Where-Object { $_ }) -join ';'
}

function Find-WingetCommand {
    $command = Get-Command winget -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    # Codex и некоторые старые PowerShell-сессии не наследуют WindowsApps в PATH,
    # хотя App Installer и winget у пользователя уже установлены. §toolwin
    $appInstaller = if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        Get-AppxPackage -Name Microsoft.DesktopAppInstaller -ErrorAction SilentlyContinue |
            Sort-Object Version -Descending |
            Select-Object -First 1
    }
    else { $null }
    if ($appInstaller) {
        $candidate = Join-Path $appInstaller.InstallLocation 'winget.exe'
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    return $null
}

function Add-KnownToolPathsToProcess {
    foreach ($knownPath in @(
        'C:\Program Files\Git\cmd',
        'C:\Program Files\Git\bin',
        'C:\Program Files\Git\usr\bin',
        'C:\Program Files\nodejs'
    )) {
        Add-ProcessPathEntry -Path $knownPath
    }

    $pythonCandidates = @(
        foreach ($root in @(
            (Join-Path $env:LOCALAPPDATA 'Programs\Python'),
            $env:ProgramFiles
        )) {
            Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like 'Python*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'python.exe')) }
        }
    )
    $pythonCandidate = $pythonCandidates |
        Sort-Object Name, LastWriteTime -Descending |
        Select-Object -First 1
    if ($pythonCandidate) {
        # Добавляем только одну наиболее новую установку: несколько Prepend развернут приоритет версий. §toolwin
        Add-ProcessPathEntry -Path (Join-Path $pythonCandidate.FullName 'Scripts') -Prepend
        Add-ProcessPathEntry -Path $pythonCandidate.FullName -Prepend
    }

    foreach ($root in @(
        (Join-Path $env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path $env:ProgramFiles 'Java')
    )) {
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'jdk-17*' } |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Add-ProcessPathEntry -Path (Join-Path $_.FullName 'bin') }
    }

    if ($env:JAVA_HOME) {
        Add-ProcessPathEntry -Path (Join-Path $env:JAVA_HOME 'bin')
    }

    Add-ProcessPathEntry -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps')
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

function Save-UrlWithProgress {
    param(
        [string]$Uri,
        [string]$OutFile,
        [string]$Label
    )

    Add-Type -AssemblyName System.Net.Http
    Write-Host "URL загрузки: $Uri" -ForegroundColor DarkGray
    $tempFile = "$OutFile.download"
    Write-Host "Файл будет сохранён: $OutFile" -ForegroundColor DarkGray
    Write-Host "Временный файл загрузки: $tempFile" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $tempFile) {
        Remove-Item -LiteralPath $tempFile -Force
    }

    $client = [System.Net.Http.HttpClient]::new()
    $inputStream = $null
    $outputStream = $null
    try {
        $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode() | Out-Null
        $totalBytes = $response.Content.Headers.ContentLength
        if ($totalBytes) {
            Write-Host ("Размер загрузки: {0:N1} MB" -f ($totalBytes / 1MB)) -ForegroundColor DarkGray
        }

        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [System.IO.File]::Open($tempFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $buffer = New-Object byte[] 1048576
        $downloadedBytes = [int64]0
        $startedAt = Get-Date
        $lastLineAt = $startedAt

        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $outputStream.Write($buffer, 0, $read)
            $downloadedBytes += $read
            $elapsed = [Math]::Max(((Get-Date) - $startedAt).TotalSeconds, 1)
            $speed = ($downloadedBytes / 1MB) / $elapsed
            $status = if ($totalBytes) {
                "{0:N1}/{1:N1} MB, {2:N1} MB/s" -f ($downloadedBytes / 1MB), ($totalBytes / 1MB), $speed
            }
            else {
                "{0:N1} MB, {1:N1} MB/s" -f ($downloadedBytes / 1MB), $speed
            }
            $percent = if ($totalBytes) { [Math]::Min(100, [int](($downloadedBytes * 100) / $totalBytes)) } else { 0 }
            Write-Progress -Activity $Label -Status $status -PercentComplete $percent

            if (((Get-Date) - $lastLineAt).TotalSeconds -ge 5) {
                Write-Host "Загрузка продолжается: $status" -ForegroundColor DarkGray
                $lastLineAt = Get-Date
            }
        }

        Write-Progress -Activity $Label -Completed
        $outputStream.Close()
        $outputStream = $null
        Move-Item -LiteralPath $tempFile -Destination $OutFile -Force
        Write-Host ("Скачано: {0:N1} MB" -f ($downloadedBytes / 1MB)) -ForegroundColor Green
    }
    finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        $client.Dispose()
    }
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
        return (($output | Where-Object { $_ -as [string] } | Select-Object -First 1) -as [string]).Trim()
    }
    catch {
        $ErrorActionPreference = $previousErrorAction
        return $null
    }
}

function Test-PackageReady {
    param([object]$Package)

    $arguments = if ($Package.versionArguments) {
        @($Package.versionArguments | ForEach-Object { [string]$_ })
    }
    elseif ($Package.command -eq 'java') { @('-version') }
    else { @('--version') }
    $command = [string]$Package.command
    $resolvedCommand = Get-Command $command -ErrorAction SilentlyContinue
    if ($resolvedCommand -and $Package.disallowedPathFragments) {
        foreach ($fragment in $Package.disallowedPathFragments) {
            if ($resolvedCommand.Source.IndexOf([string]$fragment, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                return $false
            }
        }
    }
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

    $maxAttempts = 5
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Host "Устанавливается: $Name ($PackageId), попытка $attempt из $maxAttempts" -ForegroundColor Cyan
        Write-Host "winget package id: $PackageId" -ForegroundColor DarkGray
        & $script:WingetCommand install --id $PackageId --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
        if ($LASTEXITCODE -eq 0) {
            Refresh-ProcessPath
            Add-KnownToolPathsToProcess
            return
        }

        $exitCode = $LASTEXITCODE
        if ($attempt -lt $maxAttempts) {
            Write-Host "winget вернул код $exitCode. Это часто временный сетевой сбой; повтор через 10 секунд..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
            continue
        }

        throw "winget не смог установить $Name ($PackageId), код $exitCode. Проверьте сеть и повторите команду: tools\windows\setup.ps1 -Install -AcceptAndroidLicenses"
    }
}

function Test-RunningAsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Winget {
    Refresh-ProcessPath
    Add-KnownToolPathsToProcess
    $script:WingetCommand = Find-WingetCommand
    if ($script:WingetCommand) {
        return
    }

    Write-Host 'winget не найден. Пробую установить Windows Package Manager без Microsoft Store...' -ForegroundColor Yellow
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Install-PackageProvider -Name NuGet -Force -Scope CurrentUser | Out-Null
        Install-Module -Name Microsoft.WinGet.Client -Force -Repository PSGallery -Scope CurrentUser -AllowClobber
        Import-Module Microsoft.WinGet.Client -Force

        if (Test-RunningAsAdministrator) {
            Repair-WinGetPackageManager -AllUsers
        }
        else {
            Repair-WinGetPackageManager
        }
    }
    catch {
        throw "Не удалось автоматически установить winget без Microsoft Store: $($_.Exception.Message). Запустите PowerShell от администратора и повторите setup.ps1."
    }

    Refresh-ProcessPath
    Add-KnownToolPathsToProcess
    $script:WingetCommand = Find-WingetCommand
    if (-not $script:WingetCommand) {
        throw 'winget установлен или восстановлен, но текущий процесс его не видит. Откройте новый PowerShell и повторите setup.ps1.'
    }
}

function Test-Java17Home {
    param([string]$Home)

    if (-not $Home) {
        return $false
    }
    $java = Join-Path $Home 'bin\java.exe'
    $javac = Join-Path $Home 'bin\javac.exe'
    if (-not (Test-Path -LiteralPath $java) -or -not (Test-Path -LiteralPath $javac)) {
        return $false
    }
    $versionText = Get-WorkingCommandVersion -Command $java -Arguments @('-version')
    return $versionText -match 'version\s+"17(?:\.|\")'
}

function Find-JavaHome {
    $javaCommand = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCommand) {
        $candidate = Split-Path (Split-Path $javaCommand.Source -Parent) -Parent
        if (Test-Java17Home -Home $candidate) {
            return $candidate
        }
    }

    $adoptiumRoot = Join-Path $env:ProgramFiles 'Eclipse Adoptium'
    $candidate = Get-ChildItem -LiteralPath $adoptiumRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'jdk-17*' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($candidate -and (Test-Java17Home -Home $candidate.FullName)) {
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
        Write-Host "Android command-line tools уже установлены: $sdkManager" -ForegroundColor DarkGreen
        return $sdkManager
    }

    $cacheRoot = Join-Path $repoRoot 'tools\.cache\android-sdk'
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
    $cachedArchives = @(Get-ChildItem -LiteralPath $cacheRoot -Filter 'commandlinetools-win-*_latest.zip' -File -ErrorAction SilentlyContinue)
    if ($cachedArchives.Count -gt 0) {
        Write-Host 'Найдены локальные Android command-line tools archives:' -ForegroundColor DarkGray
        foreach ($cached in $cachedArchives) {
            Write-Host ("  {0} ({1:N1} MB)" -f $cached.FullName, ($cached.Length / 1MB)) -ForegroundColor DarkGray
        }
    }
    else {
        Write-Host "Локальный cache Android command-line tools пуст: $cacheRoot" -ForegroundColor DarkGray
    }

    $archive = Get-AndroidCommandLineArchive
    Write-Host "Официальный Android command-line tools archive: $($archive.FileName)" -ForegroundColor DarkGray
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
        Write-Host "Проверяется локальный файл: $archivePath" -ForegroundColor DarkGray
        $localHash = (Get-FileHash -LiteralPath $archivePath -Algorithm $algorithm).Hash.ToLowerInvariant()
        $downloadRequired = $localHash -ne $archive.Checksum
        if ($downloadRequired) {
            Write-Host "Локальный файл найден, но checksum не совпал; файл будет скачан заново." -ForegroundColor Yellow
        }
        else {
            Write-Host "Локальный файл прошёл checksum; скачивание не требуется." -ForegroundColor DarkGreen
        }
    }
    if ($downloadRequired) {
        Write-Host "Скачивается $($archive.FileName)..." -ForegroundColor Cyan
        Save-UrlWithProgress -Uri $archive.Url -OutFile $archivePath -Label "Android command-line tools"
    }

    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm $algorithm).Hash.ToLowerInvariant()
    if ($actualHash -ne $archive.Checksum) {
        throw "Контрольная сумма Android command-line tools не совпала. Файл оставлен для проверки: $archivePath"
    }

    # Windows PowerShell 5 Expand-Archive ломается на некоторых каталогах Android ZIP.
    # Распаковываем через .NET и в короткий TEMP-путь: это также снижает риск MAX_PATH. §zipps51
    $extractBase = Join-Path ([IO.Path]::GetTempPath()) 'sheepfold-android-sdk'
    $extractRoot = Join-Path $extractBase ([Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $extractRoot)
    }
    catch {
        throw "Не удалось распаковать Android command-line tools. Временные файлы оставлены для диагностики: $extractRoot. $($_.Exception.Message)"
    }
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

    # Удаляем только уникальный временный каталог внутри выделенного TEMP-каталога.
    $resolvedExtractBase = [IO.Path]::GetFullPath($extractBase).TrimEnd('\') + '\'
    $resolvedExtract = [IO.Path]::GetFullPath($extractRoot)
    if ($resolvedExtract.StartsWith($resolvedExtractBase, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }

    return $sdkManager
}

function Test-AndroidSdkPackageReady {
    param([string]$Package)

    switch -Wildcard ($Package) {
        'platform-tools' { return (Test-Path -LiteralPath (Join-Path $AndroidSdkRoot 'platform-tools\adb.exe')) }
        'platforms;android-*' {
            $api = $Package.Split(';')[-1]
            return (Test-Path -LiteralPath (Join-Path $AndroidSdkRoot "platforms\$api\android.jar"))
        }
        'build-tools;*' {
            $version = $Package.Split(';')[-1]
            return (Test-Path -LiteralPath (Join-Path $AndroidSdkRoot "build-tools\$version\aapt2.exe"))
        }
        default { return $true }
    }
}

function Test-AndroidSdkPackagesReady {
    foreach ($package in @($manifest.androidSdk.packages | ForEach-Object { [string]$_ })) {
        if (-not (Test-AndroidSdkPackageReady -Package $package)) {
            return $false
        }
    }
    return $true
}

function Assert-SafeAndroidSdkRoot {
    $resolvedRoot = [IO.Path]::GetFullPath($AndroidSdkRoot).TrimEnd('\')
    $driveRoot = [IO.Path]::GetPathRoot($resolvedRoot).TrimEnd('\')
    if (-not $resolvedRoot -or $resolvedRoot -ieq $driveRoot) {
        throw "AndroidSdkRoot не может быть корнем диска: $AndroidSdkRoot"
    }
}

function Remove-AndroidSdkPathSafely {
    param([string]$Path)

    $resolvedRoot = [IO.Path]::GetFullPath($AndroidSdkRoot).TrimEnd('\') + '\'
    $resolvedTarget = [IO.Path]::GetFullPath($Path)
    if (-not $resolvedTarget.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Отказ от удаления пути за пределами Android SDK: $resolvedTarget"
    }
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

function Clear-AndroidSdkPartialPackage {
    param([string]$Package)

    $targets = @()
    switch -Wildcard ($Package) {
        'platform-tools' {
            $targets += (Join-Path $AndroidSdkRoot 'platform-tools')
        }
        'platforms;android-*' {
            $api = $Package.Split(';')[-1]
            $targets += (Join-Path $AndroidSdkRoot "platforms\$api")
        }
        'build-tools;*' {
            $version = $Package.Split(';')[-1]
            $targets += (Join-Path $AndroidSdkRoot "build-tools\$version")
        }
    }

    foreach ($target in $targets) {
        if (Test-Path -LiteralPath $target) {
            Write-Host "Удаляется неполная установка Android SDK: $target" -ForegroundColor Yellow
            Remove-AndroidSdkPathSafely -Path $target
        }
    }
}

function Clear-AndroidSdkTransientFiles {
    foreach ($pattern in @('*.tmp', '*.download', '*.partial')) {
        Get-ChildItem -LiteralPath $AndroidSdkRoot -Recurse -Force -Filter $pattern -ErrorAction SilentlyContinue |
            ForEach-Object {
                Write-Host "Удаляется временный файл Android SDK: $($_.FullName)" -ForegroundColor DarkGray
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
            }
    }
}

function Install-AndroidSdkPackages {
    param([string]$SdkManager)

    $androidPackages = @($manifest.androidSdk.packages | ForEach-Object { [string]$_ })
    if (Test-AndroidSdkPackagesReady) {
        Write-Host 'Android SDK-компоненты уже установлены; установка не требуется.' -ForegroundColor DarkGreen
        return
    }

    $maxAttempts = 5
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Host "Устанавливаются Android SDK-компоненты: $($androidPackages -join ', '), попытка $attempt из $maxAttempts" -ForegroundColor Cyan
        & $SdkManager "--sdk_root=$AndroidSdkRoot" @androidPackages
        if ($LASTEXITCODE -eq 0 -and (Test-AndroidSdkPackagesReady)) {
            return
        }

        $exitCode = $LASTEXITCODE
        if ($attempt -lt $maxAttempts) {
            Write-Host "sdkmanager завершился с кодом $exitCode или оставил неполную установку. Очищаю частичные файлы и повторяю..." -ForegroundColor Yellow
            foreach ($package in $androidPackages) {
                # Исправные SDK-компоненты не удаляем из-за сбоя загрузки одного соседнего пакета. §toolwin
                if (-not (Test-AndroidSdkPackageReady -Package $package)) {
                    Clear-AndroidSdkPartialPackage -Package $package
                }
            }
            Clear-AndroidSdkTransientFiles
            Start-Sleep -Seconds 10
            continue
        }

        throw "sdkmanager завершился с кодом $exitCode после $maxAttempts попыток."
    }
}

function Get-GradleWrapperDistributionUrl {
    param([string]$PropertiesPath)

    $line = Get-Content -LiteralPath $PropertiesPath -Encoding UTF8 |
        Where-Object { $_ -like 'distributionUrl=*' } |
        Select-Object -First 1
    if (-not $line) {
        throw "В Gradle Wrapper properties не найден distributionUrl: $PropertiesPath"
    }

    return $line.Substring('distributionUrl='.Length).Replace('\:', ':')
}

function Warm-GradleWrappers {
    $gradleCache = Join-Path $env:USERPROFILE '.gradle\wrapper\dists'
    $maxAttempts = 5

    foreach ($project in @('android', 'android-child')) {
        $projectRoot = Join-Path $repoRoot $project
        $wrapper = Join-Path $projectRoot 'gradlew.bat'
        $properties = Join-Path $projectRoot 'gradle\wrapper\gradle-wrapper.properties'
        if (-not (Test-Path -LiteralPath $wrapper)) {
            throw "Gradle Wrapper не найден: $wrapper"
        }
        if (-not (Test-Path -LiteralPath $properties)) {
            throw "Gradle Wrapper properties не найден: $properties"
        }

        $distributionUrl = Get-GradleWrapperDistributionUrl -PropertiesPath $properties
        Write-Host "Прогревается Gradle Wrapper: $project" -ForegroundColor Cyan
        Write-Host "Gradle wrapper: $wrapper" -ForegroundColor DarkGray
        Write-Host "Gradle project dir: $projectRoot" -ForegroundColor DarkGray
        Write-Host "Gradle distribution URL: $distributionUrl" -ForegroundColor DarkGray
        Write-Host "Gradle cache dir: $gradleCache" -ForegroundColor DarkGray

        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            Write-Host "Проверяется/скачивается Gradle через wrapper, попытка $attempt из $maxAttempts" -ForegroundColor Cyan
            & $wrapper -p $projectRoot --version
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Gradle Wrapper готов: $project" -ForegroundColor DarkGreen
                break
            }

            $exitCode = $LASTEXITCODE
            if ($attempt -lt $maxAttempts) {
                Write-Host "Gradle Wrapper завершился с кодом $exitCode. Повтор через 10 секунд..." -ForegroundColor Yellow
                Start-Sleep -Seconds 10
                continue
            }

            throw "Gradle Wrapper для $project завершился с кодом $exitCode после $maxAttempts попыток."
        }
    }
}

if (-not $Install) {
    & $checkScript -AndroidSdkRoot $AndroidSdkRoot
    exit $LASTEXITCODE
}

Ensure-Winget

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

foreach ($toolPath in @(
    (Join-Path $env:ProgramFiles '7-Zip'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps')
)) {
    if (Test-Path -LiteralPath $toolPath) {
        Add-UserPathEntry -Path $toolPath
    }
}

Refresh-ProcessPath
Add-KnownToolPathsToProcess

# winget-пакеты обычно настраивают PATH сами, но Sheepfold не полагается на это:
# явно закрепляем каталоги реально найденных инструментов без дубликатов.
foreach ($commandName in @('git', 'bash', 'python', 'node', 'gh', '7z', 'rg')) {
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

Assert-SafeAndroidSdkRoot
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

Install-AndroidSdkPackages -SdkManager $sdkManager
Warm-GradleWrappers

Refresh-ProcessPath
Write-Host ''
Write-Host 'Установка завершена. Для надёжного обновления PATH откройте новый PowerShell/Codex shell.' -ForegroundColor Green
& $checkScript -AndroidSdkRoot $AndroidSdkRoot
