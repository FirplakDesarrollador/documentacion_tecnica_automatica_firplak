Add-Type -AssemblyName System.Drawing
$path1 = 'c:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\tmp\2025 Etiqueta RH MUEBLE LVR BARRA PRO 140X60 CTOLVAS CANTO 2MM CINZA COBALTO.jpg'
$path2 = 'c:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\tmp\VBAN05-0140-MRH-0406_Etiqueta_base_muebles_sin_codigo_de_barras (9).jpg'

Get-Item $path1 | select Length
Get-Item $path2 | select Length

$img1 = [System.Drawing.Image]::FromFile($path1)
$img2 = [System.Drawing.Image]::FromFile($path2)

Write-Host "--- Etiqueta 1 ---"
Write-Host "Ancho: $($img1.Width) px"
Write-Host "Alto: $($img1.Height) px"
Write-Host "DPI X: $($img1.HorizontalResolution)"
Write-Host "DPI Y: $($img1.VerticalResolution)"
Write-Host "Formato Pixel: $($img1.PixelFormat)"
Write-Host "Size: $([math]::round((Get-Item $path1).Length / 1KB, 2)) KB"

Write-Host "`n--- Etiqueta 2 ---"
Write-Host "Ancho: $($img2.Width) px"
Write-Host "Alto: $($img2.Height) px"
Write-Host "DPI X: $($img2.HorizontalResolution)"
Write-Host "DPI Y: $($img2.VerticalResolution)"
Write-Host "Formato Pixel: $($img2.PixelFormat)"
Write-Host "Size: $([math]::round((Get-Item $path2).Length / 1KB, 2)) KB"

$img1.Dispose()
$img2.Dispose()
