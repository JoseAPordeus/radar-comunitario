@echo off
setlocal EnableExtensions
title Radar Comunitario - Homologacao RLS
color 0B
set "PROJECT_DIR=C:\Users\jose.pordeus1\Documents\radar-comunitario"

cls
echo.
echo ============================================================
echo          RADAR COMUNITARIO - HOMOLOGACAO DE SEGURANCA
echo ============================================================
echo.
echo Este teste cria usuarios temporarios, verifica o isolamento
echo e remove tudo automaticamente ao terminar.
echo.

cd /d "%PROJECT_DIR%"
docker compose --env-file "%PROJECT_DIR%\.env.local" -f "%PROJECT_DIR%\docker-compose.yml" exec -T api node dist/scripts/homologarRls.js
if errorlevel 1 (
  color 0C
  echo.
  echo [FALHA] A homologacao nao passou.
  echo        Confirme se a migration 027 foi aplicada no Supabase.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo [OK] Homologacao de RLS concluida com sucesso.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
exit /b 0
