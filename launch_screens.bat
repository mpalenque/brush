@echo off
setlocal EnableDelayedExpansion

REM ===== Configuración del servidor de pantallas múltiples =====
REM IP fija del servidor
set LOCAL_IP=192.168.1.100
set SERVER_PORT=3000

REM URLs base
set BASE_URL=http://!LOCAL_IP!:!SERVER_PORT!
set BRUSH_URL=!BASE_URL!/brush-reveal.html
set CONTROL_URL=!BASE_URL!/control

echo ========================================
echo  Iniciando pantallas múltiples - KIOSK MODE
echo ========================================
echo IP fija: 192.168.1.100
echo Puerto: 3000
echo URL Brush Reveal: http://192.168.1.100:3000/brush-reveal.html
echo URL Control: http://192.168.1.100:3000/control
echo ========================================
echo Configuración de monitores:
echo Monitor 1: 1920x1080 (principal)
echo Monitor 2: 2160x3840 (vertical)
echo Monitor 3: 2160x3840 (vertical)
echo Monitor 4: 2160x3840 (vertical)
echo ========================================

REM ===== INICIAR SERVER.JS =====
echo Iniciando servidor Node.js...
cd /d "C:\Users\002\Desktop\brush\brush"

REM Verificar si Node está disponible
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no encontrado. Verificando NVM...
    if exist "%LOCALAPPDATA%\nvm\nvm.exe" (
        echo Activando Node.js 20.18.0 via NVM...
        "%LOCALAPPDATA%\nvm\nvm.exe" use 20.18.0
        timeout /t 2 /nobreak >nul
    ) else (
        echo ERROR: Ni Node.js ni NVM encontrados. Por favor instala Node.js.
        pause
        exit /b 1
    )
)

REM Matar procesos previos del servidor
echo Cerrando servidor previo...
taskkill /f /im node.exe >nul 2>&1

REM Iniciar server.js en background
echo Iniciando server.js en background...
start "Wallpaper Server" /min cmd /c "node server.js"

REM Esperar a que el servidor se inicie
echo Esperando a que el servidor se inicie...
timeout /t 5 /nobreak >nul

REM Verificar que el servidor esté corriendo
echo Verificando servidor...
curl -s http://192.168.1.100:3000 >nul 2>&1
if errorlevel 1 (
    echo Intentando verificar con localhost...
    curl -s http://localhost:3000 >nul 2>&1
    if errorlevel 1 (
        echo ADVERTENCIA: No se pudo verificar el servidor. Continuando de todos modos...
    ) else (
        echo Servidor verificado en localhost:3000
    )
) else (
    echo Servidor verificado en 192.168.1.100:3000
)

echo ========================================
echo  SERVIDOR INICIADO - ABRIENDO PANTALLAS
echo ========================================

REM Cerrar instancias previas de Chrome
echo Cerrando Chrome previo...
taskkill /f /im chrome.exe >nul 2>&1
timeout /t 3 /nobreak >nul


REM ===== MONITOR 2 - Vertical 2160x3840 (Screen 1) =====
echo Abriendo KIOSK en Monitor 2 (2160x3840)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --start-fullscreen ^
    --window-position=1920,0 ^
    --window-size=2160,3840 ^
    --display=1 ^
    --force-device-scale-factor=1 ^
    --disable-infobars ^
    --disable-session-crashed-bubble ^
    --disable-extensions ^
    --disable-notifications ^
    --disable-session-crashed-bubble ^
    --disable-restore-session-state ^
    --disable-background-timer-throttling ^
    --disable-backgrounding-occluded-windows ^
    --disable-renderer-backgrounding ^
    --disable-features=TranslateUI,VizDisplayCompositor ^
    --autoplay-policy=no-user-gesture-required ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-default-apps ^
    --user-data-dir="%TEMP%\chrome_kiosk_2" ^
    "!BRUSH_URL!"

timeout /t 4 /nobreak >nul

REM ===== MONITOR 3 - Vertical 2160x3840 (Screen 1) =====
echo Abriendo KIOSK en Monitor 3 (2160x3840)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --start-fullscreen ^
    --window-position=4080,0 ^
    --window-size=2160,3840 ^
    --display=2 ^
    --force-device-scale-factor=1 ^
    --disable-infobars ^
    --disable-session-crashed-bubble ^
    --disable-extensions ^
    --disable-notifications ^
    --disable-session-crashed-bubble ^
    --disable-restore-session-state ^
    --disable-background-timer-throttling ^
    --disable-backgrounding-occluded-windows ^
    --disable-renderer-backgrounding ^
    --disable-features=TranslateUI,VizDisplayCompositor ^
    --autoplay-policy=no-user-gesture-required ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-default-apps ^
    --user-data-dir="%TEMP%\chrome_kiosk_3" ^
    "!BRUSH_URL!"

timeout /t 4 /nobreak >nul

REM ===== MONITOR 4 - Vertical 2160x3840 (Screen 1) =====
echo Abriendo KIOSK en Monitor 4 (2160x3840)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --kiosk ^
    --start-fullscreen ^
    --window-position=6240,0 ^
    --window-size=2160,3840 ^
    --display=3 ^
    --force-device-scale-factor=1 ^
    --disable-infobars ^
    --disable-session-crashed-bubble ^
    --disable-extensions ^
    --disable-notifications ^
    --disable-session-crashed-bubble ^
    --disable-restore-session-state ^
    --disable-background-timer-throttling ^
    --disable-backgrounding-occluded-windows ^
    --disable-renderer-backgrounding ^
    --disable-features=TranslateUI,VizDisplayCompositor ^
    --autoplay-policy=no-user-gesture-required ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-default-apps ^
    --user-data-dir="%TEMP%\chrome_kiosk_4" ^
    "!BRUSH_URL!"

timeout /t 3 /nobreak >nul

REM ===== ABRIR CANON EDSDK HELP =====
echo Abriendo Canon EDSDK Help...
if exist "C:\Users\002\Desktop\EDSDK-x64\EDSDK (Canon) help.v4p" (
    start "" "C:\Users\002\Desktop\EDSDK-x64\EDSDK (Canon) help.v4p"
    echo ✅ Canon EDSDK Help abierto
) else (
    echo ⚠️ ADVERTENCIA: No se encontró Canon EDSDK Help en la ruta especificada
)

timeout /t 2 /nobreak >nul

REM Opcional: Panel de control en ventana pequeña (no kiosk)
echo Abriendo panel de control...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --new-window ^
    --window-position=100,100 ^
    --window-size=800,600 ^
    --disable-infobars ^
    --disable-session-crashed-bubble ^
    --user-data-dir="%TEMP%\chrome_control" ^
    "!CONTROL_URL!"

echo ========================================
echo  TODAS LAS PANTALLAS INICIADAS EN KIOSK
echo ========================================
echo.
echo Monitor 2 (2160x3840): http://192.168.1.100:3000/brush-reveal.html
echo Monitor 3 (2160x3840): http://192.168.1.100:3000/brush-reveal.html
echo Monitor 4 (2160x3840): http://192.168.1.100:3000/brush-reveal.html
echo Panel Control: http://192.168.1.100:3000/control
echo Canon EDSDK Help: C:\Users\002\Desktop\EDSDK-x64\EDSDK (Canon) help.v4p
echo.
echo IMPORTANTE: Si las pantallas no están en kiosk:
echo 1. Presiona F11 en cada ventana manualmente
echo 2. O ejecuta: launch_force_kiosk.bat
echo.
echo Para cerrar todo (Chrome + Servidor + Canon EDSDK):
echo   taskkill /f /im chrome.exe
echo   taskkill /f /im node.exe
echo   taskkill /f /im vvvv.exe
echo.
echo El servidor seguirá corriendo en background.
echo Para ver logs del servidor, busca la ventana "Wallpaper Server"
echo.
echo Presiona cualquier tecla para continuar...
pause >nul
