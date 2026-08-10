@echo off
title PIGSTY

echo ========================================
echo          PIGSTY Starting...
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Backend...
start "PIGSTY Backend" cmd /k "cd backend && ..\backend.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend...
start "PIGSTY Frontend" cmd /k "cd frontend && python -m http.server 5500"

timeout /t 2 /nobreak >nul

start http://127.0.0.1:5500

echo.
echo PIGSTY is running!
echo.
pause