@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "COMPOSE_FILE=%ROOT_DIR%\docker-compose.yml"
set "ENV_FILE=%ROOT_DIR%\.env.local"

echo.
echo ==== Radar Comunitario - inicializacao local ====
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo ERRO: Docker nao foi encontrado no PATH.
  echo Instale e inicie o Docker Engine antes de executar este arquivo.
  pause
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo ERRO: arquivo .env.local nao encontrado em:
  echo %ENV_FILE%
  echo.
  echo Copie .env.example para .env.local e preencha as credenciais locais.
  pause
  exit /b 1
)

if not exist "%COMPOSE_FILE%" (
  echo ERRO: docker-compose.yml nao encontrado.
  pause
  exit /b 1
)

echo Verificando o Docker Engine...
docker info >nul 2>&1
if errorlevel 1 (
  echo ERRO: o Docker Engine nao esta em execucao ou nao esta acessivel.
  pause
  exit /b 1
)

echo Validando a configuracao do Compose...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" config --quiet
if errorlevel 1 (
  echo ERRO: a configuracao do Docker Compose e invalida.
  pause
  exit /b 1
)

echo.
echo Iniciando a API e o agente WhatsApp...
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up -d --build api whatsapp-agent
if errorlevel 1 (
  echo ERRO: nao foi possivel iniciar os containers.
  pause
  exit /b 1
)

echo.
echo Containers iniciados. Na primeira execucao, escaneie o QR Code abaixo.
echo Para encerrar a visualizacao dos logs, pressione Ctrl+C. Os containers continuarao ativos.
echo.
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" logs -f whatsapp-agent

endlocal
