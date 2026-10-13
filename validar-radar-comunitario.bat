@echo off
setlocal
title Radar Comunitario - Verificacao
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\validar-radar-comunitario.ps1"
echo.
pause
