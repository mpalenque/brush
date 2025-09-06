# Sistema Robusto de Gestión de Imágenes

## Descripción

Este sistema gestiona de manera robusta la secuencia completa cuando se presiona la tecla "1":

1. **Captura de cámara** (6 segundos)
2. **Actualización robusta** de `processed.png` en `screen.html`
3. **Captura de canvas** y guardado como `wallpaper.jpg`
4. **Continuación** de la secuencia de coloreado

## Archivos Modificados

### Nuevos Archivos

- `js/modules/image-sync-manager.js` - Gestor principal de sincronización

### Archivos Modificados

- `screen.html` - Integración del sistema robusto de carga de imágenes
- `server.js` - Eventos y manejo mejorado de la secuencia
- `js/control.js` - Feedback visual y eventos del gestor

## Funcionamiento Detallado

### 1. Inicio de Secuencia (Tecla "1")

Cuando se presiona la tecla "1" en el control:

```javascript
// control.js
function startBrushRevealSequence() {
    socket.emit('startBrushRevealSequence');
}
```

### 2. Servidor - Orquestación de la Secuencia

El servidor maneja toda la secuencia:

```javascript
// server.js
socket.on('startBrushRevealSequence', () => {
    // 1. Esperar 6 segundos para captura y procesamiento
    setTimeout(() => {
        // 2. Notificar que processed.png está listo
        io.emit('processedImageReady', { type: 'processed' });
        
        // 3. Solicitar recarga sincronizada con captura posterior
        io.emit('reloadRequestSync', { 
            screenId: 1, 
            forceProcessed: true, 
            captureAfterReload: true 
        });
    }, 6000);
});
```

### 3. Screen.html - Carga Robusta de Imágenes

El sistema de carga robusto implementa:

- **Múltiples intentos** con delay incremental
- **Cache-busting** para obtener la versión más reciente
- **Validación** de carga exitosa
- **Configuración de alta calidad** para las imágenes

```javascript
// screen.html
function loadImageRobust(src, onSuccess, onError, maxAttempts = 3) {
    // Implementación con reintentos y validación
}
```

### 4. Gestor de Sincronización (image-sync-manager.js)

Coordina toda la secuencia con estado y recuperación de errores:

```javascript
class ImageSyncManager {
    async startSequence() {
        await this.waitForCameraCapture();           // 6s
        await this.updateProcessedImageInScreens();  // Actualización robusta
        await this.captureAndSaveWallpaper();        // Canvas -> wallpaper.jpg
        await this.continueColorSequence();          // Continuar coloreado
    }
}
```

## Eventos del Sistema

### Eventos Principales

1. `startBrushRevealSequence` - Inicia la secuencia
2. `processedImageReady` - Confirma que processed.png está listo
3. `reloadRequestSync` - Solicita recarga sincronizada de pantalla
4. `screenReady` - Pantalla confirma que está lista
5. `requestCanvasCapture` - Solicita captura de canvas
6. `wallpaperSaved` - Confirma que wallpaper.jpg fue guardado
7. `continueWithWallpaperColoring` - Continúa secuencia de coloreado

### Flujo de Eventos

```
Control (tecla "1")
    ↓ startBrushRevealSequence
Server (espera 6s)
    ↓ processedImageReady
    ↓ reloadRequestSync
Screen (carga robusta)
    ↓ screenReady
Server
    ↓ requestCanvasCapture
Screen (captura canvas)
    ↓ saveScreenCanvas
Server (guarda wallpaper.jpg)
    ↓ wallpaperSaved
Screen
    ↓ continueWithWallpaperColoring
Server → Brush-reveal (continuar coloreado)
```

## Ventajas del Sistema

### 1. Robustez
- Múltiples intentos de carga
- Manejo de errores en cada paso
- Timeouts y fallbacks

### 2. Sincronización
- Eventos coordinados entre componentes
- Estado rastreado en cada paso
- Operaciones atómicas

### 3. Visibilidad
- Logging detallado en cada paso
- Feedback visual en el control
- Estados de error claramente identificados

### 4. Similitud con Brush-Reveal
- Inspirado en el sistema robusto existente
- Cache-busting efectivo
- Carga de alta calidad

## Configuración

### Variables Importantes

```javascript
// image-sync-manager.js
this.retryAttempts = 3;        // Intentos de recarga
this.retryDelay = 1000;        // Delay entre intentos (ms)
this.loadTimeout = 8000;       // Timeout para cargas (ms)
this.debugMode = true;         // Logging detallado
```

### Personalización

Para modificar el comportamiento:

1. **Timeouts**: Ajustar `loadTimeout` y delays en el servidor
2. **Reintentos**: Modificar `retryAttempts` y `retryDelay`
3. **Logging**: Activar/desactivar `debugMode`

## Resolución de Problemas

### Problemas Comunes

1. **Imagen no se actualiza**
   - Verificar cache-busting
   - Revisar logs de carga robusta
   - Confirmar que processed.png existe

2. **Timeout en captura**
   - Verificar conexión de red
   - Revisar timeouts del servidor
   - Confirmar que screen.html está activo

3. **Wallpaper no se guarda**
   - Verificar permisos de escritura
   - Revisar espacio en disco
   - Confirmar datos del canvas

### Debug

Activar logging detallado:

```javascript
// En screen.html o control.js
window.imageSyncManager.debugMode = true;
```

Verificar estado de secuencia:

```javascript
// En la consola
window.imageSyncManager.getSequenceState();
```

## Futuras Mejoras

1. **Validación de checksums** para verificar integridad de imágenes
2. **Compresión adaptativa** para optimizar transferencias
3. **Sistema de cola** para manejar múltiples operaciones
4. **Métricas de rendimiento** para optimización
5. **Recuperación automática** en caso de fallos
