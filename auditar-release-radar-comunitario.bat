@echo off
setlocal
title Radar Comunitario - Auditoria de Release
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auditar-release-radar-comunitario.ps1"
echo.
pause
