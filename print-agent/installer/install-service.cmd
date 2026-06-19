@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  SamiGen Print Agent - Instalar portable
echo ============================================
echo.
"%~dp0runtime\node.exe" "%~dp0install-service.js"
if errorlevel 1 (
  echo.
  echo No se pudo registrar el inicio automatico del agente.
  pause
  exit /b 1
)
echo.
echo Iniciando agente local...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%~dp0start-agent-hidden.ps1""' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
echo.
echo Listo. Vuelve a SamiGen y presiona Probar.
timeout /t 2 >nul
endlocal
