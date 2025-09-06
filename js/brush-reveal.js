// Ajustes generales - OPTIMIZADOS PARA COLOREADO COMPLETO Y SINCRONIZACIÓN
const DURATION_MS = 14000; // 14s - más lento para completar toda la imagen por igual
// Usar DPR dinámico (devicePixelRatio) para mantener resolución nativa en pantallas HiDPI
// Inicializamos con el valor actual, y lo recalculamos en `resize()` para adaptarnos a cambios.
let DPR = Math.max(1, window.devicePixelRatio || 1);
// Máscara a resolución completa para evitar bordes/jaggies visibles (el tamaño real se forza en resize)
const MAX_UNITS_PER_FRAME = 250; // reducido para coloreado más lento y uniforme
const FINAL_SEAL_START = 0.35; // iniciar sellado temprano para cobertura completa
const FINAL_SEAL_ALPHA_MIN = 0.20; // opacidad más alta para mejor cobertura
const FINAL_SEAL_ALPHA_MAX = 0.35; // opacidad más alta para mejor cobertura
const FINAL_SEAL_CHUNK_BASE = 15; // trabajo moderado por frame para cerrar huecos
const WASH_START = 0.45; // iniciar lavado antes para cobertura completa
const WASH_CHUNK_BASE = 30; // más wash por frame para cobertura completa
const MAX_STEPS_PER_ENTITY_FRAME = 5; // permitir más pasos por entidad para coloreado

// Detectar brushId de la URL
function getBrushIdFromURL() {
  const path = window.location.pathname;
  const match = path.match(/\/brush-reveal\/(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }
  return 1; // Default a brush ID 1 si no hay ID en la URL
}

const brushId = getBrushIdFromURL();
console.log(`🎯 Brush ID detectado: ${brushId}`);

// Configuración de offsets para dividir wallpaper.jpg (6480x3840) en secciones de 2160x3840
const WALLPAPER_SECTION_WIDTH = 2160;
const WALLPAPER_SECTION_HEIGHT = 3840;
const WALLPAPER_TOTAL_WIDTH = 6480;

// Variables globales de configuración de brush
let brushConfig = {
  offsetX: 0,
  offsetY: 0
};

const container = document.getElementById('container');
const canvas = document.querySelector('.js-canvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
// Helper para asegurar alta calidad de suavizado en contextos 2D
function ensureHQ(g){
  try {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
  } catch(_) {}
}
ensureHQ(ctx);
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { alpha: true, desynchronized: true });
ensureHQ(maskCtx);
// Asegurar interpolación de alta calidad; tras cada resize se vuelve a aplicar dentro de resize()
// Eventos de dibujo del frame actual (para depuración exacta)
let drawEvents = [];

// Imagen seleccionada actual
let selectedImage = 'red';

// Control de inicialización
let hasInitialAnimationStarted = false;

// Variables del slideshow
let slideshowConfig = {
  enabled: true, // Activado por defecto
  folder: '3',
  width: 865,  // Nuevos valores por defecto para brush-3
  height: 972,
  x: 102,
  y: 153,
  interval: 6000,
  zIndex: 1000,
  shadowWidth: 20,  // Nuevo: Ancho de sombra por defecto
  shadowOpacity: 0.45 // Nuevo: Opacidad de sombra por defecto (50% más oscuro)
};
// Duración del crossfade (ms) - más largo para transición suave
const SLIDESHOW_FADE_MS = 1800;
let slideshowImages = [];
let currentSlideshowIndex = 0;
let slideshowInterval = null; // Initialize slideshow interval
let slideshowContainer = null;
// Slideshow scheduling helpers
let _slideshowTimeoutId = null; // timeout-based scheduler id
let _slideshowTransitioning = false; // guard to avoid overlapping transitions
// Control de ciclos y video
let slideshowCycleCount = 0; // cuenta de vueltas completas (recorrer todas las imágenes)
let inVideoPlayback = false; // bandera mientras se reproduce el video
let slideshowVideoEl = null; // referencia al elemento <video>
// Video forzado por logos (logo1 / logo2)
let videoForcedByLogo = false;

// Flags para controlar características del slideshow/video
// Desactivamos cualquier reproducción de video para evitar bloqueos del slideshow
const ENABLE_SLIDESHOW_VIDEO = false;
const ENABLE_LOGO_VIDEO = false;

// Patrones para alternar secuencialmente
let patterns = [];
let currentPatternIndex = 0; // Índice del patrón actual
// Flag: patrones listos para usar (evita fallback prematuro a amarillo en el arranque)
let patternsReady = false;

// Variables para rotación automática de patrones
let automaticRotationEnabled = false;
let rotationInterval = null;
// Rotación por defecto limitada a patrones permitidos (excluye amarillo/azul)
let rotationPatterns = ['rojo'];
let currentRotationIndex = 0;
let rotationIntervalTime = 120000; // 2 minutos por defecto
let rotationAnchorTs = null; // marca de tiempo compartida desde el servidor

// Estado guardado de la secuencia para reanudar tras mostrar wallpaper
let savedSequenceState = null;

const brushSrcs = [
  '/Stroke/blue-watercolor-brush-stroke-1.png',
  '/Stroke/blue-watercolor-brush-stroke-2.png',
  '/Stroke/blue-watercolor-brush-stroke-6.png',
  '/Stroke/blue-watercolor-brush-stroke-7.png',
  '/Stroke/blue-watercolor-brush-stroke-14.png'
];
let maskBrushes = [];

// Función para obtener el patrón actual - SIMPLIFICADA Y ROBUSTA
function getCurrentPattern() {
  // Verificar si hay patrones cargados
  if (!patterns || patterns.length === 0) {
    if (!patternsReady) {
      // En arranque: esperar a que se carguen los patrones en lugar de forzar amarillo
      console.warn('⏳ Patrones aún no listos; se omite render hasta que estén cargados');
      return null;
    } else {
  console.warn('⚠️ No hay patrones tras estar listos - cargando fallback permitido (wallpaper/rojo)');
  // Solo como recuperación post-arranque
  loadDefaultPattern();
      return null;
    }
  }
  
  // Asegurar que el índice esté dentro del rango
  if (currentPatternIndex >= patterns.length) {
    currentPatternIndex = patterns.length - 1;
  }
  if (currentPatternIndex < 0) {
    currentPatternIndex = 0;
  }
  
  const currentPattern = patterns[currentPatternIndex];
  if (!currentPattern || !currentPattern.image) {
    console.error('⚠️ Patrón actual inválido - reargando sistema...');
    loadDefaultPattern();
    return null;
  }
  
  return currentPattern.image;
}

// Variables para la secuencia automática de coloreado
let autoColorSequence = {
  active: false,
  // Empezar con un color distinto al fondo para que el primer paso sea visible
  patterns: ['rojo.jpg'],
  currentIndex: 0,
  interval: null, // deprecado: ya no usamos setInterval
  intervalTime: 40000, // esperar 40s DESPUÉS de terminar de colorear (default configurable)
  timeoutId: null, // timeout para el siguiente paso
  nextStepScheduled: false, // guardia para programar el siguiente paso una sola vez al finalizar
  // Watchdog para asegurar avance aunque falle la programación en loop-end
  watchdogId: null,
  // Flag para evitar pasos solapados
  isRunning: false,
  stepId: 0,
  stepStartTs: 0,
  // Sincronización por ancla de tiempo
  anchorStartAt: 0,
  periodMs: 0,
  lastBoundaryTs: 0
};

// Variable para controlar el modo de coloreado
let coloringMode = 'sequence'; // 'sequence' o 'wallpaper'
// Orden de inicio diferida cuando aún estamos en modo wallpaper
let pendingSequenceStart = null;
// Nuevo: Cambio a secuencia diferido si llega mientras se colorea wallpaper
let pendingSwitchToSequence = false;
// Temporizador fallback local para arrancar la secuencia si no llega señal del servidor
let sequenceFallbackTimeoutId = null;

// Control de secuencia única para evitar múltiples ejecuciones de wallpaper
let wallpaperSequenceActive = false;
let wallpaperSequenceId = null;

// Control de fade in/out suave
let fadeInProgress = false;
let fadeOutProgress = false;
const FADE_DURATION = 1500; // Duración del fade en ms

// Función para iniciar la secuencia automática de coloreado
function startAutoColorSequence() {
  if (coloringMode !== 'sequence') {
    console.log(`⚠️ No se puede iniciar secuencia automática en modo ${coloringMode}`);
    return;
  }
  
  if (autoColorSequence.active) {
    console.log('🔄 Secuencia de coloreado ya está activa');
    return;
  }
  
  autoColorSequence.active = true;
  autoColorSequence.currentIndex = 0;
  autoColorSequence.nextStepScheduled = false;
  if (autoColorSequence.interval) { clearInterval(autoColorSequence.interval); autoColorSequence.interval = null; }
  if (autoColorSequence.timeoutId) { clearTimeout(autoColorSequence.timeoutId); autoColorSequence.timeoutId = null; }
  
  console.log('🎨 *** INICIANDO SECUENCIA AUTOMÁTICA DE COLOREADO ***');
  console.log(`🔄 Secuencia: ${autoColorSequence.patterns.join(' → ')} (cada ${autoColorSequence.intervalTime/1000}s)`);
  
  // Iniciar inmediatamente con el primer color
  executeColorStep();
}

// Función para iniciar la secuencia automática con sincronización del servidor
function startAutoColorSequenceSync(syncData) {
  // Si llega la orden mientras estamos en modo wallpaper, diferir hasta volver a 'sequence'
  if (coloringMode !== 'sequence') {
    pendingSequenceStart = syncData || pendingSequenceStart || {};
    console.log('⏸️ Orden startAutoColorSequence recibida en modo wallpaper — diferida');
    return;
  }
  // Cancelar fallback local si estaba programado (vamos a iniciar sincronizado)
  if (sequenceFallbackTimeoutId) {
    clearTimeout(sequenceFallbackTimeoutId);
    sequenceFallbackTimeoutId = null;
  }
  if (autoColorSequence.active) {
    console.log('🔄 Secuencia de coloreado ya está activa - deteniendo para resincronizar');
    stopAutoColorSequence();
  }
  
  autoColorSequence.active = true;
  autoColorSequence.currentIndex = 0;
  autoColorSequence.nextStepScheduled = false;
  
  // Usar datos del servidor si están disponibles
  if (syncData) {
    // Mantener default de 30s si no viene del servidor
    autoColorSequence.intervalTime = syncData.intervalTime || 40000;
    autoColorSequence.periodMs = autoColorSequence.intervalTime + (typeof DURATION_MS !== 'undefined' ? DURATION_MS : 14000);
    if (syncData.startAt) autoColorSequence.anchorStartAt = syncData.startAt;
    if (syncData.patterns) {
      // Aceptar patrones del servidor tal cual (rojo/azul/amarillo)
      const list = syncData.patterns.map(p => String(p));
      autoColorSequence.patterns = list.length ? list : ['rojo.jpg','azul.jpg','amarillo.jpg'];
    }
    if (typeof syncData.currentIndex === 'number') {
      autoColorSequence.currentIndex = syncData.currentIndex % autoColorSequence.patterns.length;
    }
  }
  
  console.log('🎨 *** INICIANDO SECUENCIA SINCRONIZADA DE COLOREADO ***');
  console.log(`🔄 Secuencia: ${autoColorSequence.patterns.join(' → ')} (cada ${autoColorSequence.intervalTime/1000}s)`);
  console.log(`⏰ Sincronización basada en timestamp del servidor: ${syncData?.timestamp}`);
  console.log(`🎯 Brush ID: ${brushId} - Iniciando sincronización`);
  
  // NUEVA LÓGICA: Sincronización perfecta para todas las instancias
  // Todas las instancias brush/reveal/1-9 ejecutan INMEDIATAMENTE sin delays variables
  let executeImmediately = true;
  
  if (syncData?.timestamp) {
    const now = Date.now();
    const timeSinceSync = now - syncData.timestamp;
    console.log(`⏰ Tiempo desde comando del servidor: ${timeSinceSync}ms`);
    
    // Solo si el comando es muy antiguo (>5s), ignorar para evitar desincronización
    if (timeSinceSync > 5000) {
      console.log(`⚠️ Comando demasiado antiguo (${timeSinceSync}ms), ignorando para mantener sincronización`);
      return;
    }
  }
  
  // Si hay un startAt futuro, alinear al siguiente múltiplo exacto del periodo
  if (syncData?.startAt) {
    const nowTs = Date.now();
    const startAt = syncData.startAt;
    const period = autoColorSequence.periodMs || (autoColorSequence.intervalTime + (typeof DURATION_MS !== 'undefined' ? DURATION_MS : 14000));
    let k = Math.ceil((nowTs - startAt) / period);
    if (k < 0) k = 0;
    const nextBoundary = startAt + k * period;
    const delay = Math.max(0, nextBoundary - nowTs);
    autoColorSequence.lastBoundaryTs = nextBoundary;
    console.log(`⏳ Arrancando en siguiente frontera de periodo: ${delay}ms (k=${k}, period=${period})`);
    executeImmediately = false;
    setTimeout(() => executeColorStep(), Math.max(30, delay));
  }
  
  if (executeImmediately) {
    // EJECUCIÓN INMEDIATA para perfecta sincronización entre todas las instancias
    console.log(`🚀 Brush ${brushId}: Ejecutando paso de color INMEDIATAMENTE para sincronización perfecta`);
    executeColorStep();
  }
}

// Función para detener la secuencia automática
function stopAutoColorSequence() {
  if (autoColorSequence.interval) { clearInterval(autoColorSequence.interval); autoColorSequence.interval = null; }
  if (autoColorSequence.timeoutId) { clearTimeout(autoColorSequence.timeoutId); autoColorSequence.timeoutId = null; }
  if (autoColorSequence.watchdogId) { clearTimeout(autoColorSequence.watchdogId); autoColorSequence.watchdogId = null; }
  autoColorSequence.nextStepScheduled = false;
  autoColorSequence.active = false;
  autoColorSequence.isRunning = false;
  if (sequenceFallbackTimeoutId) { clearTimeout(sequenceFallbackTimeoutId); sequenceFallbackTimeoutId = null; }
  console.log('⏹️ Secuencia automática de coloreado detenida');
}

// Función para hacer fade out suave al color de fondo antes de resetear
async function performSmoothFadeToBackground() {
  if (fadeOutProgress) {
    console.log('⏸️ Fade out ya en progreso');
    return;
  }
  
  fadeOutProgress = true;
  console.log('🌅 Iniciando fade out suave al color de fondo...');
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const originalAlpha = ctx.globalAlpha;
    
    function fadeStep(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / FADE_DURATION, 1);
      
      // Crear overlay de fondo con opacidad creciente
      const alpha = progress;
      
      // Limpiar y dibujar fondo con fade
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#E89E54'; // Color de fondo
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      
      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        // Fade completado - limpiar completamente el canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#E89E54';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        fadeOutProgress = false;
        console.log('✅ Fade out completado');
        resolve();
      }
    }
    
    requestAnimationFrame(fadeStep);
  });
}

// Función para resetear la secuencia de coloreado a amarillo
async function resetColorSequenceToYellow() {
  console.log('🔄 *** RESET *** Reiniciando a patrón por defecto y secuencia');
  
  // Si estamos coloreando wallpaper, no interrumpir: ignorar reset durante wallpaper
  if (coloringMode === 'wallpaper' && !animationFinished) {
    console.log('⛔ RESET ignorado: coloreado de wallpaper en curso. Se preserva hasta completar.');
    return;
  }
  
  // Detener secuencia automática si está activa
  stopAutoColorSequence();
  
  // Hacer fade suave antes de resetear
  await performSmoothFadeToBackground();
  
  // Limpiar patrones y volver a patrón por defecto
  if (patterns.length > 1) {
    patterns.splice(0);
    await loadDefaultPattern();
    console.log('🗑️ Patrones de coloreado limpiados, restablecido patrón por defecto');
  }
  
  // Resetear flags de animación
  isFirstAnimation = true;
  preserveCanvasContent = false;
  animationFinished = false;
  
  // Cancelar animaciones en curso
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  
  // Recalcular layout y redibujar fondo por defecto
  resize();
  
  // Resetear índice de secuencia automática
  autoColorSequence.currentIndex = 0;
  
  console.log('✅ Reset completado - Patrón por defecto restaurado, listo para nueva secuencia');
}

// Función para cambiar a modo wallpaper
async function switchToWallpaperMode(sequenceId = null) {
  const currentSequenceId = sequenceId || `manual_${Date.now()}_${Math.random()}`;
  console.log(`🔀 *** SWITCH *** Cambiando a modo Wallpaper (wallpaper.jpg) - Seq ID: ${currentSequenceId}`);
  
  // Control de secuencia única: evitar múltiples ejecuciones
  if (wallpaperSequenceActive) {
    console.log(`⏸️ Secuencia wallpaper ya activa (ID actual: ${wallpaperSequenceId}) - ignorando nueva solicitud (ID: ${currentSequenceId})`);
    return;
  }
  
  // Evitar reentradas: si ya estamos coloreando wallpaper, no interrumpir
  if (coloringMode === 'wallpaper' && !animationFinished) {
    console.log(`⏸️ Ignorado: ya en modo wallpaper y coloreando (ID: ${currentSequenceId})`);
    return;
  }
  
  // Marcar secuencia activa
  wallpaperSequenceActive = true;
  wallpaperSequenceId = currentSequenceId;
  
  // Detener secuencia automática si está activa
  // Guardar estado actual para poder reanudar
  savedSequenceState = {
    active: autoColorSequence.active,
    patterns: [...autoColorSequence.patterns],
    currentIndex: autoColorSequence.currentIndex,
    intervalTime: autoColorSequence.intervalTime
  };
  stopAutoColorSequence();
  // Limpiar watchdog por seguridad
  if (autoColorSequence.watchdogId) { clearTimeout(autoColorSequence.watchdogId); autoColorSequence.watchdogId = null; }
  // Limpiar cualquier arranque diferido/fallback pendiente
  pendingSequenceStart = null;
  if (sequenceFallbackTimeoutId) { clearTimeout(sequenceFallbackTimeoutId); sequenceFallbackTimeoutId = null; }
  
  // Cambiar modo
  coloringMode = 'wallpaper';
  
  try {
    // Verificar si aún somos la secuencia activa
    if (wallpaperSequenceId !== currentSequenceId) {
      console.log(`⏹️ Secuencia cancelada - otra secuencia tomó control (actual: ${wallpaperSequenceId}, esperado: ${currentSequenceId})`);
      return;
    }
    
    // Primero hacer fade out suave al color de fondo
    await performSmoothFadeToBackground();
    
    // Verificar nuevamente después del fade
    if (wallpaperSequenceId !== currentSequenceId) {
      console.log(`⏹️ Secuencia cancelada durante fade out (actual: ${wallpaperSequenceId}, esperado: ${currentSequenceId})`);
      return;
    }
    
    // Cargar wallpaper.jpg
    const img = new Image();
    let attempts = 0;
    const MAX_ATTEMPTS = 4;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        await new Promise((resolve, reject) => {
          img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth < 500 || img.naturalHeight < 500) {
              return reject(new Error('Dimensiones incompletas'));
            }
            resolve();
          };
          img.onerror = reject;
          img.src = `/patterns/wallpaper.jpg?t=${Date.now()}&try=${attempts}`;
        });
        break; // éxito
      } catch (e) {
        console.warn(`⚠️ Intento ${attempts}/${MAX_ATTEMPTS} cargando wallpaper.jpg falló: ${e.message}`);
        if (attempts >= MAX_ATTEMPTS) throw e;
        await new Promise(r=>setTimeout(r, 600 * attempts));
      }
    }
    
    // Verificar una vez más antes de continuar
    if (wallpaperSequenceId !== currentSequenceId) {
      console.log(`⏹️ Secuencia cancelada durante carga de imagen (actual: ${wallpaperSequenceId}, esperado: ${currentSequenceId})`);
      return;
    }
    
    // Agregar wallpaper.jpg como patrón de coloreado
    const wallpaperPattern = {
      src: `/patterns/wallpaper.jpg`,
      image: img,
      filename: 'wallpaper.jpg',
      type: 'wallpaper',
      sequenceId: currentSequenceId
    };
    
    // Reemplazar o agregar wallpaper como patrón activo único para evitar duplicados
    const existingIdx = patterns.findIndex(p => p.filename === 'wallpaper.jpg' || p.type === 'wallpaper');
    if (existingIdx >= 0) {
      patterns[existingIdx] = wallpaperPattern;
      currentPatternIndex = existingIdx;
    } else {
      patterns.push(wallpaperPattern);
      currentPatternIndex = patterns.length - 1;
    }
    patternsReady = true;
    
    console.log(`✅ Wallpaper.jpg cargado (Seq ID: ${currentSequenceId}), iniciando coloreado...`);
    
    // Recalcular layout
    resize();
    
    // Iniciar coloreado con wallpaper
    colorOnTop();
    // Al entrar a wallpaper, asegurar que el video por logos esté detenido
    stopLogoVideoLoopIfActive();
    stopFullscreenLogoVideo();
    
  } catch (error) {
    console.error(`❌ Error cargando wallpaper.jpg (Seq ID: ${currentSequenceId}):`, error);
    wallpaperSequenceActive = false;
    wallpaperSequenceId = null;
  }
}

// Función para cambiar a modo secuencia
function switchToSequenceMode() {
  console.log('🔀 *** SWITCH *** Cambiando a modo Secuencia (rojo/azul/amarillo)');
  
  // Marcar que la secuencia de wallpaper ha terminado
  wallpaperSequenceActive = false;
  wallpaperSequenceId = null;
  
  // Si estamos en modo wallpaper y la animación aún no termina, diferir el cambio
  if (coloringMode === 'wallpaper' && !animationFinished) {
    pendingSwitchToSequence = true;
    console.log('⏳ Cambio a modo secuencia DIFERIDO hasta completar coloreado de wallpaper');
    return;
  }
  
  // Cambiar modo
  coloringMode = 'sequence';
  
  // Limpiar patrones excepto el amarillo y los de secuencia base
  // Mantener siempre amarillo como base; eliminar duplicados de wallpaper
  patterns = patterns.filter(p => p.type !== 'wallpaper');
  // No forzar amarillo en modo secuencia para evitar pixelación
  
  // Resetear a amarillo como base
  currentPatternIndex = 0;
  
  // Importante: NO reanudar inmediatamente la secuencia previa para evitar doble inicio
  // tras volver desde wallpaper. En su lugar, reiniciar estado y esperar al
  // startAutoColorSequence(startAutoColorSequenceSync) que envía el servidor.
  // Esto evita la "pasada rápida" de los 3 colores.
  stopAutoColorSequence();
  autoColorSequence.currentIndex = 0; // empezar desde el comienzo
  autoColorSequence.nextStepScheduled = false;
  // Mantener el orden por defecto salvo que el servidor envíe otro
  autoColorSequence.patterns = autoColorSequence.patterns && autoColorSequence.patterns.length
    ? autoColorSequence.patterns
  : ['rojo.jpg','azul.jpg','amarillo.jpg'];
  
  console.log('✅ Modo secuencia preparado. Esperando señal de inicio sincronizada del servidor...');
  // Asegurar que el video por logos esté detenido al cambiar de modo
  stopLogoVideoLoopIfActive();
  stopFullscreenLogoVideo();

  // Recalcular layout inmediatamente para el patrón actual (evitar que quede el recorte del wallpaper)
  try { resize(); render(); } catch (_) {}
  
  // Si hay una orden diferida del server, aplicarla ahora y cancelar fallbacks
  if (pendingSequenceStart) {
    const data = pendingSequenceStart;
    pendingSequenceStart = null;
    if (sequenceFallbackTimeoutId) { clearTimeout(sequenceFallbackTimeoutId); sequenceFallbackTimeoutId = null; }
    console.log('▶️ Iniciando secuencia con datos diferidos del servidor');
    startAutoColorSequenceSync(data);
  } else {
  // Sin fallback local: esperar órdenes explícitas del servidor para iniciar la secuencia
  if (sequenceFallbackTimeoutId) { clearTimeout(sequenceFallbackTimeoutId); sequenceFallbackTimeoutId = null; }
  console.log('⏳ Modo secuencia preparado. Esperando startAutoColorSequence desde el servidor...');
  }
  
  // Limpiar estado guardado: no reanudamos desde mitad de ciclo
  savedSequenceState = null;
}

// Función para ejecutar un paso de la secuencia de coloreado
async function executeColorStep() {
  if (!autoColorSequence.active) {
    console.log(`⚠️ Brush ${brushId}: executeColorStep llamado pero autoColorSequence.active = false`);
    return;
  }
  // Evitar pasos solapados o en modo incorrecto
  if (coloringMode !== 'sequence') {
    console.log(`⛔ Brush ${brushId}: Paso de color ignorado: modo actual no es "sequence"`);
    return;
  }
  if (autoColorSequence.isRunning) {
    console.log(`⛔ Brush ${brushId}: Paso de color ignorado: ya hay un coloreado en curso`);
    return;
  }
  autoColorSequence.isRunning = true;
  
  // Iniciar conteo del paso y configurar watchdog de avance
  autoColorSequence.stepStartTs = Date.now();
  const myStepId = ++autoColorSequence.stepId;
  if (autoColorSequence.watchdogId) { clearTimeout(autoColorSequence.watchdogId); autoColorSequence.watchdogId = null; }
  // El watchdog se dispara ligeramente después de cuando debería haberse ejecutado el siguiente paso
  autoColorSequence.watchdogId = setTimeout(() => {
    // No hacer nada si ya avanzamos de paso o si no estamos en modo secuencia/activos
    if (!autoColorSequence.active || coloringMode !== 'sequence') return;
    if (autoColorSequence.stepId !== myStepId) return; // ya avanzó
    if (autoColorSequence.timeoutId) return; // ya hay programación activa
    console.warn(`⏰ Brush ${brushId}: Watchdog: no se programó el siguiente paso; forzando avance`);
    try { executeColorStep(); } catch (e) { console.error(`❌ Brush ${brushId}: Error en watchdog executeColorStep:`, e); }
  }, DURATION_MS + autoColorSequence.intervalTime + 2000);

  const currentPattern = autoColorSequence.patterns[autoColorSequence.currentIndex];
  const currentTime = new Date().toLocaleTimeString();
  
  console.log(`🎨 *** BRUSH ${brushId} COLOREANDO *** [${currentTime}] Aplicando: ${currentPattern} (índice ${autoColorSequence.currentIndex})`);
  // Permitimos amarillo/azul/rojo: el cropeo es full-res 2160x3840 sin reescalar la fuente
  
  try {
    // Cargar el patrón de color
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `/patterns/${currentPattern}?t=${Date.now()}`;
    });

    // LOGO SPECIAL: mostrar logo1/ logo2 a altura completa con fade-in en lugar de coloreo
    if (/logo1\.jpg|logo2\.jpg/i.test(currentPattern)) {
      console.log('🆕 LOGO MODE: mostrando', currentPattern, 'con fade-in full-height (sin efecto de coloreo)');
      await showLogoFullFade(img, currentPattern);
      // Avanzar índice y scheduling como si hubiera terminado animación normal
      autoColorSequence.currentIndex = (autoColorSequence.currentIndex + 1) % autoColorSequence.patterns.length;
      finalizeLogoStep();
      return; // saltar coloreo estándar
    }
    
    // Agregar el patrón a la lista sin reemplazar el fondo
    const newPattern = {
      src: `/patterns/${currentPattern}`,
      image: img,
      filename: currentPattern,
      type: currentPattern.replace('.jpg', '')
    };
    
    // Evitar acumulación excesiva de patrones - mantener solo los últimos 5
    if (patterns.length > 5) {
      patterns = patterns.slice(-5);
    }
    
    // Agregar al final de la lista (el fondo amarillo permanece como índice 0)
    patterns.push(newPattern);
    // Usar el nuevo patrón para colorear
    currentPatternIndex = patterns.length - 1;
    
  console.log(`✅ Patrón ${currentPattern} cargado, iniciando coloreado...`);
    
    // Iniciar animación de coloreado encima del fondo existente (SIN resize para preservar canvas)
  try { resize(); } catch(_) {}
  colorOnTop();

  // LOGO VIDEO: en brush 1 y 4 mostrar video fullscreen; en otros, detener si estuviera activo
  playFullscreenLogoVideoIfNeeded(currentPattern);
    
    // Avanzar al siguiente patrón en la secuencia
    autoColorSequence.currentIndex = (autoColorSequence.currentIndex + 1) % autoColorSequence.patterns.length;
    
    // Calcular siguiente patrón para log
    const nextPattern = autoColorSequence.patterns[autoColorSequence.currentIndex];
    const nextTime = new Date(Date.now() + autoColorSequence.intervalTime).toLocaleTimeString();
    
  console.log(`⏰ Próximo coloreado (se programará 30s DESPUÉS de terminar): ${nextPattern} ~${nextTime}`);
  console.log(`🔄 Estado secuencia: active=${autoColorSequence.active}, siguienteProgramado=${autoColorSequence.nextStepScheduled}`);
  autoColorSequence.nextStepScheduled = false; // se reprogramará al finalizar la animación
    
  } catch (error) {
    console.error(`❌ Error aplicando patrón ${currentPattern}:`, error);
  autoColorSequence.isRunning = false; // liberar lock en error
  }
}

// Función para cargar patrón por defecto: preferir wallpaper, luego rojo (amarillo/azul bloqueados)
async function loadDefaultPattern() {
  try {
    console.log('🎨 Cargando patrón por defecto (wallpaper → rojo)...');
    // Si ya existe wallpaper cargado, no sobrescribir el inicial en arranque
    const wallpaperIdx = patterns.findIndex(p => p.filename === 'wallpaper.jpg' || p.type === 'wallpaper');
    if (wallpaperIdx >= 0 && !patternsReady) {
      console.log('🛑 Hay wallpaper cargado durante arranque; se mantiene como inicial');
      currentPatternIndex = wallpaperIdx;
      patternsReady = true;
      return true;
    }

    // 1) Intentar wallpaper.jpg
    const hasWallpaper = await checkIfFileExists('/patterns/wallpaper.jpg');
    if (hasWallpaper) {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = `/patterns/wallpaper.jpg?t=${Date.now()}`; });
      patterns = [{ src: `/patterns/wallpaper.jpg`, image: img, filename: 'wallpaper.jpg', type: 'wallpaper' }];
      currentPatternIndex = 0;
      console.log('✅ Patrón por defecto establecido: wallpaper.jpg');
      patternsReady = true;
      if (size.w > 0 && size.h > 0) { resize(); }
      return true;
    }

    // 2) Fallback a rojo.jpg
    const hasRed = await checkIfFileExists('/patterns/rojo.jpg');
    if (hasRed) {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = `/patterns/rojo.jpg?t=${Date.now()}`; });
      patterns = [{ src: `/patterns/rojo.jpg`, image: img, filename: 'rojo.jpg', type: 'rojo' }];
      currentPatternIndex = 0;
      console.log('✅ Patrón por defecto establecido: rojo.jpg');
      patternsReady = true;
      if (size.w > 0 && size.h > 0) { resize(); }
      return true;
    }

    console.warn('⚠️ No se encontró wallpaper.jpg ni rojo.jpg para patrón por defecto');
    return false;
  } catch (error) {
    console.error('❌ Error cargando patrón por defecto:', error);
    return false;
  }
}

// ==============================
// PATTERN MANAGEMENT
// ==============================

async function checkIfFileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function loadLatestPatterns() {
  try {
    console.log('🔍 Cargando patrones disponibles...');
  // Marcamos como no listos mientras cargamos
  patternsReady = false;
    
  // Lista de patrones a cargar en orden de prioridad
  // Preferir siempre lo que establece el servidor (wallpaper si existe) y luego colores base
  const patternFiles = ['wallpaper.jpg', 'rojo.jpg', 'logo1.jpg', 'logo2.jpg'];
    let loadedAny = false;
    
    // Limpiar patrones existentes
    patterns.length = 0;
    
  // Intentar cargar cada patrón
    for (const filename of patternFiles) {
      try {
        const exists = await checkIfFileExists(`/patterns/${filename}`);
        if (exists) {
          console.log(`🎯 Cargando ${filename}...`);
          
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = () => {
              console.log(`✅ ${filename} cargado exitosamente`);
              resolve();
            };
            img.onerror = (err) => {
              console.warn(`❌ Error cargando ${filename}:`, err);
              reject(err);
            };
            img.src = `/patterns/${filename}?t=${Date.now()}`;
          });
          
          // Determinar tipo de patrón
          let type = 'pattern';
          // Amarillo/Azul no se usan para coloreo, pero si llegaran a estar, se mantendrán como 'pattern'
          if (filename.includes('rojo')) type = 'rojo';
          else if (filename.includes('logo1')) type = 'logo1';
          else if (filename.includes('logo2')) type = 'logo2';
          
          patterns.push({
            src: `/patterns/${filename}`,
            image: img,
            filename: filename,
            type: type
          });
          
          loadedAny = true;
          
          // Establecer el primer patrón cargado como actual (típicamente wallpaper si existe)
          if (patterns.length === 1) {
            currentPatternIndex = 0;
            console.log(`🎨 Patrón inicial establecido (provisional): ${filename}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo cargar ${filename}:`, error);
      }
    }
    
    if (loadedAny) {
      // Si hay wallpaper en la lista, forzar usarlo como inicial
      const idxWallpaper = patterns.findIndex(p => p.filename === 'wallpaper.jpg' || p.type === 'wallpaper');
      if (idxWallpaper >= 0) {
        currentPatternIndex = idxWallpaper;
        console.log('🖼️ Forzando wallpaper.jpg como patrón inicial');
      }
      patternsReady = true;
      console.log(`📊 Total de patrones cargados: ${patterns.length}`);
      return true;
    } else {
      console.error('❌ No se pudo cargar ningún patrón');
      return false;
    }
  } catch (error) {
    console.error('❌ Error en loadLatestPatterns:', error);
    return false;
  }
}

// ==============================
// WEBSOCKET FUNCTIONALITY
// ==============================

function setupWebSocket() {
  try {
    // Conectar al servidor WebSocket con reconexión automática
  socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 5000
    });
  // Exponer el socket globalmente para el verificador de conexión de brush-reveal.html
  try { window.socket = socket; } catch (_) {}
    
    socket.on('connect', () => {
      console.log(`🔌 Brush ${brushId}: Conectado al servidor WebSocket`);
      // Registrarse como brush-reveal con brushId
      socket.emit('registerScreen', { type: 'brush-reveal', brushId: brushId });
      console.log(`📋 Brush ${brushId}: Registrado como brush-reveal-${brushId}`);
    });
    
    socket.on('disconnect', () => {
      console.log(`🔌 Brush ${brushId}: Desconectado del servidor WebSocket - intentando reconectar...`);
    });
    
    socket.on('reconnect', () => {
      console.log(`🔌 Brush ${brushId}: Reconectado al servidor WebSocket`);
      socket.emit('registerScreen', { type: 'brush-reveal', brushId: brushId });
      console.log(`📋 Brush ${brushId}: Re-registrado como brush-reveal-${brushId}`);
    });
    
    // Escuchar estado inicial del servidor
    // Helper: apply latest brush config (recalc layout and redraw)
    function applyBrushConfigUpdate() {
      try {
        resize();
        // If it's the first draw or animation already finished, render clean background;
        // otherwise preserve current content and just re-render with new layout
        if (isFirstAnimation || animationFinished) {
          renderStaticBackground();
        } else {
          render();
        }
      } catch (_) {}
    }

    socket.on('initialState', (data) => {
      console.log('📥 Estado inicial recibido:', data);
      if (data.brushReveal) {
        brushConfig = data.brushReveal;
        console.log(`🎯 Configuración de brush recibida - offsetX: ${brushConfig.offsetX}, offsetY: ${brushConfig.offsetY}`);
        // Apply immediately so each /brush-reveal/:id shows its proper section
        applyBrushConfigUpdate();
      }
    });

    // Escuchar actualizaciones de configuración de brush-reveal
  socket.on('brushRevealConfigUpdate', (data) => {
      if (data.brushId === brushId) {
        brushConfig = data.config;
        console.log(`🔄 Configuración de brush ${brushId} actualizada - offsetX: ${brushConfig.offsetX}, offsetY: ${brushConfig.offsetY}`);
    // Recalculate layout and redraw with the new offsets
    applyBrushConfigUpdate();
      }
    });

    // Escuchar cuando hay un nuevo patrón listo
    socket.on('newPatternReady', (data) => {
      console.log(`🎨 *** BRUSH *** Nuevo patrón recibido:`, data);
      // No interrumpir coloreado de wallpaper en curso
      if (coloringMode === 'wallpaper' && !animationFinished) {
        console.log('⏸️ newPatternReady ignorado: coloreado de wallpaper en curso');
        return;
      }
      // Bloquear patrones pixelados
      if (/amarillo\.jpg|azul\.jpg/i.test(data?.filename || '')) {
        console.warn(`⛔ Brush ${brushId}: newPatternReady bloqueado para ${data.filename} por pixelación`);
        return;
      }
      latestPatternId = data.patternId;
      
      // Cargar el nuevo patrón y iniciar animación ENCIMA
      loadNewPatternAndAnimate(data.filename);
    });

    // COMENTADO: Este evento causa conflicto con newPatternReady
    // brush-reveal solo debe escuchar newPatternReady para evitar animaciones duplicadas
    /*
    socket.on('imageUpdated', (data) => {
      console.log('🆕 Imagen procesada actualizada - coloreando encima con wallpaper.jpg:', data);
      loadLatestPatternAndAnimate();
    });
    */
    
    // NUEVO: Escuchar orden desde /control para iniciar animación con último patrón
    socket.on('requestAnimationStart', (data) => {
      console.log('🎬 Orden recibida desde /control - coloreando encima con último patrón');
      if (coloringMode === 'wallpaper' && !animationFinished) {
        console.log('⏸️ requestAnimationStart ignorado: coloreado de wallpaper en curso');
        return;
      }
      loadLatestPatternAndAnimate();
    });
    
    // Escuchar cambios en la selección de imagen
    socket.on('imageSelected', (data) => {
      console.log(`🖼️ Imagen seleccionada cambiada a: ${data.image}.png`);
      selectedImage = data.image;
      updateFallbackPattern();
    });
    
    // NUEVO: Escuchar rotación automática de imágenes desde /control
    socket.on('brushRevealRotateImage', (data) => {
      console.log(`🎨 *** BRUSH *** EVENTO RECIBIDO - Rotación automática: ${data.image}.jpg`);
      console.log(`📥 *** BRUSH *** Datos completos del evento:`, data);
      // Ya no usamos loadSpecificImageAndAnimate, ahora todo va por rotación automática
    });
    
    // Tecla "1" ya no inicia animación directa aquí; el servidor coordina wallpaper y luego secuencia
    socket.on('startBrushRevealSequence', () => {
      console.log('🎯 *** BRUSH *** Señal de inicio recibida (sin acción directa, esperando wallpaper o secuencia)');
    });
    
    // NUEVO: Iniciar secuencia automática de coloreado con sincronización
    socket.on('startAutoColorSequence', (syncData) => {
      console.log('🔄 *** BRUSH *** Iniciando secuencia automática desde control con sincronización');
      console.log(`⏰ *** BRUSH *** Timestamp del servidor: ${syncData?.timestamp}`);
      startAutoColorSequenceSync(syncData);
    });
    
    // NUEVO: Detener secuencia automática
    socket.on('stopAutoColorSequence', () => {
      console.log('⏹️ *** BRUSH *** Deteniendo secuencia automática desde control');
      stopAutoColorSequence();
    });
    
    // NUEVO: Siguiente paso manual de coloreado con sincronización
    socket.on('nextColorStep', (syncData) => {
      console.log(`⏭️ *** BRUSH ${brushId} *** Ejecutando siguiente paso de color desde control`);
      
      // Verificar si el comando es reciente para mantener sincronización
      if (syncData?.timestamp) {
        const now = Date.now();
        const timeSinceSync = now - syncData.timestamp;
        console.log(`⏰ *** BRUSH ${brushId} *** Timestamp del servidor: ${syncData.timestamp} (hace ${timeSinceSync}ms)`);
        
        // Si el comando es muy antiguo (>3s), ignorar para evitar desincronización
        if (timeSinceSync > 3000) {
          console.log(`⚠️ Brush ${brushId}: Comando demasiado antiguo (${timeSinceSync}ms), ignorando`);
          return;
        }
      }
      
      if (typeof syncData?.currentIndex === 'number') {
        autoColorSequence.currentIndex = syncData.currentIndex % autoColorSequence.patterns.length;
        console.log(`🎯 Brush ${brushId}: Índice actualizado a ${autoColorSequence.currentIndex}`);
      }
      
      // EJECUCIÓN INMEDIATA para sincronización perfecta
      if (syncData?.pattern) {
        console.log(`🎯 *** BRUSH ${brushId} *** Patrón forzado por servidor: ${syncData.pattern}`);
        if (/amarillo\.jpg|azul\.jpg/i.test(syncData.pattern)) {
          console.warn(`⛔ Brush ${brushId}: Bloqueando patrón forzado ${syncData.pattern} por pixelación`);
        } else {
          executeColorStepWithPattern(syncData.pattern);
        }
      } else {
        console.log(`🚀 Brush ${brushId}: Ejecutando paso INMEDIATAMENTE`);
        executeColorStep();
      }
    });

    // NUEVO: Actualización en caliente del intervalo de secuencia
    socket.on('colorSequenceIntervalUpdated', (data) => {
      const newInterval = Number(data?.intervalMs);
      if (Number.isFinite(newInterval) && newInterval > 0) {
        console.log(`⏱️ *** BRUSH ${brushId} *** Intervalo de secuencia actualizado a ${newInterval}ms`);
        autoColorSequence.intervalTime = newInterval;
      }
    });
    
    // NUEVO: Activar modo sincronización por servidor (cancelar auto-programación)
    socket.on('enableServerSync', () => {
      console.log(`🔗 *** BRUSH ${brushId} *** Activando sincronización por servidor - cancelando auto-programación`);
      // Cancelar cualquier timeout automático
      if (autoColorSequence.timeoutId) {
        clearTimeout(autoColorSequence.timeoutId);
        autoColorSequence.timeoutId = null;
      }
      autoColorSequence.nextStepScheduled = false;
      console.log(`✅ Brush ${brushId}: Listo para sincronización completa por servidor`);
    });
    
    // NUEVO: Reset de secuencia de coloreado
    socket.on('resetColorSequence', () => {
      console.log(`🔄 *** BRUSH ${brushId} *** Reseteando secuencia de coloreado desde control`);
      resetColorSequenceToYellow();
    });
    
    // NUEVO: Switch a modo wallpaper
    socket.on('switchToWallpaperMode', (data) => {
      const sequenceId = data?.sequenceId || `fallback_${Date.now()}`;
      console.log(`🔀 *** BRUSH ${brushId} *** Cambiando a modo Wallpaper (Seq ID: ${sequenceId})`);
      switchToWallpaperMode(sequenceId);
    });
    
    // NUEVO: Switch a modo secuencia
    socket.on('switchToSequenceMode', () => {
      console.log('🔀 *** BRUSH *** Cambiando a modo Secuencia');
      switchToSequenceMode();
    });
    
    // NUEVO: Escuchar configuración del slideshow
    socket.on('slideshowConfigUpdate', (data) => {
      if (data.brushId === brushId) {
        // console.log(`📺 Configuración de slideshow actualizada para brush ${brushId}:`, data.config);
        slideshowConfig = { ...slideshowConfig, ...data.config };
        updateSlideshowDisplay();
      }
    });

    // NUEVO: Escuchar rotación automática de patrones
    socket.on('startPatternRotation', (data) => {
      console.log('🔄 *** BRUSH *** EVENTO RECIBIDO - startPatternRotation:', data);
      console.log(`🔄 *** BRUSH *** Brush ID ${brushId} iniciando rotación automática`);
      startAutomaticPatternRotation(data.patterns, data.interval, data.timestamp);
    });

    // NUEVO: Escuchar parada de rotación automática
    socket.on('stopPatternRotation', () => {
      console.log(`⏹️ *** BRUSH *** EVENTO RECIBIDO - stopPatternRotation en Brush ${brushId}`);
      stopAutomaticPatternRotation();
    });
    
  } catch (error) {
    console.warn('Error configurando WebSocket:', error);
  }
}

// Cargar wallpaper.jpg y animar por encima
async function loadLatestPatternAndAnimate() {
  try {
    console.log('🔄 Recargando wallpaper.jpg DESDE CONTROL...');
    
    // Cargar wallpaper.jpg directamente
    const wallpaperExists = await checkIfFileExists('/patterns/wallpaper.jpg');
    
    if (wallpaperExists) {
      console.log(`📥 Cargando nuevo wallpaper.jpg`);
      
      const newImg = new Image();
      await new Promise((resolve, reject) => {
        newImg.onload = resolve;
        newImg.onerror = reject;
        newImg.src = `/patterns/wallpaper.jpg?t=${Date.now()}`;
      });

  // Reemplazar último patrón con wallpaper.jpg actualizado (evitar duplicados)
  const srcKey = `/patterns/wallpaper.jpg`;
  const filtered = patterns.filter(p => p.src !== srcKey);
  filtered.push({ src: srcKey, image: newImg, filename: 'wallpaper.jpg', type: 'wallpaper' });
  patterns = filtered.slice(-3); // cap a 3 para evitar acumulación
      currentPatternIndex = patterns.length - 1;
      
      console.log('✅ Nuevo wallpaper.jpg cargado. COLOREANDO ENCIMA del wallpaper existente...');
      colorOnTop(); // USAR colorOnTop() para colorear encima sin resetear
    } else {
      console.warn('❌ No se pudo obtener el último patrón de /patterns');
    }
  } catch (err) {
    console.error('❌ Error cargando último patrón de /patterns:', err);
  }
}

async function loadNewPatternAndAnimate(filename) {
  try {
    console.log(`🖼️ Cargando nuevo patrón DESDE EVENTO: ${filename}`);
    // Bloquear patrones pixelados si se intenta cargar directamente
    if (/amarillo\.jpg|azul\.jpg/i.test(filename || '')) {
      console.warn(`⛔ Brush ${brushId}: loadNewPatternAndAnimate bloqueado para ${filename} por pixelación`);
      return;
    }
    
    // Crear nueva imagen para el patrón
    const newPatternImage = new Image();
    
    await new Promise((resolve, reject) => {
      newPatternImage.onload = resolve;
      newPatternImage.onerror = reject;
      // Use absolute path to avoid resolving relative to /brush-reveal/:id which causes 404
      newPatternImage.src = `/patterns/${filename}?t=${Date.now()}`; // Cache busting
    });
    
  // Agregar el nuevo patrón al array (evitar duplicados y cap a 3)
  const newSrc = `/patterns/${filename}`;
  const withoutDup = patterns.filter(p => p.src !== newSrc);
  withoutDup.push({ src: newSrc, image: newPatternImage, filename, type: filenameToType(filename) });
  patterns = withoutDup.slice(-3);
    
    // Cambiar al nuevo patrón (último agregado)
    currentPatternIndex = patterns.length - 1;
    
    console.log(`✅ Nuevo patrón cargado (${patterns.length} total). COLOREANDO ENCIMA...`);
    
    // COLOREAR ENCIMA del wallpaper existente sin resetear
    colorOnTop();
    
  } catch (error) {
    console.error('❌ Error cargando nuevo patrón:', error);
  }
}

// Helper: asegurar que wallpaper esté cargado y seleccionado
async function ensureWallpaperAsCurrent() {
  // Ver si ya existe
  let idx = patterns.findIndex(p => p.filename === 'wallpaper.jpg' || p.type === 'wallpaper');
  if (idx >= 0) {
    currentPatternIndex = idx;
    return true;
  }
  // Cargarlo
  try {
    const exists = await checkIfFileExists('/patterns/wallpaper.jpg');
    if (!exists) return false;
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = `/patterns/wallpaper.jpg?t=${Date.now()}`; });
    patterns.push({ src: '/patterns/wallpaper.jpg', image: img, filename: 'wallpaper.jpg', type: 'wallpaper' });
    currentPatternIndex = patterns.length - 1;
    patternsReady = true;
    return true;
  } catch (_) {
    return false;
  }
}

// Estado
let size = { wCSS: 0, hCSS: 0, w: 0, h: 0 };
let layout = { dx: 0, dy: 0, dw: 0, dh: 0 };
let startedAt = 0, rafId = 0;
let fpsMonitorRafId = 0; // RAF separado para el monitor FPS
let fpsOverlayEnabled = false; // Mostrar/ocultar overlay FPS con tecla 'f'
let fpsOverlayEl = null; // Elemento DOM del overlay FPS
let seeds = [], strokes = [], sweeps = [], wash = [], spirals = [], radiants = [], connectors = [], droplets = [], waves = [], colorDrops = [];
let finalSealing = [];
let animationFinished = false; // Flag para indicar que la animación terminó
let isFirstAnimation = true; // Flag para controlar si es la primera animación
let preserveCanvasContent = false; // Iniciar en false para permitir primer dibujo de fondo
let latestPatternId = null; // ID del patrón más reciente
// Video fullscreen para logos en brush 1 y 4
let fullscreenVideoEl = null;

// Helper: inferir tipo de patrón desde el nombre
function filenameToType(filename) {
  const n = (filename || '').toLowerCase();
  if (n.includes('amarillo')) return 'amarillo';
  if (n.includes('azul')) return 'azul';
  if (n.includes('rojo')) return 'rojo';
  if (n.includes('wallpaper')) return 'wallpaper';
  if (n.includes('logo1')) return 'logo1';
  if (n.includes('logo2')) return 'logo2';
  return 'pattern';
}

function ensureFullscreenVideoEl() {
  if (fullscreenVideoEl) return fullscreenVideoEl;
  const v = document.createElement('video');
  v.id = 'fullscreen-logo-video';
  v.style.position = 'fixed';
  v.style.inset = '0';
  v.style.width = '100vw';
  v.style.height = '100vh';
  v.style.objectFit = 'cover';
  v.style.zIndex = '999999';
  v.style.display = 'none';
  v.style.pointerEvents = 'none';
  v.muted = true;
  v.playsInline = true;
  v.loop = true;
  v.preload = 'auto';
  document.body.appendChild(v);
  fullscreenVideoEl = v;
  return v;
}

function playFullscreenLogoVideoIfNeeded(patternFilename) {
  const isLogo = /logo1\.jpg|logo2\.jpg/i.test(patternFilename || '');
  if (!isLogo || ![1, 4, 5, 9].includes(brushId)) {
    stopFullscreenLogoVideo();
    return;
  }
  const v = ensureFullscreenVideoEl();
  try { v.src = '/vid.mp4'; } catch (_) {}
  v.style.display = 'block';
  v.play().catch(() => {});
}

function stopFullscreenLogoVideo() {
  if (!fullscreenVideoEl) return;
  try { fullscreenVideoEl.pause(); } catch (_) {}
  try { fullscreenVideoEl.removeAttribute('src'); fullscreenVideoEl.load?.(); } catch (_) {}
  fullscreenVideoEl.style.display = 'none';
}

// NUEVA FUNCIÓN: Iniciar secuencia de animación (tecla "1")
function startAnimationSequence() {
  console.log('🎯 *** INICIANDO SECUENCIA DE ANIMACIÓN ***');
  
  // Resetear flags de control
  hasInitialAnimationStarted = true;
  animationFinished = false;
  
  // Si ya hay una animación en curso, detenerla
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  
  // Obtener el patrón actual
  const currentPattern = getCurrentPattern();
  if (!currentPattern) {
    console.error('❌ No hay patrón disponible para animar');
    return;
  }
  
  console.log('🎨 Iniciando animación con patrón actual');
  
  // Solo preservar contenido si ya hay algo dibujado (no es la primera vez)
  if (!isFirstAnimation) {
    preserveCanvasContent = true;
  }
  
  // Iniciar nueva animación
  colorOnTop();
}

// ==============================
// ROTACIÓN AUTOMÁTICA DE PATRONES
// ==============================

// Iniciar rotación automática con los patrones especificados
function startAutomaticPatternRotation(patternList, interval, anchorTs) {
  console.log(`🔄 *** ROTACIÓN AUTOMÁTICA *** Iniciando con patrones:`, patternList);
  console.log(`⏰ *** ROTACIÓN AUTOMÁTICA *** Intervalo: ${interval}ms (${interval/1000}s)`);
  
  // Detener rotación existente si hay una
  stopAutomaticPatternRotation();
  
  // Configurar parámetros (filtrar amarillo/azul por pixelación)
  const incoming = (patternList && Array.isArray(patternList) ? patternList : ['rojo'])
    .map(p => String(p).toLowerCase())
    .filter(p => p !== 'amarillo' && p !== 'azul');
  rotationPatterns = incoming.length ? incoming : ['rojo'];
  rotationIntervalTime = interval || 120000; // 2 minutos por defecto
  rotationAnchorTs = typeof anchorTs === 'number' ? anchorTs : Date.now();
  currentRotationIndex = 0;
  automaticRotationEnabled = true;
  
  // Calcular desfase para alinear al ancla compartida
  const now = Date.now();
  const elapsed = Math.max(0, now - rotationAnchorTs);
  const ticks = Math.floor(elapsed / rotationIntervalTime);
  currentRotationIndex = ticks % rotationPatterns.length;
  
  const msToNextTick = rotationIntervalTime - (elapsed % rotationIntervalTime);

  // Aplicar inmediatamente el patrón actual para feedback instantáneo
  rotateToNextPattern();

  // Alinear siguientes cambios al ancla compartida
  setTimeout(() => {
    rotationInterval = setInterval(() => {
      rotateToNextPattern();
    }, rotationIntervalTime);
  }, msToNextTick);
  
  console.log(`✅ *** ROTACIÓN AUTOMÁTICA *** Configurada correctamente - Brush ${brushId}`);
}

// Detener rotación automática
function stopAutomaticPatternRotation() {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
    console.log(`⏹️ *** ROTACIÓN AUTOMÁTICA *** Detenida - Brush ${brushId}`);
  }
  automaticRotationEnabled = false;
}

// Rotar al siguiente patrón en la secuencia - SIMPLIFICADO como wallpaper.jpg
async function rotateToNextPattern() {
  if (!automaticRotationEnabled || rotationPatterns.length === 0) {
    console.warn('⚠️ *** ROTACIÓN AUTOMÁTICA *** No habilitada o sin patrones');
    return;
  }
  
  // Obtener el patrón actual
  const currentPattern = rotationPatterns[currentRotationIndex];
  const currentTime = new Date().toLocaleTimeString();
  
  console.log(`🔄 *** ROTACIÓN AUTOMÁTICA *** [${currentTime}] Cambiando a: ${currentPattern}.jpg - Brush ${brushId}`);
  // Bloquear rotación hacia amarillo/azul si llegara a colarse
  if (/^(amarillo|azul)$/i.test(currentPattern || '')) {
    console.warn(`⛔ *** ROTACIÓN AUTOMÁTICA *** Patrón bloqueado: ${currentPattern}.jpg (saltando)`);
    currentRotationIndex = (currentRotationIndex + 1) % rotationPatterns.length;
    return;
  }
  
  try {
    // HACER EXACTAMENTE LO MISMO QUE loadLatestPatternAndAnimate() pero con la imagen específica
    const imageFile = `${currentPattern}.jpg`;
    const imageExists = await checkIfFileExists(`/patterns/${imageFile}`);
    
    if (imageExists) {
      console.log(`📥 Cargando ${imageFile} para rotación automática`);
      
      const newImg = new Image();
      await new Promise((resolve, reject) => {
        newImg.onload = resolve;
        newImg.onerror = reject;
        newImg.src = `/patterns/${imageFile}?t=${Date.now()}`;
      });

      // Reemplazar último patrón con la nueva imagen (igual que wallpaper.jpg)
      const srcKey = `/patterns/${imageFile}`;
      const filtered = patterns.filter(p => p.src !== srcKey);
      // Marcar explícitamente el tipo para que resize() aplique el recorte por secciones de color
      filtered.push({ src: srcKey, image: newImg, filename: imageFile, type: currentPattern });
      patterns = filtered.slice(-3); // cap a 3 para evitar acumulación
      currentPatternIndex = patterns.length - 1;
      
      // Recalcular layout para esta imagen de color, de modo que use la sección correcta por brushId
      try {
        resize();
      } catch (e) {
        console.warn('⚠️ Error recalculando layout tras rotación:', e);
      }
      
      console.log(`✅ ${imageFile} cargado. COLOREANDO ENCIMA...`);
      colorOnTop(); // USAR colorOnTop() igual que wallpaper.jpg
      
      // Avanzar al siguiente índice
      currentRotationIndex = (currentRotationIndex + 1) % rotationPatterns.length;
      
      // Calcular siguiente patrón para log
      const nextPattern = rotationPatterns[currentRotationIndex];
      const nextChangeTime = new Date(Date.now() + rotationIntervalTime).toLocaleTimeString();
      
      console.log(`✅ *** ROTACIÓN AUTOMÁTICA *** Patrón aplicado: ${imageFile}`);
      console.log(`⏰ *** ROTACIÓN AUTOMÁTICA *** Próximo cambio: ${nextPattern}.jpg a las ${nextChangeTime}`);
      
    } else {
      console.warn(`❌ *** ARCHIVO NO ENCONTRADO *** ${imageFile}`);
    }
    
  } catch (error) {
    console.error(`❌ *** ROTACIÓN AUTOMÁTICA *** Error aplicando patrón ${currentPattern}:`, error);
  }
}
let socket = null; // Conexión WebSocket
let lateColorDrops = []; // Gotas que aparecen después de 15s en áreas no coloreadas
let hasAddedLateDrops = false; // Flag para evitar añadir múltiples veces
let finalCircle = null; // Círculo final que cubre toda la pantalla
let hasFinalCircleStarted = false; // Flag para el círculo final
let finalCircles = []; // Array de múltiples círculos finales

// Pool de canvas temporales para optimización (reutilizar en lugar de crear cada frame)
const canvasPool = {
  tempCanvases: [],
  tempContexts: [],
  
  init() {
    // Crear canvas reutilizables para optimización
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      // Alta calidad para evitar pixelación al componer con máscara
      ensureHQ(ctx);
      this.tempCanvases.push(canvas);
      this.tempContexts.push(ctx);
    }
  },
  
  resizeAll(width, height) {
    for (let i = 0; i < this.tempCanvases.length; i++) {
      this.tempCanvases[i].width = width;
      this.tempCanvases[i].height = height;
      // Reaplicar suavizado de alta calidad tras cada resize (los flags se resetean)
  try { ensureHQ(this.tempContexts[i]); } catch (_) {}
    }
  },
  
  getCanvas(index) {
    const canvas = this.tempCanvases[index];
    const ctx = this.tempContexts[index];
    // Limpiar canvas para reutilización
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Asegurar suavizado alto en cada adquisición por si algún cambio lo deshabilitó
  try { ensureHQ(ctx); } catch (_) {}
    return { canvas, ctx };
  }
};

// Monitor de FPS
let fpsMonitor = {
  lastTime: 0,
  frameCount: 0,
  fps: 0,
  fpsHistory: [],
  avgFps: 0,
  fpsElement: null,
  avgElement: null,
  
  init() {
    // Elementos específicos pueden no existir; el overlay es opcional y dinámico
    this.fpsElement = document.getElementById('fpsValue');
    this.avgElement = document.getElementById('fpsAvg');
    this.lastTime = performance.now();
  },
  
  update(currentTime) {
    this.frameCount++;
    const deltaTime = currentTime - this.lastTime;
    
    if (deltaTime >= 1000) { // Actualizar cada segundo
      this.fps = Math.round((this.frameCount * 1000) / deltaTime);
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      // Mantener historial para promedio
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 10) {
        this.fpsHistory.shift();
      }
      
      // Calcular promedio
      this.avgFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
      
      // Actualizar display existente si está
      if (this.fpsElement) {
        this.fpsElement.textContent = `${this.fps} FPS`;
      }
      if (this.avgElement) {
        this.avgElement.textContent = `Avg: ${this.avgFps}`;
      }
      // Actualizar overlay FPS si está habilitado
      if (fpsOverlayEnabled) {
        ensureFpsOverlay();
        if (fpsOverlayEl) {
          fpsOverlayEl.textContent = `FPS: ${this.fps}  |  Avg: ${this.avgFps}`;
          // Color simple por performance
          const color = this.fps >= 50 ? '#00ff00' : (this.fps >= 30 ? '#ffff00' : '#ff5555');
          fpsOverlayEl.style.color = color;
        }
      }
    }
  },
  
  showCompleted() {
    // Mostrar estado final cuando la animación termine pero mantener FPS
    if (this.fpsElement) {
      this.fpsElement.textContent = `COMPLETO - ${this.fps} FPS`;
    }
    if (this.avgElement) {
      this.avgElement.textContent = `Avg: ${this.avgFps} - ESTATICO`;
    }
    if (fpsOverlayEnabled) {
      ensureFpsOverlay();
      if (fpsOverlayEl) {
        fpsOverlayEl.textContent = `COMPLETO - FPS: ${this.fps}  |  Avg: ${this.avgFps}`;
        fpsOverlayEl.style.color = '#00ffff';
      }
    }
  }
};

// Crear/asegurar overlay FPS
function ensureFpsOverlay() {
  if (fpsOverlayEl) return;
  fpsOverlayEl = document.createElement('div');
  fpsOverlayEl.id = 'fpsOverlay';
  fpsOverlayEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(0,0,0,0.7);color:#00ff00;padding:6px 10px;border-radius:4px;font:12px \'Courier New\',monospace;pointer-events:none;user-select:none;';
  fpsOverlayEl.textContent = 'FPS: --  |  Avg: --';
  document.body.appendChild(fpsOverlayEl);
}

// Toggle por teclado: tecla 'f' para mostrar/ocultar FPS
document.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    console.log('🔢 Tecla 1: Forzando pipeline de wallpaper para coloreo de alta calidad');
    ensureWallpaperAsCurrent().then(ok => {
      if (!ok) {
        console.warn('⚠️ No se pudo asegurar wallpaper, usando patrón actual');
      }
      startAnimationSequence();
    });
    return;
  }
  if (e.key === 'f' || e.key === 'F') {
    fpsOverlayEnabled = !fpsOverlayEnabled;
    if (fpsOverlayEnabled) {
      ensureFpsOverlay();
      if (fpsOverlayEl) fpsOverlayEl.style.display = 'block';
      // Asegurar loop del monitor activo
      if (!fpsMonitorRafId) fpsMonitorRafId = requestAnimationFrame(fpsMonitorLoop);
    } else if (fpsOverlayEl) {
      fpsOverlayEl.style.display = 'none';
    }
  }
  
  // NUEVO: Controles de prueba para la secuencia de coloreado
  if (e.key === 's' || e.key === 'S') {
    console.log('🔄 [PRUEBA] Iniciando secuencia de coloreado...');
    startAutoColorSequence();
  }
  
  if (e.key === 'x' || e.key === 'X') {
    console.log('⏹️ [PRUEBA] Deteniendo secuencia de coloreado...');
    stopAutoColorSequence();
  }
  
  if (e.key === 'c' || e.key === 'C') {
    console.log('🎨 [PRUEBA] Ejecutando paso de coloreado manual...');
    executeColorStep();
  }
  
  if (e.key === 'r' || e.key === 'R') {
    console.log('🔄 [PRUEBA] Reiniciando con fondo amarillo...');
    loadDefaultPattern().then(() => {
      renderStaticBackground();
    });
  }
});

// Utils
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>a+Math.random()*(b-a);
function gauss(m=0,s=1){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
const easeInOutCubic = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const lerp = (a,b,t)=>a+(b-a)*t;

// Formas orgánicas: bordes irregulares tipo pincel
function makeHarmonics(count=2){
  const terms=[]; const used=new Set();
  for(let i=0;i<count;i++){
    let f=Math.floor(rand(2,6));
    while(used.has(f)) f=Math.floor(rand(2,6));
    used.add(f);
    terms.push({amp: rand(0.04,0.12), freq: f, phase: rand(0, Math.PI*2)});
  }
  return terms;
}
function noisyRadius(R, theta, terms, ampScale=1, jitter=0){
  let factor=1;
  for(const t of terms){ factor += (t.amp*ampScale) * Math.sin(t.freq*theta + t.phase); }
  const r = R*factor + (jitter? gauss(0, R*jitter) : 0);
  return Math.max(2, r);
}
function fillIrregularBlob(cx, cy, R, terms, alpha=1, steps=42, ampScale=1, jitter=0){
  maskCtx.save(); maskCtx.globalAlpha=alpha; maskCtx.beginPath();
  for(let i=0;i<=steps;i++){
    const th=(i/steps)*Math.PI*2; const r=noisyRadius(R, th, terms, ampScale, jitter);
    const x=cx+Math.cos(th)*r, y=cy+Math.sin(th)*r;
    if(i===0) maskCtx.moveTo(x,y); else maskCtx.lineTo(x,y);
  }
  maskCtx.closePath(); maskCtx.fillStyle='#fff'; maskCtx.fill(); maskCtx.restore();
}

function resize(){
  // Recompute DPR on resize so canvases always match device pixel density
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const r = container.getBoundingClientRect();
  size.wCSS = Math.floor(r.width); size.hCSS = Math.floor(r.height);
  size.w = Math.floor(size.wCSS*DPR); size.h = Math.floor(size.hCSS*DPR);
  canvas.width=size.w; canvas.height=size.h; canvas.style.width=size.wCSS+'px'; canvas.style.height=size.hCSS+'px';
  // Tras redimensionar, los contextos pierden flags: reforzar suavizado de alta calidad
  try { ensureHQ(ctx); } catch(_){}
  // Limpiar cualquier recorte previo por seguridad; se volverá a establecer si es wallpaper
  layout.sourceX = null;
  layout.sourceY = null;
  layout.sourceWidth = null;
  layout.sourceHeight = null;
  // Determinar tipo de patrón actual
  const currentPatternData = patterns[currentPatternIndex];
  const isWallpaper = !!(currentPatternData && (
    (currentPatternData.type && currentPatternData.type === 'wallpaper') ||
    (currentPatternData.filename && /wallpaper\.jpg$/i.test(currentPatternData.filename))
  ));
  // Generalización: cualquier patrón que NO sea wallpaper se considera de color y se dibuja completo sin recorte
  const isColorPattern = !!(currentPatternData && currentPatternData.type !== 'wallpaper');
  const isWideColor = !!(currentPatternData && (
    (currentPatternData.type && ['amarillo','azul','rojo'].includes(String(currentPatternData.type).toLowerCase())) ||
    (currentPatternData.filename && /(amarillo|azul|rojo)\.jpg$/i.test(currentPatternData.filename))
  ));
  // SIEMPRE usar escala 1.0 para máxima resolución
  const effectiveMaskScale = 1.0; // FORZAR alta resolución para todos los patrones
  maskCanvas.width=Math.max(1, Math.floor(size.w*effectiveMaskScale));
  maskCanvas.height=Math.max(1, Math.floor(size.h*effectiveMaskScale));
  // Reforzar suavizado en el contexto de máscara también
  try { ensureHQ(maskCtx); } catch(_){}
  
  // Redimensionar canvas temporales del pool
  canvasPool.resizeAll(size.w, size.h);
  
  // RESETEAR transformación de máscara para evitar escalados incorrectos
  try { maskCtx.setTransform(1,0,0,1,0,0); } catch(_) {}
  try { ctx.setTransform(1,0,0,1,0,0); } catch(_) {}
  
  const currentBG = getCurrentPattern();
  if (currentBG && currentBG.naturalWidth && currentBG.naturalHeight){
    if (isWallpaper) {
      // Para wallpaper.jpg, usar sección según offsets del servidor
      const sectionWidth = WALLPAPER_SECTION_WIDTH;
      const sectionHeight = WALLPAPER_SECTION_HEIGHT;
      const sourceX = brushConfig.offsetX;
      const sourceY = brushConfig.offsetY;
      console.log(`🎯 Usando sección del wallpaper - sourceX: ${sourceX}, sourceY: ${sourceY}, width: ${sectionWidth}, height: ${sectionHeight}`);
      const s = Math.min(size.w/sectionWidth, size.h/sectionHeight);
      const dw = Math.ceil(sectionWidth*s), dh = Math.ceil(sectionHeight*s);
      layout.dx = Math.floor((size.w-dw)/2);
      layout.dy = Math.floor((size.h-dh)/2);
      layout.dw = dw;
      layout.dh = dh;
      layout.sourceX = sourceX;
      layout.sourceY = sourceY;
      layout.sourceWidth = sectionWidth;
      layout.sourceHeight = sectionHeight;
    } else if (isWideColor) {
      // Amarillo/Azul/Rojo: usar mapeo virtual 6480x3840 como wallpaper, sin escalar la imagen fuente si tiene 3840px de alto
      const imgW = currentBG.naturalWidth;
      const imgH = currentBG.naturalHeight;
      const scaleToVirtual = WALLPAPER_SECTION_HEIGHT / imgH; // escalar la altura a 3840
      const placedW = imgW * scaleToVirtual;
      const placedH = WALLPAPER_SECTION_HEIGHT; // 3840
      const virtualWidth = WALLPAPER_TOTAL_WIDTH; // 6480
      const placeX = Math.floor((virtualWidth - placedW) / 2);
      const placeY = 0;
      const sectionWidth = WALLPAPER_SECTION_WIDTH; // 2160
      const sectionHeight = WALLPAPER_SECTION_HEIGHT; // 3840
      const sourceXVirtual = brushConfig.offsetX || 0;
      const sourceYVirtual = brushConfig.offsetY || 0;
      // Convertir coords virtuales a coords de la imagen de origen
      let sx = (sourceXVirtual - placeX) / scaleToVirtual;
      let sy = (sourceYVirtual - placeY) / scaleToVirtual;
      let sw = sectionWidth / scaleToVirtual;
      let sh = sectionHeight / scaleToVirtual;
      // Clamp a los límites de la imagen
      if (!Number.isFinite(sx)) sx = 0; if (!Number.isFinite(sy)) sy = 0;
      if (!Number.isFinite(sw) || sw <= 0) sw = imgW; if (!Number.isFinite(sh) || sh <= 0) sh = imgH;
      sx = Math.max(0, Math.min(imgW - 1, sx));
      sy = Math.max(0, Math.min(imgH - 1, sy));
      if (sx + sw > imgW) sw = imgW - sx;
      if (sy + sh > imgH) sh = imgH - sy;
      // Destino igual que wallpaper (encajar la sección al canvas)
      const s = Math.min(size.w/sectionWidth, size.h/sectionHeight);
      const dw = Math.ceil(sectionWidth*s), dh = Math.ceil(sectionHeight*s);
      layout.dx = Math.floor((size.w-dw)/2);
      layout.dy = Math.floor((size.h-dh)/2);
      layout.dw = dw;
      layout.dh = dh;
      layout.sourceX = Math.round(sx);
      layout.sourceY = Math.round(sy);
      layout.sourceWidth = Math.max(1, Math.round(sw));
      layout.sourceHeight = Math.max(1, Math.round(sh));
      console.log(`🖌️ Layout wide-color virtual - ${currentPatternData?.filename} | sx:${layout.sourceX}, sy:${layout.sourceY}, sw:${layout.sourceWidth}, sh:${layout.sourceHeight}, dx:${layout.dx}, dy:${layout.dy}, dw:${layout.dw}, dh:${layout.dh}`);
    } else if (isColorPattern) {
      // Para imágenes de color normales: usar imagen completa, sin recorte por secciones
      const imgW = currentBG.naturalWidth;
      const imgH = currentBG.naturalHeight;
      const s = Math.min(size.w/imgW, size.h/imgH);
      const dw = Math.ceil(imgW*s), dh = Math.ceil(imgH*s);
      layout.dx = Math.floor((size.w-dw)/2);
      layout.dy = Math.floor((size.h-dh)/2);
      layout.dw = dw;
      layout.dh = dh;
      layout.sourceX = null;
      layout.sourceY = null;
      layout.sourceWidth = null;
      layout.sourceHeight = null;
      console.log(`🖌️ Layout patrón completo - ${currentPatternData?.filename} | ${imgW}x${imgH} → ${dw}x${dh}`);
    }
  }
}

function makeSeeds(n){
  seeds = Array.from({length:n},()=>({
    x: clamp(gauss(.5,.22), .05,.95), y: clamp(gauss(.5,.22), .05,.95)
  }));
}

function makeStrokes(){
  strokes = [];
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(1000*area, 800, 1400)); // Cantidad equilibrada de trazos
  const earlyCount = Math.max(30, Math.min(60, Math.floor(COUNT*0.12))); // Trazos tempranos moderados
  const spreadInterval = Math.max(1, Math.floor(COUNT/20)); // Distribución densa pero no excesiva
  
  // Trazo central potente
  const centerBaseW = clamp(gauss(25,8), 18,40) * (size.w/1280+size.h/720)*.5; 
  const centerSteps = Math.round(clamp(350*area, 250, 450)); 
  const centerStepLen = clamp(gauss(8,2.5), 5, 12) * (size.w/1280+size.h/720)*.5;
  const centerDrift = rand(.018,.035);
  const centerBrush = maskBrushes.length? 0 : -1;
  strokes.push({ 
    x:size.w*0.5, y:size.h*0.5, 
    angle: rand(0,Math.PI*2), 
    baseW:centerBaseW, 
    alpha:0.85,
    steps:centerSteps, 
    stepLen:centerStepLen, 
    drift:centerDrift, 
    tStart:0, 
    tEnd:0.55,
    idx:0, 
    b:centerBrush, 
    seedIndex:0 
  });
  
  // Generar trazos principales
  for (let i=0;i<COUNT;i++){
    const seedIndex = i%seeds.length;
    const s = seeds[seedIndex];
    let x = clamp(s.x+gauss(0,.07), .01,.99)*size.w;
    let y = clamp(s.y+gauss(0,.07), .01,.99)*size.h;
    const baseW = clamp(gauss(18,6), 12,32)*(size.w/1280+size.h/720)*.5;
    const alpha = clamp(gauss(.8,.08), .65, .9);
    const steps = Math.round(clamp(200,50), 150,320)*area;
    const stepLen = rand(0.9,1.8) * (size.w/1280+size.h/720)*.5;
    let angle = rand(0,Math.PI*2);
    const drift = rand(.020,.045);
    let tStart = clamp(rand(0,.25)+(i/COUNT)*.35, 0,.65);
    if (i < earlyCount || (i % spreadInterval) === 0) tStart = clamp(rand(0,.06), 0, .08);
    const tEnd = clamp(tStart+rand(.45,.65),0,0.95);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    strokes.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b,seedIndex});
  }
  
  // Trazos adicionales en los bordes (reducidos)
  const edgeTrazoCount = Math.round(COUNT * 0.2); // 20% adicional para bordes
  for (let i=0; i<edgeTrazoCount; i++){
    const edge = i % 4;
    let x, y;
    switch(edge) {
      case 0: x = rand(0.1, 0.9)*size.w; y = rand(0.05, 0.25)*size.h; break;
      case 1: x = rand(0.75, 0.95)*size.w; y = rand(0.1, 0.9)*size.h; break;
      case 2: x = rand(0.1, 0.9)*size.w; y = rand(0.75, 0.95)*size.h; break;
      case 3: x = rand(0.05, 0.25)*size.w; y = rand(0.1, 0.9)*size.h; break;
    }
    
    const baseW = clamp(gauss(15,5), 10,25)*(size.w/1280+size.h/720)*.5;
    const alpha = clamp(gauss(.75,.06), .6, .85);
    const steps = Math.round(clamp(160,30), 120,250)*area;
    const stepLen = rand(0.8,1.4) * (size.w/1280+size.h/720)*.5;
    const angle = rand(0,Math.PI*2);
    const drift = rand(.025,.040);
    const tStart = clamp(rand(0,.15), 0, .25);
    const tEnd = clamp(tStart+rand(.35,.55),0,0.85);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const seedIndex = i % seeds.length;
    
    strokes.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b,seedIndex});
  }
}

function makeSpirals(){
  spirals = [];
  const COUNT = Math.round(clamp(12*(size.w*size.h)/(1280*720), 8, 18)); // reducido de 18-28 a 12-18
  for (let i=0;i<COUNT;i++){
    const cx = rand(.2,.8)*size.w;
    const cy = rand(.2,.8)*size.h;
    const maxRadius = rand(100,180)*(size.w/1280+size.h/720)*.5; // un poco más grande
    const baseW = clamp(gauss(14,4), 8,24)*(size.w/1280+size.h/720)*.5; // un poco más grande
    const alpha = rand(.3,.5); // más opaco
    const steps = Math.round(rand(60,100)); // menos pasos pero más visibles
    const angleSpeed = rand(.1,.18);
    const radiusSpeed = maxRadius/steps;
    const tStart = clamp(rand(.25,.65), 0,.75);
    const tEnd = clamp(tStart+rand(.25,.4),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    spirals.push({cx,cy,maxRadius,baseW,alpha,steps,angleSpeed,radiusSpeed,tStart,tEnd,idx:0,b,angle:rand(0,Math.PI*2),radius:maxRadius*0.05});
  }
}

// Gotas que nacen y crecen con borde de brocha
function makeDroplets(){
  droplets = [];
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(20*area, 15, 30)); // REDUCIDO de 35-50 a 20-30
  for (let i=0;i<COUNT;i++){
    const cx = rand(.05,.95)*size.w;
    const cy = rand(.05,.95)*size.h;
    const maxR = rand(80, 200) * (size.w/1280+size.h/720)*.5; // un poco más grande para compensar menos cantidad
    const tStart = clamp(rand(0.0,.3),0,.4);
    const tEnd = clamp(tStart + rand(.4,.6), 0, 0.85);
    const edgeThickness = rand(0.1, 0.18);
    const fillAlpha = rand(0.15, 0.25); // más opaco
    const edgeAlpha = rand(0.2, 0.35); // más opaco
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const approxCirc = 2*Math.PI*maxR;
    const spacing = 28 * (size.w/1280+size.h/720)*.5; // espaciado un poco mayor
    const N = Math.max(10, Math.min(200, Math.floor(approxCirc/Math.max(20, spacing))));
    const di = Math.max(1, Math.floor(N*0.382));
    const fillH = makeHarmonics(2);
    const edgeH = makeHarmonics(2); // reducido de 3 a 2
    droplets.push({cx,cy,maxR,tStart,tEnd,edgeThickness,fillAlpha,edgeAlpha,b,i:0,N,di,fillH,edgeH});
  }
}

function stepDroplet(d, e, sizeMultiplier, budget){
  // progreso local 0..1
  const local = clamp((e - d.tStart) / Math.max(0.0001, (d.tEnd - d.tStart)), 0, 1);
  if (local<=0) return 0;
  // Curva de crecimiento muy suave y gradual
  const es = local*local*(3-2*local); // smoothstep clásico
  // Empezar con tamaño visible INMEDIATAMENTE desde el inicio
  const R = d.maxR * (0.15 + 0.85*es); // empezar en 15% para ser MUY visible desde el principio
  let spent = 0;

  // Relleno interior con borde orgánico - MUY visible desde el inicio
  fillIrregularBlob(d.cx, d.cy, R*(1.0 - d.edgeThickness*0.5), d.fillH, d.fillAlpha * (0.8 + 0.2*es), 40, 0.8 + 0.2*es, 0.01);

  // Borde con sellos de brocha
  const brush = (d.b>=0? maskBrushes[d.b] : null);
  const N = d.N;
  const chunk = Math.max(1, Math.min(Math.ceil(N/28), budget));
  for (let rep=0; rep<chunk && budget>0; rep++){
    const ang = (d.i / N) * Math.PI*2;
    const rEdge = noisyRadius(R, ang, d.edgeH, 0.9 + 0.5*es, 0.0);
    const x = d.cx + Math.cos(ang) * rEdge;
    const y = d.cy + Math.sin(ang) * rEdge;
    const w = R * d.edgeThickness;
    const scale = brush? ( (w / Math.max(1, Math.max(brush.width, brush.height))) * 3.0 * sizeMultiplier) : 1;
    const alpha = d.edgeAlpha * (0.8 + 0.2*es); // borde MUY visible desde el principio
    if (brush){
      const rot = ang + Math.PI/2 + gauss(0, 0.12);
      stamp(brush, x, y, scale, alpha, rot);
    } else {
      // mini mancha irregular como borde
      fillIrregularBlob(x, y, Math.max(6, w*0.5), makeHarmonics(2), alpha, 22, 1.0, 0.02);
    }
    budget--; spent++; d.i = (d.i + d.di) % N;
  }
  return spent;
}

// NUEVO: Función para dibujar gotas de coloreo que crecen
function stepColorDrop(drop, e, sizeMultiplier){
  const local = clamp((e - drop.tStart) / Math.max(0.0001, (drop.tEnd - drop.tStart)), 0, 1);
  if (local <= 0) return 0;
  
  // Curva de crecimiento muy suave
  const progress = local * local * (3 - 2 * local); // smoothstep
  const targetR = drop.maxR * progress * drop.growthSpeed;
  
  // Crecimiento gradual del radio actual
  drop.currentR = targetR;
  
  if (drop.currentR > 1) {
    // Dibujar gota de color con gradiente suave
    maskCtx.save();
    maskCtx.globalAlpha = drop.alpha * progress;
    
    // Crear gradiente radial para efecto suave
    const gradient = maskCtx.createRadialGradient(
      drop.cx, drop.cy, 0,
      drop.cx, drop.cy, drop.currentR
    );
    gradient.addColorStop(0, `rgba(${drop.color.r}, ${drop.color.g}, ${drop.color.b}, 1)`);
    gradient.addColorStop(0.7, `rgba(${drop.color.r}, ${drop.color.g}, ${drop.color.b}, 0.8)`);
    gradient.addColorStop(1, `rgba(${drop.color.r}, ${drop.color.g}, ${drop.color.b}, 0)`);
    
    maskCtx.fillStyle = gradient;
    maskCtx.beginPath();
    maskCtx.arc(drop.cx, drop.cy, drop.currentR, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
  }
  
  return 1;
}

function makeRadiants(){
  radiants = [];
  const COUNT = Math.round(clamp(8*(size.w*size.h)/(1280*720), 5, 12));
  for (let i=0;i<COUNT;i++){
    const cx = rand(.2,.8)*size.w;
    const cy = rand(.2,.8)*size.h;
    const rays = Math.round(rand(6,12));
    const rayLength = rand(60,120)*(size.w/1280+size.h/720)*.5;
    const baseW = clamp(gauss(10,2), 5,16)*(size.w/1280+size.h/720)*.5;
    const alpha = rand(.2,.35);
    const steps = Math.round(rand(40,80));
    const tStart = clamp(rand(.4,.75), 0,.85);
    const tEnd = clamp(tStart+rand(.2,.35),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    radiants.push({cx,cy,rays,rayLength,baseW,alpha,steps,tStart,tEnd,idx:0,b,currentRay:0});
  }
}

function makeConnectors(){
  connectors = [];
  const COUNT = Math.round(clamp(15*(size.w*size.h)/(1280*720), 10, 25));
  for (let i=0;i<COUNT;i++){
    const x1 = rand(.1,.9)*size.w, y1 = rand(.1,.9)*size.h;
    const x2 = rand(.1,.9)*size.w, y2 = rand(.1,.9)*size.h;
    const baseW = clamp(gauss(8,2), 4,14)*(size.w/1280+size.h/720)*.5;
    const alpha = rand(.15,.3);
    const steps = Math.round(rand(30,70));
    const tStart = clamp(rand(.5,.85), 0,.9);
    const tEnd = clamp(tStart+rand(.15,.3),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    connectors.push({x1,y1,x2,y2,baseW,alpha,steps,tStart,tEnd,idx:0,b});
  }
}

// NUEVO: Gotas de coloreo que crecen suavemente
function makeColorDrops(){
  colorDrops = [];
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(25*area, 20, 40)); // REDUCIDO de 45-70 a 25-40
  for (let i=0;i<COUNT;i++){
    const cx = rand(.02,.98)*size.w;
    const cy = rand(.02,.98)*size.h;
    const maxR = rand(40, 140) * (size.w/1280+size.h/720)*.5; // un poco más grande para compensar
    const tStart = clamp(rand(0.0,.45), 0, .5);
    const tEnd = clamp(tStart + rand(.4,.7), 0, 0.9);
    const alpha = rand(0.18, 0.32); // más opaco
    const growthSpeed = rand(0.8, 1.2);
    const color = {
      r: Math.floor(rand(120, 255)), 
      g: Math.floor(rand(80, 200)), 
      b: Math.floor(rand(60, 180))
    };
    colorDrops.push({cx,cy,maxR,tStart,tEnd,alpha,growthSpeed,color,currentR:0});
  }
}

// NUEVO: Función para añadir gotas de cobertura después de 15 segundos
function addLateColorDrops(){
  if (hasAddedLateDrops) return;
  hasAddedLateDrops = true;
  
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(30*area, 25, 50)); // Gotas adicionales para cobertura final
  
  // Crear grid para distribuir uniformemente
  const gridSize = Math.ceil(Math.sqrt(COUNT));
  let dropIndex = 0;
  
  for (let gx = 0; gx < gridSize && dropIndex < COUNT; gx++) {
    for (let gy = 0; gy < gridSize && dropIndex < COUNT; gy++) {
      const baseX = (gx / gridSize) + rand(-0.1, 0.1);
      const baseY = (gy / gridSize) + rand(-0.1, 0.1);
      
      const cx = clamp(baseX, 0.02, 0.98) * size.w;
      const cy = clamp(baseY, 0.02, 0.98) * size.h;
      const maxR = rand(40, 120) * (size.w/1280+size.h/720)*.5;
      const tStart = clamp(0.5 + rand(0, 0.25), 0.5, 0.75); // empezar después de 15s
      const tEnd = clamp(tStart + rand(.25,.45), 0, 0.95);
      const alpha = rand(0.15, 0.30);
      const growthSpeed = rand(0.8, 1.2);
      const color = {
        r: Math.floor(rand(120, 255)), 
        g: Math.floor(rand(80, 200)), 
        b: Math.floor(rand(60, 180))
      };
      
      lateColorDrops.push({cx,cy,maxR,tStart,tEnd,alpha,growthSpeed,color,currentR:0});
      dropIndex++;
    }
  }
}

// NUEVO: Función para crear 9 formas de estrella irregulares distribuidas en tiempo
function createFinalCircle(){
  if (hasFinalCircleStarted) return;
  hasFinalCircleStarted = true;
  
  finalCircles = [];
  const maxRadius = Math.min(size.w, size.h) * 0.35; // REDUCIDO: de 0.6 a 0.35 para que crezcan menos
  
  // Crear grid 5x5 para MÁS círculos (25 en total)
  const positions = [
    // Fila 1
    {x: 0.1, y: 0.1}, {x: 0.3, y: 0.1}, {x: 0.5, y: 0.1}, {x: 0.7, y: 0.1}, {x: 0.9, y: 0.1},
    // Fila 2  
    {x: 0.1, y: 0.3}, {x: 0.3, y: 0.3}, {x: 0.5, y: 0.3}, {x: 0.7, y: 0.3}, {x: 0.9, y: 0.3},
    // Fila 3
    {x: 0.1, y: 0.5}, {x: 0.3, y: 0.5}, {x: 0.5, y: 0.5}, {x: 0.7, y: 0.5}, {x: 0.9, y: 0.5},
    // Fila 4
    {x: 0.1, y: 0.7}, {x: 0.3, y: 0.7}, {x: 0.5, y: 0.7}, {x: 0.7, y: 0.7}, {x: 0.9, y: 0.7},
    // Fila 5
    {x: 0.1, y: 0.9}, {x: 0.3, y: 0.9}, {x: 0.5, y: 0.9}, {x: 0.7, y: 0.9}, {x: 0.9, y: 0.9}
  ];
  
  positions.forEach((pos, index) => {
    const centerX = pos.x * size.w + rand(-size.w*0.08, size.w*0.08); // menos variación porque son más pequeños
    const centerY = pos.y * size.h + rand(-size.h*0.08, size.h*0.08); // menos variación porque son más pequeños
    const radiusVariation = rand(0.7, 1.2); // menor variación de tamaño
    
    // TIEMPO DISTRIBUIDO PARA 25 CÍRCULOS: empiezan a los 15s y aparecen cada 0.6s
    let timeStart;
    if (index === 0) {
      timeStart = 0.50; // 15 segundos (15/30 = 0.5)
    } else {
      timeStart = 0.50 + (index * 0.6 / 30.0); // cada 0.6 segundos después
    }
    
    // Crear múltiples harmónicos para forma de estrella irregular (optimizado)
    const harmonics = makeHarmonics(3); // reducido para mejor performance
    
    // Parámetros adicionales para forma de estrella más uniforme
    const numPoints = rand(6, 10); // rango más controlado de puntas
    const pointSharpness = rand(0.4, 0.8); // menos extremo para mejor cobertura
    const curviness = rand(0.2, 0.5); // curvatura moderada
    
    // ESTILO DROPLET: ajustado para círculos más pequeños
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const approxCirc = 2*Math.PI*maxRadius*radiusVariation;
    const spacing = 18 * (size.w/1280+size.h/720)*.5; // espaciado más pequeño
    const N = Math.max(8, Math.min(180, Math.floor(approxCirc/Math.max(12, spacing)))); // menos puntos
    const edgeThickness = rand(0.10, 0.20); // borde un poco más grueso
    const fillAlpha = rand(0.18, 0.28); // relleno más visible
    const edgeAlpha = rand(0.25, 0.40); // borde más visible
    
    const circle = {
      cx: centerX,
      cy: centerY,
      maxRadius: maxRadius * radiusVariation,
      currentRadius: 0,
      tStart: timeStart,
      tEnd: Math.min(1.0, timeStart + 0.25), // 7.5 segundos para crecer (más rápido porque son más pequeños)
      alpha: rand(0.3, 0.4), // mayor opacidad
      fadeWidth: maxRadius * radiusVariation * 0.30, // borde suave
      harmonics: harmonics, // para irregularidad adicional
      irregularity: rand(0.3, 0.6), // irregularidad moderada para mejor cobertura
      numPoints: numPoints, // número de puntas de estrella
      pointSharpness: pointSharpness, // agudeza de las puntas
      curviness: curviness, // curvatura
      rotation: rand(0, Math.PI * 2), // rotación aleatoria de cada estrella
      // PROPIEDADES ESTILO DROPLET:
      brushIndex: b,
      brushPoints: N,
      edgeThickness: edgeThickness,
      fillAlpha: fillAlpha,
      edgeAlpha: edgeAlpha,
      spacing: spacing
    };
    
    finalCircles.push(circle);
  });
}

// Función auxiliar para crear forma de estrella irregular con puntas (optimizada)
function starRadius(baseRadius, angle, star, harmonics, irregularity) {
  // Crear patrón de estrella básico
  const normalizedAngle = (angle + star.rotation) % (Math.PI * 2);
  const pointAngle = (Math.PI * 2) / star.numPoints;
  const angleInPoint = (normalizedAngle % pointAngle) / pointAngle;
  
  // Crear curva de punta simple pero MUY pronunciada
  const starFactor = 1 + Math.sin(angleInPoint * Math.PI) * star.pointSharpness * 1.2; // amplificado
  
  // Añadir irregularidad EXTREMA
  let variation = 0;
  for (let i = 0; i < Math.min(harmonics.length, 3); i++) { // Limitar a 3 harmónicos
    const h = harmonics[i];
    variation += h.amp * Math.sin(normalizedAngle * h.freq + h.phase);
  }
  
  // Añadir variación extra con múltiples frecuencias
  const extraVariation = Math.sin(normalizedAngle * 7) * 0.1 + Math.sin(normalizedAngle * 13) * 0.05;
  
  // Combinar todo con irregularidad máxima
  const finalRadius = baseRadius * starFactor * (1 + (variation + extraVariation) * irregularity);
  
  // Asegurar que no sea negativo pero permitir variación extrema
  return Math.max(finalRadius, baseRadius * 0.1);
}

// NUEVO: Función para dibujar los 9 círculos irregulares finales con estilo DROPLET
function stepFinalCircle(e, sizeMultiplier){
  if (finalCircles.length === 0) return;
  
  finalCircles.forEach(star => {
    if (e < star.tStart) return;
    
    const local = clamp((e - star.tStart) / Math.max(0.0001, (star.tEnd - star.tStart)), 0, 1);
    
    // Curva de crecimiento 5% más lenta que antes
    const progress = Math.pow(local, 5.3); // de 5.0 a 5.3 para ser 5% más lento
    star.currentRadius = star.maxRadius * progress;
    
    if (star.currentRadius > 5) {
      maskCtx.save();
      
      // ESTILO DROPLET: Dibujar relleno primero
      maskCtx.globalAlpha = star.fillAlpha * progress;
      maskCtx.beginPath();
      
      const numPoints = Math.max(48, star.numPoints * 6);
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const radius = starRadius(star.currentRadius, angle, star, star.harmonics, star.irregularity);
        const x = star.cx + Math.cos(angle) * radius;
        const y = star.cy + Math.sin(angle) * radius;
        
        if (i === 0) {
          maskCtx.moveTo(x, y);
        } else {
          maskCtx.lineTo(x, y);
        }
      }
      
      maskCtx.closePath();
      maskCtx.fillStyle = 'white';
      maskCtx.fill();
      
      // ESTILO DROPLET: Dibujar borde con brocha
      if (star.brushIndex >= 0 && maskBrushes[star.brushIndex]) {
        maskCtx.globalAlpha = star.edgeAlpha * progress;
        
        const edgeRadius = star.currentRadius * (1 - star.edgeThickness);
        const brushSize = star.spacing * 0.8;
        
        // Dibujar puntos de brocha alrededor del borde
        for (let i = 0; i < star.brushPoints; i++) {
          const angle = (i / star.brushPoints) * Math.PI * 2;
          const radius = starRadius(edgeRadius, angle, star, star.harmonics, star.irregularity * 0.7);
          const x = star.cx + Math.cos(angle) * radius;
          const y = star.cy + Math.sin(angle) * radius;
          
          // Añadir variación al tamaño del pincel
          const brushVariation = rand(0.7, 1.3);
          const finalBrushSize = brushSize * brushVariation;
          
          maskCtx.drawImage(
            maskBrushes[star.brushIndex],
            x - finalBrushSize/2,
            y - finalBrushSize/2,
            finalBrushSize,
            finalBrushSize
          );
        }
      }
      
      maskCtx.restore();
    }
  });
}

function makeSweeps(){
  sweeps = [];
  const COUNT = 25; // Cantidad moderada de barridos para cobertura
  for (let i=0;i<COUNT;i++){
    const edge=Math.floor(rand(0,4));
    let x,y,angle;
    if (edge===0){x=-size.w*.12;y=rand(.08,.92)*size.h;angle=rand(-.05,.05);} // izq→der
    else if(edge===1){x=size.w*1.12;y=rand(.08,.92)*size.h;angle=Math.PI+rand(-.05,.05);} // der→izq
    else if(edge===2){x=rand(.08,.92)*size.w;y=-size.h*.12;angle=Math.PI/2+rand(-.05,.05);} // top→down
    else {x=rand(.08,.92)*size.w;y=size.h*1.12;angle=-Math.PI/2+rand(-.05,.05);} // bottom→up
    const baseW = rand(60,85)*(size.w/1280+size.h/720)*.5; // Barridos moderados
    const alpha = rand(.18,.28); // Alpha equilibrado
    const steps = Math.round(rand(150,250)*(size.w*size.h)/(1280*720)); // Pasos moderados
    const stepLen = rand(7.0,9.5) * (size.w/1280+size.h/720)*.5; 
    const drift = rand(.008,.022); 
    const tStart = clamp(rand(.35,.55),0,1); // Empiezan en tiempo equilibrado
    const tEnd = clamp(tStart+rand(.3,.45),0,1); 
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    sweeps.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b});
  }
  
  // Barridos diagonales (reducidos)
  const diagonalCount = 8; // Menos barridos diagonales
  for (let i=0; i<diagonalCount; i++){
    const corner = i % 4;
    let x, y, angle;
    switch(corner) {
      case 0: x = 0; y = 0; angle = rand(0.3, 0.7); break;
      case 1: x = size.w; y = 0; angle = rand(2.4, 2.8); break; 
      case 2: x = size.w; y = size.h; angle = rand(3.7, 4.1); break;
      case 3: x = 0; y = size.h; angle = rand(5.1, 5.5); break;
    }
    
    const baseW = rand(55,75)*(size.w/1280+size.h/720)*.5;
    const alpha = rand(.15,.25);
    const steps = Math.round(rand(180,280)*(size.w*size.h)/(1280*720));
    const stepLen = rand(8.0,11.0) * (size.w/1280+size.h/720)*.5;
    const drift = rand(.010,.020);
    const tStart = clamp(rand(.45,.65),0,1);
    const tEnd = clamp(tStart+rand(.25,.4),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    sweeps.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b});
  }
}

function makeWash(){
  wash = [];
  const cols = Math.max(8, Math.round(size.w/180)); // Espaciado más denso para mejor cobertura
  const rows = Math.max(7, Math.round(size.h/180)); // Espaciado más denso para mejor cobertura
  const dx = size.w/cols, dy = size.h/rows;
  for (let r=0;r<=rows;r++){
    for (let c=0;c<=cols;c++){
      const x = c*dx + rand(-dx*.3, dx*.3); // Menos variación para mejor cobertura
      const y = r*dy + rand(-dy*.3, dy*.3);
      const s = rand(2.0, 3.5)*(size.w/1280+size.h/720)*.5; // MÁS GRANDES para cobertura completa
      const a = rand(.15,.28); // MÁS OPACO para cobertura visible
      const rot = rand(0,Math.PI*2);
      const t = clamp(rand(.75,.95),0,1); // Empieza antes para cobertura temprana
      const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
      wash.push({x,y,s,a,rot,t,b});
    }
  }
  
  // NUEVO: Agregar puntos de wash adicionales en áreas problemáticas comunes
  const extraWashPoints = [
    // Esquinas (que a menudo quedan sin cubrir)
    {x: size.w*0.05, y: size.h*0.05}, {x: size.w*0.95, y: size.h*0.05},
    {x: size.w*0.05, y: size.h*0.95}, {x: size.w*0.95, y: size.h*0.95},
    // Centros de bordes
    {x: size.w*0.5, y: size.h*0.05}, {x: size.w*0.5, y: size.h*0.95},
    {x: size.w*0.05, y: size.h*0.5}, {x: size.w*0.95, y: size.h*0.5},
    // Puntos intermedios
    {x: size.w*0.25, y: size.h*0.25}, {x: size.w*0.75, y: size.h*0.25},
    {x: size.w*0.25, y: size.h*0.75}, {x: size.w*0.75, y: size.h*0.75}
  ];
  
  for (const point of extraWashPoints) {
    const s = rand(2.5, 4.0)*(size.w/1280+size.h/720)*.5;
    const a = rand(.2,.35);
    const rot = rand(0,Math.PI*2);
    const t = clamp(rand(.8,.98),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    wash.push({x: point.x, y: point.y, s, a, rot, t, b});
  }
  
  wash.sort((a,b)=>a.t-b.t); wash._drawn=0;
}

// Pinceladas onduladas muy sutiles (trazos suaves y orgánicos con brochas)
function makeWaves(){
  waves = [];
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(42*area, 28, 64));
  const earlyCount = Math.max(4, Math.min(10, Math.floor(COUNT*0.18)));
  for (let i=0;i<COUNT;i++){
    const x = rand(.12,.88)*size.w;
    const y = rand(.12,.88)*size.h;
    const baseW = clamp(gauss(13,4), 7,22) * (size.w/1280+size.h/720)*.5;
    const alpha = rand(.08,.18);
    const steps = Math.round(rand(120,200));
    const stepLen = rand(0.5,1.5) * (size.w/1280+size.h/720)*.5; // ULTRA LENTO
    const drift = rand(.0005,.003); // deriva mínima para casi no moverse
    const tStart = i < earlyCount ? rand(0, 0.1) : clamp(rand(.2,.7), 0, .85);
    const tEnd = clamp(tStart + rand(.60,.80), 0, .98); // duración ULTRA larga
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const freq = rand(0.002, 0.008); // frecuencia ultra baja para casi no ondular
    const ampAng = rand(0.01, 0.04); // amplitud angular mínima
    const angle = rand(0, Math.PI*2);
    waves.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b,phase:rand(0,Math.PI*2),freq,ampAng});
  }
}

function stepWave(wv, n, sizeMultiplier=1){
  if (n<=0) return 0; let spent=0; const hasBrush = wv.b>=0 && maskBrushes[wv.b];
  if (!hasBrush){ maskCtx.save(); maskCtx.lineCap='round'; maskCtx.lineJoin='round'; maskCtx.strokeStyle='#fff'; }
  // Inicializar contador si no existe
  if (wv.stepCount === undefined) wv.stepCount = 0;
  
  for (let i=0;i<n;i++){
    // Movimiento más orgánico y menos predecible
    const baseDrift = gauss(0, wv.drift*.06);
    const sineWave = Math.sin(wv.phase)*wv.ampAng*0.5;
    const randomTurn = (Math.random() - 0.5) * 0.12; // Giros aleatorios
    const directionShift = Math.cos(wv.stepCount * 0.015) * 0.08; // Cambio direccional periódico
    
    wv.angle += baseDrift + sineWave + randomTurn + directionShift;
    wv.phase += wv.freq * (0.8 + Math.random() * 0.4); // Frecuencia variable
    
    const nx = wv.x + Math.cos(wv.angle) * wv.stepLen;
    const ny = wv.y + Math.sin(wv.angle) * wv.stepLen;
    if (nx<-60||nx>size.w+60||ny<-60||ny>size.h+60){ 
      wv.angle += Math.PI * (0.25 + Math.random() * 0.2); // Rebotes más variados
      continue; 
    }
    const w = clamp(gauss(wv.baseW, wv.baseW*.12), wv.baseW*.75, wv.baseW*1.25) * sizeMultiplier;
    const a0 = wv.alpha;
    if (hasBrush){
      const brush = maskBrushes[wv.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.6;
      const rot = Math.atan2(ny-wv.y, nx-wv.x) + gauss(0, .07);
      // varias pasadas leves a lo largo del segmento para evitar aspecto disjunto
      for (let pass=0; pass<3; pass++){
        const t = pass/3; const ts = t*t*(3-2*t);
        const px = wv.x + (nx-wv.x)*ts;
        const py = wv.y + (ny-wv.y)*ts;
        const pAlpha = a0 * (0.12 + 0.08*Math.sin(ts*Math.PI));
        const pScale = scale * (0.9 + ts*0.18);
        const pRot = rot + gauss(0,.05);
        stamp(brush, px, py, pScale, pAlpha, pRot);
      }
      // Pasada perpendicular muy sutil para cerrar huecos finos
      const perpX = nx + Math.cos(rot + Math.PI/2) * w * 0.12;
      const perpY = ny + Math.sin(rot + Math.PI/2) * w * 0.12;
      stamp(brush, perpX, perpY, scale*0.88, a0*0.1, rot + Math.PI/4);
      spent += 3;
    } else {
      // fallback muy sutil
      maskCtx.globalAlpha = wv.alpha * 0.2;
      maskCtx.lineWidth = w;
      maskCtx.beginPath(); maskCtx.moveTo(wv.x, wv.y); maskCtx.lineTo(nx, ny); maskCtx.stroke();
      spent += 1;
    }
    wv.x = nx; wv.y = ny; wv.idx++; wv.stepCount++; // Incrementar contador
  }
  if (!hasBrush) maskCtx.restore();
  return spent;
}

// Puntos precomputados para el "sellado" final (cobertura de huecos) - OPTIMIZADO
function makeFinalSealing(){
  finalSealing = [];
  const cols = Math.max(8, Math.round(size.w/220)); // REDUCIDO espaciado para menos puntos
  const rows = Math.max(6, Math.round(size.h/220)); // REDUCIDO espaciado para menos puntos
  const dx = size.w/cols, dy = size.h/rows;
  for (let r=0; r<=rows; r++){
    for (let c=0; c<=cols; c++){
      const x = c*dx + (r%2? dx*0.3: -dx*0.3);
      const y = r*dy + (c%2? dy*0.3: -dy*0.3);
      const b = maskBrushes.length? (r*31+c)%maskBrushes.length : -1;
      finalSealing.push({x,y,b});
    }
  }
  // aleatorizar el orden para que no se note un patrón
  for (let i=finalSealing.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [finalSealing[i],finalSealing[j]]=[finalSealing[j],finalSealing[i]]; }
  finalSealing._drawn = 0;
}

// Un golpe inicial en el centro para evitar pantalla en blanco + sellado adicional del centro
function kickstartMask(){
  const cx = size.w*0.5, cy = size.h*0.5;
  const desiredW = Math.max(60, Math.min(size.w, size.h) * 0.10); // ligeramente menor para no saturar el centro
  const b = (maskBrushes && maskBrushes.length) ? maskBrushes[0] : null;
  
  // Golpe central principal
  if (b){
    const scale = desiredW / Math.max(1, b.width);
    stamp(b, cx, cy, scale, 0.4, 0); // MÁS OPACO
  } else {
    maskCtx.save(); maskCtx.globalAlpha=0.4; maskCtx.beginPath(); maskCtx.fillStyle="#fff";
    maskCtx.arc(cx, cy, desiredW*0.5, 0, Math.PI*2); maskCtx.fill(); maskCtx.restore();
  }
  
  // NUEVO: Añadir múltiples capas concéntricas para asegurar cobertura central completa
  for (let i = 1; i <= 3; i++) {
    const radius = desiredW * 0.3 * i;
    const alpha = 0.25 / i; // menos opaco en capas externas
    if (b) {
      const scale = radius / Math.max(1, b.width);
      stamp(b, cx, cy, scale, alpha, i * Math.PI / 4); // rotar cada capa
    } else {
      maskCtx.save(); 
      maskCtx.globalAlpha = alpha; 
      maskCtx.beginPath(); 
      maskCtx.fillStyle = "#fff";
      maskCtx.arc(cx, cy, radius, 0, Math.PI*2); 
      maskCtx.fill(); 
      maskCtx.restore();
    }
  }
  
  console.log('🎯 *** KICKSTART *** Centro reforzado con múltiples capas');
}

function stamp(brush,x,y,scale,alpha,rot){
  const w = brush.width*scale, h=brush.height*scale;
  const halfW = w * 0.5, halfH = h * 0.5;
  
  if (rot) {
    // Solo usar save/restore si hay rotación
    maskCtx.save();
    maskCtx.translate(x,y);
    maskCtx.rotate(rot);
    maskCtx.globalAlpha=alpha;
    maskCtx.drawImage(brush, -halfW, -halfH, w, h);
    maskCtx.restore();
  } else {
    // Optimización para caso sin rotación (más común)
    const prevAlpha = maskCtx.globalAlpha;
    maskCtx.globalAlpha = alpha;
    maskCtx.drawImage(brush, x - halfW, y - halfH, w, h);
    maskCtx.globalAlpha = prevAlpha;
  }
}

// Marcadores rojos removidos - ya no se usan

function stepStroke(stk, n, sizeMultiplier = 1, motionScale = 1){
  if (n<=0) return 0; let spent=0; const hasBrush=stk.b>=0 && maskBrushes[stk.b];
  if (!hasBrush){ maskCtx.save(); maskCtx.lineCap='round'; maskCtx.lineJoin='round'; maskCtx.strokeStyle='#fff'; }
  // velocidad suavizada (inercia) - más lenta y progresiva
  if (stk.vx===undefined){
    stk.vx = Math.cos(stk.angle) * stk.stepLen * 0.7;
    stk.vy = Math.sin(stk.angle) * stk.stepLen * 0.7;
  }
  // Inicializar contador de pasos si no existe
  if (stk.stepCount === undefined) stk.stepCount = 0;
  
  for (let i=0;i<n;i++){
    // Variación direccional más orgánica y menos circular
    const baseAngleChange = gauss(0, stk.drift * 0.04); // Más variación base
    
    // Cambios direccionales periódicos para evitar espirales
    const directionShift = Math.sin(stk.stepCount * 0.02) * 0.15; // Oscilación suave
    const randomWalk = (Math.random() - 0.5) * 0.08; // Caminata aleatoria
    
    stk.angle += baseAngleChange + directionShift + randomWalk;
    
    // Reducir significativamente la atracción al centro para evitar circularidad
    const cx=size.w*.5, cy=size.h*.5; const toC=Math.atan2(cy-stk.y, cx-stk.x);
    stk.angle = stk.angle * 0.995 + toC * 0.005; // Mucho menos atracción al centro
    
    // Agregar tendencia direccional basada en la posición para crear flujos más naturales
    const flowAngle = Math.atan2(stk.y - size.h*0.3, stk.x - size.w*0.3);
    stk.angle = stk.angle * 0.98 + flowAngle * 0.02;
    
    const tx = Math.cos(stk.angle) * (stk.stepLen * motionScale * 0.7);
    const ty = Math.sin(stk.angle) * (stk.stepLen * motionScale * 0.7);
    // inercia hacia la velocidad objetivo, más lenta
    stk.vx = lerp(stk.vx, tx, 0.07);
    stk.vy = lerp(stk.vy, ty, 0.07);
    const nx = stk.x + stk.vx;
    const ny = stk.y + stk.vy;
    if (nx<-50||nx>size.w+50||ny<-50||ny>size.h+50){ 
      stk.angle += Math.PI * (0.2 + Math.random() * 0.3); // Variación en los rebotes
      continue; 
    }

    const w = clamp(gauss(stk.baseW, stk.baseW*.08), stk.baseW*.8, stk.baseW*1.2) * sizeMultiplier;
    const a0 = stk.alpha;
    if (hasBrush){
      const brush = maskBrushes[stk.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.6;
      const rot = Math.atan2(stk.vy, stk.vx) + gauss(0, .07);
      // pasadas muy suaves entre puntos con easing para evitar saltos
      for (let pass=0; pass<6; pass++){
        const t = pass / 5; // 0..1
        const ts = t*t*(3-2*t); // smoothstep
        const px = stk.x + (nx-stk.x)*ts;
        const py = stk.y + (ny-stk.y)*ts;
        const pScale = scale * (0.85 + ts*0.25);
        const pAlpha = a0 * (0.13 + Math.sin(ts*Math.PI)*0.11);
        const pRot = rot + gauss(0, .04);
        stamp(brush, px, py, pScale, pAlpha, pRot);
      }
      // Pasada perpendicular muy sutil para cerrar huecos finos
      const perpX = nx + Math.cos(rot + Math.PI/2) * w * 0.12;
      const perpY = ny + Math.sin(rot + Math.PI/2) * w * 0.12;
      stamp(brush, perpX, perpY, scale*0.88, a0*0.1, rot + Math.PI/4);
      spent += 6;
    } else {
      // fallback: múltiples líneas superpuestas con menos variación
      for (let pass=0; pass<4; pass++){
        const offset = (pass-1.5) * w * 0.07;
        const perpX = Math.cos(Math.atan2(stk.vy, stk.vx) + Math.PI/2) * offset;
        const perpY = Math.sin(Math.atan2(stk.vy, stk.vx) + Math.PI/2) * offset;
        maskCtx.globalAlpha = a0 * (0.17 + pass*0.05);
        maskCtx.lineWidth = w * (0.9 + pass*0.04);
        maskCtx.beginPath();
        maskCtx.moveTo(stk.x + perpX, stk.y + perpY);
        maskCtx.lineTo(nx + perpX, ny + perpY);
        maskCtx.stroke();
      }
      spent += 4;
    }
    stk.x=nx; stk.y=ny; stk.idx++; stk.stepCount++; // Incrementar contador de pasos
  }
  if (!hasBrush) maskCtx.restore();
  return spent;
  // Al llegar al final, fuerza la máscara a blanco para revelar todo
  if (p >= 1) {
    maskCtx.save();
    maskCtx.globalAlpha = 1;
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = '#fff';
    maskCtx.fillRect(0, 0, size.w, size.h);
    maskCtx.restore();
  }
}

function stepSpiral(spr, n, sizeMultiplier = 1){
  if (n<=0) return 0; let spent=0; const hasBrush=spr.b>=0 && maskBrushes[spr.b];
  if (!hasBrush){ maskCtx.save(); maskCtx.lineCap='round'; maskCtx.lineJoin='round'; maskCtx.strokeStyle='#fff'; }
  for (let i=0;i<n;i++){
    const x = spr.cx + Math.cos(spr.angle) * spr.radius;
    const y = spr.cy + Math.sin(spr.angle) * spr.radius;
    const w = clamp(gauss(spr.baseW, spr.baseW*.15), spr.baseW*.7, spr.baseW*1.3) * sizeMultiplier;
    if (hasBrush){
      const brush = maskBrushes[spr.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.5;
      // 3 pasadas suaves para espiral
      for (let pass=0; pass<3; pass++){
        const pAlpha = spr.alpha * (0.2 + pass*0.1);
        const pScale = scale * (0.9 + pass*0.05);
        stamp(brush, x, y, pScale, pAlpha, spr.angle);
      }
      spent += 3;
    } else {
      // mancha orgánica en lugar de círculo perfecto
      fillIrregularBlob(x, y, w/2, makeHarmonics(2), spr.alpha * 0.35, 24, 0.9, 0.01);
      spent += 1;
    }
    spr.angle += spr.angleSpeed;
    spr.radius += spr.radiusSpeed;
    spr.idx++;
  }
  if (!hasBrush) maskCtx.restore();
  return spent;
}

function stepRadiant(rad, n, sizeMultiplier = 1){
  if (n<=0) return 0; let spent=0; const hasBrush=rad.b>=0 && maskBrushes[rad.b];
  if (!hasBrush){ maskCtx.save(); maskCtx.lineCap='round'; maskCtx.lineJoin='round'; maskCtx.strokeStyle='#fff'; }
  for (let i=0;i<n;i++){
    const rayAngle = (rad.currentRay / rad.rays) * Math.PI * 2;
    const progress = (rad.idx % (rad.steps/rad.rays)) / (rad.steps/rad.rays);
    const dist = progress * rad.rayLength;
    const x = rad.cx + Math.cos(rayAngle) * dist;
    const y = rad.cy + Math.sin(rayAngle) * dist;
    const w = clamp(gauss(rad.baseW, rad.baseW*.12), rad.baseW*.8, rad.baseW*1.2) * sizeMultiplier;
    if (hasBrush){
      const brush = maskBrushes[rad.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.2;
      const pAlpha = rad.alpha * (0.3 + progress*0.2);
      stamp(brush, x, y, scale, pAlpha, rayAngle);
      spent += 1;
    } else {
      fillIrregularBlob(x, y, w/2, makeHarmonics(2), rad.alpha * 0.3, 24, 0.9, 0.01);
      spent += 1;
    }
    rad.idx++;
    if (rad.idx % (rad.steps/rad.rays) === 0) rad.currentRay++;
  }
  if (!hasBrush) maskCtx.restore();
  return spent;
}

function stepConnector(con, n, sizeMultiplier = 1){
  if (n<=0) return 0; let spent=0; const hasBrush=con.b>=0 && maskBrushes[con.b];
  if (!hasBrush){ maskCtx.save(); maskCtx.lineCap='round'; maskCtx.lineJoin='round'; maskCtx.strokeStyle='#fff'; }
  for (let i=0;i<n;i++){
    const t = con.idx / con.steps;
    const x = con.x1 + (con.x2-con.x1)*t;
    const y = con.y1 + (con.y2-con.y1)*t;
    const w = clamp(gauss(con.baseW, con.baseW*.1), con.baseW*.8, con.baseW*1.2) * sizeMultiplier;
    if (hasBrush){
      const brush = maskBrushes[con.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.0;
      // 2 pasadas para conectores
      const pAlpha1 = con.alpha * 0.25;
      const pAlpha2 = con.alpha * 0.15;
      stamp(brush, x, y, scale, pAlpha1, Math.atan2(con.y2-con.y1, con.x2-con.x1));
      stamp(brush, x, y, scale*0.8, pAlpha2, Math.atan2(con.y2-con.y1, con.x2-con.x1) + Math.PI/4);
      spent += 2;
    } else {
      fillIrregularBlob(x, y, w/2, makeHarmonics(2), con.alpha * 0.28, 22, 0.9, 0.01);
      spent += 1;
    }
    con.idx++;
  }
  if (!hasBrush) maskCtx.restore();
  return spent;
}

function drawProgress(p, budget = MAX_UNITS_PER_FRAME){
  // Reset eventos de dibujo de este frame
  drawEvents.length = 0;
  // Progreso lineal para coloreado rápido y uniforme
  const e = p;
  // budget ahora viene del llamador (loop) y es adaptativo por frame

  // Instrumentación ligera para diagnóstico (log cada 60 frames)
  if (!drawProgress._frameCount) drawProgress._frameCount = 0;
  drawProgress._frameCount++;
  const initialBudget = budget;

  // OPTIMIZACIÓN: Activar más semillas más rápido para cobertura completa
  const activeSeeds = Math.max(1, Math.ceil(Math.pow(e, 0.7) * seeds.length)); // Más agresivo
  
  // El tamaño del pincel crece más rápido para cobertura completa
  const sizeMultiplier = 0.4 + (1 - Math.exp(-3.5 * e)) * 2.2; // Más agresivo
  // Velocidad de trazo más rápida para coloreado completo
  const motionScale = 1.2; // Más rápido

  // PRIORIDAD 1: Trazos principales con mayor presupuesto (solo de semillas activas)
  let strokeBudget = Math.floor(budget * 0.6); // 60% del presupuesto para trazos principales
  for (let i=0;i<strokes.length && strokeBudget>0;i++){
    const s=strokes[i];
    if (s.seedIndex >= activeSeeds) continue; // Saltar si la semilla de este trazo aún no está activa
    if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){ 
      const allow = Math.min(need, strokeBudget, MAX_STEPS_PER_ENTITY_FRAME * 2); // Permitir más pasos
      strokeBudget -= stepStroke(s, allow, sizeMultiplier, motionScale); 
    }
  }
  budget -= (Math.floor(budget * 0.6) - strokeBudget); // Actualizar presupuesto total

  // PRIORIDAD 2: Barridos grandes para rellenar rápidamente
  let sweepBudget = Math.floor(budget * 0.3); // 30% del presupuesto restante para barridos
  for (let i=0;i<sweeps.length && sweepBudget>0;i++){
    const s=sweeps[i]; if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){
      const allow = Math.min(need, sweepBudget, MAX_STEPS_PER_ENTITY_FRAME * 2);
      // Tamaño más grande para cobertura rápida
      const sweepSize = sizeMultiplier * 1.8; // Más grande
      sweepBudget -= stepStroke(s, allow, sweepSize, motionScale);
    }
  }
  budget -= (Math.floor(budget * 0.3) - sweepBudget); // Actualizar presupuesto total

  // Gotas de coloreo (activas desde el principio) - presupuesto restante
  for (let i=0;i<colorDrops.length && budget>0;i++){
    const drop = colorDrops[i];
    if (e >= drop.tStart && e <= drop.tEnd) {
      stepColorDrop(drop, e, sizeMultiplier);
      budget -= 1; // bajo costo computacional
    }
  }

  // Añadir gotas tardías después de 40% del tiempo para cobertura completa
  if (e > 0.4 && !hasAddedLateDrops) {
    addLateColorDrops();
  }

  // Procesar gotas tardías
  for (let i=0;i<lateColorDrops.length && budget>0;i++){
    const drop = lateColorDrops[i];
    if (e >= drop.tStart && e <= drop.tEnd) {
      stepColorDrop(drop, e, sizeMultiplier);
      budget -= 1;
    }
  }

  // Crear y procesar círculo final (empieza temprano para cobertura completa)
  if (e > 0.45 && !hasFinalCircleStarted) {
    createFinalCircle();
  }
  
  if (finalCircles.length > 0) {
    stepFinalCircle(e, sizeMultiplier);
  }

  // Gotas (se activan más rápido)
  const activeDroplets = Math.ceil(Math.pow(e, 0.8) * (droplets.length||0)); // Más rápido
  for (let i=0;i<activeDroplets && budget>0;i++){
    const d = droplets[i];
    if (e < d.tStart) continue;
    budget -= stepDroplet(d, e, sizeMultiplier * 1.5, Math.floor(budget*.15)); // Más grande
  }

  // Espirales (se activan más rápido y con mayor tamaño)
  const activeSpirals = Math.ceil(Math.pow(e, 0.8) * spirals.length);
  for (let i=0;i<activeSpirals && budget>0;i++){
    const s=spirals[i]; if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){ 
      const allow = Math.min(need, Math.floor(budget*0.1), MAX_STEPS_PER_ENTITY_FRAME); 
      budget -= stepSpiral(s, allow, sizeMultiplier * 1.3); // Más grande
    }
  }
  
  // Radiantes (más rápidos y grandes)
  const activeRadiants = Math.ceil(Math.pow(e, 0.8) * radiants.length);
  for (let i=0;i<activeRadiants && budget>0;i++){
    const r=radiants[i]; if (e < r.tStart) continue;
    const local = r.tEnd>r.tStart? clamp((e-r.tStart)/(r.tEnd-r.tStart),0,1) : 1;
    const target = Math.floor(r.steps*local); const need = target - r.idx;
    if (need>0){ 
      const allow = Math.min(need, Math.floor(budget*0.08), MAX_STEPS_PER_ENTITY_FRAME); 
      budget -= stepRadiant(r, allow, sizeMultiplier * 1.4); // Más grande
    }
  }

  // Pinceladas onduladas más grandes
  const activeWaves = Math.ceil(Math.pow(e, 0.8) * waves.length);
  for (let i=0;i<activeWaves && budget>0;i++){
    const wv = waves[i]; if (e < wv.tStart) continue;
    const local = wv.tEnd>wv.tStart? clamp((e-wv.tStart)/(wv.tEnd-wv.tStart),0,1) : 1;
    const target = Math.floor(wv.steps*local); const need = target - wv.idx;
    if (need>0){ 
      const allow = Math.min(need, Math.floor(budget*0.1), MAX_STEPS_PER_ENTITY_FRAME); 
      budget -= stepWave(wv, allow, sizeMultiplier * 1.3); // Más grande
    }
  }
  
  // Conectores más agresivos
  const activeConnectors = Math.ceil(Math.pow(e, 0.8) * connectors.length);
  for (let i=0;i<activeConnectors && budget>0;i++){
    const c=connectors[i]; if (e < c.tStart) continue;
    const local = c.tEnd>c.tStart? clamp((e-c.tStart)/(c.tEnd-c.tStart),0,1) : 1;
    const target = Math.floor(c.steps*local); const need = target - c.idx;
    if (need>0){ 
      const allow = Math.min(need, Math.floor(budget*0.05), MAX_STEPS_PER_ENTITY_FRAME); 
      budget -= stepConnector(c, allow, sizeMultiplier * 1.2); // Más grande
    }
  }
  
  // Wash más agresivo para cobertura completa
  if (wash.length && e >= WASH_START){
    const total=wash.length; if (wash._drawn===undefined) wash._drawn=0;
    const phase = clamp((e - WASH_START) / (1 - WASH_START), 0, 1);
    const target = Math.floor(total * phase);
    const remaining = target - wash._drawn;
    const perFrame = Math.max(2, Math.min(WASH_CHUNK_BASE * 2, Math.min(remaining, Math.floor(budget*0.15)))); // Más agresivo
    const end = Math.min(total, wash._drawn + perFrame);
    for (let i=wash._drawn; i<end && budget>0; i++){
      const w=wash[i]; const br = w.b>=0? maskBrushes[w.b] : null;
      if (br) {
        stamp(br, w.x, w.y, w.s * sizeMultiplier * 1.5, w.a, w.rot); // Más grande
      } else {
        fillIrregularBlob(w.x, w.y, 35 * sizeMultiplier, makeHarmonics(2), w.a, 30, 1.0, 0.02); // Más grande
      }
      wash._drawn=i+1; budget-=1;
    }
  }

  // Sellado final MUY AGRESIVO para cobertura completa al 100%
  if (e >= FINAL_SEAL_START && budget > 0 && finalSealing.length){
    if (finalSealing._drawn===undefined) finalSealing._drawn=0;
    const t = clamp((e - FINAL_SEAL_START) / (1 - FINAL_SEAL_START), 0, 1);
    const alpha = FINAL_SEAL_ALPHA_MIN + (FINAL_SEAL_ALPHA_MAX - FINAL_SEAL_ALPHA_MIN) * t;
    const total = finalSealing.length;
    const target = Math.floor(total * Math.min(1, t*1.5)); // Muy agresivo
    const remaining = target - finalSealing._drawn;
    const base = Math.max(5, Math.ceil(FINAL_SEAL_CHUNK_BASE * (1 + t*3))); // Mucho más agresivo
    const perFrame = Math.max(5, Math.min(base, Math.min(remaining, Math.floor(budget*0.2)))); // 20% del presupuesto
    const end = Math.min(finalSealing.length, finalSealing._drawn + perFrame);
    for (let i = finalSealing._drawn; i < end && budget > 0; i++){
      const pt = finalSealing[i];
      const b = (pt.b>=0 && maskBrushes.length) ? maskBrushes[pt.b] : null;
      if (b){
        // Trazos más largos y gruesos para cobertura completa
        const angle = rand(0, Math.PI*2);
        const len = 30 * (1.2 + 0.6*(1-t)); // Más largo
        const steps = 5 + Math.floor(rand(0,3)); // Más pasos
        for (let k=0;k<steps;k++){
          const u = steps===1? 0.5 : k/(steps-1);
          const x = pt.x + Math.cos(angle)*(u-0.5)*len;
          const y = pt.y + Math.sin(angle)*(u-0.5)*len;
          const s = 3.0 * (1.2 + u*0.5); // Más grande
          stamp(b, x, y, s, alpha*(0.9 + 0.3*u), angle + gauss(0,0.08));
        }
      } else {
        fillIrregularBlob(pt.x, pt.y, 45 * sizeMultiplier, makeHarmonics(3), alpha, 35, 1.2, 0.02); // Mucho más grande
      }
      finalSealing._drawn = i + 1; budget -= 1;
    }
  }

  // Cobertura final SÚPER AGRESIVA para asegurar 100% de revelado
  if (e >= 0.85 && budget > 0) { // Empezar antes (85% en lugar de 95%)
    // Más puntos de sellado para cobertura total
    const extraSeals = [];
    // Grid más denso para cobertura completa
    for (let x = 0.05; x <= 0.95; x += 0.15) {
      for (let y = 0.05; y <= 0.95; y += 0.15) {
        extraSeals.push({x: size.w * x, y: size.h * y});
      }
    }
    const extraAlpha = (e - 0.85) * 0.6; // Más opaco
    for (let i=0; i<extraSeals.length && budget>0; i++) {
      const pt = extraSeals[i];
      const b = maskBrushes.length ? maskBrushes[i % maskBrushes.length] : null;
      if (b) {
        stamp(b, pt.x, pt.y, 4.0, extraAlpha, rand(0, Math.PI*2)); // Más grande
      } else {
        fillIrregularBlob(pt.x, pt.y, 60, makeHarmonics(3), extraAlpha, 40, 1.4, 0.03); // Mucho más grande
      }
      budget--;
    }
  }

  // Instrumentación: reportar uso de presupuesto cada 60 frames
  if (drawProgress._frameCount % 60 === 0) {
    const used = initialBudget - budget;
    console.log(`📊 COLOREADO COMPLETO - presupuesto inicial=${initialBudget}, usado=${used}, restante=${budget}, progreso=${Math.round(e*100)}%`);
  }
}

// Función para renderizar fondo estático (sin animación)
function renderStaticBackground() {
  const currentBG = getCurrentPattern();
  
  if (!currentBG) {
  console.warn('⚠️ No hay patrón para renderizar como fondo');
    return;
  }
  
  if (!ctx || !layout.dw || !layout.dh) {
    console.warn('⚠️ Canvas no inicializado correctamente');
    return;
  }
  
  try {
    // RESETEAR transformación del contexto para evitar escalados incorrectos
    try { ctx.setTransform(1,0,0,1,0,0); } catch(_){}
    // Limpiar canvas
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar fondo completo
    if (layout.sourceWidth && layout.sourceHeight) {
      // Con secciones (para wallpaper u otros patrones divididos)
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){}
      ctx.drawImage(
        currentBG,
        layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
        layout.dx, layout.dy, layout.dw, layout.dh
      );
    } else {
      // Imagen completa (para patrones simples como amarillo.jpg)
      // asegurar calidad y usar mapeo explícito
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){}
      const sw = currentBG.naturalWidth || currentBG.width || layout.dw;
      const sh = currentBG.naturalHeight || currentBG.height || layout.dh;
      ctx.drawImage(currentBG, 0, 0, sw, sh, layout.dx, layout.dy, layout.dw, layout.dh);
    }
    
    console.log('✅ Fondo estático renderizado');
  } catch (error) {
    console.error('❌ Error renderizando fondo estático:', error);
  }
}

function render(){
  const currentBG = getCurrentPattern();
  
  if (!currentBG) {
  console.warn('⚠️ No hay patrón disponible para renderizar');
    return;
  }
  const currentPatternData = patterns[currentPatternIndex];
  console.log(`🔍 DEBUG RENDER - patrón: ${currentPatternData?.filename}, tipo: ${currentPatternData?.type}, preserveCanvasContent: ${preserveCanvasContent}, isFirstAnimation: ${isFirstAnimation}`);
  
  // Unificar pipeline: siempre dibujar como wallpaper (directo + máscara), sin rama offscreen
  if (isFirstAnimation || !preserveCanvasContent) {
  // Rama directa para primer render o cuando no preservamos contenido
  console.log(`✅ USANDO RAMA DIRECTA - isFirstAnimation: ${isFirstAnimation}, !preserveCanvasContent: ${!preserveCanvasContent}`);
    // Primera animación o reset: limpiar y dibujar fondo completo
    // RESETEAR transformación del contexto principal para evitar escalados incorrectos
    try { ctx.setTransform(1,0,0,1,0,0); } catch(_){}
    ctx.clearRect(0, 0, size.w, size.h);
    
    // Dibujar imagen de fondo optimizada
    if (layout.dw && layout.dh) {
      if (layout.sourceWidth && layout.sourceHeight) {
        // Con secciones
  try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){}
        ctx.drawImage(
          currentBG, 
          layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
          layout.dx, layout.dy, layout.dw, layout.dh
        );
      } else {
        // Imagen completa
  try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){}
        const sw = currentBG.naturalWidth || currentBG.width || layout.dw;
        const sh = currentBG.naturalHeight || currentBG.height || layout.dh;
        ctx.drawImage(currentBG, 0, 0, sw, sh, layout.dx, layout.dy, layout.dw, layout.dh);
      }
    }
    
    // Si es la primera vez, marcar que ya no es primera animación
    if (isFirstAnimation) {
      isFirstAnimation = false;
      preserveCanvasContent = true; // Activar preservación después del primer dibujo
      console.log('🎨 *** FONDO INICIAL DIBUJADO *** Preservación activada para próximos coloreados');
    }
    
  // Aplicar máscara
  ctx.globalCompositeOperation = 'destination-in';
  try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){}
  ctx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, size.w, size.h);
  ctx.globalCompositeOperation = 'destination-over'; 
  ctx.fillStyle = '#E89E54'; 
    ctx.fillRect(0, 0, size.w, size.h);
  } else {
    // Misma ruta de wallpaper también para coloreados posteriores
    try { ctx.setTransform(1,0,0,1,0,0); } catch(_){}
    // No limpiar el canvas principal si preservamos contenido
    if (layout.dw && layout.dh) {
      if (layout.sourceWidth && layout.sourceHeight) {
        try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){ }
        ctx.drawImage(
          currentBG,
          layout.sourceX, layout.sourceY, layout.sourceWidth, layout.sourceHeight,
          layout.dx, layout.dy, layout.dw, layout.dh
        );
      } else {
        try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){ }
        const sw = currentBG.naturalWidth || currentBG.width || layout.dw;
        const sh = currentBG.naturalHeight || currentBG.height || layout.dh;
        ctx.drawImage(currentBG, 0, 0, sw, sh, layout.dx, layout.dy, layout.dw, layout.dh);
      }
      // Aplicar máscara por encima de lo existente
      ctx.globalCompositeOperation = 'destination-in';
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch(_){ }
      ctx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, size.w, size.h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  
  // Mantener modo de composición normal
  ctx.globalCompositeOperation='source-over';
}
function loop(ts){
  // OPTIMIZACIÓN: Evitar trabajo cuando la pestaña está oculta
  if (document.hidden) {
    rafId = requestAnimationFrame(loop);
    return;
  }
  
  if (!startedAt) startedAt = ts;
  const pRaw = (ts - startedAt) / DURATION_MS;
  const p = clamp(pRaw, 0, 1);
  
  // Presupuesto adaptativo MUY AGRESIVO para coloreado completo rápido
  if (!loop._lastTs) loop._lastTs = ts;
  const delta = Math.min(100, ts - loop._lastTs);
  loop._lastTs = ts;
  
  // PRESUPUESTO MUCHO MÁS ALTO para coloreado completo
  const unitsPerSecond = MAX_UNITS_PER_FRAME * 120; // Presupuesto base muy alto
  let adaptiveBudget = Math.max(100, Math.round(unitsPerSecond * (delta / 1000))); // Mínimo muy alto
  adaptiveBudget = Math.min(adaptiveBudget, MAX_UNITS_PER_FRAME * 8); // Máximo muy alto

  // Actualizar progreso con presupuesto agresivo para coloreado completo
  drawProgress(p, adaptiveBudget);
  
  render();
  
  // Verificación de finalización optimizada
  const finalSealingUnfinished = (finalSealing && finalSealing.length) ? ((finalSealing._drawn || 0) < finalSealing.length) : false;
  const washUnfinished = (wash && wash.length) ? ((wash._drawn || 0) < wash.length) : false;
  const finalCirclesUnfinished = (finalCircles && finalCircles.length) ? finalCircles.some(fc => (fc.currentRadius || 0) <= (fc.maxRadius * 0.98)) || p < 0.95 : false;
  
  const stillRunning = p < 1 || finalSealingUnfinished || washUnfinished || finalCirclesUnfinished;
  
  if (stillRunning) {
    rafId = requestAnimationFrame(loop);
  } else {
    // Animación REALMENTE completada - render final
    console.log('✅ COLOREADO COMPLETO AL 100% - Imagen totalmente coloreada');
    animationFinished = true;
    
    // Liberar secuencia de wallpaper si estaba activa
    if (coloringMode === 'wallpaper' && wallpaperSequenceActive) {
      console.log(`🔓 Liberando secuencia wallpaper completada (ID: ${wallpaperSequenceId})`);
      wallpaperSequenceActive = false;
      wallpaperSequenceId = null;
    }
    
    // Liberar lock de paso en curso
    if (autoColorSequence) autoColorSequence.isRunning = false;
    
    // Render final optimizado
    render();
    
    // Limpiar frame pendiente
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    
    // Marcar que ya no es la primera animación
    isFirstAnimation = false;
    
    // ACTIVAR preservación del canvas
    preserveCanvasContent = true;
    console.log('🎨 *** COLOREADO COMPLETADO *** - Listo para recibir siguiente imagen');

    // Si había un cambio a secuencia pendiente, ejecutarlo ahora
    if (pendingSwitchToSequence) {
      console.log('▶️ Ejecutando cambio a modo secuencia que estaba pendiente');
      pendingSwitchToSequence = false;
      try { switchToSequenceMode(); } catch (e) { console.error('❌ Error al cambiar a modo secuencia tras completar:', e); }
    }
    
    // Programar el próximo paso alineado a ancla de tiempo (si la secuencia está activa)
    // NOTA: Solo auto-programar si NO estamos esperando comandos sincronizados del servidor
    if (autoColorSequence && autoColorSequence.active && !autoColorSequence.nextStepScheduled) {
      autoColorSequence.nextStepScheduled = true;
      if (autoColorSequence.timeoutId) { clearTimeout(autoColorSequence.timeoutId); }
      
      // MEJORA DE SINCRONIZACIÓN: Solo usar auto-programación como fallback
      // En modo sincronizado, esperamos comandos del servidor
      const period = autoColorSequence.periodMs || (autoColorSequence.intervalTime + (typeof DURATION_MS !== 'undefined' ? DURATION_MS : 14000));
      const nowTs2 = Date.now();
      // Calcular la siguiente frontera a partir del último boundary (o anchorStartAt)
      let base = autoColorSequence.lastBoundaryTs || autoColorSequence.anchorStartAt || nowTs2;
      while (base <= nowTs2) base += period;
      const delayMs = Math.max(0, base - nowTs2);
      autoColorSequence.lastBoundaryTs = base;
      
      console.log(`⏱️ Brush ${brushId}: Próximo paso programado en ${delayMs}ms (period=${period}) - FALLBACK AUTO`);
      
      autoColorSequence.timeoutId = setTimeout(() => {
        if (autoColorSequence.active && coloringMode === 'sequence') {
          console.log(`🔄 Brush ${brushId}: Ejecutando paso automático (fallback) - se recomienda sincronización por servidor`);
          executeColorStep();
        }
        autoColorSequence.nextStepScheduled = false;
        autoColorSequence.timeoutId = null;
        if (autoColorSequence.watchdogId) { clearTimeout(autoColorSequence.watchdogId); autoColorSequence.watchdogId = null; }
      }, delayMs);
    }
    
    // Notificar de forma asíncrona
    setTimeout(() => {
      if (socket && socket.connected) {
        socket.emit('animationCompleted', {
          brushId: brushId,
          timestamp: Date.now()
        });
        console.log(`📡 *** BRUSH ${brushId} *** Enviada animationCompleted al control (timestamp: ${Date.now()})`);
      }
    }, 0);
  }
}

// Loop separado para monitor FPS que continúa después de la animación
function fpsMonitorLoop(ts) {
  fpsMonitor.update(ts);
  
  if (animationFinished) {
    // Actualizar display con estado completo pero mantener FPS visible
    fpsMonitor.showCompleted();
  }
  
  // Continuar el monitor FPS indefinidamente
  fpsMonitorRafId = requestAnimationFrame(fpsMonitorLoop);
}

function start(){ 
  cancelAnimationFrame(rafId); 
  cancelAnimationFrame(fpsMonitorRafId);
  
  // Resetear estado de animación
  animationFinished = false;
  hasAddedLateDrops = false; // resetear gotas tardías
  lateColorDrops = []; // limpiar gotas tardías
  hasFinalCircleStarted = false; // resetear círculo final
  finalCircle = null; // limpiar círculo final
  finalCircles = []; // limpiar círculos finales
  
  resize(); 
  // Clear in device pixels (reset transform temporarily)
  try { maskCtx.save(); maskCtx.setTransform(1,0,0,1,0,0); } catch(_) {}
  maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  try { maskCtx.restore(); } catch(_) {}
  
  // golpe inicial en el centro para que empiece a mostrarse de inmediato
  kickstartMask();
  makeSeeds(24); // más semillas para distribuir trazos
  makeStrokes(); 
  makeSpirals();
  makeRadiants();
  makeDroplets();
  makeColorDrops(); // NUEVO: gotas de coloreo
  makeConnectors();
  makeSweeps(); 
  makeWaves();
  makeWash(); 
  makeFinalSealing();
  
  // render inmediato para que se vea el golpe inicial antes del primer frame
  render();
  startedAt=0; 
  if (!rafId) rafId=requestAnimationFrame(loop);
  
  // Iniciar monitor FPS por separado
  if (!fpsMonitorRafId) fpsMonitorRafId=requestAnimationFrame(fpsMonitorLoop); 
}

// NUEVA FUNCIÓN: Colorear ENCIMA del wallpaper existente sin resetear
function colorOnTop(){ 
  console.log('🎨 *** BRUSH *** Iniciando colorOnTop - COLOREADO SOBRE FONDO EXISTENTE');
  
  // Cancelar bucles previos y resetear IDs para permitir re-inicio correcto
  cancelAnimationFrame(rafId); 
  cancelAnimationFrame(fpsMonitorRafId);
  rafId = 0;
  fpsMonitorRafId = 0;
  
  // IMPORTANTE: NO resetear estado de animación - mantener lo que ya está dibujado
  animationFinished = false;
  
  // CRÍTICO: Forzar preservación del canvas para coloreado en capas
  preserveCanvasContent = true;
  isFirstAnimation = false; // Ya no es la primera animación
  
  console.log(`🎨 *** COLOR ON TOP *** preserveCanvasContent: ${preserveCanvasContent}, isFirstAnimation: ${isFirstAnimation}`);
  
  // Recalcular layout para el patrón actual (evita estados de sección previos)
  try { resize(); } catch(_) {}

  // Solo limpiar la máscara para nueva animación encima (NO tocar el canvas principal)
  if (maskCtx && maskCanvas.width > 0 && maskCanvas.height > 0) {
  try { maskCtx.save(); maskCtx.setTransform(1,0,0,1,0,0); } catch(_) {}
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  try { maskCtx.restore(); } catch(_) {}
  }
  
  console.log('🎨 COLOREANDO SOBRE IMAGEN EXISTENTE - PRESERVANDO FONDO...');
  
  // Generar elementos para coloreado encima
  kickstartMask();
  makeSeeds(35); // Semillas suficientes para cobertura sin exceso
  makeStrokes(); 
  makeSpirals();
  makeRadiants();
  makeDroplets();
  makeColorDrops(); // Gotas de coloreo
  makeConnectors();
  makeSweeps(); 
  makeWaves();
  makeWash(); 
  makeFinalSealing();
  
  // CRÍTICO: render inmediato para aplicar el nuevo color sobre el fondo preservado
  // Fuerza la rama directa para evitar pixelación en el primer frame de la nueva capa
  const prevFirst = isFirstAnimation;
  const prevPreserve = preserveCanvasContent;
  isFirstAnimation = true;
  preserveCanvasContent = false;
  render();
  isFirstAnimation = prevFirst;
  preserveCanvasContent = prevPreserve;
  
  startedAt = 0; 
  if (!rafId) rafId = requestAnimationFrame(loop);
  
  // Monitor FPS
  if (!fpsMonitorRafId) fpsMonitorRafId=requestAnimationFrame(fpsMonitorLoop); 
}

function startNewAnimation(){ 
  cancelAnimationFrame(rafId); 
  
  // NO cambiar al siguiente patrón automáticamente - ya se cambió en loadNewPatternAndAnimate
  
  // Recalcular layout para el nuevo patrón
  const currentBG = getCurrentPattern();
  if (currentBG && currentBG.naturalWidth && currentBG.naturalHeight){
    const currentPatternData = patterns[currentPatternIndex];
    const isWallpaper = !!(currentPatternData && (
      (currentPatternData.type && currentPatternData.type === 'wallpaper') ||
      (currentPatternData.filename && /wallpaper\.jpg$/i.test(currentPatternData.filename))
    ));
    const isWideColor = !!(currentPatternData && (
      (currentPatternData.type && ['amarillo','azul','rojo'].includes(String(currentPatternData.type).toLowerCase())) ||
      (currentPatternData.filename && /(amarillo|azul|rojo)\.jpg$/i.test(currentPatternData.filename))
    ));
    if (isWallpaper) {
      // Calcular la sección del wallpaper que corresponde a este brush
      const sectionWidth = WALLPAPER_SECTION_WIDTH;
      const sectionHeight = WALLPAPER_SECTION_HEIGHT;
      // Usar la configuración de offset del servidor
      const sourceX = brushConfig.offsetX;
      const sourceY = brushConfig.offsetY;
      // Calcular escala para ajustar la sección al canvas
      const s = Math.min(size.w/sectionWidth, size.h/sectionHeight);
      const dw = Math.ceil(sectionWidth*s), dh = Math.ceil(sectionHeight*s);
      layout.dx = Math.floor((size.w-dw)/2); 
      layout.dy = Math.floor((size.h-dh)/2); 
      layout.dw = dw; 
      layout.dh = dh;
      // Guardar información de la sección para usar en drawImage
      layout.sourceX = sourceX;
      layout.sourceY = sourceY;
      layout.sourceWidth = sectionWidth;
      layout.sourceHeight = sectionHeight;
    } else if (isWideColor) {
  // Amarillo/Azul/Rojo: mapeo virtual 6480x3840 como wallpaper
  const imgW = currentBG.naturalWidth;
  const imgH = currentBG.naturalHeight;
  const scaleToVirtual = WALLPAPER_SECTION_HEIGHT / imgH;
  const placedW = imgW * scaleToVirtual;
  const virtualWidth = WALLPAPER_TOTAL_WIDTH; // 6480
  const placeX = Math.floor((virtualWidth - placedW) / 2);
  const placeY = 0;
  const sectionWidth = WALLPAPER_SECTION_WIDTH;
  const sectionHeight = WALLPAPER_SECTION_HEIGHT;
  const sourceXVirtual = brushConfig.offsetX || 0;
  const sourceYVirtual = brushConfig.offsetY || 0;
  let sx = (sourceXVirtual - placeX) / scaleToVirtual;
  let sy = (sourceYVirtual - placeY) / scaleToVirtual;
  let sw = sectionWidth / scaleToVirtual;
  let sh = sectionHeight / scaleToVirtual;
  if (!Number.isFinite(sx)) sx = 0; if (!Number.isFinite(sy)) sy = 0;
  if (!Number.isFinite(sw) || sw <= 0) sw = imgW; if (!Number.isFinite(sh) || sh <= 0) sh = imgH;
  sx = Math.max(0, Math.min(imgW - 1, sx));
  sy = Math.max(0, Math.min(imgH - 1, sy));
  if (sx + sw > imgW) sw = imgW - sx;
  if (sy + sh > imgH) sh = imgH - sy;
  const s = Math.min(size.w/sectionWidth, size.h/sectionHeight);
  const dw = Math.ceil(sectionWidth*s), dh = Math.ceil(sectionHeight*s);
  layout.dx = Math.floor((size.w-dw)/2); 
  layout.dy = Math.floor((size.h-dh)/2); 
  layout.dw = dw; 
  layout.dh = dh;
  layout.sourceX = Math.round(sx);
  layout.sourceY = Math.round(sy);
  layout.sourceWidth = Math.max(1, Math.round(sw));
  layout.sourceHeight = Math.max(1, Math.round(sh));
    } else {
      // Para imágenes de color: usar imagen completa, sin recorte
      const imgW = currentBG.naturalWidth;
      const imgH = currentBG.naturalHeight;
      const s = Math.min(size.w/imgW, size.h/imgH);
      const dw = Math.ceil(imgW*s), dh = Math.ceil(imgH*s);
      layout.dx = Math.floor((size.w-dw)/2);
      layout.dy = Math.floor((size.h-dh)/2);
      layout.dw = dw;
      layout.dh = dh;
      layout.sourceX = null;
      layout.sourceY = null;
      layout.sourceWidth = null;
      layout.sourceHeight = null;
    }
  }
  
  // Resetear estado de animación
  animationFinished = false;
  
  // NO hacer resize() ni limpiar el canvas principal - solo limpiar la máscara
  try { maskCtx.save(); maskCtx.setTransform(1,0,0,1,0,0); } catch(_) {}
  maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  try { maskCtx.restore(); } catch(_) {}
  
  // golpe inicial en el centro para que empiece a mostrarse de inmediato
  kickstartMask();
  makeSeeds(12); // Aumentamos las semillas para una mejor distribución final
  makeStrokes(); 
  makeSpirals();
  makeRadiants();
  makeDroplets();
  makeConnectors();
  makeSweeps(); 
  makeWaves();
  makeWash(); 
  makeFinalSealing();
  
  // render inmediato para que se vea el golpe inicial antes del primer frame
  render();
  startedAt=0; 
  rafId=requestAnimationFrame(loop);
}

window.addEventListener('resize',()=>{ 
  // Si la animación ya terminó, solo redimensionar y renderizar una vez
  if (animationFinished) {
    resize();
    render();
    return;
  }
  
  const now=performance.now(); 
  const p=startedAt?clamp((now-startedAt)/DURATION_MS,0,1):0; 
  resize(); 
  try { maskCtx.save(); maskCtx.setTransform(1,0,0,1,0,0); } catch(_) {}
  maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  try { maskCtx.restore(); } catch(_) {}
  makeSeeds(12); 
  makeStrokes(); 
  makeSpirals();
  makeRadiants();
  makeDroplets();
  makeConnectors();
  makeSweeps(); 
  makeWaves();
  makeWash(); 
  makeFinalSealing();
  drawProgress(p); 
  render(); 
});
// Sin controles en pantalla: se inicia automáticamente.

function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
function toWhiteMask(image){ const c=document.createElement('canvas'); c.width=image.naturalWidth; c.height=image.naturalHeight; const g=c.getContext('2d'); g.drawImage(image,0,0); const d=g.getImageData(0,0,c.width,c.height); const a=d.data; for(let i=0;i<a.length;i+=4){ if(a[i+3]>0){a[i]=255;a[i+1]=255;a[i+2]=255;} } g.putImageData(d,0,0); return c; }

// Función para actualizar el patrón fallback cuando cambia la imagen seleccionada
async function updateFallbackPattern() {
  // Si no hay patrones generados y estamos usando el fallback, actualizarlo
  if (patterns.length > 0 && patterns[patterns.length - 1].src.includes('.png')) {
    try {
      const newFallbackSrc = `${selectedImage}.png`;
      const img = await loadImage(newFallbackSrc);
      
      // Actualizar el último patrón (que debería ser el fallback)
      patterns[patterns.length - 1] = {
        src: newFallbackSrc,
        image: img
      };
      
      console.log(`✅ Patrón fallback actualizado a: ${newFallbackSrc}`);
      
      // Si estamos usando el patrón fallback, usarlo inmediatamente
      if (currentPatternIndex === patterns.length - 1) {
        console.log('🔄 Coloreando encima con nueva imagen fallback...');
        colorOnTop(); // COLOREAR ENCIMA sin resetear
      }
    } catch (error) {
      console.warn(`❌ Error actualizando patrón fallback a ${selectedImage}.png:`, error);
    }
  }
}

(async function init(){
  // Inicializar monitor de FPS
  fpsMonitor.init();
  
  // Inicializar pool de canvas temporales
  canvasPool.init();
  
  // Configurar WebSocket
  setupWebSocket();
  
  try {
    // PASO 1: Cargar patrones disponibles, priorizando lo que defina el server (wallpaper si existe)
    console.log('🔍 Cargando patrones iniciales (prioridad wallpaper del servidor)...');
    try {
      const loaded = await loadLatestPatterns();
      if (!loaded) {
        // Fallback único a amarillo si no hay nada disponible
        console.log('⚠️ No hay patrones disponibles; cargando amarillo como fallback único');
        await loadDefaultPattern();
      }
    } catch (error) {
      console.warn('⚠️ Error cargando patrones iniciales; usando fallback amarillo:', error);
      await loadDefaultPattern();
    }
    
  // Asegurar que los patrones estén listos antes de mostrar
  patternsReady = true;
  console.log(`🎨 Sistema inicializado con ${patterns.length} patrón(es)`);
  console.log(`🖼️ Patrón actual: ${patterns[currentPatternIndex]?.filename || 'ninguno'}`);
    
    // PASO 3: Cargar brochas en paralelo
    await Promise.all(brushSrcs.map(async (src)=>{
      try{
        const im = await loadImage(src);
        const m = toWhiteMask(im);
        maskBrushes.push(m);
        console.log(`🖌️ Brocha cargada: ${src}`);
      }catch(err){ 
        console.warn(`❌ Error cargando brocha ${src}:`, err);
      }
    }));
    
    console.log(`✅ ${maskBrushes.length} brochas cargadas.`);
    
  // PASO 4: Inicializar canvas y mostrar el patrón actual (normalmente el que decida el server)
    resize(); // Asegurar que el canvas tenga el tamaño correcto
    
  // Mostrar el patrón actual como fondo inicial SOLO si hay patrones listos
  if (patternsReady && patterns.length > 0) {
    console.log(`🎨 Mostrando patrón inicial establecido: ${patterns[currentPatternIndex]?.filename || 'desconocido'}`);
    renderStaticBackground();
  } else {
    console.log('⏳ Patrones no listos aún; se diferirá el render inicial');
  }
    
  // PASO 5: Iniciar animación automáticamente para coloreo inmediato
  console.log('🎨 Iniciando animación automática de coloreo...');
  start();
  
  // También esperar órdenes del servidor para sincronización adicional
    
    // PASO 6: Inicializar sistema de slideshow
    initializeSlideshow();
    
    console.log('✅ Sistema completamente inicializado y listo para colorear');
    
  } catch(e) {
    console.error('❌ Error en inicialización:', e);
    // Intentar cargar patrón por defecto como última opción
    await loadDefaultPattern();
  }
})();

// Forzar recarga de patrones más recientes cuando la página esté completamente cargada
// COMENTADO: Removido para evitar conflictos con el sistema de patrones
/*
window.addEventListener('load', async () => {
  console.log('🔄 Página completamente cargada - verificando patrones más recientes...');
  try {
    await loadLatestPatterns();
    console.log(`✅ Patrones actualizados. Usando: ${patterns[currentPatternIndex]?.src || 'ninguno'}`);
  } catch (error) {
    console.error('❌ Error al recargar patrones:', error);
  }
  
  // Inicializar slideshow si este brush lo necesita
  initializeSlideshow();
});
*/

// Pausar animación/monitor cuando la pestaña no está visible para evitar trabajo en background
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pausa segura: cancelar RAFs e intervalos (pero NO la secuencia automática)
    cancelAnimationFrame(rafId);
    cancelAnimationFrame(fpsMonitorRafId);
    rafId = 0;
    fpsMonitorRafId = 0;
    stopSlideshow();
    // Pausar video si está en reproducción
    if (inVideoPlayback && slideshowVideoEl && !slideshowVideoEl.paused) {
      try { slideshowVideoEl.pause(); } catch (_) {}
    }
    console.log('⏸️ Pestaña oculta: pausado RAF/monitor y slideshow');
  } else {
    // Reanudar solo el monitor FPS; la animación se reanuda con eventos
    if (!animationFinished && rafId === 0) {
      rafId = requestAnimationFrame(loop);
    }
    if (fpsMonitorRafId === 0) {
      fpsMonitorRafId = requestAnimationFrame(fpsMonitorLoop);
    }
    // Si el slideshow está habilitado, reiniciarlo o continuar video
    if (slideshowConfig.enabled) {
      if (inVideoPlayback && slideshowVideoEl) {
        // Reanudar video
        slideshowVideoEl.play().catch(() => {});
      } else {
        startSlideshow();
      }
    }
    console.log('▶️ Pestaña visible: reanudado monitor y slideshow');
    
  // No reactivar secuencias locales automáticamente; seguir órdenes del servidor
  }
});

// ==============================
// SLIDESHOW FUNCTIONALITY
// ==============================

async function initializeSlideshow() {
  // Solo inicializar slideshow para brush 3 y 7
  if (![3, 7].includes(brushId)) {
    return;
  }
  
  // console.log(`📺 Inicializando slideshow para brush ${brushId}`);
  
  // Configurar valores específicos por brush
  if (brushId === 3) {
    slideshowConfig.folder = '3';
    // Los valores ya están configurados arriba para brush-3
  } else if (brushId === 7) {
    slideshowConfig.folder = '4';
    // Mantener los valores por defecto para brush-7 (anteriores valores grandes)
    slideshowConfig.width = 1670;
    slideshowConfig.height = 1912;
    slideshowConfig.x = 256;
    slideshowConfig.y = 300;
  slideshowConfig.interval = 6000;
  }
  
  // Obtener configuración inicial del servidor
  try {
    const response = await fetch('/api/state');
    const state = await response.json();
    
    if (state.slideshow && state.slideshow[brushId]) {
      slideshowConfig = { ...slideshowConfig, ...state.slideshow[brushId] };
      // console.log(`📺 Configuración de slideshow cargada:`, slideshowConfig);
    }
  } catch (error) {
    console.warn('Error cargando configuración de slideshow:', error);
  }
  
  // Cargar imágenes del slideshow
  await loadSlideshowImages();
  
  // Crear contenedor del slideshow
  createSlideshowContainer();
  
  // Actualizar display
  updateSlideshowDisplay();
}

async function loadSlideshowImages() {
  try {
    const response = await fetch(`/api/slideshow/${slideshowConfig.folder}`);
    const data = await response.json();
    
    if (data.success && data.images.length > 0) {
  // Tomar solo las primeras 3 imágenes para asegurar ciclo estable
  slideshowImages = data.images.slice(0, 3);
  currentSlideshowIndex = 0; // reset index to avoid OOB
      
      // PRECARGAR IMÁGENES PARA MEJOR PERFORMANCE
      preloadSlideshowImages();
      
      console.log(`📸 ${slideshowImages.length} imágenes cargadas para slideshow:`, slideshowImages);
    } else {
      console.warn('No se encontraron imágenes para el slideshow');
      slideshowImages = [];
    }
  } catch (error) {
    console.error('Error cargando imágenes del slideshow:', error);
    slideshowImages = [];
  }
}

// NUEVA FUNCIÓN: Precargar imágenes para evitar lag durante el slideshow - SUPER OPTIMIZADA
function preloadSlideshowImages() {
  if (slideshowImages.length === 0) return;
  
  console.log('📥 Iniciando precarga optimizada de imágenes del slideshow...');
  
  // Precargar las primeras 3 imágenes inmediatamente para inicio rápido
  const immediatePreload = Math.min(3, slideshowImages.length);
  
  for (let i = 0; i < immediatePreload; i++) {
    const img = new Image();
    img.src = slideshowImages[i];
    
    // Optimizaciones de carga
    img.loading = 'eager';
    img.decoding = 'async';
    
    if (i === 0) {
      console.log(`📥 Precarga inmediata de ${immediatePreload} imágenes iniciada`);
    }
  }
  
  // Precargar el resto de imágenes de forma asíncrona para no bloquear
  if (slideshowImages.length > immediatePreload) {
    setTimeout(() => {
      for (let i = immediatePreload; i < slideshowImages.length; i++) {
        const img = new Image();
        img.src = slideshowImages[i];
        img.loading = 'lazy';
        img.decoding = 'async';
      }
      console.log(`📥 Precarga completa: ${slideshowImages.length} imágenes cargadas`);
    }, 1000); // Retrasar 1 segundo para no interferir con el inicio
  }
}

function createSlideshowContainer() {
  // Eliminar contenedor existente si ya existe
  if (slideshowContainer) {
    slideshowContainer.remove();
  }
  
  // Crear nuevo contenedor - SIMPLE Y DIRECTO
  slideshowContainer = document.createElement('div');
  slideshowContainer.id = 'slideshow-container';
  slideshowContainer.style.position = 'absolute';
  slideshowContainer.style.zIndex = slideshowConfig.zIndex;
  slideshowContainer.style.pointerEvents = 'none';
  slideshowContainer.style.overflow = 'hidden';
  slideshowContainer.style.willChange = 'transform';
  slideshowContainer.style.backfaceVisibility = 'hidden';
  
  // Wrapper del slideshow
  const imageWrapper = document.createElement('div');
  imageWrapper.id = 'slideshow-image-wrapper';
  imageWrapper.style.position = 'relative';
  imageWrapper.style.width = '100%';
  imageWrapper.style.height = '100%';
  imageWrapper.style.overflow = 'hidden';
  
  // Capa para imágenes (separada para no borrar el <video>)
  const imagesLayer = document.createElement('div');
  imagesLayer.id = 'slideshow-images-layer';
  imagesLayer.style.position = 'absolute';
  imagesLayer.style.top = '0';
  imagesLayer.style.left = '0';
  imagesLayer.style.width = '100%';
  imagesLayer.style.height = '100%';
  imagesLayer.style.overflow = 'hidden';
  imagesLayer.style.zIndex = '1';
  imageWrapper.appendChild(imagesLayer);
  
  slideshowContainer.appendChild(imageWrapper);

  // Crear (o asegurarse) del elemento de video para reproducción puntual
  // Se insertará dentro del wrapper para que las sombras queden arriba
  slideshowVideoEl = document.createElement('video');
  slideshowVideoEl.id = 'slideshow-video';
  slideshowVideoEl.style.position = 'absolute';
  slideshowVideoEl.style.top = '0';
  slideshowVideoEl.style.left = '0';
  slideshowVideoEl.style.width = '100%';
  slideshowVideoEl.style.height = '100%';
  slideshowVideoEl.style.objectFit = 'cover';
  slideshowVideoEl.style.display = 'none';
  slideshowVideoEl.style.zIndex = '5';
  slideshowVideoEl.style.pointerEvents = 'none';
  slideshowVideoEl.muted = true; // asegurar autoplay
  slideshowVideoEl.playsInline = true;
  slideshowVideoEl.preload = 'auto';
  imageWrapper.appendChild(slideshowVideoEl);
  
  // Crear elementos de sombra (izquierda y arriba) - OPTIMIZADOS
  const shadowLeft = document.createElement('div');
  shadowLeft.id = 'slideshow-shadow-left';
  shadowLeft.style.position = 'absolute';
  shadowLeft.style.top = '0';
  shadowLeft.style.left = '0';
  shadowLeft.style.width = `${slideshowConfig.shadowWidth || 20}px`;
  shadowLeft.style.height = '100%';
  const shadowAlpha = (typeof slideshowConfig.shadowOpacity === 'number') ? slideshowConfig.shadowOpacity : 0.3;
  shadowLeft.style.background = `linear-gradient(to right, rgba(0,0,0,${shadowAlpha}), transparent)`;
  shadowLeft.style.pointerEvents = 'none';
  shadowLeft.style.zIndex = '10';
  shadowLeft.style.willChange = 'width';
  
  const shadowTop = document.createElement('div');
  shadowTop.id = 'slideshow-shadow-top';
  shadowTop.style.position = 'absolute';
  shadowTop.style.top = '0';
  shadowTop.style.left = '0';
  shadowTop.style.width = '100%';
  shadowTop.style.height = `${slideshowConfig.shadowWidth || 20}px`;
  shadowTop.style.background = `linear-gradient(to bottom, rgba(0,0,0,${shadowAlpha}), transparent)`;
  shadowTop.style.pointerEvents = 'none';
  shadowTop.style.zIndex = '10';
  shadowTop.style.willChange = 'height';

  slideshowContainer.appendChild(shadowLeft);
  slideshowContainer.appendChild(shadowTop);
  document.body.appendChild(slideshowContainer);
  
  // console.log('📺 Contenedor de slideshow creado con crossfade optimizado y sombras');
}

function updateSlideshowDisplay() {
  if (!slideshowContainer) {
    return;
  }
  
  // Actualizar posición y tamaño
  slideshowContainer.style.left = `${slideshowConfig.x}px`;
  slideshowContainer.style.top = `${slideshowConfig.y}px`;
  slideshowContainer.style.width = `${slideshowConfig.width}px`;
  slideshowContainer.style.height = `${slideshowConfig.height}px`;
  slideshowContainer.style.zIndex = slideshowConfig.zIndex;
  
  // Actualizar sombras con optimización
  const shadowLeft = document.getElementById('slideshow-shadow-left');
  const shadowTop = document.getElementById('slideshow-shadow-top');
  if (shadowLeft && shadowTop) {
    const shadowWidth = slideshowConfig.shadowWidth || 20;
  const shadowAlpha = (typeof slideshowConfig.shadowOpacity === 'number') ? slideshowConfig.shadowOpacity : 0.3;
    
    // Usar transform en lugar de cambiar width/height para mejor performance
    shadowLeft.style.transform = `scaleX(${shadowWidth / 20})`;
    shadowTop.style.transform = `scaleY(${shadowWidth / 20})`;
  // Actualizar el fondo del gradiente si cambia la opacidad
  shadowLeft.style.background = `linear-gradient(to right, rgba(0,0,0,${shadowAlpha}), transparent)`;
  shadowTop.style.background = `linear-gradient(to bottom, rgba(0,0,0,${shadowAlpha}), transparent)`;
  }
  
  // Mostrar/ocultar según configuración
  if (slideshowConfig.enabled && slideshowImages.length > 0) {
    slideshowContainer.style.display = 'block';
    // Si estamos en reproducción de video, no tocar el slideshow aquí
    if (!inVideoPlayback) {
      startSlideshow();
    }
  } else {
    slideshowContainer.style.display = 'none';
    stopSlideshow();
  }
  
  // console.log(`📺 Slideshow actualizado con crossfade - enabled: ${slideshowConfig.enabled}, posición: (${slideshowConfig.x}, ${slideshowConfig.y}), tamaño: ${slideshowConfig.width}x${slideshowConfig.height}, sombra: ${slideshowConfig.shadowWidth || 20}px`);
}

function startSlideshow() {
  // Detener slideshow actual si existe
  stopSlideshow();
  
  if (slideshowImages.length === 0) {
    return;
  }
  
  // Limpiar capa de imágenes y mostrar primera imagen
  const imagesLayer = document.getElementById('slideshow-images-layer');
  if (imagesLayer) {
    imagesLayer.innerHTML = '';
    // Crear y mostrar primera imagen
    const firstImg = createSlideshowImage(slideshowImages[currentSlideshowIndex], 1);
    imagesLayer.appendChild(firstImg);
  }

  // Asegurar que el video esté oculto al iniciar slideshow
  if (slideshowVideoEl) {
    slideshowVideoEl.style.display = 'none';
    try { slideshowVideoEl.pause(); } catch (_) {}
    try { slideshowVideoEl.src = ''; } catch (_) {}
  }
  
  // Reiniciar contador de vueltas si no venimos de video
  if (!inVideoPlayback) {
    slideshowCycleCount = 0;
  }
  inVideoPlayback = false;

  // Programar cambios con timeout robusto (evita desincronización del setInterval)
  if (slideshowImages.length > 1) {
    scheduleNextSlide();
  }
  
  // Programación por timeout para evitar bloqueos si la transición se retrasa
  // console.log(`📺 Slideshow iniciado con fade simple - ${slideshowImages.length} imágenes, intervalo: ${slideshowConfig.interval}ms`);
}

// Crea un elemento <img> para el slideshow con estilos y opacidad inicial
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
  img.style.willChange = 'opacity';
  // Hints for better load
  try { img.decoding = 'async'; } catch (_) {}
  try { img.loading = 'eager'; } catch (_) {}
  return img;
}

// Añade la siguiente imagen del slideshow con crossfade y limpia las anteriores
function addNextSlideshowImage(onDone) {
  const imagesLayer = document.getElementById('slideshow-images-layer');
  if (!imagesLayer || !slideshowImages || slideshowImages.length === 0) {
    if (typeof onDone === 'function') onDone();
    return;
  }
  if (_slideshowTransitioning) {
    // Evitar solapado; reintentar luego
    setTimeout(() => addNextSlideshowImage(onDone), 100);
    return;
  }
  _slideshowTransitioning = true;

  const nextSrc = slideshowImages[currentSlideshowIndex];
  const prevImgs = Array.from(imagesLayer.querySelectorAll('img'));
  const prevTop = prevImgs.length ? prevImgs[prevImgs.length - 1] : null;

  // Crear nueva imagen con opacidad 0 y añadirla encima
  const nextImg = createSlideshowImage(nextSrc, 0);
  imagesLayer.appendChild(nextImg);

  // Cuando esté lista, iniciar el fade
  const startFade = () => {
    // Asegurar reflow antes de cambiar opacidad
    void nextImg.offsetHeight;
    // Fade-in de la nueva
    nextImg.style.opacity = '1';
    // Fade-out de la anterior
    if (prevTop) prevTop.style.opacity = '0';

    const cleanup = () => {
      // Mantener solo las dos últimas imágenes para evitar fugas de memoria
      const imgs = Array.from(imagesLayer.querySelectorAll('img'));
      // Dejar como máximo 2 (prevTop + nextImg). Quitar las más antiguas
      while (imgs.length > 2) {
        const toRemove = imgs.shift();
        if (toRemove && toRemove !== prevTop && toRemove !== nextImg) toRemove.remove();
      }
      // Si hay más de 2 por cualquier motivo, asegurar limpieza extra
      const latest = Array.from(imagesLayer.querySelectorAll('img'));
      if (latest.length > 2) {
        for (let i = 0; i < latest.length - 2; i++) latest[i].remove();
      }
      _slideshowTransitioning = false;
      if (typeof onDone === 'function') onDone();
    };

    // Usar transitionend con timeout de respaldo
    let finished = false;
    const onEnd = () => {
      if (finished) return;
      finished = true;
      nextImg.removeEventListener('transitionend', onEnd);
      if (prevTop) prevTop.removeEventListener('transitionend', onEnd);
      cleanup();
    };
    nextImg.addEventListener('transitionend', onEnd);
    if (prevTop) prevTop.addEventListener('transitionend', onEnd);
    setTimeoua11zt(onEnd, SLIDESHOW_FADE_MS + 80);
  };

  // Intentar decode() para evitar parpadeos; fallback por tiempo
  let decoded = false;
  try {
    if (nextImg.decode) {
      nextImg.decode().then(() => { decoded = true; startFade(); }).catch(() => { startFade(); });
      // Fallback si decode tarda demasiado
      setTimeout(() => { if (!decoded) startFade(); }, 1200);
    } else {
      // Fallback usando onload
      nextImg.addEventListener('load', () => startFade());
      // Fallback por tiempo en caso de cache instantánea sin disparar load
      setTimeout(() => startFade(), 500);
    }
  } catch (_) {
    // En navegadores sin decode, iniciar de inmediato con pequeñísimo retraso
    setTimeout(() => startFade(), 30);
  }
}

// Programación por timeout para evitar bloqueos si la transición se retrasa
function scheduleNextSlide() {
  if (_slideshowTimeoutId) clearTimeout(_slideshowTimeoutId);
  const delay = Math.max(500, Number(slideshowConfig.interval) || 3000);
  _slideshowTimeoutId = setTimeout(() => {
    if (!slideshowImages || slideshowImages.length <= 1) return;
    if (_slideshowTransitioning) {
      // Si seguimos en transición, reintentar un poco después
      return scheduleNextSlide();
    }
    const prevIndex = currentSlideshowIndex;
    currentSlideshowIndex = (currentSlideshowIndex + 1) % slideshowImages.length;

    if (currentSlideshowIndex === 0 && slideshowImages.length > 0 && !inVideoPlayback) {
      slideshowCycleCount++;
    }
    addNextSlideshowImage(() => {
      // Reprogramar cuando termina el fade
      scheduleNextSlide();
    });
  }, delay);
}

function stopSlideshow() {
  if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
  if (_slideshowTimeoutId) { clearTimeout(_slideshowTimeoutId); _slideshowTimeoutId = null; }
  _slideshowTransitioning = false; // Reset transitioning flag
}

function showSlideshowImage(index) {
  // Esta función se usa para cambios manuales inmediatos
  const imagesLayer = document.getElementById('slideshow-images-layer');
  
  if (imagesLayer && slideshowImages[index]) {
    // Limpiar capa y mostrar imagen seleccionada inmediatamente
    imagesLayer.innerHTML = '';
    const img = createSlideshowImage(slideshowImages[index], 1);
    imagesLayer.appendChild(img);
    
    // console.log(`📺 Imagen cambiada directamente a ${index + 1}/${slideshowImages.length}: ${slideshowImages[index]}`);
  }
}

// ==============================
// VIDEO: Reproducir elixir.webm tras 10 vueltas
// ==============================

function triggerVideoPlayback() {
  if (!ENABLE_SLIDESHOW_VIDEO) {
    // Feature deshabilitada: no interrumpir slideshow
    return;
  }
  // Proteger de reentradas
  if (inVideoPlayback) return;
  inVideoPlayback = true;

  // Detener el slideshow mientras se reproduce el video
  stopSlideshow();

  // Asegurar que el elemento de video exista
  if (!slideshowVideoEl) {
    const wrapper = document.getElementById('slideshow-image-wrapper');
    if (!wrapper) return;
    slideshowVideoEl = document.createElement('video');
    slideshowVideoEl.id = 'slideshow-video';
    slideshowVideoEl.style.position = 'absolute';
    slideshowVideoEl.style.top = '0';
    slideshowVideoEl.style.left = '0';
    slideshowVideoEl.style.width = '100%';
    slideshowVideoEl.style.height = '100%';
    slideshowVideoEl.style.objectFit = 'cover';
    slideshowVideoEl.style.display = 'none';
    slideshowVideoEl.style.zIndex = '5';
    slideshowVideoEl.style.pointerEvents = 'none';
    slideshowVideoEl.muted = true;
    slideshowVideoEl.playsInline = true;
    slideshowVideoEl.preload = 'auto';
    wrapper.appendChild(slideshowVideoEl);
  }

  // Configurar fuente y mostrar
  try {
    slideshowVideoEl.src = '/elixir.webm';
    slideshowVideoEl.currentTime = 0;
  } catch (_) {}
  slideshowVideoEl.style.display = 'block';

  // Reproducir y al terminar, reanudar slideshow por 10 vueltas más
  const onEnded = () => {
    slideshowVideoEl.removeEventListener('ended', onEnded);
    // Ocultar video y limpiar src para liberar
    slideshowVideoEl.style.display = 'none';
    try { slideshowVideoEl.pause(); } catch (_) {}
    try { slideshowVideoEl.src = ''; } catch (_) {}

    // Reset contador de vueltas y estado video
    slideshowCycleCount = 0;
    inVideoPlayback = false;

    // Reanudar slideshow si sigue habilitado
    if (slideshowConfig.enabled && slideshowImages.length > 0) {
      startSlideshow();
    }
  };
  slideshowVideoEl.addEventListener('ended', onEnded);

  // Intentar reproducir
  const playPromise = slideshowVideoEl.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.catch(() => {
      // Si falla autoplay, intentar iniciar mostrando primer frame (muted/inline debe permitir)
      setTimeout(() => slideshowVideoEl.play().catch(() => {}), 200);
    });
  }
}

// ==============================
// VIDEO: Loop mientras el patrón sea logo1 o logo2
// ==============================

function ensureVideoElement() {
  if (slideshowVideoEl) return slideshowVideoEl;
  const wrapper = document.getElementById('slideshow-image-wrapper');
  if (!wrapper) return null;
  slideshowVideoEl = document.createElement('video');
  slideshowVideoEl.id = 'slideshow-video';
  slideshowVideoEl.style.position = 'absolute';
  slideshowVideoEl.style.top = '0';
  slideshowVideoEl.style.left = '0';
  slideshowVideoEl.style.width = '100%';
  slideshowVideoEl.style.height = '100%';
  slideshowVideoEl.style.objectFit = 'cover';
  slideshowVideoEl.style.display = 'none';
  slideshowVideoEl.style.zIndex = '5';
  slideshowVideoEl.style.pointerEvents = 'none';
  slideshowVideoEl.muted = true;
  slideshowVideoEl.playsInline = true;
  slideshowVideoEl.preload = 'auto';
  wrapper.appendChild(slideshowVideoEl);
  return slideshowVideoEl;
}

function startLogoVideoLoop() {
  if (!ENABLE_LOGO_VIDEO) {
    // No reproducir video especial para logos; mantener slideshow normal
    return;
  }
  // Si ya está forzado por logo, nada que hacer
  if (videoForcedByLogo) return;
  const video = ensureVideoElement();
  if (!video) return;
  // Ocultar imágenes mientras video
  const imagesLayer = document.getElementById('slideshow-images-layer');
  if (imagesLayer) imagesLayer.style.display = 'none';
  // Mostrar y reproducir en loop
  video.loop = true;
  video.src = '/elixir.webm';
  video.currentTime = 0;
  video.style.display = 'block';
  video.play().catch(() => {});
  // Detener slideshow rotatorio mientras el video esté en loop
  stopSlideshow();
  inVideoPlayback = true;
  videoForcedByLogo = true;
}

function stopLogoVideoLoopIfActive() {
  if (!videoForcedByLogo) return;
  const video = slideshowVideoEl;
  if (video) {
    try { video.pause(); } catch (_) {}
    try { video.removeAttribute('loop'); } catch (_) {}
    try { video.src = ''; } catch (_) {}
    video.style.display = 'none';
  }
  // Re-mostrar imágenes y reanudar slideshow si corresponde
  const imagesLayer = document.getElementById('slideshow-images-layer');
  if (imagesLayer) imagesLayer.style.display = '';
  inVideoPlayback = false;
  videoForcedByLogo = false;
  if (slideshowConfig.enabled && slideshowImages.length > 0) {
    startSlideshow();
  }
}

// Aplicar un paso de color con un patrón específico enviado por el servidor (sin alterar el orden local)
async function executeColorStepWithPattern(forcedPattern) {
  // Bloquear coloreos pixelados de amarillo/azul según pedido
  if (/amarillo\.jpg|azul\.jpg/i.test(forcedPattern || '')) {
    console.warn(`⛔ Brush ${brushId}: Coloreo bloqueado para ${forcedPattern} por pixelación (saltando)`);
    return;
  }
  if (!forcedPattern) return executeColorStep();
  if (autoColorSequence.isRunning) return; // evitar solapado
  autoColorSequence.isRunning = true;
  console.log(`🎨 *** COLOREANDO (forzado) *** Aplicando: ${forcedPattern}`);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `/patterns/${forcedPattern}?t=${Date.now()}`;
    });
    if (/logo1\.jpg|logo2\.jpg/i.test(forcedPattern)) {
      console.log('🆕 LOGO MODE (forzado):', forcedPattern, 'fade-in directo sin coloreo');
      await showLogoFullFade(img, forcedPattern);
      finalizeLogoStep();
    } else {
      const newPattern = {
        src: `/patterns/${forcedPattern}`,
        image: img,
        filename: forcedPattern,
        type: forcedPattern.replace('.jpg', '')
      };
      if (patterns.length > 5) patterns = patterns.slice(-5);
      patterns.push(newPattern);
      currentPatternIndex = patterns.length - 1;
      try { resize(); } catch (_) {}
      colorOnTop();
      playFullscreenLogoVideoIfNeeded(forcedPattern);
    }
  } catch (e) {
    console.error('❌ Error aplicando patrón forzado:', forcedPattern, e);
  } finally {
    autoColorSequence.isRunning = false;
  }
}

// Helper: mostrar logo usando mismo mapeo que amarillo/azul/rojo (virtual 6480x3840 seccion 2160x3840) con fade-in
async function showLogoFullFade(image, filename){
  // Cancelar animaciones activas
  try { if (rafId) cancelAnimationFrame(rafId); } catch(_) {}
  try { if (fpsMonitorRafId) cancelAnimationFrame(fpsMonitorRafId); } catch(_) {}
  animationFinished = false;
  preserveCanvasContent = true;
  isFirstAnimation = false;
  // Asegurar video fullscreen si corresponde (algunos casos de llamada directa no pasan por playFullscreenLogoVideoIfNeeded)
  try { playFullscreenLogoVideoIfNeeded(filename); } catch(_) {}
  // Replicar lógica de layout wide-color (amarillo) SIN modificar layout global
  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;
  const virtualHeight = WALLPAPER_SECTION_HEIGHT; //3840
  const virtualWidthTotal = WALLPAPER_TOTAL_WIDTH; //6480
  const scaleToVirtual = virtualHeight / imgH;
  const placedW = imgW * scaleToVirtual; // ancho dentro del espacio virtual
  const placeX = Math.floor((virtualWidthTotal - placedW)/2);
  const placeY = 0;
  const sectionWidth = WALLPAPER_SECTION_WIDTH; //2160
  const sectionHeight = WALLPAPER_SECTION_HEIGHT; //3840
  const sourceXVirtual = brushConfig.offsetX || 0;
  const sourceYVirtual = brushConfig.offsetY || 0;
  // Convertir a coords de la imagen
  let sx = (sourceXVirtual - placeX) / scaleToVirtual;
  let sy = (sourceYVirtual - placeY) / scaleToVirtual;
  let sw = sectionWidth / scaleToVirtual;
  let sh = sectionHeight / scaleToVirtual;
  if (!Number.isFinite(sx)) sx = 0; if (!Number.isFinite(sy)) sy = 0;
  if (!Number.isFinite(sw) || sw <= 0) sw = imgW; if (!Number.isFinite(sh) || sh <= 0) sh = imgH;
  sx = Math.max(0, Math.min(imgW - 1, sx));
  sy = Math.max(0, Math.min(imgH - 1, sy));
  if (sx + sw > imgW) sw = imgW - sx;
  if (sy + sh > imgH) sh = imgH - sy;
  const s = Math.min(size.w/sectionWidth, size.h/sectionHeight);
  const dw = Math.ceil(sectionWidth*s), dh = Math.ceil(sectionHeight*s);
  const dx = Math.floor((size.w-dw)/2);
  const dy = Math.floor((size.h-dh)/2);
  // Limpiar mask, no limpiar canvas para layering continuo
  try { maskCtx.save(); maskCtx.setTransform(1,0,0,1,0,0);} catch(_){ }
  maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
  try { maskCtx.restore(); } catch(_) {}
  // Dibujar fade sobre canvas principal (sin máscara)
  const fadeMs = 1200;
  const startTs = performance.now();
  function fadeFrame(ts){
    const p = Math.min(1, (ts - startTs)/fadeMs);
    // redibujar fondo existente (preservado) + logo encima con alpha p
    // Solo dibujar logo: preservación ya mantiene fondo
    ctx.save();
    ensureHQ(ctx);
    ctx.globalAlpha = p;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
    if (p < 1) requestAnimationFrame(fadeFrame); else {
      animationFinished = true;
      console.log('✅ LOGO fade-in completado para', filename);
    }
  }
  requestAnimationFrame(fadeFrame);
}

// Programar siguiente paso tras mostrar logo (reutiliza lógica de finalize animación)
function finalizeLogoStep(){
  // Liberar lock
  if (autoColorSequence) autoColorSequence.isRunning = false;
  animationFinished = true;
  // Programar siguiente como en finalize de coloreo (simplificado)
  if (autoColorSequence && autoColorSequence.active && !autoColorSequence.nextStepScheduled){
    autoColorSequence.nextStepScheduled = true;
    const period = autoColorSequence.periodMs || (autoColorSequence.intervalTime + DURATION_MS);
    const nowTs = Date.now();
    let base = autoColorSequence.lastBoundaryTs || autoColorSequence.anchorStartAt || nowTs;
    while (base <= nowTs) base += period;
    const delayMs = Math.max(0, base - nowTs);
    console.log(`⏱️ (LOGO) Próximo paso en ${delayMs}ms`);
    if (autoColorSequence.timeoutId) clearTimeout(autoColorSequence.timeoutId);
    autoColorSequence.timeoutId = setTimeout(()=>{
      if (autoColorSequence.active && coloringMode === 'sequence') {
        executeColorStep();
      }
      autoColorSequence.nextStepScheduled = false;
      autoColorSequence.timeoutId = null;
    }, delayMs);
  }
}