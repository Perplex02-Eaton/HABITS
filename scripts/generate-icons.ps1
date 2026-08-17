$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sizes = @(
    @{ Name = "icon-192.png"; Size = 192; Maskable = $false },
    @{ Name = "icon-512.png"; Size = 512; Maskable = $false },
    @{ Name = "maskable-512.png"; Size = 512; Maskable = $true },
    @{ Name = "apple-touch-icon.png"; Size = 180; Maskable = $false }
)
$outDir = Join-Path $PSScriptRoot "..\public\icons"

function New-Pen($color, $width) {
    $pen = New-Object System.Drawing.Pen($color, $width)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $pen
}

foreach ($item in $sizes) {
    $size = [int]$item.Size
    $scale = $size / 512.0
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.ColorTranslator]::FromHtml("#10131B"),
        [System.Drawing.ColorTranslator]::FromHtml("#020409"),
        45.0
    )
    if ($item.Maskable) {
        $g.FillRectangle($background, $rect)
    } else {
        $radius = [float]($size * 0.22)
        $d = $radius * 2
        $rounded = New-Object System.Drawing.Drawing2D.GraphicsPath
        $rounded.AddArc(0, 0, $d, $d, 180, 90)
        $rounded.AddArc($size - $d, 0, $d, $d, 270, 90)
        $rounded.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
        $rounded.AddArc(0, $size - $d, $d, $d, 90, 90)
        $rounded.CloseFigure()
        $g.FillPath($background, $rounded)
        $rounded.Dispose()
    }

    # Núcleo luminoso por capas, barato de renderizar y legible a 48 px.
    for ($index = 8; $index -ge 1; $index--) {
        $radius = (44 + $index * 10) * $scale
        $alpha = [int](5 + (9 - $index) * 5)
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 26, 178, 255))
        $g.FillEllipse($brush, (256 * $scale - $radius), (256 * $scale - $radius), $radius * 2, $radius * 2)
        $brush.Dispose()
    }

    $cyan = New-Pen ([System.Drawing.ColorTranslator]::FromHtml("#22C9FF")) (13 * $scale)
    $blue = New-Pen ([System.Drawing.ColorTranslator]::FromHtml("#1769FF")) (8 * $scale)
    $ice = New-Pen ([System.Drawing.ColorTranslator]::FromHtml("#8BEBFF")) (4 * $scale)
    $outer = [System.Drawing.RectangleF]::new(92 * $scale, 92 * $scale, 328 * $scale, 328 * $scale)
    $inner = [System.Drawing.RectangleF]::new(130 * $scale, 130 * $scale, 252 * $scale, 252 * $scale)
    $g.DrawArc($cyan, $outer, 200, 53)
    $g.DrawArc($blue, $outer, 270, 62)
    $g.DrawArc($cyan, $outer, 350, 57)
    $g.DrawArc($blue, $outer, 52, 56)
    $g.DrawArc($cyan, $outer, 125, 53)
    $g.DrawArc($ice, $inner, 192, 69)
    $g.DrawArc($blue, $inner, 281, 65)
    $g.DrawArc($ice, $inner, 13, 64)
    $g.DrawArc($blue, $inner, 103, 65)

    # Fragmentos mecánicos incompletos alrededor del núcleo.
    $fragment = New-Pen ([System.Drawing.Color]::FromArgb(220, 120, 232, 255)) (5 * $scale)
    foreach ($line in @(
        @(83, 247, 110, 243), @(112, 135, 138, 158), @(348, 107, 372, 124),
        @(420, 287, 416, 317), @(113, 376, 137, 352), @(374, 391, 392, 369)
    )) {
        $g.DrawLine($fragment, $line[0] * $scale, $line[1] * $scale, $line[2] * $scale, $line[3] * $scale)
    }

    # Firma HABITS original, ahora dentro del reactor holográfico.
    $energyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.ColorTranslator]::FromHtml("#20C8FF"),
        [System.Drawing.ColorTranslator]::FromHtml("#1769FF"),
        45.0
    )
    $trend = New-Pen $energyBrush (30 * $scale)
    $g.DrawLines($trend, @(
        ([System.Drawing.PointF]::new(127 * $scale, 304 * $scale)),
        ([System.Drawing.PointF]::new(204 * $scale, 227 * $scale)),
        ([System.Drawing.PointF]::new(263 * $scale, 277 * $scale)),
        ([System.Drawing.PointF]::new(330 * $scale, 184 * $scale)),
        ([System.Drawing.PointF]::new(390 * $scale, 240 * $scale))
    ))
    $white = New-Pen ([System.Drawing.Color]::FromArgb(245, 242, 252, 255)) (12 * $scale)
    $g.DrawLines($white, @(
        ([System.Drawing.PointF]::new(127 * $scale, 355 * $scale)),
        ([System.Drawing.PointF]::new(204 * $scale, 278 * $scale)),
        ([System.Drawing.PointF]::new(263 * $scale, 328 * $scale)),
        ([System.Drawing.PointF]::new(330 * $scale, 235 * $scale)),
        ([System.Drawing.PointF]::new(390 * $scale, 291 * $scale))
    ))
    $core = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#DFFAFF"))
    $g.FillEllipse($core, 254 * $scale, 268 * $scale, 18 * $scale, 18 * $scale)

    $file = Join-Path $outDir $item.Name
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    @($cyan, $blue, $ice, $fragment, $trend, $white, $energyBrush, $core, $background, $g, $bmp) | ForEach-Object { $_.Dispose() }
    Write-Host "Generado: $($item.Name) ($size x $size)"
}
