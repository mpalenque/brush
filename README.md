# 🎨 Multi-Screen Wallpaper Generator

Sistema de wallpaper sincronizado para múltiples pantallas con animación orgánica y control centralizado.

## 🚀 Instalación y Configuración

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Iniciar el Servidor
```bash
npm start
```

El servidor se ejecutará en `http://localhost:3000`

## 📱 URLs del Sistema

### Panel de Control Principal
- **Control General**: `http://localhost:3000/control`
  - Configura parámetros globales (patrón, tamaño, colores, etc.)
  - Controla la animación sincronizada
  - Ajusta el offset horizontal de cada pantalla individual

### Pantallas Individuales (ID 1-9)
- **Pantalla 1**: `http://localhost:3000/screen/1`
- **Pantalla 2**: `http://localhost:3000/screen/2`
- **Pantalla 3**: `http://localhost:3000/screen/3`
- **Pantalla 4**: `http://localhost:3000/screen/4`
- **Pantalla 5**: `http://localhost:3000/screen/5`
- **Pantalla 6**: `http://localhost:3000/screen/6`
- **Pantalla 7**: `http://localhost:3000/screen/7`
- **Pantalla 8**: `http://localhost:3000/screen/8`
- **Pantalla 9**: `http://localhost:3000/screen/9`

## 🎯 Cómo Usar

### Configuración Inicial
1. Abre el **Panel de Control** en `/control`
2. Ajusta la configuración general (patrón, tamaño, colores, etc.)
3. Configura el **offset horizontal** específico para cada pantalla
4. Las pantallas se actualizarán automáticamente

### Despliegue en Múltiples Pantallas
1. Abre Chrome/Firefox en cada pantalla
2. Navega a la URL correspondiente: `/screen/1`, `/screen/2`, etc.
3. Presiona `F11` para pantalla completa
4. Presiona `i` en cualquier pantalla para ocultar/mostrar información

### Control de Animación
1. Desde el panel de control, haz clic en **"Iniciar Animación Sincronizada"**
2. Todas las pantallas comenzarán la animación al mismo tiempo
3. La animación sigue un patrón orgánico que respeta la secuencia de pantallas 1→9

## ⚙️ Características

### Configuración Global (aplicada a todas las pantallas):
- **Tipo de Patrón**: Grid, Brick, Metro-tile, Diamond, etc.
- **Repeticiones**: Horizontal y vertical
- **Tamaño del Patrón**: 20px - 300px
- **Opacidad**: 0% - 100%
- **Rotación Individual**: 0° - 360°
- **Zoom General**: 10% - 300%
- **Modo de Mezcla**: Normal, Multiplicar, Pantalla, etc.
- **Color de Fondo**: Selector de color
- **Velocidad de Animación**: 100ms - 3000ms

### Configuración Individual por Pantalla:
- **Offset Horizontal**: -500px a +500px (único parámetro individual)

### Sincronización:
- **WebSocket Real-time**: Cambios instantáneos en todas las pantallas
- **Animación Sincronizada**: Todas las pantallas inician la animación simultáneamente
- **Efecto Orgánico**: La animación fluye naturalmente de pantalla 1 a 9

## 🔧 Estructura Técnica

### Archivos Principales:
- `server.js` - Servidor Express + WebSocket
- `control.html` - Panel de control principal
- `screen.html` - Cliente para pantallas individuales
- `wallpaper-animated.html` - Versión original standalone
- `processed.png` - Imagen del patrón a repetir

### Comunicación:
- **Express.js**: Servidor HTTP y API REST
- **Socket.io**: Comunicación WebSocket en tiempo real
- **Canvas 2D**: Renderizado de alta calidad con devicePixelRatio

### Estado Global:
```json
{
  "general": {
    "patternType": "brick",
    "repetitionX": 10,
    "repetitionY": 8,
    "patternSize": 245,
    "opacity": 100,
    "rotation": 0,
    "zoom": 1.2,
    "blendMode": "multiply",
    "backgroundColor": "#ffffff",
    "animationSpeed": 800
  },
  "screens": {
    "1": { "offsetX": -50 },
    "2": { "offsetX": -30 },
    "3": { "offsetX": -10 },
    "4": { "offsetX": 10 },
    "5": { "offsetX": 30 },
    "6": { "offsetX": 50 },
    "7": { "offsetX": 70 },
    "8": { "offsetX": 90 },
    "9": { "offsetX": 110 }
  },
  "animation": {
    "isRunning": false,
    "startTime": null,
    "sequence": "organic"
  }
}
```

## 🎮 Controles de Teclado

En cualquier pantalla individual:
- **`i`**: Alternar información de pantalla y estado de conexión

## 🌐 Red y Conectividad

### Para uso en red local:
1. Cambia `localhost` por la IP del servidor en las URLs
2. Asegúrate de que el puerto 3000 esté abierto
3. Todas las pantallas deben poder acceder al servidor

### Ejemplo para red local:
Si el servidor está en `192.168.1.100`:
- Control: `http://192.168.1.100:3000/control`
- Pantalla 1: `http://192.168.1.100:3000/screen/1`

## 🐛 Troubleshooting

### Problemas Comunes:
1. **"processed.png no encontrado"**: Asegúrate de que el archivo esté en la carpeta raíz
2. **Pantallas no sincronizadas**: Verifica la conexión WebSocket en el estado de conexión
3. **Animación no funciona**: Revisa que el servidor esté funcionando y las pantallas conectadas

### Logs del Servidor:
El servidor muestra logs de conexiones y desconexiones en la consola.

## 📝 Notas

- El sistema soporta hasta 9 pantallas simultáneas
- La animación es orgánica y empieza desde la pantalla 1
- Solo el offset horizontal es configurable por pantalla
- Todos los demás parámetros son globales y sincronizados

## Valores por defecto (configuración inicial)

Al iniciar sin estado previo, el sistema utiliza estos valores por defecto en el panel de control y en el servidor:

- Tipo de Patrón: Orgánico Complejo
- Repeticiones Horizontales: 13
- Repeticiones Verticales: 12
- Tamaño del Patrón: 300px
- Rotación: 0°
- Zoom: 230%
- Color de Fondo: RGB 245, 221, 199 (#F5DDC7)
- Perfume - Separación H: 0.45×
- Perfume - Separación V: 0.70×
- Perfume - Tamaño: 85%
