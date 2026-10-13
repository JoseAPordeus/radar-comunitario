@echo off
setlocal EnableExtensions
title Radar Comunitario - Homologacao API autenticada
color 0B
set "PROJECT_DIR=C:\Users\jose.pordeus1\Documents\radar-comunitario"

cd /d "%PROJECT_DIR%"
echo.
echo ============================================================
echo       RADAR COMUNITARIO - HOMOLOGACAO API AUTENTICADA
echo ============================================================
echo.
echo O teste usa dados temporarios, nao envia mensagens e remove
echo automaticamente os contatos e usuario ao terminar.
echo.

docker compose --env-file "%PROJECT_DIR%\.env.local" -f "%PROJECT_DIR%\docker-compose.yml" exec -T api node dist/scripts/homologarApi.js
if errorlevel 1 (
  color 0C
  echo.
  echo [FALHA] A homologacao autenticada nao passou.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo [OK] Homologacao autenticada concluida.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
exit /b 0
