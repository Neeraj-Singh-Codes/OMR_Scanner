@echo off
title OMR Scanner & Evaluation Launcher
echo ========================================================
echo   Launching OMR Scanner and Evaluation System...
echo ========================================================
echo.

echo [1/3] Starting Python Computer Vision Service (Port 8000)...
start "OMR Vision Service [Port 8000]" cmd /k "python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000"

timeout /t 2 >nul

echo [2/3] Starting Node.js Express Backend (Port 5000)...
start "OMR Express Backend [Port 5000]" cmd /k "cd server && npm run dev"

timeout /t 2 >nul

echo [3/3] Starting React Vite Frontend (Port 3000)...
start "OMR Frontend Client [Port 3000]" cmd /k "cd client && npm run dev"

timeout /t 3 >nul

echo.
echo ========================================================
echo   All 3 services are running!
echo   Opening web application at: http://localhost:3000
echo ========================================================
start http://localhost:3000
