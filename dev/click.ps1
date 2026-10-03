# Clicks at physical screen pixels (as in a full-resolution screenshot), then optionally types
# and saves a screenshot. Usage: click.ps1 -X 100 -Y 200 [-Right] [-Double] [-Keys "..."] [-Shot path]
param([int]$X = -1, [int]$Y = -1, [switch]$Right, [switch]$Double, [string]$Keys = '', [string]$Shot = '', [int]$Wait = 700)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
}
"@
[void][M]::SetProcessDPIAware()
if ($X -ge 0) {
    [void][M]::SetCursorPos($X, $Y); Start-Sleep -Milliseconds 150
    $down = 2; $up = 4; if ($Right) { $down = 8; $up = 16 }
    [M]::mouse_event($down, 0, 0, 0, 0); [M]::mouse_event($up, 0, 0, 0, 0)
    if ($Double) { Start-Sleep -Milliseconds 80; [M]::mouse_event($down, 0, 0, 0, 0); [M]::mouse_event($up, 0, 0, 0, 0) }
}
if ($Keys) { Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait($Keys) }
Start-Sleep -Milliseconds $Wait
if ($Shot) {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save($Shot)
}
'done'
