@echo off
setlocal
cd /d "%~dp0"

title RoseOps Studio
echo.
echo   RoseOps Studio — starting engine...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3099 ^| findstr LISTENING 2^>nul') do (
  taskkill /F /PID %%a >nul 2>&1
)

start "RoseOps Engine" /MIN cmd /k "cd /d "%~dp0" && node server.js"

set /a tries=0
:wait_health
timeout /t 1 /nobreak >nul
set /a tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3099/api/health).StatusCode -eq 200 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto open_browser
if %tries% lss 15 goto wait_health

echo   Engine did not start in time. Check the RoseOps Engine window for errors.
pause
exit /b 1

:open_browser
start "" "http://localhost:3099"
echo   Opened http://localhost:3099
echo   Keep the "RoseOps Engine" window running while you work.
timeout /t 3 /nobreak >nul