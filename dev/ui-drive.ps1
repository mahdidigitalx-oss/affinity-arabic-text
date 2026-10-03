# Drives the tool's dialog for a visual check: moves it aside, types into the text box,
# and saves a screenshot. Usage: ui-drive.ps1 -Text "..." -Shot path.png [-Close]
param([string]$Text = '', [string]$Shot, [switch]$Close, [switch]$Ok, [switch]$Park, [int]$ClickX = -1, [int]$ClickY = -1, [switch]$TopLeft)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  public struct RECT { public int L, T, R, B; }
}
"@
$title = -join [char[]](0x0627,0x0644,0x0646,0x0635,0x0020,0x0627,0x0644,0x0639,0x0631,0x0628,0x064A)  # the dialog title
$script:found = [IntPtr]::Zero
[W]::EnumWindows({ param($h, $p)
    $sb = New-Object Text.StringBuilder 256
    [void][W]::GetWindowText($h, $sb, 256)
    if ([W]::IsWindowVisible($h) -and $sb.ToString().EndsWith($title)) { $script:found = $h; return $false }
    return $true }, [IntPtr]::Zero) | Out-Null
if ($script:found -eq [IntPtr]::Zero) { 'dialog not found'; exit 1 }
$h = $script:found
$r = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($TopLeft) { [void][W]::MoveWindow($h, 0, 0, $w, $hh, $true) } else { [void][W]::MoveWindow($h, $screen.Width - $w, 0, $w, $hh, $true) }
[void][W]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
if ($Text) {
    # Click inside the text box (left column, under the "Text" heading), then type.
    [void][W]::SetCursorPos($screen.Width - $w + 200, 150)
    [W]::mouse_event(2, 0, 0, 0, 0); [W]::mouse_event(4, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Seconds 2
}
if ($Park) { [void][W]::MoveWindow($h, $screen.Width - 160, 0, $w, $hh, $true); Start-Sleep -Milliseconds 800 }
if ($Shot) {
    $bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
    [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
    $bmp.Save($Shot)
}
if ($ClickX -ge 0) { [void][W]::SetCursorPos($ClickX, $ClickY); [W]::mouse_event(2, 0, 0, 0, 0); [W]::mouse_event(4, 0, 0, 0, 0); Start-Sleep -Milliseconds 800 }
if ($Ok) { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
if ($Close) { [System.Windows.Forms.SendKeys]::SendWait('{ESC}') }
"size ${w}x${hh}"
