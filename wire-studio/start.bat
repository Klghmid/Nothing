@echo off
rem Wire Studio launcher for Windows. Set PORT or COMFY_URL before running to change them.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
if "%PORT%"=="" set PORT=5180
start "" "http://127.0.0.1:%PORT%"
node server.mjs
pause
