# Crops the pages exported by test/showcase.affinity.js into docs/images.
# Usage: crop-showcase.ps1 -Log build/showcase.log
param([string]$Log = 'build/showcase.log')
Add-Type -AssemblyName System.Drawing
$desktop = [Environment]::GetFolderPath('Desktop')
$outDir = Join-Path $PSScriptRoot '..\docs\images'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
foreach ($line in Get-Content $Log) {
    $p = $line -split ' '
    if ($p[0] -ne 'crop') { continue }
    $src = Join-Path $desktop "_showcase_$($p[1]).png"
    $img = [System.Drawing.Image]::FromFile($src)
    $rect = New-Object System.Drawing.Rectangle ([int]$p[2]), ([int]$p[3]), ([int]$p[4]), ([int]$p[5])
    $rect.Intersect((New-Object System.Drawing.Rectangle 0, 0, $img.Width, $img.Height))
    $bmp = New-Object System.Drawing.Bitmap $rect.Width, $rect.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $rect.Width, $rect.Height), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $img.Dispose()
    $dest = Join-Path $outDir "$($p[1]).png"
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    Remove-Item $src
    "$($p[1]): $($rect.Width)x$($rect.Height)"
}
