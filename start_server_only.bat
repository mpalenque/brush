@echo off
setlocal EnableDelayedExpansion

REM ===== Script simple para solo iniciar el servidor =====
echo Iniciando servidor Node.js...
cd /d "C:\Users\002\Desktop\brush\brush"

REM Verificar si Node está disponible
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js no encontrado. Verificando NVM...
    if exist "%LOCALAPPDATA%\nvm\nvm.exe" (
        echo Activando Node.js 20.18.0 via NVM...
        "%LOCALAPPDATA%\nvm\nvm.exe" use 20.18.0
        timeout /t 2 /nobreak >nul
    ) else (
        echo ERROR: Ni Node.js ni NVM encontrados.
        pause
        exit /b 1
    )
)

REM Matar servidor previo
taskkill /f /im node.exe >nul 2>&1

REM Iniciar servidor
echo Servidor iniciando en http://192.168.1.100:3000
echo Panel de control: http://192.168.1.100:3000/control
echo.
echo Para detener el servidor: Ctrl+C o cerrar esta ventana
echo.
node server.js
