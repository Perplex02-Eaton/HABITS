$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sizes = @(
    @{ Name = "icon-192.png"; Size = 192 },
    @{ Name = "icon-512.png"; Size = 512 },
    @{ Name = "maskable-512.png"; Size = 512 },
    @{ Name = "apple-touch-icon.png"; Size = 180 }
)

$outDir = Join-Path $PSScriptRoot "..\public\icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

foreach ($s in $sizes) {
    $size = $s.Size
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Fondo degradado oscuro (redondeado)
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.ColorTranslator]::FromHtml("#1C1C24"),
        [System.Drawing.ColorTranslator]::FromHtml("#0A0A0F"),
        90.0
    )
    $radius = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [float]($radius * 2)
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($grad, $path)

    $scale = $size / 512.0

    # Anillo exterior degradado
    $penGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.RectangleF(0, 0, $size, $size)),
        [System.Drawing.ColorTranslator]::FromHtml("#0A84FF"),
        [System.Drawing.ColorTranslator]::FromHtml("#5E5CE6"),
        45.0
    )
    $pen = New-Object System.Drawing.Pen($penGrad, (22 * $scale))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($pen, [int](106 * $scale), [int](106 * $scale), [int](300 * $scale), [int](300 * $scale), 0, 360)

    # Línea de tendencia degradada
    $trend = New-Object System.Drawing.Pen($penGrad, (30 * $scale))
    $trend.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $trend.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLines($trend, @(
        (New-Object System.Drawing.PointF((110 * $scale), (300 * $scale))),
        (New-Object System.Drawing.PointF((200 * $scale), (210 * $scale))),
        (New-Object System.Drawing.PointF((262 * $scale), (262 * $scale))),
        (New-Object System.Drawing.PointF((330 * $scale), (168 * $scale))),
        (New-Object System.Drawing.PointF((402 * $scale), (236 * $scale)))
    ))

    # Línea superior blanca
    $white = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(242, 255, 255, 255), (14 * $scale))
    $white.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $white.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLines($white, @(
        (New-Object System.Drawing.PointF((110 * $scale), (362 * $scale))),
        (New-Object System.Drawing.PointF((200 * $scale), (272 * $scale))),
        (New-Object System.Drawing.PointF((262 * $scale), (324 * $scale))),
        (New-Object System.Drawing.PointF((330 * $scale), (230 * $scale))),
        (New-Object System.Drawing.PointF((402 * $scale), (298 * $scale)))
    ))

    $file = Join-Path $outDir $s.Name
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generado: $($s.Name) ($($size)x$($size))"
}
