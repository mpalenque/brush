/**
 * Pattern Manager Module
 * Módulo común para carga y gestión de patrones, elimina duplicación
 */

class PatternManager {
    constructor(config = {}) {
        this.patterns = [];
        this.currentIndex = 0;
        this.basePath = config.basePath || '/patterns/';
        this.defaultPattern = config.defaultPattern || 'amarillo.jpg';
        this.onPatternLoad = config.onPatternLoad || (() => {});
        this.onPatternChange = config.onPatternChange || (() => {});
        this.cache = new Map();
    }

    /**
     * Verificar si un archivo existe
     */
    async checkFileExists(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Cargar una imagen y retornar promesa
     */
    async loadImage(src) {
        // Verificar cache primero
        if (this.cache.has(src)) {
            return this.cache.get(src);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.cache.set(src, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = `${src}?t=${Date.now()}`;
        });
    }

    /**
     * Cargar múltiples patrones
     */
    async loadPatterns(patternList = null) {
    const defaultPatterns = ['amarillo.jpg', 'wallpaper.jpg', 'azul.jpg', 'rojo.jpg', 'logo1.jpg', 'logo2.jpg'];
        const patternsToLoad = patternList || defaultPatterns;
        
        console.log('🔍 Cargando patrones disponibles...');
        
        this.patterns.length = 0;
        let loadedCount = 0;

        for (const filename of patternsToLoad) {
            try {
                const fullPath = `${this.basePath}${filename}`;
                const exists = await this.checkFileExists(fullPath);
                
                if (exists) {
                    console.log(`🎯 Cargando ${filename}...`);
                    const image = await this.loadImage(fullPath);
                    
                    const patternData = {
                        src: fullPath,
                        image: image,
                        filename: filename,
                        type: this.getPatternType(filename),
                        loadedAt: Date.now()
                    };
                    
                    this.patterns.push(patternData);
                    loadedCount++;
                    
                    console.log(`✅ ${filename} cargado exitosamente`);
                    this.onPatternLoad(patternData);
                    
                    // Establecer primer patrón como actual
                    if (loadedCount === 1) {
                        this.currentIndex = 0;
                        this.onPatternChange(patternData);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ No se pudo cargar ${filename}:`, error);
            }
        }

        console.log(`📊 Total de patrones cargados: ${loadedCount}`);
        return loadedCount > 0;
    }

    /**
     * Determinar el tipo de patrón basado en el filename
     */
    getPatternType(filename) {
        const name = filename.toLowerCase();
        if (name.includes('amarillo')) return 'amarillo';
        if (name.includes('azul')) return 'azul';
        if (name.includes('rojo')) return 'rojo';
        if (name.includes('wallpaper')) return 'wallpaper';
        return 'pattern';
    }

    /**
     * Obtener el patrón actual
     */
    getCurrentPattern() {
        if (this.patterns.length === 0) {
            console.warn('⚠️ No hay patrones cargados');
            return null;
        }

        if (this.currentIndex >= this.patterns.length) {
            this.currentIndex = 0;
        }

        return this.patterns[this.currentIndex];
    }

    /**
     * Cambiar al siguiente patrón
     */
    nextPattern() {
        if (this.patterns.length === 0) return null;
        
        this.currentIndex = (this.currentIndex + 1) % this.patterns.length;
        const pattern = this.patterns[this.currentIndex];
        
        console.log(`🔄 Cambiando a patrón: ${pattern.filename}`);
        this.onPatternChange(pattern);
        
        return pattern;
    }

    /**
     * Cambiar al patrón anterior
     */
    previousPattern() {
        if (this.patterns.length === 0) return null;
        
        this.currentIndex = this.currentIndex - 1;
        if (this.currentIndex < 0) {
            this.currentIndex = this.patterns.length - 1;
        }
        
        const pattern = this.patterns[this.currentIndex];
        console.log(`🔄 Cambiando a patrón: ${pattern.filename}`);
        this.onPatternChange(pattern);
        
        return pattern;
    }

    /**
     * Seleccionar patrón por tipo
     */
    selectPatternByType(type) {
        const pattern = this.patterns.find(p => p.type === type);
        if (pattern) {
            this.currentIndex = this.patterns.indexOf(pattern);
            console.log(`🎯 Patrón seleccionado por tipo: ${pattern.filename}`);
            this.onPatternChange(pattern);
            return pattern;
        }
        return null;
    }

    /**
     * Seleccionar patrón por índice
     */
    selectPatternByIndex(index) {
        if (index >= 0 && index < this.patterns.length) {
            this.currentIndex = index;
            const pattern = this.patterns[index];
            console.log(`🎯 Patrón seleccionado por índice: ${pattern.filename}`);
            this.onPatternChange(pattern);
            return pattern;
        }
        return null;
    }

    /**
     * Obtener lista de patrones disponibles
     */
    getAvailablePatterns() {
        return this.patterns.map(p => ({
            filename: p.filename,
            type: p.type,
            src: p.src,
            loadedAt: p.loadedAt
        }));
    }

    /**
     * Limpiar cache de imágenes
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 Cache de patrones limpiado');
    }

    /**
     * Recargar patrón actual
     */
    async reloadCurrentPattern() {
        const current = this.getCurrentPattern();
        if (!current) return null;

        try {
            // Limpiar del cache
            this.cache.delete(current.src);
            
            // Recargar
            const newImage = await this.loadImage(current.src);
            current.image = newImage;
            current.loadedAt = Date.now();
            
            console.log(`🔄 Patrón recargado: ${current.filename}`);
            this.onPatternChange(current);
            
            return current;
        } catch (error) {
            console.error('❌ Error recargando patrón:', error);
            return null;
        }
    }
}

// Exportar para uso en diferentes contextos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatternManager;
} else {
    window.PatternManager = PatternManager;
}
