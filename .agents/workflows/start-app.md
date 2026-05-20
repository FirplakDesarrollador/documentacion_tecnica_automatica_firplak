---
description: Inicia el servidor de desarrollo y abre la aplicación en Google Chrome
---

1. Asegúrate de estar en el directorio raíz del proyecto.
// turbo
2. Reinicia el servidor de desarrollo en primer plano (visible) y abre Google Chrome:
```powershell
# Identifica y cierra cualquier proceso en el puerto 3000
$process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "Reiniciando servidor: Cerrando proceso existente en el puerto 3000..."
    Get-Process -Id $process.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Abre Chrome en paralelo
Start-Process "chrome.exe" "http://localhost:3000"

# Inicia el servidor de forma visible para que puedas ver los logs
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
```
