#!/bin/bash

echo "========================================================"
echo "  Launching OMR Scanner and Evaluation System..."
echo "========================================================"
echo ""

echo "[1/4] Starting Docker MongoDB (Port 27017)..."
if command -v docker &> /dev/null; then
    docker compose up -d mongodb mongo-express
    echo "Docker MongoDB started!"
else
    echo "[NOTICE] Docker not found. Make sure Docker is installed if you need local DB."
fi

sleep 2

echo "[2/4] Starting Python Computer Vision Service (Port 8000)..."
python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000 &

sleep 2

echo "[3/4] Starting Node.js Express Backend (Port 5000)..."
(cd server && npm run dev) &

sleep 2

echo "[4/4] Starting React Vite Frontend (Port 3000)..."
(cd client && npm run dev) &

sleep 3

echo ""
echo "========================================================"
echo "  All services are running!"
echo "  Opening web application at: http://localhost:3000"
echo "  Database Web GUI at:        http://localhost:8081"
echo "========================================================"
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v open &> /dev/null; then
    open http://localhost:3000
fi

wait
