@echo off
title AgentC - Painel de Controle
cls
echo ========================================================
echo                  INICIANDO AGENTC
echo ========================================================
echo Diretório: %~dp0
echo.

cd /d "%~dp0"

echo [1/2] Agendando abertura do navegador (http://localhost:5173)...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173'"

echo [2/2] Subindo Servidor Fastify e Frontend Vite...
echo.
echo Pressione Ctrl+C para encerrar os servicos.
echo ========================================================
echo.

npm run dev

pause
