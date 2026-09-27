@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo ========================================================
echo        AGENTC - DESINSTALADOR DE SERVICO WINDOWS        
echo ========================================================
echo.

:: 1. Verificacao de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Solicitando elevacao de Administrador (UAC)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

:: 2. Verifica se o servico existe
sc query AgentC >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] O servico AgentC nao esta instalado no sistema.
    echo.
    pause
    exit /b 0
)

:: 3. Se estiver rodando, para o servico
echo [1/2] Parando servico AgentC...
net stop AgentC >nul 2>&1
timeout /t 2 /nobreak >nul

:: 4. Remove o servico do Windows
echo [2/2] Removendo servico AgentC do registro do Windows...
sc delete AgentC
if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo      SERVICO AGENTC DESINSTALADO COM SUCESSO!       
    echo ========================================================
    echo.
) else (
    echo.
    echo [!] Ocorreu um erro ao tentar remover o servico AgentC.
    echo.
)

pause
