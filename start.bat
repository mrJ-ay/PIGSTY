@echo off
title PIGSTY Server

cd /d "%~dp0backend"

if not exist ".venv" (
    echo [PIGSTY] 가상환경 생성 중...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [PIGSTY] 필요한 패키지 확인 중...
pip install -r requirements.txt

echo.
echo ==========================
echo       PIGSTY SERVER
echo ==========================
echo.
echo Server: http://127.0.0.1:8000
echo API Docs: http://127.0.0.1:8000/docs
echo.
echo 서버를 종료하려면 이 창을 닫으세요.
echo.

start "" "http://127.0.0.1:8000/docs"

uvicorn main:app --reload

pause