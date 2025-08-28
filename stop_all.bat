@echo off
echo Cerrando todas las ventanas de Chrome y servidor Node.js...

REM Cerrar Chrome
taskkill /f /im chrome.exe >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Chrome cerrado
) else (
    echo ℹ️ Chrome no estaba ejecutándose
)

REM Cerrar Node.js
taskkill /f /im node.exe >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Servidor Node.js cerrado
) else (
    echo ℹ️ Servidor no estaba ejecutándose
)

echo.
echo Todos los procesos cerrados.
pause
