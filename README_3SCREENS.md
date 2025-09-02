# Brush Wallpaper System - 3 Pantallas

Sistema de wallpapers interactivo que permite controlar patrones y imágenes superpuestas en un canvas que cubre 3 pantallas de 2160x3840 cada una.

## Funcionalidades Implementadas

### 🖥️ Canvas de 3 Pantallas
- Canvas total de **6480x3840** pixels (3 pantallas de 2160x3840)
- Patrones que se repiten de forma continua a través de las 3 pantallas
- Resolución optimizada para configuraciones multi-monitor

### 🎨 Control de Patrones de Fondo
- **Múltiples tipos de patrón**: Grid, Brick, Hexagon, Diamond, Mirror, Rotation, Scale y Organic Complex
- **Repeticiones configurables**: Control de repeticiones en ejes X e Y
- **Separación y espaciado**: Ajuste fino del espaciado entre elementos del patrón
- **Transformaciones**: Rotación, zoom y efectos de blend
- **Color de fondo personalizable**

### 🖼️ Control de Imágenes Superpuestas
- **Selección de imagen**: Blue.png, Red.png o Pink.png
- **Cantidad configurable**: Control independiente de cantidad en ejes X e Y
- **Posicionamiento**: Offset horizontal y vertical para mover las imágenes por todo el canvas
- **Tamaño ajustable**: Control del tamaño de las imágenes superpuestas
- **Espaciado configurable**: Control del espaciado entre imágenes en ambos ejes

### ⌨️ Controles de Teclado
- **Tecla 'a'**: Guarda el wallpaper completo como imagen PNG
- **Tecla 'i'**: Muestra/oculta información de depuración
- **Teclas 1/2/3**: Selección rápida de imágenes (Red/Pink/Blue)

## URLs de Acceso

### Páginas Principales
- **Panel de Control**: `http://localhost:3000/control`
- **Canvas de 3 Pantallas**: `http://localhost:3000/3screens`

### Páginas Legacy (mantienen compatibilidad)
- **Screen Individual**: `http://localhost:3000/screen/[1-9]`
- **Brush Reveal**: `http://localhost:3000/brush-reveal.html`

## Cómo Usar

### 1. Iniciar el Servidor
```bash
cd /Users/mpalenque/Desktop/brush/brush
node server.js
```

### 2. Abrir Panel de Control
- Navega a `http://localhost:3000/control`
- Ajusta los parámetros del patrón de fondo
- Configura las imágenes superpuestas en la sección "Control de Imágenes Superpuestas"

### 3. Ver Resultado
- Abre `http://localhost:3000/3screens` en una nueva pestaña
- El canvas mostrará el patrón en tiempo real
- Los cambios del panel de control se reflejan inmediatamente

### 4. Guardar Wallpaper
- En la página de 3 pantallas, presiona la tecla **'a'**
- Se descargará automáticamente un archivo PNG de 6480x3840

## Configuraciones Disponibles

### Patrón de Fondo
- **Tipo de Patrón**: 13 tipos diferentes disponibles
- **Repeticiones X/Y**: 1-500 / 1-25
- **Separación X/Y**: 50-1000px
- **Espaciado X/Y**: 0-500px
- **Tamaño**: 50-1000px
- **Rotación**: 0-360°
- **Zoom**: 50%-500%

### Imágenes Superpuestas
- **Cantidad X**: 1-10 imágenes
- **Cantidad Y**: 1-8 imágenes
- **Offset X/Y**: -2000 a +2000px (para mover por todo el canvas)
- **Tamaño**: 50-500px
- **Espaciado X**: 200-2000px
- **Espaciado Y**: 200-1500px
- **Imagen**: Red, Blue o Pink

## Estructura de Archivos

```
/brush
├── server.js                 # Servidor principal
├── screen.html              # Canvas de 3 pantallas (NUEVO)
├── control.html             # Panel de control (ACTUALIZADO)
├── assets/
│   ├── css/control.css     # Estilos del panel
│   └── js/control.js       # Lógica del panel (ACTUALIZADO)
├── patterns/               # Imágenes de patrones
├── processed/              # Imágenes procesadas
├── blue.png               # Imagen azul superpuesta
├── red.png                # Imagen roja superpuesta
└── pink.png               # Imagen rosa superpuesta
```

## Notas Técnicas

### Canvas de 3 Pantallas
- Resolución total: 6480x3840 pixels
- Cada pantalla: 2160x3840 pixels
- Las imágenes superpuestas pueden moverse libremente por todo el espacio

### Comunicación en Tiempo Real
- WebSocket connection para sincronización instantánea
- El panel de control envía cambios al canvas automáticamente
- Sin necesidad de recargar páginas

### Guardado de Wallpapers
- Formato PNG de alta calidad
- Captura completa del canvas incluyendo patrones e imágenes superpuestas
- Nombres de archivo con timestamp para evitar sobrescritura

## Compatibilidad

- Compatible con el sistema original de pantallas individuales
- Mantiene funcionalidad de Brush Reveal
- Nueva funcionalidad funciona independientemente del sistema legacy
