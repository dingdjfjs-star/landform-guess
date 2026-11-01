# Resize reference photos -> tools/_raw/photos/*.jpg (width 1280, jpeg q64)
# All-English script to avoid PowerShell ANSI/UTF8 issues with Chinese filenames.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

# find the folder that contains the dropped jpg files (named with Chinese chars)
$srcDir = Get-ChildItem -LiteralPath $root -Directory | Where-Object {
  (Get-ChildItem -LiteralPath $_.FullName -Filter *.jpg -File).Count -ge 5
} | Select-Object -First 1
if (-not $srcDir) { throw 'source folder with 5 jpg files not found' }

$files = Get-ChildItem -LiteralPath $srcDir.FullName -Filter *.jpg -File | Sort-Object Name
# sorted order: the 4 files sharing the same prefix ( _1 _2 _3 _5 ) come first, then the danxia one
$dstNames = @('canglan-shore.jpg', 'canglan-house.jpg', 'sunset.jpg', 'canglan-reed.jpg', 'zhangye.jpg')
if ($files.Count -ne 5) { throw ('expected 5 jpg files, got ' + $files.Count) }

$dstDir = Join-Path $root 'tools\_raw\photos'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$width = 1280

for ($i = 0; $i -lt $files.Count; $i++) {
  $dst = Join-Path $dstDir $dstNames[$i]
  $img = [System.Drawing.Image]::FromFile($files[$i].FullName)
  try {
    $h = [int]($img.Height * $width / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap($width, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $width, $h)
    $g.Dispose()
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]64)
    $bmp.Save($dst, $enc, $ep)
    $bmp.Dispose()
    $kb = [int]((Get-Item -LiteralPath $dst).Length / 1KB)
    Write-Output ("OK {0} <- {1} ({2} KB)" -f $dstNames[$i], $files[$i].Name, $kb)
  } finally { $img.Dispose() }
}
