// ==============================
// BRUSH REVEAL MINIMAL - VERSIÓN SIMPLIFICADA
// Con slideshow funcional y coloreado tipo brush correcto
// ==============================

// CONFIGURACIÓN BÁSICA
const DURATION_MS = 30000; // 30 segundos para coloreado más lento (colores)
// Logos: acelerar fade-in y soportar crossfade directo
const LOGO_FADE_IN_DURATION_MS = 1500; // antes 9000ms
const LOGO_CROSSFADE_MS = 900; // duración crossfade logo1<->logo2
// Eliminado delay artificial: revelar imagen desde el primer frame de coloreo
const IMAGE_REVEAL_DELAY_MS = 0;
// Eliminamos fade final: la imagen queda estática hasta próximo patrón
const FADE_FINAL_DURATION = 0; // (legacy constant retained to avoid ref errors)
const FADE_OUT_DURATION = 3000; // 3 segundos para fade-out entre transiciones
// Fade-in aún más rápido (antes 2400, original 3000)
const BACKGROUND_FADE_IN_DURATION = 1600; // 1.6s total
// Iniciar coloreo MUCHO antes para reducir vacío visual
const EARLY_COLORING_THRESHOLD = 0.18; // 18% (~288ms) del fade
// Acelerar la cola del fade una vez que comenzó el coloreo para no prolongar fondo "plano"
const FADE_TAIL_ACCEL_EXP = 0.6; // <1 => acelera
const WALLPAPER_SECTION_WIDTH = 2160;
const WALLPAPER_SECTION_HEIGHT = 3840;
const WALLPAPER_TOTAL_WIDTH = 6480;

// Detectar brushId de la URL - CORREGIDO para funcionar con brush-minimal.html y brush-reveal
function getBrushId() {
    // Detectar /brush-minimal/X
    let match = window.location.pathname.match(/\/brush-minimal\/(\d+)/);
    if (match) {
        console.log('[ID] Detectado por path /brush-minimal/:', match[1]);
        return parseInt(match[1]);
    }
    // Detectar /brush-reveal/X
    match = window.location.pathname.match(/\/brush-reveal\/(\d+)/);
    if (match) {
        console.log('[ID] Detectado por path /brush-reveal/:', match[1]);
        return parseInt(match[1]);
    }
    // Detectar /screen/X
    match = window.location.pathname.match(/\/screen\/(\d+)/);
    if (match) {
        console.log('[ID] Detectado por path /screen/:', match[1]);
        return parseInt(match[1]);
    }
    // Parámetro ?brushId=
    const urlParams = new URLSearchParams(window.location.search);
    const brushIdParam = urlParams.get('brushId');
    if (brushIdParam) {
        console.log('[ID] Detectado por query param brushId=', brushIdParam);
        return parseInt(brushIdParam);
    }
    if (window.location.pathname.includes('brush-minimal')) {
        console.log('[ID] Default brush-minimal => 1');
        return 1;
    }
    return 1;
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
    
    // Recalcular layout (no render inmediato: dejamos que el fade-in del fondo gestione la primera aparición)
    calculateLayout();
    // No llamar render() directo para asegurar que SIEMPRE las transiciones usan el fade-in de fondo
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
    ctx.fillStyle = '#FABCAF';
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
        ctx.fillStyle = '#FABCAF';
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

// NUEVO: variables para manejar la próxima petición de patrón antes de que se cargue
let upcomingPatternName = null; // e.g. 'amarillo.jpg'
let upcomingIsLogoType = false;
let lastPatternRequestedAt = 0;
let lastPatternName = null;

// Variables para fade-in de logos
let logoFadeActive = false;
let logoCrossfadeActive = false;
let logoCrossfadeStartTime = 0;
let previousLogoImage = null;

// Variables para fade-out
let fadeOutActive = false;
let fadeOutProgress = 0;
let fadeOutStartTime = 0;
let nextImageToLoad = null;

// Variables para fade-in del fondo anaranjado
let backgroundFadeInActive = false;
let backgroundFadeInProgress = 0;
let backgroundFadeInStartTime = 0;
let earlyColoringStarted = false;
let earlyColoringTimeout = null;
// NUEVO: soporte de crossfade
let previousFrameCanvas = null;
let previousFrameCtx = null;
let hasPreviousFrame = false;
let pendingAction = null; // 'coloring' o 'logoFadeIn'

// Variable para cargar imagen DURANTE el coloreado (no antes del fade-in)
let pendingImageToLoad = null;
// Modo wallpaper (hold) para mostrar wallpaper sin avanzar secuencia
let wallpaperHoldActive = false;
let wallpaperHoldTimeout = null;
const WALLPAPER_HOLD_CLIENT_MS = 45000; // debe coincidir con servidor

// Elementos para simular brushes y strokes como en brush-reveal.js
let brushElements = [];
let strokeElements = [];

function initBrushElements() {
    brushElements = [];
    strokeElements = [];

    // MEJORADO: más elementos inmediatos y más grandes para visibilidad en primeros 3 segundos
    const numBrushes = 80 + Math.random() * 60; // 80-140 (antes 60-100)
    for (let i = 0; i < numBrushes; i++) {
        brushElements.push({
            x: Math.random() * size.w,
            y: Math.random() * size.h,
            radius: 180 + Math.random() * 400, // más grandes: 180-580 (antes 120-420)
            opacity: 0.45 + Math.random() * 0.65, // más opacidad: 0.45-1.1 (antes 0.35-0.9)
            growthRate: 1.5 + Math.random() * 1.2, // crecimiento más rápido
            startTime: Math.random() * 0.3 // aparición más temprana: 0-30% (antes 40%)
        });
    }

    const numStrokes = 60 + Math.random() * 40; // 60-100 (antes 40-60)
    for (let i = 0; i < numStrokes; i++) {
        strokeElements.push({
            startX: Math.random() * size.w,
            startY: Math.random() * size.h,
            endX: Math.random() * size.w,
            endY: Math.random() * size.h,
            width: 75 + Math.random() * 180, // más anchos: 75-255 (antes 55-195)
            opacity: 0.4 + Math.random() * 0.6, // más opacidad
            startTime: Math.random() * 0.2, // aparición muy temprana: 0-20% (antes 30%)
            waveAmplitude: 60 + Math.random() * 120, // ondas más pronunciadas
            waveFrequency: 2.5 + Math.random() * 8,
            wavePhase: Math.random() * Math.PI * 2,
            secondaryAmplitude: 25 + Math.random() * 50,
            secondaryFrequency: 1.0 + Math.random() * 3,
            secondaryPhase: Math.random() * Math.PI * 2
        });
    }

    const numBigBrushes = 25 + Math.random() * 35; // más elementos grandes: 25-60 (antes 15-35)
    for (let i = 0; i < numBigBrushes; i++) {
        brushElements.push({
            x: Math.random() * size.w,
            y: Math.random() * size.h,
            radius: 450 + Math.random() * 800, // mucho más grandes: 450-1250 (antes 350-1000)
            opacity: 0.35 + Math.random() * 0.55, // más opacidad
            growthRate: 1.1 + Math.random() * 0.9, // crecimiento más rápido
            startTime: Math.random() * 0.15, // aparición súper temprana: 0-15% (antes 25%)
            type: 'bigBrush'
        });
    }

    // MUCHAS MÁS semillas inmediatas para visibilidad en primeros 3 segundos
    brushElements.slice(0, 24).forEach(b => b.startTime = 0); // 24 inmediatos (antes 12)
    strokeElements.slice(0, 16).forEach(s => s.startTime = 0); // 16 inmediatos (antes 8)
    console.log(`🖌️ Brushes inicializados: ${brushElements.length} (${24} semillas inmediatas visibles)`);
}

function startColoring(actionOverride = null) {
    if (animationActive || logoFadeActive || fadeOutActive || backgroundFadeInActive) return;
    // Forzar acción pendiente según override o tipo de la PRÓXIMA imagen (si ya fue preclasificada)
    if (actionOverride) {
        pendingAction = actionOverride;
    } else if (upcomingPatternName) {
        pendingAction = upcomingIsLogoType ? 'logoFadeIn' : 'coloring';
    } else {
        pendingAction = isLogoType ? 'logoFadeIn' : 'coloring';
    }
    console.log(`🎨 Iniciando fade-in del fondo anaranjado antes de ${pendingAction}...`);
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
    // Capturar frame previo para crossfade sólo si no fue preparado externamente
    if (!hasPreviousFrame) {
        try {
            if (!previousFrameCanvas) {
                previousFrameCanvas = document.createElement('canvas');
                previousFrameCtx = previousFrameCanvas.getContext('2d');
            }
            previousFrameCanvas.width = size.w;
            previousFrameCanvas.height = size.h;
            previousFrameCtx.clearRect(0,0,size.w,size.h);
            previousFrameCtx.drawImage(canvas,0,0);
            hasPreviousFrame = true;
        } catch(e) {
            hasPreviousFrame = false;
        }
    }

    // Iniciar fade-in del fondo
    backgroundFadeInActive = true;
    backgroundFadeInProgress = 0;
    backgroundFadeInStartTime = performance.now();
    
    // Programar inicio anticipado de coloreo (solo para patrones de color / wallpaper NO logos)
    earlyColoringStarted = false;
    if (pendingAction === 'coloring' && !isLogoType) {
        // Fallback por timeout (por si frame rate bajo): inicia tras threshold*duración
        earlyColoringTimeout = setTimeout(() => {
            if (!animationActive && backgroundFadeInActive && !earlyColoringStarted) {
                console.log('⚡ Inicio anticipado de coloreo (timeout)');
                earlyColoringStarted = true;
                executeColoring();
            }
        }, Math.max(50, BACKGROUND_FADE_IN_DURATION * EARLY_COLORING_THRESHOLD));
    }
    rafId = requestAnimationFrame(backgroundFadeInLoop);
}

function backgroundFadeInLoop(timestamp) {
    if (!backgroundFadeInActive) return;
    
    const elapsed = timestamp - backgroundFadeInStartTime;
    const raw = Math.min(elapsed / BACKGROUND_FADE_IN_DURATION, 1);
    // Aplicar aceleración de la porción final después de iniciar coloreo
    if (earlyColoringStarted && raw > EARLY_COLORING_THRESHOLD) {
        const t = (raw - EARLY_COLORING_THRESHOLD) / (1 - EARLY_COLORING_THRESHOLD); // 0..1
        const fast = Math.pow(t, FADE_TAIL_ACCEL_EXP);
        backgroundFadeInProgress = EARLY_COLORING_THRESHOLD + fast * (1 - EARLY_COLORING_THRESHOLD);
    } else {
        backgroundFadeInProgress = raw;
    }
    
    // Renderizar fade-in del fondo
    renderBackgroundFadeIn();
    
    // Inicio anticipado basado en progreso (sin esperar timeout) solo para coloreo
    if (!earlyColoringStarted && pendingAction === 'coloring' && !isLogoType && backgroundFadeInProgress >= EARLY_COLORING_THRESHOLD) {
        if (earlyColoringTimeout) { clearTimeout(earlyColoringTimeout); earlyColoringTimeout = null; }
        if (!animationActive) {
            console.log(`⚡ Inicio anticipado de coloreo al ${(backgroundFadeInProgress*100).toFixed(1)}% del fade`);
            earlyColoringStarted = true;
            executeColoring(); // Comienza mientras el fondo sigue apareciendo
        }
    }

    if (backgroundFadeInProgress < 1) {
        rafId = requestAnimationFrame(backgroundFadeInLoop);
    } else {
        // Fade-in del fondo completado, ejecutar acción pendiente
        backgroundFadeInActive = false;
        rafId = 0;
        console.log('✅ Fade-in del fondo completado, iniciando animación...');
        // Evitar doble inicio si ya hicimos early start
        if (pendingAction === 'logoFadeIn') {
            executeLogoFadeIn();
        } else if (pendingAction === 'coloring' && !animationActive) {
            executeColoring();
        }
        
        pendingAction = null;
    }
}

function renderBackgroundFadeIn() {
    // Base: crossfade entre frame previo y fondo naranja
    ctx.clearRect(0,0,size.w,size.h);
    if (hasPreviousFrame) {
        ctx.globalAlpha = 1 - backgroundFadeInProgress;
        ctx.drawImage(previousFrameCanvas,0,0);
        ctx.globalAlpha = 1.0;
    }
    ctx.globalAlpha = backgroundFadeInProgress;
    ctx.fillStyle = '#FABCAF';
    ctx.fillRect(0,0,size.w,size.h);
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
    console.log('🎨 Ejecutando fade-in para logo (rápido, sin fade-out)...');
    logoCrossfadeActive = false;
    previousLogoImage = null;
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
    
    // Durante fade-in del fondo, usamos crossfade + (si ya inició) el coloreo sobre capa
    if (backgroundFadeInActive) {
        // Dibujar base crossfade
        renderBackgroundFadeIn();
        // Si el coloreo ya inició (early start), sobreponer imagen con máscara parcial
        if (animationActive && !isLogoType) {
            // Aplicar máscara actual sin limpiar base crossfade
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            // Dibujar imagen completa primero en buffer temporal
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = size.w; tempCanvas.height = size.h;
            const tctx = tempCanvas.getContext('2d');
            tctx.drawImage(
                currentImage,
                layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
                layout.dx, layout.dy, layout.dw, layout.dh
            );
            // Aplicar máscara
            if (maskCanvas) {
                tctx.globalCompositeOperation = 'destination-in';
                tctx.drawImage(maskCanvas,0,0);
            }
            // Mezclar sobre lienzo principal con ligera ganancia de alpha para suavizar aparición
            ctx.globalAlpha = Math.min(1, backgroundFadeInProgress + 0.15);
            ctx.drawImage(tempCanvas,0,0);
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }
        return; // Evitar render normal hasta que termine fade-in
    }
    
    // Limpiar canvas
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#FABCAF';
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
        ctx.fillStyle = '#FABCAF';
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.globalAlpha = 1.0;
}

function logoFadeLoop(timestamp) {
    if (!logoFadeActive) return;
    const elapsed = timestamp - animationStartTime;
    if (elapsed < LOGO_FADE_IN_DURATION_MS) {
        animationProgress = elapsed / LOGO_FADE_IN_DURATION_MS;
        renderLogoFadeIn();
        rafId = requestAnimationFrame(logoFadeLoop);
    } else {
        animationProgress = 1;
        renderLogoFadeIn(); // mantener dibujado
        logoFadeActive = false;
        rafId = 0;
        console.log('✅ Logo visible (fade-in completo, sin fade-out)');
        if (socket && socket.connected) {
            socket.emit('animationCompleted', { brushId, pattern: currentImageType, timestamp: Date.now() });
        }
    }
}

function startLogoCrossfade(newImg) {
    if (!currentImage) { currentImage = newImg; executeLogoFadeIn(); return; }
    console.log('🔀 Crossfade logo -> logo');
    previousLogoImage = currentImage;
    currentImage = newImg;
    calculateLayout();
    logoFadeActive = false;
    logoCrossfadeActive = true;
    logoCrossfadeStartTime = performance.now();
    rafId = requestAnimationFrame(logoCrossfadeLoop);
}

function logoCrossfadeLoop(timestamp) {
    if (!logoCrossfadeActive) return;
    const elapsed = timestamp - logoCrossfadeStartTime;
    const p = Math.min(1, elapsed / LOGO_CROSSFADE_MS);
    renderLogoCrossfade(p);
    if (p < 1) {
        rafId = requestAnimationFrame(logoCrossfadeLoop);
    } else {
        logoCrossfadeActive = false;
        previousLogoImage = null;
        console.log('✅ Crossfade logos completado');
        if (socket && socket.connected) {
            socket.emit('animationCompleted', { brushId, pattern: currentImageType, timestamp: Date.now() });
        }
    }
}

function renderLogoCrossfade(progress) {
    ctx.clearRect(0,0,size.w,size.h);
    ctx.fillStyle = '#FABCAF';
    ctx.fillRect(0,0,size.w,size.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (previousLogoImage) {
        ctx.globalAlpha = 1 - progress;
        drawLogoImage(previousLogoImage);
    }
    ctx.globalAlpha = progress;
    drawLogoImage(currentImage);
    ctx.globalAlpha = 1;
}

// (renderLogoFadeOut eliminado)

function drawLogoImage(img) {
    if (!img) return;
    if ([1,4,5,9].includes(brushId) || [3,7].includes(brushId)) {
        ctx.drawImage(
            img,
            layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
            layout.dx, layout.dy, layout.dw, layout.dh
        );
    } else {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const scaleW = size.w / imgW;
        const scaleH = size.h / imgH;
        const scale = Math.max(scaleW, scaleH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = (size.w - drawW) / 2;
        const drawY = (size.h - drawH) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
}

function renderLogoFadeIn() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    ctx.clearRect(0,0,size.w,size.h);
    ctx.fillStyle = '#FABCAF';
    ctx.fillRect(0,0,size.w,size.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const effectiveProgress = animationProgress;
    ctx.globalAlpha = effectiveProgress;
    drawLogoImage(currentImage);
    ctx.globalAlpha = 1;
}

function coloringLoop(timestamp) {
    if (!animationActive) return;
    const elapsed = timestamp - animationStartTime;

    if (elapsed < DURATION_MS) { // fase de coloreado
        animationProgress = elapsed / DURATION_MS;

        updateBrushMask();
        render();
        rafId = requestAnimationFrame(coloringLoop);
    } else { // terminado SIN fade final
        animationActive = false;
        rafId = 0;
        console.log('✅ Coloreado completado (sin fade final, imagen permanece estática)');
        renderFinalComplete(); // mostrar imagen completa sin máscara
        // No se hace ningún fade-out ni reset: se espera próximo patrón
        if (socket && socket.connected) {
            socket.emit('animationCompleted', { brushId, pattern: currentImageType, timestamp: Date.now() });
        }
        // Limpiar máscara para que no se reutilice en próximo ciclo accidentalmente
        maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
    }
}

// (renderFinalFade eliminado: ya no se usa fade final)

function renderFinalComplete() {
    if (!currentImage || !layout.dw || !layout.dh) return;
    
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo
    ctx.fillStyle = '#FABCAF';
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

// renderBrushPreview eliminado: ahora la imagen se revela desde el primer frame con la máscara

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
    // Asegurar visibilidad (plantilla HTML lo tenía posiblemente oculto)
    slideshowContainer.style.display = 'block';
    
    console.log('📺 Contenedor de slideshow creado');
}

function startSlideshow() {
    stopSlideshow();
    
    if (slideshowImages.length === 0) return;
    
    console.log('📺 Iniciando slideshow');
    if (slideshowContainer) slideshowContainer.style.display = 'block';
    
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
    
    function requestPattern(pattern) {
        const now = Date.now();
        // Dedupe rápida para eventos duplicados (especialmente wallpaper)
        if (pattern === lastPatternName && (now - lastPatternRequestedAt) < 800) {
            console.log(`⏩ Ignorando patrón duplicado reciente: ${pattern}`);
            return;
        }
        lastPatternName = pattern;
        lastPatternRequestedAt = now;
        upcomingPatternName = pattern;
        upcomingIsLogoType = /logo1|logo2/.test(pattern);
        pendingImageToLoad = null; // Usaremos carga anticipada tras fade-in fondo
        nextImageToLoad = null;
        // NUEVO: transición directa sin fadeOut - capturamos frame actual y arrancamos nuevo fade-in
        // Detener animaciones en curso SIN limpiar canvas (preservamos el frame para crossfade)
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        animationActive = false;
        logoFadeActive = false;
        fadeOutActive = false;

        // Capturar frame actual antes de modificar
        try {
            if (!previousFrameCanvas) {
                previousFrameCanvas = document.createElement('canvas');
                previousFrameCtx = previousFrameCanvas.getContext('2d');
            }
            previousFrameCanvas.width = size.w;
            previousFrameCanvas.height = size.h;
            previousFrameCtx.clearRect(0,0,size.w,size.h);
            previousFrameCtx.drawImage(canvas,0,0);
            hasPreviousFrame = true;
        } catch(e) {
            hasPreviousFrame = false;
        }

        // Cargar nueva imagen y decidir transición
        loadImage(pattern).then(img => {
            if (!img) return;
            const newIsLogo = /logo1|logo2/.test(pattern);
            if (newIsLogo && isLogoType && currentImage) {
                // crossfade logo→logo sin fondo naranja intermedio
                startLogoCrossfade(img);
                isLogoType = true; isColorType = false; isWallpaperType = false;
                currentImageType = pattern.replace('.jpg','');
            } else {
                currentImage = img;
                currentImageType = pattern.replace('.jpg','');
                isWallpaperType = pattern.includes('wallpaper');
                isColorType = /amarillo|azul|rojo/.test(pattern);
                isLogoType = newIsLogo;
                calculateLayout();
                startColoring(newIsLogo ? 'logoFadeIn' : 'coloring');
            }
        });

        // Video para logos sólo en brushes específicos
        if (/logo1|logo2/.test(pattern) && [1,4,5,9].includes(brushId)) {
            playFullscreenVideo();
        } else if (/logo1|logo2/.test(pattern)) {
            stopFullscreenVideo(); // asegurar que no quede video colgado
        } else {
            stopFullscreenVideo();
        }
    }

    socket.on('nextColorStep', (data) => {
        if (wallpaperHoldActive) {
            console.log('⏸️ Ignorando nextColorStep durante wallpaperHold');
            return;
        }
        console.log(`🎨 Nuevo paso de color: ${data.pattern}`);
        requestPattern(data.pattern);
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
        requestPattern('wallpaper.jpg');
    });

    // Helper unificado para aplicar modo wallpaper con fade-in identico al botón
    function applyWallpaperMode(sourceLabel = 'desconocido', sequenceId = null) {
        if (wallpaperHoldActive) {
            console.log('🖼️ Ya en wallpaperHold, se ignora solicitud duplicada');
            return;
        }
        console.log(`🖼️ Aplicando modo wallpaper (origen=${sourceLabel}${sequenceId?` seq=${sequenceId}`:''})`);
        wallpaperHoldActive = true;
        if (wallpaperHoldTimeout) clearTimeout(wallpaperHoldTimeout);
        wallpaperHoldTimeout = setTimeout(() => {
            wallpaperHoldActive = false;
            console.log('▶️ Fin de wallpaperHold, se reanuda secuencia entrante');
            // solicitar al servidor el último paso para sincronizar
            try { socket.emit('requestLastColorStep'); } catch(_) {}
        }, WALLPAPER_HOLD_CLIENT_MS);
        requestPattern('wallpaper.jpg');
    }

    // NUEVO: Al recibir confirmación de que wallpaper fue guardado (flujo tecla "1")
    socket.on('wallpaperSaved', (data) => {
        if (!data || !data.success) return;
        applyWallpaperMode('wallpaperSaved');
    });

    // NUEVO: Soporte explícito para switchToWallpaperMode emitido por el servidor / botón
    socket.on('switchToWallpaperMode', (data) => {
        applyWallpaperMode('switchToWallpaperMode', data?.sequenceId);
    });

    // NUEVO: Al volver a modo secuencia pedir el último paso de color para enganchar transición
    socket.on('switchToSequenceMode', () => {
        console.log('🔁 switchToSequenceMode recibido - solicitando último paso de color');
        // Solicitar al servidor el último paso para mantener sincronía
        try { socket.emit('requestLastColorStep'); } catch(_) {}
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
    
    // Configurar slideshow según brush (antes de sockets para logs correctos)
    configureSlideshowForBrush();

    // WebSocket
    setupWebSocket();

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
