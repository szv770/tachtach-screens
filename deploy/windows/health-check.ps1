# ============================================================================
#  TachTach Screens - health check + "send this to the developer" report (Windows)
# ============================================================================
#  Run in PowerShell, best AS ADMINISTRATOR (it can then read every log and the data folder's permissions):
#
#    powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\health-check.ps1
#
#  Prints a short checklist (OK / WARN / FAIL) and makes a zip on your Desktop:
#  TachTach-report-<time>.zip, containing this report and the recent logs. It contains NO passwords
#  and none of the screen's data files (no logins, no student names). Send that zip.
# ============================================================================

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $env:TEMP "TachTach-report-$stamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$report = Join-Path $outDir 'report.txt'
$sb = New-Object System.Text.StringBuilder
$counts = @{ OK = 0; WARN = 0; FAIL = 0 }

function Add-Line { param([string]$t) $null = $sb.AppendLine($t) }
function Check {
    param([string]$Status, [string]$What, [string]$Detail = '')
    $counts[$Status]++
    $color = 'Green'; if ($Status -eq 'WARN') { $color = 'Yellow' } elseif ($Status -eq 'FAIL') { $color = 'Red' }
    Write-Host ('[{0,-4}] {1}  {2}' -f $Status, $What, $Detail) -ForegroundColor $color
    Add-Line ('[{0,-4}] {1}  {2}' -f $Status, $What, $Detail)
}
function Section { param([string]$t) Add-Line ''; Add-Line "==== $t ====" }

$config = Get-TTConfig
$projectDir = [string](Get-TTConfigValue $config 'ProjectDir' 'C:\TachTach')
$port = [int](Get-TTConfigValue $config 'Port' 3000)
Add-Line "TachTach Screens health report  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  computer $env:COMPUTERNAME  run as $([Environment]::UserName)  admin=$(Test-TTIsAdmin)"

# ---- the PC --------------------------------------------------------------------
Section 'Computer'
try {
    $os = Get-CimInstance Win32_OperatingSystem
    Add-Line "Windows: $($os.Caption) $($os.Version) build $($os.BuildNumber) $($os.OSArchitecture)"
    $up = (Get-Date) - $os.LastBootUpTime
    Add-Line ("Up since: {0} ({1:N1} days)" -f $os.LastBootUpTime, $up.TotalDays)
    Add-Line ("Memory free: {0:N0} MB of {1:N0} MB" -f ($os.FreePhysicalMemory / 1024), ($os.TotalVisibleMemorySize / 1024))
} catch { Add-Line "OS info failed: $($_.Exception.Message)" }
if ($config) { Check 'OK' 'Installed' "config $($script:TTConfigPath)" } else { Check 'FAIL' 'Installed' 'no C:\ProgramData\TachTach\tachtach.json - run install.ps1' }

$node = Get-TTNodeExe $config
if ($node) { Check 'OK' 'Node.js' ((& $node -v 2>$null) -join '') } else { Check 'FAIL' 'Node.js' 'not found' }
$git = Get-TTGitExe $config
if ($git) { Check 'OK' 'Git' ((& $git --version 2>$null) -join '') } else { Check 'WARN' 'Git' 'not found (updates will not work)' }

# ---- time --------------------------------------------------------------------------
Section 'Time'
$tz = Get-TimeZone
$iana = ''
if ($node) { $iana = (& $node -p 'Intl.DateTimeFormat().resolvedOptions().timeZone' 2>$null) -join '' }
Add-Line "Windows time zone: $($tz.Id) ($iana), now $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$siteZone = ''
try {
    $sj = [System.IO.File]::ReadAllText((Join-Path $projectDir 'data\settings.json')) | ConvertFrom-Json
    if ($sj.PSObject.Properties['location'] -and $sj.location -and $sj.location.PSObject.Properties['timezone']) { $siteZone = [string]$sj.location.timezone }
} catch { }
if (-not $siteZone) { Check 'WARN' 'Time zone' "PC: $iana; could not read the screen's own setting (run as administrator)" }
elseif ($siteZone -eq $iana) { Check 'OK' 'Time zone' "PC and screen both $iana" }
else { Check 'FAIL' 'Time zone' "PC is $iana but the screen is set to $siteZone - change one so they match (SETUP.md)" }
$w32 = (& w32tm /query /status 2>&1) -join "`n"
Add-Line $w32
if ($w32 -match 'Leap Indicator:\s*3') { Check 'WARN' 'Clock sync' 'Windows Time says not synchronised' }
elseif ($w32 -match 'Leap Indicator:\s*\d') { Check 'OK' 'Clock sync' (([regex]::Match($w32, 'Source:\s*(.+)')).Groups[1].Value.Trim()) }
else { Check 'WARN' 'Clock sync' 'could not ask Windows Time (try as administrator)' }

# ---- tasks ---------------------------------------------------------------------------
Section 'Scheduled tasks'
foreach ($t in @($script:TTServerTask, $script:TTKioskTask, $script:TTUpdateTask, $script:TTWorkerTask)) {
    $task = Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $t -ErrorAction SilentlyContinue
    if (-not $task) { Check 'FAIL' "Task $t" 'missing - run install.ps1'; continue }
    $i = Get-ScheduledTaskInfo -TaskPath $script:TTTaskPath -TaskName $t
    $detail = "state=$($task.State) user=$($task.Principal.UserId) last=$($i.LastRunTime) result=0x$('{0:X}' -f $i.LastTaskResult)"
    if ("$($task.State)" -eq 'Disabled') { Check 'FAIL' "Task $t" $detail }
    elseif ($t -eq $script:TTServerTask -and "$($task.State)" -ne 'Running') { Check 'FAIL' "Task $t" $detail }
    else { Check 'OK' "Task $t" $detail }
}

# ---- server + TV ---------------------------------------------------------------------
Section 'Server and TV'
$nodes = @(Get-TTServerNodeProcesses -ProjectDir $projectDir)
if ($nodes.Count -eq 1) { Check 'OK' 'Server process' "node.exe pid $($nodes[0].ProcessId)" }
elseif ($nodes.Count -eq 0) { Check 'FAIL' 'Server process' 'not running' }
else { Check 'WARN' 'Server process' "$($nodes.Count) copies running (only one should)" }
if (Test-TTHttp -Url "http://127.0.0.1:$port/screen") { Check 'OK' 'Server answers' "http://127.0.0.1:$port" } else { Check 'FAIL' 'Server answers' "nothing on port $port" }
try {
    $r = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/screen/state"); $r.Proxy = $null; $r.Timeout = 4000
    $resp = $r.GetResponse(); $rd = New-Object System.IO.StreamReader($resp.GetResponseStream()); $st = $rd.ReadToEnd() | ConvertFrom-Json; $resp.Close()
    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $last = 0
    if ($st.reportedAt) { $last = [double]$st.reportedAt }
    if ($st.display -and $st.display.reportedAt) { $last = [Math]::Max($last, [double]$st.display.reportedAt) }
    if ($last -gt 0) {
        $ageMin = ($nowMs - $last) / 60000
        if ($ageMin -lt 10) { Check 'OK' 'TV page reporting' ("last heard {0:N1} min ago" -f $ageMin) } else { Check 'WARN' 'TV page reporting' ("last heard {0:N0} min ago" -f $ageMin) }
    } else { Check 'WARN' 'TV page reporting' 'the TV has not reported since the server started' }
    if ($st.display) { Add-Line "TV reported: $($st.display.width) x $($st.display.height) device pixels, scale $($st.display.dpr), $($st.display.orientation)" }
} catch { Check 'WARN' 'TV page reporting' "could not ask the server: $($_.Exception.Message)" }
$kiosk = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.Contains('\TachTach\BrowserProfile') })
if ($kiosk.Count -gt 0) { Check 'OK' 'TV browser' "$($kiosk.Count) browser processes" } else { Check 'FAIL' 'TV browser' 'not running (is the screen account signed in?)' }
try {
    foreach ($v in @(Get-CimInstance Win32_VideoController)) { Add-Line "Display adapter: $($v.Name) driver $($v.DriverVersion) mode $($v.CurrentHorizontalResolution)x$($v.CurrentVerticalResolution)" }
    $mons = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue)
    Add-Line "Monitors connected: $($mons.Count)"
} catch { }

# ---- network -------------------------------------------------------------------------
Section 'Network'
foreach ($p in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
    if ("$($p.NetworkCategory)" -eq 'Public') { Check 'WARN' "Network $($p.Name)" 'Public: phones cannot reach the admin page (set it to Private)' }
    else { Check 'OK' "Network $($p.Name)" "$($p.NetworkCategory), internet=$($p.IPv4Connectivity)" }
}
$fw = Get-NetFirewallRule -Name 'TachTach-LAN' -ErrorAction SilentlyContinue
if ($fw -and "$($fw.Enabled)" -eq 'True') { Check 'OK' 'Firewall rule' 'TachTach Screens (LAN) enabled' } else { Check 'WARN' 'Firewall rule' 'missing or off' }
foreach ($l in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port -or $_.LocalPort -eq 3443 })) {
    Add-Line "Listening: $($l.LocalAddress):$($l.LocalPort) pid $($l.OwningProcess)"
}
foreach ($a in @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' })) { Add-Line "Address: $($a.IPAddress) ($($a.InterfaceAlias))" }

# ---- power, disk, data ---------------------------------------------------------------
Section 'Power and disk'
Add-Line ((& powercfg /getactivescheme 2>&1) -join ' ')
foreach ($q in @('SUB_VIDEO VIDEOIDLE', 'SUB_SLEEP STANDBYIDLE')) {
    $out = (& powercfg /q SCHEME_CURRENT $q.Split(' ')[0] $q.Split(' ')[1] 2>&1) -join "`n"
    $ac = [regex]::Match($out, 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)')
    if ($ac.Success) {
        if ([Convert]::ToInt32($ac.Groups[1].Value, 16) -eq 0) { Check 'OK' "Power $q" 'never' } else { Check 'WARN' "Power $q" ("after {0} s - should be never" -f [Convert]::ToInt32($ac.Groups[1].Value, 16)) }
    } else { Add-Line "Power $q : could not read (language?)" }
}
try {
    $drive = Get-PSDrive -Name ($projectDir.Substring(0, 1))
    $freeGb = $drive.Free / 1GB
    if ($freeGb -lt 2) { Check 'FAIL' 'Disk space' ("{0:N1} GB free" -f $freeGb) } elseif ($freeGb -lt 10) { Check 'WARN' 'Disk space' ("{0:N1} GB free" -f $freeGb) } else { Check 'OK' 'Disk space' ("{0:N1} GB free" -f $freeGb) }
} catch { }
if (Test-TTIsAdmin) { Add-Line ((& icacls (Join-Path $projectDir 'data') 2>&1) -join "`n") }
$envPath = Join-Path $projectDir '.env'
if (Test-Path -LiteralPath $envPath) { Add-Line '.env:'; foreach ($l in [System.IO.File]::ReadAllLines($envPath)) { Add-Line "  $l" } }
$status = Join-Path $script:TTUpdaterDir 'update-status.json'
if (Test-Path -LiteralPath $status) { Add-Line 'Last software update:'; Add-Line ([System.IO.File]::ReadAllText($status)) }

# ---- logs ------------------------------------------------------------------------------
Section 'Recent log lines'
$logsOut = Join-Path $outDir 'logs'
New-Item -ItemType Directory -Path $logsOut -Force | Out-Null
$pick = @()
foreach ($sub in @('server', 'kiosk', 'update', 'install')) {
    $d = Join-Path $script:TTLogRoot $sub
    $pick += @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 6)
}
$wl = Join-Path $script:TTWorkDir 'worker.log'
if (Test-Path -LiteralPath $wl) { $pick += @(Get-Item -LiteralPath $wl) }
foreach ($f in $pick) {
    try {
        # Open with sharing: the running server keeps its log file open.
        $fs = New-Object System.IO.FileStream($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
            $len = [Math]::Min($fs.Length, 2MB); $null = $fs.Seek(-$len, [System.IO.SeekOrigin]::End)
            $buf = New-Object byte[] $len; $null = $fs.Read($buf, 0, $len)
        } finally { $fs.Close() }
        [System.IO.File]::WriteAllBytes((Join-Path $logsOut ($f.Directory.Name + '-' + $f.Name)), $buf)
        $text = [System.Text.Encoding]::UTF8.GetString($buf)
        $lines = $text -split "`r?`n"
        Add-Line "--- $($f.FullName) (last 40 lines)"
        foreach ($l in ($lines | Select-Object -Last 40)) { Add-Line "  $l" }
    } catch { Add-Line "--- $($f.FullName): $($_.Exception.Message)" }
}

[System.IO.File]::WriteAllText($report, $sb.ToString(), $script:Utf8NoBom)
$desktop = [Environment]::GetFolderPath('Desktop')
$zip = Join-Path $desktop "TachTach-report-$stamp.zip"
try {
    Compress-Archive -Path (Join-Path $outDir '*') -DestinationPath $zip -Force
    Remove-Item -LiteralPath $outDir -Recurse -Force -ErrorAction SilentlyContinue
} catch { $zip = $outDir }
Write-Host ''
Write-Host ("Summary: {0} OK, {1} warnings, {2} problems." -f $counts.OK, $counts.WARN, $counts.FAIL)
Write-Host "Report saved: $zip  (send this file)"
