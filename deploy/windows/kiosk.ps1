# ============================================================================
#  TachTach Screens - the TV browser (Windows)
# ============================================================================
#  Started at sign-in of the screen's Windows account by the task "TachTach Kiosk".
#  The Windows twin of deploy/kiosk-launch.sh + tachtach-kiosk.service:
#    1. waits for the TachTach server to answer (max 5 minutes, then tries anyway)
#    2. clears the browser's "did not shut down correctly" state (no restore bubble)
#    3. opens Edge (or Chrome) full screen on http://127.0.0.1:<port>/screen with its own
#       profile folder, so the person's normal browser is never touched
#    4. keeps watching, every 15 s:
#         - browser gone                       -> open it again
#         - server up but the TV has not said
#           anything for 15 minutes (it reports
#           at least every 5 minutes)          -> the page is stuck: close + open again
#         - optional daily restart time        -> close + open again
#  It also keeps the display awake while it runs and parks the mouse pointer in a corner.
#  Log: C:\ProgramData\TachTach\logs\kiosk\kiosk-<month>.log
#
#  Settings (C:\ProgramData\TachTach\tachtach.json, written by install.ps1):
#    Port (3000), Browser (auto|edge|chrome), KioskUseHttps (false), KioskDisableGpu (false),
#    KioskDailyRestart ("" or "03:15"), KioskStaleMinutes (15)
# ============================================================================

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$config = Get-TTConfig
$port = [int](Get-TTConfigValue $config 'Port' 3000)
$browserPref = [string](Get-TTConfigValue $config 'Browser' 'auto')
$useHttps = [bool](Get-TTConfigValue $config 'KioskUseHttps' $false)
$disableGpu = [bool](Get-TTConfigValue $config 'KioskDisableGpu' $false)
$dailyRestart = [string](Get-TTConfigValue $config 'KioskDailyRestart' '')
$staleMinutes = [int](Get-TTConfigValue $config 'KioskStaleMinutes' 15)
$httpsPort = [int](Get-TTConfigValue $config 'HttpsPort' 3443)

Set-TTLogFile -Path (Join-Path (Join-Path $script:TTLogRoot 'kiosk') ('kiosk-' + (Get-Date -Format 'yyyyMM') + '.log'))

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\TachTachKiosk', [ref]$created)
if (-not $created) { exit 0 }  # already running in this session (the 5-minute trigger just checks)

Add-Type -Namespace TachTach -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
'@

# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED: no sleep, no screen-off while this script runs.
$null = [TachTach.Native]::SetThreadExecutionState([uint32]2147483651)

function Set-UserQuietSettings {
    # This account only (HKCU): no screen saver, no toast pop-ups, no "tips" / "get even more out of Windows".
    $pairs = @(
        @('HKCU:\Control Panel\Desktop', 'ScreenSaveActive', '0', 'String'),
        @('HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications', 'ToastEnabled', 0, 'DWord'),
        @('HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager', 'SoftLandingEnabled', 0, 'DWord'),
        @('HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager', 'SubscribedContent-310093Enabled', 0, 'DWord'),
        @('HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager', 'SubscribedContent-338389Enabled', 0, 'DWord'),
        @('HKCU:\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement', 'ScoobeSystemSettingEnabled', 0, 'DWord')
    )
    foreach ($p in $pairs) {
        try {
            if (-not (Test-Path -LiteralPath $p[0])) { New-Item -Path $p[0] -Force | Out-Null }
            New-ItemProperty -LiteralPath $p[0] -Name $p[1] -Value $p[2] -PropertyType $p[3] -Force | Out-Null
        } catch { Write-TTLog "Could not set $($p[0])\$($p[1]): $($_.Exception.Message)" 'WARN' }
    }
}

function Find-Browser {
    $edge = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
    $chrome = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    $order = @()
    if ($browserPref -eq 'chrome') { $order = $chrome + $edge } else { $order = $edge + $chrome }
    foreach ($b in $order) {
        if ($b -and (Test-Path -LiteralPath $b)) {
            if ($b.ToLowerInvariant().EndsWith('msedge.exe')) { return @{ Path = $b; Kind = 'edge' } }
            return @{ Path = $b; Kind = 'chrome' }
        }
    }
    return $null
}

function Get-ProfileDir {
    param([string]$Kind)
    return (Join-Path $env:LOCALAPPDATA ('TachTach\BrowserProfile-' + $Kind))
}

function Clear-CrashState {
    # A power cut leaves "exited_cleanly":false and a "Restore pages?" bubble; the Pi launcher does the same fix-up.
    param([string]$ProfileDir)
    $prefs = Join-Path $ProfileDir 'Default\Preferences'
    if (-not (Test-Path -LiteralPath $prefs)) { return }
    try {
        $t = [System.IO.File]::ReadAllText($prefs)
        $n = $t -replace '"exited_cleanly":\s*false', '"exited_cleanly":true' -replace '"exit_type":\s*"[^"]*"', '"exit_type":"Normal"'
        if ($n -ne $t) { [System.IO.File]::WriteAllText($prefs, $n, $script:Utf8NoBom) }
    } catch { Write-TTLog "Could not tidy the browser profile: $($_.Exception.Message)" 'WARN' }
}

function Get-KioskProcesses {
    param([string]$ProfileDir)
    $needle = $ProfileDir.ToLowerInvariant()
    return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle)
    })
}

function Stop-Kiosk {
    param([string]$ProfileDir)
    foreach ($p in (Get-KioskProcesses -ProfileDir $ProfileDir)) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } }
    Start-Sleep -Seconds 2
}

function Test-TcpOpen {
    param([int]$Port)
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(2000)) { return $false }
        $c.EndConnect($iar)
        return $true
    } catch { return $false } finally { $c.Close() }
}

function Get-LastScreenReportMs {
    # The TV's page reports to the server on every slide change and its size every 5 minutes. This asks the server
    # (localhost-only endpoint) when it last heard from it. $null = unknown (server down or not answering JSON).
    try {
        $r = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/screen/state")
        $r.Proxy = $null
        $r.Timeout = 4000
        $resp = $r.GetResponse()
        try {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $j = $sr.ReadToEnd() | ConvertFrom-Json
        } finally { $resp.Close() }
        $best = 0
        if ($j.PSObject.Properties['reportedAt'] -and $j.reportedAt) { $best = [double]$j.reportedAt }
        if ($j.PSObject.Properties['display'] -and $j.display -and $j.display.PSObject.Properties['reportedAt'] -and $j.display.reportedAt) {
            $best = [Math]::Max($best, [double]$j.display.reportedAt)
        }
        return $best
    } catch { return $null }
}

function Get-NowMs { return [double][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function Start-Kiosk {
    param($Browser, [string]$Url)
    $profileDir = Get-ProfileDir -Kind $Browser.Kind
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
    Clear-CrashState -ProfileDir $profileDir
    $a = @('--user-data-dir="' + $profileDir + '"', '--no-first-run', '--no-default-browser-check', '--noerrdialogs',
        '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', '--disable-translate', '--disable-features=Translate,TranslateUI',
        '--disable-pinch', '--overscroll-history-navigation=0', '--autoplay-policy=no-user-gesture-required',
        '--check-for-update-interval=31536000')
    if ($Browser.Kind -eq 'edge') { $a += @('--kiosk', $Url, '--edge-kiosk-type=fullscreen') } else { $a += @('--kiosk', $Url) }
    if ($Url.StartsWith('https://')) { $a += '--allow-insecure-localhost' }
    if ($disableGpu) { $a += '--disable-gpu' }
    $argLine = $a -join ' '
    Write-TTLog "Opening $($Browser.Kind): $($Browser.Path) $argLine"
    $null = Start-Process -FilePath $Browser.Path -ArgumentList $argLine -PassThru
    # Park the pointer bottom-right (Edge kiosk mode does not hide it). Unplugging the mouse is better still.
    try { $null = [TachTach.Native]::SetCursorPos([TachTach.Native]::GetSystemMetrics(0) - 1, [TachTach.Native]::GetSystemMetrics(1) - 1) } catch { }
    return (Get-Date)
}

# ---- main ------------------------------------------------------------------
Write-TTLog "Kiosk watcher starting for $([Environment]::UserName)."
Set-UserQuietSettings
$browser = Find-Browser
if (-not $browser) { Write-TTLog 'Neither Edge nor Chrome was found.' 'ERROR'; exit 1 }
$profileDir = Get-ProfileDir -Kind $browser.Kind
$httpUrl = "http://127.0.0.1:$port/screen"

# 1. Wait for the server (max 5 minutes, then open anyway: the watcher re-opens once the server is there).
$waitUntil = (Get-Date).AddMinutes(5)
$logged = $false
while ((Get-Date) -lt $waitUntil) {
    if (Test-TTHttp -Url $httpUrl) { break }
    if (-not $logged) { Write-TTLog "Waiting for the TachTach server at $httpUrl ..."; $logged = $true }
    Start-Sleep -Seconds 2
}

function Get-ScreenUrl {
    if ($useHttps -and (Test-TcpOpen -Port $httpsPort)) { return "https://127.0.0.1:$httpsPort/screen" }
    return $httpUrl
}

# A browser left from before (e.g. this script was restarted) is closed so we know exactly what we watch.
if (@(Get-KioskProcesses -ProfileDir $profileDir).Count -gt 0) { Write-TTLog 'Closing a kiosk browser left from before.'; Stop-Kiosk -ProfileDir $profileDir }

$launchedAt = Start-Kiosk -Browser $browser -Url (Get-ScreenUrl)
$launches = New-Object System.Collections.ArrayList
$null = $launches.Add((Get-Date))
$serverBackAt = Get-Date
$serverWasUp = $true
$lastDailyRestart = ''

while ($true) {
    Start-Sleep -Seconds 15
    try {
        $now = Get-Date
        $serverUp = Test-TTHttp -Url $httpUrl
        if ($serverUp -and -not $serverWasUp) { $serverBackAt = $now; Write-TTLog 'Server is answering again.' }
        if (-not $serverUp -and $serverWasUp) { Write-TTLog 'Server is not answering (restarting or updating?). Leaving the browser alone.' 'WARN' }
        $serverWasUp = $serverUp

        $reason = $null
        if (@(Get-KioskProcesses -ProfileDir $profileDir).Count -eq 0) {
            $reason = 'the browser is not running'
        } elseif ($serverUp) {
            $last = Get-LastScreenReportMs
            if ($null -ne $last) {
                # Count from whichever is latest: the last report, the browser start, or the server coming back.
                $base = [Math]::Max($last, [Math]::Max([double]([DateTimeOffset]$launchedAt).ToUnixTimeMilliseconds(), [double]([DateTimeOffset]$serverBackAt).ToUnixTimeMilliseconds()))
                if (((Get-NowMs) - $base) -gt ($staleMinutes * 60000)) { $reason = "the screen has not reported for over $staleMinutes minutes (page stuck?)" }
                # A page that loads reports at once; after a (re)start or the server coming back, 6 silent minutes means it
                # is showing an error page (e.g. it loaded while the server was down) rather than the screen.
                $sinceMs = [Math]::Max([double]([DateTimeOffset]$launchedAt).ToUnixTimeMilliseconds(), [double]([DateTimeOffset]$serverBackAt).ToUnixTimeMilliseconds())
                if (-not $reason -and $last -lt $sinceMs -and ((Get-NowMs) - $sinceMs) -gt 360000) { $reason = 'the screen page did not connect within 6 minutes' }
            }
        }
        if (-not $reason -and $dailyRestart -match '^\d{1,2}:\d{2}$') {
            $parts = $dailyRestart.Split(':')
            $at = $now.Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
            $today = $now.ToString('yyyy-MM-dd')
            if ($now -ge $at -and $now -lt $at.AddMinutes(10) -and $lastDailyRestart -ne $today -and $launchedAt -lt $at) {
                $reason = "daily restart ($dailyRestart)"
                $lastDailyRestart = $today
            }
        }
        if (-not $reason) { continue }

        # Do not hammer: more than 5 starts in 10 minutes -> wait 2 minutes first.
        $recent = @($launches | Where-Object { $_ -gt $now.AddMinutes(-10) })
        if ($recent.Count -ge 5) { Write-TTLog 'Browser keeps failing; waiting 2 minutes before trying again.' 'WARN'; Start-Sleep -Seconds 120 }

        Write-TTLog "Restarting the browser: $reason." 'WARN'
        Stop-Kiosk -ProfileDir $profileDir
        $launchedAt = Start-Kiosk -Browser $browser -Url (Get-ScreenUrl)
        $null = $launches.Add((Get-Date))
        while ($launches.Count -gt 20) { $launches.RemoveAt(0) }
    } catch {
        # One bad round (a WMI hiccup, a browser that would not start) must not end the watcher.
        Write-TTLog "Watcher error: $($_.Exception.Message)" 'WARN'
    }
}
