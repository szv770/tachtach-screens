# ============================================================================
#  TachTach Screens - remove from this Windows PC
# ============================================================================
#  Run in PowerShell AS ADMINISTRATOR:
#
#    powershell -ExecutionPolicy Bypass -File C:\TachTach\deploy\windows\uninstall.ps1
#        stops everything and removes the tasks, firewall rule, Edge policies and update helper.
#        KEEPS C:\TachTach (code + your data) so you can install again later.
#
#    ... uninstall.ps1 -RemoveEverything
#        also deletes C:\TachTach (asks you to type DELETE first). A copy of data\ is always made
#        to C:\ProgramData\TachTach\backups first, and that folder and the logs are kept.
#
#  Not undone (harmless, and you may want them): power settings, Windows Update active hours,
#  Node.js and Git, the automatic sign-in (turn it off in Autologon).
# ============================================================================

param([switch]$RemoveEverything)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-TTAdmin
Set-TTLogFile -Path (Join-Path (Join-Path $script:TTLogRoot 'install') ('uninstall-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log'))

$config = Get-TTConfig
$projectDir = [string](Get-TTConfigValue $config 'ProjectDir' (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))

if ($RemoveEverything) {
    Write-Host "This deletes $projectDir completely (code AND the screen's data: logins, schedule, photos)." -ForegroundColor Yellow
    $typed = Read-Host 'Type DELETE to continue, anything else to stop'
    if ($typed -cne 'DELETE') { Write-TTLog 'Stopped; nothing was removed.'; exit 1 }
}

Write-TTLog "=== Uninstalling TachTach Screens ($projectDir) ==="
if (Test-Path -LiteralPath (Join-Path $projectDir 'data')) { $null = Backup-TTData -ProjectDir $projectDir }

$null = Stop-TTServer -ProjectDir $projectDir
$null = Stop-TTKioskBrowser
foreach ($t in @($script:TTServerTask, $script:TTKioskTask, $script:TTUpdateTask, $script:TTWorkerTask)) {
    $task = Get-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $t -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $t -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskPath $script:TTTaskPath -TaskName $t -Confirm:$false
        Write-TTLog "Removed task: $t"
    }
}
$null = Stop-TTServer -ProjectDir $projectDir  # a supervisor that was mid-restart

Get-NetFirewallRule -Name 'TachTach-LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-TTLog 'Removed the firewall rule.'

if ([bool](Get-TTConfigValue $config 'EdgePoliciesSet' $false)) {
    $ep = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
    foreach ($k in @('HideFirstRunExperience', 'TranslateEnabled', 'PasswordManagerEnabled', 'BrowserSignin', 'SyncDisabled', 'HubsSidebarEnabled',
            'StartupBoostEnabled', 'BackgroundModeEnabled', 'DefaultBrowserSettingEnabled', 'ShowRecommendationsEnabled', 'PromotionalTabsEnabled',
            'UserFeedbackAllowed', 'EdgeShoppingAssistantEnabled', 'ShowMicrosoftRewards', 'SpotlightExperiencesAndRecommendationsEnabled', 'AutoplayAllowed')) {
        Remove-ItemProperty -Path $ep -Name $k -ErrorAction SilentlyContinue
    }
    Write-TTLog 'Removed the Edge policies this installer set.'
}

foreach ($d in @($script:TTUpdaterDir, $script:TTWorkDir)) {
    if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue; Write-TTLog "Removed $d" }
}
if (Test-Path -LiteralPath $script:TTConfigPath) { Remove-Item -LiteralPath $script:TTConfigPath -Force }

if ($RemoveEverything -and (Test-Path -LiteralPath $projectDir)) {
    # Plain folder delete. (Junctions inside are not expected; git does not create them.)
    Remove-Item -LiteralPath $projectDir -Recurse -Force
    Write-TTLog "Deleted $projectDir"
}
Write-TTLog "Done. Backups and logs are kept in $($script:TTProgramData) (delete that folder by hand if you want)."
exit 0
