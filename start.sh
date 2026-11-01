#!/bin/bash

echo "========================================================"
echo "  Launching OMR Scanner and Evaluation System..."
echo "========================================================"
echo ""

echo "[1/3] Starting Python Computer Vision Service (Port 8000)..."
python -m uvicorn scanner.app.main:app --host 0.0.0.0 --port 8000 &

sleep 2

echo "[2/3] Starting Node.js Express Backend (Port 5000)..."
(cd server && npm run dev) &

sleep 2

echo "[3/3] Starting React Vite Frontend (Port 3000)..."
(cd client && npm run dev) &

sleep 3

echo ""
echo "========================================================"
echo "  All 3 services are running!"
echo "  Opening web application at: http://localhost:3000"
echo "========================================================"
xdg-open http://localhost:3000

wait   