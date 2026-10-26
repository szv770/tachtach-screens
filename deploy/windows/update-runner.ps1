# ============================================================================
#  TachTach Screens - run a software update asked for from the admin website (Windows)
# ============================================================================
#  Runs as SYSTEM, every minute, from the task "TachTach Update". The Windows twin of
#  deploy/run-update.sh (see docs/windows/AUDIT.md section D for the threat model).
#
#  THE COPY THAT RUNS lives in C:\ProgramData\TachTach\updater\ (only Administrators and
#  SYSTEM can change it; install.ps1 / update.ps1 copy it there). It is self-contained on
#  purpose: it loads nothing from C:\TachTach, which lower accounts can write.
#
#  Rules it keeps:
#    - SYSTEM never runs git, npm or anything from the project folder, and never writes into
#      C:\TachTach\data (the web server's account can write there).
#    - git + npm + build run in the task "TachTach Update Worker" as NETWORK SERVICE.
#    - The web server can only ASK (data\update-request.json). The request must be a plain file
#      owned by LOCAL SERVICE, < 4 KB, and pass update-helper.mjs (action allow-list, fresh nonce,
#      < 10 minutes old, one hard link). It is deleted whether accepted or not.
#    - The screen is never left without a server: whatever happens, the server task is enabled
#      and started again at the end.
#
#  Status for the admin page: C:\ProgramData\TachTach\updater\update-status.json
#  Log: C:\ProgramData\TachTach\updater\state\last-run.log (+ logs\update\update-<month>.log)
# ============================================================================

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$PD = Join-Path $env:ProgramData 'TachTach'
$Updater = Join-Path $PD 'updater'
$State = Join-Path $Updater 'state'
$JobDir = Join-Path $Updater 'job'
$WorkDir = Join-Path $PD 'work'
$BackupDir = Join-Path $PD 'backups'
$MonthLog = Join-Path (Join-Path (Join-Path $PD 'logs') 'update') ('update-' + (Get-Date -Format 'yyyyMM') + '.log')
$TaskPath = '\TachTach\'
$ServerTask = 'TachTach Server'
$WorkerTask = 'TachTach Update Worker'
$LocalServiceSid = 'S-1-5-19'
$HashRe = '^[0-9a-f]{40}$'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

# ---- config (admin-only file) ------------------------------------------------
$cfgPath = Join-Path $PD 'tachtach.json'
if (-not (Test-Path -LiteralPath $cfgPath)) { exit 0 }
$cfg = [System.IO.File]::ReadAllText($cfgPath) | ConvertFrom-Json
$ProjectDir = [string]$cfg.ProjectDir
$NodeExe = [string]$cfg.NodePath
$Port = 3000
if ($cfg.PSObject.Properties['Port'] -and $cfg.Port) { $Port = [int]$cfg.Port }
if ($ProjectDir -notmatch '^[A-Za-z]:\\[A-Za-z0-9_.\\-]+$' -or -not (Test-Path -LiteralPath $ProjectDir)) { exit 0 }
if (-not $NodeExe -or -not (Test-Path -LiteralPath $NodeExe)) { exit 0 }

$Request = Join-Path $ProjectDir 'data\update-request.json'
if (-not (Test-Path -LiteralPath $Request)) { exit 0 }   # the normal case, every minute: nothing to do, no log

# ---- one at a time -------------------------------------------------------------
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\TachTachUpdateRunner', [ref]$created)
if (-not $created) { exit 0 }

New-Item -ItemType Directory -Path $State -Force | Out-Null
New-Item -ItemType Directory -Path $JobDir -Force | Out-Null
$RunLog = Join-Path $State 'last-run.log'

function Say {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    [System.IO.File]::AppendAllText($RunLog, $line + "`r`n", $Utf8)
    try {
        New-Item -ItemType Directory -Path (Split-Path -Parent $MonthLog) -Force | Out-Null
        [System.IO.File]::AppendAllText($MonthLog, $line + "`r`n", $Utf8)
    } catch { }
}

function Remove-Request {
    # Never Remove-Item -Recurse here: on a junction, Windows PowerShell 5.1 would delete the TARGET's contents.
    try {
        $it = Get-Item -LiteralPath $Request -Force -ErrorAction Stop
        if ($it.PSIsContainer) { [System.IO.Directory]::Delete($Request, $false) } else { [System.IO.File]::Delete($Request) }
    } catch { Say "Could not remove the request file: $($_.Exception.Message)" }
}

# ---- 1. check the request --------------------------------------------------------
[System.IO.File]::WriteAllText($RunLog, '', $Utf8)
$item = Get-Item -LiteralPath $Request -Force
$refuse = $null
if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { $refuse = 'it is a link' }
elseif ($item.PSIsContainer) { $refuse = 'it is a folder' }
elseif ($item.Length -gt 4096) { $refuse = 'it is too large' }
else {
    $owner = (Get-Acl -LiteralPath $Request).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $LocalServiceSid) { $refuse = "wrong owner ($owner)" }
}
if ($refuse) { Say "Request refused: $refuse."; Remove-Request; exit 0 }

$Helper = Join-Path $Updater 'update-helper.mjs'
$ErrorActionPreference = 'Continue'
$action = (& $NodeExe $Helper validate $Request (Join-Path $State 'nonces.json') (Join-Path $State 'job.json') '-' 2>&1 | ForEach-Object { "$_" }) -join ' '
$validRc = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Remove-Request
if ($validRc -ne 0) { Say "Request refused: $action"; exit 0 }
$action = $action.Trim()
if ($action -ne 'update' -and $action -ne 'rollback') { Say 'Request refused: unexpected action.'; exit 0 }

# Belt and braces: nothing within 2 minutes of the last run (the website allows one per 5 minutes).
$lastFinished = Join-Path $State 'last-finished'
if (Test-Path -LiteralPath $lastFinished) {
    $age = ((Get-Date) - (Get-Item -LiteralPath $lastFinished).LastWriteTime).TotalSeconds
    if ($age -ge 0 -and $age -lt 120) { Say ("A run finished {0:N0} s ago; ignoring this request." -f $age); exit 0 }
}

# ---- helpers ----------------------------------------------------------------------
function Get-HeadCommit {
    # Reads .git\HEAD by hand: SYSTEM must not run git inside a folder lower accounts can write (hooks, config).
    try {
        $gitDir = Join-Path $ProjectDir '.git'
        $head = ([System.IO.File]::ReadAllText((Join-Path $gitDir 'HEAD'))).Trim()
        if ($head -match $HashRe) { return $head }
        if ($head -match '^ref: (refs/heads/[A-Za-z0-9._/-]+)$') {
            $ref = $Matches[1]
            $refFile = Join-Path $gitDir ($ref -replace '/', '\')
            if (Test-Path -LiteralPath $refFile) {
                $h = ([System.IO.File]::ReadAllText($refFile)).Trim()
                if ($h -match $HashRe) { return $h }
            }
            $packed = Join-Path $gitDir 'packed-refs'
            if (Test-Path -LiteralPath $packed) {
                foreach ($l in [System.IO.File]::ReadAllLines($packed)) {
                    $p = $l.Split(' ')
                    if ($p.Count -eq 2 -and $p[1] -eq $ref -and $p[0] -match $HashRe) { return $p[0] }
                }
            }
        }
    } catch { }
    return ''
}

$Started = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$From = ''; $To = ''; $RolledBack = '0'
$Previous = ''
$prevFile = Join-Path $State 'previous-commit'
if (Test-Path -LiteralPath $prevFile) { $Previous = ([System.IO.File]::ReadAllText($prevFile)).Trim() }
if ($Previous -notmatch $HashRe) { $Previous = '' }

function Write-Status {
    param([string]$StateName, [string]$Message = '')
    $finished = ''
    if ($StateName -eq 'success' -or $StateName -eq 'failed') { $finished = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
    $env:TT_STATE = $StateName; $env:TT_MESSAGE = $Message; $env:TT_FROM = $From; $env:TT_TO = $To
    $env:TT_STARTED = $Started; $env:TT_FINISHED = $finished; $env:TT_ROLLED_BACK = $RolledBack; $env:TT_PREVIOUS = $Previous
    $ErrorActionPreference = 'Continue'
    $null = & $NodeExe $Helper status $Updater '-' '-' (Join-Path $State 'job.json') $RunLog 2>&1
    if ($LASTEXITCODE -ne 0) { Say 'Could not write the status file.' }
}

function Get-TaskInfo { return Get-ScheduledTaskInfo -TaskPath $TaskPath -TaskName $WorkerTask }

function Invoke-Worker {
    # Writes the job (mode + target) where the worker can only READ it, starts the worker task, waits for it.
    param([string]$Mode, [string]$Target)
    $job = @{ mode = $Mode; target = $Target; at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $JobDir 'worker-job.json'), $job, $Utf8)
    $before = (Get-TaskInfo).LastRunTime
    Start-ScheduledTask -TaskPath $TaskPath -TaskName $WorkerTask
    $startDeadline = (Get-Date).AddSeconds(90)
    $deadline = (Get-Date).AddMinutes(40)
    $seenStart = $false
    while ($true) {
        Start-Sleep -Seconds 3
        $t = Get-ScheduledTask -TaskPath $TaskPath -TaskName $WorkerTask
        $i = Get-TaskInfo
        if ($t.State -eq 'Running') { $seenStart = $true }
        if ($i.LastRunTime -ne $before) { $seenStart = $true }
        if ($seenStart -and $t.State -ne 'Running') { break }
        if (-not $seenStart -and (Get-Date) -gt $startDeadline) { Say 'The update worker did not start.'; return 99 }
        if ((Get-Date) -gt $deadline) { Say 'The update worker took too long; stopping it.'; Stop-ScheduledTask -TaskPath $TaskPath -TaskName $WorkerTask -ErrorAction SilentlyContinue; return 98 }
    }
    $rc = [int](Get-TaskInfo).LastTaskResult
    # Copy the worker's log into ours (it is in a folder the worker can write: refuse links, cap the size).
    $wl = Join-Path $WorkDir 'worker.log'
    try {
        $wi = Get-Item -LiteralPath $wl -Force -ErrorAction Stop
        if (-not ($wi.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and -not $wi.PSIsContainer -and $wi.Length -lt 2MB) {
            [System.IO.File]::AppendAllText($RunLog, [System.IO.File]::ReadAllText($wl), $Utf8)
        }
    } catch { Say 'No worker log.' }
    return $rc
}

function Get-LastStage {
    $m = Select-String -LiteralPath $RunLog -Pattern 'TT_STAGE=([a-z]+)' -AllMatches -ErrorAction SilentlyContinue
    if (-not $m) { return '' }
    return @($m)[-1].Matches[-1].Groups[1].Value
}

function Get-ServerNodes {
    $needle = (Join-Path $ProjectDir 'server.js').ToLowerInvariant()
    return @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) })
}

function Stop-Server {
    Disable-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask | Out-Null
    Stop-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 30; $i++) {
        $left = @(Get-ServerNodes)
        if ($left.Count -eq 0) { return $true }
        foreach ($p in $left) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Test-Http {
    param([string]$Url)
    try {
        $r = [System.Net.HttpWebRequest]::Create($Url); $r.Proxy = $null; $r.Timeout = 3000; $r.AllowAutoRedirect = $false
        $resp = $r.GetResponse(); $resp.Close(); return $true
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) { $_.Exception.Response.Close(); return $true }
        return $false
    } catch { return $false }
}

function Start-ServerAndWait {
    Enable-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask | Out-Null
    Start-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask
    $url = "http://127.0.0.1:$Port/screen"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 3
        if (Test-Http $url) { Start-Sleep -Seconds 5; if (Test-Http $url) { return $true } }
    }
    Say 'The server did not come back.'
    return $false
}

function Restart-KioskBrowser {
    $n = 0
    foreach ($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.Contains('\TachTach\BrowserProfile') })) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $n++ } catch { }
    }
    if ($n -gt 0) { Say 'Closed the TV browser; the kiosk watcher opens it again with the new version.' }
}

function Backup-Data {
    $src = Join-Path $ProjectDir 'data'
    $dest = Join-Path $BackupDir ('data-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    $robo = Join-Path $env:SystemRoot 'System32\robocopy.exe'
    $ErrorActionPreference = 'Continue'
    $null = & $robo $src $dest /E /XJ /R:1 /W:1 /NFL /NDL /NP /NJH /NJS /XD uploads google-photos rss-cache .puppeteer-tmp update-cache.git pack-work 2>&1
    $rc = $LASTEXITCODE
    if ($rc -ge 8) { Say "Data backup had errors (robocopy $rc)." } else { Say "Data backed up to $dest" }
    foreach ($o in @(Get-ChildItem -LiteralPath $BackupDir -Directory -Filter 'data-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 10)) {
        Remove-Item -LiteralPath $o.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ---- 2. start ----------------------------------------------------------------------
$From = Get-HeadCommit
Say "=== software update ($action) requested ==="
Say ("Current version: {0}" -f $(if ($From) { $From.Substring(0, 7) } else { '?' }))
Write-Status 'running' 'Starting...'
$finishedOk = $false

try {
    if (-not $From) { Write-Status 'failed' 'Could not read the current version (is this a git checkout?).'; $finishedOk = $true; return }
    if ($action -eq 'rollback') {
        if (-not $Previous) { Say 'FAILED: nothing to go back to.'; Write-Status 'failed' 'There is no earlier version to go back to.'; $finishedOk = $true; return }
        if ($Previous -eq $From) { Say 'FAILED: already on the earlier version.'; Write-Status 'failed' 'The screen is already on the earlier version.'; $finishedOk = $true; return }
    }

    Backup-Data
    Say 'Stopping the server (Windows cannot replace program files that are in use)...'
    if (-not (Stop-Server)) { Say 'The server did not stop.'; Write-Status 'failed' 'The server could not be stopped, so nothing was changed.'; $finishedOk = $true; return }

    $target = ''
    $mode = 'update'
    if ($action -eq 'rollback') { $mode = 'rollback'; $target = $Previous }
    $rc = Invoke-Worker -Mode $mode -Target $target
    $ok = $false
    $reason = ''
    if ($rc -eq 0) {
        if (Start-ServerAndWait) { $ok = $true } else { $reason = 'The new version did not start properly.' }
    } else {
        $reason = 'The update did not finish.'
        if ($action -eq 'rollback') { $reason = 'The rollback did not finish.' }
    }

    if ($ok) {
        $To = Get-HeadCommit
        if ($To -and $To -ne $From) { [System.IO.File]::WriteAllText($prevFile, $From, $Utf8); $Previous = $From }
        Restart-KioskBrowser
        Say ("=== {0} complete: {1} -> {2} ===" -f $action, $From.Substring(0, 7), $(if ($To) { $To.Substring(0, 7) } else { '?' }))
        if ($action -eq 'rollback') { Write-Status 'success' 'Rolled back.' } else { Write-Status 'success' 'Updated.' }
        $finishedOk = $true
        return
    }

    $now = Get-HeadCommit
    $stage = Get-LastStage
    if (($stage -eq 'pull' -or $stage -eq '') -and $now -eq $From) {
        # Nothing changed (for example no internet): just start the same version again.
        $null = Start-ServerAndWait
        Say "FAILED: $reason Nothing was changed."
        Write-Status 'failed' ("$reason Nothing was changed; the screen is still on {0}." -f $From.Substring(0, 7))
        $finishedOk = $true
        return
    }

    Say 'Putting the earlier version back...'
    $null = Stop-Server
    $rrc = Invoke-Worker -Mode 'rollback' -Target $From
    if ($rrc -eq 0 -and (Start-ServerAndWait)) {
        $RolledBack = '1'
        $To = Get-HeadCommit
        Restart-KioskBrowser
        Say 'Earlier version restored.'
        Write-Status 'failed' ("$reason The earlier version ({0}) was put back and is running." -f $From.Substring(0, 7))
    } else {
        $To = Get-HeadCommit
        Say 'Could not restore the earlier version automatically.'
        Write-Status 'failed' "$reason The earlier version could not be put back automatically. Run deploy\windows\update.ps1 as administrator."
    }
    $finishedOk = $true
} catch {
    Say "Unexpected error: $($_.Exception.Message)"
} finally {
    # Never leave the screen without a server.
    try {
        $t = Get-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask -ErrorAction Stop
        if ($t.State -eq 'Disabled') { Enable-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask | Out-Null }
        if ((Get-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask).State -ne 'Running') { Start-ScheduledTask -TaskPath $TaskPath -TaskName $ServerTask }
    } catch { Say "Could not restart the server task: $($_.Exception.Message)" }
    if (-not $finishedOk) { Write-Status 'failed' 'The update stopped unexpectedly. See the log below.' }
    [System.IO.File]::WriteAllText($lastFinished, (Get-Date -Format 'o'), $Utf8)
}
exit 0
