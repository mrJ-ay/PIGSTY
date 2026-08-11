@echo off
chcp 65001 > nul

cd /d "%~dp0"

echo.
echo ==============================
echo        PIGSTY GIT PUSH
echo ==============================
echo.

git add .

echo.
echo [1/3] 변경사항 추가 완료
echo.

set /p MSG="커밋 메시지 입력 (엔터=Update): "

if "%MSG%"=="" set MSG=Update

git commit -m "%MSG%"

echo.
echo [2/3] 커밋 완료
echo.

git push

echo.
echo [3/3] PUSH 완료
echo.

pause