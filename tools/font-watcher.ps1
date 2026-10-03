# Keeps the Desktop font mirror current for the Affinity Arabic Text tool:
# syncs once at start, every time Affinity is launched, and whenever fonts are
# installed or removed. Whenever Affinity is closed it also makes sure the folder is still
# allowed under Settings > Scripting (allow-folder.ps1). Started hidden at logon by the "Arabic Text Font Sync" task.
$ErrorActionPreference = 'Continue'

# One watcher per user session.
$mutex = New-Object System.Threading.Mutex($false, 'Local\ArabicTextFontWatcher')
if (-not $mutex.WaitOne(0)) { exit }

$sync = Join-Path $PSScriptRoot 'sync-fonts.ps1'
$allow = Join-Path $PSScriptRoot 'allow-folder.ps1'
$log  = Join-Path $env:TEMP 'arabic-text-font-sync.log'
$fontDirs = @("$env:WINDIR\Fonts", "$env:LOCALAPPDATA\Microsoft\Windows\Fonts")

function Invoke-Sync([string]$reason) {
    try {
        $out = & $sync 2>&1 | Out-String
        Add-Content $log ("{0:s} [{1}] {2}" -f (Get-Date), $reason, $out.Trim())
    } catch {
        Add-Content $log ("{0:s} [{1}] ERROR {2}" -f (Get-Date), $reason, $_)
    }
}

function Invoke-Allow([string]$reason) {
    try {
        $out = & $allow 2>&1 | Out-String
        if ($out.Trim() -ne 'already-allowed') { Add-Content $log ('{0:s} [{1}] folder permission: {2}' -f (Get-Date), $reason, $out.Trim()) }
    } catch {
        Add-Content $log ('{0:s} [{1}] folder permission ERROR {2}' -f (Get-Date), $reason, $_)
    }
}

# Cheap signature of the installed fonts: file count plus newest write time per folder.
function Get-FontSignature {
    ($fontDirs | ForEach-Object {
        if (Test-Path $_) {
            $files = Get-ChildItem $_ -File -ErrorAction SilentlyContinue
            '{0}:{1}:{2}' -f $_, $files.Count, ($files | Measure-Object LastWriteTimeUtc -Maximum).Maximum.Ticks
        }
    }) -join '|'
}

Invoke-Sync 'logon'
Invoke-Allow 'logon'
$signature  = Get-FontSignature
$wasRunning = [bool](Get-Process Affinity -ErrorAction SilentlyContinue)
$tick = 0
while ($true) {
    Start-Sleep -Seconds 1
    $running = [bool](Get-Process Affinity -ErrorAction SilentlyContinue)
    if ($running -and -not $wasRunning) { Invoke-Sync 'affinity-started' }
    # Affinity writes its settings as it quits; restore the permission right after.
    if ($wasRunning -and -not $running) { Invoke-Allow 'affinity-closed' }
    $wasRunning = $running

    # Font folders are checked every ~15 s.
    if ((++$tick % 15) -eq 0) {
        $now = Get-FontSignature
        if ($now -ne $signature) {
            Start-Sleep -Seconds 5   # let an installer finish copying
            Invoke-Sync 'fonts-changed'
            $signature = Get-FontSignature
        }
    }
}
