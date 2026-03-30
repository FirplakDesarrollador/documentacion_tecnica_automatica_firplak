
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

Write-Host "Fetching all data from Supabase (with pagination)..."

while ($hasMore) {
    $api_url = $url + "/rest/v1/cabinet_products?select=code,sap_description,final_name_es,final_name_en&order=code.asc&offset=$offset&limit=$limit"
    $batch = Invoke-RestMethod -Uri $api_url -Headers $headers -Method Get
    
    if ($batch.Count -gt 0) {
        $allProducts += $batch
        $offset += $limit
        Write-Host "Fetched $($allProducts.Count) records so far..."
    } else {
        $hasMore = $false
    }
}

Write-Host ("Final export: " + $allProducts.Count + " records...")
$allProducts | Select-Object @{n='Código';e={$_.code}}, 
                          @{n='Nombre SAP';e={$_.sap_description}}, 
                          @{n='Nombre Final ES';e={$_.final_name_es}}, 
                          @{n='Nombre Final EN';e={$_.final_name_en}} | 
            Export-Csv -Path 'reporte_nomenclaturas_completo.csv' -NoTypeInformation -Encoding UTF8

Write-Host "SUCCESS: FULL report saved to reporte_nomenclaturas_completo.csv"
