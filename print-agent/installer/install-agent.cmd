@echo off
setlocal
set "LOG_DIR=%TEMP%\SamiGenPrintAgentInstall"
set "LOG_FILE=%LOG_DIR%\install.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

echo SamiGen Print Agent installer > "%LOG_FILE%"
echo Fecha: %DATE% %TIME% >> "%LOG_FILE%"
echo Carpeta temporal: %~dp0 >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent.ps1" >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  start "" notepad.exe "%LOG_FILE%"
  exit /b %EXIT_CODE%
)

if exist "%LOCALAPPDATA%\SamiGenPrintAgent" (
  copy /Y "%LOG_FILE%" "%LOCALAPPDATA%\SamiGenPrintAgent\install.log" >nul 2>&1
)

exit /b 0
endlocal
