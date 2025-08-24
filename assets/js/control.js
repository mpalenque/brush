/**
 * CONTROL PANEL - MAIN JAVASCRIPT
 * Lógica principal del panel de control multi-pantalla
 * Maneja WebSocket, configuración general, pantallas y UI
 */

// ==============================
// VARIABLES GLOBALES
// ==============================

let socket;
let connectedScreens = new Set();

// Elementos del DOM
const elements = {
    connectionStatus: null,
    patternType: null,
    repetitionX: null,
    repetitionY: null,
    patternSize: null,
    rotation: null,
    zoom: null,
    perfumeSpacingH: null,
    perfumeSpacingV: null,
    perfumeSizeFactor: null,
    backgroundColor: null,
    toggleWallpaper: null,
    savePattern: null,
    screensGrid: null,
    urlList: null
};

// Valores mostrados
const values = {
    repetitionXValue: null,
    repetitionYValue: null,
    sizeValue: null,
    rotationValue: null,
    zoomValue: null,
    perfumeSpacingHValue: null,
    perfumeSpacingVValue: null,
    perfumeSizeFactorValue: null,
};

let backgroundRgb = null;

// ==============================
// INICIALIZACIÓN
// ==============================

function initializeControlPanel() {
    // Esperar a que Socket.IO esté disponible
    if (typeof io === 'undefined') {
        setTimeout(initializeControlPanel, 100);
        return;
    }
    
    // Inicializar elementos del DOM
    initializeDOMElements();
    
    // Configurar WebSocket
    setupWebSocket();
    
    // Configurar controles
    setupGeneralControls();
    setupEventListeners();
    
    // Generar UI
    generateScreenControls();
    generateURLs();
    updateUI();
    
    console.log('Panel de control inicializado correctamente');
}

function initializeDOMElements() {
    // Elementos principales
    elements.connectionStatus = document.getElementById('connectionStatus');
    elements.patternType = document.getElementById('patternType');
    elements.repetitionX = document.getElementById('repetitionX');
    elements.repetitionY = document.getElementById('repetitionY');
    elements.patternSize = document.getElementById('patternSize');
    elements.rotation = document.getElementById('rotation');
    elements.zoom = document.getElementById('zoom');
    elements.perfumeSpacingH = document.getElementById('perfumeSpacingH');
    elements.perfumeSpacingV = document.getElementById('perfumeSpacingV');
    elements.perfumeSizeFactor = document.getElementById('perfumeSizeFactor');
    elements.backgroundColor = document.getElementById('backgroundColor');
    elements.toggleWallpaper = document.getElementById('toggleWallpaper');
    elements.savePattern = document.getElementById('savePattern');
    elements.screensGrid = document.getElementById('screensGrid');
    elements.urlList = document.getElementById('urlList');

    // Valores mostrados
    values.repetitionXValue = document.getElementById('repetitionXValue');
    values.repetitionYValue = document.getElementById('repetitionYValue');
    values.sizeValue = document.getElementById('sizeValue');
    values.rotationValue = document.getElementById('rotationValue');
    values.zoomValue = document.getElementById('zoomValue');
    values.perfumeSpacingHValue = document.getElementById('perfumeSpacingHValue');
    values.perfumeSpacingVValue = document.getElementById('perfumeSpacingVValue');
    values.perfumeSizeFactorValue = document.getElementById('perfumeSizeFactorValue');

    // Elemento RGB
    backgroundRgb = document.getElementById('backgroundRgb');
}

// ==============================
// WEBSOCKET Y COMUNICACIÓN
// ==============================

function setupWebSocket() {
    socket = io();
    
    // Exponer socket globalmente para el procesador OpenCV
    window.socket = socket;
    
    // Eventos de conexión
    socket.on('connect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '✅ Conectado al servidor';
            elements.connectionStatus.className = 'connection-status connected';
        }
        socket.emit('registerScreen', { screenId: 0, type: 'control' });
    });

    socket.on('disconnect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '❌ Desconectado del servidor';
            elements.connectionStatus.className = 'connection-status disconnected';
        }
    });

    socket.on('initialState', (state) => {
        loadGeneralConfig(state.general);
        updateWallpaperButtonState(state.wallpaper?.isActive || false);
        updateUI();
    });

    // Eventos específicos
    socket.on('wallpaperToggle', (data) => {
        updateWallpaperButtonState(data.isActive);
    });

    socket.on('patternSaved', (data) => {
        handlePatternSavedResponse(data);
    });
}

// ==============================
// CONFIGURACIÓN GENERAL
// ==============================

function loadGeneralConfig(config) {
    if (!config) return;
    
    if (elements.patternType) elements.patternType.value = config.patternType || 'organic-complex';
    if (elements.repetitionX) elements.repetitionX.value = config.repetitionX || 13;
    if (elements.repetitionY) elements.repetitionY.value = config.repetitionY || 12;
    if (elements.patternSize) elements.patternSize.value = config.patternSize || 300;
    if (elements.rotation) elements.rotation.value = config.rotation || 0;
    if (elements.zoom) elements.zoom.value = config.zoom || 2.3;
    if (elements.perfumeSpacingH) elements.perfumeSpacingH.value = config.perfumeSpacingH || 0.45;
    if (elements.perfumeSpacingV) elements.perfumeSpacingV.value = config.perfumeSpacingV || 0.7;
    if (elements.perfumeSizeFactor) elements.perfumeSizeFactor.value = config.perfumeSizeFactor || 0.85;
    if (elements.backgroundColor) elements.backgroundColor.value = config.backgroundColor || '#F5DDC7';
    
    updateBackgroundRgb(elements.backgroundColor?.value);
}

function setupGeneralControls() {
    const generalControls = [
        'patternType', 'repetitionX', 'repetitionY', 'patternSize', 
        'rotation', 'zoom', 'perfumeSpacingH', 'perfumeSpacingV', 'perfumeSizeFactor'
    ];

    generalControls.forEach(controlName => {
        const element = elements[controlName];
        if (element) {
            element.addEventListener('input', (e) => {
                const config = { [controlName]: e.target.value };
                socket?.emit('updateGeneralConfig', config);
                updateUI();
            });
        }
    });
}

function setupEventListeners() {
    // Control de wallpaper
    if (elements.toggleWallpaper) {
        elements.toggleWallpaper.addEventListener('click', () => {
            socket?.emit('requestAnimationStart');
        });
    }

    // Guardado de patrón
    if (elements.savePattern) {
        elements.savePattern.addEventListener('click', () => {
            elements.savePattern.textContent = '⏳ Guardando patrón...';
            elements.savePattern.disabled = true;
            socket?.emit('savePattern');
        });
    }

    // Color de fondo
    if (elements.backgroundColor) {
        elements.backgroundColor.addEventListener('input', (e) => {
            const hex = e.target.value;
            updateBackgroundRgb(hex);
            socket?.emit('updateGeneralConfig', { backgroundColor: hex });
        });
    }
    
    // Configurar controles de rango con actualización en tiempo real
    setupRangeControls();
}

function setupRangeControls() {
    // Configurar sliders de threshold y otros controles OpenCV
    const thresholdValue = document.getElementById('thresholdValue');
    const thresholdDisplay = document.getElementById('thresholdDisplay');
    
    if (thresholdValue && thresholdDisplay) {
        thresholdValue.addEventListener('input', function(e) {
            thresholdDisplay.textContent = e.target.value;
        });
        thresholdDisplay.textContent = thresholdValue.value || '200';
    }
    
    const minAreaValue = document.getElementById('minAreaValue');
    const minAreaDisplay = document.getElementById('minAreaDisplay');
    
    if (minAreaValue && minAreaDisplay) {
        minAreaValue.addEventListener('input', function(e) {
            minAreaDisplay.textContent = e.target.value;
        });
        minAreaDisplay.textContent = minAreaValue.value || '1000';
    }
    
    const epsilonValue = document.getElementById('epsilonValue');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    
    if (epsilonValue && epsilonDisplay) {
        epsilonValue.addEventListener('input', function(e) {
            epsilonDisplay.textContent = parseFloat(e.target.value).toFixed(3);
        });
        epsilonDisplay.textContent = parseFloat(epsilonValue.value || '0.02').toFixed(3);
    }
    
    const aspectRatioTolerance = document.getElementById('aspectRatioTolerance');
    const aspectRatioDisplay = document.getElementById('aspectRatioDisplay');
    
    if (aspectRatioTolerance && aspectRatioDisplay) {
        aspectRatioTolerance.addEventListener('input', function(e) {
            aspectRatioDisplay.textContent = parseFloat(e.target.value).toFixed(1);
        });
        aspectRatioDisplay.textContent = parseFloat(aspectRatioTolerance.value || '2.0').toFixed(1);
    }
}

// ==============================
// INTERFAZ DE USUARIO
// ==============================

function updateUI() {
    if (values.repetitionXValue && elements.repetitionX) {
        values.repetitionXValue.textContent = elements.repetitionX.value;
    }
    if (values.repetitionYValue && elements.repetitionY) {
        values.repetitionYValue.textContent = elements.repetitionY.value;
    }
    if (values.sizeValue && elements.patternSize) {
        values.sizeValue.textContent = elements.patternSize.value + 'px';
    }
    if (values.rotationValue && elements.rotation) {
        values.rotationValue.textContent = elements.rotation.value + '°';
    }
    if (values.zoomValue && elements.zoom) {
        values.zoomValue.textContent = Math.round(elements.zoom.value * 100) + '%';
    }
    if (values.perfumeSpacingHValue && elements.perfumeSpacingH) {
        values.perfumeSpacingHValue.textContent = parseFloat(elements.perfumeSpacingH.value).toFixed(2) + '×';
    }
    if (values.perfumeSpacingVValue && elements.perfumeSpacingV) {
        values.perfumeSpacingVValue.textContent = parseFloat(elements.perfumeSpacingV.value).toFixed(2) + '×';
    }
    if (values.perfumeSizeFactorValue && elements.perfumeSizeFactor) {
        values.perfumeSizeFactorValue.textContent = Math.round(elements.perfumeSizeFactor.value * 100) + '%';
    }
    
    updateBackgroundRgb(elements.backgroundColor?.value);
}

function updateWallpaperButtonState(isActive) {
    if (!elements.toggleWallpaper) return;
    
    if (isActive) {
        elements.toggleWallpaper.textContent = '🔴 Apagar Wallpaper';
        elements.toggleWallpaper.className = 'wallpaper-off';
    } else {
        elements.toggleWallpaper.textContent = '🟢 Encender Wallpaper + Animación';
        elements.toggleWallpaper.className = 'wallpaper-on';
    }
}

function updateBackgroundRgb(hex) {
    if (!hex || !backgroundRgb) return;
    
    const color = hexToRgb(hex);
    if (color) {
        backgroundRgb.textContent = `RGB: ${color.r}, ${color.g}, ${color.b}`;
    }
}

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

// ==============================
// GENERACIÓN DE CONTROLES
// ==============================

function generateScreenControls() {
    if (!elements.screensGrid) return;
    
    elements.screensGrid.innerHTML = '';
    
    for (let i = 1; i <= 9; i++) {
        const screenDiv = document.createElement('div');
        screenDiv.className = 'control-group';
        screenDiv.innerHTML = `
            <button onclick="openScreen(${i})" style="background-color: #007bff; font-size: 14px;">
                🖥️ Abrir Pantalla ${i}
            </button>
        `;
        elements.screensGrid.appendChild(screenDiv);
    }
}

function generateURLs() {
    if (!elements.urlList) return;
    
    elements.urlList.innerHTML = '';
    const baseUrl = window.location.origin;
    
    for (let i = 1; i <= 9; i++) {
        const urlDiv = document.createElement('div');
        urlDiv.className = 'url-item';
        urlDiv.textContent = `${baseUrl}/screen/${i}`;
        urlDiv.onclick = () => window.open(`${baseUrl}/screen/${i}`);
        elements.urlList.appendChild(urlDiv);
    }
    
    // Agregar URL de brush-reveal
    const brushUrlDiv = document.createElement('div');
    brushUrlDiv.className = 'url-item';
    brushUrlDiv.textContent = `${baseUrl}/brush-reveal`;
    brushUrlDiv.onclick = () => window.open(`${baseUrl}/brush-reveal`);
    elements.urlList.appendChild(brushUrlDiv);
}

// ==============================
// FUNCIONES DE PANTALLAS
// ==============================

function openScreen(screenId) {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/screen/${screenId}`;
    const screenWindow = window.open(url, `screen-${screenId}`, 'width=1920,height=1080');
    
    if (screenWindow) {
        console.log(`Pantalla ${screenId} abierta en nueva pestaña`);
    } else {
        alert('Por favor, permite las ventanas emergentes para abrir las pantallas');
    }
}

function openAllScreens() {
    const baseUrl = window.location.origin;
    let successCount = 0;
    
    for (let i = 1; i <= 9; i++) {
        const url = `${baseUrl}/screen/${i}`;
        const screenWindow = window.open(url, `screen-${i}`, 'width=1920,height=1080');
        if (screenWindow) {
            successCount++;
        }
    }
    
    if (successCount === 9) {
        alert('✅ Las 9 pantallas se abrieron correctamente');
    } else {
        alert(`⚠️ Se abrieron ${successCount} de 9 pantallas. Verifica que las ventanas emergentes estén permitidas.`);
    }
}

function openBrushReveal() {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/brush-reveal`;
    window.open(url, 'brush-reveal', 'width=1920,height=1080');
}

// ==============================
// MANEJADORES DE EVENTOS DEL SERVIDOR
// ==============================

function handlePatternSavedResponse(data) {
    if (!elements.savePattern) return;
    
    if (data.success) {
        elements.savePattern.textContent = '✅ Patrón guardado exitosamente';
        elements.savePattern.style.backgroundColor = '#28a745';
        
        setTimeout(() => {
            elements.savePattern.textContent = '💾 Guardar Patrón como Imagen';
            elements.savePattern.style.backgroundColor = '';
            elements.savePattern.disabled = false;
        }, 3000);
    } else {
        elements.savePattern.textContent = '❌ Error al guardar';
        elements.savePattern.style.backgroundColor = '#dc3545';
        
        setTimeout(() => {
            elements.savePattern.textContent = '💾 Guardar Patrón como Imagen';
            elements.savePattern.style.backgroundColor = '';
            elements.savePattern.disabled = false;
        }, 3000);
    }
}

// ==============================
// FUNCIONES GLOBALES (para HTML inline)
// ==============================

// Exponer funciones necesarias globalmente
window.openScreen = openScreen;
window.openAllScreens = openAllScreens;
window.openBrushReveal = openBrushReveal;

// ==============================
// INICIALIZACIÓN AUTOMÁTICA
// ==============================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeControlPanel);
} else {
    initializeControlPanel();
}
