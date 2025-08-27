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
    console.log('🔍 Cargando wallpaper.jpg...');
    
    // Verificar si existe wallpaper.jpg
    const wallpaperExists = await checkIfFileExists('/patterns/wallpaper.jpg');
    
    if (wallpaperExists) {
      console.log(`🎯 Cargando wallpaper.jpg`);
      
      // Limpiar patrones existentes
      patterns.length = 0;
      
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => {
          console.log(`✅ wallpaper.jpg cargado exitosamente`);
          resolve();
        };
        img.onerror = (err) => {
          console.error(`❌ Error cargando wallpaper.jpg`, err);
          reject(err);
        };
        img.src = `patterns/wallpaper.jpg?t=${Date.now()}`;
      });
      
      patterns.push({
        src: `patterns/wallpaper.jpg`,
        image: img,
        filename: 'wallpaper.jpg'
      });
      
      // Usar el patrón recién cargado
      currentPatternIndex = 0;
      console.log(`🎨 CONFIRMADO - Usando patrón más reciente: ${patterns[0].src}`);
      console.log(`📊 Total de patrones cargados: ${patterns.length}`);
      
      return true;
    } else {
      console.warn('❌ No se encontraron patrones válidos en la respuesta del servidor');
      console.warn('Data recibida:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Error cargando patrones:', error);
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
      // Registrarse como brush-reveal
      socket.emit('register', { type: 'brush-reveal' });
    });
    
    socket.on('disconnect', () => {
      console.log('🔌 Desconectado del servidor WebSocket - intentando reconectar...');
    });
    
    socket.on('reconnect', () => {
      console.log('🔌 Reconectado al servidor WebSocket');
      socket.emit('register', { type: 'brush-reveal' });
    });
    
    // Escuchar cuando hay un nuevo patrón listo
    socket.on('newPatternReady', (data) => {
      console.log(`🎨 Nuevo patrón recibido:`, data);
      latestPatternId = data.patternId;
      
      // Cargar el nuevo patrón y iniciar animación ENCIMA
      loadNewPatternAndAnimate(data.filename);
    });

    // Cuando se actualiza la imagen procesada (tecla 9), cargar el último patrón de /patterns
    socket.on('imageUpdated', (data) => {
      console.log('🆕 Imagen procesada actualizada - coloreando encima con wallpaper.jpg:', data);
      loadLatestPatternAndAnimate();
    });
    
    // NUEVO: Escuchar orden desde /control para iniciar animación con último patrón
    socket.on('requestAnimationStart', (data) => {
      console.log('🎬 Orden recibida desde /control - coloreando encima con último patrón');
      loadLatestPatternAndAnimate();
    });
    
    // Escuchar cambios en la selección de imagen
    socket.on('imageSelected', (data) => {
      console.log(`🖼️ Imagen seleccionada cambiada a: ${data.image}.png`);
      selectedImage = data.image;
      updateFallbackPattern();
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
        newImg.src = `patterns/wallpaper.jpg?t=${Date.now()}`;
      });

      // Reemplazar último patrón con wallpaper.jpg actualizado
      patterns.push({ src: `patterns/wallpaper.jpg`, image: newImg, filename: 'wallpaper.jpg' });
      if (patterns.length > 3) {
        patterns.shift();
      }
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
    
    // Crear nueva imagen para el patrón
    const newPatternImage = new Image();
    
    await new Promise((resolve, reject) => {
      newPatternImage.onload = resolve;
      newPatternImage.onerror = reject;
      newPatternImage.src = `patterns/${filename}?t=${Date.now()}`; // Cache busting
    });
    
    // Agregar el nuevo patrón al array
    patterns.push({
      src: `patterns/${filename}`,
      image: newPatternImage,
      filename: filename
    });
    
    // Mantener solo los últimos 3 patrones para evitar acumulación de memoria
    if (patterns.length > 3) {
      patterns.shift();
      // Ajustar índice si es necesario
      if (currentPatternIndex > 0) {
        currentPatternIndex--;
      }
    }
    
    // Cambiar al nuevo patrón (último agregado)
    currentPatternIndex = patterns.length - 1;
    
    console.log(`✅ Nuevo patrón cargado (${patterns.length} total). COLOREANDO ENCIMA...`);
    
    // COLOREAR ENCIMA del wallpaper existente sin resetear
    colorOnTop();
    
  } catch (error) {
    console.error('❌ Error cargando nuevo patrón:', error);
  }
}

// Estado
let size = { wCSS: 0, hCSS: 0, w: 0, h: 0 };
let layout = { dx: 0, dy: 0, dw: 0, dh: 0 };
let startedAt = 0, rafId = 0;
let fpsMonitorRafId = 0; // RAF separado para el monitor FPS
let seeds = [], strokes = [], sweeps = [], wash = [], spirals = [], radiants = [], connectors = [], droplets = [], waves = [];
let finalSealing = [];
let animationFinished = false; // Flag para indicar que la animación terminó
let isFirstAnimation = true; // Flag para controlar si es la primera animación
let latestPatternId = null; // ID del patrón más reciente
let socket = null; // Conexión WebSocket

// Pool de canvas temporales para optimización (reutilizar en lugar de crear cada frame)
const canvasPool = {
  tempCanvases: [],
  tempContexts: [],
  
  init() {
    // Crear canvas reutilizables para optimización
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      this.tempCanvases.push(canvas);
      this.tempContexts.push(ctx);
    }
  },
  
  resizeAll(width, height) {
    for (let i = 0; i < this.tempCanvases.length; i++) {
      this.tempCanvases[i].width = width;
      this.tempCanvases[i].height = height;
    }
  },
  
  getCanvas(index) {
    const canvas = this.tempCanvases[index];
    const ctx = this.tempContexts[index];
    // Limpiar canvas para reutilización
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      
      // Actualizar display
      if (this.fpsElement) {
        this.fpsElement.textContent = `${this.fps} FPS`;
        // Cambiar color según rendimiento
        if (this.fps >= 50) {
          this.fpsElement.style.color = '#00ff00'; // Verde
        } else if (this.fps >= 30) {
          this.fpsElement.style.color = '#ffff00'; // Amarillo
        } else {
          this.fpsElement.style.color = '#ff0000'; // Rojo
        }
      }
      
      if (this.avgElement) {
        this.avgElement.textContent = `Avg: ${this.avgFps}`;
      }
    }
  },
  
  showCompleted() {
    // Mostrar estado final cuando la animación termine pero mantener FPS
    if (this.fpsElement) {
      this.fpsElement.textContent = `COMPLETO - ${this.fps} FPS`;
      this.fpsElement.style.color = '#00ffff'; // Cyan
    }
    if (this.avgElement) {
      this.avgElement.textContent = `Avg: ${this.avgFps} - ESTATICO`;
    }
  }
};

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
  const r = container.getBoundingClientRect();
  size.wCSS = Math.floor(r.width); size.hCSS = Math.floor(r.height);
  size.w = Math.floor(size.wCSS*DPR); size.h = Math.floor(size.hCSS*DPR);
  canvas.width=size.w; canvas.height=size.h; canvas.style.width=size.wCSS+'px'; canvas.style.height=size.hCSS+'px';
  maskCanvas.width=Math.max(1, Math.floor(size.w*MASK_SCALE));
  maskCanvas.height=Math.max(1, Math.floor(size.h*MASK_SCALE));
  
  // Redimensionar canvas temporales del pool
  canvasPool.resizeAll(size.w, size.h);
  
  // Dibujo en coordenadas full-res, pero el contexto de máscara se escala
  maskCtx.setTransform(MASK_SCALE,0,0,MASK_SCALE,0,0);
  
  const currentBG = getCurrentPattern();
  if (currentBG && currentBG.naturalWidth && currentBG.naturalHeight){
    const s = Math.max(size.w/currentBG.naturalWidth, size.h/currentBG.naturalHeight);
    const dw = Math.ceil(currentBG.naturalWidth*s), dh = Math.ceil(currentBG.naturalHeight*s);
    layout.dx = Math.floor((size.w-dw)/2); layout.dy = Math.floor((size.h-dh)/2); layout.dw = dw; layout.dh = dh;
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
  const COUNT = Math.round(clamp(320*area, 240, 450)); // aún más trazos
  const earlyCount = Math.max(10, Math.min(18, Math.floor(COUNT*0.06))); // más comienzos inmediatos
  const spreadInterval = Math.max(1, Math.floor(COUNT/8));
  // trazo garantizado desde el centro
  const centerBaseW = clamp(gauss(16,5), 9,28) * (size.w/1280+size.h/720)*.5;
  const centerSteps = Math.round(clamp(gauss(180,40), 120,260)*area);
  const centerStepLen = clamp(gauss(5.0,1.4), 2.6, 7.2) * (size.w/1280+size.h/720)*.5;
  const centerDrift = rand(.018,.045);
  const centerBrush = maskBrushes.length? 0 : -1;
  strokes.push({ x:size.w*0.5, y:size.h*0.5, angle: rand(0,Math.PI*2), baseW:centerBaseW, alpha:0.75, steps:centerSteps, stepLen:centerStepLen, drift:centerDrift, tStart:0, tEnd:0.45, idx:0, b:centerBrush, seedIndex:0 });
  for (let i=0;i<COUNT;i++){
    const seedIndex = i%seeds.length;
    const s = seeds[seedIndex];
    let x = clamp(s.x+gauss(0,.06), .01,.99)*size.w;
    let y = clamp(s.y+gauss(0,.06), .01,.99)*size.h;
    const baseW = clamp(gauss(14,4), 7,25)*(size.w/1280+size.h/720)*.5;
    const alpha = clamp(gauss(.7,.1), .35, .85);
    const steps = Math.round(clamp(gauss(160,50), 100,250)*area);
    const stepLen = clamp(gauss(4.8,1.5), 2.5, 7.5)*(size.w/1280+size.h/720)*.5;
    let angle = rand(0,Math.PI*2);
    const drift = rand(.02,.06);
    let tStart = clamp(rand(0,.4)+(i/COUNT)*.5, 0,.85); // distribuido hasta 85%
    if (i < earlyCount || (i % spreadInterval) === 0) tStart = clamp(rand(0,.05), 0, .09); // arranques inmediatos distribuidos
    const tEnd = clamp(tStart+rand(.34,.56),0,0.96);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    strokes.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b,seedIndex});
  }
}

function makeSpirals(){
  spirals = [];
  const COUNT = Math.round(clamp(12*(size.w*size.h)/(1280*720), 8, 18));
  for (let i=0;i<COUNT;i++){
    const cx = rand(.15,.85)*size.w;
    const cy = rand(.15,.85)*size.h;
    const maxRadius = rand(80,150)*(size.w/1280+size.h/720)*.5;
    const baseW = clamp(gauss(12,3), 6,20)*(size.w/1280+size.h/720)*.5;
    const alpha = rand(.25,.45);
    const steps = Math.round(rand(80,140));
    const angleSpeed = rand(.08,.15);
    const radiusSpeed = maxRadius/steps;
    const tStart = clamp(rand(.3,.7), 0,.8);
    const tEnd = clamp(tStart+rand(.25,.4),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    spirals.push({cx,cy,maxRadius,baseW,alpha,steps,angleSpeed,radiusSpeed,tStart,tEnd,idx:0,b,angle:rand(0,Math.PI*2),radius:maxRadius*0.05});
  }
}

// Gotas que nacen y crecen con borde de brocha
function makeDroplets(){
  droplets = [];
  const area = (size.w*size.h)/(1280*720);
  const COUNT = Math.round(clamp(6*area, 4, 12));
  for (let i=0;i<COUNT;i++){
    const cx = rand(.15,.85)*size.w;
    const cy = rand(.15,.85)*size.h;
    const maxR = rand(80, 180) * (size.w/1280+size.h/720)*.5;
    const tStart = clamp(rand(.15,.45),0,.7);
    const tEnd = clamp(tStart + rand(.18,.26), 0, 0.84);
    const edgeThickness = rand(0.10, 0.18); // relativo a R actual
    const fillAlpha = rand(0.06, 0.12);
    const edgeAlpha = rand(0.10, 0.22);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const approxCirc = 2*Math.PI*maxR;
    const spacing = 22 * (size.w/1280+size.h/720)*.5;
    const N = Math.max(12, Math.min(240, Math.floor(approxCirc/Math.max(16, spacing))));
    const di = Math.max(1, Math.floor(N*0.382));
    const fillH = makeHarmonics(2);
    const edgeH = makeHarmonics(3);
    droplets.push({cx,cy,maxR,tStart,tEnd,edgeThickness,fillAlpha,edgeAlpha,b,i:0,N,di,fillH,edgeH});
  }
}

function stepDroplet(d, e, sizeMultiplier, budget){
  // progreso local 0..1
  const local = clamp((e - d.tStart) / Math.max(0.0001, (d.tEnd - d.tStart)), 0, 1);
  if (local<=0) return 0;
  const es = local*local*(3-2*local); // smoothstep
  // Empezar con tamaño mínimo visible desde el inicio
  const R = d.maxR * (0.05 + 0.95*es); // cambio: empezar en 5% en lugar de 15%
  let spent = 0;

  // Relleno interior con borde orgánico - siempre visible desde el inicio (ligeramente más opaco al principio)
  fillIrregularBlob(d.cx, d.cy, R*(1.0 - d.edgeThickness*0.7), d.fillH, d.fillAlpha * (0.4 + 0.6*es), 40, 0.5 + 0.5*es, 0.01);

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
    const alpha = d.edgeAlpha * (0.6 + 0.5*es);
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

function makeSweeps(){
  sweeps = [];
  const COUNT = 20; // más barridos para asegurar cobertura
  for (let i=0;i<COUNT;i++){
    const edge=Math.floor(rand(0,4));
    let x,y,angle;
    if (edge===0){x=-size.w*.15;y=rand(.1,.9)*size.h;angle=rand(-.08,.08);} // izq→der
    else if(edge===1){x=size.w*1.15;y=rand(.1,.9)*size.h;angle=Math.PI+rand(-.08,.08);} // der→izq
    else if(edge===2){x=rand(.1,.9)*size.w;y=-size.h*.15;angle=Math.PI/2+rand(-.08,.08);} // top→down
    else {x=rand(.1,.9)*size.w;y=size.h*1.15;angle=-Math.PI/2+rand(-.08,.08);} // bottom→up
    const baseW = rand(38,75)*(size.w/1280+size.h/720)*.5; // barridos más delgados
    const alpha = rand(.08,.16); // alpha más sutil
    const steps = Math.round(rand(120,200)*(size.w*size.h)/(1280*720)); // más pasos
    const stepLen = rand(4.8,8.0) * (size.w/1280+size.h/720)*.5;
    const drift = rand(.008,.03); // muy poca deriva
    const tStart = clamp(rand(.7,.85),0,1); // empiezan antes
    const tEnd = clamp(tStart+rand(.18,.28),0,1);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    sweeps.push({x,y,angle,baseW,alpha,steps,stepLen,drift,tStart,tEnd,idx:0,b});
  }
}

function makeWash(){
  wash = [];
  const cols = Math.max(8, Math.round(size.w/220)); // un poco más denso
  const rows = Math.max(6, Math.round(size.h/220));
  const dx = size.w/cols, dy = size.h/rows;
  for (let r=0;r<=rows;r++){
    for (let c=0;c<=cols;c++){
      const x = c*dx + rand(-dx*.4, dx*.4);
      const y = r*dy + rand(-dy*.4, dy*.4);
      const s = rand(1.0, 1.8)*(size.w/1280+size.h/720)*.5; // un poco más grandes
      const a = rand(.05,.10); // alpha sutil
      const rot = rand(0,Math.PI*2);
      const t = clamp(rand(.85,.98),0,1); // empieza un poco antes
      const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
      wash.push({x,y,s,a,rot,t,b});
    }
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
    const stepLen = rand(3.2,6.5) * (size.w/1280+size.h/720)*.5;
    const drift = rand(.006,.02);
    const tStart = i < earlyCount ? rand(0, 0.1) : clamp(rand(.2,.7), 0, .85);
    const tEnd = clamp(tStart + rand(.28,.48), 0, .95);
    const b = maskBrushes.length? Math.floor(rand(0,maskBrushes.length)) : -1;
    const freq = rand(0.02, 0.055);
    const ampAng = rand(0.06, 0.18); // amplitud angular
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
    if (hasBrush){
      const brush = maskBrushes[wv.b];
      const scale = w / Math.max(brush.width, brush.height) * 2.35;
      const rot = Math.atan2(ny-wv.y, nx-wv.x) + gauss(0, .08);
      // varias pasadas leves a lo largo del segmento para evitar aspecto disjunto
      for (let pass=0; pass<3; pass++){
        const t = pass/3; const ts = t*t*(3-2*t);
        const px = wv.x + (nx-wv.x)*ts;
        const py = wv.y + (ny-wv.y)*ts;
        const pAlpha = wv.alpha * (0.12 + 0.08*Math.sin(ts*Math.PI));
        const pScale = scale * (0.9 + ts*0.18);
        stamp(brush, px, py, pScale, pAlpha, rot + gauss(0,.05));
      }
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

// Puntos precomputados para el "sellado" final (cobertura de huecos)
function makeFinalSealing(){
  finalSealing = [];
  const cols = Math.max(10, Math.round(size.w/180));
  const rows = Math.max(8, Math.round(size.h/180));
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

// Un golpe inicial en el centro para evitar pantalla en blanco
function kickstartMask(){
  const cx = size.w*0.5, cy = size.h*0.5;
  const desiredW = Math.max(60, Math.min(size.w, size.h) * 0.08);
  const b = (maskBrushes && maskBrushes.length) ? maskBrushes[0] : null;
  if (b){
    const scale = desiredW / Math.max(1, b.width);
    stamp(b, cx, cy, scale, 0.28, 0);
  } else {
    maskCtx.save(); maskCtx.globalAlpha=0.3; maskCtx.beginPath(); maskCtx.fillStyle="#fff";
    maskCtx.arc(cx, cy, desiredW*0.5, 0, Math.PI*2); maskCtx.fill(); maskCtx.restore();
  }
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

function drawProgress(p){
  // Reset eventos de dibujo de este frame
  drawEvents.length = 0;
  // Progreso lineal para evitar aceleración al final
  const e = p;
  let budget = MAX_UNITS_PER_FRAME;

  // Empezar con 1 punto y agregar más progresivamente
  const activeSeeds = Math.max(1, Math.ceil(Math.pow(e, 1.1) * seeds.length)); // Más gradual
  
  // El tamaño del pincel crece más suavemente
  const sizeMultiplier = 0.2 + (1 - Math.exp(-2.8 * e)) * 1.4;
  // Mantener velocidad de trazo constante para no acelerar al final
  const motionScale = 0.9;

  // Trazos principales (solo de semillas activas)
  for (let i=0;i<strokes.length && budget>0;i++){
    const s=strokes[i];
    if (s.seedIndex >= activeSeeds) continue; // Saltar si la semilla de este trazo aún no está activa
    if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){ const factor = 0.35; const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME); budget -= stepStroke(s, allow, sizeMultiplier, motionScale); }
  }
  
  // Gotas (se activan progresivamente)
  const activeDroplets = Math.ceil(e * (droplets.length||0));
  for (let i=0;i<activeDroplets && budget>0;i++){
    const d = droplets[i];
    if (e < d.tStart) continue;
    budget -= stepDroplet(d, e, sizeMultiplier, Math.floor(budget*.25));
  }

  // Espirales (se activan progresivamente)
  const activeSpirals = Math.ceil(e * spirals.length);
  for (let i=0;i<activeSpirals && budget>0;i++){
    const s=spirals[i]; if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){ const factor = 0.2; const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME); budget -= stepSpiral(s, allow, sizeMultiplier); }
  }
  
  // Radiantes (se activan progresivamente)
  const activeRadiants = Math.ceil(e * radiants.length);
  for (let i=0;i<activeRadiants && budget>0;i++){
    const r=radiants[i]; if (e < r.tStart) continue;
    const local = r.tEnd>r.tStart? clamp((e-r.tStart)/(r.tEnd-r.tStart),0,1) : 1;
    const target = Math.floor(r.steps*local); const need = target - r.idx;
    if (need>0){ const factor = 0.15; const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME); budget -= stepRadiant(r, allow, sizeMultiplier); }
  }

  // Pinceladas onduladas sutiles
  const activeWaves = Math.ceil(e * waves.length);
  for (let i=0;i<activeWaves && budget>0;i++){
    const wv = waves[i]; if (e < wv.tStart) continue;
    const local = wv.tEnd>wv.tStart? clamp((e-wv.tStart)/(wv.tEnd-wv.tStart),0,1) : 1;
    const target = Math.floor(wv.steps*local); const need = target - wv.idx;
    if (need>0){ const factor = 0.2; const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME); budget -= stepWave(wv, allow, sizeMultiplier); }
  }
  
  // Conectores (se activan progresivamente)
  const activeConnectors = Math.ceil(e * connectors.length);
  for (let i=0;i<activeConnectors && budget>0;i++){
    const c=connectors[i]; if (e < c.tStart) continue;
    const local = c.tEnd>c.tStart? clamp((e-c.tStart)/(c.tEnd-c.tStart),0,1) : 1;
    const target = Math.floor(c.steps*local); const need = target - c.idx;
    if (need>0){ const factor = 0.10; const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME); budget -= stepConnector(c, allow, sizeMultiplier); }
  }
  
  // Barridos grandes para rellenar, su tamaño también crece para asegurar cobertura total
  for (let i=0;i<sweeps.length && budget>0;i++){
    const s=sweeps[i]; if (e < s.tStart) continue;
    const local = s.tEnd>s.tStart? clamp((e-s.tStart)/(s.tEnd-s.tStart),0,1) : 1;
    const target = Math.floor(s.steps*local); const need = target - s.idx;
    if (need>0){
      const factor = 0.3;
      const allow = Math.min(need, Math.floor(budget*factor), MAX_STEPS_PER_ENTITY_FRAME);
      // Reducir levemente el tamaño de los sweeps al final para evitar manchones grandes
      const sweepSize = sizeMultiplier * (e > 0.95 ? 1.2 : 1.4);
      budget -= stepStroke(s, allow, sweepSize, motionScale);
    } // tamaño y movimiento suavizados
  }
  
  // Wash sutil muy al final (incremental por frame y orgánico)
  if (wash.length && e >= WASH_START){
    const total=wash.length; if (wash._drawn===undefined) wash._drawn=0;
    // Objetivo proporcional al progreso en la fase de wash
    const phase = clamp((e - WASH_START) / (1 - WASH_START), 0, 1);
    const target = Math.floor(total * phase);
    const remaining = target - wash._drawn;
    const perFrame = Math.max(1, Math.min(WASH_CHUNK_BASE, Math.min(remaining, Math.floor(budget*0.06))));
    const end = Math.min(total, wash._drawn + perFrame);
    for (let i=wash._drawn; i<end && budget>0; i++){
      const w=wash[i]; const br = w.b>=0? maskBrushes[w.b] : null;
      if (br) {
        stamp(br, w.x, w.y, w.s * sizeMultiplier, w.a, w.rot);
      } else {
        fillIrregularBlob(w.x, w.y, 22 * sizeMultiplier, makeHarmonics(2), w.a, 26, 0.8, 0.01);
      }
      wash._drawn=i+1; budget-=1;
    }
  }

  // Sellado final incremental y orgánico - MÁS AGRESIVO para cobertura completa
  if (e >= FINAL_SEAL_START && budget > 0 && finalSealing.length){
    if (finalSealing._drawn===undefined) finalSealing._drawn=0;
    const t = clamp((e - FINAL_SEAL_START) / (1 - FINAL_SEAL_START), 0, 1);
    const alpha = FINAL_SEAL_ALPHA_MIN + (FINAL_SEAL_ALPHA_MAX - FINAL_SEAL_ALPHA_MIN) * t;
    // objetivo gradual: completar más agresivamente hacia el final
    const total = finalSealing.length;
    const target = Math.floor(total * Math.min(1, t*1.2)); // Acelerar hacia el final
    const remaining = target - finalSealing._drawn;
    const base = Math.max(2, Math.ceil(FINAL_SEAL_CHUNK_BASE * (1 + t*2))); // Más agresivo
    const perFrame = Math.max(2, Math.min(base, Math.min(remaining, Math.floor(budget*0.08))));
    const end = Math.min(finalSealing.length, finalSealing._drawn + perFrame);
    for (let i = finalSealing._drawn; i < end && budget > 0; i++){
      const pt = finalSealing[i];
      const b = (pt.b>=0 && maskBrushes.length) ? maskBrushes[pt.b] : null;
      if (b){
        // micro-trazos cortos para evitar parches notables
        const angle = rand(0, Math.PI*2);
        const len = 18 * (0.9 + 0.4*(1-t));
        const steps = 3 + Math.floor(rand(0,2));
        for (let k=0;k<steps;k++){
          const u = steps===1? 0.5 : k/(steps-1);
          const x = pt.x + Math.cos(angle)*(u-0.5)*len;
          const y = pt.y + Math.sin(angle)*(u-0.5)*len;
          const s = 1.8 * (0.9 + u*0.3);
          stamp(b, x, y, s, alpha*(0.8 + 0.4*u), angle + gauss(0,0.06));
        }
      } else {
        fillIrregularBlob(pt.x, pt.y, 32 * sizeMultiplier, makeHarmonics(2), alpha, 26, 0.9, 0.01);
      }
      finalSealing._drawn = i + 1; budget -= 1;
    }
  }

  // Cobertura final adicional para asegurar 100% de revelado
  if (e >= 0.95 && budget > 0) {
    // Sellado extra en áreas problemáticas comunes
    const extraSeals = [
      {x: size.w*0.1, y: size.h*0.1}, {x: size.w*0.9, y: size.h*0.1},
      {x: size.w*0.1, y: size.h*0.9}, {x: size.w*0.9, y: size.h*0.9},
      {x: size.w*0.5, y: size.h*0.1}, {x: size.w*0.5, y: size.h*0.9},
      {x: size.w*0.1, y: size.h*0.5}, {x: size.w*0.9, y: size.h*0.5}
    ];
    const extraAlpha = (e - 0.95) * 0.4; // Gradual desde 95%
    for (let i=0; i<extraSeals.length && budget>0; i++) {
      const pt = extraSeals[i];
      const b = maskBrushes.length ? maskBrushes[i % maskBrushes.length] : null;
      if (b) {
        stamp(b, pt.x, pt.y, 2.5, extraAlpha, rand(0, Math.PI*2));
      } else {
        fillIrregularBlob(pt.x, pt.y, 40, makeHarmonics(2), extraAlpha, 30, 1.0, 0.01);
      }
      budget--;
    }
  }
}

function render(){
  const currentBG = getCurrentPattern();
  
  if (!currentBG) {
    console.warn('⚠️ No hay patrón disponible para renderizar');
    return;
  }
  
  // Solo limpiar el canvas en la primera animación
  if (isFirstAnimation) {
    ctx.clearRect(0,0,size.w,size.h);
    
    // Dibujar imagen de fondo solo en la primera vez
    if (layout.dw && layout.dh) ctx.drawImage(currentBG, layout.dx, layout.dy, layout.dw, layout.dh);
    
    // Aplicar máscara del efecto original
    ctx.globalCompositeOperation='destination-in';
    ctx.drawImage(maskCanvas, 0,0, maskCanvas.width, maskCanvas.height, 0,0, size.w, size.h);
    ctx.globalCompositeOperation='destination-over'; 
    ctx.fillStyle='#F5DDC7'; 
    ctx.fillRect(0,0,size.w,size.h);
  } else {
    // Para animaciones posteriores: DIBUJAR DIRECTAMENTE SOBRE LA IMAGEN ANTERIOR
    // NO hacer clearRect() - esto permite que se dibuje sobre la imagen existente
    
    // Crear un canvas temporal para la nueva imagen con máscara
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size.w;
    tempCanvas.height = size.h;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Dibujar la imagen de fondo en el canvas temporal
    if (layout.dw && layout.dh) tempCtx.drawImage(currentBG, layout.dx, layout.dy, layout.dw, layout.dh);
    
    // Aplicar máscara al canvas temporal
    tempCtx.globalCompositeOperation='destination-in';
    tempCtx.drawImage(maskCanvas, 0,0, maskCanvas.width, maskCanvas.height, 0,0, size.w, size.h);
    
    // Dibujar el canvas temporal SOBRE el canvas principal (source-over = dibuja encima)
    ctx.globalCompositeOperation='source-over';
    ctx.drawImage(tempCanvas, 0, 0);
  }
  
  // Restaurar modo de composición normal
  ctx.globalCompositeOperation='source-over';
}
function loop(ts){
  // Si la animación ya terminó, no procesar más frames
  if (animationFinished) {
    console.log('Animación terminada - deteniendo loop para optimizar rendimiento');
    return;
  }
  
  if (!startedAt) startedAt=ts;
  const pRaw=(ts-startedAt)/DURATION_MS;
  const p=clamp(pRaw,0,1);
  drawProgress(p);
  render();
  
  // Continuar hasta que esté 100% completo Y todos los elementos hayan terminado
  const unfinished = (finalSealing && finalSealing.length && finalSealing._drawn < finalSealing.length)
                   || (wash && wash.length && (wash._drawn||0) < wash.length)
                   || p < 1;
  
  if (unfinished) {
    rafId=requestAnimationFrame(loop);
  } else {
    // Animación completada - hacer render final y marcar como terminada
    animationFinished = true;
    console.log('Animación completada - realizando render final');
    
    // Render final para asegurar que todo esté visible
    render();
    
    // Cancelar cualquier frame pendiente
    cancelAnimationFrame(rafId);
    rafId = 0;
    
    // Marcar que ya no es la primera animación para que la siguiente se dibuje por encima
    isFirstAnimation = false;
    
    // NO programar automáticamente la siguiente animación
    // Ahora esperará comando desde control
    console.log('🎨 Animación completada. Esperando comando desde control para nueva animación...');
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
  
  resize(); 
  maskCtx.clearRect(0,0,size.w,size.h); 
  
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
  
  // Iniciar monitor FPS por separado
  fpsMonitorRafId=requestAnimationFrame(fpsMonitorLoop); 
}

// NUEVA FUNCIÓN: Colorear ENCIMA del wallpaper existente sin resetear
function colorOnTop(){ 
  cancelAnimationFrame(rafId); 
  cancelAnimationFrame(fpsMonitorRafId);
  
  // NO resetear estado de animación - mantener lo que ya está dibujado
  animationFinished = false;
  
  // NO hacer resize() ni limpiar el canvas principal - MANTENER wallpaper dibujado
  // Solo limpiar la máscara para nueva animación encima
  maskCtx.clearRect(0,0,size.w,size.h); 
  
  console.log('🎨 COLOREANDO ENCIMA del wallpaper existente - 15 SEGUNDOS...');
  
  // GENERAR ELEMENTOS BALANCEADOS PARA 15 SEGUNDOS
  kickstartMask();
  makeSeeds(15); // semillas balanceadas para 15 segundos
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
  
  // Iniciar monitor FPS por separado
  fpsMonitorRafId=requestAnimationFrame(fpsMonitorLoop); 
}

function startNewAnimation(){ 
  cancelAnimationFrame(rafId); 
  
  // NO cambiar al siguiente patrón automáticamente - ya se cambió en loadNewPatternAndAnimate
  
  // Recalcular layout para el nuevo patrón
  const currentBG = getCurrentPattern();
  if (currentBG.naturalWidth && currentBG.naturalHeight){
    const s = Math.max(size.w/currentBG.naturalWidth, size.h/currentBG.naturalHeight);
    const dw = Math.ceil(currentBG.naturalWidth*s), dh = Math.ceil(currentBG.naturalHeight*s);
    layout.dx = Math.floor((size.w-dw)/2); layout.dy = Math.floor((size.h-dh)/2); layout.dw = dw; layout.dh = dh;
  }
  
  // Resetear estado de animación
  animationFinished = false;
  
  // NO hacer resize() ni limpiar el canvas principal - solo limpiar la máscara
  maskCtx.clearRect(0,0,size.w,size.h); 
  
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
  maskCtx.clearRect(0,0,size.w,size.h); 
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
    // Cargar wallpaper.jpg desde el servidor
    console.log('🖼️ Cargando wallpaper.jpg...');
    const patternsLoaded = await loadLatestPatterns();
    
    if (!patternsLoaded || patterns.length === 0) {
      // Fallback: intentar cargar directamente wallpaper.jpg
      console.log('📁 loadLatestPatterns falló, intentando cargar wallpaper.jpg directamente...');
      
      try {
        console.log(`🔄 Intentando cargar wallpaper.jpg directamente`);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = () => {
            console.log(`✅ wallpaper.jpg cargado exitosamente (fallback)`);
            resolve();
          };
          img.onerror = (err) => {
            console.error(`❌ Error cargando wallpaper.jpg (fallback):`, err);
            reject(err);
          };
          img.src = `patterns/wallpaper.jpg?t=${Date.now()}`;
        });
        
        patterns.push({
          src: `patterns/wallpaper.jpg`,
          image: img,
          filename: 'wallpaper.jpg'
        });
        
        console.log(`✅ Patrón fallback cargado: wallpaper.jpg`);
      } catch (error) {
        console.error(`❌ Error cargando wallpaper.jpg directamente:`, error);
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
    
    // SOLO iniciar animación automáticamente la PRIMERA VEZ si hay wallpaper.jpg
    if (patterns.length > 0 && !hasInitialAnimationStarted) {
      console.log('🚀 PRIMERA CARGA - INICIANDO ANIMACIÓN AUTOMÁTICA CON WALLPAPER.JPG');
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
  console.log('🔄 Página completamente cargada - verificando patrones más recientes...');
  try {
    await loadLatestPatterns();
    console.log(`✅ Patrones actualizados. Usando: ${patterns[currentPatternIndex]?.src || 'ninguno'}`);
  } catch (error) {
    console.error('❌ Error al recargar patrones:', error);
  }
});