@echo off
title Dock de salud de transmision (OBS)
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias, esto solo pasa la primera vez...
  call npm install
)
if not exist dist (
  echo Preparando el panel, esto solo pasa la primera vez...
  call npm run build
)

echo.
echo ================================================================
echo  Panel listo en:  http://127.0.0.1:4173
echo  DEJA ESTA VENTANA ABIERTA mientras uses OBS.
echo ================================================================
echo.
call npm run preview
pause
