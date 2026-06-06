@echo off
setlocal
set "SCRIPT=%TEMP%\samigen-print-agent-uninstall.ps1"
set "LOG=%TEMP%\SamiGenPrintAgentUninstall.log"
copy /Y "%~dp0uninstall-agent.ps1" "%SCRIPT%" >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" > "%LOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  start "" notepad.exe "%LOG%"
  exit /b %EXIT_CODE%
)
endlocal
