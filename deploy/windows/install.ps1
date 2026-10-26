# ============================================================================
#  TachTach Screens - install / repair on a Windows 10/11 PC
# ============================================================================
#  Run in PowerShell AS ADMINISTRATOR (see docs/windows/SETUP.md):
#
#    powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\install.ps1
#
#  First time, before the code is on the PC, download just this file and run it; it clones
#  the code into C:\TachTach itself. Safe to run again at any time ("repair"): every step
#  checks first and only changes what is missing or wrong. It never deletes your data and
#  never re-runs the first-time setup once a login exists.
#
#  What it does:
#    1. checks: administrator, 64-bit Windows 10 1809+ / 11, folder not in OneDrive, no spaces
#    2. Node.js LTS (22 or newer) and Git, through winget if missing
#    3. gets the code into C:\TachTach (git clone), npm ci, npm run build, checks sharp + bcrypt load
#    4. PDF tool (poppler) if it can, and the .env settings file
#    5. folder permissions: the server account can write ONLY C:\TachTach\data
#    6. Windows Firewall rule (LAN / Private networks only), power settings (never sleep, screen
#       always on), Edge kiosk policies (no first-run, translate, password pop-ups)
#    7. four scheduled tasks: TachTach Server (LOCAL SERVICE), TachTach Kiosk (the screen's
#       Windows account, at sign-in), TachTach Update (SYSTEM, update button), TachTach Update
#       Worker (NETWORK SERVICE, git + npm for updates)
#    8. first-time admin password (node setup.js) if there is no login yet
#    9. starts the server and checks it answers
#  Log: C:\ProgramData\TachTach\logs\install\install-<time>.log  (send it if anything fails)
# ============================================================================

[CmdletBinding()]
param(
    [string]$InstallDir = 'C:\TachTach',
    [string]$RepoUrl = 'https://github.com/szv770/tachtach-screens.git',
    [string]$Branch = 'main',
    # The Windows account that signs in automatically and shows the TV. Asked for when not given.
    [string]$KioskUser = '',
    [int]$Port = 3000,
    [ValidateSet('auto', 'edge', 'chrome')][string]$Browser = 'auto',
    [switch]$SkipEdgePolicies,
    [switch]$SkipPowerSettings,
    [switch]$SkipActiveHours,
    [switch]$SkipPoppler,
    # Used by update.ps1: refresh permissions, tasks, firewall and the updater copy only (no npm, no setup).
    [switch]$Refresh
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# common.ps1 sits next to this file once the code is cloned. On a first run from a lone download it is not
# there yet: the few things needed before the clone are done inline, then common.ps1 is loaded from the clone.
$here = $PSScriptRoot
$commonHere = Join-Path $here 'common.ps1'

function Write-Early { param([string]$m, [string]$c = 'Gray') Write-Host $m -ForegroundColor $c }

# ---- 1. checks ------------------------------------------------------------------
$id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Early 'Please run this as administrator: right-click PowerShell > "Run as administrator", then run the same command again.' Red
    exit 1
}
if (-not [Environment]::Is64BitOperatingSystem) { Write-Early 'TachTach Screens needs 64-bit Windows.' Red; exit 1 }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 17763) { Write-Early "This Windows is too old (build $build). Windows 10 version 1809 or newer, or Windows 11, is needed." Red; exit 1 }
if ($PSVersionTable.PSVersion.Major -lt 5) { Write-Early 'PowerShell 5.1 or newer is needed.' Red; exit 1 }
if ($InstallDir -notmatch '^[A-Za-z]:\\[A-Za-z0-9_.-]+(\\[A-Za-z0-9_.-]+)*$') {
    Write-Early "Please use a simple folder with no spaces, for example C:\TachTach (got: $InstallDir)." Red; exit 1
}
foreach ($od in @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer)) {
    if ($od -and $InstallDir.ToLowerInvariant().StartsWith($od.ToLowerInvariant())) {
        Write-Early 'Do not install inside OneDrive: OneDrive locks and syncs files while the screen writes them.' Red; exit 1
    }
}
if ($InstallDir.ToLowerInvariant().Contains('onedrive')) { Write-Early 'The folder name contains "OneDrive"; please use C:\TachTach.' Red; exit 1 }

$pdRoot = Join-Path $env:ProgramData 'TachTach'
$installLogDir = Join-Path (Join-Path $pdRoot 'logs') 'install'
New-Item -ItemType Directory -Path $installLogDir -Force | Out-Null
$earlyLog = Join-Path $installLogDir ('install-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

function Update-PathFromRegistry {
    $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $u = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($m, $u | Where-Object { $_ }) -join ';'
}

function Write-L {
    param([string]$m, [string]$level = 'INFO')
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $m
    $color = 'Gray'
    if ($level -eq 'ERROR') { $color = 'Red' } elseif ($level -eq 'WARN') { $color = 'Yellow' } elseif ($level -eq 'STEP') { $color = 'Cyan' }
    Write-Host $line -ForegroundColor $color
    [System.IO.File]::AppendAllText($earlyLog, $line + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Winget {
    param([string]$PackageId)
    $wg = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $wg) { return $false }
    Write-L "Installing $PackageId with winget (this can take a few minutes)..."
    $ErrorActionPreference = 'Continue'
    & $wg.Source install --id $PackageId --exact --scope machine --silent --accept-source-agreements --accept-package-agreements --disable-interactivity 2>&1 | ForEach-Object { Write-L "  $_" }
    $rc = $LASTEXITCODE
    Write-L "winget finished with code $rc."
    Update-PathFromRegistry
    return $true
}

function Get-NodeInfo {
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    $path = $null
    if ($c) { $path = $c.Source } elseif (Test-Path (Join-Path $env:ProgramFiles 'nodejs\node.exe')) { $path = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not $path) { return $null }
    $ErrorActionPreference = 'Continue'
    # No spaces or double quotes in the argument: Windows PowerShell 5.1 passes those to programs badly.
    $v = (& $path -p 'process.versions.node+''-''+process.arch' 2>$null) -join ''
    if ($v -notmatch '^(\d+)\.\d+\.\d+-(\S+)$') { return $null }
    return @{ Path = $path; Major = [int]$Matches[1]; Arch = $Matches[2]; Version = $v }
}

Write-L "TachTach Screens installer. Log file: $earlyLog" 'STEP'
Write-L ("Windows build {0}, PowerShell {1}, install folder {2}" -f $build, $PSVersionTable.PSVersion, $InstallDir)

# ---- 2. Node.js + Git ---------------------------------------------------------------
Write-L '[1/9] Node.js' 'STEP'
$nodeInfo = Get-NodeInfo
if (-not $nodeInfo -or $nodeInfo.Major -lt 22) {
    if ($nodeInfo) { Write-L "Node.js $($nodeInfo.Version) is too old (22 or newer is needed)." 'WARN' }
    if (-not (Invoke-Winget 'OpenJS.NodeJS.LTS')) {
        Write-L 'winget is not available. Install Node.js LTS (64-bit, "Windows Installer (.msi)") from https://nodejs.org, then run this again.' 'ERROR'; exit 1
    }
    $nodeInfo = Get-NodeInfo
}
if (-not $nodeInfo -or $nodeInfo.Major -lt 22) { Write-L 'Node.js 22 or newer is still not found. Install Node.js LTS from https://nodejs.org (64-bit .msi), then run this again.' 'ERROR'; exit 1 }
if ($nodeInfo.Arch -ne 'x64' -and $nodeInfo.Arch -ne 'arm64') { Write-L "Node.js is $($nodeInfo.Arch); the 64-bit version is needed." 'ERROR'; exit 1 }
if ($nodeInfo.Path.ToLowerInvariant().Contains('\users\')) { Write-L "Node.js is installed for one user only ($($nodeInfo.Path)). The screen's server account cannot use that; install Node.js LTS for all users (the .msi from nodejs.org, or winget --scope machine)." 'ERROR'; exit 1 }
Write-L "Node.js $($nodeInfo.Version) at $($nodeInfo.Path)"

Write-L '[2/9] Git' 'STEP'
$gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    if (-not (Invoke-Winget 'Git.Git')) { Write-L 'winget is not available. Install Git for Windows from https://git-scm.com/download/win, then run this again.' 'ERROR'; exit 1 }
    $gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
}
if (-not $gitCmd) { Write-L 'Git is still not found. Install Git for Windows from https://git-scm.com/download/win, then run this again.' 'ERROR'; exit 1 }
$gitExe = $gitCmd.Source
Write-L "Git at $gitExe"

# ---- 3. code -----------------------------------------------------------------------
Write-L '[3/9] Code' 'STEP'
$ErrorActionPreference = 'Continue'
$safe = $InstallDir.Replace('\', '/')
$haveSafe = @(& $gitExe config --system --get-all safe.directory 2>$null) -contains $safe
if (-not $haveSafe) { & $gitExe config --system --add safe.directory $safe 2>&1 | ForEach-Object { Write-L "  $_" } }
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-L "Downloading the code from $RepoUrl ($Branch) into $InstallDir ..."
    $ErrorActionPreference = 'Continue'
    & $gitExe -c core.autocrlf=false -c core.longpaths=true clone --branch $Branch $RepoUrl $InstallDir 2>&1 | ForEach-Object { Write-L "  $_" }
    $rc = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($rc -ne 0) { Write-L 'Could not download the code (see above). Check the internet connection and try again.' 'ERROR'; exit 1 }
} elseif (-not (Test-Path -LiteralPath (Join-Path $InstallDir '.git'))) {
    Write-L "$InstallDir exists but is not a TachTach copy (no .git folder). Move it away or choose -InstallDir." 'ERROR'; exit 1
} else {
    Write-L 'Code already present (use update.ps1 to get the newest version).'
}
$ErrorActionPreference = 'Continue'
& $gitExe -C $InstallDir config core.autocrlf false 2>&1 | Out-Null
& $gitExe -C $InstallDir config core.longpaths true 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'

# From here on use the shared helpers from the copy we just made / already had.
$common = Join-Path $InstallDir 'deploy\windows\common.ps1'
if (-not (Test-Path -LiteralPath $common)) { Write-L "Missing $common - is the branch right?" 'ERROR'; exit 1 }
. $common
Set-TTLogFile -Path $earlyLog

$oldConfig = Get-TTConfig
# A repair / -Refresh keeps what was chosen at install unless it is given again on the command line.
if (-not $PSBoundParameters.ContainsKey('Port')) { $Port = [int](Get-TTConfigValue $oldConfig 'Port' $Port) }
if (-not $PSBoundParameters.ContainsKey('Browser')) { $Browser = [string](Get-TTConfigValue $oldConfig 'Browser' $Browser) }
if (-not $PSBoundParameters.ContainsKey('RepoUrl')) { $RepoUrl = [string](Get-TTConfigValue $oldConfig 'RepoUrl' $RepoUrl) }
if (-not $PSBoundParameters.ContainsKey('Branch')) { $Branch = [string](Get-TTConfigValue $oldConfig 'Branch' $Branch) }
if (-not $KioskUser) { $KioskUser = [string](Get-TTConfigValue $oldConfig 'KioskUser' '') }
if (-not $KioskUser) {
    $console = $null
    try { $console = (Get-CimInstance Win32_ComputerSystem).UserName } catch { }
    Write-Host ''
    Write-Host 'Which Windows account should show the TV? It should sign in automatically (see SETUP.md).'
    Write-Host 'Best: a separate account WITHOUT administrator rights, e.g. "TachTach Screen".'
    $ans = Read-Host ("Account name [{0}]" -f $console)
    if ($ans) { $KioskUser = $ans } else { $KioskUser = $console }
}
try {
    $kioskSid = (New-Object System.Security.Principal.NTAccount($KioskUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value
} catch { Write-TTLog "The Windows account '$KioskUser' was not found. Create it first (SETUP.md step 2), then run this again." 'ERROR'; exit 1 }
$adminMembers = @()
try { $adminMembers = @(Get-LocalGroupMember -SID $script:SidAdministrators -ErrorAction Stop | ForEach-Object { $_.SID.Value }) } catch { }
if ($adminMembers -contains $kioskSid) { Write-TTLog "'$KioskUser' is an administrator. It works, but a standard account is safer for a screen anyone can walk up to." 'WARN' }
Write-TTLog "Kiosk account: $KioskUser ($kioskSid)"

try {
    # The server must be stopped before npm ci: Windows cannot replace the sharp/bcrypt DLLs while they are loaded.
    if (Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -ErrorAction SilentlyContinue) {
        Write-TTLog 'Stopping the running server for a moment...'
        $null = Stop-TTServer -ProjectDir $InstallDir
    }

    $npmCli = Get-TTNpmCli -NodeExe $nodeInfo.Path
    if (-not $npmCli) { Write-TTLog 'npm was not found next to node.exe; reinstall Node.js LTS.' 'ERROR'; exit 1 }
    if (-not $Refresh) {
        Write-TTLog 'Installing the program libraries (npm ci)... this takes a few minutes.'
        $rc = Invoke-TTLogged -FilePath $nodeInfo.Path -Arguments ('"' + $npmCli + '" ci --no-audit --no-fund') -WorkingDirectory $InstallDir
        if ($rc -ne 0) { Write-TTLog "npm ci failed (code $rc). Check the internet connection and run this again." 'ERROR'; $null = Start-TTServer; exit 1 }
        Write-TTLog 'Building the screen and admin pages (npm run build)...'
        $rc = Invoke-TTLogged -FilePath $nodeInfo.Path -Arguments ('"' + $npmCli + '" run build') -WorkingDirectory $InstallDir
        if ($rc -ne 0) { Write-TTLog "Build failed (code $rc)." 'ERROR'; $null = Start-TTServer; exit 1 }
        $rc = Invoke-TTLogged -FilePath $nodeInfo.Path -Arguments "-e `"require('bcrypt'); require('sharp'); console.log('native modules OK')`"" -WorkingDirectory $InstallDir
        if ($rc -ne 0) { Write-TTLog 'The image (sharp) or password (bcrypt) library does not load on this PC. Send this log.' 'ERROR'; exit 1 }
    }

    # ---- 4. poppler + .env ---------------------------------------------------------------
    Write-TTLog '[4/9] PDF tool and settings file' 'STEP'
    function Find-Pdftoppm {
        $c = Get-Command pdftoppm.exe -ErrorAction SilentlyContinue
        if ($c -and -not $c.Source.ToLowerInvariant().Contains('\users\')) { return (Split-Path -Parent $c.Source) }
        $roots = @((Join-Path $env:ProgramFiles 'WinGet\Packages'), (Join-Path $env:ProgramFiles 'poppler'), 'C:\poppler')
        foreach ($r in $roots) {
            if (-not (Test-Path -LiteralPath $r)) { continue }
            $hit = Get-ChildItem -LiteralPath $r -Recurse -Filter 'pdftoppm.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) { return $hit.DirectoryName }
        }
        return $null
    }
    $popplerDir = Find-Pdftoppm
    if (-not $popplerDir -and -not $SkipPoppler -and -not $Refresh) {
        $null = Invoke-Winget 'oschwartz10612.Poppler'
        $popplerDir = Find-Pdftoppm
    }
    if ($popplerDir) { Write-TTLog "PDF tool found: $popplerDir" } else { Write-TTLog 'PDF tool (poppler) not installed: PDF slides will not work, pictures will. See SETUP.md "PDF slides".' 'WARN' }

    $envFile = Join-Path $InstallDir '.env'
    $envLines = New-Object System.Collections.ArrayList
    if (Test-Path -LiteralPath $envFile) { foreach ($l in [System.IO.File]::ReadAllLines($envFile)) { $null = $envLines.Add($l) } }
    function Set-EnvValue {
        param([string]$Key, [string]$Value)
        for ($i = 0; $i -lt $envLines.Count; $i++) {
            if ($envLines[$i] -match ('^\s*' + [regex]::Escape($Key) + '\s*=')) { $envLines[$i] = "$Key=$Value"; return }
        }
        $null = $envLines.Add("$Key=$Value")
    }
    Set-EnvValue 'NODE_ENV' 'production'
    Set-EnvValue 'PORT' "$Port"
    Set-EnvValue 'HOST' '0.0.0.0'
    Set-EnvValue 'TRUST_PROXY' '1'
    if ($popplerDir) { Set-EnvValue 'POPPLER_PATH' $popplerDir }
    Write-TTTextFile -Path $envFile -Text (($envLines -join "`r`n") + "`r`n")
    Write-TTLog "Settings written to $envFile"

    # ---- 5. folders + permissions --------------------------------------------------------
    Write-TTLog '[5/9] Folders and permissions' 'STEP'
    $dataDir = Join-Path $InstallDir 'data'
    foreach ($d in @($dataDir, $script:TTProgramData, $script:TTLogRoot, (Join-Path $script:TTLogRoot 'server'), (Join-Path $script:TTLogRoot 'kiosk'),
            (Join-Path $script:TTLogRoot 'update'), $installLogDir, $script:TTUpdaterDir, (Join-Path $script:TTUpdaterDir 'state'),
            (Join-Path $script:TTUpdaterDir 'job'), $script:TTWorkDir, $script:TTBackupDir)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
    $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
    function Set-Acl2 {
        # Replace a folder's permissions with exactly these (inheritance from above switched off).
        param([string]$Path, [string[]]$Grants)
        $a = '"' + $Path + '" /inheritance:r /grant:r ' + (($Grants | ForEach-Object { '"' + $_ + '"' }) -join ' ') + ' /Q'
        $rc = Invoke-TTLogged -FilePath $icacls -Arguments $a
        if ($rc -ne 0) { throw "icacls failed on $Path (code $rc)" }
    }
    $gSys = '*' + $script:SidSystem; $gAdm = '*' + $script:SidAdministrators; $gLS = '*' + $script:SidLocalService
    $gNS = '*' + $script:SidNetworkService; $gUsr = '*' + $script:SidUsers; $gKiosk = '*' + $kioskSid
    # Code: admins full; the update worker (NETWORK SERVICE) may change it; the server (LOCAL SERVICE) and users only read.
    Set-Acl2 $InstallDir @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gNS}:(OI)(CI)M", "${gLS}:(OI)(CI)RX", "${gUsr}:(OI)(CI)RX")
    # data\: logins, sessions, student names. Only the server, the update worker, SYSTEM and admins. No ordinary users.
    Set-Acl2 $dataDir @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gLS}:(OI)(CI)M", "${gNS}:(OI)(CI)M")
    $null = Invoke-TTLogged -FilePath $icacls -Arguments ('"' + $dataDir + '\*" /reset /T /C /Q')
    # ProgramData\TachTach: readable by everyone, writable by admins; then one writable sub-folder per account.
    Set-Acl2 $script:TTProgramData @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gUsr}:(OI)(CI)RX")
    Set-Acl2 (Join-Path $script:TTLogRoot 'server') @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gLS}:(OI)(CI)M", "${gUsr}:(OI)(CI)RX")
    Set-Acl2 (Join-Path $script:TTLogRoot 'kiosk') @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gKiosk}:(OI)(CI)M", "${gUsr}:(OI)(CI)RX")
    Set-Acl2 $script:TTWorkDir @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gNS}:(OI)(CI)M")
    # updater\: only SYSTEM/admins write. The server reads the status, the worker reads job\. state\ is private.
    Set-Acl2 $script:TTUpdaterDir @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F", "${gLS}:(OI)(CI)RX", "${gNS}:(OI)(CI)RX")
    Set-Acl2 (Join-Path $script:TTUpdaterDir 'state') @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F")
    Set-Acl2 $script:TTBackupDir @("${gSys}:(OI)(CI)F", "${gAdm}:(OI)(CI)F")

    # ---- 6. config, updater copy, firewall, power, Edge ------------------------------------
    Write-TTLog '[6/9] Windows settings' 'STEP'
    $edgePolicies = (-not $SkipEdgePolicies) -or [bool](Get-TTConfigValue $oldConfig 'EdgePoliciesSet' $false)
    $cfg = @{
        ProjectDir = $InstallDir; NodePath = $nodeInfo.Path; GitPath = $gitExe; Port = $Port; HttpsPort = 3443
        Browser = $Browser; KioskUser = $KioskUser
        KioskUseHttps = [bool](Get-TTConfigValue $oldConfig 'KioskUseHttps' $false)
        KioskDisableGpu = [bool](Get-TTConfigValue $oldConfig 'KioskDisableGpu' $false)
        KioskDailyRestart = [string](Get-TTConfigValue $oldConfig 'KioskDailyRestart' '03:15')
        KioskStaleMinutes = [int](Get-TTConfigValue $oldConfig 'KioskStaleMinutes' 15)
        EdgePoliciesSet = $edgePolicies; RepoUrl = $RepoUrl; Branch = $Branch
        InstalledAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Save-TTConfig -Values $cfg

    # The SYSTEM update runner only ever runs these admin-only copies (never the files in C:\TachTach).
    foreach ($pair in @(@((Join-Path $InstallDir 'deploy\windows\update-runner.ps1'), 'update-runner.ps1'), @((Join-Path $InstallDir 'deploy\update-helper.mjs'), 'update-helper.mjs'))) {
        $dest = Join-Path $script:TTUpdaterDir $pair[1]
        Copy-Item -LiteralPath $pair[0] -Destination ($dest + '.new') -Force
        Move-Item -LiteralPath ($dest + '.new') -Destination $dest -Force
    }
    Write-TTTextFile -Path (Join-Path $script:TTUpdaterDir 'update-installed.json') -Text ('{"version":1,"installedAt":"' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + '","platform":"win32"}' + "`r`n")
    Write-TTLog "Update helper copied to $($script:TTUpdaterDir)"

    try {
        Get-NetFirewallRule -Name 'TachTach-LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        New-NetFirewallRule -Name 'TachTach-LAN' -DisplayName 'TachTach Screens (LAN)' -Description 'Admin website on the school network (Private networks only).' `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet -Program $nodeInfo.Path | Out-Null
        Write-TTLog "Firewall: port $Port open to the local network on Private networks only."
        $profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
        foreach ($p in $profiles) {
            if ("$($p.NetworkCategory)" -ne 'Private' -and "$($p.NetworkCategory)" -ne 'DomainAuthenticated') {
                Write-TTLog "Network '$($p.Name)' is $($p.NetworkCategory). Phones/laptops reach the admin page only when it is Private (SETUP.md step 6)." 'WARN'
            }
        }
    } catch { Write-TTLog "Could not set the firewall rule: $($_.Exception.Message)" 'WARN' }

    if (-not $SkipPowerSettings) {
        $pc = Join-Path $env:SystemRoot 'System32\powercfg.exe'
        foreach ($pcArg in @('/change monitor-timeout-ac 0', '/change monitor-timeout-dc 0', '/change standby-timeout-ac 0', '/change standby-timeout-dc 0',
                '/change hibernate-timeout-ac 0', '/change hibernate-timeout-dc 0', '/hibernate off',
                '/setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
                '/setactive SCHEME_CURRENT')) {
            $null = Invoke-TTLogged -FilePath $pc -Arguments $pcArg
        }
        Write-TTLog 'Power: screen never turns off, PC never sleeps or hibernates (also turns off Fast Startup).'
    }

    if (-not $SkipActiveHours) {
        try {
            $wu = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
            if (-not (Test-Path $wu)) { New-Item -Path $wu -Force | Out-Null }
            New-ItemProperty -Path $wu -Name 'SmartActiveHoursState' -Value 0 -PropertyType DWord -Force | Out-Null
            New-ItemProperty -Path $wu -Name 'ActiveHoursStart' -Value 6 -PropertyType DWord -Force | Out-Null
            New-ItemProperty -Path $wu -Name 'ActiveHoursEnd' -Value 23 -PropertyType DWord -Force | Out-Null
            Write-TTLog 'Windows Update active hours: 6:00 to 23:00 (no automatic restarts in that time).'
        } catch { Write-TTLog "Could not set active hours: $($_.Exception.Message)" 'WARN' }
    }

    if (-not $SkipEdgePolicies) {
        $ep = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
        if (-not (Test-Path $ep)) { New-Item -Path $ep -Force | Out-Null }
        $pol = [ordered]@{
            HideFirstRunExperience = 1; TranslateEnabled = 0; PasswordManagerEnabled = 0; BrowserSignin = 0; SyncDisabled = 1
            HubsSidebarEnabled = 0; StartupBoostEnabled = 0; BackgroundModeEnabled = 0; DefaultBrowserSettingEnabled = 0
            ShowRecommendationsEnabled = 0; PromotionalTabsEnabled = 0; UserFeedbackAllowed = 0; EdgeShoppingAssistantEnabled = 0
            ShowMicrosoftRewards = 0; SpotlightExperiencesAndRecommendationsEnabled = 0; AutoplayAllowed = 1
        }
        foreach ($k in $pol.Keys) { New-ItemProperty -Path $ep -Name $k -Value $pol[$k] -PropertyType DWord -Force | Out-Null }
        Write-TTLog 'Edge: first-run, translate, password, sign-in and sidebar pop-ups turned off (applies to Edge for every account on this PC).'
    }

    # ---- 7. scheduled tasks ----------------------------------------------------------------
    Write-TTLog '[7/9] Scheduled tasks' 'STEP'
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    function New-PsAction { param([string]$Script) return New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Script + '"') -WorkingDirectory $InstallDir }
    function New-Repeat { param([int]$Minutes) return New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes $Minutes) -RepetitionDuration (New-TimeSpan -Days 3650) }
    $winDir = Join-Path $InstallDir 'deploy\windows'

    $serverSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -Priority 5
    Register-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -Force `
        -Description 'TachTach Screens web server (node server.js). Restarts itself; started at boot and checked every minute.' `
        -Action (New-PsAction (Join-Path $winDir 'server-run.ps1')) -Trigger @((New-ScheduledTaskTrigger -AtStartup), (New-Repeat 1)) `
        -Principal (New-ScheduledTaskPrincipal -UserId (Get-TTAccountName $script:SidLocalService) -LogonType ServiceAccount -RunLevel Limited) `
        -Settings $serverSettings | Out-Null

    $kioskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -Priority 4
    Register-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTKioskTask -Force `
        -Description 'TachTach Screens TV browser (Edge/Chrome full screen) with a watchdog. Runs at sign-in of the screen account.' `
        -Action (New-PsAction (Join-Path $winDir 'kiosk.ps1')) -Trigger @((New-ScheduledTaskTrigger -AtLogOn -User $KioskUser), (New-Repeat 5)) `
        -Principal (New-ScheduledTaskPrincipal -UserId $KioskUser -LogonType Interactive -RunLevel Limited) `
        -Settings $kioskSettings | Out-Null

    $updSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    Register-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTUpdateTask -Force `
        -Description 'TachTach Screens: carries out an update asked for on the admin website (checks once a minute; does nothing otherwise).' `
        -Action (New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $script:TTUpdaterDir 'update-runner.ps1') + '"') -WorkingDirectory $script:TTUpdaterDir) `
        -Trigger @(New-Repeat 1) `
        -Principal (New-ScheduledTaskPrincipal -UserId (Get-TTAccountName $script:SidSystem) -LogonType ServiceAccount -RunLevel Highest) `
        -Settings $updSettings | Out-Null

    $workSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 45)
    Register-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTWorkerTask -Force `
        -Description 'TachTach Screens: git pull + npm ci + build for an update. Started only by TachTach Update.' `
        -Action (New-PsAction (Join-Path $winDir 'update-worker.ps1')) `
        -Principal (New-ScheduledTaskPrincipal -UserId (Get-TTAccountName $script:SidNetworkService) -LogonType ServiceAccount -RunLevel Limited) `
        -Settings $workSettings | Out-Null
    Write-TTLog 'Tasks registered: TachTach Server, TachTach Kiosk, TachTach Update, TachTach Update Worker (Task Scheduler > TachTach).'

    # ---- 8. first-time setup ----------------------------------------------------------------
    Write-TTLog '[8/9] First-time setup' 'STEP'
    if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'users.json')) -and -not (Test-Path -LiteralPath (Join-Path $dataDir 'auth.json'))) {
        Write-Host ''
        Write-Host 'No admin login exists yet. Now you choose the admin password for the website.' -ForegroundColor Cyan
        Write-Host '(The password is shown as you type it. Nobody else should be looking at the screen.)'
        Push-Location $InstallDir
        try {
            $ErrorActionPreference = 'Continue'
            & $nodeInfo.Path (Join-Path $InstallDir 'setup.js')
            $ErrorActionPreference = 'Stop'
        } finally { Pop-Location }
        $null = Invoke-TTLogged -FilePath $icacls -Arguments ('"' + $dataDir + '\*" /reset /T /C /Q')
    } else {
        Write-TTLog 'A login already exists; first-time setup is skipped (never re-run setup.js: it resets settings).'
    }

    # ---- 9. start + check ---------------------------------------------------------------------
    Write-TTLog '[9/9] Starting' 'STEP'
    $null = Start-TTServer
    if (Wait-TTServerUp -Port $Port -TimeoutSeconds 90) {
        Write-TTLog "The server is answering on http://127.0.0.1:$Port (running as LOCAL SERVICE)."
    } else {
        Write-TTLog 'The server did not answer within 90 seconds. Newest server log follows:' 'ERROR'
        $latest = Get-ChildItem -LiteralPath (Join-Path $script:TTLogRoot 'server') -Filter 'server-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 2
        foreach ($f in @($latest)) { Write-TTLog "--- $($f.Name)"; foreach ($l in @(Get-Content -LiteralPath $f.FullName -Tail 30 -ErrorAction SilentlyContinue)) { Write-TTLog "  $l" } }
    }

    # Time zone: the server's timers use the PC's zone; the screen's rules use the one in Look & Settings.
    $ErrorActionPreference = 'Continue'
    $pcZone = (& $nodeInfo.Path -p 'Intl.DateTimeFormat().resolvedOptions().timeZone' 2>$null) -join ''
    $ErrorActionPreference = 'Stop'
    Write-TTLog "Windows time zone: $((Get-TimeZone).Id) = $pcZone. It must match Look & Settings > Location on the admin website."

    try { Start-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTKioskTask -ErrorAction Stop } catch { }

    $ip = $null
    try { $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress } catch { }
    Write-Host ''
    Write-TTLog 'Done.' 'STEP'
    Write-Host "  Admin website on this PC:     http://127.0.0.1:$Port/admin"
    if ($ip) { Write-Host "  From a phone on the same Wi-Fi: http://${ip}:$Port/admin" }
    Write-Host "  The TV opens when '$KioskUser' signs in. Next: SETUP.md steps 5-7 (automatic sign-in, active hours)."
    Write-Host "  Log of this run: $earlyLog"
    exit 0
} finally {
    # Whatever happened above, never leave the screen without its server (the task may have been disabled to update files).
    $t = Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -ErrorAction SilentlyContinue
    if ($t -and "$($t.State)" -eq 'Disabled') { $null = Start-TTServer }
}
