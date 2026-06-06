$ErrorActionPreference = "Continue"

$TaskName = "SamiGenPrintAgent"
$InstallDir = Join-Path $env:LOCALAPPDATA "SamiGenPrintAgent"
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SamiGenPrintAgent"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "SamiGenPrintAgent"

Write-Host "Desinstalando SamiGen Print Agent..."

try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {
    Write-Host "No se pudo quitar la tarea con ScheduledTasks. Reintentando con schtasks..."
}

try {
    schtasks.exe /End /TN $TaskName 2>$null | Out-Null
    schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
} catch {}

Get-CimInstance Win32_Process |
    Where-Object {
        $_.CommandLine -and
        (
            $_.CommandLine -like "*SamiGenPrintAgent*" -or
            $_.CommandLine -like "*samigen-print-agent*" -or
            $_.CommandLine -like "*print-agent*" -or
            $_.CommandLine -like "*$InstallDir*"
        ) -and
        (
            $_.CommandLine -like "*server.js*" -or
            $_.CommandLine -like "*run-agent.cmd*" -or
            $_.CommandLine -like "*start-agent-hidden.ps1*"
        )
    } |
    ForEach-Object {
        Write-Host "Deteniendo proceso $($_.ProcessId): $($_.CommandLine)"
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }

Remove-Item -Path $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $RunKey -Name $RunValueName -ErrorAction SilentlyContinue

$Cleanup = Join-Path $env:TEMP "samigen-print-agent-cleanup.ps1"
@"
`$ErrorActionPreference = "SilentlyContinue"
Start-Sleep -Seconds 3
Remove-ItemProperty -Path "$RunKey" -Name "$RunValueName" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
    Where-Object {
        `$_.CommandLine -and
        (
            `$_.CommandLine -like "*SamiGenPrintAgent*" -or
            `$_.CommandLine -like "*samigen-print-agent*" -or
            `$_.CommandLine -like "*print-agent*" -or
            `$_.CommandLine -like "*$InstallDir*"
        ) -and
        (
            `$_.CommandLine -like "*server.js*" -or
            `$_.CommandLine -like "*run-agent.cmd*" -or
            `$_.CommandLine -like "*start-agent-hidden.ps1*"
        )
    } |
    ForEach-Object {
        try { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
Remove-Item -LiteralPath "$InstallDir" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$Cleanup" -Force -ErrorAction SilentlyContinue
"@ | Set-Content -Path $Cleanup -Encoding UTF8

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$Cleanup`"" -WindowStyle Hidden

Write-Host "SamiGen Print Agent desinstalado."
