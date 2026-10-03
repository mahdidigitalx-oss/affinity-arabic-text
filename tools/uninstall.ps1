# Removes the helpers of "Arabic Text for Affinity" for the current Windows user.
# Deletes only what the installer created: the logon task, its files, and the font copies in the
# Desktop folder. Anything else you saved in that folder is left alone.
$ErrorActionPreference = 'Continue'
$dest = Join-Path $env:LOCALAPPDATA 'ArabicTextForAffinity'

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'font-watcher\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Unregister-ScheduledTask -TaskName 'Arabic Text Font Sync' -Confirm:$false -ErrorAction SilentlyContinue

$folderName = -join [char[]](0x062E,0x0637,0x0648,0x0637,0x20,0x0627,0x0644,0x0646,0x0635,0x20,0x0627,0x0644,0x0639,0x0631,0x0628,0x064A)
$root = Join-Path ([Environment]::GetFolderPath('Desktop')) $folderName
if (Test-Path $root) {
    Remove-Item (Join-Path $root 'fonts') -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($f in 'fonts.json', 'settings.json', 'loader-log.txt', 'ArabicText.js', 'THIRD_PARTY_LICENSES.txt') {
        Remove-Item (Join-Path $root $f) -Force -ErrorAction SilentlyContinue
    }
    if (-not (Get-ChildItem $root -Force)) { Remove-Item $root -Force }
    else { Write-Host "Kept $root because it contains your own files." }
}
if ((Split-Path $PSCommandPath -Parent) -ne $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
else { Start-Process cmd.exe -ArgumentList '/c', "timeout /t 2 >nul & rmdir /s /q `"$dest`"" -WindowStyle Hidden }

Write-Host 'Removed. To finish, delete the script from Affinity''s Scripts Library panel (right-click > Delete Script).'
