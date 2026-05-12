@echo off
echo === SecureOps Frontend ===
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)

echo.
echo Starting React dev server on http://localhost:5173
echo.
npm run dev
