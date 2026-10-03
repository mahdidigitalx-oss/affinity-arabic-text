# Installs the helpers of "Arabic Text for Affinity" for the current Windows user (no admin
# rights needed). Run it through install.cmd. Safe to run again to update or repair.
#  1. copies the Arabic-capable installed fonts to the Desktop folder the tool reads from;
#  2. registers a small hidden helper that starts at logon and keeps that folder current
#     (and re-allows it in Affinity's settings whenever Affinity is closed);
#  3. allows that folder under Affinity > Settings > Scripting.
# The tool itself is imported into Affinity's Scripts Library from the .afscript file.
$ErrorActionPreference = 'Stop'
$src  = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'ArabicTextForAffinity'
$task = 'Arabic Text Font Sync'

Write-Host ''
Write-Host 'Arabic Text for Affinity - installer' -ForegroundColor Cyan
Write-Host ''

# Stop a helper left running by an earlier install so its files can be replaced.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'font-watcher\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($f in 'sync-fonts.ps1', 'font-watcher.ps1', 'start-watcher.vbs', 'allow-folder.ps1', 'uninstall.ps1') {
    Copy-Item (Join-Path $src $f) $dest -Force
}
# Files from a downloaded zip carry the "downloaded from the internet" mark; without removing it
# Windows would ask for confirmation every time the helper starts at logon.
Get-ChildItem $dest -File | Unblock-File

Write-Host '[1/3] Copying Arabic fonts to the Desktop folder...'
& (Join-Path $dest 'sync-fonts.ps1') | ForEach-Object { Write-Host "      $_" }

Write-Host '[2/3] Registering the background helper (starts at logon)...'
$user = "$env:USERDOMAIN\$env:USERNAME"
$vbs = Join-Path $dest 'start-watcher.vbs'
$action    = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument "`"$vbs`""
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $task -Description 'Keeps the Desktop Arabic font folder current for the Affinity Arabic Text tool.' `
    -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host '      done'

Write-Host '[3/3] Allowing the folder in Affinity (Settings > Scripting)...'
$result = & (Join-Path $dest 'allow-folder.ps1')
switch ($result) {
    'allowed'          { Write-Host '      done' }
    'already-allowed'  { Write-Host '      already allowed' }
    'affinity-running' { Write-Host '      Affinity is open: close it once and the helper will allow the folder automatically.' -ForegroundColor Yellow }
    'no-settings-file' { Write-Host '      Affinity has not saved its settings yet: open and close Affinity once and the helper will allow the folder automatically.' -ForegroundColor Yellow }
    default            { Write-Host "      $result" }
}

Write-Host ''
Write-Host 'Last step, inside Affinity:' -ForegroundColor Cyan
Write-Host '  - Settings > Scripting: make sure scripting is enabled.'
Write-Host '  - Scripts Library panel (Window > Scripts Library): click the menu button next to the'
Write-Host '    Default category, choose Import Script..., and pick the .afscript file from this folder.'
Write-Host ''
