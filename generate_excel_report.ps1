
# Script para generar el reporte optimizado para Excel (Firplak DocGen)
# Genera un archivo CSV con delimitador punto y coma y codificación UTF8-BOM

$envFile = Get-Content 'web\.env' -Raw
$urlMatch = [regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_URL=\"?([^\s\"]+)\"?')
$keyMatch = [regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=\"?([^\s\"]+)\"?')
$url = $urlMatch.Groups[1].Value.Trim()
$key = $keyMatch.Groups[1].Value.Trim()

if (-not $url -or -not $key) { 
    Write-Error "Keys not found in web\.env or format is incorrect"
    exit 1 
}

$headers = @{ 
    'apikey' = $key
    'Authorization' = 'Bearer ' + $key 
}

$allProducts = @()
$offset = 0
$limit = 1000
$hasMore = $true

Write-Host "Recuperando datos de Supabase..." -ForegroundColor Cyan

while ($hasMore) {
    # Agregamos más campos técnicos al select
    $select = "code,sap_description,final_name_es,final_name_en,cabinet_name,designation,line,commercial_measure,width_cm,depth_cm,height_cm,weight_kg,canto_puertas,rh,assembled_flag,private_label_client_name"
    $api_url = $url + "/rest/v1/cabinet_products?select=$($select)&order=code.asc&offset=$offset&limit=$limit"
    
    $batch = Invoke-RestMethod -Uri $api_url -Headers $headers -Method Get
    
    if ($batch.Count -gt 0) {
        $allProducts += $batch
        $offset += $limit
        Write-Host "Obtenidos $($allProducts.Count) registros..."
    } else {
        $hasMore = $false
    }
}

Write-Host "Procesando datos para Excel..." -ForegroundColor Yellow

$processedData = foreach ($p in $allProducts) {
    $parts = $p.code.Split('-')
    $familia = if ($parts.Count -ge 1) { $parts[0] } else { "" }
    $referencia = if ($parts.Count -ge 2) { $parts[1] } else { "" }
    $version = if ($parts.Count -ge 3) { $parts[2] } else { "" }
    $color = if ($parts.Count -ge 4) { $parts[3] } else { "" }

    [PSCustomObject]@{
        'Código Completo'   = $p.code
        'Familia'           = $familia
        'Referencia'        = $referencia
        'Versión'           = $version
        'Color'             = $color
        'Nombre SAP'        = $p.sap_description
        'Nombre Final ES'   = $p.final_name_es
        'Nombre Final EN'   = $p.final_name_en
        'Mueble'            = $p.cabinet_name
        'Designación'       = $p.designation
        'Línea Comercial'   = $p.line
        'Medida Comercial'  = $p.commercial_measure
        'Ancho (cm)'        = $p.width_cm
        'Fondo (cm)'        = $p.depth_cm
        'Alto (cm)'         = $p.height_cm
        'Peso (kg)'         = $p.weight_kg
        'Canto Puertas'     = $p.canto_puertas
        'RH'                = $p.rh
        'Armado'            = if ($p.assembled_flag) { 'SÍ' } else { 'NO' }
        'Marca Propia'      = $p.private_label_client_name
    }
}

$reportPath = 'reporte_nomenclaturas_excel.csv'

# Exportar con punto y coma y UTF8 con BOM para Excel en español
$csvContent = $processedData | ConvertTo-Csv -Delimiter ';' -NoTypeInformation
$reportFile = Join-Path (Get-Location) $reportPath
$bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($reportFile, $csvContent, $bom)

Write-Host "ÉXITO: Reporte filtrable guardado en $($reportPath)" -ForegroundColor Green
