Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Launching OMR Scanner & Evaluation System..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Detect LAN IP address for multi-device access
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    ($_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*") -and
    $_.InterfaceAlias -notlike "*vEthernet*" -and 
    $_.IPAddress -notlike "169.254*" 
} | Select-Object -First 1).IPAddress

if (-not $lanIp) {
    $lanIp = "127.0.0.1"
}

# 2. Check and start Docker Database if Docker is available
Write-Host "[1/4] Checking Docker MongoDB Service..." -ForegroundColor Yellow
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
    docker compose up -d mongodb mongo-express
    Write-Host "MongoDB Container is up and running on port 27017!" -ForegroundColor Green
} else {
    Write-Host "[NOTICE] Docker not found in PATH." -ForegroundColor Yellow
    Write-Host "  If using Docker Desktop, make sure it is installed and running." -ForegroundColor Gray
    Write-Host "  Backend will connect once MongoDB is reachable on port 27017." -ForegroundColor Gray
}

Start-Sleep -Seconds 2

# 3. Start Python Vision Service
Write-Host "[2/4] Starting Python Vision Service on Port 8000 (0.0.0.0)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 2

# 4. Start Express Backend
Write-Host "[3/4] Starting Express Backend on Port 5000 (0.0.0.0)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location server; npm run dev"

Start-Sleep -Seconds 2

# 5. Start React Vite Frontend
Write-Host "[4/4] Starting React Vite Frontend on Port 3000 (0.0.0.0)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location client; npm run dev"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  All services started successfully!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Local Machine:       http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Other Machines (LAN): http://$($lanIp):3000" -ForegroundColor Cyan
Write-Host "  Backend API:         http://$($lanIp):5000/api" -ForegroundColor Gray
Write-Host "  Database (MongoDB):  mongodb://$($lanIp):27017" -ForegroundColor Gray
Write-Host "  Database Web GUI:    http://$($lanIp):8081" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""

Start-Process "http://localhost:3000"
