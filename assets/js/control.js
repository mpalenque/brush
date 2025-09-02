/**
 * CONTROL PANconst elements = {
    patternType: null,
    repetitionX: null,
    repetitionY: null,
    separationX: null,
    separationY: null,
    spacingX: null,
    spacingY: null,
    patternSize: null,
    rotation: null,
    zoom: null,
    perfumeSpacingH: null,
    perfumeSpacingV: null,
    perfumeSizeFactor: null,
    backgroundColor: null,
    toggleWallpaper: null,
    savePattern: null,
    screensGrid: null
};RIPT
 * Lógica principal del panel de control multi-pantalla
 * Maneja WebSocket, configuración general, pantallas y UI
 */

// ==============================
// VARIABLES GLOBALES
// ==============================

let socket;
let connectedScreens = new Set();
let selectedImage = 'red'; // Imagen seleccionada por defecto
// Exponer selección inicial globalmente para otros scripts (opencv-processor.js)
window.selectedImage = selectedImage;

// Elementos del DOM
const elements = {
    connectionStatus: null,
    patternType: null,
    repetitionX: null,
    repetitionY: null,
    separationX: null,
    separationY: null,
    spacingX: null,
    spacingY: null,
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
    // Controles de imágenes superpuestas
    overlayCountX: null,
    overlayCountY: null,
    overlayOffsetX: null,
    overlayOffsetY: null,
    overlaySize: null,
    overlaySpacingX: null,
    overlaySpacingY: null,
    overlayRowOffsetX: null,
    overlayRowOffsetY: null,
    overlayColOffsetX: null,
    overlayColOffsetY: null,
    overlayAlternateRowX: null,
    overlayAlternateRowY: null,
    overlayAlternateColX: null,
    overlayAlternateColY: null
};

// Valores mostrados
const values = {
    repetitionXValue: null,
    repetitionYValue: null,
    separationXValue: null,
    separationYValue: null,
    spacingXValue: null,
    spacingYValue: null,
    sizeValue: null,
    rotationValue: null,
    zoomValue: null,
    perfumeSpacingHValue: null,
    perfumeSpacingVValue: null,
    perfumeSizeFactorValue: null,
    // Valores de imágenes superpuestas
    overlayCountXValue: null,
    overlayCountYValue: null,
    overlayOffsetXValue: null,
    overlayOffsetYValue: null,
    overlaySizeValue: null,
    overlaySpacingXValue: null,
    overlaySpacingYValue: null,
    overlayRowOffsetXValue: null,
    overlayRowOffsetYValue: null,
    overlayColOffsetXValue: null,
    overlayColOffsetYValue: null,
    overlayAlternateRowXValue: null,
    overlayAlternateRowYValue: null,
    overlayAlternateColXValue: null,
    overlayAlternateColYValue: null
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
    
    // Configurar controles de teclado
    setupKeyboardControls();
    
    // Configurar botones de selección de imagen
    setupImageSelectionButtons();
    // Configurar selección de fuente de patrón
    setupPatternSourceButtons();
    
    // Configurar controles
    setupGeneralControls();
    setupEventListeners();
    setupOffsetControls(); // Agregar controles de offset manual
    
    // Generar UI
    generateScreenControls();
    updateUI();
    
    console.log('Panel de control inicializado correctamente');
}

function initializeDOMElements() {
    // Elementos principales
    elements.connectionStatus = document.getElementById('connectionStatus');
    elements.patternType = document.getElementById('patternType');
    elements.repetitionX = document.getElementById('repetitionX');
    elements.repetitionY = document.getElementById('repetitionY');
    elements.separationX = document.getElementById('separationX');
    elements.separationY = document.getElementById('separationY');
    elements.spacingX = document.getElementById('spacingX');
    elements.spacingY = document.getElementById('spacingY');
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

    // Elementos de imágenes superpuestas
    elements.overlayCountX = document.getElementById('overlayCountX');
    elements.overlayCountY = document.getElementById('overlayCountY');
    elements.overlayOffsetX = document.getElementById('overlayOffsetX');
    elements.overlayOffsetY = document.getElementById('overlayOffsetY');
    elements.overlaySize = document.getElementById('overlaySize');
    elements.overlaySpacingX = document.getElementById('overlaySpacingX');
    elements.overlaySpacingY = document.getElementById('overlaySpacingY');
    elements.overlayRowOffsetX = document.getElementById('overlayRowOffsetX');
    elements.overlayRowOffsetY = document.getElementById('overlayRowOffsetY');
    elements.overlayColOffsetX = document.getElementById('overlayColOffsetX');
    elements.overlayColOffsetY = document.getElementById('overlayColOffsetY');
    elements.overlayAlternateRowX = document.getElementById('overlayAlternateRowX');
    elements.overlayAlternateRowY = document.getElementById('overlayAlternateRowY');
    elements.overlayAlternateColX = document.getElementById('overlayAlternateColX');
    elements.overlayAlternateColY = document.getElementById('overlayAlternateColY');

    // Valores mostrados
    values.repetitionXValue = document.getElementById('repetitionXValue');
    values.repetitionYValue = document.getElementById('repetitionYValue');
    values.separationXValue = document.getElementById('separationXValue');
    values.separationYValue = document.getElementById('separationYValue');
    values.spacingXValue = document.getElementById('spacingXValue');
    values.spacingYValue = document.getElementById('spacingYValue');
    values.sizeValue = document.getElementById('sizeValue');
    values.rotationValue = document.getElementById('rotationValue');
    values.zoomValue = document.getElementById('zoomValue');
    values.perfumeSpacingHValue = document.getElementById('perfumeSpacingHValue');
    values.perfumeSpacingVValue = document.getElementById('perfumeSpacingVValue');
    values.perfumeSizeFactorValue = document.getElementById('perfumeSizeFactorValue');

    // Valores de imágenes superpuestas
    values.overlayCountXValue = document.getElementById('overlayCountXValue');
    values.overlayCountYValue = document.getElementById('overlayCountYValue');
    values.overlayOffsetXValue = document.getElementById('overlayOffsetXValue');
    values.overlayOffsetYValue = document.getElementById('overlayOffsetYValue');
    values.overlaySizeValue = document.getElementById('overlaySizeValue');
    values.overlaySpacingXValue = document.getElementById('overlaySpacingXValue');
    values.overlaySpacingYValue = document.getElementById('overlaySpacingYValue');
    values.overlayRowOffsetXValue = document.getElementById('overlayRowOffsetXValue');
    values.overlayRowOffsetYValue = document.getElementById('overlayRowOffsetYValue');
    values.overlayColOffsetXValue = document.getElementById('overlayColOffsetXValue');
    values.overlayColOffsetYValue = document.getElementById('overlayColOffsetYValue');
    values.overlayAlternateRowXValue = document.getElementById('overlayAlternateRowXValue');
    values.overlayAlternateRowYValue = document.getElementById('overlayAlternateRowYValue');
    values.overlayAlternateColXValue = document.getElementById('overlayAlternateColXValue');
    values.overlayAlternateColYValue = document.getElementById('overlayAlternateColYValue');

    // Elemento RGB
    backgroundRgb = document.getElementById('backgroundRgb');
}

// ==============================
// WEBSOCKET Y COMUNICACIÓN
// ==============================

function setupWebSocket() {
    socket = io({
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        timeout: 5000
    });
    
    // Exponer socket globalmente para el procesador OpenCV
    window.socket = socket;
    
    // Eventos de conexión
    socket.on('connect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '✅ Conectado al servidor';
            elements.connectionStatus.className = 'connection-status connected';
        }
        socket.emit('registerScreen', { screenId: 0, type: 'control' });
        console.log('🔌 Control panel conectado al servidor');
    });

    socket.on('disconnect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '❌ Desconectado del servidor - reconectando...';
            elements.connectionStatus.className = 'connection-status disconnected';
        }
        console.log('🔌 Control panel desconectado - intentando reconectar...');
    });
    
    socket.on('reconnect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '✅ Reconectado al servidor';
            elements.connectionStatus.className = 'connection-status connected';
        }
        socket.emit('registerScreen', { screenId: 0, type: 'control' });
        console.log('🔌 Control panel reconectado al servidor');
    });

    socket.on('initialState', (state) => {
        // Sync selected image from server state (in case it differs)
        if (state?.general?.selectedImage) {
            selectedImage = state.general.selectedImage;
            window.selectedImage = selectedImage;
            updateImageSelection();
            // Update selected image thumb
            const selThumb = document.getElementById('selectedImageThumb');
            if (selThumb) selThumb.src = `/${selectedImage}.png`;
        }

        loadGeneralConfig(state.general);
        updateWallpaperButtonState(state.wallpaper?.isActive || false);
        updateUI();

    // Initialize pattern preview thumb based on source
    const patThumb = document.getElementById('patternPreviewThumb');
    if (patThumb) patThumb.src = resolvePatternPreviewSrc(state?.general?.patternSource || 'processed');
        const tsEl = document.getElementById('patternLastUpdated');
        if (tsEl) tsEl.textContent = 'inicializado';
    });

    // Eventos específicos
    socket.on('wallpaperToggle', (data) => {
        updateWallpaperButtonState(data.isActive);
    });

    socket.on('patternSaved', (data) => {
        handlePatternSavedResponse(data);
    });

    // Reflect image selection changes coming from this or other control clients
    socket.on('imageSelected', (data) => {
        if (!data?.image) return;
        selectedImage = data.image;
        updateImageSelection();
        const selThumb = document.getElementById('selectedImageThumb');
        if (selThumb) selThumb.src = `/${selectedImage}.png`;
    });

    // Reflejar cambio de fuente de patrón
    socket.on('patternSourceChanged', ({ source }) => {
        updatePatternSourceUI(source);
        const patThumb = document.getElementById('patternPreviewThumb');
        if (patThumb) patThumb.src = resolvePatternPreviewSrc(source);
    });

    // When a new processed pattern is applied, refresh the preview
    socket.on('imageUpdated', (data) => {
        const patThumb = document.getElementById('patternPreviewThumb');
        if (patThumb) patThumb.src = `/processed/processed.png?t=${Date.now()}`;
        const tsEl = document.getElementById('patternLastUpdated');
        if (tsEl) tsEl.textContent = new Date().toLocaleTimeString();
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
    if (elements.separationX) elements.separationX.value = config.separationX || 300;
    if (elements.separationY) elements.separationY.value = config.separationY || 300;
    if (elements.spacingX) elements.spacingX.value = config.spacingX || 0;
    if (elements.spacingY) elements.spacingY.value = config.spacingY || 0;
    if (elements.patternSize) elements.patternSize.value = config.patternSize || 300;
    if (elements.rotation) elements.rotation.value = config.rotation || 0;
    if (elements.zoom) elements.zoom.value = config.zoom || 2.3;
    if (elements.perfumeSpacingH) elements.perfumeSpacingH.value = config.perfumeSpacingH || 0.45;
    if (elements.perfumeSpacingV) elements.perfumeSpacingV.value = config.perfumeSpacingV || 0.7;
    if (elements.perfumeSizeFactor) elements.perfumeSizeFactor.value = config.perfumeSizeFactor || 0.85;
    if (elements.backgroundColor) elements.backgroundColor.value = config.backgroundColor || '#F5DDC7';
    
    // Cargar configuración de overlay
    const overlayConfig = config.overlayImages || {};
    if (elements.overlayCountX) elements.overlayCountX.value = overlayConfig.countX || 3;
    if (elements.overlayCountY) elements.overlayCountY.value = overlayConfig.countY || 2;
    if (elements.overlayOffsetX) elements.overlayOffsetX.value = overlayConfig.offsetX || 0;
    if (elements.overlayOffsetY) elements.overlayOffsetY.value = overlayConfig.offsetY || 0;
    if (elements.overlaySize) elements.overlaySize.value = overlayConfig.size || 200;
    if (elements.overlaySpacingX) elements.overlaySpacingX.value = overlayConfig.spacingX || 800;
    if (elements.overlaySpacingY) elements.overlaySpacingY.value = overlayConfig.spacingY || 600;
    if (elements.overlayRowOffsetX) elements.overlayRowOffsetX.value = overlayConfig.rowOffsetX || 0;
    if (elements.overlayRowOffsetY) elements.overlayRowOffsetY.value = overlayConfig.rowOffsetY || 0;
    if (elements.overlayColOffsetX) elements.overlayColOffsetX.value = overlayConfig.colOffsetX || 0;
    if (elements.overlayColOffsetY) elements.overlayColOffsetY.value = overlayConfig.colOffsetY || 0;
    if (elements.overlayAlternateRowX) elements.overlayAlternateRowX.value = overlayConfig.alternateRowX || 0;
    if (elements.overlayAlternateRowY) elements.overlayAlternateRowY.value = overlayConfig.alternateRowY || 0;
    if (elements.overlayAlternateColX) elements.overlayAlternateColX.value = overlayConfig.alternateColX || 0;
    if (elements.overlayAlternateColY) elements.overlayAlternateColY.value = overlayConfig.alternateColY || 0;
    
    updateBackgroundRgb(elements.backgroundColor?.value);
}

function setupGeneralControls() {
    const generalControls = [
        'patternType', 'repetitionX', 'repetitionY', 'separationX', 'separationY', 'spacingX', 'spacingY', 'patternSize', 
        'rotation', 'zoom', 'perfumeSpacingH', 'perfumeSpacingV', 'perfumeSizeFactor'
    ];

    const overlayControls = [
        'overlayCountX', 'overlayCountY', 'overlayOffsetX', 'overlayOffsetY', 
        'overlaySize', 'overlaySpacingX', 'overlaySpacingY',
        'overlayRowOffsetX', 'overlayRowOffsetY', 'overlayColOffsetX', 'overlayColOffsetY',
        'overlayAlternateRowX', 'overlayAlternateRowY', 'overlayAlternateColX', 'overlayAlternateColY'
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

    // Configurar controles de overlay con estructura anidada
    overlayControls.forEach(controlName => {
        const element = elements[controlName];
        if (element) {
            element.addEventListener('input', (e) => {
                // Mapear nombres de controles a propiedades de overlayImages
                const controlMap = {
                    'overlayCountX': 'countX',
                    'overlayCountY': 'countY',
                    'overlayOffsetX': 'offsetX',
                    'overlayOffsetY': 'offsetY',
                    'overlaySize': 'size',
                    'overlaySpacingX': 'spacingX',
                    'overlaySpacingY': 'spacingY',
                    'overlayRowOffsetX': 'rowOffsetX',
                    'overlayRowOffsetY': 'rowOffsetY',
                    'overlayColOffsetX': 'colOffsetX',
                    'overlayColOffsetY': 'colOffsetY',
                    'overlayAlternateRowX': 'alternateRowX',
                    'overlayAlternateRowY': 'alternateRowY',
                    'overlayAlternateColX': 'alternateColX',
                    'overlayAlternateColY': 'alternateColY'
                };
                
                const overlayKey = controlMap[controlName];
                if (overlayKey) {
                    // Obtener valores actuales de todos los controles de overlay para preservarlos
                    const currentOverlayConfig = {
                        countX: parseInt(elements.overlayCountX?.value) || 3,
                        countY: parseInt(elements.overlayCountY?.value) || 2,
                        offsetX: parseInt(elements.overlayOffsetX?.value) || 0,
                        offsetY: parseInt(elements.overlayOffsetY?.value) || 0,
                        size: parseInt(elements.overlaySize?.value) || 200,
                        spacingX: parseInt(elements.overlaySpacingX?.value) || 800,
                        spacingY: parseInt(elements.overlaySpacingY?.value) || 600,
                        rowOffsetX: parseInt(elements.overlayRowOffsetX?.value) || 0,
                        rowOffsetY: parseInt(elements.overlayRowOffsetY?.value) || 0,
                        colOffsetX: parseInt(elements.overlayColOffsetX?.value) || 0,
                        colOffsetY: parseInt(elements.overlayColOffsetY?.value) || 0,
                        alternateRowX: parseInt(elements.overlayAlternateRowX?.value) || 0,
                        alternateRowY: parseInt(elements.overlayAlternateRowY?.value) || 0,
                        alternateColX: parseInt(elements.overlayAlternateColX?.value) || 0,
                        alternateColY: parseInt(elements.overlayAlternateColY?.value) || 0
                    };
                    
                    // Actualizar solo el valor que cambió
                    currentOverlayConfig[overlayKey] = parseInt(e.target.value) || 0;
                    
                    const config = { 
                        overlayImages: currentOverlayConfig
                    };
                    socket?.emit('updateGeneralConfig', config);
                    updateUI();
                }
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
            socket?.emit('savePattern', { selectedImage });
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
    if (values.separationXValue && elements.separationX) {
        values.separationXValue.textContent = elements.separationX.value + 'px';
    }
    if (values.separationYValue && elements.separationY) {
        values.separationYValue.textContent = elements.separationY.value + 'px';
    }
    if (values.spacingXValue && elements.spacingX) {
        values.spacingXValue.textContent = elements.spacingX.value + 'px';
    }
    if (values.spacingYValue && elements.spacingY) {
        values.spacingYValue.textContent = elements.spacingY.value + 'px';
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
    
    // Actualizar valores de overlay
    if (values.overlayCountXValue && elements.overlayCountX) {
        values.overlayCountXValue.textContent = elements.overlayCountX.value;
    }
    if (values.overlayCountYValue && elements.overlayCountY) {
        values.overlayCountYValue.textContent = elements.overlayCountY.value;
    }
    if (values.overlayOffsetXValue && elements.overlayOffsetX) {
        values.overlayOffsetXValue.textContent = elements.overlayOffsetX.value + 'px';
    }
    if (values.overlayOffsetYValue && elements.overlayOffsetY) {
        values.overlayOffsetYValue.textContent = elements.overlayOffsetY.value + 'px';
    }
    if (values.overlaySizeValue && elements.overlaySize) {
        values.overlaySizeValue.textContent = elements.overlaySize.value + 'px';
    }
    if (values.overlaySpacingXValue && elements.overlaySpacingX) {
        values.overlaySpacingXValue.textContent = elements.overlaySpacingX.value + 'px';
    }
    if (values.overlaySpacingYValue && elements.overlaySpacingY) {
        values.overlaySpacingYValue.textContent = elements.overlaySpacingY.value + 'px';
    }
    if (values.overlayRowOffsetXValue && elements.overlayRowOffsetX) {
        values.overlayRowOffsetXValue.textContent = elements.overlayRowOffsetX.value + 'px';
    }
    if (values.overlayRowOffsetYValue && elements.overlayRowOffsetY) {
        values.overlayRowOffsetYValue.textContent = elements.overlayRowOffsetY.value + 'px';
    }
    if (values.overlayColOffsetXValue && elements.overlayColOffsetX) {
        values.overlayColOffsetXValue.textContent = elements.overlayColOffsetX.value + 'px';
    }
    if (values.overlayColOffsetYValue && elements.overlayColOffsetY) {
        values.overlayColOffsetYValue.textContent = elements.overlayColOffsetY.value + 'px';
    }
    if (values.overlayAlternateRowXValue && elements.overlayAlternateRowX) {
        values.overlayAlternateRowXValue.textContent = elements.overlayAlternateRowX.value + 'px';
    }
    if (values.overlayAlternateRowYValue && elements.overlayAlternateRowY) {
        values.overlayAlternateRowYValue.textContent = elements.overlayAlternateRowY.value + 'px';
    }
    if (values.overlayAlternateColXValue && elements.overlayAlternateColX) {
        values.overlayAlternateColXValue.textContent = elements.overlayAlternateColX.value + 'px';
    }
    if (values.overlayAlternateColYValue && elements.overlayAlternateColY) {
        values.overlayAlternateColYValue.textContent = elements.overlayAlternateColY.value + 'px';
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

// Configurar botones de selección de imagen
function setupImageSelectionButtons() {
    const imageButtons = document.querySelectorAll('.image-btn');
    imageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const imageType = btn.dataset.image;
            selectImage(imageType);
        });
    });
    
    // Configurar botones específicos de overlay
    const overlayImageButtons = document.querySelectorAll('.overlay-image-btn');
    overlayImageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const imageType = btn.dataset.image;
            
            // Remover clase selected de todos los botones overlay
            overlayImageButtons.forEach(b => b.classList.remove('selected'));
            // Agregar clase selected al botón clickeado
            btn.classList.add('selected');
            
            // Seleccionar imagen para overlay
            selectImage(imageType);
        });
    });
    
    // Inicializar selección por defecto
    updateImageSelection();
}

// ==============================
// MANEJO DE TECLAS
// ==============================

function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        // Teclas "1", "2", "3" - Selección de imagen
        if (e.key === '1') {
            e.preventDefault();
            selectImage('red');
        } else if (e.key === '2') {
            e.preventDefault();
            selectImage('pink');
        } else if (e.key === '3') {
            e.preventDefault();
            selectImage('blue');
        }
        // Tecla "9" - Procesar desde /captura con la imagen seleccionada
        else if (e.key === '9') {
            e.preventDefault();
            console.log('🎨 Tecla "9" presionada - Proceso AUTOMÁTICO (scan → detectar → guardar → aplicar)');
            if (window.processImageFromCaptura) {
                window.processImageFromCaptura();
            } else if (window.autoProcessAndApply) {
                window.autoProcessAndApply();
            } else {
                console.warn('Funciones de proceso automático no disponibles');
            }
        }
    // Tecla rápida para cambiar a fuente procesada
    else if (e.key === 'p' || e.key === 'P') { setPatternSource('processed'); }
    });
}

// Función para seleccionar imagen
function selectImage(imageType) {
    selectedImage = imageType;
    window.selectedImage = selectedImage;
    console.log(`🖼️ Imagen seleccionada: ${imageType}.png`);
    
    // Actualizar UI
    updateImageSelection();
    
    // Enviar selección al servidor
    if (socket && socket.connected) {
        socket.emit('selectImage', { image: imageType });
    }
    
    // Mostrar feedback visual
    const status = document.getElementById('connectionStatus');
    if (status) {
        const originalText = status.textContent;
        status.textContent = `🖼️ Imagen seleccionada: ${imageType}.png`;
        status.style.background = '#28a745';
        
        setTimeout(() => {
            status.textContent = originalText;
            status.style.background = '';
        }, 1500);
    }
}

// Actualizar la visualización de la imagen seleccionada
function updateImageSelection() {
    // Actualizar el nombre de la imagen
    const selectedImageName = document.getElementById('selectedImageName');
    if (selectedImageName) {
        selectedImageName.textContent = `${selectedImage}.png`;
    }
    
    // Actualizar botones
    const imageButtons = document.querySelectorAll('.image-btn');
    imageButtons.forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.image === selectedImage) {
            btn.classList.add('selected');
        }
    });
}

// ==============================
// SELECCIÓN DE FUENTE DE PATRÓN
// ==============================

function setupPatternSourceButtons() {
    const btns = document.querySelectorAll('.pattern-source-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => setPatternSource(btn.dataset.source));
    });
    // Inicial según estado global si existe
    updatePatternSourceUI(window.initialPatternSource || 'processed');
}

function setPatternSource(source) {
    // Solo permitir "processed"
    if (source !== 'processed') return;
    if (socket && socket.connected) socket.emit('setPatternSource', { source });
    updatePatternSourceUI(source);
    const patThumb = document.getElementById('patternPreviewThumb');
    if (patThumb) patThumb.src = resolvePatternPreviewSrc(source);
}

function updatePatternSourceUI(source) {
    const btns = document.querySelectorAll('.pattern-source-btn');
    btns.forEach(b => {
        b.classList.toggle('selected', b.dataset.source === source);
    });
}

function resolvePatternPreviewSrc(source) {
    // Solo manejar "processed"
    return `/processed/processed.png?t=${Date.now()}`;
}

// ==============================
// FUNCIONES UTILITARIAS
// ==============================

// Exponer funciones necesarias globalmente
window.openScreen = openScreen;
window.openAllScreens = openAllScreens;
window.openBrushReveal = openBrushReveal;

// ==============================
// ==============================
// CONTROLES DE OFFSET MANUAL
// ==============================

function setupOffsetControls() {
    // Configurar controles para cada pantalla
    for (let i = 1; i <= 9; i++) {
        const offsetSlider = document.getElementById(`offset${i}`);
        const offsetValue = document.getElementById(`offset${i}Value`);
        
        if (offsetSlider && offsetValue) {
            // Actualizar display al cambiar
            offsetSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                offsetValue.textContent = `${value}px`;
                
                // Enviar actualización al servidor
                updateScreenOffset(i, value);
            });
            
            // Inicializar display
            offsetValue.textContent = `${offsetSlider.value}px`;
        }
    }
}

function updateScreenOffset(screenId, offsetX) {
    if (socket) {
        socket.emit('updateScreenConfig', {
            screenId: screenId,
            config: { offsetX: offsetX }
        });
        console.log(`Offset actualizado - Pantalla ${screenId}: ${offsetX}px`);
    }
}

function zeroAllOffsets() {
    for (let i = 1; i <= 9; i++) {
        const offsetSlider = document.getElementById(`offset${i}`);
        const offsetValue = document.getElementById(`offset${i}Value`);
        
        if (offsetSlider && offsetValue) {
            offsetSlider.value = 0;
            offsetValue.textContent = '0px';
            updateScreenOffset(i, 0);
        }
    }
    
    console.log('Todos los offsets puestos en 0');
}

// Hacer funciones accesibles globalmente para los botones
window.zeroAllOffsets = zeroAllOffsets;

// ==============================
// BRUSH REVEAL FUNCTIONS
// ==============================

function initializeBrushRevealControls() {
    console.log('🎨 Inicializando controles de Brush Reveal...');
    
    // Configurar sliders de offset para brush-reveal
    for (let i = 1; i <= 9; i++) {
        const offsetSlider = document.getElementById(`brushOffset${i}X`);
        const offsetValue = document.getElementById(`brushOffset${i}XValue`);
        
        if (offsetSlider && offsetValue) {
            offsetSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                offsetValue.textContent = `${value}px`;
                
                // Enviar actualización al servidor
                updateBrushRevealOffset(i, value, 0); // Y siempre es 0 por ahora
            });
            
            // Inicializar display
            offsetValue.textContent = `${offsetSlider.value}px`;
        }
    }
}

function updateBrushRevealOffset(brushId, offsetX, offsetY) {
    if (socket) {
        const config = { offsetX: offsetX, offsetY: offsetY };
        
        fetch(`/api/brush-reveal/${brushId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log(`🎨 Brush Reveal ${brushId} offset actualizado - X: ${offsetX}, Y: ${offsetY}`);
            } else {
                console.error(`❌ Error actualizando Brush Reveal ${brushId}:`, data.error);
            }
        })
        .catch(error => {
            console.error(`❌ Error enviando actualización a Brush Reveal ${brushId}:`, error);
        });
    }
}

function openAllBrushReveals() {
    console.log('🎨 Abriendo todos los Brush Reveals...');
    
    for (let i = 1; i <= 9; i++) {
        const url = `/brush-reveal/${i}`;
        window.open(url, `brush-reveal-${i}`, 'width=1920,height=1080');
        console.log(`🎨 Abriendo Brush Reveal ${i}: ${url}`);
    }
}

function resetBrushOffsets() {
    console.log('↺ Reseteando todos los offsets de Brush Reveal...');
    
    // Valores por defecto: repetir el patrón de 3 secciones
    const defaultOffsets = [0, 2160, 4320]; // Para las 3 secciones del wallpaper
    
    for (let i = 1; i <= 9; i++) {
        const offsetSlider = document.getElementById(`brushOffset${i}X`);
        const offsetValue = document.getElementById(`brushOffset${i}XValue`);
        
        // Calcular offset por defecto (rotar entre las 3 secciones)
        const defaultOffset = defaultOffsets[(i - 1) % 3];
        
        if (offsetSlider && offsetValue) {
            offsetSlider.value = defaultOffset;
            offsetValue.textContent = `${defaultOffset}px`;
            updateBrushRevealOffset(i, defaultOffset, 0);
        }
    }
}

// Hacer funciones accesibles globalmente para los botones
window.openAllBrushReveals = openAllBrushReveals;
window.resetBrushOffsets = resetBrushOffsets;

// ==============================
// INICIALIZACIÓN AUTOMÁTICA
// ==============================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeControlPanel();
        initializeBrushRevealControls();
    });
} else {
    initializeControlPanel();
    initializeBrushRevealControls();
}
