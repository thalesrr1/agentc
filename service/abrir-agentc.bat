@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set "SERVICE_DIR=%CD%"
cd ..
set "PROJECT_DIR=%CD%"
cd /d "%SERVICE_DIR%"

set "URL=http://localhost:5173"

:: 1. Verifica se o servico esta instalado
sc query AgentC >nul 2>&1
if %errorlevel% neq 0 (
    echo [i] O servico AgentC ainda nao foi instalado como servico do Windows.
    echo.
    echo Opcoes:
    echo  [1] Executar 'instalar-servico.bat' para registrar o servico
    echo  [2] Iniciar temporariamente em modo console (npm run dev)
    echo.
    choice /c 12 /n /m "Escolha uma opcao [1 ou 2]: "
    if errorlevel 2 (
        call "%PROJECT_DIR%\iniciar-agentc.bat"
        exit /b
    )
    if errorlevel 1 (
        call "%SERVICE_DIR%\instalar-servico.bat"
        exit /b
    )
)

:: 2. Verifica se o servico esta rodando
sc query AgentC | findstr /i "STATE" | findstr /i "RUNNING" >nul 2>&1
if %errorlevel% equ 0 (
    :: Servico ja esta rodando, abre direto sem esperar
    start "" "%URL%"
    exit /b
)

:: 3. Se estiver parado, inicia o servico
echo [*] Iniciando servico AgentC em segundo plano...
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c net start AgentC' -Verb RunAs -Wait"
) else (
    net start AgentC
)

:: Aguarda alguns segundos para o servidor subir as portas e abre o navegador
echo [*] Abrindo aplicacao em %URL% ...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%URL%'"

exit /b
