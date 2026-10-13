@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Radar Comunitario - Inicializacao
color 0B
set "PROJECT_DIR=C:\Users\jose.pordeus1\Documents\radar-comunitario"
set "COMPOSE_FILE=%PROJECT_DIR%\docker-compose.yml"
set "ENV_FILE=%PROJECT_DIR%\.env.local"
set "STARTUP_LOG=%TEMP%\radar-comunitario-startup.log"

cls
echo.
echo ============================================================
echo                 RADAR COMUNITARIO
echo              Inicializacao do sistema
echo ============================================================
echo.

if not exist "%PROJECT_DIR%" (
  color 0C
  echo [ERRO] A pasta do sistema nao foi encontrada.
  echo        %PROJECT_DIR%
  echo.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

if not exist "%ENV_FILE%" (
  color 0C
  echo [ERRO] A configuracao local ainda nao foi criada.
  echo       Crie o arquivo .env.local a partir do .env.example,
  echo       preencha as credenciais do Supabase e execute novamente.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\garantir-token-agente.ps1" -ProjectDir "%PROJECT_DIR%" >nul 2>&1
if errorlevel 1 (
  color 0C
  echo [ERRO] Nao foi possivel preparar a credencial interna do sistema.
  echo       Consulte o diagnostico em: %STARTUP_LOG%
  echo.
  pause
  exit /b 1
)

echo [1/3] Preparando o ambiente do sistema...
docker info >nul 2>&1
if errorlevel 1 (
  echo       Iniciando os componentes necessarios...
  set "DOCKER_DESKTOP_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  if not exist "!DOCKER_DESKTOP_EXE!" set "DOCKER_DESKTOP_EXE=%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
  if not exist "!DOCKER_DESKTOP_EXE!" set "DOCKER_DESKTOP_EXE=%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
  if exist "!DOCKER_DESKTOP_EXE!" (
    start "" /min "!DOCKER_DESKTOP_EXE!"
  ) else (
    echo       O ambiente necessario nao esta instalado.
    echo       Instalando automaticamente. Isso pode levar alguns minutos...
    set "INSTALL_LOG=%TEMP%\radar-comunitario-install.log"
    where winget >nul 2>&1
    if errorlevel 1 (
      color 0C
      echo [ERRO] O instalador automatico do Windows nao esta disponivel.
      echo       Instale o App Installer pela Microsoft Store e tente novamente.
      echo.
      pause
      exit /b 1
    )
    winget install --id Docker.DockerDesktop --exact --silent --accept-source-agreements --accept-package-agreements > "!INSTALL_LOG!" 2>&1
    if errorlevel 1 (
      color 0C
      echo [ERRO] Nao foi possivel instalar os componentes automaticamente.
      echo       Consulte o diagnostico em: !INSTALL_LOG!
      echo.
      pause
      exit /b 1
    )
    set "DOCKER_DESKTOP_EXE=%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
    if not exist "!DOCKER_DESKTOP_EXE!" set "DOCKER_DESKTOP_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    if not exist "!DOCKER_DESKTOP_EXE!" (
      color 0C
      echo [ERRO] A instalacao terminou, mas o ambiente ainda nao foi localizado.
      echo       Talvez seja necessario reiniciar o computador.
      echo.
      pause
      exit /b 1
    )
    start "" /min "!DOCKER_DESKTOP_EXE!"
  )

  set "DOCKER_READY=0"
  for /l %%N in (1,1,30) do (
    docker info >nul 2>&1
    if not errorlevel 1 (
      set "DOCKER_READY=1"
      goto :docker_ready
    )
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
  )
:docker_ready
  if "%DOCKER_READY%"=="0" (
    color 0C
    echo [ERRO] O ambiente do sistema nao ficou pronto a tempo.
    echo.
    pause
    exit /b 1
  )
)
echo       [OK] Ambiente pronto.
echo.

echo [2/3] Iniciando os servicos do Radar Comunitario...
echo       [1] Servidor do Sistema ^(API^)
echo       [2] Agente do WhatsApp
echo       [3] Interface Web
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up -d > "%STARTUP_LOG%" 2>&1
if errorlevel 1 (
  color 0C
  echo [ERRO] Nao foi possivel iniciar os servicos.
  echo       Consulte o diagnostico em: %STARTUP_LOG%
  echo.
  pause
  exit /b 1
)
echo       [OK] Servicos iniciados em segundo plano.
echo.

echo [3/3] Carregando o Radar Comunitario...
echo       Aguarde enquanto os dados e as conexoes sao preparados.
echo       Esse processo pode levar alguns segundos.
set "API_READY=0"
for /l %%N in (1,1,20) do (
  curl.exe --max-time 3 -fsS http://127.0.0.1:4000/health/data-ready >nul 2>&1
  if not errorlevel 1 (
    set "API_READY=1"
    goto :api_ready
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
)
:api_ready
if "%API_READY%"=="0" (
  color 0C
  echo [ERRO] O sistema ainda nao terminou de preparar os dados.
  echo       Partes do banco ainda estao aguardando configuracao:
  set "DATA_READY_FILE=%TEMP%\radar-data-ready.json"
  curl.exe --max-time 5 -sS http://127.0.0.1:4000/health/data-ready -o "!DATA_READY_FILE!" 2>nul
  for /f "delims=" %%E in ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\mostrar-data-ready-pendente.ps1" -Path "!DATA_READY_FILE!"') do echo %%E
  echo       Execute as migracoes pendentes do Supabase e tente novamente.
  echo       Consulte o diagnostico em: %STARTUP_LOG%
  echo.
  pause
  exit /b 1
)

set "AGENT_READY=0"
set "AGENT_LOG=%TEMP%\radar-agent-startup.log"
for /l %%N in (1,1,90) do (
  docker logs --since 10m radar-whatsapp-agent > "%AGENT_LOG%" 2>nul
  findstr /i /c:"WhatsApp client ready" /c:"Escaneie o QR Code" "%AGENT_LOG%" >nul
  if not errorlevel 1 (
    set "AGENT_READY=1"
    goto :agent_ready
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
)
:agent_ready
if "%AGENT_READY%"=="0" (
  echo       [AVISO] O WhatsApp ainda esta preparando a conexao.
  echo       O painel sera aberto e o QR Code aparecera em Configuracao.
  echo       Isso pode levar alguns minutos na primeira inicializacao.
  echo.
) else (
  echo       [OK] Agente do WhatsApp inicializado.
  echo.
)

set "FRONTEND_READY=0"
for /l %%N in (1,1,30) do (
  curl.exe --max-time 3 -fsS http://127.0.0.1:3000/ >nul 2>&1
  if not errorlevel 1 (
    curl.exe --max-time 3 -sSI http://127.0.0.1:3000/ 2>nul | findstr /i /c:"Server: nginx" >nul
    if not errorlevel 1 (
      set "FRONTEND_READY=1"
      goto :frontend_ready
    ) else (
      set "FRONTEND_READY=-1"
      goto :frontend_ready
    )
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
)
:frontend_ready
if "%FRONTEND_READY%"=="-1" (
  color 0C
  echo [ERRO] A porta 3000 esta respondendo por outro servidor, nao pelo Docker.
  echo       Feche o servidor Vite/Node antigo e execute este inicializador novamente.
  echo.
  pause
  exit /b 1
)
if "%FRONTEND_READY%"=="0" (
  color 0C
  echo [ERRO] A Interface Web ainda nao esta respondendo.
  echo       Consulte o diagnostico em: %STARTUP_LOG%
  echo.
  pause
  exit /b 1
)

cls
color 0A
echo.
echo ============================================================
echo              RADAR COMUNITARIO PRONTO!
echo ============================================================
echo.
echo   [OK] Servidor do Sistema ^(API^) funcionando
echo   [OK] Banco de dados acessivel
  if "%AGENT_READY%"=="1" (
    echo   [OK] Agente do WhatsApp inicializado
  ) else (
    echo   [..] Agente do WhatsApp terminando de conectar
  )
echo   [OK] Interface Web carregada
echo.
echo ------------------------------------------------------------
echo   Acesse o sistema:
echo   http://localhost:3000
echo ------------------------------------------------------------
echo.
echo   Para encerrar com seguranca, abra na Area de Trabalho:
echo   "Encerrar Radar Comunitario.bat"
echo.
echo ============================================================
start "" "http://localhost:3000"
exit /b 0
