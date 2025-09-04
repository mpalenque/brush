/**
 * Common Configuration
 * Configuración centralizada para eliminar duplicación de constantes
 */

const CONFIG = {
    // Canvas dimensions
    CANVAS: {
        SINGLE_SCREEN_WIDTH: 2160,
        SINGLE_SCREEN_HEIGHT: 3840,
        MULTI_SCREEN_COUNT: 3,
        get MULTI_SCREEN_WIDTH() {
            return this.SINGLE_SCREEN_WIDTH * this.MULTI_SCREEN_COUNT;
        },
        get MULTI_SCREEN_HEIGHT() {
            return this.SINGLE_SCREEN_HEIGHT;
        },
        MAX_DPR: 2
    },

    // WebSocket settings
    WEBSOCKET: {
        RECONNECTION_DELAY: 1000,
        MAX_RECONNECTION_ATTEMPTS: 10,
        TIMEOUT: 5000,
        THROTTLE_TIME: 100
    },

    // Pattern settings
    PATTERNS: {
        BASE_PATH: '/patterns/',
        DEFAULT_PATTERNS: ['amarillo.jpg', 'wallpaper.jpg', 'azul.jpg', 'rojo.jpg'],
        DEFAULT_PATTERN: 'amarillo.jpg',
        CACHE_BUST: true
    },

    // Brush Reveal settings
    BRUSH_REVEAL: {
        DURATION_MS: 14000,
        DPR: 1,
        MASK_SCALE: 0.7,
        MAX_UNITS_PER_FRAME: 250,
        FINAL_SEAL_START: 0.35,
        FINAL_SEAL_ALPHA_MIN: 0.20,
        FINAL_SEAL_ALPHA_MAX: 0.35,
        WASH_START: 0.45,
        MAX_STEPS_PER_ENTITY_FRAME: 5
    },

    // Default wallpaper state
    DEFAULT_STATE: {
        general: {
            patternType: 'organic-complex',
            repetitionX: 200,
            repetitionY: 8,
            patternSize: 300,
            separationX: 300,
            separationY: 300,
            spacingX: 0,
            spacingY: 0,
            rotation: 0,
            zoom: 2.3,
            blendMode: 'multiply',
            backgroundColor: '#F5DDC7',
            selectedImage: 'red',
            patternSource: 'processed',
            overlayImages: {
                countX: 3,
                countY: 2,
                offsetX: 0,
                offsetY: 0,
                size: 200,
                spacingX: 800,
                spacingY: 600,
                rowOffsetX: 0,
                rowOffsetY: 0,
                colOffsetX: 0,
                colOffsetY: 0,
                alternateRowX: 0,
                alternateRowY: 0,
                alternateColX: 0,
                alternateColY: 0
            }
        },
        wallpaper: { 
            isActive: true 
        }
    },

    // File paths
    PATHS: {
        STROKE_BRUSHES: [
            '/Stroke/blue-watercolor-brush-stroke-1.png',
            '/Stroke/blue-watercolor-brush-stroke-2.png',
            '/Stroke/blue-watercolor-brush-stroke-6.png',
            '/Stroke/blue-watercolor-brush-stroke-7.png',
            '/Stroke/blue-watercolor-brush-stroke-14.png'
        ],
        CONFIG_FILE: 'config.json'
    },

    // Animation settings
    ANIMATION: {
        AUTO_ROTATION_INTERVAL: 120000, // 2 minutes
        COLOR_SEQUENCE_INTERVAL: 16000,  // 16 seconds
        SLIDESHOW_INTERVAL: 3000,        // 3 seconds
        ROTATION_PATTERNS: ['amarillo', 'azul', 'rojo']
    },

    // Performance settings
    PERFORMANCE: {
        THROTTLE_RESIZE: 250,
        THROTTLE_SCROLL: 100,
        DEBOUNCE_INPUT: 300,
        MAX_FPS: 60
    },

    // Server settings
    SERVER: {
        DEFAULT_PORT: 3000,
        MAX_HTTP_BUFFER_SIZE: 50 * 1024 * 1024, // 50MB
        PING_TIMEOUT: 60000,
        PING_INTERVAL: 25000
    }
};

/**
 * Helper functions for configuration
 */
CONFIG.helpers = {
    /**
     * Get canvas dimensions for a specific screen count
     */
    getCanvasDimensions(screenCount = 3) {
        return {
            width: CONFIG.CANVAS.SINGLE_SCREEN_WIDTH * screenCount,
            height: CONFIG.CANVAS.SINGLE_SCREEN_HEIGHT
        };
    },

    /**
     * Get WebSocket configuration
     */
    getWebSocketConfig() {
        return {
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: CONFIG.WEBSOCKET.RECONNECTION_DELAY,
            reconnectionAttempts: CONFIG.WEBSOCKET.MAX_RECONNECTION_ATTEMPTS,
            timeout: CONFIG.WEBSOCKET.TIMEOUT
        };
    },

    /**
     * Get pattern source path
     */
    getPatternSrc(source) {
        switch (source) {
            case 'processed':
                return '/processed/processed.png';
            case 'rojo':
                return '/patterns/rojo.jpg';
            case 'azul':
                return '/patterns/azul.jpg';
            case 'amarillo':
                return '/patterns/amarillo.jpg';
            default:
                return '/processed/processed.png';
        }
    },

    /**
     * Get brush reveal offset configuration
     */
    getBrushOffset(brushId) {
        const offsets = {
            1: { offsetX: 0, offsetY: 0 },
            2: { offsetX: 2160, offsetY: 0 },
            3: { offsetX: 4320, offsetY: 0 }
        };
        return offsets[brushId] || { offsetX: 0, offsetY: 0 };
    }
};

// Exportar para uso en diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
