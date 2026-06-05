$ErrorActionPreference = "SilentlyContinue"

$TaskName = "SamiGenPrintAgent"
$InstallDir = Join-Path $env:LOCALAPPDATA "SamiGenPrintAgent"
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SamiGenPrintAgent"

Write-Host "Desinstalando SamiGen Print Agent..."

Stop-ScheduledTask -TaskName $TaskName | Out-Null
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false | Out-Null

Get-CimInstance Win32_Process |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*SamiGenPrintAgent*" -and
        $_.CommandLine -like "*server.js*"
    } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force } catch {}
    }

Remove-Item -Path $UninstallKey -Recurse -Force

$Cleanup = Join-Path $env:TEMP "samigen-print-agent-cleanup.ps1"
@"
Start-Sleep -Seconds 2
Remove-Item -LiteralPath "$InstallDir" -Recurse -Force -ErrorAction SilentlyContinue
"@ | Set-Content -Path $Cleanup -Encoding UTF8

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Cleanup`"" -WindowStyle Hidden

Write-Host "SamiGen Print Agent desinstalado."
