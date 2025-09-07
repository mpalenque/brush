
// ==============================
// BRUSH REVEAL MINIMAL - VERSIÓN SIMPLIFICADA
// Con slideshow funcional y coloreado tipo brush correcto
// ==============================

// CONFIGURACIÓN BÁSICA
const DURATION_MS = 30000; // 30 segundos para coloreado más lento
const IMAGE_REVEAL_DELAY_MS = 10000; // 10s solo trazos antes de revelar imagen
const FADE_FINAL_DURATION = 5000; // 5 segundos para fade final
const FADE_OUT_DURATION = 3000; // 3 segundos para fade-out entre transiciones
const BACKGROUND_FADE_IN_DURATION = 3000; // 3 segundos para fade-in del fondo anaranjado
const WALLPAPER_SECTION_WIDTH = 2160;
const WALLPAPER_SECTION_HEIGHT = 3840;
const WALLPAPER_TOTAL_WIDTH = 6480;

// Detectar brushId de la URL - CORREGIDO para funcionar con brush-minimal.html y brush-reveal
function getBrushId() {
    // Primero intentar detectar desde /brush-reveal/X
    let match = window.location.pathname.match(/\/brush-reveal\/(\d+)/);
    if (match) {
        return parseInt(match[1]);
    }
    
    // Si no, buscar parámetro brushId en URL
    const urlParams = new URLSearchParams(window.location.search);
    const brushIdParam = urlParams.get('brushId');
    if (brushIdParam) {
        return parseInt(brushIdParam);
    }
    
    // Si está en brush-minimal.html sin parámetro, usar brush 1 por defecto
    if (window.location.pathname.includes('brush-minimal')) {
        return 1;
    }
    
    return 1; // Default
}

const brushId = getBrushId();
console.log(`🎯 Brush ID: ${brushId}`);

// ==============================
// GESTIÓN BÁSICA DEL CANVAS
// ==============================
const container = document.getElementById('container');
const canvas = document.querySelector('.js-canvas');
const ctx = canvas.getContext('2d');

// Canvas para máscara (simula el efecto de pincel)
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');

let size = { w: 0, h: 0 };
let layout = { dx: 0, dy: 0, dw: 0, dh: 0, sourceX: 0, sourceY: 0, sourceWidth: 0, sourceHeight: 0 };

// Configuración del brush (offsets del servidor)
let brushConfig = { offsetX: 0, offsetY: 0 };

function resize() {
    const rect = container.getBoundingClientRect();
    size.w = Math.floor(rect.width);
    size.h = Math.floor(rect.height);
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.style.width = size.w + 'px';
    canvas.style.height = size.h + 'px';
    
    // Configurar máscara con misma resolución
    maskCanvas.width = size.w;
    maskCanvas.height = size.h;
    
    // Calcular layout basado en el patrón actual
    calculateLayout();
}

function calculateLayout() {
    if (!currentImage) return;
    
    const imgW = currentImage.naturalWidth;
    const imgH = currentImage.naturalHeight;
    
    if (isWallpaperType || isLogoType) {
        // Usar sección específica para wallpaper y logos
        const sourceX = brushConfig.offsetX;
        const sourceY = brushConfig.offsetY;
        const s = Math.min(size.w / WALLPAPER_SECTION_WIDTH, size.h / WALLPAPER_SECTION_HEIGHT);
        layout.dw = Math.ceil(WALLPAPER_SECTION_WIDTH * s);
        layout.dh = Math.ceil(WALLPAPER_SECTION_HEIGHT * s);
        layout.dx = Math.floor((size.w - layout.dw) / 2);
        layout.dy = Math.floor((size.h - layout.dh) / 2);
        layout.sourceX = sourceX;
        layout.sourceY = sourceY;
        layout.sourceWidth = WALLPAPER_SECTION_WIDTH;
        layout.sourceHeight = WALLPAPER_SECTION_HEIGHT;
    } else if (isColorType) {
        // Para amarillo, azul, rojo - mapeo virtual como en brush-reveal.js
        const scaleToVirtual = WALLPAPER_SECTION_HEIGHT / imgH;
        const placedW = imgW * scaleToVirtual;
        const placeX = Math.floor((WALLPAPER_TOTAL_WIDTH - placedW) / 2);
        const sourceXVirtual = brushConfig.offsetX || 0;
        const sourceYVirtual = brushConfig.offsetY || 0;
        
        let sx = (sourceXVirtual - placeX) / scaleToVirtual;
        let sy = sourceYVirtual / scaleToVirtual;
        let sw = WALLPAPER_SECTION_WIDTH / scaleToVirtual;
        let sh = WALLPAPER_SECTION_HEIGHT / scaleToVirtual;
        
        sx = Math.max(0, Math.min(imgW - 1, sx));
        sy = Math.max(0, Math.min(imgH - 1, sy));
        if (sx + sw > imgW) sw = imgW - sx;
        if (sy + sh > imgH) sh = imgH - sy;
        
        const s = Math.min(size.w / WALLPAPER_SECTION_WIDTH, size.h / WALLPAPER_SECTION_HEIGHT);
        layout.dw = Math.ceil(WALLPAPER_SECTION_WIDTH * s);
        layout.dh = Math.ceil(WALLPAPER_SECTION_HEIGHT * s);
        layout.dx = Math.floor((size.w - layout.dw) / 2);
        layout.dy = Math.floor((size.h - layout.dh) / 2);
        layout.sourceX = Math.round(sx);
        layout.sourceY = Math.round(sy);
        layout.sourceWidth = Math.max(1, Math.round(sw));
        layout.sourceHeight = Math.max(1, Math.round(sh));
    } else {
        // Imagen completa para otros tipos
        const s = Math.min(size.w / imgW, size.h / imgH);
        layout.dw = Math.ceil(imgW * s);
        layout.dh = Math.ceil(imgH * s);
        layout.dx = Math.floor((size.w - layout.dw) / 2);
        layout.dy = Math.floor((size.h - layout.dh) / 2);
        layout.sourceX = 0;
        layout.sourceY = 0;
        layout.sourceWidth = imgW;
        layout.sourceHeight = imgH;
    }
}

// ==============================
// GESTOR DE IMÁGENES
// ==============================
let currentImage = null;
let currentImageType = 'wallpaper';
let isWallpaperType = false;
let isColorType = false;
let isLogoType = false;

async function loadImage(filename) {
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = `/patterns/${filename}?t=${Date.now()}`;
        });
        return img;
    } catch (error) {
        console.error(`Error cargando ${filename}:`, error);
        return null;
    }
}

async function setCurrentImage(filename) {
    console.log(`🎨 Cargando imagen: ${filename}`);
    
    // Si hay una animación activa, hacer fade-out primero
    if ((animationActive || logoFadeActive) && currentImage) {
        console.log('🎭 Iniciando fade-out antes de cambiar imagen...');
        nextImageToLoad = filename;
        startFadeOut();
        return true;
    }
    
    currentImage = await loadImage(filename);
    if (!currentImage) return false;
    
    // Determinar tipo de imagen
    currentImageType = filename.replace('.jpg', '');
    isWallpaperType = filename.includes('wallpaper');
    isColorType = /amarillo|azul|rojo/.test(filename);
    isLogoType = /logo1|logo2/.test(filename);
    
    // Recalcular layout y renderizar
    calculateLayout();
    render();
    return true;
}

function render() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    // Si es logo y está en fade-in, usar renderizado especial
    if (isLogoType && logoFadeActive) {
        renderLogoFadeIn();
        return;
    }
    
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Dibujar imagen
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        currentImage,
        layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
        layout.dx, layout.dy, layout.dw, layout.dh
    );
    
    // Durante la animación de brush, aplicar máscara para efecto progresivo de pincel
    if (animationActive && maskCanvas && !isLogoType) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#E89E54';
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalCompositeOperation = 'source-over';
    }
}

// ==============================
// GESTOR DE COLOREADO TIPO BRUSH (CORREGIDO)
// ==============================
let animationActive = false;
let animationProgress = 0;
let animationStartTime = 0;
let rafId = 0;

// Variables para fade-in de logos
let logoFadeActive = false;

// Variables para fade-out
let fadeOutActive = false;
let fadeOutProgress = 0;
let fadeOutStartTime = 0;
let nextImageToLoad = null;

// Variables para fade-in del fondo anaranjado
let backgroundFadeInActive = false;
let backgroundFadeInProgress = 0;
let backgroundFadeInStartTime = 0;
let pendingAction = null; // 'coloring' o 'logoFadeIn'

// Elementos para simular brushes y strokes como en brush-reveal.js
let brushElements = [];
let strokeElements = [];

function initBrushElements() {
    brushElements = [];
    strokeElements = [];
    
    // Crear MÁS elementos de brush para efecto más orgánico y más rápido
    const numBrushes = 60 + Math.random() * 40; // 60-100 brushes para mayor velocidad
    for (let i = 0; i < numBrushes; i++) {
        brushElements.push({
            x: Math.random() * size.w,
            y: Math.random() * size.h,
            radius: 75 + Math.random() * 250, // 5 veces más grueso (15*5=75, 50*5=250)
            opacity: 0.3 + Math.random() * 0.6, // Mayor opacidad para efecto más visible
            growthRate: 1.2 + Math.random() * 1.0, // Crecimiento más rápido
            startTime: Math.random() * 0.9 // Distribuir en el tiempo pero empezar antes
        });
    }
    
    // Crear MÁS strokes ondulados conectores más gruesos y ondulados
    const numStrokes = 40 + Math.random() * 20; // 40-60 strokes para mayor cobertura
    for (let i = 0; i < numStrokes; i++) {
        strokeElements.push({
            startX: Math.random() * size.w,
            startY: Math.random() * size.h,
            endX: Math.random() * size.w,
            endY: Math.random() * size.h,
            width: 40 + Math.random() * 125, // 5 veces más grueso (8*5=40, 25*5=125)
            opacity: 0.25 + Math.random() * 0.45, // Mayor opacidad
            startTime: Math.random() * 0.8, // Empezar más temprano y distribuir mejor
            // Parámetros para ondas MÁS onduladas
            waveAmplitude: 50 + Math.random() * 100, // Ondas mucho más pronunciadas
            waveFrequency: 2.5 + Math.random() * 8,   // Mayor frecuencia de ondas
            wavePhase: Math.random() * Math.PI * 2,  // Fase inicial
            // Nuevos parámetros para ondas complejas
            secondaryAmplitude: 20 + Math.random() * 40, // Onda secundaria
            secondaryFrequency: 1.0 + Math.random() * 3,
            secondaryPhase: Math.random() * Math.PI * 2
        });
    }
    
    // Agregar elementos adicionales tipo "pinceladas" grandes MÁS gruesas
    const numBigBrushes = 15 + Math.random() * 20; // Más pinceladas grandes
    for (let i = 0; i < numBigBrushes; i++) {
        brushElements.push({
            x: Math.random() * size.w,
            y: Math.random() * size.h,
            radius: 300 + Math.random() * 600, // 5 veces más grueso (60*5=300, 120*5=600)
            opacity: 0.2 + Math.random() * 0.4, // Mayor opacidad
            growthRate: 0.8 + Math.random() * 0.8, // Crecimiento más rápido
            startTime: Math.random() * 0.7, // Empezar más temprano
            type: 'bigBrush' // Marcador para tratamiento especial
        });
    }
}

function startColoring() {
    if (animationActive || logoFadeActive || fadeOutActive || backgroundFadeInActive) return;
    
    // SIEMPRE comenzar con fade-in del fondo anaranjado
    console.log('🎨 Iniciando fade-in del fondo anaranjado antes de colorear...');
    pendingAction = isLogoType ? 'logoFadeIn' : 'coloring';
    startBackgroundFadeIn();
}

function startBackgroundFadeIn() {
    console.log('🟠 Iniciando fade-in del fondo anaranjado...');
    
    // Detener animaciones actuales si las hay
    if (animationActive) animationActive = false;
    if (logoFadeActive) logoFadeActive = false;
    if (fadeOutActive) fadeOutActive = false;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
    
    // Iniciar fade-in del fondo
    backgroundFadeInActive = true;
    backgroundFadeInProgress = 0;
    backgroundFadeInStartTime = performance.now();
    
    rafId = requestAnimationFrame(backgroundFadeInLoop);
}

function backgroundFadeInLoop(timestamp) {
    if (!backgroundFadeInActive) return;
    
    const elapsed = timestamp - backgroundFadeInStartTime;
    backgroundFadeInProgress = Math.min(elapsed / BACKGROUND_FADE_IN_DURATION, 1);
    
    // Renderizar fade-in del fondo
    renderBackgroundFadeIn();
    
    if (backgroundFadeInProgress < 1) {
        rafId = requestAnimationFrame(backgroundFadeInLoop);
    } else {
        // Fade-in del fondo completado, ejecutar acción pendiente
        backgroundFadeInActive = false;
        rafId = 0;
        console.log('✅ Fade-in del fondo completado, iniciando animación...');
        
        if (pendingAction === 'logoFadeIn') {
            executeLogoFadeIn();
        } else if (pendingAction === 'coloring') {
            executeColoring();
        }
        
        pendingAction = null;
    }
}

function renderBackgroundFadeIn() {
    // Limpiar canvas
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Fade-in gradual del color de fondo anaranjado
    ctx.globalAlpha = backgroundFadeInProgress;
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.globalAlpha = 1.0;
}

function executeColoring() {
    console.log('🎨 Ejecutando coloreado con efecto de pincel...');
    animationActive = true;
    animationProgress = 0;
    animationStartTime = performance.now();
    
    // Limpiar e inicializar máscara
    maskCtx.clearRect(0, 0, size.w, size.h);
    
    // Inicializar elementos de brush
    initBrushElements();
    
    rafId = requestAnimationFrame(coloringLoop);
}

function executeLogoFadeIn() {
    console.log('🎨 Ejecutando fade-in para logo...');
    logoFadeActive = true;
    animationProgress = 0;
    animationStartTime = performance.now();
    
    rafId = requestAnimationFrame(logoFadeLoop);
}

function startLogoFadeIn() {
    console.log('🎨 Iniciando proceso de logo con fade-in del fondo...');
    // Ahora startColoring() maneja tanto logos como coloreado normal
    startColoring();
}

function startFadeOut() {
    console.log('🎭 Iniciando fade-out...');
    
    // Detener animaciones actuales
    if (animationActive) {
        animationActive = false;
    }
    if (logoFadeActive) {
        logoFadeActive = false;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
    
    // Iniciar fade-out
    fadeOutActive = true;
    fadeOutProgress = 0;
    fadeOutStartTime = performance.now();
    
    rafId = requestAnimationFrame(fadeOutLoop);
}

function fadeOutLoop(timestamp) {
    if (!fadeOutActive) return;
    
    const elapsed = timestamp - fadeOutStartTime;
    fadeOutProgress = Math.min(elapsed / FADE_OUT_DURATION, 1);
    
    // Renderizar fade-out
    renderFadeOut();
    
    if (fadeOutProgress < 1) {
        rafId = requestAnimationFrame(fadeOutLoop);
    } else {
        // Fade-out completado, cargar nueva imagen
        fadeOutActive = false;
        rafId = 0;
        console.log('✅ Fade-out completado, cargando nueva imagen...');
        
        if (nextImageToLoad) {
            const filename = nextImageToLoad;
            nextImageToLoad = null;
            
            // Cargar nueva imagen sin fade-out recursivo
            loadImage(filename).then(img => {
                if (img) {
                    currentImage = img;
                    currentImageType = filename.replace('.jpg', '');
                    isWallpaperType = filename.includes('wallpaper');
                    isColorType = /amarillo|azul|rojo/.test(filename);
                    isLogoType = /logo1|logo2/.test(filename);
                    calculateLayout();
                    
                    // Iniciar nueva animación siempre con fade-in del fondo
                    startColoring();
                }
            });
        }
    }
}

function renderFadeOut() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Dibujar imagen actual con opacidad decreciente
    ctx.globalAlpha = 1 - fadeOutProgress;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Para logos, usar renderizado específico por tipo de brush
    if (isLogoType) {
        // Para brushes [1, 4, 5, 9] con video, mostrar logo normal
        if ([1, 4, 5, 9].includes(brushId)) {
            ctx.drawImage(
                currentImage,
                layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
                layout.dx, layout.dy, layout.dw, layout.dh
            );
        }
        // Para brushes [3, 7] con slideshow, mostrar logo normal
        else if ([3, 7].includes(brushId)) {
            ctx.drawImage(
                currentImage,
                layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
                layout.dx, layout.dy, layout.dw, layout.dh
            );
        }
        // Para otros brushes, logo fullscreen
        else {
            const imgW = currentImage.naturalWidth;
            const imgH = currentImage.naturalHeight;
            const scaleW = size.w / imgW;
            const scaleH = size.h / imgH;
            const scale = Math.max(scaleW, scaleH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            const drawX = (size.w - drawW) / 2;
            const drawY = (size.h - drawH) / 2;
            
            ctx.drawImage(currentImage, drawX, drawY, drawW, drawH);
        }
    } else {
        // Imagen normal fade-out
        ctx.drawImage(
            currentImage,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
    }
    
    // Si había máscara aplicada, mantenerla durante el fade-out
    if (maskCanvas && !isLogoType) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#E89E54';
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.globalAlpha = 1.0;
}

function logoFadeLoop(timestamp) {
    if (!logoFadeActive) return;
    
    const elapsed = timestamp - animationStartTime;
    const totalDuration = DURATION_MS + FADE_OUT_DURATION; // 30s fade-in + 3s fade-out
    
    // Primera fase: fade-in (30 segundos)
    if (elapsed < DURATION_MS) {
        animationProgress = elapsed / DURATION_MS;
        renderLogoFadeIn();
        rafId = requestAnimationFrame(logoFadeLoop);
    }
    // Segunda fase: fade-out (3 segundos)
    else if (elapsed < totalDuration) {
        const fadeOutProgress = (elapsed - DURATION_MS) / FADE_OUT_DURATION;
        renderLogoFadeOut(fadeOutProgress);
        rafId = requestAnimationFrame(logoFadeLoop);
    }
    // Terminado
    else {
        logoFadeActive = false;
        rafId = 0;
        console.log('✅ Logo fade-in y fade-out completados');
        
        // Notificar al servidor
        if (socket && socket.connected) {
            socket.emit('animationCompleted', { brushId, timestamp: Date.now() });
        }
    }
}

function renderLogoFadeOut(fadeOutProgress) {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Dibujar logo con fade-out
    ctx.globalAlpha = 1 - fadeOutProgress;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Para brushes [1, 4, 5, 9] con video, mostrar logo normal
    if ([1, 4, 5, 9].includes(brushId)) {
        // Logo normal fade-out
        ctx.drawImage(
            currentImage,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
    }
    // Para brushes [3, 7] con slideshow, mostrar logo normal  
    else if ([3, 7].includes(brushId)) {
        // Logo normal fade-out (slideshow se mantiene por encima)
        ctx.drawImage(
            currentImage,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
    }
    // Para otros brushes, logo fullscreen fade-out
    else {
        // Logo fullscreen fade-out
        const imgW = currentImage.naturalWidth;
        const imgH = currentImage.naturalHeight;
        const scaleW = size.w / imgW;
        const scaleH = size.h / imgH;
        const scale = Math.max(scaleW, scaleH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = (size.w - drawW) / 2;
        const drawY = (size.h - drawH) / 2;
        
        ctx.drawImage(currentImage, drawX, drawY, drawW, drawH);
    }
    
    ctx.globalAlpha = 1.0;
}

function renderLogoFadeIn() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Para brushes [1, 4, 5, 9] con video, mostrar logo normal (video se superpone)
    if ([1, 4, 5, 9].includes(brushId)) {
        // Logo normal con layout calculado - el video se superpone después
        ctx.globalAlpha = animationProgress;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            currentImage,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
        ctx.globalAlpha = 1.0;
    } 
    // Para brushes [3, 7] mostrar logo normal (slideshow se superpone) 
    else if ([3, 7].includes(brushId)) {
        // Logo normal con layout calculado - el slideshow se mantiene por encima
        ctx.globalAlpha = animationProgress;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            currentImage,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
        ctx.globalAlpha = 1.0;
    }
    // Para otros brushes, mostrar logo fullscreen
    else {
        // Mostrar logo fullscreen como amarillo.jpg (ancho completo, alto cropeado)
        const imgW = currentImage.naturalWidth;
        const imgH = currentImage.naturalHeight;
        
        // Calcular para mostrar fullscreen manteniendo aspect ratio
        const scaleW = size.w / imgW;
        const scaleH = size.h / imgH;
        const scale = Math.max(scaleW, scaleH); // Llenar pantalla completa
        
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = (size.w - drawW) / 2;
        const drawY = (size.h - drawH) / 2;
        
        // Dibujar logo fullscreen con fade-in progresivo
        ctx.globalAlpha = animationProgress;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(currentImage, drawX, drawY, drawW, drawH);
        ctx.globalAlpha = 1.0;
    }
}

function coloringLoop(timestamp) {
    if (!animationActive) return;
    
    const elapsed = timestamp - animationStartTime;
    const totalDuration = DURATION_MS + FADE_FINAL_DURATION;
    const overallProgress = Math.min(elapsed / totalDuration, 1);
    
    // Primera fase: coloreado con brush (30 segundos)
    if (elapsed < DURATION_MS) {
        animationProgress = elapsed / DURATION_MS;
        updateBrushMask();
        if (elapsed < IMAGE_REVEAL_DELAY_MS) {
            // Solo trazos sobre fondo
            renderBrushPreview(animationProgress);
        } else {
            render();
        }
        rafId = requestAnimationFrame(coloringLoop);
    }
    // Segunda fase: fade final (últimos 5 segundos)
    else if (elapsed < totalDuration) {
        const fadeProgress = (elapsed - DURATION_MS) / FADE_FINAL_DURATION;
        renderFinalFade(fadeProgress);
        rafId = requestAnimationFrame(coloringLoop);
    }
    // Terminado
    else {
        animationActive = false;
        rafId = 0;
        console.log('✅ Coloreado completado con fade final');
        
        // Render final sin máscara
        renderFinalComplete();
        
        // Notificar al servidor
        if (socket && socket.connected) {
            socket.emit('animationCompleted', { brushId, timestamp: Date.now() });
        }
    }
}

function renderFinalFade(fadeProgress) {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Durante el fade final, la imagen aparece gradualmente SIN máscara
    // Esto crea el efecto de que los trazos de coloreado se desvanecen y aparece la imagen completa
    
    // Dibujar imagen base con fade-in progresivo
    ctx.globalAlpha = fadeProgress; // La imagen aparece gradualmente
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        currentImage,
        layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
        layout.dx, layout.dy, layout.dw, layout.dh
    );
    ctx.globalAlpha = 1.0;
    
    // Los trazos de pincel se mantienen pero se desvanecen gradualmente con la máscara
    if (maskCanvas) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.globalAlpha = 1 - fadeProgress; // La máscara de trazos se desvanece
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#E89E54';
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalCompositeOperation = 'source-over';
    }
}

function renderFinalComplete() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    
    // Dibujar imagen completa sin máscara
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        currentImage,
        layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
        layout.dx, layout.dy, layout.dw, layout.dh
    );
}

function updateBrushMask() {
    // Dibujar elementos de brush con más variedad y 5 veces más gruesos
    brushElements.forEach(brush => {
        if (animationProgress >= brush.startTime) {
            const localProgress = Math.min((animationProgress - brush.startTime) / (1 - brush.startTime), 1);
            const currentRadius = brush.radius * localProgress * brush.growthRate;
            
            maskCtx.globalAlpha = brush.opacity * localProgress;
            maskCtx.fillStyle = 'white';
            
            // Diferentes tipos de brush para más variedad
            if (brush.type === 'bigBrush') {
                // Pinceladas grandes más suaves con gradientes más grandes
                const gradient = maskCtx.createRadialGradient(
                    brush.x, brush.y, 0,
                    brush.x, brush.y, currentRadius
                );
                gradient.addColorStop(0, 'rgba(255,255,255,1)');
                gradient.addColorStop(0.6, 'rgba(255,255,255,0.9)');
                gradient.addColorStop(0.8, 'rgba(255,255,255,0.6)');
                gradient.addColorStop(1, 'rgba(255,255,255,0)');
                maskCtx.fillStyle = gradient;
            } else {
                // Gradientes para brushes normales también más grandes
                const gradient = maskCtx.createRadialGradient(
                    brush.x, brush.y, 0,
                    brush.x, brush.y, currentRadius
                );
                gradient.addColorStop(0, 'rgba(255,255,255,1)');
                gradient.addColorStop(0.7, 'rgba(255,255,255,0.8)');
                gradient.addColorStop(1, 'rgba(255,255,255,0.2)');
                maskCtx.fillStyle = gradient;
            }
            
            maskCtx.beginPath();
            maskCtx.arc(brush.x, brush.y, currentRadius, 0, Math.PI * 2);
            maskCtx.fill();
        }
    });
    
    // Dibujar strokes ondulados conectores MÁS gruesos y MÁS ondulados
    strokeElements.forEach(stroke => {
        if (animationProgress >= stroke.startTime) {
            const localProgress = Math.min((animationProgress - stroke.startTime) / (1 - stroke.startTime), 1);
            
            maskCtx.globalAlpha = stroke.opacity * localProgress;
            maskCtx.strokeStyle = 'white';
            maskCtx.lineWidth = stroke.width * localProgress;
            maskCtx.lineCap = 'round';
            maskCtx.lineJoin = 'round';
            
            // Crear path ondulado MÁS complejo
            maskCtx.beginPath();
            
            const dx = stroke.endX - stroke.startX;
            const dy = stroke.endY - stroke.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.max(25, Math.floor(distance / 10)); // Más puntos para mayor suavidad
            
            maskCtx.moveTo(stroke.startX, stroke.startY);
            
            for (let i = 1; i <= steps; i++) {
                const t = (i / steps) * localProgress;
                if (t > 1) break;
                
                // Posición base en la línea recta
                const baseX = stroke.startX + dx * t;
                const baseY = stroke.startY + dy * t;
                
                // Calcular perpendicular para la onda
                const perpX = -dy / distance;
                const perpY = dx / distance;
                
                // Aplicar onda senoidal DOBLE más compleja y ondulada
                const primaryWave = Math.sin(t * stroke.waveFrequency * Math.PI + stroke.wavePhase) * 
                                  stroke.waveAmplitude * (1 - t * 0.1) * Math.sin(t * Math.PI * 0.8);
                
                const secondaryWave = Math.sin(t * stroke.secondaryFrequency * Math.PI * 2 + stroke.secondaryPhase) * 
                                     stroke.secondaryAmplitude * (1 - t * 0.2);
                
                // Onda terciaria para mayor complejidad
                const tertiaryWave = Math.cos(t * (stroke.waveFrequency * 0.7) * Math.PI + stroke.wavePhase * 1.3) * 
                                   (stroke.waveAmplitude * 0.3) * Math.sin(t * Math.PI);
                
                const totalWaveOffset = primaryWave + secondaryWave + tertiaryWave;
                
                const finalX = baseX + perpX * totalWaveOffset;
                const finalY = baseY + perpY * totalWaveOffset;
                
                if (i === 1) {
                    maskCtx.moveTo(finalX, finalY);
                } else {
                    maskCtx.lineTo(finalX, finalY);
                }
            }
            
            maskCtx.stroke();
        }
    });
    
    // Agregar efectos de wash y sealing progresivos MÁS intensos pero solo en los primeros 30 segundos
    if (animationProgress > 0.2 && animationProgress < 1.0) {
        const washProgress = (animationProgress - 0.2) / 0.8;
        
        // Efecto de lavado con puntos más grandes y más numerosos
        for (let i = 0; i < 35; i++) { // Aumentado de 20 a 35
            maskCtx.globalAlpha = 0.12 * washProgress; // Más intenso
            maskCtx.fillStyle = 'white';
            const x = Math.random() * size.w;
            const y = Math.random() * size.h;
            const r = 50 + Math.random() * 100; // 5 veces más grueso (10*5=50, 20*5=100)
            
            // Gradiente para wash también
            const washGradient = maskCtx.createRadialGradient(x, y, 0, x, y, r);
            washGradient.addColorStop(0, 'rgba(255,255,255,1)');
            washGradient.addColorStop(0.8, 'rgba(255,255,255,0.5)');
            washGradient.addColorStop(1, 'rgba(255,255,255,0)');
            maskCtx.fillStyle = washGradient;
            
            maskCtx.beginPath();
            maskCtx.arc(x, y, r, 0, Math.PI * 2);
            maskCtx.fill();
        }
    }
    
    // NO hacer sellado final automático - eso se hará solo en el fade final después de 30 segundos
}

function renderBrushPreview(progress) {
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#E89E54';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
}

// ==============================
// GESTOR DE SLIDESHOW (COPIADO DE BRUSH-REVEAL.JS)
// ==============================
let slideshowContainer = null;
let slideshowImages = [];
let currentSlideshowIndex = 0;
let slideshowTimeout = null;
let slideshowConfig = {
    enabled: false,
    folder: '3',
    width: 865,
    height: 972,
    x: 102,
    y: 153,
    interval: 6000,
    zIndex: 1000,
    shadowWidth: 20,
    shadowOpacity: 0.45
};

function configureSlideshowForBrush() {
    if (![3,7].includes(brushId)) {
        slideshowConfig.enabled = false;
        console.log(`📺 Slideshow deshabilitado para brush ${brushId}`);
        return;
    }
    slideshowConfig.enabled = true;
    if (brushId === 3) {
        slideshowConfig.folder = '3';
        slideshowConfig.width = 865;
        slideshowConfig.height = 972;
        slideshowConfig.x = 102;
        slideshowConfig.y = 153;
    } else { // brush 7
        slideshowConfig.folder = '4';
        slideshowConfig.width = 1670;
        slideshowConfig.height = 1912;
        slideshowConfig.x = 256;
        slideshowConfig.y = 300;
    }
    console.log(`📺 Slideshow configurado para brush ${brushId} usando carpeta ${slideshowConfig.folder}`);
}

const SLIDESHOW_FADE_MS = 1800;
let _slideshowTransitioning = false;

async function initSlideshow() {
    if (!slideshowConfig.enabled) {
        console.log(`📺 Slideshow no habilitado para brush ${brushId}`);
        return;
    }
    
    console.log(`📺 Inicializando slideshow para brush ${brushId}`);
    
    // Cargar imágenes
    try {
        const response = await fetch(`/api/slideshow/${slideshowConfig.folder}`);
        const data = await response.json();
        if (data.success) {
            slideshowImages = data.images.slice(0, 3); // Solo primeras 3
            console.log(`📺 Cargadas ${slideshowImages.length} imágenes del slideshow`);
            createSlideshowContainer();
            startSlideshow();
        }
    } catch (error) {
        console.error('Error cargando slideshow:', error);
    }
}

function createSlideshowContainer() {
    if (slideshowContainer) slideshowContainer.remove();
    
    slideshowContainer = document.createElement('div');
    slideshowContainer.id = 'slideshow-container';
    slideshowContainer.style.position = 'absolute';
    slideshowContainer.style.left = `${slideshowConfig.x}px`;
    slideshowContainer.style.top = `${slideshowConfig.y}px`;
    slideshowContainer.style.width = `${slideshowConfig.width}px`;
    slideshowContainer.style.height = `${slideshowConfig.height}px`;
    slideshowContainer.style.zIndex = slideshowConfig.zIndex;
    slideshowContainer.style.pointerEvents = 'none';
    slideshowContainer.style.overflow = 'hidden';
    
    // Wrapper de imágenes
    const imageWrapper = document.createElement('div');
    imageWrapper.id = 'slideshow-image-wrapper';
    imageWrapper.style.position = 'relative';
    imageWrapper.style.width = '100%';
    imageWrapper.style.height = '100%';
    imageWrapper.style.overflow = 'hidden';
    
    // Capa para imágenes
    const imagesLayer = document.createElement('div');
    imagesLayer.id = 'slideshow-images-layer';
    imagesLayer.style.position = 'absolute';
    imagesLayer.style.top = '0';
    imagesLayer.style.left = '0';
    imagesLayer.style.width = '100%';
    imagesLayer.style.height = '100%';
    imagesLayer.style.overflow = 'hidden';
    imageWrapper.appendChild(imagesLayer);
    
    slideshowContainer.appendChild(imageWrapper);
    
    // Sombras
    const shadowLeft = document.createElement('div');
    shadowLeft.style.position = 'absolute';
    shadowLeft.style.top = '0';
    shadowLeft.style.left = '0';
    shadowLeft.style.width = `${slideshowConfig.shadowWidth}px`;
    shadowLeft.style.height = '100%';
    shadowLeft.style.background = `linear-gradient(to right, rgba(0,0,0,${slideshowConfig.shadowOpacity}), transparent)`;
    shadowLeft.style.pointerEvents = 'none';
    shadowLeft.style.zIndex = '10';
    
    const shadowTop = document.createElement('div');
    shadowTop.style.position = 'absolute';
    shadowTop.style.top = '0';
    shadowTop.style.left = '0';
    shadowTop.style.width = '100%';
    shadowTop.style.height = `${slideshowConfig.shadowWidth}px`;
    shadowTop.style.background = `linear-gradient(to bottom, rgba(0,0,0,${slideshowConfig.shadowOpacity}), transparent)`;
    shadowTop.style.pointerEvents = 'none';
    shadowTop.style.zIndex = '10';
    
    slideshowContainer.appendChild(shadowLeft);
    slideshowContainer.appendChild(shadowTop);
    document.body.appendChild(slideshowContainer);
    
    console.log('📺 Contenedor de slideshow creado');
}

function startSlideshow() {
    stopSlideshow();
    
    if (slideshowImages.length === 0) return;
    
    console.log('📺 Iniciando slideshow');
    
    // Mostrar primera imagen
    const imagesLayer = document.getElementById('slideshow-images-layer');
    if (imagesLayer) {
        imagesLayer.innerHTML = '';
        const firstImg = createSlideshowImage(slideshowImages[currentSlideshowIndex], 1);
        imagesLayer.appendChild(firstImg);
    }
    
    // Programar cambios
    if (slideshowImages.length > 1) {
        scheduleNextSlide();
    }
}

function createSlideshowImage(src, initialOpacity = 0) {
    const img = document.createElement('img');
    img.src = src;
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.opacity = String(initialOpacity);
    img.style.transition = `opacity ${SLIDESHOW_FADE_MS}ms ease`;
    img.decoding = 'async';
    img.loading = 'eager';
    return img;
}

function scheduleNextSlide() {
    if (slideshowTimeout) clearTimeout(slideshowTimeout);
    
    slideshowTimeout = setTimeout(() => {
        currentSlideshowIndex = (currentSlideshowIndex + 1) % slideshowImages.length;
        addNextSlideshowImage();
        scheduleNextSlide();
    }, slideshowConfig.interval);
}

function addNextSlideshowImage() {
    const imagesLayer = document.getElementById('slideshow-images-layer');
    if (!imagesLayer || !slideshowImages || slideshowImages.length === 0) return;
    
    if (_slideshowTransitioning) return;
    _slideshowTransitioning = true;
    
    const nextSrc = slideshowImages[currentSlideshowIndex];
    const prevImgs = Array.from(imagesLayer.querySelectorAll('img'));
    const prevTop = prevImgs.length ? prevImgs[prevImgs.length - 1] : null;
    
    // Crear nueva imagen
    const nextImg = createSlideshowImage(nextSrc, 0);
    imagesLayer.appendChild(nextImg);
    
    // Iniciar fade después de que la imagen esté lista
    setTimeout(() => {
        nextImg.style.opacity = '1';
        if (prevTop) prevTop.style.opacity = '0';
        
        setTimeout(() => {
            // Limpiar imágenes anteriores
            const imgs = Array.from(imagesLayer.querySelectorAll('img'));
            while (imgs.length > 2) {
                const toRemove = imgs.shift();
                if (toRemove && toRemove !== nextImg) toRemove.remove();
            }
            _slideshowTransitioning = false;
        }, SLIDESHOW_FADE_MS + 100);
    }, 50);
}

function stopSlideshow() {
    if (slideshowTimeout) {
        clearTimeout(slideshowTimeout);
        slideshowTimeout = null;
    }
}

// ==============================
// GESTOR DE VIDEO FULLSCREEN (CORREGIDO)
// ==============================
let fullscreenVideo = null;

function initFullscreenVideo() {
    // Video fullscreen para logos basado en brush-reveal.js: brushId [1, 4, 5, 9]
    if (![1, 4, 5, 9].includes(brushId)) return;
    
    fullscreenVideo = document.createElement('video');
    fullscreenVideo.id = 'fullscreen-video';
    fullscreenVideo.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        z-index: 9999;
        display: none;
        pointer-events: none;
        background: #000;
    `;
    fullscreenVideo.muted = true;
    fullscreenVideo.playsInline = true;
    fullscreenVideo.preload = 'auto';
    fullscreenVideo.loop = true;
    
    document.body.appendChild(fullscreenVideo);
    console.log(`📹 Video fullscreen inicializado para brush ${brushId}`);
}

function playFullscreenVideo() {
    // Solo reproducir video para logos en brushes específicos [1, 4, 5, 9]
    if (!fullscreenVideo || ![1, 4, 5, 9].includes(brushId)) return;
    
    console.log(`📹 Reproduciendo video fullscreen en brush ${brushId} para logo`);
    
    // Mostrar video
    fullscreenVideo.style.display = 'block';
    fullscreenVideo.src = '/vid.mp4';
    
    // Reproducir con manejo de errores
    fullscreenVideo.play()
        .then(() => {
            console.log('✅ Video fullscreen reproduciéndose');
        })
        .catch((error) => {
            console.error('❌ Error reproduciendo video:', error);
            // Intentar de nuevo después de un momento
            setTimeout(() => {
                fullscreenVideo.play().catch(console.error);
            }, 500);
        });
}

function stopFullscreenVideo() {
    if (!fullscreenVideo) return;
    
    console.log('⏹️ Deteniendo video fullscreen');
    fullscreenVideo.pause();
    fullscreenVideo.currentTime = 0;
    fullscreenVideo.style.display = 'none';
}

// ==============================
// WEBSOCKET Y EVENTOS
// ==============================
let socket = null;

function setupWebSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('🔌 Conectado al servidor');
        socket.emit('registerScreen', { type: 'brush-reveal', brushId });
    });
    
    socket.on('brushRevealConfigUpdate', (data) => {
        if (data.brushId === brushId) {
            brushConfig = data.config;
            console.log(`🔄 Config actualizada: offsetX=${brushConfig.offsetX}, offsetY=${brushConfig.offsetY}`);
            calculateLayout();
            render();
        }
    });
    
    socket.on('nextColorStep', (data) => {
        console.log(`🎨 Nuevo paso de color: ${data.pattern}`);
        setCurrentImage(data.pattern).then(() => {
            startColoring(); // Esto ahora incluye fade-in del fondo automáticamente
            
            // Video SOLO para logos en brushes específicos [1, 4, 5, 9]
            // Para el RESTO de IDs (2, 3, 6, 7, 8, etc.) los logos se muestran SIN video
            if (/logo1|logo2/.test(data.pattern) && [1, 4, 5, 9].includes(brushId)) {
                console.log(`📹 Reproduciendo video para logo en brush ${brushId}`);
                playFullscreenVideo();
            } else {
                console.log(`🖼️ Mostrando logo SIN video en brush ${brushId}`);
                stopFullscreenVideo();
            }
        });
    });
    
    socket.on('slideshowConfigUpdate', (data) => {
        if (data.brushId === brushId) {
            Object.assign(slideshowConfig, data.config);
            console.log('📺 Config slideshow actualizada');
            if (slideshowContainer) {
                slideshowContainer.style.left = slideshowConfig.x + 'px';
                slideshowContainer.style.top = slideshowConfig.y + 'px';
                slideshowContainer.style.width = slideshowConfig.width + 'px';
                slideshowContainer.style.height = slideshowConfig.height + 'px';
            }
        }
    });
    
    socket.on('forceWallpaperPattern', () => {
        console.log('🖼️ Forzando mostrar wallpaper.jpg');
        setCurrentImage('wallpaper.jpg').then(() => {
            startColoring(); // Esto ahora incluye fade-in del fondo automáticamente
            stopFullscreenVideo(); // No hay video para wallpaper
        });
    });
}

// ==============================
// INICIALIZACIÓN
// ==============================
async function init() {
    console.log('🚀 Inicializando Brush Reveal Minimal...');
    
    // Setup básico
    resize();
    window.addEventListener('resize', resize);
    
    // WebSocket
    setupWebSocket();
    
    // Configurar slideshow según brush
    configureSlideshowForBrush();

    // Cargar imagen por defecto
    await setCurrentImage('wallpaper.jpg');
    
    // Inicializar slideshow si aplica
    await initSlideshow();
    
    // Inicializar video si aplica
    initFullscreenVideo();
    
    console.log('✅ Inicialización completa');
}

// Pausar/reanudar en cambio de visibilidad
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopSlideshow();
        stopFullscreenVideo();
    } else if (slideshowConfig.enabled) {
        startSlideshow();
    }
});

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
