const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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
app.use(express.json());

// Estado global del sistema
let globalState = {
    // Configuración general (aplicada a todas las pantallas)
    general: {
        patternType: 'brick',
        repetitionX: 10,
        repetitionY: 8,
        patternSize: 245,
        opacity: 100,
        rotation: 0,
        zoom: 1.2,
        blendMode: 'multiply',
        backgroundColor: '#ffffff',
        animationSpeed: 800
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
        isActive: false // Nuevo estado para controlar si el wallpaper está visible
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

    socket.on('disconnect', () => {
        connectedClients.delete(socket.id);
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Wallpaper Server running on http://localhost:${PORT}`);
    console.log(`📱 Control Panel: http://localhost:${PORT}/control`);
    console.log(`🖥️  Screen 1-9: http://localhost:${PORT}/screen/[1-9]`);
});
