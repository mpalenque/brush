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
// Exponer selección inicial globalmente para otros scripts
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
    overlayAlternateColY: null,
    // Controles UDP/TCP
    udpEnabledSwitch: null,
    tcpEnabledSwitch: null,
    preferredProtocolSelect: null,
    udpStatusBadge: null,
    tcpStatusBadge: null,
    udpIndicator: null,
    tcpIndicator: null,
    udpStatusText: null,
    tcpStatusText: null,
    protocolLog: null,
    clearProtocolLog: null,
    testUdpConnection: null,
    testTcpConnection: null
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
    
    // Configurar auto-rotación
    setupAutoRotationControl();
    
    // Configurar monitoreo de actividad
    setupActivityMonitoring();
    
    // Generar UI
    generateScreenControls();
    updateUI();

    // Configurar botones de salto manual de secuencia de color
    setupManualColorJumpButtons();
    
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

    // Elementos UDP/TCP
    elements.udpEnabledSwitch = document.getElementById('udpEnabledSwitch');
    elements.tcpEnabledSwitch = document.getElementById('tcpEnabledSwitch');
    elements.preferredProtocolSelect = document.getElementById('preferredProtocolSelect');
    elements.udpStatusBadge = document.getElementById('udpStatusBadge');
    elements.tcpStatusBadge = document.getElementById('tcpStatusBadge');
    elements.udpIndicator = document.getElementById('udpIndicator');
    elements.tcpIndicator = document.getElementById('tcpIndicator');
    elements.udpStatusText = document.getElementById('udpStatusText');
    elements.tcpStatusText = document.getElementById('tcpStatusText');
    elements.protocolLog = document.getElementById('protocolLog');
    elements.clearProtocolLog = document.getElementById('clearProtocolLog');
    elements.testUdpConnection = document.getElementById('testUdpConnection');
    elements.testTcpConnection = document.getElementById('testTcpConnection');

    // Elementos de coloreado automático
    elements.startColorSequenceBtn = document.getElementById('startColorSequenceBtn');
    elements.stopColorSequenceBtn = document.getElementById('stopColorSequenceBtn');
    elements.nextColorBtn = document.getElementById('nextColorBtn');
    elements.resetColorBtn = document.getElementById('resetColorBtn');
    elements.switchModeBtn = document.getElementById('switchModeBtn');
    elements.colorSequenceStatus = document.getElementById('colorSequenceStatus');
    // Botón de pausa de secuencia de color
    elements.pauseColorSequenceBtn = document.getElementById('btnPauseColorSequence');

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
    
    // Exponer socket globalmente
    window.socket = socket;
    
    // Eventos de conexión
    socket.on('connect', () => {
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '✅ Conectado al servidor';
            elements.connectionStatus.className = 'connection-status connected';
        }
        socket.emit('registerScreen', { screenId: 0, type: 'control' });
        console.log('🔌 Control panel conectado al servidor');
        
        // Inicializar estado de protocolos
        setTimeout(() => {
            initializeProtocolState();
        }, 500);
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

        // Cargar estado de servidores si existe
        if (state.serverState) {
            setTimeout(() => {
                updateServerStateFromInitial(state.serverState);
            }, 200);
        }

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

    // NUEVO: Eventos del gestor robusto de sincronización de imágenes
    socket.on('screenCaptureComplete', (data) => {
        console.log('📱 *** CONTROL *** Captura de pantalla completada:', data);
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '📱 Pantalla capturada correctamente';
            elements.connectionStatus.style.background = '#17a2b8';
        }
    });
    
    socket.on('wallpaperSaved', (data) => {
        console.log('🖼️ *** CONTROL *** Wallpaper guardado:', data);
        if (elements.connectionStatus && data.success) {
            elements.connectionStatus.textContent = `🖼️ Wallpaper guardado: ${data.filename}`;
            elements.connectionStatus.style.background = '#28a745';
            
            // Volver al estado normal después de un momento
            setTimeout(() => {
                if (elements.connectionStatus) {
                    elements.connectionStatus.textContent = '✅ Conectado al servidor';
                    elements.connectionStatus.style.background = '';
                }
            }, 3000);
        }
    });
    
    socket.on('imageValidationResult', (data) => {
        console.log('🔍 *** CONTROL *** Resultado de validación:', data);
        if (!data.valid) {
            console.warn('⚠️ Imagen no válida en pantalla', data.screenId);
        }
    });

    // NUEVO: Eventos específicos del sistema UDP
    socket.on('waitingForImageCapture', (data) => {
        console.log('📡 *** CONTROL *** Esperando captura UDP:', data);
        if (typeof udpMonitor !== 'undefined') {
            udpMonitor.setStatus('processing', '📡 Esperando mensaje "save" por UDP...');
            udpMonitor.addLog('📡 Servidor esperando confirmación UDP puerto 5555', 'message');
        }
    });
    
    socket.on('imageProcessingTimeout', (data) => {
        console.log('⏰ *** CONTROL *** Timeout UDP:', data);
        if (typeof udpMonitor !== 'undefined') {
            udpMonitor.setStatus('error', '⏰ Timeout esperando confirmación UDP');
            udpMonitor.addLog('❌ Timeout: No se recibió mensaje "save" en 30s', 'timeout');
        }
    });
    
    // Actualizar monitor UDP cuando se recibe confirmación de imagen procesada
    const originalProcessedImageHandler = () => {
        if (typeof udpMonitor !== 'undefined') {
            udpMonitor.setStatus('ready', '✅ Mensaje "save" recibido por UDP');
            udpMonitor.addLog('✅ Confirmación UDP recibida - continuando secuencia', 'save');
        }
    };
    
    // Agregar handler específico para UDP
    socket.on('processedImageReady', (data) => {
        console.log('📸 *** CONTROL *** Imagen procesada lista:', data);
        if (elements.connectionStatus) {
            elements.connectionStatus.textContent = '📸 Imagen procesada y lista';
            elements.connectionStatus.style.background = '#28a745';
        }
        
        // Si viene de UDP, actualizar monitor
        if (data.source === 'camera-udp') {
            originalProcessedImageHandler();
        }
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

    // Listeners para eventos de protocolos UDP/TCP
    socket.on('serverStateUpdate', (state) => {
        console.log('🔧 Estado de servidores actualizado:', state);
        
        // Actualizar switches
        if (elements.udpEnabledSwitch) {
            elements.udpEnabledSwitch.checked = state.udpEnabled;
        }
        if (elements.tcpEnabledSwitch) {
            elements.tcpEnabledSwitch.checked = state.tcpEnabled;
        }
        if (elements.preferredProtocolSelect) {
            elements.preferredProtocolSelect.value = state.preferredProtocol;
        }
        
        // Actualizar UI
        updateProtocolStatus('udp', state.udpEnabled);
        updateProtocolStatus('tcp', state.tcpEnabled);
        
        logProtocolMessage('SYSTEM', `Estado actualizado - UDP: ${state.udpEnabled ? 'ACTIVO' : 'INACTIVO'}, TCP: ${state.tcpEnabled ? 'ACTIVO' : 'INACTIVO'}, Preferido: ${state.preferredProtocol}`, 'info');
    });

    // Listener específico para mensajes de imagen procesada con información de protocolo
    socket.on('processedImageReady', (data) => {
        if (data.protocol) {
            logProtocolMessage(data.protocol, `Confirmación de imagen guardada recibida`, 'success');
            
            // Actualizar indicador del protocolo que recibió el mensaje
            const indicator = elements[`${data.protocol.toLowerCase()}Indicator`];
            if (indicator) {
                indicator.textContent = '✅';
                setTimeout(() => {
                    indicator.textContent = '🟢';
                }, 2000);
            }
        }
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
    if (elements.backgroundColor) elements.backgroundColor.value = config.backgroundColor || '#FABCAF';
    
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
        'rotation', 'zoom'
    ];

    const overlayControls = [
        'overlayCountX', 'overlayCountY', 'overlayOffsetX', 'overlayOffsetY', 
        'overlaySize', 'overlaySpacingX', 'overlaySpacingY',
        'overlayRowOffsetX', 'overlayRowOffsetY', 'overlayColOffsetX', 'overlayColOffsetY',
        'overlayAlternateRowX', 'overlayAlternateRowY', 'overlayAlternateColX', 'overlayAlternateColY'
    ];

    // Controles especiales que afectan las imágenes superpuestas con factor de escala
    const imageScaleControls = ['perfumeSpacingH', 'perfumeSpacingV', 'perfumeSizeFactor'];

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

    // Configurar controles de escala de imágenes (antiguos "perfume")
    imageScaleControls.forEach(controlName => {
        const element = elements[controlName];
        if (element) {
            element.addEventListener('input', (e) => {
                // Obtener configuración actual de overlay
                const currentOverlayConfig = {
                    countX: parseInt(elements.overlayCountX?.value) || 10,
                    countY: parseInt(elements.overlayCountY?.value) || 8,
                    offsetX: parseInt(elements.overlayOffsetX?.value) || -550,
                    offsetY: parseInt(elements.overlayOffsetY?.value) || -150,
                    size: parseInt(elements.overlaySize?.value) || 192,
                    spacingX: parseInt(elements.overlaySpacingX?.value) || 400,
                    spacingY: parseInt(elements.overlaySpacingY?.value) || 250,
                    rowOffsetX: parseInt(elements.overlayRowOffsetX?.value) || 60,
                    rowOffsetY: parseInt(elements.overlayRowOffsetY?.value) || 0,
                    colOffsetX: parseInt(elements.overlayColOffsetX?.value) || 0,
                    colOffsetY: parseInt(elements.overlayColOffsetY?.value) || 0,
                    alternateRowX: parseInt(elements.overlayAlternateRowX?.value) || 140,
                    alternateRowY: parseInt(elements.overlayAlternateRowY?.value) || 0,
                    alternateColX: parseInt(elements.overlayAlternateColX?.value) || 0,
                    alternateColY: parseInt(elements.overlayAlternateColY?.value) || 0
                };

                // Aplicar factores de escala según el control
                const factor = parseFloat(e.target.value);
                if (controlName === 'perfumeSpacingH') {
                    // Escalar espaciado horizontal
                    currentOverlayConfig.spacingX = Math.round(currentOverlayConfig.spacingX * factor);
                } else if (controlName === 'perfumeSpacingV') {
                    // Escalar espaciado vertical
                    currentOverlayConfig.spacingY = Math.round(currentOverlayConfig.spacingY * factor);
                } else if (controlName === 'perfumeSizeFactor') {
                    // Escalar tamaño de imágenes
                    currentOverlayConfig.size = Math.round(currentOverlayConfig.size * factor);
                }

                const config = { 
                    overlayImages: currentOverlayConfig,
                    [controlName]: factor // Mantener también el valor original para la UI
                };
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
    
    // Event listeners para controles de coloreado automático
    setupColorSequenceEventListeners();

    // Botón Pausar secuencia de coloreado
    if (elements.pauseColorSequenceBtn) {
        elements.pauseColorSequenceBtn.addEventListener('click', () => {
            try {
                const btn = elements.pauseColorSequenceBtn;
                const isPaused = btn.dataset.state === 'paused';
                const status = document.getElementById('connectionStatus');
                const prevBg = status ? status.style.background : '';
                const prevText = status ? status.textContent : '';
                if (!isPaused) {
                    // Pausar
                    stopColorSequence();
                    if (status) {
                        const last = (window.lastColorStepInfo?.pattern) || '—';
                        status.textContent = `⏸️ Secuencia pausada (manteniendo ${last})`;
                        status.style.background = '#6c757d';
                        setTimeout(() => { status.textContent = prevText; status.style.background = prevBg; }, 1500);
                    }
                    updateColorSequenceStatus('⏸️ Secuencia detenida (se mantiene último color)');
                    btn.textContent = '▶️ Reanudar';
                    btn.style.background = '#28a745';
                    btn.dataset.state = 'paused';
                } else {
                    // Reanudar
                    startColorSequence();
                    if (status) {
                        status.textContent = `▶️ Reanudando secuencia`;
                        status.style.background = '#28a745';
                        setTimeout(() => { status.textContent = prevText; status.style.background = prevBg; }, 1200);
                    }
                    updateColorSequenceStatus('🔄 Secuencia activa - Coloreando automáticamente...');
                    btn.textContent = '⏸️ Pausar';
                    btn.style.background = '#6c757d';
                    btn.dataset.state = '';
                }
            } catch (e) {
                console.error('Error en toggle pausa/reanudar:', e);
            }
        });
    }
    
    // Event listeners para controles UDP/TCP
    setupProtocolEventListeners();
    
    // Configurar controles de rango con actualización en tiempo real
    setupRangeControls();
}

function setupRangeControls() {
    // Configurar controles de rango para el sistema
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
        // Tecla "1" - Iniciar secuencia de brush reveal (antes era 'a')
        if (e.key === '1') {
            e.preventDefault();
            console.log('🎯 Tecla "1" presionada - Iniciando secuencia de brush reveal');
            startBrushRevealSequence();
        }
        // Teclas "z", "a", "q" - Selección de imagen (antes era 1, 2, 3)
        else if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            // Invertido: antes 'z' -> red, ahora 'z' -> pink
            selectImage('pink');
        } else if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            selectImage('blue');
            const status = document.getElementById('connectionStatus');
            if (status) {
                status.textContent = '🔵 Imagen cambiada a: blue.png (sin capturar wallpaper)';
                status.style.background = '#d1ecf1';
                setTimeout(() => { status.textContent = '✅ Conectado al servidor'; status.style.background = ''; }, 1500);
            }
        } else if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            // Invertido: antes 'q' -> pink, ahora 'q' -> red
            selectImage('red');
        }
        // Teclas "9" y "p" - Deshabilitadas (no hacen nada)
        else if (e.key === '9') {
            e.preventDefault();
            console.log('⛔ Tecla "9" deshabilitada');
        }
        else if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            console.log('⛔ Tecla "p" deshabilitada');
        }
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
// BRUSH REVEAL SEQUENCE FUNCTIONS
// ==============================

// Variables globales para la auto-rotación
// Variables para auto-rotación y actividad
let autoRotationEnabled = false;
let inactivityTimer = null;
let lastActivityTime = Date.now();
// Legacy compatibility: some inline scripts may reference rotationInterval; ensure it exists
window.rotationInterval = window.rotationInterval || null;

// Función para iniciar la secuencia de brush reveal (tecla "1") con sistema robusto
function startBrushRevealSequence() {
    console.log('🎯 INICIANDO SECUENCIA BRUSH REVEAL CON SISTEMA UDP');
    
    if (socket && socket.connected) {
        // Actualizar monitor UDP
        if (typeof udpMonitor !== 'undefined') {
            udpMonitor.setStatus('processing', '📸 Iniciando captura de imagen...');
        }
        
        // El servidor ahora manejará toda la secuencia esperando confirmación UDP
        socket.emit('startBrushRevealSequence');
    }
    
    // Mostrar feedback visual mejorado
    const status = document.getElementById('connectionStatus');
    if (status) {
        const originalText = status.textContent;
        status.textContent = '🎯 Esperando confirmación UDP en puerto 5555...';
        status.style.background = '#17a2b8';
        
        setTimeout(() => {
            status.textContent = originalText;
            status.style.background = '';
        }, 15000);
    }
    
    // Registrar actividad
    registerActivity();
}

// Exponer para scripts inline (control.html) que disparan la secuencia
window.startBrushRevealSequence = startBrushRevealSequence;

// ========================================
// UDP MONITOR SYSTEM
// Sistema de monitoreo UDP para mensajes de cámara
// ========================================

const udpMonitor = {
    status: 'waiting', // waiting, processing, ready, error
    logEntries: [],
    maxLogEntries: 50,
    
    // Elementos DOM
    elements: {
        status: null,
        indicator: null,
        statusText: null,
        log: null,
        clearBtn: null,
        testBtn: null
    },
    
    init() {
        this.elements.status = document.getElementById('udpStatus');
        this.elements.indicator = document.getElementById('udpIndicator');
        this.elements.statusText = document.getElementById('udpStatusText');
        this.elements.log = document.getElementById('udpLog');
        this.elements.clearBtn = document.getElementById('clearUdpLog');
        this.elements.testBtn = document.getElementById('testUdpConnection');
        
        // Event listeners
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', () => this.clearLog());
        }
        
        if (this.elements.testBtn) {
            this.elements.testBtn.addEventListener('click', () => this.testConnection());
        }
        
        this.updateUI();
        this.addLog('🚀 Monitor UDP iniciado');
    },
    
    setStatus(newStatus, message = '') {
        this.status = newStatus;
        this.updateUI();
        if (message) {
            this.addLog(message, newStatus);
        }
    },
    
    updateUI() {
        if (!this.elements.indicator || !this.elements.statusText) return;
        
        // Actualizar indicador
        this.elements.indicator.className = `status-indicator ${this.status}`;
        
        // Actualizar iconos y texto según estado
        const statusConfig = {
            waiting: { icon: '⚪', text: 'Esperando mensajes UDP...', class: 'waiting' },
            processing: { icon: '🔵', text: 'Procesando imagen...', class: 'processing' },
            ready: { icon: '🟢', text: 'Imagen lista y procesada', class: 'ready' },
            error: { icon: '🔴', text: 'Error en comunicación UDP', class: 'error' }
        };
        
        const config = statusConfig[this.status] || statusConfig.waiting;
        this.elements.indicator.textContent = config.icon;
        this.elements.statusText.textContent = config.text;
        this.elements.indicator.className = `status-indicator ${config.class}`;
    },
    
    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = {
            timestamp,
            message,
            type
        };
        
        this.logEntries.unshift(entry);
        
        // Limitar número de entradas
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries = this.logEntries.slice(0, this.maxLogEntries);
        }
        
        this.updateLog();
    },
    
    updateLog() {
        if (!this.elements.log) return;
        
        const logHTML = this.logEntries.map(entry => {
            const typeClass = entry.type !== 'info' ? ` ${entry.type}` : '';
            return `<div class="log-entry${typeClass}">[${entry.timestamp}] ${entry.message}</div>`;
        }).join('');
        
        this.elements.log.innerHTML = logHTML;
    },
    
    clearLog() {
        this.logEntries = [];
        this.updateLog();
        this.addLog('🗑️ Log limpiado');
    },
    
    testConnection() {
        this.addLog('🔍 Probando conexión UDP...', 'message');
        setTimeout(() => {
            this.addLog('✅ Monitor UDP funcionando correctamente', 'message');
        }, 500);
    }
};

// El monitor UDP se inicializa en la sección principal de inicialización arriba

// ==============================
// COLOR SEQUENCE CONTROL FUNCTIONS
// ==============================

function setupColorSequenceEventListeners() {
    // Ocultar/ignorar botones: rotación es automática por defecto
    if (elements.startColorSequenceBtn) elements.startColorSequenceBtn.style.display = 'none';
    if (elements.stopColorSequenceBtn) elements.stopColorSequenceBtn.style.display = 'none';
    if (elements.nextColorBtn) elements.nextColorBtn.style.display = 'none';
    if (elements.resetColorBtn) elements.resetColorBtn.style.display = 'none';
    if (elements.switchModeBtn) elements.switchModeBtn.style.display = 'none';
}

function startColorSequence() {
    if (socket && socket.connected) {
        socket.emit('startAutoColorSequence');
        updateColorSequenceStatus('🔄 Secuencia activa - Coloreando automáticamente...');
    } else {
        console.error('❌ No hay conexión WebSocket para iniciar coloreado');
        updateColorSequenceStatus('❌ Error: Sin conexión al servidor');
    }
}

function stopColorSequence() {
    if (socket && socket.connected) {
        socket.emit('stopAutoColorSequence');
        updateColorSequenceStatus('⏸️ Secuencia detenida');
    } else {
        console.error('❌ No hay conexión WebSocket para detener coloreado');
    }
}

function nextColorStep() {
    if (socket && socket.connected) {
        socket.emit('nextColorStep');
        updateColorSequenceStatus('⏭️ Avanzando al siguiente color...');
    } else {
        console.error('❌ No hay conexión WebSocket para siguiente color');
    }
}

function resetToYellow() {
    if (socket && socket.connected) {
        socket.emit('resetColorSequence');
        updateColorSequenceStatus('🔄 Reseteando a fondo amarillo...');
    } else {
        console.error('❌ No hay conexión WebSocket para reset');
    }
}

function updateColorSequenceStatus(message) {
    if (elements.colorSequenceStatus) {
        elements.colorSequenceStatus.textContent = message;
        elements.colorSequenceStatus.style.fontWeight = 'bold';
        
        // Actualizar color según el estado
        if (message.includes('activa')) {
            elements.colorSequenceStatus.style.color = '#28a745'; // Verde
        } else if (message.includes('detenida') || message.includes('Error')) {
            elements.colorSequenceStatus.style.color = '#dc3545'; // Rojo
        } else if (message.includes('Reset') || message.includes('amarillo')) {
            elements.colorSequenceStatus.style.color = '#ffc107'; // Amarillo
        } else {
            elements.colorSequenceStatus.style.color = '#17a2b8'; // Azul
        }
    }
}

function switchColoringMode() {
    const currentMode = elements.switchModeBtn.dataset.mode;
    
    if (currentMode === 'sequence') {
        // Cambiar a modo wallpaper
        console.log('🔀 *** CONTROL *** Cambiando a modo Wallpaper');
        
        if (socket && socket.connected) {
            socket.emit('switchToWallpaperMode');
            elements.switchModeBtn.dataset.mode = 'wallpaper';
            elements.switchModeBtn.innerHTML = '🔀 SWITCH a Secuencia';
            elements.switchModeBtn.style.background = '#28a745';
            updateColorSequenceStatus('🖼️ Modo: Wallpaper (coloreando con wallpaper.jpg)');
        }
    } else {
        // Cambiar a modo secuencia
        console.log('🔀 *** CONTROL *** Cambiando a modo Secuencia');
        
        if (socket && socket.connected) {
            socket.emit('switchToSequenceMode');
            elements.switchModeBtn.dataset.mode = 'sequence';
            elements.switchModeBtn.innerHTML = '🔀 SWITCH a Wallpaper';
            elements.switchModeBtn.style.background = '#6f42c1';
            updateColorSequenceStatus('🟡 Modo: Secuencia (rojo→azul→amarillo)');
        }
    }
}

// Auto-rotación de imágenes cada 2 minutos con amarillo, azul, rojo
function toggleAutoRotation() {
    // Forzado: rotación siempre activa y local a cada brush-reveal; no emitir nada
    const btn = document.getElementById('autoRotationBtn');
    const status = document.getElementById('rotationStatus');
    if (btn) btn.style.display = 'none';
    if (status) status.textContent = 'Rotación automática por defecto (control UI oculto)';
}

// Exponer para posibles llamadas externas sin duplicar lógica
window.toggleAutoRotation = toggleAutoRotation;

// Registrar actividad para monitores
function registerActivity() {
    lastActivityTime = Date.now();
    
    // Limpiar timer existente
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    
    // Configurar nuevo timer de 2 minutos
    inactivityTimer = setTimeout(() => {
        console.log('⏰ 2 minutos de inactividad - se podría activar auto-rotación');
        // Opcionalmente activar auto-rotación automáticamente
        // if (!autoRotationEnabled) {
        //     toggleAutoRotation();
        // }
    }, 120000); // 2 minutos = 120,000 ms
}

// Registrar actividad en eventos de usuario
function setupActivityMonitoring() {
    // Registrar actividad en clicks, teclas, movimientos, etc.
    document.addEventListener('click', registerActivity);
    document.addEventListener('keydown', registerActivity);
    document.addEventListener('mousemove', registerActivity);
    document.addEventListener('input', registerActivity);
    
    // Inicializar el timer de inactividad
    registerActivity();
}

// Configurar el control de auto-rotación
function setupAutoRotationControl() {
    const autoRotationBtn = document.getElementById('autoRotationBtn');
    
    if (!autoRotationBtn) {
        // UI removida: rotación automática siempre activa por defecto
        return;
    }

    // Evitar múltiples bindings si hay scripts inline
    if (!autoRotationBtn.dataset.handlerAttached) {
        autoRotationBtn.addEventListener('click', () => {
            toggleAutoRotation();
        });
        autoRotationBtn.dataset.handlerAttached = 'true';
    }
    
    console.log('🔄 Control de auto-rotación configurado');
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

// ==============================
// SALTO MANUAL DE SECUENCIA DE COLOR
// ==============================
function setupManualColorJumpButtons() {
    const btns = document.querySelectorAll('.jump-color-btn');
    if (!btns.length) return;
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const pattern = btn.dataset.pattern;
            if (socket && socket.connected) {
                socket.emit('jumpToColorPattern', { pattern });
                const status = document.getElementById('connectionStatus');
                if (status) {
                    const original = status.textContent;
                    status.textContent = `⏭️ Salto manual a ${pattern}`;
                    status.style.background = '#ffc107';
                    setTimeout(() => { status.textContent = original; status.style.background=''; }, 1500);
                }
            }
        });
    });

    // Botón especial para disparar wallpaper.jpg
    const wallpaperBtn = document.getElementById('jumpWallpaperBtn');
    if (wallpaperBtn) {
        wallpaperBtn.addEventListener('click', () => {
            if (socket && socket.connected) {
                socket.emit('forceWallpaperPattern');
                const status = document.getElementById('connectionStatus');
                if (status) {
                    const original = status.textContent;
                    status.textContent = `🖼️ Mostrando wallpaper.jpg en todas las pantallas`;
                    status.style.background = '#222';
                    setTimeout(() => { status.textContent = original; status.style.background=''; }, 1500);
                }
            }
        });
    }
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
        udpMonitor.init(); // Inicializar monitor UDP
        initColorSequenceMonitor(); // Inicializar monitor de secuencia de color
    });
} else {
    initializeControlPanel();
    initializeBrushRevealControls();
    udpMonitor.init(); // Inicializar monitor UDP
    initColorSequenceMonitor(); // Inicializar monitor de secuencia de color
}

// ==============================
// MONITOR SECUENCIA DE COLOR + RESYNC
// ==============================

let lastColorStepInfo = null;
let colorMonitorInitialized = false;

function initColorSequenceMonitor() {
    if (colorMonitorInitialized) return;
    colorMonitorInitialized = true;
    const btn = document.getElementById('btnColorResync');
    if (btn) {
        btn.addEventListener('click', () => {
            if (socket && socket.connected) {
                console.log('🔁 Solicitud manual de re-sync de color');
                socket.emit('requestColorResync');
                btn.disabled = true;
                btn.textContent = '🔄 Resync enviado...';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = '🔄 Forzar Re-Sync';
                }, 3000);
            }
        });
    }
    // Valores iniciales placeholder
    const patEl = document.getElementById('currentColorPattern');
    const idxEl = document.getElementById('currentColorIndex');
    if (patEl) patEl.textContent = '—';
    if (idxEl) idxEl.textContent = '—';

    // Si en 6s no recibimos actualización, intentar pedir resync automático una vez
    setTimeout(() => {
        if (!lastColorStepInfo && socket && socket.connected) {
            console.log('⏳ No se recibió colorStepUpdate inicial, solicitando re-sync automático');
            socket.emit('requestColorResync');
        }
    }, 6000);
}

function patternBadgeColor(pattern) {
    switch(pattern) {
        case 'amarillo.jpg': return '#FFD400';
        case 'rojo.jpg': return '#FF4B4B';
        case 'azul.jpg': return '#2196F3';
        case 'logo1.jpg': return '#8E44AD';
        case 'logo2.jpg': return '#16A085';
        default: return '#555';
    }
}

function updateColorSequenceMonitor(step) {
    lastColorStepInfo = step;
    const patEl = document.getElementById('currentColorPattern');
    const idxEl = document.getElementById('currentColorIndex');
    if (!patEl || !idxEl) return;
    patEl.textContent = step.pattern;
    idxEl.textContent = `${(step.index ?? 0) + 1}`;
    patEl.style.background = patternBadgeColor(step.pattern);
    patEl.style.color = '#111';
    patEl.style.padding = '2px 6px';
    patEl.style.borderRadius = '4px';
}

// Hook al WebSocket existente: insertar listener sin modificar lógica previa
(function attachColorSequenceSocketListener(){
    // Poll hasta que el socket esté listo
    const iv = setInterval(() => {
        if (typeof socket !== 'undefined' && socket && socket.on) {
            clearInterval(iv);
            socket.on('colorStepUpdate', (data) => {
                console.log('🎨 colorStepUpdate recibido (control):', data);
                updateColorSequenceMonitor(data);
            });
        }
    }, 300);
})();

// ==============================
// CONTROL DE PROTOCOLOS UDP/TCP
// ==============================

function setupProtocolEventListeners() {
    // Switch UDP
    if (elements.udpEnabledSwitch) {
        elements.udpEnabledSwitch.addEventListener('change', (e) => {
            updateServerState({
                udpEnabled: e.target.checked
            });
        });
    }

    // Switch TCP
    if (elements.tcpEnabledSwitch) {
        elements.tcpEnabledSwitch.addEventListener('change', (e) => {
            updateServerState({
                tcpEnabled: e.target.checked
            });
        });
    }

    // Select protocolo preferido
    if (elements.preferredProtocolSelect) {
        elements.preferredProtocolSelect.addEventListener('change', (e) => {
            updateServerState({
                preferredProtocol: e.target.value
            });
        });
    }

    // Botón limpiar log
    if (elements.clearProtocolLog) {
        elements.clearProtocolLog.addEventListener('click', () => {
            if (elements.protocolLog) {
                elements.protocolLog.innerHTML = '<div class="log-entry">🧹 Log limpiado</div>';
            }
        });
    }

    // Botón test UDP
    if (elements.testUdpConnection) {
        elements.testUdpConnection.addEventListener('click', () => {
            logProtocolMessage('TEST', 'Prueba de conexión UDP enviada a puerto 5555', 'info');
            // Aquí podrías agregar lógica adicional para testing
        });
    }

    // Botón test TCP
    if (elements.testTcpConnection) {
        elements.testTcpConnection.addEventListener('click', () => {
            logProtocolMessage('TEST', 'Prueba de conexión TCP enviada a puerto 6000', 'info');
            // Aquí podrías agregar lógica adicional para testing
        });
    }
}

function updateServerState(changes) {
    console.log('🔧 Actualizando estado de servidores:', changes);
    
    // Enviar al servidor via WebSocket
    if (socket) {
        socket.emit('updateServerState', changes);
    }
    
    // Actualizar UI local inmediatamente para feedback rápido
    if (changes.udpEnabled !== undefined) {
        updateProtocolStatus('udp', changes.udpEnabled);
    }
    if (changes.tcpEnabled !== undefined) {
        updateProtocolStatus('tcp', changes.tcpEnabled);
    }
}

function updateProtocolStatus(protocol, enabled) {
    const badge = elements[`${protocol}StatusBadge`];
    const indicator = elements[`${protocol}Indicator`];
    const statusText = elements[`${protocol}StatusText`];
    
    if (badge) {
        badge.textContent = enabled ? 'ACTIVO' : 'INACTIVO';
        badge.className = `status-badge ${enabled ? 'active' : 'inactive'}`;
    }
    
    if (indicator) {
        indicator.textContent = enabled ? '🟢' : '🔴';
    }
    
    if (statusText) {
        const protocolUpper = protocol.toUpperCase();
        statusText.textContent = `${protocolUpper}: ${enabled ? 'Esperando mensajes...' : 'Deshabilitado'}`;
    }
}

function logProtocolMessage(protocol, message, type = 'info') {
    if (!elements.protocolLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span style="color: #666;">[${timestamp}]</span> <span style="font-weight: 600; color: ${protocol === 'UDP' ? '#007bff' : '#28a745'};">${protocol}:</span> ${message}`;
    
    elements.protocolLog.appendChild(entry);
    elements.protocolLog.scrollTop = elements.protocolLog.scrollHeight;
    
    // Limitar el número de entradas del log
    const entries = elements.protocolLog.children;
    if (entries.length > 100) {
        elements.protocolLog.removeChild(entries[0]);
    }
}

// Inicializar estado de protocolos cuando se establezca la conexión
function initializeProtocolState() {
    // Solicitar estado actual del servidor
    if (socket) {
        fetch('/api/server-state')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const state = data.serverState;
                    
                    // Actualizar switches
                    if (elements.udpEnabledSwitch) {
                        elements.udpEnabledSwitch.checked = state.udpEnabled;
                    }
                    if (elements.tcpEnabledSwitch) {
                        elements.tcpEnabledSwitch.checked = state.tcpEnabled;
                    }
                    if (elements.preferredProtocolSelect) {
                        elements.preferredProtocolSelect.value = state.preferredProtocol;
                    }
                    
                    // Actualizar UI
                    updateProtocolStatus('udp', state.udpEnabled);
                    updateProtocolStatus('tcp', state.tcpEnabled);
                    
                    logProtocolMessage('SYSTEM', `Estado inicial cargado - UDP: ${state.udpEnabled ? 'ACTIVO' : 'INACTIVO'}, TCP: ${state.tcpEnabled ? 'ACTIVO' : 'INACTIVO'}, Preferido: ${state.preferredProtocol}`, 'info');
                }
            })
            .catch(error => {
                console.error('Error cargando estado de protocolos:', error);
                logProtocolMessage('SYSTEM', 'Error cargando estado inicial', 'error');
            });
    }
}

// Actualizar estado de protocolos desde estado inicial del servidor
function updateServerStateFromInitial(state) {
    console.log('🔧 Cargando estado inicial de servidores:', state);
    
    // Actualizar switches
    if (elements.udpEnabledSwitch) {
        elements.udpEnabledSwitch.checked = state.udpEnabled;
    }
    if (elements.tcpEnabledSwitch) {
        elements.tcpEnabledSwitch.checked = state.tcpEnabled;
    }
    if (elements.preferredProtocolSelect) {
        elements.preferredProtocolSelect.value = state.preferredProtocol;
    }
    
    // Actualizar UI
    updateProtocolStatus('udp', state.udpEnabled);
    updateProtocolStatus('tcp', state.tcpEnabled);
    
    logProtocolMessage('SYSTEM', `Estado inicial - UDP: ${state.udpEnabled ? 'ACTIVO' : 'INACTIVO'}, TCP: ${state.tcpEnabled ? 'ACTIVO' : 'INACTIVO'}, Preferido: ${state.preferredProtocol}`, 'info');
}

