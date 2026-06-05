@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent.ps1"
if errorlevel 1 (
  echo.
  echo La instalacion fallo. Cierra esta ventana y vuelve a ejecutar el instalador.
  pause
  exit /b 1
)
echo.
echo Instalacion completada. Ya puedes volver a SamiGen y presionar Probar.
pause
endlocal
