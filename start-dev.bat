@echo off
title Dot Domino CRM - Dev Starter
set "ROOT=%~dp0"

echo Starting Backend (port 8090)...
start "CRM Backend :8090" /D "%ROOT%server" cmd /k "node --env-file=.env server.js"

timeout /t 3 /nobreak >nul

echo Starting Frontend (port 5173)...
start "CRM Frontend :5173" /D "%ROOT%client" cmd /k "npx vite"

echo.
echo Both servers starting...
echo Backend:  http://localhost:8090
echo Frontend: http://localhost:5173
echo.
pause
