const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram'); // Para UDP

// Prefer prebuilt @napi-rs/canvas on Windows; fallback to node-canvas
let createCanvas, loadImage;
try {
    const napiCanvas = require('@napi-rs/canvas');
    createCanvas = napiCanvas.createCanvas;
    loadImage = napiCanvas.loadImage;
    console.log('🖼️ Using @napi-rs/canvas');
} catch (e) {
    try {
        const nodeCanvas = require('canvas');
        createCanvas = nodeCanvas.createCanvas;
        loadImage = nodeCanvas.loadImage;
        console.log('🖼️ Using node-canvas');
    } catch (e2) {
        console.error('❌ No canvas library found. Install one of:\n  npm i @napi-rs/canvas\n  or\n  npm i canvas');
        process.exit(1);
    }
}

const app = express();
const server = http.createServer(app);

// Increase payload limits for large images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 50 * 1024 * 1024, // 50MB for large images
    pingTimeout: 60000,
    pingInterval: 25000
});

// Estado de sincronización de la secuencia de coloreado para re-emitir a clientes tardíos
let autoSeqActive = false;
let autoSeqState = null; // { timestamp, startAt, intervalTime, patterns, currentIndex }
// Handshake para reload->capture de screen/1 al presionar "1"
const pendingReloadOps = new Map(); // opId -> { screenId, timer }
// Mutex / rate-limit para broadcasts de wallpaper
let wallpaperSaveInProgress = false;
let lastWallpaperBroadcastTs = 0;
let currentWallpaperSequenceId = null;
// Control del timeout de regreso a secuencia
let sequenceReturnTimeoutId = null;

// ==============================
// PROGRAMADOR CENTRAL DE PASOS DE COLOR
// ==============================
const COLOR_DURATION_MS = 28000; // Debe coincidir con DURATION_MS del cliente
let colorStepScheduler = {
    active: false,
    paused: false,
    anchorStartAt: 0,
    periodMs: 0,
    timeoutId: null,
    nextBoundary: 0,
    // Nuevo orden solicitado: amarillo -> rojo -> azul -> logo1 -> logo2
    patterns: ['amarillo.jpg','rojo.jpg','azul.jpg','logo1.jpg','logo2.jpg'],
    currentIndex: 0,
    lastStep: null
};

function emitNextColorStep() {
    if (!colorStepScheduler.active || colorStepScheduler.paused) return;
    const pattern = colorStepScheduler.patterns[colorStepScheduler.currentIndex % colorStepScheduler.patterns.length];
    const idx = colorStepScheduler.currentIndex % colorStepScheduler.patterns.length;
    const payload = { timestamp: Date.now(), pattern, currentIndex: idx };
    colorStepScheduler.lastStep = payload;
    // Emitir a todos los brush-reveal
    connectedClients.forEach(c => {
        if (c.type === 'brush-reveal' && c.socket.connected) {
            c.socket.emit('nextColorStep', payload);
        }
        if (c.type === 'control' && c.socket.connected) {
            c.socket.emit('colorStepUpdate', payload);
        }
    });
    colorStepScheduler.currentIndex = (colorStepScheduler.currentIndex + 1) % colorStepScheduler.patterns.length;
}

function scheduleNextColorBoundary() {
    if (!colorStepScheduler.active || colorStepScheduler.paused) return;
    const now = Date.now();
    if (!colorStepScheduler.nextBoundary) {
        colorStepScheduler.nextBoundary = colorStepScheduler.anchorStartAt;
    }
    while (colorStepScheduler.nextBoundary <= now) {
        // Emit inmediatamente si ya pasó la frontera (catch-up) pero evitar loop infinito
        emitNextColorStep();
        colorStepScheduler.nextBoundary += colorStepScheduler.periodMs;
    }
    const delay = Math.max(0, colorStepScheduler.nextBoundary - Date.now());
    colorStepScheduler.timeoutId = setTimeout(() => {
        emitNextColorStep();
        colorStepScheduler.nextBoundary += colorStepScheduler.periodMs;
        scheduleNextColorBoundary();
    }, delay);
}

function startCentralColorScheduler(intervalMs) {
    if (colorStepScheduler.active) return;
    const baseInterval = intervalMs || (globalState.general.colorSequenceIntervalMs || 40000);
    colorStepScheduler.periodMs = baseInterval + COLOR_DURATION_MS;
    colorStepScheduler.anchorStartAt = Date.now() + 1500; // pequeño buffer
    colorStepScheduler.currentIndex = 0;
    colorStepScheduler.active = true;
    colorStepScheduler.paused = false;
    colorStepScheduler.nextBoundary = 0;
    console.log(`🕒 *** SERVER *** ColorScheduler iniciado. periodMs=${colorStepScheduler.periodMs}`);
    scheduleNextColorBoundary();
}

function stopCentralColorScheduler() {
    if (!colorStepScheduler.active) return;
    if (colorStepScheduler.timeoutId) clearTimeout(colorStepScheduler.timeoutId);
    colorStepScheduler.timeoutId = null;
    colorStepScheduler.active = false;
    colorStepScheduler.paused = false;
    console.log('🛑 *** SERVER *** ColorScheduler detenido');
}

function pauseCentralColorScheduler() {
    if (!colorStepScheduler.active || colorStepScheduler.paused) return;
    if (colorStepScheduler.timeoutId) clearTimeout(colorStepScheduler.timeoutId);
    colorStepScheduler.timeoutId = null;
    colorStepScheduler.paused = true;
    console.log('⏸️ *** SERVER *** ColorScheduler en pausa');
}

function resumeCentralColorScheduler() {
    if (!colorStepScheduler.active || !colorStepScheduler.paused) return;
    colorStepScheduler.paused = false;
    console.log('▶️ *** SERVER *** Reanudando ColorScheduler');
    scheduleNextColorBoundary();
}

// Servir archivos estáticos
app.use(express.static(__dirname));
app.use('/patterns', express.static(path.join(__dirname, 'patterns')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));
app.use('/captura', express.static(path.join(__dirname, 'captura')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));

// Utilidad: limpiar temporales relacionados a wallpaper en /patterns
function cleanWallpaperTemps() {
    try {
        const dir = path.join(__dirname, 'patterns');
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        files.forEach(f => {
            if (f.startsWith('wallpaper_temp_') || f.startsWith('wallpaper_3screens_')) {
                try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
            }
        });
    } catch (e) {
        console.warn('⚠️ No se pudieron limpiar temporales de wallpaper:', e.message);
    }
}

// ========================================
// SERVIDOR UDP PARA ESCUCHAR MENSAJES DE CÁMARA
// ========================================

// Configuración UDP
const UDP_PORT = 5555;
const udpServer = dgram.createSocket('udp4');

// Estado del procesamiento de imagen
let imageProcessingState = {
    isProcessing: false,
    lastProcessed: null,
    pendingOperation: null
};

udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`📡 *** UDP SERVER *** Escuchando en puerto ${address.port} para mensajes de cámara`);
});

udpServer.on('message', (msg, rinfo) => {
    const message = msg.toString().trim();
    console.log(`📨 *** UDP *** Mensaje recibido: "${message}" desde ${rinfo.address}:${rinfo.port}`);
    
    if (message === 'save') {
        console.log('📸 *** UDP *** Confirmación de guardado de imagen recibida!');
        handleImageSaved();
    } else {
        console.log(`⚠️ *** UDP *** Mensaje no reconocido: "${message}"`);
    }
});

udpServer.on('error', (err) => {
    console.error('❌ *** UDP SERVER *** Error:', err);
});

// Función para manejar cuando se confirma que la imagen fue guardada
function handleImageSaved() {
    console.log('🎯 *** SERVER *** Procesando confirmación de imagen guardada');
    
    imageProcessingState.isProcessing = false;
    imageProcessingState.lastProcessed = Date.now();
    
    // Notificar a todos los clientes que la imagen está lista
    io.emit('processedImageReady', { 
        type: 'processed', 
        filename: 'processed.png',
        timestamp: Date.now(),
        source: 'camera-udp'
    });
    
    // Si hay una operación pendiente, continuar con la secuencia
    if (imageProcessingState.pendingOperation) {
        const operation = imageProcessingState.pendingOperation;
        imageProcessingState.pendingOperation = null;
        
        console.log(`🔄 *** SERVER *** Continuando operación pendiente: ${operation.id}`);
        
        // Continuar con la recarga y captura
        setTimeout(() => {
            const operationId = `udp-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
            
            // Enviar recarga SINCRONIZADA a screen/1 con captura posterior
            io.emit('reloadRequestSync', { 
                screenId: 1, 
                forceProcessed: true, 
                operationId: operationId,
                captureAfterReload: true
            });
            
            console.log('🔄 *** SERVER *** reloadRequestSync enviado tras confirmación UDP');
            
            // Fallback: si no llega screenReady en tiempo, intentar capturar
            const fallback = setTimeout(() => {
                console.warn('⏰ *** SERVER *** Fallback UDP - forzando captura sin confirmación');
                io.emit('requestCanvasCapture', { screenId: 1 });
                pendingReloadOps.delete(operationId);
            }, 12000);
            
            pendingReloadOps.set(operationId, { screenId: 1, timer: fallback });
            
        }, 1000); // Pequeña pausa para asegurar que processed.png esté disponible
    }
}

// Iniciar servidor UDP
udpServer.bind(UDP_PORT);

// Ruta para la pantalla de 3 monitores
app.get('/3screens', (req, res) => {
    res.sendFile(path.join(__dirname, 'screen.html'));
});

// Ruta para el panel de control
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'control.html'));
});

// Endpoint para listar patrones disponibles
app.get('/api/patterns/list', (req, res) => {
    try {
        const patternsDir = path.join(__dirname, 'patterns');
        
        // Crear carpeta si no existe
        if (!fs.existsSync(patternsDir)) {
            fs.mkdirSync(patternsDir, { recursive: true });
            return res.json({ success: true, patterns: [] });
        }
        
        // Verificar si existe wallpaper.jpg
        const wallpaperPath = path.join(patternsDir, 'wallpaper.jpg');
        
        if (fs.existsSync(wallpaperPath)) {
            console.log('📋 Patrón wallpaper.jpg encontrado');
            return res.json({ 
                success: true, 
                patterns: ['wallpaper.jpg'] 
            });
        } else {
            console.log('📋 No se encontró wallpaper.jpg');
            return res.json({ 
                success: true, 
                patterns: [] 
            });
        }
        
    } catch (error) {
        console.error('Error listando patrones:', error);
        res.json({ success: false, error: error.message });
    }
});

// Nuevo endpoint para escanear la carpeta captura
app.get('/api/captura/scan', (req, res) => {
    try {
        const capturaDir = path.join(__dirname, 'captura');
        
        // Crear carpeta si no existe
        if (!fs.existsSync(capturaDir)) {
            fs.mkdirSync(capturaDir, { recursive: true });
        }
        
        // Escanear archivos de imagen
        const files = fs.readdirSync(capturaDir);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
        
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });
        
        if (imageFiles.length === 0) {
            return res.json({ 
                success: false, 
                message: 'No se encontraron imágenes en la carpeta /captura' 
            });
        }
        
        // Tomar la primera imagen encontrada
        const firstImage = imageFiles[0];
        const imagePath = `/captura/${firstImage}`;
        
        console.log(`📷 Imagen encontrada en captura: ${firstImage}`);
        
        res.json({
            success: true,
            imagePath: imagePath,
            filename: firstImage,
            totalImages: imageFiles.length,
            message: `Imagen cargada: ${firstImage}`
        });
        
    } catch (error) {
        console.error('Error escaneando carpeta captura:', error);
        res.json({ 
            success: false, 
            message: 'Error al escanear la carpeta captura: ' + error.message 
        });
    }
});

// Helper: Clean temp processing directory, keeping only the latest processed pattern
function cleanProcessedDirExceptPattern() {
    try {
        const processedDir = path.join(__dirname, 'processed'); // Temporary processing folder
        if (!fs.existsSync(processedDir)) return;
        const files = fs.readdirSync(processedDir);
        for (const f of files) {
            if (f === 'processed.png') continue; // Keep the current processed pattern
            const p = path.join(processedDir, f);
            try {
                const stat = fs.statSync(p);
                if (stat.isFile()) fs.unlinkSync(p);
                else if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
            } catch (e) {
                console.warn('No se pudo borrar:', p, e.message);
            }
        }
    } catch (e) {
        console.warn('Error limpiando processed/:', e.message);
    }

    // Ensure processed.png exists: copy selected image as fallback
    try {
        const processedDir = path.join(__dirname, 'processed');
        if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
        const patternPath = path.join(processedDir, 'processed.png');
        if (!fs.existsSync(patternPath)) {
            const fallback = path.join(__dirname, `${globalState.general.selectedImage}.png`);
            if (fs.existsSync(fallback)) {
                fs.copyFileSync(fallback, patternPath);
                console.log(`📋 Copiado ${globalState.general.selectedImage}.png -> processed/processed.png (fallback inicial)`);
            }
        }
    } catch (e) {
        console.warn('Error asegurando processed.png:', e.message);
    }
}

// Ruta especial para processed.png con fallback a imagen seleccionada
app.get('/processed/processed.png', (req, res) => {
    const patternPath = path.join(__dirname, 'processed', 'processed.png');
    const selectedImagePath = path.join(__dirname, `${globalState.general.selectedImage}.png`);
    
    // Si existe processed.png, usarlo; si no, usar la imagen seleccionada como fallback
    if (fs.existsSync(patternPath)) {
        res.sendFile(patternPath);
    } else {
        console.log(`processed.png no existe, usando ${globalState.general.selectedImage}.png como fallback`);
        res.sendFile(selectedImagePath);
    }
});

app.use(express.json());

// Estado global del sistema - CON VALORES ACTUALIZADOS Y PERSISTENCIA
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Función para cargar configuración desde archivo
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const savedConfig = JSON.parse(data);
            console.log('📂 Configuración cargada desde config.json');
            return savedConfig;
        }
    } catch (error) {
        console.warn('⚠️ Error cargando configuración:', error.message);
    }
    return null;
}

// Función para guardar configuración
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('💾 Configuración guardada en config.json');
        console.log('📊 Guardado - RepX:', config.general?.repetitionX, 'RepY:', config.general?.repetitionY);
    } catch (error) {
        console.error('❌ Error guardando configuración:', error.message);
    }
}

let globalState = {
    // Configuración general (aplicada a todas las pantallas)
    general: {
        patternType: 'organic-complex',
        repetitionX: 265,        // NUEVO VALOR
        repetitionY: 23,         // NUEVO VALOR
        patternSize: 300,
        separationX: 80,         // NUEVO VALOR
        separationY: 119,        // NUEVO VALOR
        spacingX: 0,
        spacingY: 0,
        rotation: 0,
        zoom: 2.3,
        blendMode: 'multiply',
        perfumeSpacingH: 0.25,   // NUEVO VALOR
        perfumeSpacingV: 0.30,   // NUEVO VALOR
        perfumeSizeFactor: 0.55, // NUEVO VALOR
        backgroundColor: '#FFF2E5', // NUEVO COLOR
        selectedImage: 'red',
        patternSource: 'processed',
        // Configuración de imágenes superpuestas - NUEVOS VALORES
    overlayImages: {
        countX: 10,
        countY: 4,
        offsetX: -650,
        offsetY: 600,
        size: 382,
        spacingX: 450,
        spacingY: 550,
        rowOffsetX: 60,
        rowOffsetY: 0,
        colOffsetX: 0,
        colOffsetY: 0,
        alternateRowX: 140,
        alternateRowY: 0,
        alternateColX: 0,
        alternateColY: 0
    },
    // NUEVO: Intervalo único para la secuencia de coloreado (ms) - default 40s
    colorSequenceIntervalMs: 40000
    },
    // Configuración específica de cada pantalla (solo offset horizontal manual)
    screens: {
        1: { offsetX: 0 },
        2: { offsetX: 0 },
        3: { offsetX: 0 },
        4: { offsetX: 0 },
        5: { offsetX: 0 },
        6: { offsetX: 0 },
        7: { offsetX: 0 },
        8: { offsetX: 0 },
        9: { offsetX: 0 }
    },
    // Configuración específica de cada brush-reveal
    brushReveal: {
        1: { offsetX: 0, offsetY: 0 },      // Sección 1: izquierda
        2: { offsetX: 2160, offsetY: 0 },   // Sección 2: centro
        3: { offsetX: 4320, offsetY: 0 },   // Sección 3: derecha
        4: { offsetX: 0, offsetY: 0 },      // Sección 4: repetir izquierda
        5: { offsetX: 2160, offsetY: 0 },   // Sección 5: repetir centro
        6: { offsetX: 4320, offsetY: 0 },   // Sección 6: repetir derecha
        7: { offsetX: 0, offsetY: 0 },      // Sección 7: repetir izquierda
        8: { offsetX: 2160, offsetY: 0 },   // Sección 8: repetir centro
        9: { offsetX: 4320, offsetY: 0 }    // Sección 9: repetir derecha
    },
    // Configuración del slideshow para brush-reveal específicos - NUEVOS VALORES
    slideshow: {
        3: {
            enabled: true,
            folder: '3',
            width: 865,          // NUEVO VALOR
            height: 972,         // NUEVO VALOR  
            x: 102,              // NUEVO VALOR
            y: 153,              // NUEVO VALOR
            interval: 3000,
            zIndex: 1000,
            shadowWidth: 20,      // NUEVO: Ancho de sombra
            shadowOpacity: 0.3    // NUEVO: Opacidad de sombra
        },
        7: {
            enabled: true,
            folder: '4',
            width: 1670,         // NUEVO VALOR
            height: 1912,        // NUEVO VALOR
            x: 256,              // NUEVO VALOR
            y: 300,              // NUEVO VALOR
            interval: 3000,
            zIndex: 1000,
            shadowWidth: 20,      // NUEVO: Ancho de sombra
            shadowOpacity: 0.3    // NUEVO: Opacidad de sombra
        }
    },
    // Wallpaper state
    wallpaper: {
        isActive: true
    },
    // Estado de animación
    animation: {
        isRunning: false,
        startTime: null,
        sequence: 'organic', // 'organic' para el efecto que ya tienes
        delayPattern: { // Delays en milisegundos para cada pantalla - crecimiento orgánico desde abajo izquierda
            1: 0,     // Pantalla 1 (abajo izquierda) - inicia inmediatamente
            4: 250,   // Pantalla 4 (arriba de 1) - 250ms después
            2: 350,   // Pantalla 2 (derecha de 1) - 350ms después  
            7: 500,   // Pantalla 7 (arriba de 4) - 500ms después
            5: 600,   // Pantalla 5 (arriba de 2) - 600ms después
            3: 700,   // Pantalla 3 (derecha de 2) - 700ms después
            8: 850,   // Pantalla 8 (arriba de 7) - 850ms después
            6: 950,   // Pantalla 6 (arriba de 5) - 950ms después
            9: 1100   // Pantalla 9 (arriba de 8) - 1100ms después (última)
        }
    },
    // Estado del wallpaper
    wallpaper: {
        isActive: true // Activado por defecto
    }
};

// Función para merge profundo de configuraciones
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

// Cargar configuración guardada al iniciar servidor
const savedConfig = loadConfig();
if (savedConfig) {
    globalState = deepMerge(globalState, savedConfig);
    console.log('✅ Configuración anterior restaurada');
    console.log('📊 Valores cargados - RepX:', globalState.general.repetitionX, 'RepY:', globalState.general.repetitionY);
} else {
    console.log('🆕 Usando configuración por defecto');
}

// Clientes conectados
let connectedClients = new Map();

// Rutas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'brush-reveal.html'));
});

app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'control.html'));
});

app.get('/screen/:id', (req, res) => {
    const screenId = req.params.id;
    if (screenId >= 1 && screenId <= 9) {
        res.sendFile(path.join(__dirname, 'screen.html'));
    } else {
        res.status(404).send('Screen ID must be between 1 and 9');
    }
});

app.get('/brush-reveal', (req, res) => {
    res.sendFile(path.join(__dirname, 'brush-reveal.html'));
});

// Rutas para brush-reveal con diferentes secciones del wallpaper
app.get('/brush-reveal/:id', (req, res) => {
    const brushId = parseInt(req.params.id);
    if (brushId >= 1 && brushId <= 9) {
        res.sendFile(path.join(__dirname, 'brush-reveal.html'));
    } else {
        res.status(404).send('Brush reveal ID must be between 1 and 9');
    }
});

// Página de prueba para todos los brush-reveals
app.get('/test-brush', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-brush-reveals.html'));
});

// Página de test para rotación automática
app.get('/test-rotation', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-rotation.html'));
});

// API para obtener imágenes del slideshow
app.get('/api/slideshow/:folder', (req, res) => {
    const folder = req.params.folder;
    const slideshowPath = path.join(__dirname, 'slideshow', folder);
    
    try {
        if (!fs.existsSync(slideshowPath)) {
            return res.json({ success: false, images: [], message: 'Folder not found' });
        }
        
        const files = fs.readdirSync(slideshowPath);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        });
        
        const images = imageFiles.map(file => `/slideshow/${folder}/${file}`);
        
        res.json({
            success: true,
            images: images,
            count: images.length
        });
    } catch (error) {
        res.json({ success: false, images: [], message: error.message });
    }
});

// Servir archivos del slideshow
app.use('/slideshow', express.static(path.join(__dirname, 'slideshow')));

// Alias de imágenes en español para compatibilidad con UI

// API endpoints
app.get('/api/state', (req, res) => {
    res.json(globalState);
});

app.post('/api/general', (req, res) => {
    globalState.general = { ...globalState.general, ...req.body };
    saveConfig(globalState); // GUARDAR CONFIGURACIÓN
    io.emit('generalConfigUpdate', globalState.general);
    res.json({ success: true });
});

// NUEVO: Endpoint para forzar guardado de configuración
app.post('/api/save-config', (req, res) => {
    try {
        saveConfig(globalState);
        res.json({ success: true, message: 'Configuración guardada exitosamente' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/screen/:id', (req, res) => {
    const screenId = parseInt(req.params.id);
    if (screenId >= 1 && screenId <= 9) {
        globalState.screens[screenId] = { ...globalState.screens[screenId], ...req.body };
        saveConfig(globalState); // GUARDAR CONFIGURACIÓN
        io.emit('screenConfigUpdate', { screenId, config: globalState.screens[screenId] });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Screen ID must be between 1 and 9' });
    }
});

app.post('/api/brush-reveal/:id', (req, res) => {
    const brushId = parseInt(req.params.id);
    if (brushId >= 1 && brushId <= 9) {
        globalState.brushReveal[brushId] = { ...globalState.brushReveal[brushId], ...req.body };
        saveConfig(globalState); // GUARDAR CONFIGURACIÓN
        io.emit('brushRevealConfigUpdate', { brushId, config: globalState.brushReveal[brushId] });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Brush reveal ID must be between 1 and 9' });
    }
});

// API para configurar slideshow
app.post('/api/slideshow/:id', (req, res) => {
    const brushId = parseInt(req.params.id);
    if ([3, 7].includes(brushId)) {
        globalState.slideshow[brushId] = { ...globalState.slideshow[brushId], ...req.body };
        saveConfig(globalState); // GUARDAR CONFIGURACIÓN
        io.emit('slideshowConfigUpdate', { brushId, config: globalState.slideshow[brushId] });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Slideshow only available for brush-reveal 3 and 7' });
    }
});

app.post('/api/animation/start', (req, res) => {
    globalState.animation.isRunning = true;
    globalState.animation.startTime = Date.now();
    io.emit('animationStart', {
        startTime: globalState.animation.startTime,
        sequence: globalState.animation.sequence
    });
    res.json({ success: true });
});

app.post('/api/animation/stop', (req, res) => {
    globalState.animation.isRunning = false;
    globalState.animation.startTime = null;
    io.emit('animationStop');
    res.json({ success: true });
});

// WebSocket handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Optimización: Rate limiting para evitar spam de mensajes
    const messageThrottle = new Map();
    const THROTTLE_TIME = 100; // 100ms entre mensajes del mismo tipo
    
    function isThrottled(eventName) {
        const now = Date.now();
        const lastTime = messageThrottle.get(eventName) || 0;
        
        if (now - lastTime < THROTTLE_TIME) {
            return true; // Throttled
        }
        
        messageThrottle.set(eventName, now);
        return false; // Not throttled
    }

    socket.on('registerScreen', (data) => {
        const { screenId, type, brushId } = data;
        connectedClients.set(socket.id, { screenId, type, brushId, socket });
        
        // Enviar estado inicial según el tipo
        if (type === 'brush-reveal') {
            socket.emit('initialState', {
                general: globalState.general,
                brushReveal: globalState.brushReveal[brushId] || { offsetX: 0, offsetY: 0 },
                brushId: brushId,
                animation: globalState.animation,
                wallpaper: { isActive: true }
            });
            console.log(`${type} registered with brush ID: ${brushId}`);
            // Si la secuencia automática está activa, reenviar estado de sincronización
            if (autoSeqActive && autoSeqState) {
                try {
                    socket.emit('startAutoColorSequence', autoSeqState);
                    console.log(`📡 Reenviado estado de secuencia a brush ${brushId}`);
                } catch (e) {
                    console.warn('⚠️ No se pudo reenviar estado de secuencia al nuevo cliente:', e.message);
                }
            }
        } else {
            // Configuración para screens normales
            socket.emit('initialState', {
                general: globalState.general,
                screen: globalState.screens[screenId] || { offsetX: 0 },
                animation: globalState.animation,
                wallpaper: { isActive: true }
            });
            console.log(`${type} registered with screen ID: ${screenId}`);
        }
    });

    socket.on('requestAnimationStart', (data) => {
        // Solo el control puede iniciar animaciones
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            // Toggle del estado del wallpaper
            globalState.wallpaper.isActive = !globalState.wallpaper.isActive;
            
            if (globalState.wallpaper.isActive) {
                // Encender wallpaper y ejecutar animación
                globalState.animation.isRunning = true;
                globalState.animation.startTime = Date.now();
                
                // Enviar comando de inicio con delays específicos para cada pantalla
                io.emit('wallpaperToggle', {
                    isActive: true,
                    startTime: globalState.animation.startTime,
                    sequence: globalState.animation.sequence,
                    delayPattern: globalState.animation.delayPattern
                });
                
                // NUEVO: También enviar comando específico para brush-reveal
                io.emit('requestAnimationStart', {
                    timestamp: Date.now(),
                    message: 'Iniciar animación desde control'
                });
                
                console.log('🎬 Comando de animación enviado a todas las pantallas y brush-reveal');
            } else {
                // Apagar wallpaper
                globalState.animation.isRunning = false;
                globalState.animation.startTime = null;
                
                io.emit('wallpaperToggle', {
                    isActive: false
                });
            }
        }
    });

    socket.on('updateGeneralConfig', (config) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            // Siempre actualizar y guardar la configuración
            globalState.general = { ...globalState.general, ...config };
            saveConfig(globalState); // GUARDAR CONFIGURACIÓN SIEMPRE
            console.log('💾 Configuración general actualizada y guardada');
            
            // Aplicar throttling solo para la emisión a clientes
            if (!isThrottled('updateGeneralConfig')) {
                // Solo enviar a screens, no a brush-reveal para optimizar
                connectedClients.forEach((otherClient) => {
                    if (otherClient.type === 'screen' && otherClient.socket.connected) {
                        otherClient.socket.emit('generalConfigUpdate', globalState.general);
                    }
                });
            }
        }
    });

    // NUEVO: Cambiar la fuente del patrón (processed | rojo | azul | amarillo)
    socket.on('setPatternSource', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            const allowed = ['processed', 'rojo', 'azul', 'amarillo'];
            const src = (data && data.source) ? String(data.source) : 'processed';
            if (!allowed.includes(src)) return;
            globalState.general.patternSource = src;
            saveConfig(globalState); // GUARDAR CONFIGURACIÓN
            console.log(`🧩 patternSource cambiado a: ${src} y guardado`);
            io.emit('patternSourceChanged', { source: src });
            // También reenviar el estado general para que screen.html lo tenga sincronizado
            io.emit('generalConfigUpdate', globalState.general);
        }
    });

    socket.on('updateScreenConfig', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            const { screenId, config } = data;
            if (screenId >= 1 && screenId <= 9) {
                globalState.screens[screenId] = { ...globalState.screens[screenId], ...config };
                io.emit('screenConfigUpdate', { screenId, config: globalState.screens[screenId] });
            }
        }
    });

    socket.on('selectImage', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            const { image } = data;
            if (['red', 'pink', 'blue'].includes(image)) {
                globalState.general.selectedImage = image;
                saveConfig(globalState); // GUARDAR CONFIGURACIÓN
                console.log(`🖼️ Imagen seleccionada: ${image}.png y guardada`);
                // Notificar a todos los clientes sobre el cambio
                io.emit('imageSelected', { image });
            }
        }
    });

    // NUEVO: Manejar rotación automática de imágenes para brush-reveal
    socket.on('brushRevealRotateImage', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log(`🎨 *** SERVER *** Retransmitiendo rotación automática: ${data.image}`);
            
            // Optimización: solo enviar a brush-reveal clients, no a todos
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('brushRevealRotateImage', data);
                }
            });
            
            console.log('📡 *** SERVER *** brushRevealRotateImage enviado a brush-reveal clients');
        } else {
            console.warn('⚠️ *** SERVER *** brushRevealRotateImage recibido de cliente no-control:', client?.type);
        }
    });

    // MEJORADO: Orquestación al presionar "1" con sistema UDP real
    socket.on('startBrushRevealSequence', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🎯 *** SERVER *** Orquestando flujo de tecla 1 con sistema UDP');
            // Mantener la secuencia de color corriendo (no pausar) hasta que el wallpaper esté listo
            
            if (imageProcessingState.isProcessing) {
                console.log('⚠️ *** SERVER *** Ya hay un procesamiento en curso, ignorando nueva solicitud');
                return;
            }
            
            // Marcar que estamos esperando el procesamiento
            const operationId = `udp-sequence-${Date.now()}`;
            imageProcessingState.isProcessing = true;
            imageProcessingState.pendingOperation = {
                id: operationId,
                type: 'brush-reveal-sequence',
                startedAt: Date.now()
            };
            
            console.log('📸 *** SERVER *** Esperando confirmación UDP de cámara en puerto 5555...');
            
            // Notificar al control que estamos esperando
            io.emit('waitingForImageCapture', {
                message: 'Esperando confirmación de cámara via UDP puerto 5555',
                timestamp: Date.now()
            });
            
            // Timeout de seguridad: si no llega confirmación UDP en 30 segundos, abortar
            setTimeout(() => {
                if (imageProcessingState.isProcessing && 
                    imageProcessingState.pendingOperation?.id === operationId) {
                    console.warn('⏰ *** SERVER *** Timeout esperando confirmación UDP - abortando secuencia');
                    imageProcessingState.isProcessing = false;
                    imageProcessingState.pendingOperation = null;
                    io.emit('imageProcessingTimeout', {
                        message: 'Timeout esperando confirmación de cámara',
                        operationId,
                        timestamp: Date.now()
                    });
                    // NUEVO: Recuperación automática para no quedar en fondo vacío
                    try {
                        // Reanudar scheduler de colores si estaba pausado
                        if (colorStepScheduler.active && colorStepScheduler.paused) {
                            console.log('▶️ *** SERVER *** Reanudando scheduler tras timeout UDP');
                            resumeCentralColorScheduler();
                        }
                        // Si tenemos un último paso reenviarlo; si no, generar uno nuevo
                        if (colorStepScheduler.lastStep) {
                            console.log('📤 *** SERVER *** Reenviando último paso de color tras timeout UDP');
                            connectedClients.forEach(c => {
                                if (c.type === 'brush-reveal' && c.socket.connected) {
                                    c.socket.emit('nextColorStep', colorStepScheduler.lastStep);
                                }
                            });
                        } else if (colorStepScheduler.active && !colorStepScheduler.paused) {
                            console.log('⚡ *** SERVER *** Emitiendo paso de color inmediato tras timeout UDP');
                            emitNextColorStep();
                        }
                        // Fallback: si ya existe wallpaper.jpg reciente, forzar modo wallpaper brevemente
                        const wp = path.join(__dirname,'patterns','wallpaper.jpg');
                        if (fs.existsSync(wp)) {
                            const stat = fs.statSync(wp);
                            const ageMs = Date.now() - stat.mtimeMs;
                            if (ageMs < 5 * 60 * 1000) { // menor a 5 min
                                const fallbackSeq = `wallpaper_timeout_${Date.now()}`;
                                console.log(`🟡 *** SERVER *** Forzando switchToWallpaperMode con wallpaper existente (edad ${ageMs}ms)`);
                                io.emit('switchToWallpaperMode', { sequenceId: fallbackSeq });
                            }
                        }
                    } catch(e) { console.warn('⚠️ Error en recuperación post-timeout:', e.message); }
                }
            }, 30000); // 30 segundos timeout
        }
    });

    // NUEVO: Iniciar rotación automática de patrones cada 2 minutos
    socket.on('startPatternRotation', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🔄 *** SERVER *** Iniciando rotación automática de patrones cada 2 minutos');
            
            // Contar brush-reveal conectados
            const brushRevealClients = Array.from(connectedClients.values()).filter(c => c.type === 'brush-reveal');
            console.log(`📊 *** SERVER *** ${brushRevealClients.length} brush-reveal clients conectados`);
            
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    console.log(`📡 *** SERVER *** Enviando startPatternRotation a brush ${otherClient.brushId}`);
                    otherClient.socket.emit('startPatternRotation', {
                        patterns: ['amarillo', 'azul', 'rojo'],
                        interval: 120000, // 2 minutos en milisegundos
                        timestamp: Date.now()
                    });
                }
            });
            
            console.log('📡 *** SERVER *** startPatternRotation enviado a brush-reveal clients');
        }
    });

    // NUEVO: Controles de secuencia de coloreado automático
    socket.on('startAutoColorSequence', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🎨 *** SERVER *** Iniciando secuencia automática de coloreado');
            
            // Crear timestamp de sincronización para todas las pantallas
            const nowTs = Date.now();
            // Reusar ancla si ya estaba activa para no desincronizar
            if (!autoSeqActive || !autoSeqState) {
                const startAt = nowTs + 1500; // pequeño buffer para que todos lleguen
                autoSeqState = {
                    timestamp: nowTs,
                    startAt,
                    intervalTime: globalState.general.colorSequenceIntervalMs || 40000,
                    patterns: ['amarillo.jpg','rojo.jpg','azul.jpg','logo1.jpg','logo2.jpg'],
                    currentIndex: 0
                };
            } else {
                // actualizar solo el intervalo/patrones si cambiaron
                autoSeqState.timestamp = nowTs;
                autoSeqState.intervalTime = globalState.general.colorSequenceIntervalMs || autoSeqState.intervalTime;
            }
            autoSeqActive = true;
            
            console.log(`⏰ *** SERVER *** Sync ts=${nowTs}, startAt=${startAt}`);
            
            // Iniciar programador central (si no está activo)
            startCentralColorScheduler(autoSeqState.intervalTime);
            
            // Enviar comando con datos de sincronización a todos los brush-reveal (para ancla)
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('startAutoColorSequence', autoSeqState);
                    // Si hay último paso ya emitido (por scheduler), reenviarlo tras un pequeño delay para late joiners
                    if (colorStepScheduler.lastStep) {
                        setTimeout(() => {
                            try { otherClient.socket.emit('nextColorStep', colorStepScheduler.lastStep); } catch(_) {}
                        }, 300);
                    }
                }
            });
            
            console.log('📡 *** SERVER *** Comando startAutoColorSequence + scheduler enviado a brush-reveal clients');
        }
    });

    socket.on('stopAutoColorSequence', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('⏹️ *** SERVER *** Deteniendo secuencia automática de coloreado');
            
            autoSeqActive = false;
            autoSeqState = null;
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('stopAutoColorSequence');
                }
            });
            
            console.log('📡 *** SERVER *** Comando stopAutoColorSequence enviado a brush-reveal clients');
        }
    });

    socket.on('nextColorStep', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('⏭️ *** SERVER *** Ejecutando siguiente paso de color');
            
            // Crear timestamp de sincronización
            const syncTimestamp = Date.now();
        // Determinar patrón actual del paso según el orden deseado
    const seq = ['amarillo.jpg', 'rojo.jpg', 'azul.jpg', 'logo1.jpg', 'logo2.jpg'];
        // Guardar y actualizar índice en estado de servidor
        server._colorSeqIndex = (server._colorSeqIndex || 0) % seq.length;
        const pattern = seq[server._colorSeqIndex];
        server._colorSeqIndex = (server._colorSeqIndex + 1) % seq.length;
        if (autoSeqActive && autoSeqState) {
            autoSeqState.patterns = seq;
            autoSeqState.currentIndex = server._colorSeqIndex;
        }
            
            // Enviar comando con timestamp a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
            otherClient.socket.emit('nextColorStep', { timestamp: syncTimestamp, pattern, currentIndex: server._colorSeqIndex });
                }
            });
            
        console.log(`📡 *** SERVER *** Comando nextColorStep enviado con patrón=${pattern} ts=${syncTimestamp}`);
        }
    });
    
    // Solicitud manual de re-sincronización desde el panel de control
    socket.on('requestColorResync', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🔁 *** SERVER *** Resync de color solicitado');
            if (colorStepScheduler.lastStep) {
                // Reenviar último paso a todos los brush-reveal
                connectedClients.forEach(c => {
                    if (c.type === 'brush-reveal' && c.socket.connected) {
                        try { c.socket.emit('nextColorStep', colorStepScheduler.lastStep); } catch(_) {}
                    }
                });
            } else if (colorStepScheduler.active && !colorStepScheduler.paused) {
                emitNextColorStep();
            } else {
                console.log('ℹ️ Resync ignorado: scheduler inactivo');
            }
        }
    });

    // Reenviar último paso de color a un brush que se reincorpora tras wallpaper
    socket.on('requestLastColorStep', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'brush-reveal') {
            // Si el scheduler está pausado (por wallpaper) reanudar inmediatamente para no quedarse en fondo vacío
            if (colorStepScheduler.active && colorStepScheduler.paused) {
                console.log('▶️ Reanudando scheduler al recibir requestLastColorStep');
                resumeCentralColorScheduler();
            }
            if (colorStepScheduler.lastStep) {
                console.log(`📤 Reenviando último paso de color a brush ${client.brushId || '?'} (${colorStepScheduler.lastStep.pattern})`);
                try { socket.emit('nextColorStep', colorStepScheduler.lastStep); } catch(_) {}
            } else if (colorStepScheduler.active && !colorStepScheduler.paused) {
                console.log('⚡ No había paso previo; emitiendo uno nuevo para enganchar a todos');
                emitNextColorStep();
            }
        }
    });

    socket.on('resetColorSequence', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🔄 *** SERVER *** Reseteando secuencia de coloreado a amarillo');
            
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('resetColorSequence');
                }
            });
            
            console.log('📡 *** SERVER *** Comando resetColorSequence enviado a brush-reveal clients');
        }
    });

    // NUEVO: Actualizar el intervalo de secuencia de coloreado (ms) desde el control
    socket.on('setColorSequenceInterval', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            const value = Number(data?.intervalMs);
            if (!Number.isFinite(value) || value < 1000 || value > 10 * 60 * 1000) {
                console.warn('⚠️ *** SERVER *** Intervalo inválido, se ignora:', data);
                return;
            }
            globalState.general.colorSequenceIntervalMs = value;
            saveConfig(globalState);
            console.log(`⏱️ *** SERVER *** Intervalo de secuencia actualizado: ${value}ms`);
            // Informar a todos los brush-reveal para que adopten el nuevo valor
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('colorSequenceIntervalUpdated', { intervalMs: value });
                }
            });
        }
    });

    // NUEVO: Switch a modo wallpaper
    socket.on('switchToWallpaperMode', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🔀 *** SERVER *** Cambiando a modo Wallpaper (wallpaper.jpg)');
            pauseCentralColorScheduler();
            
            // Generar ID de secuencia único
            const sequenceId = `wallpaper_manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            currentWallpaperSequenceId = sequenceId;
            
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('switchToWallpaperMode', { sequenceId: sequenceId });
                }
            });
            
            console.log(`📡 *** SERVER *** Comando switchToWallpaperMode enviado a brush-reveal clients (ID: ${sequenceId})`);
        }
    });

    // NUEVO: Switch a modo secuencia
    socket.on('switchToSequenceMode', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('🔀 *** SERVER *** Cambiando a modo Secuencia (rojo→azul→amarillo)');
            resumeCentralColorScheduler();
            
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('switchToSequenceMode');
                }
            });
            
            console.log('📡 *** SERVER *** Comando switchToSequenceMode enviado a brush-reveal clients');
        }
    });

    // NUEVO: Detener rotación automática de patrones
    socket.on('stopPatternRotation', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log('⏹️ *** SERVER *** Deteniendo rotación automática de patrones');
            
            // Enviar comando a todos los brush-reveal
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('stopPatternRotation');
                }
            });
            
            console.log('📡 *** SERVER *** stopPatternRotation enviado a brush-reveal clients');
        }
    });

    socket.on('savePattern', async (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            try {
                // Generar ID único basado en timestamp
                const timestamp = Date.now();
                const uniqueId = `pattern_${timestamp}`;
                
                // Permitir forzar la imagen seleccionada enviada por el control
                const selectedImageArg = (data && ['red', 'pink', 'blue'].includes(data.selectedImage))
                    ? data.selectedImage
                    : undefined;

                await generatePatternImage(uniqueId, { selectedImage: selectedImageArg });
                
                // Notificar a todas las páginas brush-reveal que hay un nuevo patrón
                io.emit('newPatternReady', { 
                    patternId: uniqueId,
                    filename: `${uniqueId}.jpg`,
                    timestamp: timestamp
                });
                
                socket.emit('patternSaved', { 
                    success: true, 
                    message: `Patrón guardado como ${uniqueId}.jpg`,
                    patternId: uniqueId
                });
            } catch (error) {
                console.error('Error saving pattern:', error);
                socket.emit('patternSaved', { success: false, message: 'Error al guardar el patrón' });
            }
        }
    });

    // ========================================
    // STEP 1: Save processed image to temp folder
    // ========================================
    socket.on('saveProcessedImage', async (data) => {
        console.log('📥 PASO 1: Recibiendo imagen procesada...');
        try {
                const { imageDataUrl } = data;
                
                if (!imageDataUrl) {
                    console.log('❌ No se recibieron datos de imagen');
                    socket.emit('processedImageSaved', { success: false, message: 'No se recibieron datos de imagen' });
                    return;
                }

                console.log(`📏 Tamaño de datos recibidos: ${(imageDataUrl.length / 1024 / 1024).toFixed(2)} MB`);

                // Create temp processing directory if it doesn't exist
                const processedDir = path.join(__dirname, 'processed');
                if (!fs.existsSync(processedDir)) {
                    fs.mkdirSync(processedDir, { recursive: true });
                    console.log('📁 Directorio processed/ creado');
                }

                // Always use the same name: processed.png (temporary processed file)
                const filename = 'processed.png';
                const filepath = path.join(processedDir, filename);

                // Convert data URL to buffer and save (overwriting)
                const base64Data = imageDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                
                console.log(`💾 Guardando imagen temporal: ${filepath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
                fs.writeFileSync(filepath, buffer);

                // Clean up other files in processed/ directory
                cleanProcessedDirExceptPattern();

                console.log('✅ PASO 1 COMPLETADO: Imagen procesada guardada como processed.png temporal');
                socket.emit('processedImageSaved', { 
                    success: true, 
                    message: 'Imagen procesada guardada exitosamente',
                    filename: filename
                });

        } catch (error) {
            console.error('❌ Error saving processed image:', error);
            socket.emit('processedImageSaved', { success: false, message: 'Error al guardar imagen procesada: ' + error.message });
        }
    });

    // ========================================
    // STEP 2: Generate final pattern JPG and save to /patterns folder
    // ========================================
    
    // NUEVO: Manejar solicitud de captura desde control.html (tecla 'a')
    socket.on('requestCanvasCapture', () => {
        console.log('📸 Control solicita captura de canvas - enviando a todas las pantallas...');
        
        // Enviar solicitud a todas las pantallas conectadas
        connectedClients.forEach((client) => {
            if (client.type === 'screen') {
                client.socket.emit('requestCanvasCapture');
                console.log(`✅ Solicitud enviada a pantalla ${client.screenId}`);
            }
        });
    });
    
    // NUEVO: Solicitar captura de canvas a una pantalla específica
    socket.on('requestCanvasCaptureFromScreen', (data) => {
        const targetScreenId = data.screenId || 1;
        console.log(`📸 Solicitando captura de canvas a pantalla ${targetScreenId}...`);
        
        // Enviar solo a las pantallas con el screenId específico
        connectedClients.forEach((client) => {
            if (client.type === 'screen' && client.screenId === targetScreenId) {
                client.socket.emit('requestCanvasCapture');
                console.log(`✅ Solicitud enviada a pantalla ${targetScreenId}`);
            }
        });
    });

    // NUEVO: Endpoint para recibir canvas completo desde screen.html
    socket.on('saveScreenCanvas', async (data) => {
        try {
            console.log('🖼️ Recibiendo canvas completo desde screen.html (3 pantallas)...');
            if (wallpaperSaveInProgress) {
                console.warn('⏳ Guardado de wallpaper ya en curso - ignorando nueva solicitud');
                return;
            }
            wallpaperSaveInProgress = true;
            suspendProcessedReloads = true;
            
            if (!data.imageData) {
                throw new Error('No image data received');
            }
            
            // Usar siempre el mismo nombre: wallpaper.jpg
            const filename = 'wallpaper.jpg';
            
            // Decodificar base64 (quitar prefijo data:image/png;base64,)
            const base64Data = data.imageData.replace(/^data:image\/png;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Guardar en la carpeta patterns
            const patternsDir = path.join(__dirname, 'patterns');
            if (!fs.existsSync(patternsDir)) {
                fs.mkdirSync(patternsDir, { recursive: true });
            }
            
            // Cargar imagen del canvas de 3 pantallas (6480x3840)
            const img = await loadImage(buffer);
            
            console.log(`📐 Dimensiones recibidas: ${img.width}x${img.height}`);
            
            // Crear canvas para convertir a JPG y redimensionar si es necesario
            const canvas = createCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            
            // Dibujar la imagen completa
            ctx.drawImage(img, 0, 0);
            
            // Limpiar temporales antes de escribir
            cleanWallpaperTemps();

            // Guardar como JPG sobreescribiendo directamente
            const finalPath = path.join(patternsDir, filename);
            const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
            console.log(`💾 Buffer JPG generado: ${jpgBuffer.length} bytes`);
            fs.writeFileSync(finalPath, jpgBuffer);
            console.log(`✅ Canvas completo guardado: ${filename}`);
            console.log(`📐 Dimensiones finales: ${img.width}x${img.height}`);
            
            // Verificar el archivo guardado
            const stats = fs.statSync(finalPath);
            const timestamp = new Date().toISOString();
            console.log(`📊 Archivo verificado - Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
            console.log(`⏰ Timestamp de guardado: ${timestamp}`);
            
            // Broadcast controlado con ID de secuencia para evitar múltiples cargas parciales
            const nowTs = Date.now();
            const sequenceId = `wallpaper_${nowTs}_${Math.random().toString(36).substr(2, 9)}`;
            
            if (nowTs - lastWallpaperBroadcastTs > 3000) { // Aumentar throttle a 3 segundos
                currentWallpaperSequenceId = sequenceId;
                io.emit('newPatternReady', { 
                    patternId: 'wallpaper', 
                    filename, 
                    timestamp: nowTs,
                    sequenceId: sequenceId
                });
                io.emit('switchToWallpaperMode', { sequenceId: sequenceId });
                pauseCentralColorScheduler();
                lastWallpaperBroadcastTs = nowTs;
                console.log(`📡 Broadcast wallpaper (ID: ${sequenceId}) - newPatternReady + switchToWallpaperMode`);
            } else {
                console.log(`🛑 Broadcast wallpaper omitido (throttle activo) - última transmisión hace ${nowTs - lastWallpaperBroadcastTs}ms`);
                return; // No continuar con timeouts si se omitió el broadcast
            }
            // Cancelar timeout previo si existe
            if (sequenceReturnTimeoutId) {
                clearTimeout(sequenceReturnTimeoutId);
                sequenceReturnTimeoutId = null;
                console.log('🗑️ *** SERVER *** Timeout previo cancelado');
            }
            // Programar regreso a modo secuencia tras 5 segundos (antes 40) para evitar quedarse en fondo
            sequenceReturnTimeoutId = setTimeout(() => {
                sequenceReturnTimeoutId = null;
                io.emit('switchToSequenceMode');
                resumeCentralColorScheduler();
                console.log('🔁 *** SERVER *** Regresando a modo secuencia (5s)');
                // Kick de seguridad: (re)iniciar secuencia automática sincronizada
                const nowTs = Date.now();
                const startAt = nowTs + 1500; // buffer para alinear clientes
                autoSeqState = {
                    timestamp: nowTs,
                    startAt,
                    intervalTime: globalState.general.colorSequenceIntervalMs || 40000,
                    patterns: ['amarillo.jpg','rojo.jpg','azul.jpg','logo1.jpg','logo2.jpg'],
                    currentIndex: 0
                };
                autoSeqActive = true;
                io.emit('startAutoColorSequence', autoSeqState);
                console.log('📡 *** SERVER *** Kick: startAutoColorSequence enviado tras volver a secuencia');
                // Si no hay lastStep aún (scheduler quizá recién reanudado) forzar emisión inmediata
                setTimeout(() => {
                    if (!colorStepScheduler.lastStep && colorStepScheduler.active && !colorStepScheduler.paused) {
                        console.log('⚡ Forzando primer paso inmediato tras volver de wallpaper');
                        emitNextColorStep();
                    }
                }, 300);
            }, 5000);
            
            console.log('📢 Evento newPatternReady enviado para brush-reveal (SIN duplicar imageUpdated)');
            
            console.log('📢 Evento newPatternReady emitido (desde canvas completo)');
            
            socket.emit('canvasSaved', {
                success: true,
                filename: filename,
                timestamp: timestamp,
                fileSize: stats.size,
                filePath: finalPath
            });
            
            // Emitir evento específico para el gestor de sincronización
            io.emit('wallpaperSaved', {
                success: true,
                filename: filename,
                timestamp: timestamp,
                source: 'canvas-capture',
                screenId: data?.screenId || 1
            });
            connectedClients.forEach(c => {
                if (c.type === 'control' && c.socket.connected) {
                    c.socket.emit('screenReloadProgress', { phase:'saved', screenId:1, operationId: data?.operationId || null, filename, ts: Date.now() });
                }
            });
            wallpaperSaveInProgress = false;
            suspendProcessedReloads = false;
            
        } catch (error) {
            console.error('❌ Error guardando canvas:', error);
            socket.emit('canvasSaved', { success: false, error: error.message });
            wallpaperSaveInProgress = false;
            suspendProcessedReloads = false;
        }
    });

    socket.on('applyProcessedImage', async (data) => {
        console.log('🎨 PASO 2: Generando patrón final desde imagen procesada...');
        try {
                // Verify that processed.png exists in temp folder
                const patternPath = path.join(__dirname, 'processed', 'processed.png');

                if (!fs.existsSync(patternPath)) {
                    console.log('❌ Archivo processed.png no encontrado en processed/');
                    socket.emit('processedImageApplied', { success: false, message: 'Archivo processed.png no encontrado en processed/' });
                    return;
                }

                console.log('✅ Imagen temporal lista: processed/processed.png');

                // Usar siempre el mismo nombre: wallpaper.jpg
                const filename = 'wallpaper';
                console.log(`💾 Generando patrón final JPG: wallpaper.jpg`);
                
                try {
                    const selectedImageArg = (data && ['red', 'pink', 'blue'].includes(data.selectedImage)) ? data.selectedImage : undefined;
                    console.log(`🖼️ Usando imagen seleccionada: ${selectedImageArg || globalState.general.selectedImage}`);
                    
                    await generatePatternImage(filename, { selectedImage: selectedImageArg });
                    
                    console.log('✅ PASO 2 COMPLETADO: Patrón final JPG generado en /patterns');
                    
                    // Notify Brush Reveal and other clients about the new final pattern
                    io.emit('newPatternReady', {
                        patternId: 'wallpaper',
                        filename: 'wallpaper.jpg',
                        timestamp: Date.now()
                    });
                    console.log('📢 Evento newPatternReady emitido para brush-reveal');
                    
                } catch (e) {
                    console.warn('⚠️ No se pudo generar el JPG del patrón tras applyProcessedImage (intento fallback):', e.message);
                    // Fallback: convert processed/processed.png to simple JPG in /patterns/
                    try {
                        const pngImg = await loadImage(patternPath);
                        const w = pngImg.width || 2160;
                        const h = pngImg.height || 3840;
                        const c = createCanvas(w, h);
                        const cx = c.getContext('2d');
                        // White background to ensure JPEG without transparencies
                        cx.fillStyle = '#FFFFFF';
                        cx.fillRect(0, 0, w, h);
                        cx.drawImage(pngImg, 0, 0, w, h);
                        const buffer = c.toBuffer('image/jpeg', { quality: 0.9 });
                        const patternsDir = path.join(__dirname, 'patterns');
                        if (!fs.existsSync(patternsDir)) fs.mkdirSync(patternsDir, { recursive: true });
                        const outPath = path.join(patternsDir, 'wallpaper.jpg');
                        fs.writeFileSync(outPath, buffer);
                        console.log('✅ Fallback JPG guardado: wallpaper.jpg');
                        
                        io.emit('newPatternReady', {
                            patternId: 'wallpaper',
                            filename: 'wallpaper.jpg',
                            timestamp: Date.now()
                        });
                        console.log('📢 Evento newPatternReady emitido (fallback)');
                    } catch (ef) {
                        console.error('❌ Fallback también falló al guardar JPG desde processed/processed.png:', ef.message);
                    }
                }

                // Notify all connected screens to update their display (using temp processed.png)
                io.emit('imageUpdated', { 
                    message: 'Nueva imagen aplicada directamente',
                    filename: 'processed.png',
                    timestamp: new Date().toISOString()
                });
                console.log('📢 Evento imageUpdated emitido para screens');

                socket.emit('processedImageApplied', { 
                    success: true, 
                    message: 'Imagen aplicada como nuevo patrón exitosamente',
                    appliedFile: 'processed.png',
                    patternSavedAs: 'wallpaper.jpg'
                });
                console.log('✅ Respuesta processedImageApplied enviada');

        } catch (error) {
            console.error('❌ Error applying processed image:', error);
            socket.emit('processedImageApplied', { success: false, message: 'Error al aplicar imagen procesada: ' + error.message });
        }
    });

    // Eliminado: saveWallpaper con nombres timestamped (siempre usaremos saveScreenCanvas -> wallpaper.jpg)

    // NUEVOS EVENTOS PARA EL PROCESO DE ACTUALIZACIÓN CON TECLA 'A'
    
    socket.on('reloadScreen', (data) => {
        try {
            const screenId = Number(data?.screenId) || 1;
            const forceProcessed = !!data?.forceProcessed;
            const captureAfterReload = !!data?.captureAfterReload;
            const delayMs = Math.max(0, Number(data?.delayMs) || 0);
            const captureDelayMs = Math.max(0, Number(data?.captureDelayMs) || 0); // soporte opcional (no usado ahora)
            const operationId = `reload-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
            console.log(`🔄 *** SERVER *** reloadScreen solicitado screen/${screenId} forceProcessed=${forceProcessed} captureAfterReload=${captureAfterReload} delayMs=${delayMs}`);
            const launch = () => {
                // Notify control clients start
                connectedClients.forEach(c => {
                    if (c.type === 'control' && c.socket.connected) {
                        c.socket.emit('screenReloadProgress', { phase:'start', screenId, operationId, captureAfterReload, forceProcessed, ts: Date.now() });
                    }
                });
                if (captureAfterReload) {
                    const fallback = setTimeout(() => {
                        console.warn(`⏰ *** SERVER *** Fallback sin screenReady para op ${operationId} – captura directa`);
                        connectedClients.forEach((c) => {
                            if (c.type === 'screen' && c.screenId === screenId && c.socket.connected) {
                                c.socket.emit('requestCanvasCapture');
                            }
                        });
                        pendingReloadOps.delete(operationId);
                    }, 10000);
                    pendingReloadOps.set(operationId, { screenId, timer: fallback, captureDelayMs });
                }
                io.emit('reloadRequestSync', { screenId, forceProcessed, operationId, captureAfterReload });
                console.log(`✅ *** CONFIRMACIÓN *** reloadRequestSync enviado a screen/${screenId} op=${operationId}`);
            };
            delayMs > 0 ? setTimeout(launch, delayMs) : launch();
        } catch (e) {
            console.error('❌ Error en reloadScreen:', e.message);
        }
    });

    // Handshake: recibir confirmación de screen listo tras recarga
    socket.on('screenReady', (data) => {
        try {
            const screenId = Number(data?.screenId) || 1;
            const op = data?.operationId || data?.op || null;
            console.log(`✅ *** SERVER *** screenReady recibido de screen/${screenId} op=${op || 'n/a'}`);
            connectedClients.forEach(c => {
                if (c.type === 'control' && c.socket.connected) {
                    c.socket.emit('screenReloadProgress', { phase:'screenReady', screenId, operationId: op, ts: Date.now() });
                }
            });
            if (op && pendingReloadOps.has(op)) {
                const entry = pendingReloadOps.get(op);
                if (entry?.timer) clearTimeout(entry.timer);
                pendingReloadOps.delete(op);
                // Captura inmediata tras screenReady (requerimiento actual: recargar primero, luego guardar)
                connectedClients.forEach((c) => {
                    if (c.type === 'screen' && c.screenId === screenId && c.socket.connected) {
                        c.socket.emit('requestCanvasCapture');
                        console.log('📸 *** SERVER *** requestCanvasCapture enviado tras screenReady (sin delay)');
                        connectedClients.forEach(cc => {
                            if (cc.type === 'control' && cc.socket.connected) {
                                cc.socket.emit('screenReloadProgress', { phase:'captureRequested', screenId, operationId: op, ts: Date.now() });
                            }
                        });
                    }
                });
            } else if (!op && screenId === 1) {
                connectedClients.forEach((c) => {
                    if (c.type === 'screen' && c.screenId === 1 && c.socket.connected) {
                        c.socket.emit('requestCanvasCapture');
                        console.log('📸 *** SERVER *** requestCanvasCapture (compat)');
                        connectedClients.forEach(cc => {
                            if (cc.type === 'control' && cc.socket.connected) {
                                cc.socket.emit('screenReloadProgress', { phase:'captureRequested', screenId, operationId: op, ts: Date.now() });
                            }
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('⚠️ Error manejando screenReady:', e.message);
        }
    });

    // NUEVO: Eventos para el gestor robusto de sincronización de imágenes
    socket.on('continueWithWallpaperColoring', () => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'screen') {
            console.log('🎨 *** SERVER *** Continuando secuencia de coloreado con wallpaper');
            
            // Emitir a todos los brush-reveal para que cambien a modo wallpaper
            connectedClients.forEach((otherClient) => {
                if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                    otherClient.socket.emit('switchToWallpaperMode', {
                        timestamp: Date.now(),
                        source: 'screen-sequence',
                        sequenceId: imageProcessingState.pendingOperation?.id || `seq-${Date.now()}`
                    });
                }
            });
            
            // Programar regreso a secuencia después de 2 minutos
            if (sequenceReturnTimeoutId) {
                clearTimeout(sequenceReturnTimeoutId);
            }
            
            sequenceReturnTimeoutId = setTimeout(() => {
                console.log('⏰ *** SERVER *** Tiempo cumplido - regresando a secuencia de coloreado');
                connectedClients.forEach((otherClient) => {
                    if (otherClient.type === 'brush-reveal' && otherClient.socket.connected) {
                        otherClient.socket.emit('returnToSequenceMode', {
                            timestamp: Date.now()
                        });
                    }
                });
            }, 120000); // 2 minutos
        }
    });

    socket.on('imageValidationRequest', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'screen') {
            console.log(`🔍 *** SERVER *** Validación de imagen solicitada para pantalla ${data.screenId}`);
            
            // Aquí se podría implementar validación adicional
            // Por ahora, simplemente confirmamos que la imagen está disponible
            const processedPath = path.join(__dirname, 'processed', 'processed.png');
            const exists = fs.existsSync(processedPath);
            
            socket.emit('imageValidationResult', {
                screenId: data.screenId,
                valid: exists,
                timestamp: Date.now(),
                path: exists ? processedPath : null
            });
        }
    });

    socket.on('saveAsWallpaper', async () => {
        try {
            console.log('💾 *** SERVER *** Iniciando guardado como wallpaper.jpg...');
            
            // Leer processed.png
            const processedPath = path.join(__dirname, 'processed', 'processed.png');
            if (!fs.existsSync(processedPath)) {
                console.error('❌ processed.png no existe');
                socket.emit('wallpaperSaved', { success: false, error: 'processed.png no encontrado' });
                return;
            }

            // Copiar processed.png a patterns/wallpaper.jpg
            const wallpaperPath = path.join(__dirname, 'patterns', 'wallpaper.jpg');
            fs.copyFileSync(processedPath, wallpaperPath);
            
            console.log('✅ *** CONFIRMACIÓN *** wallpaper.jpg guardado exitosamente desde processed.png');
            socket.emit('wallpaperSaved', { 
                success: true, 
                message: 'wallpaper.jpg guardado desde processed.png',
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('❌ Error guardando wallpaper.jpg:', error);
            socket.emit('wallpaperSaved', { success: false, error: error.message });
        }
    });

    socket.on('activateBrushRevealColoring', () => {
        console.log('🎨 *** SERVER *** Activando coloreo en todos los brush-reveals...');
        console.log('📊 *** SERVER *** Clientes conectados:', connectedClients.size);
        
        // Enviar comando a todos los brush-reveals para que inicien coloreo con la nueva imagen
        const payload = {
            patternId: `wallpaper_${Date.now()}`,
            filename: 'wallpaper.jpg',
            timestamp: Date.now()
        };
        
        io.emit('newPatternReady', payload);
        console.log('📡 *** SERVER *** newPatternReady emitido:', payload);
        
        console.log('✅ *** CONFIRMACIÓN *** Comando de coloreo enviado a todos los brush-reveals');
        socket.emit('brushRevealColoringActivated', {
            success: true,
            message: 'Coloreo activado en todos los brush-reveals',
            timestamp: Date.now()
        });
    });

    // NUEVO: Manejar notificación de animación completada desde brush-reveal
    socket.on('animationCompleted', (data) => {
        console.log(`✅ *** SERVER *** Animación completada recibida de brush ${data.brushId}`);
        // Retransmitir a todos los clientes de control
        connectedClients.forEach((client) => {
            if (client.type === 'control') {
                client.socket.emit('animationCompleted', data);
                console.log(`📡 *** SERVER *** animationCompleted reenviado a control`);
            }
        });
    });

    socket.on('disconnect', () => {
        connectedClients.delete(socket.id);
        console.log('Client disconnected:', socket.id);
    });
});

// Función para generar la imagen del patrón - OPTIMIZADA
async function generatePatternImage(uniqueId = 'pattern', opts = {}) {
    console.log('⚡ INICIANDO generatePatternImage - MODO OPTIMIZADO');
    const startTime = Date.now();
    
    const width = 2160;
    const height = 3840;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fondo blanco inmediato
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Cargar la imagen principal del patrón (usar processed/processed.png o la imagen seleccionada)
    try {
    const patternPath = path.join(__dirname, 'processed', 'processed.png');
    const selectedForThisSave = opts.selectedImage || globalState.general.selectedImage;
    const selectedImagePath = path.join(__dirname, `${selectedForThisSave}.png`);
        
        // Usar processed/processed.png si existe, si no usar la imagen seleccionada
        let imageToLoad = patternPath;
        if (!fs.existsSync(patternPath)) {
            console.log(`processed.png no existe, usando ${selectedForThisSave}.png como imagen base`);
            imageToLoad = selectedImagePath;
        }
        
        console.log(`⚡ Cargando imagen: ${imageToLoad}`);
        const patternImage = await loadImage(imageToLoad);
        console.log(`⚡ Imagen cargada en ${Date.now() - startTime}ms`);
        
        // Configuración del patrón - ULTRA-REDUCIDA para velocidad extrema
        const config = globalState.general;
        let repX = Math.min(parseInt(config.repetitionX || 20), 20); // Límite ultra-agresivo para velocidad
        let repY = Math.min(parseInt(config.repetitionY || 8), 8); // Límite ultra-agresivo para velocidad
        const maxElements = repX * repY;
        if (maxElements > 120) { // Límite total de elementos ULTRA-AGRESIVO para velocidad extrema
            const ratio = Math.sqrt(120 / maxElements);
            repX = Math.floor(repX * ratio);
            repY = Math.floor(repY * ratio);
            console.log(`⚡ LÍMITE VELOCIDAD EXTREMA: Reducido a ${repX}x${repY} = ${repX*repY} elementos`);
        }
        const size = parseInt(config.patternSize || 245);
        const dpr = 1; // Equivalente al device pixel ratio
        const rotationVal = parseInt(config.rotation || 0);
        
        // Sin offset de pantalla (guardamos como imagen única)
        const offsetXVal = 0;
        
        console.log(`⚡ Configuración: ${repX}x${repY} repeticiones, tamaño ${size}px`);
        
        // CAMBIO IMPORTANTE: Usar spacing fijo basado en el tamaño del patrón
        // No dependiente del tamaño de la ventana para que todas las pantallas sean iguales
        const spacingX = size * 1.5; // Spacing fijo basado en tamaño del patrón
        const spacingY = size * 1.2; // Spacing fijo basado en tamaño del patrón
        
        // Calcular dimensiones de la imagen base manteniendo aspect ratio
        const imgAspect = patternImage.width / patternImage.height;
        let baseWidth = size * dpr;
        let baseHeight = size * dpr;
        if (imgAspect > 1) baseHeight = baseWidth / imgAspect;
        else baseWidth = baseHeight * imgAspect;

        // Limpiar canvas
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        
        // Color de fondo
        ctx.fillStyle = config.backgroundColor || '#F5DDC7';
        ctx.fillRect(0, 0, width, height);

        // Inicializar tiempo de render
        const renderStartTime = Date.now();

        // Solo dibujar si el wallpaper está activo (replicando la lógica de screen.html)
        if (globalState.wallpaper?.isActive) {
            // Efectos globales
            ctx.globalCompositeOperation = config.blendMode || 'multiply';

            // Transformaciones globales (igual que screen.html)
            ctx.translate(width / 2, height / 2);
            const zoomVal = parseFloat(config.zoom || 1.2);
            ctx.scale(zoomVal, zoomVal);
            if (config.patternType === 'diamond') {
                ctx.rotate(Math.PI / 4);
            }
            ctx.translate(-width / 2, -height / 2);

            let counter = 0;

            // SISTEMA ULTRA-OPTIMIZADO: Mínimos elementos para velocidad extrema
            const totalSystemWidth = 6480; // Reducido drásticamente 
            const totalSystemHeight = 3840;  // Alto de una pantalla
            
            // Calcular elementos necesarios - ULTRA-REDUCIDOS para velocidad extrema
            const elementsX = Math.min(Math.ceil((totalSystemWidth + spacingX * 3) / spacingX), 20); // Máximo 20
            const elementsY = Math.min(Math.ceil((totalSystemHeight + spacingY * 1) / spacingY), 8); // Máximo 8
            
            console.log(`⚡ Generando ${elementsX}x${elementsY} = ${elementsX * elementsY} elementos (ULTRA-OPTIMIZADO)`);
            
            // Punto de inicio optimizado
            const startX = -totalSystemWidth / 8; // Más reducido
            const startY = -spacingY / 2; // Más reducido

            // Generar el patrón principal - ULTRA OPTIMIZADO
            for (let j = 0; j < elementsY; j++) {
                for (let i = 0; i < elementsX; i++) {
                    let x, y, instRotation = rotationVal, scaleMod = 1;

                    // OPTIMIZACIÓN EXTREMA: Solo grid simple para máxima velocidad
                    x = startX + i * spacingX;
                    y = startY + j * spacingY;
                    
                    // Solo brick si es absolutamente necesario (patrón más simple)
                    if (config.patternType === 'brick') {
                        x += (j % 2 === 1 ? spacingX * 0.5 : 0);
                    }
                    
                    // Aplicar offset de pantalla (0 para imagen única)
                    x += offsetXVal;
                    
                    // Dibujar imagen principal (idéntico a screen.html)
                    ctx.save();
                    ctx.translate(x + baseWidth / 2, y + baseHeight / 2);
                    ctx.rotate((instRotation * Math.PI) / 180);
                    ctx.scale(scaleMod, scaleMod);
                    ctx.drawImage(patternImage, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
                    ctx.restore();

                    counter++;
                }
            }
        } else {
            console.log('Wallpaper no está activo - guardando solo color de fondo');
        }
        
        // Dibujar las 8 imágenes de perfume usando la imagen seleccionada para ESTA operación
        try {
            const selectedImagePath = path.join(__dirname, `${selectedForThisSave}.png`);
            if (fs.existsSync(selectedImagePath)) {
                const perfumeImg = await loadImage(selectedImagePath);

                const spacingFactorH = parseFloat(config.perfumeSpacingH || 1.0);
                const spacingFactorV = parseFloat(config.perfumeSpacingV || 1.0);
                const sizeFactor = parseFloat(config.perfumeSizeFactor || 1.0);

                const baseMaxSize = Math.min(width, height) * 0.17;
                const maxSize = baseMaxSize * sizeFactor;
                const sPerf = Math.min(maxSize / perfumeImg.width, maxSize / perfumeImg.height);
                const pdw = Math.ceil(perfumeImg.width * sPerf);
                const pdh = Math.ceil(perfumeImg.height * sPerf);

                const centerX = width / 2;
                const centerY = height / 2;
                const spacingH = Math.min(width, height) * 0.25 * spacingFactorH;
                const spacingV = Math.min(width, height) * 0.2 * spacingFactorV;

                const positions = [
                    { x: centerX - spacingH * 1.2, y: centerY - spacingV * 2 },
                    { x: centerX + spacingH * 1.2, y: centerY - spacingV * 2 },
                    { x: centerX, y: centerY - spacingV },
                    { x: centerX - spacingH * 1.4, y: centerY },
                    { x: centerX + spacingH * 1.4, y: centerY },
                    { x: centerX, y: centerY + spacingV },
                    { x: centerX - spacingH * 1.2, y: centerY + spacingV * 2 },
                    { x: centerX + spacingH * 1.2, y: centerY + spacingV * 2 }
                ];

                for (let p = 0; p < positions.length; p++) {
                    const pos = positions[p];
                    const dx = pos.x - pdw / 2;
                    const dy = pos.y - pdh / 2;
                    ctx.save();
                    ctx.drawImage(perfumeImg, dx, dy, pdw, pdh);
                    ctx.restore();
                }
            }
        } catch (e) {
            console.warn('Error dibujando perfume positions', e);
        }

        ctx.restore();

        console.log(`⚡ Render completado en ${Date.now() - renderStartTime}ms`);

        // Guardar siempre como wallpaper.jpg - OPTIMIZADO
        const saveStartTime = Date.now();
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 }); // Calidad reducida para velocidad
        const outputPath = path.join(__dirname, 'patterns', 'wallpaper.jpg');
        fs.writeFileSync(outputPath, buffer);
        
        console.log(`⚡ Archivo guardado en ${Date.now() - saveStartTime}ms`);
        console.log(`⚡ TOTAL generatePatternImage: ${Date.now() - startTime}ms`);
        console.log('Patrón guardado en:', outputPath);
        console.log('Estado del wallpaper al guardar:', globalState.wallpaper?.isActive ? 'ACTIVO' : 'INACTIVO');
        
    } catch (error) {
        console.error('Error generating pattern image:', error);
        throw error;
    }
}

// Al iniciar, limpiar processed/ dejando solo processed.png
cleanProcessedDirExceptPattern();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Wallpaper Server running on http://localhost:${PORT}`);
    console.log(`📱 Control Panel: http://localhost:${PORT}/control`);
    console.log(`🖥️  Screen 1-9: http://localhost:${PORT}/screen/[1-9]`);
});
