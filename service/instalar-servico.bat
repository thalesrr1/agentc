@echo off
setlocal EnableDelayedExpansion

:: Garante diretorios de execucao
cd /d "%~dp0"
set "SERVICE_DIR=%CD%"
cd ..
set "PROJECT_DIR=%CD%"
cd /d "%SERVICE_DIR%"

echo ========================================================
echo         AGENTC - INSTALADOR DE SERVICO WINDOWS          
echo ========================================================
echo.

:: 1. Verificacao de privilegios de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Solicitando elevacao de Administrador (UAC)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '\"%USERPROFILE%\"' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

:: Se veio argumento com o USERPROFILE original, usa ele
if not "%~1"=="" (
    set "TARGET_USERPROFILE=%~1"
) else (
    set "TARGET_USERPROFILE=%USERPROFILE%"
)

echo [*] Diretorio do projeto : %PROJECT_DIR%
echo [*] Diretorio do servico : %SERVICE_DIR%
echo [*] Perfil de usuario    : %TARGET_USERPROFILE%
echo.

:: 2. Gerar arquivo de configuracao do servico (service.config.json dentro de service/)
echo [1/4] Gravando configuracoes do servico...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source; if (-not $npm) { $npm = 'C:\Program Files\nodejs\npm.cmd' }; $cfg = @{ projectDir = '%PROJECT_DIR%'; serviceDir = '%SERVICE_DIR%'; userProfile = '%TARGET_USERPROFILE%'; npmPath = $npm }; $cfg | ConvertTo-Json | Set-Content -Path 'service.config.json' -Encoding UTF8"

if not exist "service.config.json" (
    echo [!] Falha ao gerar service.config.json.
    pause
    exit /b 1
)

:: 3. Compilar executavel do servico caso necessario
echo [2/4] Verificando executavel do servico (AgentCService.exe)...
set "CSC_EXE=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC_EXE%" (
    set "CSC_EXE=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist "%CSC_EXE%" (
    echo [!] Compilador C# (csc.exe) nao encontrado no .NET Framework.
    pause
    exit /b 1
)

echo [*] Compilando AgentCService.cs...
"%CSC_EXE%" /nologo /target:winexe /r:System.dll /r:System.ServiceProcess.dll /out:"%SERVICE_DIR%\AgentCService.exe" "%SERVICE_DIR%\AgentCService.cs"
if %errorlevel% neq 0 (
    echo [!] Erro ao compilar AgentCService.exe!
    pause
    exit /b 1
)
echo [*] Executavel gerado com sucesso em service\AgentCService.exe.

:: 4. Se o servico ja existe, parar e remover antes de recriar
echo [3/4] Configurando servico no Windows Service Manager...
sc query AgentC >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Servico anterior detectado. Parando e atualizando...
    sc stop AgentC >nul 2>&1
    timeout /t 2 /nobreak >nul
    sc delete AgentC >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: Cria o servico com tipo de inicializacao MANUAL (start= demand)
sc create AgentC binPath= "\"%SERVICE_DIR%\AgentCService.exe\"" start= demand displayname= "AgentC Service"
if %errorlevel% neq 0 (
    echo [!] Erro ao registrar o servico AgentC no Windows.
    pause
    exit /b 1
)

sc description AgentC "AgentC - Central local-first de gerenciamento visual de tarefas e orquestracao com IA" >nul 2>&1

:: Configura recuperacao automatica caso ocorra falha
sc failure AgentC reset= 86400 actions= restart/5000/restart/10000// >nul 2>&1

echo.
echo ========================================================
echo         SERVICO AGENTC INSTALADO COM SUCESSO!           
echo ========================================================
echo.
echo  Nome do Servico : AgentC
echo  Inicializacao   : MANUAL (Por demanda)
echo.
echo  Controle rapido nesta pasta (service\):
echo   - Para iniciar : execute iniciar-servico.bat ou abrir-agentc.bat
echo   - Para parar   : execute parar-servico.bat
echo   - Status       : execute status-servico.bat
echo   - Desinstalar  : execute desinstalar-servico.bat
echo.
echo  DICA: Se desejar que o servico inicie automaticamente com
echo  o Windows, execute no cmd/powershell como Administrador:
echo     sc config AgentC start= auto
echo  Ou altere nas propriedades do servico em 'services.msc'.
echo ========================================================
echo.

pause
