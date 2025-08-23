const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos
app.use(express.static(__dirname));
app.use('/sinperfume.png', express.static(path.join(__dirname, 'sinperfume.png')));
app.use('/patterns', express.static(path.join(__dirname, 'patterns')));
app.use(express.json());

// Estado global del sistema
let globalState = {
    // Configuración general (aplicada a todas las pantallas)
    general: {
    patternType: 'organic-complex',
    repetitionX: 13,
    repetitionY: 12,
    patternSize: 300,
    rotation: 0,
        zoom: 2.3,
        blendMode: 'multiply',
        perfumeSpacingH: 0.45,
        perfumeSpacingV: 0.7,
        perfumeSizeFactor: 0.85,
    backgroundColor: '#F5DDC7'
    },
    // Configuración específica de cada pantalla (solo offset horizontal)
    screens: {
        1: { offsetX: -50 },
        2: { offsetX: -30 },
        3: { offsetX: -10 },
        4: { offsetX: 10 },
        5: { offsetX: 30 },
        6: { offsetX: 50 },
        7: { offsetX: 70 },
        8: { offsetX: 90 },
        9: { offsetX: 110 }
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
    res.sendFile(path.join(__dirname, 'wallpaper-animated.html'));
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

// New: screen-reveal pages (1..9)
app.get('/screen-reveal/:id', (req, res) => {
    const screenId = req.params.id;
    if (screenId >= 1 && screenId <= 9) {
        res.sendFile(path.join(__dirname, 'screen-reveal.html'));
    } else {
        res.status(404).send('Screen-reveal ID must be between 1 and 9');
    }
});

// New: pattern-reveal page  
app.get('/pattern-reveal', (req, res) => {
    res.sendFile(path.join(__dirname, 'pattern-reveal.html'));
});

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
    const screenId = req.params.id;
    if (screenId >= 1 && screenId <= 9) {
        globalState.screens[screenId] = { ...globalState.screens[screenId], ...req.body };
        io.emit('screenConfigUpdate', { screenId, config: globalState.screens[screenId] });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Screen ID must be between 1 and 9' });
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
        const { screenId, type } = data;
        connectedClients.set(socket.id, { screenId, type, socket });
        
        // Enviar estado inicial
        socket.emit('initialState', {
            general: globalState.general,
            screen: globalState.screens[screenId] || {},
            animation: globalState.animation,
            wallpaper: globalState.wallpaper
        });
        
        console.log(`${type} registered with screen ID: ${screenId}`);
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

    socket.on('savePattern', async (data) => {
        const client = connectedClients.get(socket.id);
        if (client && client.type === 'control') {
            try {
                await generatePatternImage();
                socket.emit('patternSaved', { success: true, message: 'Patrón guardado como pattern.jpg' });
            } catch (error) {
                console.error('Error saving pattern:', error);
                socket.emit('patternSaved', { success: false, message: 'Error al guardar el patrón' });
            }
        }
    });

    socket.on('disconnect', () => {
        connectedClients.delete(socket.id);
        console.log('Client disconnected:', socket.id);
    });
});

// Función para generar la imagen del patrón
async function generatePatternImage() {
    const width = 2160;
    const height = 3840;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Cargar la imagen principal del patrón (usar la misma que /screen: sinperfume.png)
    try {
        const patternImage = await loadImage(path.join(__dirname, 'sinperfume.png'));
        
        // Configuración del patrón (usando la imagen pattern.jpg)
        const config = globalState.general;
        const repX = parseInt(config.repetitionX || 10);
        const repY = parseInt(config.repetitionY || 8);
        const size = parseInt(config.patternSize || 245);
        const dpr = 1; // Equivalente al device pixel ratio
        const rotationVal = parseInt(config.rotation || 0);
        
        // Sin offset de pantalla (guardamos como imagen única)
        const offsetXVal = 0;
        
        const spacingX = width / repX;
        const spacingY = height / repY;
        
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

            // Generar el patrón principal (exactamente igual que screen.html)
            for (let j = 0; j < repY; j++) {
                for (let i = 0; i < repX; i++) {
                    let x, y, instRotation = rotationVal, scaleMod = 1;

                    // Calcular posición según el tipo de patrón (idéntico a screen.html)
                    switch (config.patternType) {
                        case 'grid':
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'brick':
                            x = i * spacingX + (j % 2 === 1 ? spacingX * 0.5 : 0);
                            y = j * spacingY;
                            break;
                        case 'hexagon':
                            x = i * spacingX + (j % 2 === 1 ? spacingX * 0.5 : 0);
                            y = j * spacingY * 0.866;
                            break;
                        case 'diamond':
                            x = i * spacingX + (j % 2 === 1 ? spacingX * 0.5 : 0);
                            y = j * spacingY * 0.8;
                            break;
                        case 'mirror-horizontal':
                            if (i % 2 !== 0) instRotation += 180;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'mirror-vertical':
                            if (j % 2 !== 0) instRotation += 180;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'mirror-both':
                            if (i % 2 !== 0) instRotation += 180;
                            if (j % 2 !== 0) instRotation += 180;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'rotate-90':
                            instRotation += (counter % 4) * 90;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'rotate-180':
                            if (counter % 2 !== 0) instRotation += 180;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'rotate-mixed':
                            instRotation += [0, 90, 270, 180][counter % 4];
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'scale-varied':
                            scaleMod = [1, 0.6, 1.4, 0.8][counter % 4];
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'alternating-scale':
                            const scaleDiff = parseFloat(config.scaleDifference || 1.5);
                            scaleMod = (counter % 2 === 0) ? 1 : scaleDiff;
                            x = i * spacingX;
                            y = j * spacingY;
                            break;
                        case 'organic-complex':
                            // Patrón orgánico complejo (idéntico a screen.html)
                            const patterns = [
                                { offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
                                { offsetX: spacingX * 0.3, offsetY: spacingY * 0.2, rotation: 180, scale: 0.8 },
                                { offsetX: -spacingX * 0.1, offsetY: spacingY * 0.4, rotation: 90, scale: 1.2 },
                                { offsetX: spacingX * 0.2, offsetY: -spacingY * 0.1, rotation: 270, scale: 0.9 },
                                { offsetX: -spacingX * 0.2, offsetY: -spacingY * 0.3, rotation: 45, scale: 1.1 },
                                { offsetX: spacingX * 0.4, offsetY: spacingY * 0.1, rotation: 135, scale: 0.7 }
                            ];
                            const patternIndex = counter % patterns.length;
                            const pattern = patterns[patternIndex];
                            
                            // Agregar variación adicional basada en la posición de la fila/columna
                            const rowVariation = (j % 3) * spacingX * 0.15;
                            const colVariation = (i % 2) * spacingY * 0.1;
                            
                            x = i * spacingX + pattern.offsetX + rowVariation;
                            y = j * spacingY + pattern.offsetY + colVariation;
                            instRotation += pattern.rotation;
                            scaleMod = pattern.scale;
                            break;
                        default:
                            x = i * spacingX;
                            y = j * spacingY;
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
        
        // Dibujar las 8 imágenes de perfume igual que en screen.html si existe perfume.png
        try {
            const perfumePath = path.join(__dirname, 'perfume.png');
            if (fs.existsSync(perfumePath)) {
                const perfumeImg = await loadImage(perfumePath);

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

        // Guardar la imagen
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        const outputPath = path.join(__dirname, 'patterns', 'pattern.jpg');
        fs.writeFileSync(outputPath, buffer);
        
        console.log('Patrón guardado en:', outputPath);
        console.log('Estado del wallpaper al guardar:', globalState.wallpaper?.isActive ? 'ACTIVO' : 'INACTIVO');
        
    } catch (error) {
        console.error('Error generating pattern image:', error);
        throw error;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Wallpaper Server running on http://localhost:${PORT}`);
    console.log(`📱 Control Panel: http://localhost:${PORT}/control`);
    console.log(`🖥️  Screen 1-9: http://localhost:${PORT}/screen/[1-9]`);
});
