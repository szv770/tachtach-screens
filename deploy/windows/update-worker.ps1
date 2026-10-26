# ============================================================================
#  TachTach Screens - the part of a software update that touches the code (Windows)
# ============================================================================
#  Runs as NETWORK SERVICE from the task "TachTach Update Worker", started ONLY by
#  update-runner.ps1 (SYSTEM) after it has checked the request and stopped the server.
#  The Windows twin of `runuser -u <user> -- bash deploy/update.sh` on the Pi:
#  git and npm never run as SYSTEM.
#
#  Reads what to do from C:\ProgramData\TachTach\updater\job\worker-job.json (written by
#  SYSTEM; this account can only read it): mode "update" (git pull --ff-only) or "rollback"
#  to an exact 40-character commit. Then npm ci + build.
#  Log: C:\ProgramData\TachTach\work\worker.log (copied into the update status by the runner).
# ============================================================================

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$workLog = Join-Path $script:TTWorkDir 'worker.log'
if (Test-Path -LiteralPath $workLog) { Remove-Item -LiteralPath $workLog -Force }
Set-TTLogFile -Path $workLog

try {
    $config = Get-TTConfig
    $projectDir = [string](Get-TTConfigValue $config 'ProjectDir' '')
    if (-not $projectDir -or -not (Test-Path -LiteralPath (Join-Path $projectDir '.git'))) { Write-TTLog "Project folder not found: $projectDir" 'ERROR'; exit 3 }
    $jobFile = Join-Path (Join-Path $script:TTUpdaterDir 'job') 'worker-job.json'
    $job = [System.IO.File]::ReadAllText($jobFile) | ConvertFrom-Json
    $mode = [string]$job.mode
    $target = [string]$job.target
    if ($mode -ne 'update' -and $mode -ne 'rollback') { Write-TTLog "Unknown mode: $mode" 'ERROR'; exit 2 }
    if ($mode -eq 'rollback' -and $target -notmatch '^[0-9a-f]{40}$') { Write-TTLog 'Rollback target is not a full commit hash.' 'ERROR'; exit 2 }
    if ($mode -eq 'update') { $target = '' }

    $git = Get-TTGitExe $config
    $node = Get-TTNodeExe $config
    if (-not $git -or -not $node) { Write-TTLog 'git or node not found.' 'ERROR'; exit 3 }

    # This account's own scratch space (npm cache, git HOME); never inside the project.
    $home2 = Join-Path $script:TTWorkDir 'home'
    New-Item -ItemType Directory -Path $home2 -Force | Out-Null
    $env:HOME = $home2
    $env:npm_config_cache = Join-Path $script:TTWorkDir 'npm-cache'
    $env:npm_config_update_notifier = 'false'
    $env:GIT_TERMINAL_PROMPT = '0'

    Write-TTLog "Worker running as $([Environment]::UserName): mode=$mode"
    $rc = Invoke-TTCodeUpdate -ProjectDir $projectDir -Mode $mode -Target $target -GitExe $git -NodeExe $node -ScratchDir $script:TTWorkDir
    Write-TTLog "Worker finished with code $rc."
    exit $rc
} catch {
    Write-TTLog "Worker error: $($_.Exception.Message)" 'ERROR'
    exit 1
}
