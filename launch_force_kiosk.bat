@echo off
setlocal EnableDelayedExpansion

REM ===== Script para FORZAR modo kiosk si Chrome no lo aplicó =====
echo Forzando modo kiosk en todas las ventanas de Chrome...

REM Enviar F11 a todas las ventanas de Chrome para activar fullscreen
powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { [System.Windows.Forms.SendKeys]::SendWait('{F11}'); Start-Sleep -Milliseconds 500 }"

echo Modo kiosk aplicado a todas las ventanas.
echo Si siguen sin estar en fullscreen, presiona F11 manualmente en cada ventana.
pause
