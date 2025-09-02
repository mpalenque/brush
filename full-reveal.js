// Ajustes generales - OPTIMIZADOS PARA VELOCIDAD CONTROLADA
const DURATION_MS = 30000; // 30s - el doble de tiempo para coloreado
const DPR = 1; // cap para rendimiento
const MASK_SCALE = 0.7; // máscara a menor resolución para velocidad
const MAX_UNITS_PER_FRAME = 600; // trabajo optimizado por frame
const FINAL_SEAL_START = 0.70; // iniciar antes para terminar en tiempo
const FINAL_SEAL_ALPHA_MIN = 0.12;
const FINAL_SEAL_ALPHA_MAX = 0.20;
const FINAL_SEAL_CHUNK_BASE = 6; // trabajo de sellado balanceado
const WASH_START = 0.65; // iniciar antes
const WASH_CHUNK_BASE = 10;
const MAX_STEPS_PER_ENTITY_FRAME = 5; // trabajo por entidad balanceado
const container = document.getElementById('container');
const canvas = document.querySelector('.js-canvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { alpha: true, desynchronized: true });
// Eventos de dibujo del frame actual (para depuración exacta)
let drawEvents = [];

// Imagen seleccionada actual
let selectedImage = 'red';

// Control de inicialización
let hasInitialAnimationStarted = false;

// Patrones para alternar secuencialmente
const patterns = [];
let currentPatternIndex = 0; // Índice del patrón actual

const brushSrcs = [
  'Stroke/blue-watercolor-brush-stroke-1.png',
  'Stroke/blue-watercolor-brush-stroke-2.png',
  'Stroke/blue-watercolor-brush-stroke-6.png',
  'Stroke/blue-watercolor-brush-stroke-7.png',
  'Stroke/blue-watercolor-brush-stroke-14.png'
];
let maskBrushes = [];

// Función para obtener el patrón actual
function getCurrentPattern() {
  if (patterns.length === 0) {
    console.error('⚠️ NO HAY PATRONES CARGADOS - SISTEMA INOPERATIVO');
    return null;
  }
  const currentPattern = patterns[currentPatternIndex];
  console.log(`🎯 CONFIRMADO - Usando patrón: ${currentPattern.src} (${currentPattern.filename || 'sin nombre'}) - índice: ${currentPatternIndex}/${patterns.length - 1}`);
  return currentPattern.image;
}

// ==============================
// PATTERN MANAGEMENT - ADAPTADO PARA FULL.PNG
// ==============================

async function checkIfFileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function loadFullPattern() {
  try {
    console.log('🔍 Cargando full.png...');
    
    // Verificar si existe full.png
    const fullExists = await checkIfFileExists('/full.png');
    
    if (fullExists) {
      console.log(`🎯 Cargando full.png`);
      
      // Limpiar patrones existentes
      patterns.length = 0;
      
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => {
          console.log(`✅ full.png cargado exitosamente`);
          resolve();
        };
        img.onerror = (err) => {
          console.error(`❌ Error cargando full.png`, err);
          reject(err);
        };
        img.src = `full.png?t=${Date.now()}`;
      });
      
      patterns.push({
        src: `full.png`,
        image: img,
        filename: 'full.png'
      });
      
      // Usar el patrón recién cargado
      currentPatternIndex = 0;
      console.log(`🎨 CONFIRMADO - Usando patrón: ${patterns[0].src}`);
      console.log(`📊 Total de patrones cargados: ${patterns.length}`);
      
      return true;
    } else {
      console.warn('❌ No se encontró full.png');
      return false;
    }
  } catch (error) {
    console.error('❌ Error cargando full.png:', error);
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
    
    socket.on('connect', () => {
      console.log('🔌 Conectado al servidor WebSocket');
      // Registrarse como full-reveal
      socket.emit('register', { type: 'full-reveal' });
    });
    
    socket.on('disconnect', () => {
      console.log('🔌 Desconectado del servidor WebSocket - intentando reconectar...');
    });
    
    socket.on('reconnect', () => {
      console.log('🔌 Reconectado al servidor WebSocket');
      socket.emit('register', { type: 'full-reveal' });
    });
    
    // Escuchar cuando hay un nuevo patrón listo (opcional para activar animación)
    socket.on('newPatternReady', (data) => {
      console.log(`🎨 Evento de patrón recibido (ignorado, usando full.png):`, data);
      // Recargar y animar con full.png
      loadNewPatternAndAnimate('full.png');
    });
    
    // Escuchar actualizaciones de imagen procesada (opcional)
    socket.on('imageUpdated', (data) => {
      console.log('🆕 Imagen procesada actualizada - coloreando encima con full.png:', data);
      loadNewPatternAndAnimate('full.png');
    });
    
    socket.on('error', (error) => {
      console.error('❌ Error de WebSocket:', error);
    });
    
  } catch (error) {
    console.error('❌ Error configurando WebSocket:', error);
  }
}

// Variable para almacenar el socket
let socket;

let latestPatternId = null;

// Cargar full.png y animar por encima
async function loadNewPatternAndAnimate(filename) {
  try {
    console.log('🔄 Recargando full.png...');
    
    // Cargar full.png directamente
    const fullExists = await checkIfFileExists('/full.png');
    
    if (fullExists) {
      console.log(`📥 Cargando nuevo full.png`);
      
      const newImg = new Image();
      await new Promise((resolve, reject) => {
        newImg.onload = resolve;
        newImg.onerror = reject;
        newImg.src = `full.png?t=${Date.now()}`;
      });
      
      // Reemplazar último patrón con full.png actualizado
      patterns.push({ src: `full.png`, image: newImg, filename: 'full.png' });
      currentPatternIndex = patterns.length - 1;
      
      console.log('✅ Nuevo full.png cargado. COLOREANDO ENCIMA del wallpaper existente...');
      
      // Colorear ENCIMA del wallpaper existente (sin limpiar canvas)
      colorOnTop();
    } else {
      console.warn('❌ full.png no encontrado');
    }
  } catch (error) {
    console.error('❌ Error cargando nuevo patrón:', error);
  }
}

// ==============================
// ANIMACIÓN Y RENDERING
// ==============================

let animating = false;
let animationId = null;
let startTime = null;
let isFirstAnimation = true; // Flag para saber si es la primera animación

// FPS Monitor
let frameCount = 0;
let fpsStart = Date.now();
let fpsArray = [];
let lastFrameTime = Date.now();

function updateFPS() {
  frameCount++;
  const now = Date.now();
  const delta = now - lastFrameTime;
  
  if (delta > 0) {
    const currentFPS = Math.round(1000 / delta);
    fpsArray.push(currentFPS);
    
    if (fpsArray.length > 60) fpsArray.shift(); // mantener últimos 60 frames
    
    const avgFPS = Math.round(fpsArray.reduce((a, b) => a + b, 0) / fpsArray.length);
    
    const fpsValue = document.getElementById('fpsValue');
    const fpsAvg = document.getElementById('fpsAvg');
    
    if (fpsValue) fpsValue.textContent = `${currentFPS} FPS`;
    if (fpsAvg) fpsAvg.textContent = `Avg: ${avgFPS}`;
  }
  
  lastFrameTime = now;
}

// Configurar canvas
function setupCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  
  maskCanvas.width = w * DPR * MASK_SCALE;
  maskCanvas.height = h * DPR * MASK_SCALE;
  
  ctx.scale(DPR, DPR);
  maskCtx.scale(DPR * MASK_SCALE, DPR * MASK_SCALE);
  
  console.log(`📐 Canvas configurado: ${w}×${h} (DPR: ${DPR})`);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toWhiteMask(colorImg) {
  const c = document.createElement('canvas');
  const ct = c.getContext('2d');
  c.width = colorImg.width;
  c.height = colorImg.height;
  ct.drawImage(colorImg, 0, 0);
  
  const imageData = ct.getImageData(0, 0, c.width, c.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    data[i] = 255;     // R = blanco
    data[i + 1] = 255; // G = blanco
    data[i + 2] = 255; // B = blanco
    // Mantener alpha original
  }
  
  ct.putImageData(imageData, 0, 0);
  return c;
}

// Pool de canvas temporales para optimización
const canvasPool = {
  pool: [],
  active: new Set(),
  
  get() {
    let canvas = this.pool.pop();
    if (!canvas) {
      canvas = document.createElement('canvas');
    }
    this.active.add(canvas);
    return canvas;
  },
  
  release(canvas) {
    if (this.active.has(canvas)) {
      this.active.delete(canvas);
      this.pool.push(canvas);
    }
  },
  
  init() {
    // Pre-crear algunos canvas
    for (let i = 0; i < 5; i++) {
      this.pool.push(document.createElement('canvas'));
    }
  }
};

// Función para dibujar la imagen de fondo centrada y achicada
function drawBackgroundImage() {
  const pattern = getCurrentPattern();
  if (!pattern) return;
  
  const canvasW = canvas.width / DPR;
  const canvasH = canvas.height / DPR;
  
  // Calcular escala para achicar 3 veces y centrar
  const scaleX = canvasW / pattern.width;
  const scaleY = canvasH / pattern.height;
  const scale = Math.min(scaleX, scaleY) / 3; // Dividido por 3 para achicar
  
  const scaledWidth = pattern.width * scale;
  const scaledHeight = pattern.height * scale;
  
  // Centrar en el canvas
  const x = (canvasW - scaledWidth) / 2;
  const y = (canvasH - scaledHeight) / 2;
  
  ctx.save();
  ctx.globalAlpha = 0.3; // Semi-transparente para que se vea el coloreo encima
  ctx.drawImage(pattern, x, y, scaledWidth, scaledHeight);
  ctx.restore();
}

// Función principal de animación
function start() {
  if (animating) {
    console.log('🔄 Animación ya en curso, cancelando anterior...');
    stop();
  }
  
  const pattern = getCurrentPattern();
  if (!pattern) {
    console.error('❌ No hay patrón disponible para animar');
    return;
  }
  
  console.log('🚀 INICIANDO ANIMACIÓN CON FULL.PNG (ACHICADO 3X)');
  
  setupCanvas();
  
  // SOLO limpiar canvas en la primera animación
  if (isFirstAnimation) {
    console.log('🎨 Primera animación: limpiando canvas y dibujando fondo');
    ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);
    drawBackgroundImage(); // Dibujar imagen de fondo
    isFirstAnimation = false;
  } else {
    console.log('🎨 Animación subsecuente: coloreando encima sin limpiar');
  }
  
  animating = true;
  startTime = Date.now();
  frameCount = 0;
  fpsStart = startTime;
  
  animate();
}

function colorOnTop() {
  console.log('🎨 COLOREANDO ENCIMA - SIN LIMPIAR CANVAS');
  start(); // Inicia animación sin limpiar
}

function stop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  animating = false;
  console.log('⏹️ Animación detenida');
}

// Entidades de dibujo
const entities = [];

function createEntity() {
  const pattern = getCurrentPattern();
  if (!pattern) return null;
  
  const canvasW = canvas.width / DPR;
  const canvasH = canvas.height / DPR;
  
  // Calcular área de la imagen achicada para concentrar el coloreo
  const scaleX = canvasW / pattern.width;
  const scaleY = canvasH / pattern.height;
  const imageScale = Math.min(scaleX, scaleY) / 3;
  
  const scaledWidth = pattern.width * imageScale;
  const scaledHeight = pattern.height * imageScale;
  const imageX = (canvasW - scaledWidth) / 2;
  const imageY = (canvasH - scaledHeight) / 2;
  
  // Posicionar entidades principalmente en el área de la imagen
  const margin = 50; // Margen alrededor de la imagen
  const x = imageX - margin + Math.random() * (scaledWidth + margin * 2);
  const y = imageY - margin + Math.random() * (scaledHeight + margin * 2);
  
  // ACHICADO 3 VECES: Calcular escala para que el coloreo sea proporcional
  const baseScale = imageScale * 2; // Escala base para el coloreo
  const scale = baseScale * (0.5 + Math.random() * 0.8);
  
  return {
    x: x,
    y: y,
    scale: scale,
    rotation: Math.random() * Math.PI * 2,
    alpha: 0.3 + Math.random() * 0.5, // Aumentar alpha para mejor visibilidad
    progress: 0,
    speed: 0.8 + Math.random() * 0.4,
    brush: maskBrushes[Math.floor(Math.random() * maskBrushes.length)],
    color: getSelectedColor()
  };
}

function getSelectedColor() {
  const colors = {
    red: { r: 220, g: 80, b: 70 },
    pink: { r: 255, g: 150, b: 200 },
    blue: { r: 70, g: 130, b: 220 }
  };
  
  return colors[selectedImage] || colors.red;
}

// Función principal de animación
function animate() {
  if (!animating) return;
  
  updateFPS();
  
  const elapsed = Date.now() - startTime;
  const progress = Math.min(elapsed / DURATION_MS, 1);
  
  // Crear nuevas entidades
  if (progress < 0.9 && Math.random() < 0.3) {
    for (let i = 0; i < 3; i++) {
      const entity = createEntity();
      if (entity) entities.push(entity);
    }
  }
  
  // Actualizar y dibujar entidades
  const tempCanvas = canvasPool.get();
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = canvas.width / DPR;
  tempCanvas.height = canvas.height / DPR;
  
  let entitiesProcessed = 0;
  
  for (let i = entities.length - 1; i >= 0 && entitiesProcessed < MAX_STEPS_PER_ENTITY_FRAME; i--) {
    const entity = entities[i];
    
    entity.progress += entity.speed * 0.016; // ~60fps
    
    if (entity.progress >= 1) {
      entities.splice(i, 1);
      continue;
    }
    
    entitiesProcessed++;
    
    if (entity.brush) {
      drawEntity(tempCtx, entity);
    }
  }
  
  // Aplicar al canvas principal
  if (entitiesProcessed > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  
  canvasPool.release(tempCanvas);
  
  // Continuar animación
  if (progress < 1) {
    animationId = requestAnimationFrame(animate);
  } else {
    console.log('✅ Animación completada');
    animating = false;
  }
}

function drawEntity(ctx, entity) {
  const pattern = getCurrentPattern();
  if (!pattern || !entity.brush) return;
  
  ctx.save();
  
  // Posicionar y rotar
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.rotation);
  ctx.scale(entity.scale, entity.scale);
  
  // Dibujar área de color (tamaño fijo para browser normal)
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = entity.alpha * entity.progress;
  
  // Aplicar color en área reducida
  ctx.fillStyle = `rgb(${entity.color.r}, ${entity.color.g}, ${entity.color.b})`;
  const colorSize = 100; // Tamaño fijo para el área de color
  ctx.fillRect(-colorSize/2, -colorSize/2, colorSize, colorSize);
  
  // Aplicar máscara de brocha (tamaño reducido)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  const brushSize = 80; // Tamaño fijo para la brocha
  ctx.drawImage(entity.brush, -brushSize/2, -brushSize/2, brushSize, brushSize);
  
  ctx.restore();
}

// Event listeners
window.addEventListener('resize', () => {
  if (animating) {
    setupCanvas();
  }
});

// Teclas de control
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    if (animating) {
      stop();
    } else {
      start();
    }
  }
  
  // Cambiar color con teclas 1, 2, 3
  if (e.key === '1') {
    selectedImage = 'red';
    console.log('🔴 Color cambiado a rojo');
  } else if (e.key === '2') {
    selectedImage = 'pink';
    console.log('🌸 Color cambiado a rosa');
  } else if (e.key === '3') {
    selectedImage = 'blue';
    console.log('🔵 Color cambiado a azul');
  }
});

// ==============================
// INICIALIZACIÓN
// ==============================

(async () => {
  console.log('🎨 Inicializando Full Reveal...');
  
  // Inicializar pool de canvas temporales
  canvasPool.init();
  
  // Configurar WebSocket
  setupWebSocket();
  
  try {
    // Cargar full.png
    console.log('🖼️ Cargando full.png...');
    const patternsLoaded = await loadFullPattern();
    
    if (!patternsLoaded || patterns.length === 0) {
      // Fallback: intentar cargar directamente full.png
      console.log('📁 loadFullPattern falló, intentando cargar full.png directamente...');
      
      try {
        console.log(`🔄 Intentando cargar full.png directamente`);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => {
            console.log(`✅ full.png cargado exitosamente (fallback)`);
            resolve();
          };
          img.onerror = (err) => {
            console.error(`❌ Error cargando full.png (fallback):`, err);
            reject(err);
          };
          img.src = `full.png?t=${Date.now()}`;
        });
        
        patterns.push({
          src: `full.png`,
          image: img,
          filename: 'full.png'
        });
        
        console.log(`✅ Patrón fallback cargado: full.png`);
      } catch (error) {
        console.error(`❌ Error cargando full.png directamente:`, error);
      }
    }
    
    if (patterns.length === 0) {
      console.error('❌ No se pudo cargar ningún patrón');
      return;
    }
    
    console.log(`🎨 Patrón inicial cargado: ${patterns[currentPatternIndex].src}`);
    
    // Cargar brochas en paralelo
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
    
    // SOLO iniciar animación automáticamente la PRIMERA VEZ si hay full.png
    if (patterns.length > 0 && !hasInitialAnimationStarted) {
      console.log('🚀 PRIMERA CARGA - INICIANDO ANIMACIÓN AUTOMÁTICA CON FULL.PNG');
      hasInitialAnimationStarted = true;
      start();
    } else if (hasInitialAnimationStarted) {
      console.log('⏸️ Sistema ya inicializado - esperando eventos de control...');
    } else {
      console.log('⏸️ No hay patrones disponibles, esperando eventos...');
    }
    
  } catch(e) {
    console.warn('Error en inicialización, iniciando sin brochas.', e);
    maskBrushes=[]; 
  }
})();

// Forzar recarga de patrones más recientes cuando la página esté completamente cargada
window.addEventListener('load', async () => {
  console.log('🔄 Página completamente cargada - verificando full.png...');
  try {
    await loadFullPattern();
    console.log(`✅ Patrón actualizado. Usando: ${patterns[currentPatternIndex]?.src || 'ninguno'}`);
  } catch (error) {
    console.error('❌ Error al recargar patrón:', error);
  }
});
