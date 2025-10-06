@echo off
echo 🚀 Starting Terminal Social App...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    echo    Visit: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js and npm are installed
echo.

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm run install-all
    echo.
)

echo 🎯 Starting the application...
echo.
echo 📱 Main App: http://localhost:3000
echo 🛡️  Admin Panel: http://localhost:5000/admin
echo 🔑 Admin Login: admin / admin123
echo.
echo Press Ctrl+C to stop the application
echo.

REM Start the application
call npm run dev