@echo off
setlocal EnableExtensions
title Radar Comunitario - Encerramento
color 0E
set "PROJECT_DIR=C:\Users\jose.pordeus1\Documents\radar-comunitario"

cls
echo.
echo ============================================================
echo              ENCERRANDO RADAR COMUNITARIO
echo ============================================================
echo.
echo Parando a Interface Web, o Servidor do Sistema e o Agente...
docker compose --env-file "%PROJECT_DIR%\.env.local" -f "%PROJECT_DIR%\docker-compose.yml" stop >nul 2>&1
if errorlevel 1 (
  color 0C
  echo [ERRO] Nao foi possivel encerrar todos os servicos.
  pause
  exit /b 1
)
echo.
echo [OK] Sistema encerrado com seguranca.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
exit /b 0
