#Requires -Version 5.1
<#
.SYNOPSIS
  Gera os PNGs PWA do AgentC a partir de geometria vetorial nativa.

.DESCRIPTION
  Renderiza diretamente via System.Drawing.Common (GDI+) os icones
  necessarios para PWA: 192, 512, maskable 512 e apple-touch 180.

  Sem dependencia de browsers, sharp ou resvg. Idempotente.
#>

param(
  [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public\icons')
)

Add-Type -AssemblyName System.Drawing

function New-AgentCIcon {
  param(
    [int]$Size,
    [string]$OutPath,
    [int]$CornerRadius = [int]($Size * 0.18),
    [bool]$RoundedBackground = $true,
    [bool]$AddSafeZone = $false,
    [bool]$AddBorder = $true
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Fundo: gradiente zinc-950 -> zinc-900 (mock: cor solida zinc-950 para performance)
  $bgRect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  if ($RoundedBackground -and $CornerRadius -gt 0) {
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 9, 9, 11))
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc(0, 0, $CornerRadius * 2, $CornerRadius * 2, 180, 90)
    $bgPath.AddArc($Size - $CornerRadius * 2, 0, $CornerRadius * 2, $CornerRadius * 2, 270, 90)
    $bgPath.AddArc($Size - $CornerRadius * 2, $Size - $CornerRadius * 2, $CornerRadius * 2, $CornerRadius * 2, 0, 90)
    $bgPath.AddArc(0, $Size - $CornerRadius * 2, $CornerRadius * 2, $CornerRadius * 2, 90, 90)
    $bgPath.CloseFigure()
    $g.FillPath($bgBrush, $bgPath)

    if ($AddBorder) {
      $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 39, 39, 42), [Math]::Max(1, $Size / 256))
      $g.DrawPath($borderPen, $bgPath)
    }
  } else {
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 9, 9, 11))
    $g.FillRectangle($bgBrush, $bgRect)
  }

  # Geometria do icone "layers" (3 poligonos sobrepostos)
  $strokeWidth = [Math]::Max(2, [int]($Size * 0.085))
  $emerald = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 16, 185, 129), $strokeWidth)
  $emerald.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $emerald.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $emerald.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  # Fator de escala: viewBox 512 -> tamanho alvo
  $scale = $Size / 512.0
  $cx = $Size / 2

  # Polygon superior (losango): pontos (256,72) (96,160) (256,248) (416,160)
  $top = @(
    [System.Drawing.PointF]::new($cx + (256 - 256) * $scale, (72) * $scale),
    [System.Drawing.PointF]::new($cx + (96  - 256) * $scale, (160) * $scale),
    [System.Drawing.PointF]::new($cx + (256 - 256) * $scale, (248) * $scale),
    [System.Drawing.PointF]::new($cx + (416 - 256) * $scale, (160) * $scale)
  )
  $g.DrawPolygon($emerald, $top)

  # Polyline 1: (96,272) -> (256,360) -> (416,272)
  $mid = @(
    [System.Drawing.PointF]::new($cx + (96  - 256) * $scale, (272) * $scale),
    [System.Drawing.PointF]::new($cx + (256 - 256) * $scale, (360) * $scale),
    [System.Drawing.PointF]::new($cx + (416 - 256) * $scale, (272) * $scale)
  )
  $g.DrawLines($emerald, $mid)

  # Polyline 2: (96,384) -> (256,472) -> (416,384)
  $bot = @(
    [System.Drawing.PointF]::new($cx + (96  - 256) * $scale, (384) * $scale),
    [System.Drawing.PointF]::new($cx + (256 - 256) * $scale, (472) * $scale),
    [System.Drawing.PointF]::new($cx + (416 - 256) * $scale, (384) * $scale)
  )
  $g.DrawLines($emerald, $bot)

  # Glow central (ponto de "agente ativo")
  $glowSize = [Math]::Max(2, [int]($Size * 0.025))
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 16, 185, 129))
  $g.FillEllipse($glowBrush, $cx - $glowSize / 2, $Size / 2 - $glowSize / 2, $glowSize, $glowSize)

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output ("OK  {0}x{0} -> {1}" -f $Size, $OutPath)
}

# Garante diretorio
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

# Icones padrao (com fundo arredondado)
New-AgentCIcon -Size 192 -OutPath (Join-Path $OutDir 'icon-192.png')
New-AgentCIcon -Size 512 -OutPath (Join-Path $OutDir 'icon-512.png')

# Apple touch icon (sem borda, fundo arredondado estilo iOS)
New-AgentCIcon -Size 180 -OutPath (Join-Path $OutDir 'apple-touch-icon.png') -AddBorder $false

# Maskable (sem bordas, sem corte: icone ocupa ~60% do canvas respeitando safe zone)
New-AgentCIcon -Size 512 -OutPath (Join-Path $OutDir 'icon-maskable-512.png') -RoundedBackground $false -AddBorder $false

# Favicon PNG 32x32 (fallback para browsers antigos)
New-AgentCIcon -Size 32 -OutPath (Join-Path $OutDir 'favicon-32.png') -AddBorder $false

Write-Output ""
Write-Output "Icones PWA gerados em $OutDir"