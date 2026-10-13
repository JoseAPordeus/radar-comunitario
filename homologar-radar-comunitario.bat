@echo off
setlocal
title Radar Comunitario - Homologacao
cd /d "C:\Users\jose.pordeus1\Documents\radar-comunitario"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\homologar-radar-comunitario.ps1"
echo.
pause
