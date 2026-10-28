@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >/dev/null 2>/dev/null || (echo Установите Node.js: https://nodejs.org & pause & exit /b 1)
if not exist node_modules\electron (
  echo Первый запуск: устанавливаю зависимости...
  call npm install || (pause & exit /b 1)
)
call npm start
