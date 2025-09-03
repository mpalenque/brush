# Nueva Funcionalidad: Rotación Automática de Patrones para Brush Reveal

## 📋 Resumen
Se ha implementado una nueva funcionalidad que permite al panel de control (`/control`) enviar comandos a todas las instancias de `brush-reveal` para que coloreen automáticamente utilizando las imágenes `amarillo.jpg`, `azul.jpg` y `rojo.jpg` del directorio `patterns`, rotando entre ellas cada 2 minutos.

## 🎯 Funcionalidades Implementadas

### 1. **Rotación Automática de Patrones**
- **Duración**: Cada imagen se muestra durante 2 minutos antes de cambiar
- **Secuencia**: amarillo.jpg → azul.jpg → rojo.jpg → (repite)
- **Ubicación**: Las imágenes deben estar en la carpeta `/patterns/`

### 2. **Control Desde Panel**
- **Botón ON/OFF**: "Auto-Rotación ON/OFF" en el panel de control
- **Estado Visual**: El botón cambia de color y texto según el estado
- **Información**: Muestra el estado actual y próximo cambio

### 3. **Comandos WebSocket**
- `startPatternRotation`: Inicia la rotación automática
- `stopPatternRotation`: Detiene la rotación automática
- Transmisión desde control hacia todas las instancias brush-reveal

## 🔧 Archivos Modificados

### 1. **server.js**
```javascript
// Nuevos eventos WebSocket agregados:
socket.on('startPatternRotation', (data) => {
    // Envía configuración a todos los brush-reveal
    connectedClients.forEach((otherClient) => {
        if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
            otherClient.socket.emit('startPatternRotation', {
                patterns: ['amarillo', 'azul', 'rojo'],
                interval: 120000, // 2 minutos
                timestamp: Date.now()
            });
        }
    });
});

socket.on('stopPatternRotation', (data) => {
    // Detiene la rotación en todos los brush-reveal
});
```

### 2. **brush-reveal.js**
```javascript
// Nuevas variables globales:
let automaticRotationEnabled = false;
let rotationInterval = null;
let rotationPatterns = ['amarillo', 'azul', 'rojo'];
let currentRotationIndex = 0;
let rotationIntervalTime = 120000; // 2 minutos

// Nuevas funciones:
function startAutomaticPatternRotation(patternList, interval)
function stopAutomaticPatternRotation()
function rotateToNextPattern()

// Nuevos eventos WebSocket:
socket.on('startPatternRotation', (data) => {
    startAutomaticPatternRotation(data.patterns, data.interval);
});

socket.on('stopPatternRotation', () => {
    stopAutomaticPatternRotation();
});
```

### 3. **control.html**
```html
<!-- Botón actualizado en la sección de configuración -->
<div class="control-group">
    <label>🎨 Rotación Automática Brush Reveal (2 min cada imagen):</label>
    <div class="auto-rotation-controls">
        <button id="autoRotationBtn" class="image-btn" data-active="false">
            ⏸️ Auto-Rotación OFF
        </button>
        <div class="rotation-status" id="rotationStatus">
            Rotación desactivada
        </div>
    </div>
    <small>Cada 2 minutos cambia entre amarillo.jpg, azul.jpg, rojo.jpg para colorear encima en Brush Reveal.</small>
</div>
```

### 4. **assets/js/control.js**
```javascript
// Función actualizada:
function toggleAutoRotation() {
    autoRotationEnabled = !autoRotationEnabled;
    
    if (autoRotationEnabled) {
        // Envía comando al servidor
        socket.emit('startPatternRotation', {
            patterns: ['amarillo', 'azul', 'rojo'],
            interval: 120000 // 2 minutos
        });
    } else {
        // Detiene la rotación
        socket.emit('stopPatternRotation');
    }
}
```

## 🚀 Cómo Usar

### 1. **Preparación**
1. Asegúrate de que las imágenes están en `/patterns/`:
   - `amarillo.jpg`
   - `azul.jpg` 
   - `rojo.jpg`

### 2. **Activación**
1. Abre el panel de control: `http://localhost:3000/control`
2. Localiza la sección "🎨 Rotación Automática Brush Reveal"
3. Haz clic en el botón "⏸️ Auto-Rotación OFF"
4. El botón cambiará a "⏹️ Auto-Rotación ON" (verde)

### 3. **Verificación**
- El estado mostrará: "Rotación activada - iniciando con amarillo.jpg..."
- Cada 2 minutos la imagen cambiará automáticamente
- Todos los brush-reveal conectados recibirán los comandos

### 4. **Desactivación**
- Haz clic nuevamente en el botón para detener la rotación
- El botón volverá a "⏸️ Auto-Rotación OFF" (gris)

## 📊 Flujo de Datos

```
Panel Control (/control)
    ↓ (click botón)
toggleAutoRotation()
    ↓ (emit)
startPatternRotation
    ↓ (WebSocket)
server.js
    ↓ (broadcast)
brush-reveal.js (todas las instancias)
    ↓ (cada 2 min)
rotateToNextPattern()
    ↓ (carga imagen)
loadSpecificImageAndAnimate()
    ↓ (colorea)
colorOnTop()
```

## ✅ Estado de Implementación
- [x] Eventos WebSocket en servidor
- [x] Lógica de rotación en brush-reveal.js
- [x] Controles en panel de control
- [x] Interfaz actualizada
- [x] Documentación completa

## 🔍 Logs para Depuración
Los siguientes mensajes aparecerán en la consola:

**Control Panel:**
```
🔄 Auto-rotación ACTIVADA - 2 minutos entre cambios
📡 Comando startPatternRotation enviado al servidor
```

**Servidor:**
```
🔄 *** SERVER *** Iniciando rotación automática de patrones cada 2 minutos
📡 *** SERVER *** startPatternRotation enviado a brush-reveal clients
```

**Brush Reveal:**
```
🔄 *** BRUSH *** Iniciando rotación automática de patrones: ['amarillo', 'azul', 'rojo']
⏰ *** BRUSH *** Intervalo: 120000ms (120s)
🔄 *** ROTACIÓN AUTOMÁTICA *** [time] Cambiando a: amarillo.jpg - Brush 1
✅ *** ROTACIÓN AUTOMÁTICA *** Patrón aplicado: amarillo.jpg
```

## 🎨 Resultado Final
Cuando esté activa, la funcionalidad:
1. Comenzará inmediatamente con `amarillo.jpg`
2. Después de 2 minutos cambiará a `azul.jpg`
3. Después de otros 2 minutos cambiará a `rojo.jpg`
4. Después de otros 2 minutos volverá a `amarillo.jpg` y continuará el ciclo

Cada cambio se aplicará a **todas** las instancias de brush-reveal conectadas simultáneamente, creando un efecto sincronizado en todo el sistema.
