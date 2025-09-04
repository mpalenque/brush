/**
 * WebSocket Manager Module
 * Módulo común para manejar conexiones WebSocket y eliminar duplicación
 */

class WebSocketManager {
    constructor(config = {}) {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
        this.reconnectDelay = config.reconnectDelay || 1000;
        this.timeout = config.timeout || 5000;
        this.listeners = new Map();
        this.onConnectionChange = config.onConnectionChange || (() => {});
        this.onReconnect = config.onReconnect || (() => {});
    }

    /**
     * Inicializar conexión WebSocket
     */
    connect() {
        if (typeof io === 'undefined') {
            console.error('Socket.IO no está disponible');
            return false;
        }

        this.socket = io({
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: this.reconnectDelay,
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: this.timeout
        });

        this.setupEventListeners();
        return true;
    }

    /**
     * Configurar listeners básicos de conexión
     */
    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('🔌 WebSocket conectado');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.onConnectionChange(true);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket desconectado:', reason);
            this.isConnected = false;
            this.onConnectionChange(false);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔌 WebSocket reconectado después de', attemptNumber, 'intentos');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.onReconnect();
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            this.reconnectAttempts = attemptNumber;
            console.log('🔄 Intento de reconexión', attemptNumber);
        });

        this.socket.on('reconnect_failed', () => {
            console.error('❌ Falló la reconexión después de', this.maxReconnectAttempts, 'intentos');
        });
    }

    /**
     * Registrar un listener para un evento
     */
    on(event, callback) {
        if (!this.socket) {
            console.warn('WebSocket no inicializado');
            return;
        }
        
        this.socket.on(event, callback);
        
        // Almacenar listeners para poder re-registrarlos después de reconexión
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Emitir un evento
     */
    emit(event, data) {
        if (!this.socket || !this.isConnected) {
            console.warn('WebSocket no disponible para emitir:', event);
            return false;
        }
        
        this.socket.emit(event, data);
        return true;
    }

    /**
     * Registrar pantalla con el servidor
     */
    registerScreen(screenData) {
        return this.emit('registerScreen', screenData);
    }

    /**
     * Obtener el socket actual (para compatibilidad con código existente)
     */
    getSocket() {
        return this.socket;
    }

    /**
     * Verificar si está conectado
     */
    isConnectionActive() {
        return this.isConnected && this.socket && this.socket.connected;
    }

    /**
     * Re-registrar todos los listeners después de reconexión
     */
    reregisterListeners() {
        this.listeners.forEach((callbacks, event) => {
            callbacks.forEach(callback => {
                this.socket.on(event, callback);
            });
        });
    }

    /**
     * Destruir la conexión
     */
    destroy() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.listeners.clear();
    }
}

// Exportar para uso en diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
} else {
    window.WebSocketManager = WebSocketManager;
}
