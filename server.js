const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

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

// Servir archivos estáticos
app.use(express.static(__dirname));
app.use('/patterns', express.static(path.join(__dirname, 'patterns')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));
app.use('/captura', express.static(path.join(__dirname, 'captura')));

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

// Estado global del sistema - CON OFFSETS MANUALES
let globalState = {
    // Configuración general (aplicada a todas las pantallas)
    general: {
        patternType: 'organic-complex',
        repetitionX: 200,        // Aumentado a 200 para mayor extensión
        repetitionY: 8,
        patternSize: 300,
        separationX: 300,        // Solo separación horizontal configurable
        separationY: 300,        // Separación vertical
        spacingX: 0,             // Espaciado adicional X entre repeticiones
        spacingY: 0,             // Espaciado adicional Y entre repeticiones
        rotation: 0,
        zoom: 2.3,
        blendMode: 'multiply',
        perfumeSpacingH: 0.45,
        perfumeSpacingV: 0.7,
        perfumeSizeFactor: 0.85,
        backgroundColor: '#F5DDC7',
        selectedImage: 'red', // Imagen seleccionada: red, pink, o blue
        // NUEVO: Fuente del patrón para las screens
        // 'processed' usa /processed/processed.png (actualizado con tecla 9)
        // 'rojo' | 'azul' | 'amarillo' usan /rojo.png, /azul.png, /amarillo.png
        patternSource: 'processed',
        // Configuración de imágenes superpuestas
        overlayImages: {
            countX: 3,              // Cantidad en eje X
            countY: 2,              // Cantidad en eje Y  
            offsetX: 0,             // Offset horizontal global
            offsetY: 0,             // Offset vertical global
            size: 200,              // Tamaño de las imágenes
            spacingX: 800,          // Espaciado entre imágenes en X
            spacingY: 600,          // Espaciado entre imágenes en Y
            rowOffsetX: 0,          // Desfase de filas en X
            rowOffsetY: 0,          // Desfase de filas en Y
            colOffsetX: 0,          // Desfase de columnas en X
            colOffsetY: 0,          // Desfase de columnas en Y
            alternateRowX: 0,       // Desfase filas intercaladas en X
            alternateRowY: 0,       // Desfase filas intercaladas en Y
            alternateColX: 0,       // Desfase columnas intercaladas en X
            alternateColY: 0        // Desfase columnas intercaladas en Y
        }
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

// Alias de imágenes en español para compatibilidad con UI

// API endpoints
app.get('/api/state', (req, res) => {
    res.json(globalState);
});

app.post('/api/general', (req, res) => {
    globalState.general = { ...globalState.general, ...req.body };
    io.emit('generalConfigUpdate', globalState.general);
    res.json({ success: true });
});

app.post('/api/screen/:id', (req, res) => {
    const screenId = parseInt(req.params.id);
    if (screenId >= 1 && screenId <= 9) {
        globalState.screens[screenId] = { ...globalState.screens[screenId], ...req.body };
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
        io.emit('brushRevealConfigUpdate', { brushId, config: globalState.brushReveal[brushId] });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Brush reveal ID must be between 1 and 9' });
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
            globalState.general = { ...globalState.general, ...config };
            io.emit('generalConfigUpdate', globalState.general);
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
            console.log(`🧩 patternSource cambiado a: ${src}`);
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
                console.log(`🖼️ Imagen seleccionada: ${image}.png`);
                // Notificar a todos los clientes sobre el cambio
                io.emit('imageSelected', { image });
            }
        }
    });

    // NUEVO: Manejar rotación automática de imágenes para brush-reveal
    socket.on('brushRevealRotateImage', (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            console.log(`🎨 *** SERVER *** Retransmitiendo rotación automática: ${data.imageName} (${data.imageType})`);
            console.log(`📡 *** SERVER *** Datos del evento:`, data);
            // Retransmitir el evento a todos los brush-reveal conectados
            io.emit('brushRevealRotateImage', data);
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
    // STEP 1: Save OpenCV processed image to temp folder
    // ========================================
    socket.on('saveProcessedImage', async (data) => {
        console.log('📥 PASO 1: Recibiendo imagen procesada por OpenCV...');
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
            
            // Guardar como JPG con método atómico
            const tempFilename = `wallpaper_temp_${Date.now()}.jpg`;
            const tempPath = path.join(patternsDir, tempFilename);
            const finalPath = path.join(patternsDir, filename);
            
            const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
            
            console.log(`💾 Buffer JPG generado: ${jpgBuffer.length} bytes`);
            
            // Escribir archivo temporal
            fs.writeFileSync(tempPath, jpgBuffer);
            console.log(`📝 Archivo temporal creado: ${tempFilename}`);
            
            // Operación atómica: eliminar archivo anterior y renombrar
            if (fs.existsSync(finalPath)) {
                fs.unlinkSync(finalPath);
                console.log(`🗑️ Archivo anterior eliminado: ${filename}`);
            }
            
            fs.renameSync(tempPath, finalPath);
            console.log(`✅ Canvas completo guardado: ${filename}`);
            console.log(`📐 Dimensiones finales: ${img.width}x${img.height}`);
            
            // Verificar el archivo guardado
            const stats = fs.statSync(finalPath);
            const timestamp = new Date().toISOString();
            console.log(`📊 Archivo verificado - Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
            console.log(`⏰ Timestamp de guardado: ${timestamp}`);
            
            // SOLO enviar newPatternReady - NO imageUpdated para evitar eventos duplicados
            io.emit('newPatternReady', {
                patternId: 'wallpaper',
                filename: filename,
                timestamp: Date.now()
            });
            
            console.log('📢 Evento newPatternReady enviado para brush-reveal (SIN duplicar imageUpdated)');
            
            console.log('📢 Evento newPatternReady emitido (desde canvas completo)');
            
            socket.emit('canvasSaved', {
                success: true,
                filename: filename,
                timestamp: timestamp,
                fileSize: stats.size,
                filePath: finalPath
            });
            
        } catch (error) {
            console.error('❌ Error guardando canvas:', error);
            socket.emit('canvasSaved', {
                success: false,
                error: error.message
            });
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

    // Manejar guardado de wallpaper desde screen.html
    socket.on('saveWallpaper', (data) => {
        try {
            console.log('💾 Guardando wallpaper desde screen.html...');
            
            if (!data.imageData) {
                console.error('❌ No hay datos de imagen para guardar');
                return;
            }
            
            // Decodificar la imagen base64
            const base64Data = data.imageData.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Guardar en la carpeta patterns
            const filename = `wallpaper_3screens_${data.timestamp || Date.now()}.png`;
            const outputPath = path.join(__dirname, 'patterns', filename);
            
            fs.writeFileSync(outputPath, imageBuffer);
            console.log(`✅ Wallpaper de 3 pantallas guardado: ${filename}`);
            
        } catch (error) {
            console.error('❌ Error guardando wallpaper:', error);
        }
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
