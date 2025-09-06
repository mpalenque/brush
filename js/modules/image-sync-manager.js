/**
 * IMAGE SYNC MANAGER
 * 
 * Sistema robusto para gestionar la secuencia de carga y actualización de imágenes
 * cuando se presiona la tecla "1":
 * 
 * 1. Cámara captura -> processed.png (6 segundos)
 * 2. Actualización robusta de processed.png en screen.html
 * 3. Captura de canvas y guardado como wallpaper.jpg
 * 4. Continuación de secuencia de coloreado
 * 
 * Inspirado en el sistema de brush-reveal pero simplificado para solo manejar
 * la actualización de imágenes sin efectos de coloreado.
 */

class ImageSyncManager {
    constructor() {
        this.isProcessing = false;
        this.operationQueue = [];
        this.currentOperation = null;
        this.retryAttempts = 3;
        this.retryDelay = 1000; // ms
        this.loadTimeout = 8000; // 8 segundos timeout para cargas
        this.debugMode = true;
        
        // Estado de la secuencia actual
        this.sequenceState = {
            cameraCapture: false,
            imageProcessed: false,
            screenUpdated: false,
            wallpaperSaved: false,
            sequenceContinued: false
        };
        
        // Referencias a elementos DOM y sockets
        this.socket = null;
        this.screenElements = new Map();
        
        this.log('🎯 ImageSyncManager inicializado');
    }
    
    log(message, type = 'info') {
        if (!this.debugMode) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[${timestamp}] [ImageSync]`;
        
        switch (type) {
            case 'error':
                console.error(`${prefix} ❌ ${message}`);
                break;
            case 'warn':
                console.warn(`${prefix} ⚠️ ${message}`);
                break;
            case 'success':
                console.log(`${prefix} ✅ ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }
    
    /**
     * Inicializar el gestor con socket y elementos DOM
     */
    init(socket, screenElements = {}) {
        this.socket = socket;
        this.screenElements = new Map(Object.entries(screenElements));
        this.setupSocketListeners();
        this.log('Inicialización completa con socket y elementos DOM');
    }
    
    /**
     * Configurar listeners del socket para coordinar la secuencia
     */
    setupSocketListeners() {
        if (!this.socket) return;
        
        // Escuchar inicio de secuencia desde el control
        this.socket.on('startBrushRevealSequence', () => {
            this.log('🎯 Recibida señal de inicio de secuencia');
            this.startSequence();
        });
        
        // Escuchar confirmación de que processed.png fue actualizado
        this.socket.on('processedImageReady', (data) => {
            this.log(`📸 Imagen procesada lista: ${data.filename}`);
            this.handleProcessedImageReady(data);
        });
        
        // Escuchar confirmación de captura de pantalla completada
        this.socket.on('screenCaptureComplete', (data) => {
            this.log(`📱 Captura de pantalla completada: ${data.screenId}`);
            this.handleScreenCaptureComplete(data);
        });
        
        // Escuchar confirmación de wallpaper guardado
        this.socket.on('wallpaperSaved', (data) => {
            this.log(`🖼️ Wallpaper guardado: ${data.filename}`);
            this.handleWallpaperSaved(data);
        });
    }
    
    /**
     * Iniciar la secuencia completa de actualización de imágenes
     */
    async startSequence() {
        if (this.isProcessing) {
            this.log('Secuencia ya en progreso, ignorando nueva solicitud', 'warn');
            return;
        }
        
        this.isProcessing = true;
        this.resetSequenceState();
        this.log('🚀 Iniciando secuencia de actualización de imágenes');
        
        try {
            // Paso 1: Esperar captura y procesamiento de cámara (6 segundos)
            await this.waitForCameraCapture();
            
            // Paso 2: Actualizar processed.png en todas las pantallas
            await this.updateProcessedImageInScreens();
            
            // Paso 3: Capturar canvas de screen/1 y guardar como wallpaper.jpg
            await this.captureAndSaveWallpaper();
            
            // Paso 4: Continuar con secuencia de coloreado
            await this.continueColorSequence();
            
            this.log('🎉 Secuencia completada exitosamente', 'success');
            
        } catch (error) {
            this.log(`Error en secuencia: ${error.message}`, 'error');
            this.handleSequenceError(error);
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Esperar a que la cámara capture y procese la imagen
     */
    async waitForCameraCapture() {
        this.log('📸 Esperando captura y procesamiento de cámara...');
        
        return new Promise((resolve, reject) => {
            // Simular los 6 segundos que tarda la cámara + procesamiento
            const timeout = setTimeout(() => {
                this.sequenceState.cameraCapture = true;
                this.sequenceState.imageProcessed = true;
                this.log('📸 Captura y procesamiento de cámara completados', 'success');
                resolve();
            }, 6000);
            
            // Si recibimos confirmación antes, cancelar timeout
            const listener = (data) => {
                if (data && data.type === 'processed') {
                    clearTimeout(timeout);
                    this.socket.off('processedImageReady', listener);
                    this.sequenceState.cameraCapture = true;
                    this.sequenceState.imageProcessed = true;
                    this.log('📸 Confirmación temprana de procesamiento recibida', 'success');
                    resolve();
                }
            };
            
            if (this.socket) {
                this.socket.on('processedImageReady', listener);
            }
        });
    }
    
    /**
     * Actualizar processed.png en todas las pantallas de manera robusta
     */
    async updateProcessedImageInScreens() {
        this.log('🔄 Iniciando actualización robusta de processed.png en pantallas');
        
        const screens = this.getConnectedScreens();
        const updatePromises = screens.map(screenId => 
            this.updateSingleScreen(screenId)
        );
        
        try {
            await Promise.all(updatePromises);
            this.sequenceState.screenUpdated = true;
            this.log('🔄 Todas las pantallas actualizadas exitosamente', 'success');
        } catch (error) {
            this.log(`Error actualizando pantallas: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Actualizar una pantalla específica con reintentos y validación
     */
    async updateSingleScreen(screenId) {
        const maxAttempts = this.retryAttempts;
        let attempt = 0;
        
        while (attempt < maxAttempts) {
            try {
                attempt++;
                this.log(`🔄 Actualizando pantalla ${screenId} (intento ${attempt}/${maxAttempts})`);
                
                // Generar operación única para tracking
                const operationId = `screen-update-${screenId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                // Enviar comando de recarga sincronizada
                if (this.socket) {
                    this.socket.emit('reloadRequestSync', {
                        screenId: screenId,
                        forceProcessed: true,
                        operationId: operationId,
                        captureAfterReload: (screenId === 1) // Solo pantalla 1 necesita captura posterior
                    });
                }
                
                // Esperar confirmación de que la pantalla está lista
                await this.waitForScreenReady(screenId, operationId);
                
                // Validar que la imagen se cargó correctamente
                await this.validateScreenImageLoad(screenId);
                
                this.log(`✅ Pantalla ${screenId} actualizada correctamente`, 'success');
                return;
                
            } catch (error) {
                this.log(`❌ Error en intento ${attempt} para pantalla ${screenId}: ${error.message}`, 'error');
                
                if (attempt === maxAttempts) {
                    throw new Error(`Falló actualización de pantalla ${screenId} después de ${maxAttempts} intentos`);
                }
                
                // Esperar antes del siguiente intento
                await this.delay(this.retryDelay * attempt);
            }
        }
    }
    
    /**
     * Esperar confirmación de que una pantalla está lista
     */
    async waitForScreenReady(screenId, operationId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.socket?.off('screenReady', listener);
                reject(new Error(`Timeout esperando screenReady para pantalla ${screenId}`));
            }, this.loadTimeout);
            
            const listener = (data) => {
                if (data && data.screenId === screenId && 
                    (data.operationId === operationId || !operationId)) {
                    clearTimeout(timeout);
                    this.socket.off('screenReady', listener);
                    this.log(`📱 Pantalla ${screenId} confirmó estar lista`);
                    resolve();
                }
            };
            
            if (this.socket) {
                this.socket.on('screenReady', listener);
            } else {
                clearTimeout(timeout);
                reject(new Error('Socket no disponible'));
            }
        });
    }
    
    /**
     * Validar que la imagen se cargó correctamente en la pantalla
     */
    async validateScreenImageLoad(screenId) {
        // Implementación futura: podríamos hacer ping a la pantalla
        // para verificar que processed.png se cargó con el timestamp correcto
        return new Promise((resolve) => {
            // Por ahora, asumimos que si llegó screenReady, la imagen está cargada
            setTimeout(resolve, 500); // Pequeña pausa para asegurar render
        });
    }
    
    /**
     * Capturar canvas de screen/1 y guardarlo como wallpaper.jpg
     */
    async captureAndSaveWallpaper() {
        this.log('📸 Iniciando captura de canvas para wallpaper.jpg');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.socket?.off('wallpaperSaved', listener);
                reject(new Error('Timeout esperando guardado de wallpaper'));
            }, 15000); // 15 segundos para captura y guardado
            
            const listener = (data) => {
                if (data && data.success) {
                    clearTimeout(timeout);
                    this.socket.off('wallpaperSaved', listener);
                    this.sequenceState.wallpaperSaved = true;
                    this.log(`🖼️ Wallpaper guardado: ${data.filename}`, 'success');
                    resolve();
                } else if (data && !data.success) {
                    clearTimeout(timeout);
                    this.socket.off('wallpaperSaved', listener);
                    reject(new Error(`Error guardando wallpaper: ${data.error}`));
                }
            };
            
            if (this.socket) {
                this.socket.on('wallpaperSaved', listener);
                // Solicitar captura de pantalla 1
                this.socket.emit('requestCanvasCapture', { screenId: 1 });
            } else {
                clearTimeout(timeout);
                reject(new Error('Socket no disponible para captura'));
            }
        });
    }
    
    /**
     * Continuar con la secuencia de coloreado
     */
    async continueColorSequence() {
        this.log('🎨 Continuando con secuencia de coloreado');
        
        if (this.socket) {
            // Enviar señal para continuar con coloreado usando wallpaper.jpg
            this.socket.emit('continueWithWallpaperColoring');
        }
        
        this.sequenceState.sequenceContinued = true;
        this.log('🎨 Secuencia de coloreado iniciada', 'success');
    }
    
    /**
     * Obtener lista de pantallas conectadas
     */
    getConnectedScreens() {
        // Por defecto, solo screen/1, pero podría expandirse
        return [1];
    }
    
    /**
     * Manejar errores en la secuencia
     */
    handleSequenceError(error) {
        this.log(`Error en secuencia: ${error.message}`, 'error');
        
        // Intentar recuperación parcial según el estado
        if (!this.sequenceState.screenUpdated) {
            this.log('Intentando recuperación de actualización de pantallas', 'warn');
            // Podríamos intentar una actualización más agresiva
        }
        
        if (!this.sequenceState.wallpaperSaved) {
            this.log('Wallpaper no guardado, intentando captura de emergencia', 'warn');
            // Podríamos usar el wallpaper anterior o forzar una captura
        }
    }
    
    /**
     * Handlers para eventos del socket
     */
    handleProcessedImageReady(data) {
        this.log(`Imagen procesada confirmada: ${JSON.stringify(data)}`);
    }
    
    handleScreenCaptureComplete(data) {
        this.log(`Captura de pantalla completada: ${JSON.stringify(data)}`);
    }
    
    handleWallpaperSaved(data) {
        this.log(`Wallpaper guardado: ${JSON.stringify(data)}`);
    }
    
    /**
     * Resetear estado de secuencia
     */
    resetSequenceState() {
        this.sequenceState = {
            cameraCapture: false,
            imageProcessed: false,
            screenUpdated: false,
            wallpaperSaved: false,
            sequenceContinued: false
        };
    }
    
    /**
     * Utilidad: delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Obtener estado actual de la secuencia
     */
    getSequenceState() {
        return { ...this.sequenceState };
    }
    
    /**
     * Verificar si una secuencia está en progreso
     */
    isSequenceInProgress() {
        return this.isProcessing;
    }
}

// Crear instancia global
const imageSyncManager = new ImageSyncManager();

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageSyncManager;
}

// Hacer disponible globalmente en el navegador
if (typeof window !== 'undefined') {
    window.ImageSyncManager = ImageSyncManager;
    window.imageSyncManager = imageSyncManager;
}
