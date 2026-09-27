@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

echo Parando o servico AgentC...
net stop AgentC
if %errorlevel% equ 0 (
    echo.
    echo Servico AgentC parado com sucesso!
) else (
    echo.
    echo Falha ou servico ja estava parado.
)
timeout /t 3 >nul
