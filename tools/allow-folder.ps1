# Makes sure the tool's Desktop folder is listed under Settings > Scripting in Affinity, so
# scripts run from the Scripts panel may read the fonts there.
# Affinity keeps its settings in memory and writes them only when it quits normally, so a
# folder added in a session that later crashed is lost. This puts it back, but only while
# Affinity is closed (a running Affinity would overwrite the file when it quits).
# Prints what it did. -Prefs/-Test are for trying it on a copy of the settings file.
param(
    [string]$Prefs = (Join-Path $env:APPDATA 'Affinity\Affinity\3.0\Settings\ScriptingPreferences.xml'),
    [switch]$Test
)
$ErrorActionPreference = 'Stop'

if (-not $Test -and (Get-Process Affinity -ErrorAction SilentlyContinue)) { 'affinity-running'; exit 0 }
if (-not (Test-Path $Prefs)) { 'no-settings-file'; exit 0 }

# Folder name is Arabic for "Arabic Text Fonts", spelled with code points so the script stays ASCII.
$folderName = -join [char[]](0x062E,0x0637,0x0648,0x0637,0x20,0x0627,0x0644,0x0646,0x0635,0x20,0x0627,0x0644,0x0639,0x0631,0x0628,0x064A)
$folder = Join-Path ([Environment]::GetFolderPath('Desktop')) $folderName

$xml = New-Object System.Xml.XmlDocument
$xml.Load($Prefs)
$settings = $xml.DocumentElement
$folders = $settings.SelectSingleNode('Folders')
if (-not $folders) {
    $folders = $xml.CreateElement('Folders')
    [void]$settings.AppendChild($folders)
}
foreach ($node in $folders.SelectNodes('string')) {
    if ($node.InnerText.TrimEnd('\', '/') -ieq $folder) { 'already-allowed'; exit 0 }
}
$entry = $xml.CreateElement('string')
$entry.InnerText = $folder
[void]$folders.AppendChild($entry)

Copy-Item $Prefs "$Prefs.bak" -Force
$ws = New-Object System.Xml.XmlWriterSettings
$ws.Indent = $true
$ws.IndentChars = "`t"
$ws.Encoding = New-Object System.Text.UTF8Encoding($true)
$w = [System.Xml.XmlWriter]::Create($Prefs, $ws)
try { $xml.Save($w) } finally { $w.Close() }
'allowed'
