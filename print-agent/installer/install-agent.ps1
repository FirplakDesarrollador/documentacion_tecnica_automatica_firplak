$ErrorActionPreference = "Stop"

$TaskName = "SamiGenPrintAgent"
$AppName = "SamiGen Print Agent"
$InstallDir = Join-Path $env:LOCALAPPDATA "SamiGenPrintAgent"
$Payload = Join-Path $PSScriptRoot "payload.zip"
$HealthUrl = "http://127.0.0.1:3344/health"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "SamiGenPrintAgent"

function Stop-AgentProcesses {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -like "*server.js*" -and
            (
                $_.CommandLine -like "*SamiGenPrintAgent*" -or
                $_.CommandLine -like "*samigen-print-agent*" -or
                $_.CommandLine -like "*print-agent*"
            )
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

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

Get-ChildItem -LiteralPath $InstallDir -Force |
    Where-Object { $_.Name -ne "install.log" -and $_.Name -ne "logs" } |
    ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }

Expand-Archive -Path $Payload -DestinationPath $InstallDir -Force

$NodeExe = Join-Path $InstallDir "runtime\node.exe"
$ServerScript = Join-Path $InstallDir "server.js"
$RunAgentScript = Join-Path $InstallDir "run-agent.cmd"
$StartAgentHiddenScript = Join-Path $InstallDir "start-agent-hidden.ps1"

if (-not (Test-Path $NodeExe)) {
    throw "No se encontro runtime\node.exe en la instalacion."
}

if (-not (Test-Path $ServerScript)) {
    throw "No se encontro server.js en la instalacion."
}

if (-not (Test-Path $RunAgentScript)) {
    throw "No se encontro run-agent.cmd en la instalacion."
}

if (-not (Test-Path $StartAgentHiddenScript)) {
    throw "No se encontro start-agent-hidden.ps1 en la instalacion."
}

function Register-AgentTask($RunLevel) {
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartAgentHiddenScript`"" -WorkingDirectory $InstallDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel $RunLevel
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
}

function Register-AgentRunKey {
    $RunCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartAgentHiddenScript`""
    New-Item -Path $RunKey -Force | Out-Null
    Set-ItemProperty -Path $RunKey -Name $RunValueName -Value $RunCommand
}

Remove-ItemProperty -Path $RunKey -Name $RunValueName -ErrorAction SilentlyContinue

$StartupMethod = $null
try {
    Register-AgentTask "Highest"
    Write-Host "Tarea programada creada con RunLevel Highest."
    $StartupMethod = "tarea programada $TaskName (Highest)"
} catch {
    Write-Host "No se pudo crear la tarea con Highest. Reintentando con permisos limitados..."
    Write-Host $_.Exception.Message
    try {
        Register-AgentTask "Limited"
        Write-Host "Tarea programada creada con RunLevel Limited."
        $StartupMethod = "tarea programada $TaskName (Limited)"
    } catch {
        Write-Host "No se pudo crear la tarea con Limited. Usando inicio por registro de usuario..."
        Write-Host $_.Exception.Message
        Register-AgentRunKey
        Write-Host "Inicio automatico registrado en HKCU Run."
        $StartupMethod = "registro de inicio de usuario HKCU Run"
    }
}

$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SamiGenPrintAgent"
New-Item -Path $UninstallKey -Force | Out-Null
Set-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value $AppName
Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value "1.0.5"
Set-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "SamiGen"
Set-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "`"$InstallDir\uninstall-agent.cmd`""
Set-ItemProperty -Path $UninstallKey -Name "NoModify" -Value 1 -Type DWord
Set-ItemProperty -Path $UninstallKey -Name "NoRepair" -Value 1 -Type DWord

Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartAgentHiddenScript`"" -WorkingDirectory $InstallDir -WindowStyle Hidden

$healthy = $false
for ($i = 1; $i -le 12; $i++) {
    Start-Sleep -Milliseconds 750
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
        if ($response.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        Write-Host "Esperando agente local ($i/12)..."
    }
}

if (-not $healthy) {
    throw "El agente se instalo, pero no respondio en $HealthUrl. Revisa que el puerto 3344 no este ocupado."
}

Write-Host ""
Write-Host "$AppName instalado correctamente."
Write-Host "Endpoint: $HealthUrl"
Write-Host "Inicio automatico: $StartupMethod."
