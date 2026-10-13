@echo off
setlocal EnableExtensions
title Radar Comunitario - Rotacao do token
color 0E
set "PROJECT_DIR=C:\Users\jose.pordeus1\Documents\radar-comunitario"

cls
echo.
echo ============================================================
echo          ROTACAO SEGURA DO TOKEN DO AGENTE
echo ============================================================
echo.
echo Esta operacao invalida o token atual e reinicia API e WhatsApp.
echo Nenhum token sera exibido na tela.
echo.
set /p "CONFIRM=Digite ROTACIONAR_RADAR para continuar: "
if /i not "%CONFIRM%"=="ROTACIONAR_RADAR" (
  echo.
  echo Operacao cancelada. Nenhum arquivo foi alterado.
  pause
  exit /b 0
)

echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\rotacionar-agent-token.ps1" -ConfirmRotation -RestartServices
if errorlevel 1 (
  color 0C
  echo.
  echo [ERRO] Nao foi possivel concluir a rotacao. Consulte a mensagem acima.
  pause
  exit /b 1
)

echo.
echo [OK] Token rotacionado e servicos reiniciados.
pause
exit /b 0
