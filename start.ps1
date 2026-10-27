Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Launching OMR Scanner & Evaluation Web App (Windows)..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Starting Python Vision Service on Port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 2

Write-Host "[2/3] Starting Express Backend on Port 5000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location server; npm run dev"

Start-Sleep -Seconds 2

Write-Host "[3/3] Starting React Vite Frontend on Port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location client; npm run dev"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "All services started! Opening http://localhost:3000 in your browser..." -ForegroundColor Green
Start-Process "http://localhost:3000"
