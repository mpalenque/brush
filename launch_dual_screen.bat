@echo off
setlocal EnableDelayedExpansion

REM ===== Configuración simple - Solo Screen 1 en dos monitores =====
REM IP fija del servidor
set LOCAL_IP=192.168.1.100
set SERVER_PORT=3000
set BRUSH_URL=http://!LOCAL_IP!:!SERVER_PORT!/brush-reveal.html

echo Iniciando Brush Reveal en dos monitores...
echo IP: 192.168.1.100 - URL: http://192.168.1.100:3000/brush-reveal.html

REM Monitor 1 (principal) - posición 0,0
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --window-position=0,0 ^
    --disable-infobars ^
    --disable-extensions ^
    --autoplay-policy=no-user-gesture-required ^
    "!BRUSH_URL!"

REM Esperar 2 segundos
timeout /t 2 /nobreak >nul

REM Monitor 2 (secundario) - posición 1920,0 (ajustar según resolución)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --window-position=1920,0 ^
    --disable-infobars ^
    --disable-extensions ^
    --autoplay-policy=no-user-gesture-required ^
    "!BRUSH_URL!"

echo Pantallas iniciadas. Presiona cualquier tecla para salir...
pause >nul
