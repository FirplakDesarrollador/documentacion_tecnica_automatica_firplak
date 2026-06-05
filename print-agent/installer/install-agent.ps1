$ErrorActionPreference = "Stop"

$TaskName = "SamiGenPrintAgent"
$AppName = "SamiGen Print Agent"
$InstallDir = Join-Path $env:LOCALAPPDATA "SamiGenPrintAgent"
$Payload = Join-Path $PSScriptRoot "payload.zip"

function Stop-AgentProcesses {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -like "*SamiGenPrintAgent*" -and
            $_.CommandLine -like "*server.js*"
        } |
        ForEach-Object {
            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
}

if (-not (Test-Path $Payload)) {
    throw "No se encontro payload.zip junto al instalador."
}

Write-Host "Instalando $AppName..."
Write-Host "Destino: $InstallDir"

try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

Stop-AgentProcesses

if (Test-Path $InstallDir) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Expand-Archive -Path $Payload -DestinationPath $InstallDir -Force

$NodeExe = Join-Path $InstallDir "runtime\node.exe"
$ServerScript = Join-Path $InstallDir "server.js"

if (-not (Test-Path $NodeExe)) {
    throw "No se encontro runtime\node.exe en la instalacion."
}

if (-not (Test-Path $ServerScript)) {
    throw "No se encontro server.js en la instalacion."
}

$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$ServerScript`"" -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SamiGenPrintAgent"
New-Item -Path $UninstallKey -Force | Out-Null
Set-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value $AppName
Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value "1.0.0"
Set-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "SamiGen"
Set-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "`"$InstallDir\uninstall-agent.cmd`""
Set-ItemProperty -Path $UninstallKey -Name "NoModify" -Value 1 -Type DWord
Set-ItemProperty -Path $UninstallKey -Name "NoRepair" -Value 1 -Type DWord

Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory $InstallDir -WindowStyle Hidden

Write-Host ""
Write-Host "$AppName instalado correctamente."
Write-Host "Endpoint: http://127.0.0.1:3344/health"
Write-Host "La tarea programada $TaskName iniciara el agente al iniciar sesion."
