/**
 * Canvas Utilities Module
 * Funciones comunes para manejo de canvas y eliminación de duplicación
 */

class CanvasUtils {
    
    /**
     * Configurar canvas con DPR y dimensiones optimizadas
     */
    static setupCanvas(canvas, width, height, options = {}) {
        const dpr = options.devicePixelRatio || window.devicePixelRatio || 1;
        const maxDpr = options.maxDpr || 2; // Limitar DPR para rendimiento
        const effectiveDpr = Math.min(dpr, maxDpr);
        
        // Configurar tamaño físico
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        // Configurar resolución interna
        canvas.width = width * effectiveDpr;
        canvas.height = height * effectiveDpr;
        
        // Escalar contexto para DPR
        const ctx = canvas.getContext('2d', {
            alpha: options.alpha !== false,
            desynchronized: options.desynchronized || true,
            ...options.contextAttributes
        });
        
        ctx.scale(effectiveDpr, effectiveDpr);
        
        return { ctx, effectiveDpr };
    }

    /**
     * Configurar canvas para multi-pantalla (3 pantallas horizontales)
     */
    static setupMultiScreenCanvas(canvas, screenWidth = 2160, screenHeight = 3840, screenCount = 3) {
        const totalWidth = screenWidth * screenCount;
        const totalHeight = screenHeight;
        
        return this.setupCanvas(canvas, totalWidth, totalHeight, {
            maxDpr: 1, // Para multi-pantalla, limitar DPR por rendimiento
            alpha: false,
            desynchronized: true
        });
    }

    /**
     * Limpiar canvas con color de fondo
     */
    static clearCanvas(ctx, width, height, backgroundColor = '#ffffff') {
        ctx.save();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    /**
     * Dibujar imagen con transformaciones
     */
    static drawImageTransformed(ctx, image, options = {}) {
        const {
            x = 0,
            y = 0,
            width = image.width,
            height = image.height,
            rotation = 0,
            scaleX = 1,
            scaleY = 1,
            alpha = 1,
            blendMode = 'source-over'
        } = options;

        ctx.save();
        
        // Aplicar alpha y blend mode
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = blendMode;
        
        // Mover al punto de rotación
        ctx.translate(x + width / 2, y + height / 2);
        
        // Aplicar transformaciones
        if (rotation !== 0) {
            ctx.rotate((rotation * Math.PI) / 180);
        }
        if (scaleX !== 1 || scaleY !== 1) {
            ctx.scale(scaleX, scaleY);
        }
        
        // Dibujar imagen centrada
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        
        ctx.restore();
    }

    /**
     * Crear patrón repetitivo optimizado
     */
    static createPattern(ctx, image, config = {}) {
        const {
            repetitionX = 1,
            repetitionY = 1,
            patternSize = 100,
            separationX = 0,
            separationY = 0,
            spacingX = 0,
            spacingY = 0,
            rotation = 0,
            blendMode = 'source-over',
            canvasWidth,
            canvasHeight
        } = config;

        if (!canvasWidth || !canvasHeight) {
            console.error('Canvas dimensions required for pattern creation');
            return;
        }

        // Calcular dimensiones de la imagen
        const imgAspect = image.width / image.height;
        let baseWidth = patternSize;
        let baseHeight = patternSize;
        
        if (imgAspect > 1) {
            baseHeight = baseWidth / imgAspect;
        } else {
            baseWidth = baseHeight * imgAspect;
        }

        // Calcular espaciado total
        const totalSpacingX = separationX + spacingX;
        const totalSpacingY = separationY + spacingY;

        ctx.save();
        ctx.globalCompositeOperation = blendMode;

        // Generar patrón
        for (let row = 0; row < repetitionY; row++) {
            for (let col = 0; col < repetitionX; col++) {
                const x = col * (baseWidth + totalSpacingX);
                const y = row * (baseHeight + totalSpacingY);
                
                // Solo dibujar si está dentro del canvas visible
                if (x < canvasWidth + baseWidth && y < canvasHeight + baseHeight) {
                    this.drawImageTransformed(ctx, image, {
                        x,
                        y,
                        width: baseWidth,
                        height: baseHeight,
                        rotation,
                        alpha: 1
                    });
                }
            }
        }

        ctx.restore();
    }

    /**
     * Redimensionar imagen manteniendo aspecto
     */
    static calculateAspectFitSize(imageWidth, imageHeight, maxWidth, maxHeight) {
        const imageAspect = imageWidth / imageHeight;
        const maxAspect = maxWidth / maxHeight;
        
        let width, height;
        
        if (imageAspect > maxAspect) {
            // Imagen más ancha, ajustar por ancho
            width = maxWidth;
            height = maxWidth / imageAspect;
        } else {
            // Imagen más alta, ajustar por alto
            height = maxHeight;
            width = maxHeight * imageAspect;
        }
        
        return { width, height };
    }

    /**
     * Obtener datos de imagen como ImageData
     */
    static getImageData(ctx, x = 0, y = 0, width, height) {
        if (!width) width = ctx.canvas.width;
        if (!height) height = ctx.canvas.height;
        
        try {
            return ctx.getImageData(x, y, width, height);
        } catch (error) {
            console.error('Error obteniendo ImageData:', error);
            return null;
        }
    }

    /**
     * Crear gradiente radial
     */
    static createRadialGradient(ctx, centerX, centerY, radius, colorStops) {
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        
        colorStops.forEach(stop => {
            gradient.addColorStop(stop.position, stop.color);
        });
        
        return gradient;
    }

    /**
     * Crear gradiente lineal
     */
    static createLinearGradient(ctx, x1, y1, x2, y2, colorStops) {
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        
        colorStops.forEach(stop => {
            gradient.addColorStop(stop.position, stop.color);
        });
        
        return gradient;
    }

    /**
     * Optimizar rendimiento de canvas
     */
    static optimizeCanvasPerformance(canvas, ctx) {
        // Desactivar smoothing para mejor rendimiento en patrones
        ctx.imageSmoothingEnabled = false;
        
        // Configurar compositing optimizado
        ctx.globalCompositeOperation = 'source-over';
        
        // Willchange para hardware acceleration
        canvas.style.willChange = 'transform';
        
        return ctx;
    }

    /**
     * Detectar si el punto está dentro del canvas visible
     */
    static isPointInViewport(x, y, canvasWidth, canvasHeight, margin = 0) {
        return x >= -margin && 
               y >= -margin && 
               x <= canvasWidth + margin && 
               y <= canvasHeight + margin;
    }

    /**
     * Calcular coordenadas para centrar elemento
     */
    static centerElement(elementWidth, elementHeight, containerWidth, containerHeight) {
        return {
            x: (containerWidth - elementWidth) / 2,
            y: (containerHeight - elementHeight) / 2
        };
    }
}

// Exportar para uso en diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanvasUtils;
} else {
    window.CanvasUtils = CanvasUtils;
}
