$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outputDir = Join-Path $root "store-listing\chrome-web-store\media\screenshots"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function ColorFromHex([string] $hex) {
  $value = $hex.TrimStart("#")
  return [System.Drawing.Color]::FromArgb(
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16)
  )
}

function New-Brush([string] $hex) {
  return [System.Drawing.SolidBrush]::new((ColorFromHex $hex))
}

function New-PenFromHex([string] $hex, [float] $width = 1) {
  return [System.Drawing.Pen]::new((ColorFromHex $hex), $width)
}

function New-RoundRect([float] $x, [float] $y, [float] $width, [float] $height, [float] $radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundRect($graphics, [string] $hex, [float] $x, [float] $y, [float] $width, [float] $height, [float] $radius) {
  $brush = New-Brush $hex
  if ($radius -le 0) {
    $graphics.FillRectangle($brush, $x, $y, $width, $height)
    $brush.Dispose()
    return
  }

  $path = New-RoundRect $x $y $width $height $radius
  $graphics.FillPath($brush, $path)
  $path.Dispose()
  $brush.Dispose()
}

function Stroke-RoundRect($graphics, [string] $hex, [float] $x, [float] $y, [float] $width, [float] $height, [float] $radius, [float] $strokeWidth = 1) {
  $pen = New-PenFromHex $hex $strokeWidth
  $path = New-RoundRect $x $y $width $height $radius
  $graphics.DrawPath($pen, $path)
  $path.Dispose()
  $pen.Dispose()
}

function Write-Text($graphics, [string] $text, [float] $x, [float] $y, [float] $width, [float] $height, [float] $size, [string] $hex, [string] $style = "Regular") {
  $fontStyle = [System.Drawing.FontStyle]::$style
  $font = [System.Drawing.Font]::new("Segoe UI", $size, $fontStyle, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Brush $hex
  $format = [System.Drawing.StringFormat]::new()
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $graphics.DrawString($text, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $width, $height), $format)
  $format.Dispose()
  $brush.Dispose()
  $font.Dispose()
}

function Write-Button($graphics, [string] $label, [float] $x, [float] $y, [float] $width, [string] $kind = "primary") {
  if ($kind -eq "primary") {
    Fill-RoundRect $graphics "#0f6b58" $x $y $width 48 8
    Write-Text $graphics $label ($x + 10) ($y + 14) ($width - 20) 22 13 "#ffffff" "Bold"
  } else {
    Stroke-RoundRect $graphics "#0f6b58" $x $y $width 48 8 2
    Write-Text $graphics $label ($x + 10) ($y + 14) ($width - 20) 22 13 "#0f6b58" "Bold"
  }
}

function New-Screenshot([string] $path, [scriptblock] $draw) {
  $bitmap = [System.Drawing.Bitmap]::new(1280, 800)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  & $draw $graphics
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Host "wrote $path"
}

New-Screenshot (Join-Path $outputDir "01-popup-lookup.png") {
  param($graphics)
  $graphics.Clear((ColorFromHex "#f3f5f1"))
  Fill-RoundRect $graphics "#0f6b58" 0 0 1280 800 0
  Fill-RoundRect $graphics "#f7f7f4" 110 70 440 660 14
  Stroke-RoundRect $graphics "#cbd3cf" 110 70 440 660 14 2
  Write-Text $graphics "SayThis" 140 105 180 34 28 "#16211f" "Bold"
  Write-Text $graphics "Selected text is resolved, sourced, and played from the best available pronunciation path." 140 145 350 72 18 "#5f6b67"
  Write-Text $graphics "SELECTION" 140 225 160 24 16 "#4d5a56" "Bold"
  Fill-RoundRect $graphics "#ffffff" 140 254 350 78 8
  Stroke-RoundRect $graphics "#cbd3cf" 140 254 350 78 8 1
  Write-Text $graphics "Gnocchi" 158 279 300 30 20 "#16211f"
  Write-Text $graphics "LOOKUP HINTS" 140 356 160 24 16 "#4d5a56" "Bold"
  Fill-RoundRect $graphics "#ffffff" 140 384 350 42 8
  Stroke-RoundRect $graphics "#cbd3cf" 140 384 350 42 8 1
  Write-Text $graphics "it" 158 395 250 24 18 "#5f6b67"
  Write-Button $graphics "Resolve" 140 454 76 "primary"
  Write-Button $graphics "Online" 226 454 76 "secondary"
  Write-Button $graphics "Speak" 312 454 76 "primary"
  Write-Button $graphics "Slow" 398 454 76 "secondary"
  Fill-RoundRect $graphics "#ffffff" 140 530 350 150 10
  Stroke-RoundRect $graphics "#d7ded9" 140 530 350 150 10 1
  Write-Text $graphics "RESOLVED" 160 552 120 20 14 "#66736e" "Bold"
  Write-Text $graphics "Gnocchi" 160 575 160 32 28 "#16211f" "Bold"
  Fill-RoundRect $graphics "#dcefe9" 350 553 68 26 13
  Write-Text $graphics "High" 365 557 46 18 14 "#0b4236" "Bold"
  Write-Text $graphics "Source form" 160 624 120 20 14 "#66736e" "Bold"
  Write-Text $graphics "gnocchi" 160 646 110 24 18 "#16211f"
  Write-Text $graphics "Audio" 300 624 90 20 14 "#66736e" "Bold"
  Write-Text $graphics "Verified recording" 300 646 160 24 18 "#16211f"

  Write-Text $graphics "One click from selected text to useful audio" 630 110 520 112 40 "#ffffff" "Bold"
  Write-Text $graphics "SayThis prefers source-backed recordings, then verified matching voices, and avoids misleading fallback speech." 634 236 490 104 24 "#dff8f0"
  Fill-RoundRect $graphics "#ffffff" 638 360 460 224 16
  Write-Text $graphics "What users see" 674 392 260 34 24 "#16211f" "Bold"
  Write-Text $graphics "Resolved source form" 674 434 300 28 20 "#16211f"
  Write-Text $graphics "Language and confidence" 674 469 300 28 20 "#16211f"
  Write-Text $graphics "Recording choices with source labels" 674 504 380 28 20 "#16211f"
  Write-Text $graphics "Correction and missing-entry actions" 674 539 390 28 20 "#16211f"
}

New-Screenshot (Join-Path $outputDir "02-options-controls.png") {
  param($graphics)
  $graphics.Clear((ColorFromHex "#f7f7f4"))
  Write-Text $graphics "SayThis Options" 90 58 400 44 34 "#16211f" "Bold"
  Write-Text $graphics "Main pronunciation controls, optional remote sources, and visible reset paths." 90 106 780 54 22 "#5f6b67"

  Fill-RoundRect $graphics "#ffffff" 90 165 520 500 14
  Stroke-RoundRect $graphics "#d7ded9" 90 165 520 500 14 1
  Write-Text $graphics "Resolver" 126 198 220 34 28 "#16211f" "Bold"
  Write-Text $graphics "Use online lookup by default" 170 256 300 28 20 "#16211f"
  Stroke-RoundRect $graphics "#0f6b58" 126 256 26 26 5 2
  Write-Text $graphics "Show on-page result card" 170 302 300 28 20 "#16211f"
  Fill-RoundRect $graphics "#0f6b58" 126 302 26 26 5
  Write-Text $graphics "Lookup language hints" 126 370 260 24 16 "#4d5a56" "Bold"
  Fill-RoundRect $graphics "#f7f7f4" 126 400 410 44 8
  Stroke-RoundRect $graphics "#cbd3cf" 126 400 410 44 8 1
  Write-Text $graphics "pl, tr, ja" 144 412 300 24 18 "#5f6b67"
  Write-Text $graphics "Optional source endpoints stay disabled until the user configures them." 126 470 410 58 18 "#5f6b67"
  Write-Button $graphics "Clear Lookup Cache" 126 570 190 "secondary"

  Fill-RoundRect $graphics "#ffffff" 670 165 520 500 14
  Stroke-RoundRect $graphics "#d7ded9" 670 165 520 500 14 1
  Write-Text $graphics "Community Memory" 706 198 320 34 28 "#16211f" "Bold"
  Write-Text $graphics "No local entries." 706 246 260 28 20 "#5f6b67"
  Write-Button $graphics "Export" 706 298 120 "primary"
  Write-Button $graphics "Import" 842 298 120 "secondary"
  Write-Button $graphics "Clear" 978 298 120 "secondary"
  Write-Text $graphics "Community Sync" 706 386 260 34 28 "#16211f" "Bold"
  Write-Text $graphics "Approved shared entries are opt-in and can be cleared from the options page." 706 432 410 58 18 "#5f6b67"
  Write-Button $graphics "Refresh Approved" 706 532 190 "secondary"
  Write-Button $graphics "Clear Approved" 912 532 180 "secondary"
  Write-Button $graphics "Clear Queue" 706 594 160 "secondary"
}
