# ============================================================================
#  TachTach Screens - keep the server running (Windows)
# ============================================================================
#  Started by the scheduled task "TachTach Server" (account: LOCAL SERVICE, at startup,
#  and every minute "if not already running"). The Windows twin of tachtach-server.service
#  with Restart=always: it runs `node server.js`, writes its output to
#  C:\ProgramData\TachTach\logs\server\, and starts it again 5 s after it stops
#  (longer if it keeps crashing straight away).
#
#  Do not run this by hand while the task is running (it would start a second server that
#  cannot get the port). To restart the server: Restart the task in Task Scheduler, or run
#  deploy\windows\update.ps1 / install.ps1 as administrator.
# ============================================================================

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$config = Get-TTConfig
$projectDir = Get-TTConfigValue $config 'ProjectDir' (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$logDir = Join-Path $script:TTLogRoot 'server'
Set-TTLogFile -Path (Join-Path $logDir ('supervisor-' + (Get-Date -Format 'yyyyMM') + '.log'))

# Only one supervisor at a time (the 1-minute trigger also refuses a second copy; this is belt and braces).
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\TachTachServerSupervisor', [ref]$created)
if (-not $created) { Write-TTLog 'Another supervisor is already running; exiting.' -Quiet; exit 0 }

$node = Get-TTNodeExe $config
if (-not $node) { Write-TTLog 'node.exe was not found. Run deploy\windows\install.ps1 as administrator.' 'ERROR'; exit 1 }
$serverJs = Join-Path $projectDir 'server.js'
if (-not (Test-Path -LiteralPath $serverJs)) { Write-TTLog "server.js not found in $projectDir" 'ERROR'; exit 1 }

# A node left over from an earlier supervisor (stopping a task does not always stop its children) holds the port.
foreach ($p in @(Get-TTServerNodeProcesses -ProjectDir $projectDir)) {
    Write-TTLog "Stopping a leftover server process (pid $($p.ProcessId))." 'WARN'
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { Write-TTLog "Could not stop it: $($_.Exception.Message)" 'WARN' }
}

$fastFailures = 0
while ($true) {
    # Keep the newest 20 server logs (each start gets its own pair of files).
    foreach ($kind in @('out', 'err')) {
        $old = @(Get-ChildItem -LiteralPath $logDir -Filter ("server-*-$kind.log") -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 20)
        foreach ($o in $old) { Remove-Item -LiteralPath $o.FullName -Force -ErrorAction SilentlyContinue }
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $out = Join-Path $logDir "server-$stamp-out.log"
    $err = Join-Path $logDir "server-$stamp-err.log"
    $started = Get-Date
    Write-TTLog "Starting: $node $serverJs (as $([Environment]::UserName))"
    try {
        $p = Start-Process -FilePath $node -ArgumentList ('"' + $serverJs + '"') -WorkingDirectory $projectDir -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
        $null = $p.Handle
        $p.WaitForExit()
        $code = $p.ExitCode
    } catch {
        $code = -1
        Write-TTLog "Could not start node: $($_.Exception.Message)" 'ERROR'
    }
    $ran = ((Get-Date) - $started).TotalSeconds
    Write-TTLog ("Server stopped (exit code {0}) after {1:N0} s." -f $code, $ran) 'WARN'
    if ($ran -lt 60) { $fastFailures++ } else { $fastFailures = 0 }
    # 5 s normally; when it dies at once again and again (bad build, port taken) back off up to 60 s.
    $wait = [Math]::Min(60, 5 * [Math]::Pow(2, [Math]::Min($fastFailures, 4)))
    if ($fastFailures -eq 0) { $wait = 5 }
    Start-Sleep -Seconds ([int]$wait)
}
