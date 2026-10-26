# ============================================================================
#  TachTach Screens - update by hand (Windows). The twin of `bash deploy/update.sh` on the Pi.
# ============================================================================
#  Run in PowerShell AS ADMINISTRATOR:
#
#    powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\update.ps1
#
#  1. copies data\ to C:\ProgramData\TachTach\backups\data-<time>
#  2. stops the server (Windows cannot replace program files that are in use)
#  3. git pull (keeping locally edited data files), npm ci, npm run build
#  4. runs install.ps1 -Refresh from the NEW code (tasks, permissions, firewall, and the admin-only
#     copy of the update runner: like the Pi, those only change through this manual update)
#  5. starts the server and re-opens the TV browser
#  The website's "Software update" button does steps 1-3 and 5 by itself; use this script for the very
#  first update after install, when the button reports a problem, or when an update says system files changed.
#  PowerShell reads this whole file before running it, so `git pull` changing it is harmless.
#  Log: C:\ProgramData\TachTach\logs\update\manual-<time>.log
# ============================================================================

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-TTAdmin
Set-TTLogFile -Path (Join-Path (Join-Path $script:TTLogRoot 'update') ('manual-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log'))

$config = Get-TTConfig
if (-not $config) { Write-TTLog 'TachTach is not installed on this PC yet. Run install.ps1 first.' 'ERROR'; exit 1 }
$projectDir = [string](Get-TTConfigValue $config 'ProjectDir' '')
$git = Get-TTGitExe $config
$node = Get-TTNodeExe $config
if (-not $projectDir -or -not $git -or -not $node) { Write-TTLog 'Missing project folder, git or node. Run install.ps1 again.' 'ERROR'; exit 1 }
$port = [int](Get-TTConfigValue $config 'Port' 3000)

Write-TTLog "=== Manual update of $projectDir ==="
$null = Backup-TTData -ProjectDir $projectDir
Write-TTLog 'Stopping the server...'
if (-not (Stop-TTServer -ProjectDir $projectDir)) { Write-TTLog 'The server did not stop; nothing was changed.' 'ERROR'; $null = Start-TTServer; exit 1 }

$rc = 1
try {
    $scratch = Join-Path $script:TTWorkDir 'manual'
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null
    $rc = Invoke-TTCodeUpdate -ProjectDir $projectDir -Mode update -GitExe $git -NodeExe $node -ScratchDir $scratch
    if ($rc -eq 0) {
        Write-TTLog 'Code updated. Refreshing tasks, permissions and the update helper...'
        & (Join-Path $projectDir 'deploy\windows\install.ps1') -InstallDir $projectDir -Refresh
        if ($LASTEXITCODE -ne 0) { Write-TTLog "install.ps1 -Refresh reported a problem (code $LASTEXITCODE); see its log." 'WARN' }
    } else {
        Write-TTLog "The update did not finish (code $rc). The server is started again on whatever is in the folder now." 'ERROR'
        Write-TTLog 'If the screen does not come back: send this log. The data backup is in C:\ProgramData\TachTach\backups.' 'ERROR'
    }
} finally {
    $null = Start-TTServer
}
if (Wait-TTServerUp -Port $port -TimeoutSeconds 90) { Write-TTLog 'Server is answering.' } else { Write-TTLog 'Server is NOT answering. Run health-check.ps1 and send the report.' 'ERROR' }
$n = Stop-TTKioskBrowser
if ($n -gt 0) { Write-TTLog 'TV browser closed; it opens again by itself within a minute.' }
Write-TTLog "=== Manual update finished (code $rc) ==="
exit $rc
