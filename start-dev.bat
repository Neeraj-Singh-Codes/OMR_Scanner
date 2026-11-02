@echo off
title OMR Scanner & Evaluation Launcher
echo ========================================================
echo   Launching OMR Scanner and Evaluation System...
echo ========================================================
echo.

:: Detect primary Wi-Fi IP address
set LAN_IP=localhost
for /f "tokens=2 delims=:" %%a in ('netsh interface ip show addresses "Wi-Fi" 2^>nul ^| findstr /c:"IP Address"') do (
    set LAN_IP=%%a
)
:: Remove leading and trailing spaces
set LAN_IP=%LAN_IP: =%
if "%LAN_IP%"=="" set LAN_IP=localhost

echo [1/4] Starting Docker MongoDB (Port 27017)...
where docker >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    docker compose up -d mongodb mongo-express
    echo Docker MongoDB started!
) else (
    echo [NOTICE] Docker not found in PATH. Ensure Docker Desktop is installed.
)

timeout /t 2 >nul

echo [2/4] Starting Python Computer Vision Service (Port 8000)...
start "OMR Vision Service [Port 8000]" cmd /k "python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000"

timeout /t 2 >nul

echo [3/4] Starting Node.js Express Backend (Port 5000)...
start "OMR Express Backend [Port 5000]" cmd /k "cd server && npm run dev"

timeout /t 2 >nul

echo [4/4] Starting React Vite Frontend (Port 3000)...
start "OMR Frontend Client [Port 3000]" cmd /k "cd client && npm run dev"

timeout /t 3 >nul

echo.
echo ========================================================
echo   All services are running!
echo   Local Web Access:       http://localhost:3000
echo   Other Devices (LAN):    http://%LAN_IP%:3000
echo   Mongo Express GUI:      http://localhost:8081
echo   MongoDB Port:           27017
echo ========================================================
start http://localhost:3000
