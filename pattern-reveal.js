// Ajustes generales - suavizados para mejor calidad visual
const DURATION_MS = 35000; // 35s para más tiempo de desarrollo suave
const DPR = 1; // cap para rendimiento
const MASK_SCALE = 0.85; // máscara a mayor resolución para mejor calidad
const MAX_UNITS_PER_FRAME = 320; // menos trabajo por frame para suavidad
const FINAL_SEAL_START = 0.80; // iniciar antes para asegurar cobertura completa
const FINAL_SEAL_ALPHA_MIN = 0.08;
const FINAL_SEAL_ALPHA_MAX = 0.15;
const FINAL_SEAL_CHUNK_BASE = 4; // más trabajo de sellado
const WASH_START = 0.75; // iniciar antes
const WASH_CHUNK_BASE = 6;
const MAX_STEPS_PER_ENTITY_FRAME = 3; // un poco más de trabajo por entidad

const container = document.getElementById('container');
const canvas = document.querySelector('.js-canvas');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { alpha: true, desynchronized: true });

// Eventos de dibujo del frame actual (para depuración exacta)
let drawEvents = [];

// Imagen de fondo: el patrón guardado
const BG = new Image(); 
BG.src = 'patterns/pattern.jpg'; // Usar la imagen del patrón guardado

const brushSrcs = [
  'Stroke/blue-watercolor-brush-stroke-1.png',
  'Stroke/blue-watercolor-brush-stroke-2.png',
  'Stroke/blue-watercolor-brush-stroke-6.png',
  'Stroke/blue-watercolor-brush-stroke-7.png',
  'Stroke/blue-watercolor-brush-stroke-14.png'
];
let maskBrushes = [];

// Estado
let size = { wCSS: 0, hCSS: 0, w: 0, h: 0 };
let layout = { dx: 0, dy: 0, dw: 0, dh: 0 };
let startedAt = 0, rafId = 0;
let fpsMonitorRafId = 0; // RAF separado para el monitor FPS
let seeds = [], strokes = [], sweeps = [], wash = [], spirals = [], radiants = [], connectors = [], droplets = [], waves = [];
let finalSealing = [];
let animationFinished = false; // Flag para indicar que la animación terminó

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
    this.fpsElement = document.getElementById('fpsValue');
    this.avgElement = document.getElementById('fpsAvg');
    this.lastTime = performance.now();
  },
  
  update(currentTime) {
    this.frameCount++;
    
    if (currentTime - this.lastTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      // Historial para promedio
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 10) {
        this.fpsHistory.shift();
      }
      
      this.avgFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
      
      // Actualizar UI
      if (this.fpsElement) {
        this.fpsElement.textContent = `${this.fps} FPS`;
        this.fpsElement.style.color = this.fps >= 30 ? '#00ff00' : this.fps >= 20 ? '#ffff00' : '#ff4444';
      }
      if (this.avgElement) {
        this.avgElement.textContent = `Avg: ${this.avgFps}`;
      }
    }
  }
};

// Utilidades matemáticas y de color
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOut(t) { return 1 - (1 - t) ** 2; }

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function getVibrancyVariation(baseHue, baseSat, baseLum, variance = 0.15) {
  const hueVar = (Math.random() - 0.5) * 60;
  const satVar = (Math.random() - 0.5) * variance;
  const lumVar = (Math.random() - 0.5) * (variance * 0.6);
  
  const h = (baseHue + hueVar + 360) % 360;
  const s = Math.max(0.3, Math.min(0.95, baseSat + satVar));
  const l = Math.max(0.2, Math.min(0.8, baseLum + lumVar));
  
  return hslToRgb(h, s, l);
}

// Configuración inicial
function init() {
  fpsMonitor.init();
  loadBrushes().then(() => {
    resize();
    window.addEventListener('resize', resize, { passive: true });
    
    // Iniciar animación cuando las imágenes estén cargadas
    Promise.all([
      new Promise(resolve => BG.onload = resolve),
    ]).then(() => {
      console.log('Todas las imágenes cargadas, iniciando animación...');
      start();
    });
    
    // Fallback si las imágenes ya están cargadas
    if (BG.complete) {
      console.log('Imágenes ya cargadas, iniciando animación...');
      start();
    }
  });
}

async function loadBrushes() {
  try {
    const promises = brushSrcs.map(src => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    });
    maskBrushes = await Promise.all(promises);
    console.log('Brushes cargados:', maskBrushes.length);
  } catch (error) {
    console.error('Error cargando brushes:', error);
  }
}

function resize() {
  const rect = container.getBoundingClientRect();
  size.wCSS = rect.width;
  size.hCSS = rect.height;
  size.w = Math.round(size.wCSS * DPR);
  size.h = Math.round(size.hCSS * DPR);
  
  canvas.width = size.w;
  canvas.height = size.h;
  canvas.style.width = size.wCSS + 'px';
  canvas.style.height = size.hCSS + 'px';
  
  maskCanvas.width = Math.round(size.w * MASK_SCALE);
  maskCanvas.height = Math.round(size.h * MASK_SCALE);
  
  console.log(`Canvas redimensionado: ${size.w}x${size.h} (CSS: ${size.wCSS}x${size.hCSS})`);
  updateLayout();
}

function updateLayout() {
  if (BG.complete && BG.naturalWidth > 0) {
    const containerAspect = size.w / size.h;
    const bgAspect = BG.naturalWidth / BG.naturalHeight;
    
    if (containerAspect > bgAspect) {
      layout.dw = size.w;
      layout.dh = size.w / bgAspect;
      layout.dx = 0;
      layout.dy = (size.h - layout.dh) / 2;
    } else {
      layout.dw = size.h * bgAspect;
      layout.dh = size.h;
      layout.dx = (size.w - layout.dw) / 2;
      layout.dy = 0;
    }
    console.log('Layout actualizado:', layout);
  }
}

function start() {
  if (startedAt > 0) return; // Ya iniciado
  
  console.log('Iniciando animación...');
  startedAt = performance.now();
  animationFinished = false;
  
  // Generar entidades de animación
  generateSeeds();
  generateStrokes();
  generateSweeps();
  generateWash();
  generateSpirals();
  generateRadiants();
  generateConnectors();
  generateDroplets();
  generateWaves();
  generateFinalSealing();
  
  render();
  fpsMonitorLoop();
}

// Generadores de entidades (simplificados para el patrón)
function generateSeeds() {
  seeds = [];
  const count = Math.floor(50 + Math.random() * 30);
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      startTime: Math.random() * 0.15,
      duration: 0.8 + Math.random() * 1.2,
      maxRadius: 15 + Math.random() * 25,
      color: getVibrancyVariation(210, 0.8, 0.6),
      alpha: 0.4 + Math.random() * 0.3
    });
  }
}

function generateStrokes() {
  strokes = [];
  const count = Math.floor(80 + Math.random() * 40);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const length = 100 + Math.random() * 200;
    const startX = Math.random() * size.w;
    const startY = Math.random() * size.h;
    
    strokes.push({
      x1: startX,
      y1: startY,
      x2: startX + Math.cos(angle) * length,
      y2: startY + Math.sin(angle) * length,
      startTime: 0.1 + Math.random() * 0.3,
      duration: 1.0 + Math.random() * 1.5,
      thickness: 8 + Math.random() * 15,
      color: getVibrancyVariation(200, 0.75, 0.55),
      alpha: 0.3 + Math.random() * 0.4,
      brush: maskBrushes[Math.floor(Math.random() * maskBrushes.length)]
    });
  }
}

function generateSweeps() {
  sweeps = [];
  const count = Math.floor(15 + Math.random() * 10);
  for (let i = 0; i < count; i++) {
    sweeps.push({
      centerX: Math.random() * size.w,
      centerY: Math.random() * size.h,
      startAngle: Math.random() * Math.PI * 2,
      sweepAngle: Math.PI * (0.5 + Math.random()),
      radius: 80 + Math.random() * 120,
      startTime: 0.2 + Math.random() * 0.4,
      duration: 2.0 + Math.random() * 2.0,
      thickness: 20 + Math.random() * 30,
      color: getVibrancyVariation(190, 0.7, 0.5),
      alpha: 0.25 + Math.random() * 0.3
    });
  }
}

function generateWash() {
  wash = [];
  const count = Math.floor(200 + Math.random() * 100);
  for (let i = 0; i < count; i++) {
    wash.push({
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      startTime: WASH_START + Math.random() * 0.15,
      duration: 0.5 + Math.random() * 0.8,
      radius: 10 + Math.random() * 20,
      color: getVibrancyVariation(220, 0.6, 0.65),
      alpha: 0.15 + Math.random() * 0.2
    });
  }
}

function generateSpirals() {
  spirals = [];
  const count = Math.floor(8 + Math.random() * 6);
  for (let i = 0; i < count; i++) {
    spirals.push({
      centerX: Math.random() * size.w,
      centerY: Math.random() * size.h,
      startTime: 0.3 + Math.random() * 0.3,
      duration: 3.0 + Math.random() * 2.0,
      maxRadius: 60 + Math.random() * 80,
      turns: 2 + Math.random() * 3,
      thickness: 12 + Math.random() * 18,
      color: getVibrancyVariation(240, 0.8, 0.5),
      alpha: 0.3 + Math.random() * 0.2
    });
  }
}

function generateRadiants() {
  radiants = [];
  const count = Math.floor(12 + Math.random() * 8);
  for (let i = 0; i < count; i++) {
    radiants.push({
      centerX: Math.random() * size.w,
      centerY: Math.random() * size.h,
      startTime: 0.4 + Math.random() * 0.3,
      duration: 2.5 + Math.random() * 1.5,
      rayCount: 6 + Math.floor(Math.random() * 8),
      maxLength: 70 + Math.random() * 100,
      thickness: 6 + Math.random() * 10,
      color: getVibrancyVariation(180, 0.75, 0.6),
      alpha: 0.25 + Math.random() * 0.25
    });
  }
}

function generateConnectors() {
  connectors = [];
  const count = Math.floor(25 + Math.random() * 15);
  for (let i = 0; i < count; i++) {
    connectors.push({
      x1: Math.random() * size.w,
      y1: Math.random() * size.h,
      x2: Math.random() * size.w,
      y2: Math.random() * size.h,
      startTime: 0.5 + Math.random() * 0.2,
      duration: 1.8 + Math.random() * 1.2,
      thickness: 4 + Math.random() * 8,
      color: getVibrancyVariation(160, 0.7, 0.55),
      alpha: 0.2 + Math.random() * 0.25
    });
  }
}

function generateDroplets() {
  droplets = [];
  const count = Math.floor(60 + Math.random() * 40);
  for (let i = 0; i < count; i++) {
    droplets.push({
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      startTime: 0.6 + Math.random() * 0.2,
      duration: 1.0 + Math.random() * 1.0,
      maxRadius: 8 + Math.random() * 15,
      color: getVibrancyVariation(280, 0.65, 0.6),
      alpha: 0.3 + Math.random() * 0.3
    });
  }
}

function generateWaves() {
  waves = [];
  const count = Math.floor(6 + Math.random() * 4);
  for (let i = 0; i < count; i++) {
    waves.push({
      startX: Math.random() * size.w,
      startY: Math.random() * size.h,
      direction: Math.random() * Math.PI * 2,
      startTime: 0.7 + Math.random() * 0.15,
      duration: 2.0 + Math.random() * 1.5,
      wavelength: 40 + Math.random() * 30,
      amplitude: 15 + Math.random() * 20,
      thickness: 8 + Math.random() * 12,
      color: getVibrancyVariation(320, 0.7, 0.55),
      alpha: 0.25 + Math.random() * 0.2
    });
  }
}

function generateFinalSealing() {
  finalSealing = [];
  const count = Math.floor(300 + Math.random() * 200);
  for (let i = 0; i < count; i++) {
    finalSealing.push({
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      startTime: FINAL_SEAL_START + Math.random() * 0.15,
      duration: 0.3 + Math.random() * 0.4,
      radius: 5 + Math.random() * 12,
      color: getVibrancyVariation(200, 0.5, 0.7),
      alpha: FINAL_SEAL_ALPHA_MIN + Math.random() * (FINAL_SEAL_ALPHA_MAX - FINAL_SEAL_ALPHA_MIN)
    });
  }
}

// Motor de renderizado
function render() {
  const now = performance.now();
  const elapsed = now - startedAt;
  const progress = Math.min(elapsed / DURATION_MS, 1);
  
  // Limpiar canvas principal
  ctx.clearRect(0, 0, size.w, size.h);
  
  // Dibujar imagen de fondo (patrón)
  if (BG.complete) {
    ctx.drawImage(BG, layout.dx, layout.dy, layout.dw, layout.dh);
  }
  
  // Limpiar máscara
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  
  // Renderizar todas las entidades en la máscara
  renderSeeds(progress);
  renderStrokes(progress);
  renderSweeps(progress);
  renderWash(progress);
  renderSpirals(progress);
  renderRadiants(progress);
  renderConnectors(progress);
  renderDroplets(progress);
  renderWaves(progress);
  renderFinalSealing(progress);
  
  // Aplicar máscara al canvas principal
  applyMask();
  
  // Continuar animación
  if (progress < 1 && !animationFinished) {
    rafId = requestAnimationFrame(render);
  } else if (!animationFinished) {
    animationFinished = true;
    console.log('Animación completada');
  }
}

function renderSeeds(progress) {
  seeds.forEach(seed => {
    const localProgress = Math.max(0, Math.min(1, (progress - seed.startTime) / seed.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeOut(localProgress);
    const radius = seed.maxRadius * easedProgress;
    const alpha = seed.alpha * (1 - localProgress * 0.3);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.fillStyle = `rgb(${seed.color.join(',')})`;
    maskCtx.beginPath();
    maskCtx.arc(
      seed.x * MASK_SCALE,
      seed.y * MASK_SCALE,
      radius * MASK_SCALE,
      0,
      Math.PI * 2
    );
    maskCtx.fill();
  });
}

function renderStrokes(progress) {
  strokes.forEach(stroke => {
    const localProgress = Math.max(0, Math.min(1, (progress - stroke.startTime) / stroke.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeInOut(localProgress);
    const alpha = stroke.alpha * Math.sin(localProgress * Math.PI);
    
    if (stroke.brush) {
      const segments = 20;
      for (let i = 0; i <= segments * easedProgress; i++) {
        const t = i / segments;
        const x = lerp(stroke.x1, stroke.x2, t);
        const y = lerp(stroke.y1, stroke.y2, t);
        const size = stroke.thickness * (1 - t * 0.3);
        
        maskCtx.globalAlpha = alpha * (1 - t * 0.5);
        maskCtx.drawImage(
          stroke.brush,
          (x - size/2) * MASK_SCALE,
          (y - size/2) * MASK_SCALE,
          size * MASK_SCALE,
          size * MASK_SCALE
        );
      }
    }
  });
}

function renderSweeps(progress) {
  sweeps.forEach(sweep => {
    const localProgress = Math.max(0, Math.min(1, (progress - sweep.startTime) / sweep.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeInOut(localProgress);
    const currentAngle = sweep.startAngle + sweep.sweepAngle * easedProgress;
    const alpha = sweep.alpha * Math.sin(localProgress * Math.PI);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.strokeStyle = `rgb(${sweep.color.join(',')})`;
    maskCtx.lineWidth = sweep.thickness * MASK_SCALE;
    maskCtx.lineCap = 'round';
    
    maskCtx.beginPath();
    maskCtx.arc(
      sweep.centerX * MASK_SCALE,
      sweep.centerY * MASK_SCALE,
      sweep.radius * MASK_SCALE,
      sweep.startAngle,
      currentAngle
    );
    maskCtx.stroke();
  });
}

function renderWash(progress) {
  if (progress < WASH_START) return;
  
  const chunkSize = Math.max(1, Math.floor(wash.length / 20));
  const processedCount = Math.min(wash.length, Math.floor((progress - WASH_START) * wash.length * 4));
  
  for (let i = 0; i < processedCount; i += chunkSize) {
    const endIndex = Math.min(i + WASH_CHUNK_BASE, processedCount);
    
    for (let j = i; j < endIndex && j < wash.length; j++) {
      const particle = wash[j];
      const localProgress = Math.max(0, Math.min(1, (progress - particle.startTime) / particle.duration));
      if (localProgress <= 0) continue;
      
      const radius = particle.radius * localProgress;
      const alpha = particle.alpha * (1 - localProgress * 0.7);
      
      maskCtx.globalAlpha = alpha;
      maskCtx.fillStyle = `rgb(${particle.color.join(',')})`;
      maskCtx.beginPath();
      maskCtx.arc(
        particle.x * MASK_SCALE,
        particle.y * MASK_SCALE,
        radius * MASK_SCALE,
        0,
        Math.PI * 2
      );
      maskCtx.fill();
    }
  }
}

function renderSpirals(progress) {
  spirals.forEach(spiral => {
    const localProgress = Math.max(0, Math.min(1, (progress - spiral.startTime) / spiral.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeInOut(localProgress);
    const alpha = spiral.alpha * Math.sin(localProgress * Math.PI);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.strokeStyle = `rgb(${spiral.color.join(',')})`;
    maskCtx.lineWidth = spiral.thickness * MASK_SCALE;
    maskCtx.lineCap = 'round';
    
    const segments = 50;
    maskCtx.beginPath();
    for (let i = 0; i <= segments * easedProgress; i++) {
      const t = i / segments;
      const angle = spiral.turns * Math.PI * 2 * t;
      const radius = spiral.maxRadius * t;
      const x = spiral.centerX + Math.cos(angle) * radius;
      const y = spiral.centerY + Math.sin(angle) * radius;
      
      if (i === 0) {
        maskCtx.moveTo(x * MASK_SCALE, y * MASK_SCALE);
      } else {
        maskCtx.lineTo(x * MASK_SCALE, y * MASK_SCALE);
      }
    }
    maskCtx.stroke();
  });
}

function renderRadiants(progress) {
  radiants.forEach(radiant => {
    const localProgress = Math.max(0, Math.min(1, (progress - radiant.startTime) / radiant.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeOut(localProgress);
    const alpha = radiant.alpha * Math.sin(localProgress * Math.PI);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.strokeStyle = `rgb(${radiant.color.join(',')})`;
    maskCtx.lineWidth = radiant.thickness * MASK_SCALE;
    maskCtx.lineCap = 'round';
    
    for (let i = 0; i < radiant.rayCount; i++) {
      const angle = (i / radiant.rayCount) * Math.PI * 2;
      const length = radiant.maxLength * easedProgress;
      const x2 = radiant.centerX + Math.cos(angle) * length;
      const y2 = radiant.centerY + Math.sin(angle) * length;
      
      maskCtx.beginPath();
      maskCtx.moveTo(radiant.centerX * MASK_SCALE, radiant.centerY * MASK_SCALE);
      maskCtx.lineTo(x2 * MASK_SCALE, y2 * MASK_SCALE);
      maskCtx.stroke();
    }
  });
}

function renderConnectors(progress) {
  connectors.forEach(connector => {
    const localProgress = Math.max(0, Math.min(1, (progress - connector.startTime) / connector.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeInOut(localProgress);
    const alpha = connector.alpha * Math.sin(localProgress * Math.PI);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.strokeStyle = `rgb(${connector.color.join(',')})`;
    maskCtx.lineWidth = connector.thickness * MASK_SCALE;
    maskCtx.lineCap = 'round';
    
    const currentX = lerp(connector.x1, connector.x2, easedProgress);
    const currentY = lerp(connector.y1, connector.y2, easedProgress);
    
    maskCtx.beginPath();
    maskCtx.moveTo(connector.x1 * MASK_SCALE, connector.y1 * MASK_SCALE);
    maskCtx.lineTo(currentX * MASK_SCALE, currentY * MASK_SCALE);
    maskCtx.stroke();
  });
}

function renderDroplets(progress) {
  droplets.forEach(droplet => {
    const localProgress = Math.max(0, Math.min(1, (progress - droplet.startTime) / droplet.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeOut(localProgress);
    const radius = droplet.maxRadius * easedProgress;
    const alpha = droplet.alpha * (1 - localProgress * 0.5);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.fillStyle = `rgb(${droplet.color.join(',')})`;
    maskCtx.beginPath();
    maskCtx.arc(
      droplet.x * MASK_SCALE,
      droplet.y * MASK_SCALE,
      radius * MASK_SCALE,
      0,
      Math.PI * 2
    );
    maskCtx.fill();
  });
}

function renderWaves(progress) {
  waves.forEach(wave => {
    const localProgress = Math.max(0, Math.min(1, (progress - wave.startTime) / wave.duration));
    if (localProgress <= 0) return;
    
    const easedProgress = easeInOut(localProgress);
    const alpha = wave.alpha * Math.sin(localProgress * Math.PI);
    
    maskCtx.globalAlpha = alpha;
    maskCtx.strokeStyle = `rgb(${wave.color.join(',')})`;
    maskCtx.lineWidth = wave.thickness * MASK_SCALE;
    maskCtx.lineCap = 'round';
    
    const length = 200 * easedProgress;
    const segments = 30;
    
    maskCtx.beginPath();
    for (let i = 0; i <= segments * easedProgress; i++) {
      const t = i / segments;
      const distance = length * t;
      const waveOffset = Math.sin((distance / wave.wavelength) * Math.PI * 2) * wave.amplitude;
      
      const x = wave.startX + Math.cos(wave.direction) * distance + Math.cos(wave.direction + Math.PI/2) * waveOffset;
      const y = wave.startY + Math.sin(wave.direction) * distance + Math.sin(wave.direction + Math.PI/2) * waveOffset;
      
      if (i === 0) {
        maskCtx.moveTo(x * MASK_SCALE, y * MASK_SCALE);
      } else {
        maskCtx.lineTo(x * MASK_SCALE, y * MASK_SCALE);
      }
    }
    maskCtx.stroke();
  });
}

function renderFinalSealing(progress) {
  if (progress < FINAL_SEAL_START) return;
  
  const chunkSize = Math.max(1, Math.floor(finalSealing.length / 30));
  const processedCount = Math.min(finalSealing.length, Math.floor((progress - FINAL_SEAL_START) * finalSealing.length * 6));
  
  for (let i = 0; i < processedCount; i += chunkSize) {
    const endIndex = Math.min(i + FINAL_SEAL_CHUNK_BASE, processedCount);
    
    for (let j = i; j < endIndex && j < finalSealing.length; j++) {
      const seal = finalSealing[j];
      const localProgress = Math.max(0, Math.min(1, (progress - seal.startTime) / seal.duration));
      if (localProgress <= 0) continue;
      
      const radius = seal.radius * localProgress;
      const alpha = seal.alpha;
      
      maskCtx.globalAlpha = alpha;
      maskCtx.fillStyle = `rgb(${seal.color.join(',')})`;
      maskCtx.beginPath();
      maskCtx.arc(
        seal.x * MASK_SCALE,
        seal.y * MASK_SCALE,
        radius * MASK_SCALE,
        0,
        Math.PI * 2
      );
      maskCtx.fill();
    }
  }
}

function applyMask() {
  // Aplicar la máscara como overlay con blend mode
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(maskCanvas, 0, 0, size.w, size.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function fpsMonitorLoop() {
  const now = performance.now();
  fpsMonitor.update(now);
  fpsMonitorRafId = requestAnimationFrame(fpsMonitorLoop);
}

// Manejar visibilidad de la página
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && animationFinished && startedAt > 0) {
    // Reiniciar animación si la página vuelve a ser visible y la animación había terminado
    console.log('Página visible, reiniciando animación...');
    start();
  }
});

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
