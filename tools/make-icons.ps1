# Generates the Bootprint app icons.
#
# The mark is a work boot sole: a filled forefoot and heel with a break
# between them. Earlier drafts drew it the way the app draws a site - an
# outlined polygon with a pin at every corner - but the dots break up the
# silhouette and the shape read as a keyhole, then as a blob. A foot needs a
# solid, smooth outline to be recognised at 48px. The single white pin at the
# toe is what carries the measuring idea over from the old icon.
#
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
# Writes icon-192.png, icon-512.png and icon-maskable-512.png beside the app.

Add-Type -AssemblyName System.Drawing

$repo  = Split-Path -Parent $PSScriptRoot
$green = [System.Drawing.Color]::FromArgb(255, 45, 106, 45)   # #2D6A2D
$gold  = [System.Drawing.Color]::FromArgb(255, 200, 168, 75)  # #C8A84B
$white = [System.Drawing.Color]::White

# Outlines on a 512 grid, clockwise. Fed through AddClosedCurve, so these are
# control points for a smooth spline, not literal corners.
#
# Deliberately wider than a real foot (about 1:1.6 rather than 1:2.4). At icon
# sizes an anatomically correct sole reads as a narrow sliver; the eye needs
# the extra width to see a foot.
$forefoot = @(
  @(256,  82),                          # toe tip, narrow
  @(298,  96), @(336, 150),
  @(350, 220),                          # ball, widest point
  @(332, 272), @(256, 288), @(180, 272),
  @(162, 220),                          # ball, left
  @(176, 150), @(214,  96)
)
$heel = @(
  @(256, 334), @(304, 346), @(322, 390), @(314, 430),
  @(256, 444), @(198, 430), @(190, 390), @(208, 346)
)
# No white pin. It was carried over from the old surveyed-polygon mark, but it
# failed in every position: at the toe tip it read as a head, and inside the
# forefoot it read as an eye. The boot print alone is the stronger mark - one
# shape, high contrast, legible down to a favicon.

function P {
  param([double]$x, [double]$y, [double]$Scale, [double]$Off)
  return New-Object System.Drawing.PointF([float](($x - 256) * $Scale + $Off), [float](($y - 256) * $Scale + $Off))
}

function Get-Points {
  param($Shape, [double]$Scale, [double]$Offset)
  $pts = @()
  foreach ($p in $Shape) {
    $x = ($p[0] - 256) * $Scale + $Offset
    $y = ($p[1] - 256) * $Scale + $Offset
    $pts += , (New-Object System.Drawing.PointF([float]$x, [float]$y))
  }
  return [System.Drawing.PointF[]]$pts
}

function New-Icon {
  param(
    [int]$Size,
    [string]$OutName,
    [double]$Inset,      # shrinks the mark; the maskable needs a safe zone
    [bool]$RoundCorners
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $brushBg   = New-Object System.Drawing.SolidBrush($green)
  $brushGold = New-Object System.Drawing.SolidBrush($gold)
  $brushWht  = New-Object System.Drawing.SolidBrush($white)

  if ($RoundCorners) {
    # NB: not $path - that would collide with a -Path parameter name.
    $r  = [int]($Size * 0.22)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $gp.AddArc($Size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $gp.AddArc($Size - $r * 2, $Size - $r * 2, $r * 2, $r * 2, 0, 90)
    $gp.AddArc(0, $Size - $r * 2, $r * 2, $r * 2, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($brushBg, $gp)
    $gp.Dispose()
  } else {
    # Maskable: full bleed. The platform applies its own mask, so transparency
    # here would show up as a clipped corner.
    $g.FillRectangle($brushBg, 0, 0, $Size, $Size)
  }

  $scale = ($Size / 512.0) * $Inset
  $off   = $Size / 2.0

  $g.FillClosedCurve($brushGold, (Get-Points $forefoot $scale $off), `
    [System.Drawing.Drawing2D.FillMode]::Alternate, 0.6)
  $g.FillClosedCurve($brushGold, (Get-Points $heel $scale $off), `
    [System.Drawing.Drawing2D.FillMode]::Alternate, 0.6)

  # Tread. Drawn in the BACKGROUND colour so the channels read as gaps cut
  # through the rubber rather than lines painted on top of it. They are allowed
  # to overrun the sole's edge — the background is the same green, so the
  # overrun is invisible and the alternative (clipping each groove to the sole)
  # buys nothing.
  #
  # Few and thick on purpose. Fine tread turns to mush at 48px, and the
  # silhouette is the only thing that survives that far down.
  $penGroove = New-Object System.Drawing.Pen($green, [float](15 * $scale))
  $penGroove.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penGroove.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
  $penGroove.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  # Stacked chevrons, all pointing toward the toe.
  #
  # The first attempt used full-width horizontal channels, which is what a lug
  # pattern looks like in a photograph — but drawn flat they sliced the sole
  # into stacked bands and the whole thing read as a hamburger. Chevrons carry
  # the same "this is a work boot" signal without ever cutting the silhouette
  # clean across.
  #
  # They also do double duty: a chevron is the map symbol for north, so the
  # mark reads as tread and as survey arrow at once.
  $chevrons = @(
    @(206, 156, 256, 116, 306, 156),   # toe
    @(196, 232, 256, 192, 316, 232),   # forefoot
    @(212, 400, 256, 370, 300, 400)    # heel
  )
  foreach ($c in $chevrons) {
    $g.DrawLines($penGroove, [System.Drawing.PointF[]]@(
      (P $c[0] $c[1] $scale $off), (P $c[2] $c[3] $scale $off), (P $c[4] $c[5] $scale $off)
    ))
  }

  $penGroove.Dispose()

  $out = Join-Path $repo $OutName
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  $brushGold.Dispose(); $brushWht.Dispose(); $brushBg.Dispose()
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("wrote " + $OutName + "  (" + $Size + "x" + $Size + ")")
}

New-Icon -Size 512 -OutName "icon-512.png"          -Inset 1.00 -RoundCorners $true
New-Icon -Size 192 -OutName "icon-192.png"          -Inset 1.00 -RoundCorners $true
# Maskable: mark pulled into the middle ~72% so no mask shape can crop it.
New-Icon -Size 512 -OutName "icon-maskable-512.png" -Inset 0.72 -RoundCorners $false
