@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs" >nul 2>&1
echo [%DATE% %TIME%] Starting SamiGen Print Agent >> "logs\agent.log"
"%~dp0runtime\node.exe" "%~dp0server.js" >> "logs\agent.log" 2>&1
echo [%DATE% %TIME%] Agent stopped with code %ERRORLEVEL% >> "logs\agent.log"
endlocal
