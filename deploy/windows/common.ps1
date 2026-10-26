# ============================================================================
#  TachTach Screens - shared helpers for the Windows scripts (dot-sourced)
# ============================================================================
#  Used by install.ps1, update.ps1, uninstall.ps1, health-check.ps1, server-run.ps1,
#  kiosk.ps1 and update-worker.ps1. NOT used by update-runner.ps1: that one runs as
#  SYSTEM and must not load anything a lower account can edit, so it is self-contained.
#
#  Written for Windows PowerShell 5.1 (what Windows 10/11 ship). ASCII only on purpose:
#  PowerShell 5.1 reads a file without a byte-order mark as the ANSI code page, so one
#  curly quote or dash could break a script (test/windowsKit.test.js checks this).
# ============================================================================

Set-StrictMode -Version 2

$script:TTProgramData = Join-Path $env:ProgramData 'TachTach'
$script:TTConfigPath = Join-Path $script:TTProgramData 'tachtach.json'
$script:TTLogRoot = Join-Path $script:TTProgramData 'logs'
$script:TTUpdaterDir = Join-Path $script:TTProgramData 'updater'
$script:TTWorkDir = Join-Path $script:TTProgramData 'work'
$script:TTBackupDir = Join-Path $script:TTProgramData 'backups'
$script:TTTaskPath = '\TachTach\'
$script:TTServerTask = 'TachTach Server'
$script:TTKioskTask = 'TachTach Kiosk'
$script:TTUpdateTask = 'TachTach Update'
$script:TTWorkerTask = 'TachTach Update Worker'
$script:TTLogFile = $null

# Well-known SIDs (names differ per Windows language; SIDs never do).
$script:SidSystem = 'S-1-5-18'
$script:SidLocalService = 'S-1-5-19'
$script:SidNetworkService = 'S-1-5-20'
$script:SidAdministrators = 'S-1-5-32-544'
$script:SidUsers = 'S-1-5-32-545'

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Set-TTLogFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $script:TTLogFile = $Path
}

function Write-TTLog {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message, [string]$Level = 'INFO', [switch]$Quiet)
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if (-not $Quiet) {
        if ($Level -eq 'ERROR') { Write-Host $line -ForegroundColor Red }
        elseif ($Level -eq 'WARN') { Write-Host $line -ForegroundColor Yellow }
        else { Write-Host $line }
    }
    if ($script:TTLogFile) {
        try { [System.IO.File]::AppendAllText($script:TTLogFile, $line + "`r`n", $script:Utf8NoBom) } catch { Write-Host "(could not write the log file: $($_.Exception.Message))" }
    }
}

function Test-TTIsAdmin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-TTAdmin {
    if (-not (Test-TTIsAdmin)) {
        Write-Host 'This must be run as administrator.' -ForegroundColor Red
        Write-Host 'Right-click PowerShell, choose "Run as administrator", and run the same command again.'
        exit 1
    }
}

function Get-TTAccountName {
    # The local-language account name for a SID (e.g. S-1-5-19 -> "NT AUTHORITY\LOCAL SERVICE").
    param([Parameter(Mandatory = $true)][string]$Sid)
    $s = New-Object System.Security.Principal.SecurityIdentifier($Sid)
    return $s.Translate([System.Security.Principal.NTAccount]).Value
}

function Write-TTTextFile {
    # UTF-8 without a byte-order mark (Out-File / Set-Content in PowerShell 5.1 would add one or use UTF-16).
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
    $tmp = $Path + '.new'
    [System.IO.File]::WriteAllText($tmp, $Text, $script:Utf8NoBom)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

# ---- config ----------------------------------------------------------------
# C:\ProgramData\TachTach\tachtach.json: written by install.ps1 (administrators only can change it).

function Get-TTConfig {
    if (-not (Test-Path -LiteralPath $script:TTConfigPath)) { return $null }
    $raw = [System.IO.File]::ReadAllText($script:TTConfigPath)
    return ($raw | ConvertFrom-Json)
}

function Get-TTConfigValue {
    param($Config, [Parameter(Mandatory = $true)][string]$Name, $Default = $null)
    if ($null -eq $Config) { return $Default }
    $p = $Config.PSObject.Properties[$Name]
    if ($null -eq $p -or $null -eq $p.Value -or "$($p.Value)" -eq '') { return $Default }
    return $p.Value
}

function Save-TTConfig {
    param([Parameter(Mandatory = $true)][hashtable]$Values)
    $ordered = [ordered]@{}
    foreach ($k in ($Values.Keys | Sort-Object)) { $ordered[$k] = $Values[$k] }
    Write-TTTextFile -Path $script:TTConfigPath -Text (($ordered | ConvertTo-Json -Depth 4) + "`r`n")
}

# ---- running programs with a log -------------------------------------------

function Invoke-TTLogged {
    # Runs a program with FIXED arguments (never user input), appends its stdout+stderr to the log, returns the exit code.
    # Start-Process with redirection avoids PowerShell 5.1 turning git's progress messages (stderr) into errors.
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path,
        [int]$TimeoutSeconds = 3600
    )
    $out = [System.IO.Path]::GetTempFileName()
    $err = [System.IO.Path]::GetTempFileName()
    try {
        Write-TTLog "> $FilePath $Arguments"
        $sp = @{ FilePath = $FilePath; WorkingDirectory = $WorkingDirectory; NoNewWindow = $true; PassThru = $true; RedirectStandardOutput = $out; RedirectStandardError = $err }
        if ($Arguments) { $sp['ArgumentList'] = $Arguments }
        $p = Start-Process @sp
        $null = $p.Handle  # PowerShell 5.1 quirk: without touching Handle, ExitCode can come back empty
        if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
            Write-TTLog "Timed out after $TimeoutSeconds s; stopping it." 'ERROR'
            try { $p.Kill() } catch { }
            return 124
        }
        $p.WaitForExit()
        foreach ($f in @($out, $err)) {
            $text = [System.IO.File]::ReadAllText($f)
            if ($text.Trim()) { foreach ($l in ($text -split "`r?`n")) { if ($l.Trim()) { Write-TTLog "  $l" } } }
        }
        return [int]$p.ExitCode
    } finally {
        Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-TTCapture {
    # Runs a program with fixed arguments and returns its stdout lines (stderr dropped). Never throws on stderr:
    # PowerShell 5.1 turns a native program's stderr into errors when $ErrorActionPreference is Stop.
    param([Parameter(Mandatory = $true)][string]$FilePath, [string[]]$ArgumentList = @())
    $ErrorActionPreference = 'Continue'
    $lines = @(& $FilePath @ArgumentList 2>$null)
    return @($lines | ForEach-Object { "$_" })
}

function Get-TTNodeExe {
    param($Config)
    $n = Get-TTConfigValue $Config 'NodePath' ''
    if ($n -and (Test-Path -LiteralPath $n)) { return $n }
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $d = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path -LiteralPath $d) { return $d }
    return $null
}

function Get-TTGitExe {
    param($Config)
    $g = Get-TTConfigValue $Config 'GitPath' ''
    if ($g -and (Test-Path -LiteralPath $g)) { return $g }
    $c = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $d = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
    if (Test-Path -LiteralPath $d) { return $d }
    return $null
}

function Get-TTNpmCli {
    # npm's own JavaScript entry point next to node.exe (avoids running npm.cmd through cmd.exe).
    param([Parameter(Mandatory = $true)][string]$NodeExe)
    $cli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\npm\bin\npm-cli.js'
    if (Test-Path -LiteralPath $cli) { return $cli }
    return $null
}

# ---- the server ------------------------------------------------------------

function Get-TTServerNodeProcesses {
    # node.exe processes running OUR server.js (matched by command line, never by a PID file someone could edit).
    param([Parameter(Mandatory = $true)][string]$ProjectDir)
    $needle = (Join-Path $ProjectDir 'server.js').ToLowerInvariant()
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
    return @($procs | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) })
}

function Stop-TTServer {
    # Stops the server task AND keeps it from being restarted by its 1-minute trigger until Start-TTServer.
    param([Parameter(Mandatory = $true)][string]$ProjectDir)
    $t = Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -ErrorAction SilentlyContinue
    if ($t) {
        Disable-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask | Out-Null
        Stop-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -ErrorAction SilentlyContinue
    }
    for ($i = 0; $i -lt 20; $i++) {
        $left = @(Get-TTServerNodeProcesses -ProjectDir $ProjectDir)
        if ($left.Count -eq 0) { return $true }
        foreach ($p in $left) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } }
        Start-Sleep -Milliseconds 500
    }
    return (@(Get-TTServerNodeProcesses -ProjectDir $ProjectDir).Count -eq 0)
}

function Start-TTServer {
    $t = Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask -ErrorAction SilentlyContinue
    if (-not $t) { return $false }
    Enable-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask | Out-Null
    Start-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $script:TTServerTask
    return $true
}

function Test-TTHttp {
    # $true when anything answers over HTTP (any status code: before first setup the server answers 503).
    param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutMs = 3000)
    try {
        $r = [System.Net.HttpWebRequest]::Create($Url)
        $r.Proxy = $null
        $r.Timeout = $TimeoutMs
        $r.AllowAutoRedirect = $false
        $resp = $r.GetResponse()
        $resp.Close()
        return $true
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) { $_.Exception.Response.Close(); return $true }
        return $false
    } catch {
        return $false
    }
}

function Wait-TTServerUp {
    param([int]$Port = 3000, [int]$TimeoutSeconds = 90)
    $url = "http://127.0.0.1:$Port/screen"
    $until = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $until) {
        if (Test-TTHttp -Url $url) {
            Start-Sleep -Seconds 5
            if (Test-TTHttp -Url $url) { return $true }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Stop-TTKioskBrowser {
    # Closes only the kiosk's browser (the one using our own profile folder); kiosk.ps1 starts it again.
    $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.Contains('\TachTach\BrowserProfile')
    })
    foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } }
    return $procs.Count
}

# ---- data backup + code update (worker and update.ps1) ----------------------

function Backup-TTData {
    # Copies data\ (settings, schedule, logins...) to C:\ProgramData\TachTach\backups\data-<time>.
    # Big write-once folders (photos, uploads) are skipped; /XJ never follows a junction. Keeps the newest 10.
    param([Parameter(Mandatory = $true)][string]$ProjectDir)
    $src = Join-Path $ProjectDir 'data'
    if (-not (Test-Path -LiteralPath $src)) { return $null }
    $dest = Join-Path $script:TTBackupDir ('data-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $robo = Join-Path $env:SystemRoot 'System32\robocopy.exe'
    $roboArgs = '"' + $src + '" "' + $dest + '" /E /XJ /R:1 /W:1 /NFL /NDL /NP /XD uploads google-photos rss-cache .puppeteer-tmp update-cache.git pack-work'
    $rc = Invoke-TTLogged -FilePath $robo -Arguments $roboArgs
    if ($rc -ge 8) { Write-TTLog "Data backup had errors (robocopy code $rc)." 'WARN' } else { Write-TTLog "Data backed up to $dest" }
    $old = @(Get-ChildItem -LiteralPath $script:TTBackupDir -Directory -Filter 'data-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 10)
    foreach ($o in $old) { Remove-Item -LiteralPath $o.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    return $dest
}

function Invoke-TTCodeUpdate {
    # The Windows twin of deploy/update.sh (without the restarts): protect locally edited data files, pull (or go
    # back to an exact commit), npm ci, build. Prints TT_STAGE=pull|deps|build and TT_HEAD_BEFORE/AFTER markers.
    # Returns 0 on success. The server MUST be stopped first (Windows cannot replace sharp/bcrypt DLLs in use).
    param(
        [Parameter(Mandatory = $true)][string]$ProjectDir,
        [Parameter(Mandatory = $true)][ValidateSet('update', 'rollback')][string]$Mode,
        [string]$Target = '',
        [Parameter(Mandatory = $true)][string]$GitExe,
        [Parameter(Mandatory = $true)][string]$NodeExe,
        [Parameter(Mandatory = $true)][string]$ScratchDir
    )
    if ($Mode -eq 'rollback' -and $Target -notmatch '^[0-9a-f]{40}$') { Write-TTLog 'Refusing to roll back: not a full commit hash.' 'ERROR'; return 2 }
    $npm = Get-TTNpmCli -NodeExe $NodeExe
    if (-not $npm) { Write-TTLog "npm was not found next to $NodeExe" 'ERROR'; return 2 }

    $head = (Invoke-TTCapture -FilePath $GitExe -ArgumentList @('-C', $ProjectDir, 'rev-parse', 'HEAD')) -join ''
    Write-TTLog "TT_HEAD_BEFORE=$head"

    # Locally edited data files that git tracks (starting defaults the admin panel changed).
    $changed = @(Invoke-TTCapture -FilePath $GitExe -ArgumentList @('-C', $ProjectDir, 'diff', '--name-only', '--', 'data/') | Where-Object { $_ -and $_.Trim() })
    $saved = Join-Path $ScratchDir ('data-files-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if ($changed.Count -gt 0) {
        Write-TTLog "Keeping $($changed.Count) locally edited data file(s) aside: $saved"
        foreach ($f in $changed) {
            $from = Join-Path $ProjectDir $f
            $to = Join-Path $saved $f
            New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
            Copy-Item -LiteralPath $from -Destination $to -Force
        }
        $quoted = ($changed | ForEach-Object { '"' + $_ + '"' }) -join ' '
        $null = Invoke-TTLogged -FilePath $GitExe -Arguments ('checkout -- ' + $quoted) -WorkingDirectory $ProjectDir
    }

    $rc = 0
    try {
        Write-TTLog 'TT_STAGE=pull'
        if ($Mode -eq 'rollback') {
            $rc = Invoke-TTLogged -FilePath $GitExe -Arguments ('cat-file -e ' + $Target + '^{commit}') -WorkingDirectory $ProjectDir
            if ($rc -eq 0) { $rc = Invoke-TTLogged -FilePath $GitExe -Arguments ('reset --hard ' + $Target) -WorkingDirectory $ProjectDir }
        } else {
            $rc = Invoke-TTLogged -FilePath $GitExe -Arguments 'pull --ff-only' -WorkingDirectory $ProjectDir
        }
    } finally {
        foreach ($f in $changed) {
            $from = Join-Path $saved $f
            if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $ProjectDir $f) -Force }
        }
        if ($changed.Count -gt 0) { Write-TTLog 'Put the locally edited data files back.' }
    }
    if ($rc -ne 0) { Write-TTLog "git failed (code $rc)." 'ERROR'; return $rc }

    Write-TTLog 'TT_STAGE=deps'
    # Not --omit=dev: the build needs vite (a dev dependency), exactly as on the Pi.
    $rc = Invoke-TTLogged -FilePath $NodeExe -Arguments ('"' + $npm + '" ci --no-audit --no-fund') -WorkingDirectory $ProjectDir
    if ($rc -ne 0) { Write-TTLog "npm ci failed (code $rc)." 'ERROR'; return $rc }

    Write-TTLog 'TT_STAGE=build'
    $rc = Invoke-TTLogged -FilePath $NodeExe -Arguments ('"' + $npm + '" run build') -WorkingDirectory $ProjectDir
    if ($rc -ne 0) { Write-TTLog "Build failed (code $rc)." 'ERROR'; return $rc }

    $after = (Invoke-TTCapture -FilePath $GitExe -ArgumentList @('-C', $ProjectDir, 'rev-parse', 'HEAD')) -join ''
    Write-TTLog "TT_HEAD_AFTER=$after"
    return 0
}
