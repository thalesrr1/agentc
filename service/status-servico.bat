@echo off
setlocal

cd /d "%~dp0"
cd ..
set "PROJECT_DIR=%CD%"
cd /d "%~dp0"

echo ========================================================
echo               STATUS DO SERVICO AGENTC                  
echo ========================================================
echo.

sc query AgentC >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] O servico AgentC NAO esta instalado.
    echo     Execute 'instalar-servico.bat' para instalar.
) else (
    sc query AgentC | findstr /i "STATE"
    sc qc AgentC | findstr /i "START_TYPE"
    echo.
    echo Arquivo de log: %PROJECT_DIR%\logs\agentc-service.log
)

echo.
echo ========================================================
pause
