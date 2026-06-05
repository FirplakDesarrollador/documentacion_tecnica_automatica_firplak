@echo off
setlocal
set "SCRIPT=%TEMP%\samigen-print-agent-uninstall.ps1"
copy /Y "%~dp0uninstall-agent.ps1" "%SCRIPT%" >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
endlocal
