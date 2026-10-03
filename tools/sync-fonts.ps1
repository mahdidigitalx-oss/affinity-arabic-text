# Copies every installed font that can render Arabic into a folder on the Desktop,
# the only place Affinity lets scripts read files from (hidden or dot-named folders are refused), and writes an
# index the Arabic Text tool reads. Safe to run repeatedly: only changed files are copied.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

$desktop = [Environment]::GetFolderPath('Desktop')
# Folder name is Arabic for "Arabic Text Fonts", spelled with code points so the script stays ASCII for PowerShell 5.1.
$folderName = -join [char[]](0x062E,0x0637,0x0648,0x0637,0x20,0x0627,0x0644,0x0646,0x0635,0x20,0x0627,0x0644,0x0639,0x0631,0x0628,0x064A)
$root    = Join-Path $desktop $folderName
$dest    = Join-Path $root 'fonts'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$sources = @("$env:WINDIR\Fonts", "$env:LOCALAPPDATA\Microsoft\Windows\Fonts")
$files = foreach ($s in $sources) {
    if (Test-Path $s) { Get-ChildItem $s -File | Where-Object { $_.Extension -match '^\.(ttf|otf|ttc)$' } }
}

function Get-Faces([string]$path) {
    # A .ttc holds several faces; GlyphTypeface addresses them with a #index fragment.
    $faces = @()
    for ($i = 0; $i -lt 64; $i++) {
        $uri = if ($i -eq 0) { [Uri]$path } else { [Uri]("$path#$i") }
        try { $gt = New-Object System.Windows.Media.GlyphTypeface $uri } catch { break }
        $faces += [pscustomobject]@{ Index = $i; Typeface = $gt }
        if ($path -notmatch '\.ttc$') { break }
    }
    $faces
}

function Pick-Name($dict) {
    foreach ($lang in 'en-us', 'en') {
        foreach ($k in $dict.Keys) { if ($k.IetfLanguageTag -eq $lang) { return $dict[$k] } }
    }
    foreach ($k in $dict.Keys) { return $dict[$k] }
}

$index = @()
$keep  = @{}
foreach ($f in $files) {
    try { $faces = Get-Faces $f.FullName } catch { continue }
    $arabicFaces = @($faces | Where-Object {
        $m = $_.Typeface.CharacterToGlyphMap
        $m.ContainsKey(0x0627) -and $m.ContainsKey(0x0644) -and $m.ContainsKey(0x0628)
    })
    if ($arabicFaces.Count -eq 0) { continue }

    # Same file name can exist in both the system and the per-user folder; prefix the per-user copy.
    $name = if ($f.DirectoryName -like "$env:LOCALAPPDATA*") { "user-" + $f.Name } else { $f.Name }
    $target = Join-Path $dest $name
    $keep[$name] = $true
    $existing = Get-Item $target -ErrorAction SilentlyContinue
    if (-not $existing -or $existing.Length -ne $f.Length -or $existing.LastWriteTimeUtc -ne $f.LastWriteTimeUtc) {
        Copy-Item $f.FullName $target -Force
        (Get-Item $target).LastWriteTimeUtc = $f.LastWriteTimeUtc
    }
    foreach ($face in $arabicFaces) {
        $gt = $face.Typeface
        $index += [pscustomobject]@{
            file   = $name
            index  = $face.Index
            family = (Pick-Name $gt.Win32FamilyNames)
            typographicFamily = (Pick-Name $gt.FamilyNames)
            style  = (Pick-Name $gt.FaceNames)
            weight = $gt.Weight.ToOpenTypeWeight()
            italic = ($gt.Style.ToString() -ne 'Normal')
            stretch = $gt.Stretch.ToOpenTypeStretch()
        }
    }
}

# Remove copies of fonts that were uninstalled.
Get-ChildItem $dest -File | Where-Object { -not $keep.ContainsKey($_.Name) } | Remove-Item -Force

$json = ConvertTo-Json @($index) -Depth 3
[IO.File]::WriteAllText((Join-Path $root 'fonts.json'), $json, (New-Object Text.UTF8Encoding $false))
Write-Output ("Arabic fonts synced: {0} faces in {1} files" -f $index.Count, $keep.Count)
