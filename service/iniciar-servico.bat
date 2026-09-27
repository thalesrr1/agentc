@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

echo Iniciando o servico AgentC...
net start AgentC
if %errorlevel% equ 0 (
    echo.
    echo Servico AgentC iniciado com sucesso!
) else (
    echo.
    echo Falha ou servico ja em execucao.
)
timeout /t 3 >nul
