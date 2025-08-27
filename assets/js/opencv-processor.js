/**
 * OPENCV PROCESSOR
 * Funciones específicas para procesamiento de imágenes con OpenCV.js
 * Maneja detección de rectángulos, corrección de perspectiva y procesamiento automático.
 */

// ==============================
// VARIABLES Y CONFIGURACIÓN OPENCV
// ==============================

let opencvReady = false;
let currentImage = null;
let originalImageData = null;

// ==============================
// INICIALIZACIÓN Y CARGA DE OPENCV
// ==============================

function updateOpenCVStatus(message, type = 'normal') {
    const statusDiv = document.getElementById('opencvStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `opencv-status ${type}`;
    }
}

function onOpenCvReady() {
    console.log('OpenCV.js is ready!');
    opencvReady = true;
    updateOpenCVStatus('✅ OpenCV.js cargado correctamente', 'ready');
    
    const manualProcessButton = document.getElementById('manualProcessButton');
    if (manualProcessButton) manualProcessButton.disabled = false;
    
    // Actualizar status inicial
    updateProcessStatus('🎹 OpenCV listo. Presiona "1" para proceso automático', 'success');
}

function loadOpenCV() {
    updateOpenCVStatus('🔄 Cargando OpenCV.js...', 'normal');
    
    const cdnUrls = [
        'https://docs.opencv.org/4.8.0/opencv.js',
        'https://cdn.jsdelivr.net/npm/opencv.js@4.8.0/opencv.js',
        'https://unpkg.com/opencv.js@4.8.0/opencv.js'
    ];
    
    let currentCdnIndex = 0;
    
    function tryLoadFromCdn(index) {
        if (index >= cdnUrls.length) {
            updateOpenCVStatus('❌ Error: No se pudo cargar OpenCV desde ningún CDN', 'error');
            return;
        }
        
        console.log(`Trying CDN ${index + 1}/${cdnUrls.length}: ${cdnUrls[index]}`);
        updateOpenCVStatus(`🔄 Probando CDN ${index + 1}/${cdnUrls.length}...`, 'normal');
        
        const script = document.createElement('script');
        script.src = cdnUrls[index];
        
        script.onload = function() {
            console.log(`OpenCV loaded successfully from CDN ${index + 1}`);
            updateOpenCVStatus('✅ OpenCV.js cargado correctamente', 'ready');
            opencvReady = true;
            
            const processButton = document.getElementById('processButton');
            const autoProcessButton = document.getElementById('autoProcessButton');
            
            if (processButton) processButton.disabled = false;
            if (autoProcessButton) autoProcessButton.disabled = false;
        };
        
        script.onerror = function() {
            console.log(`Failed to load from CDN ${index + 1}, trying next...`);
            tryLoadFromCdn(index + 1);
        };
        
        document.head.appendChild(script);
    }
    
    tryLoadFromCdn(0);
}

// ==============================
// MANEJO DE ARCHIVOS E IMÁGENES
// ==============================

function setupImageHandlers() {
    // La carga de imágenes ahora es automática desde /captura
    // Solo configuramos los elementos básicos si existen
    console.log('🖼️ Configuración de imágenes: Modo automático desde /captura activado');
    
    // Habilitar botón manual si OpenCV está listo
    const manualProcessButton = document.getElementById('manualProcessButton');
    if (manualProcessButton && opencvReady) {
        manualProcessButton.disabled = false;
    }
}

function loadImageForProcessing(imageSrc) {
    const img = new Image();
    img.onload = function() {
        currentImage = img;
        originalImageData = imageSrc;
        
        // Mostrar preview
        const previewImg = document.getElementById('imagePreview');
        if (previewImg) {
            previewImg.src = imageSrc;
            previewImg.style.display = 'block';
        }
        
        updateOpenCVStatus('✅ Imagen cargada correctamente', 'ready');
        console.log(`Imagen cargada: ${img.width}x${img.height}`);
    };
    img.src = imageSrc;
}

// ==============================
// DETECCIÓN DE RECTÁNGULOS
// ==============================

function detectWhiteRectangleSimple() {
    if (!opencvReady) {
        updateOpenCVStatus('❌ OpenCV aún no está listo', 'error');
        return;
    }
    
    if (!currentImage) {
        updateOpenCVStatus('❌ Por favor, carga una imagen primero', 'error');
        return;
    }
    
    try {
        updateOpenCVStatus('🔄 Procesando imagen...', 'normal');
        console.log('Iniciando detección de rectángulo con método robusto...');
        
        let src = cv.imread(currentImage);
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edges = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        
        console.log(`Imagen cargada: ${src.cols}x${src.rows}`);
        
        // PASO 1: PRE-PROCESAMIENTO
        console.log('Paso 1: Pre-procesamiento...');
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blurred, edges, 75, 200);
        
        // Mostrar bordes para debug
        const detectionCanvas = document.getElementById('detectionCanvas');
        if (detectionCanvas) {
            cv.imshow(detectionCanvas, edges);
        }
        
        // PASO 2: DETECCIÓN DE CONTORNOS
        console.log('Paso 2: Detectando contornos...');
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        console.log(`Encontrados ${contours.size()} contornos`);
        
        // PASO 3: ENCONTRAR EL RECTÁNGULO MÁS GRANDE
        console.log('Paso 3: Buscando el rectángulo más grande...');
        let maxArea = 0;
        let biggestContour = null;
        
        for (let i = 0; i < contours.size(); ++i) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour, false);
            
            if (area > maxArea && area > 1000) {
                if (biggestContour) biggestContour.delete();
                biggestContour = contour.clone();
                maxArea = area;
            }
        }
        
        if (biggestContour && maxArea > 1000) {
            console.log(`Rectángulo detectado con área: ${maxArea}`);
            
            // Dibujar resultado
            drawDetectionResult(src, biggestContour);
            
            // Aplicar corrección de perspectiva
            const correctedImage = applyPerspectiveCorrection(src, biggestContour);
            if (correctedImage) {
                drawCorrectedResult(correctedImage);
                updateOpenCVStatus('✅ Corrección de perspectiva completada', 'ready');
                correctedImage.delete();
            }
        } else {
            updateOpenCVStatus('❌ No se encontró un rectángulo válido', 'error');
        }
        
        // Cleanup
        cleanupMats([src, gray, blurred, edges, contours, hierarchy]);
        if (biggestContour) biggestContour.delete();
        
    } catch (error) {
        console.error('Error durante el procesamiento:', error);
        updateOpenCVStatus('❌ Error durante el procesamiento: ' + error.message, 'error');
    }
}

// ==============================
// CORRECCIÓN DE PERSPECTIVA
// ==============================

function applyPerspectiveCorrection(mat, contour) {
    try {
        // Simplificar contorno a 4 puntos
        let epsilon = 0.02 * cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilon, true);
        
        if (approx.rows !== 4) {
            console.log(`Contorno simplificado tiene ${approx.rows} puntos, buscando mejor aproximación...`);
            
            // Intentar con diferentes valores de epsilon
            for (let eps = 0.01; eps <= 0.05; eps += 0.005) {
                approx.delete();
                approx = new cv.Mat();
                epsilon = eps * cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, epsilon, true);
                
                if (approx.rows === 4) {
                    console.log(`Encontrados 4 puntos con epsilon: ${eps}`);
                    break;
                }
            }
            
            if (approx.rows !== 4) {
                approx.delete();
                return null;
            }
        }
        
        // Extraer y ordenar esquinas
        const corners = [];
        for (let i = 0; i < approx.rows; i++) {
            corners.push([approx.data32S[i * 2], approx.data32S[i * 2 + 1]]);
        }
        
        const sortedCorners = sortCornerPointsImproved(corners);
        console.log('Esquinas ordenadas:', sortedCorners);
        
        // Crear matrices de transformación
        const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
            sortedCorners[0][0], sortedCorners[0][1],  // top-left
            sortedCorners[1][0], sortedCorners[1][1],  // top-right
            sortedCorners[2][0], sortedCorners[2][1],  // bottom-right
            sortedCorners[3][0], sortedCorners[3][1]   // bottom-left
        ]);
        
        // Calcular dimensiones del rectángulo corregido
        const width = Math.max(
            distance(sortedCorners[0], sortedCorners[1]),
            distance(sortedCorners[2], sortedCorners[3])
        );
        const height = Math.max(
            distance(sortedCorners[1], sortedCorners[2]),
            distance(sortedCorners[3], sortedCorners[0])
        );
        
        // CROP MEJORADO: Reducir 10px más en cada lado para eliminar mejor los bordes negros
        const cropInward = 15; // Aumentar crop de 10px a 15px para eliminar mejor los bordes
        const croppedWidth = Math.max(50, width - (cropInward * 2));
        const croppedHeight = Math.max(50, height - (cropInward * 2));
        
        const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
            cropInward, cropInward, 
            croppedWidth + cropInward, cropInward, 
            croppedWidth + cropInward, croppedHeight + cropInward, 
            cropInward, croppedHeight + cropInward
        ]);
        
        // Aplicar transformación de perspectiva con el nuevo tamaño cropeado
        const transformMatrix = cv.getPerspectiveTransform(srcCorners, dstCorners);
        let warped = new cv.Mat();
        cv.warpPerspective(mat, warped, transformMatrix, new cv.Size(croppedWidth + (cropInward * 2), croppedHeight + (cropInward * 2)));
        
        // Ahora hacer el crop final para eliminar los bordes del crop interno
        let finalCropped = new cv.Mat();
        let cropRect = new cv.Rect(cropInward, cropInward, croppedWidth, croppedHeight);
        finalCropped = warped.roi(cropRect);
        let result = finalCropped.clone();
        
        // Cleanup
        approx.delete();
        srcCorners.delete();
        dstCorners.delete();
        transformMatrix.delete();
        warped.delete();
        finalCropped.delete();
        
        console.log(`Imagen corregida y cropeada: ${croppedWidth}x${croppedHeight} (crop: ${cropInward}px)`);
        return result;
        
    } catch (error) {
        console.error('Error en corrección de perspectiva:', error);
        return null;
    }
}

// ==============================
// FUNCIONES AUXILIARES
// ==============================

function sortCornerPointsImproved(points) {
    if (points.length !== 4) {
        throw new Error('Se requieren exactamente 4 puntos');
    }
    
    // Calcular punto central
    const centerX = points.reduce((sum, p) => sum + p[0], 0) / 4;
    const centerY = points.reduce((sum, p) => sum + p[1], 0) / 4;
    
    console.log(`Centro: (${centerX}, ${centerY})`);
    
    // Clasificar cada punto por su posición relativa al centro
    const classified = points.map(point => ({
        point: point,
        isLeft: point[0] < centerX,
        isTop: point[1] < centerY
    }));
    
    // Encontrar cada esquina
    const topLeft = classified.find(p => p.isLeft && p.isTop)?.point;
    const topRight = classified.find(p => !p.isLeft && p.isTop)?.point;
    const bottomLeft = classified.find(p => p.isLeft && !p.isTop)?.point;
    const bottomRight = classified.find(p => !p.isLeft && !p.isTop)?.point;
    
    if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
        throw new Error('No se pudieron identificar todas las esquinas');
    }
    
    return [topLeft, topRight, bottomRight, bottomLeft];
}

function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
}

function drawDetectionResult(originalMat, contour) {
    const detectionCanvas = document.getElementById('detectionCanvas');
    if (!detectionCanvas) return;
    
    const displayMat = originalMat.clone();
    const contours = new cv.MatVector();
    contours.push_back(contour);
    cv.drawContours(displayMat, contours, -1, [0, 255, 0, 255], 3);
    
    cv.imshow(detectionCanvas, displayMat);
    
    displayMat.delete();
    contours.delete();
}

function drawCorrectedResult(correctedMat) {
    const correctedCanvas = document.getElementById('correctedCanvas');
    if (!correctedCanvas) return;
    
    // Aplicar el mismo procesamiento completo que se usará al guardar
    const finalPreview = createFinalPreview(correctedMat);
    
    // Mostrar el resultado final en el canvas
    const ctx = correctedCanvas.getContext('2d');
    correctedCanvas.width = finalPreview.width;
    correctedCanvas.height = finalPreview.height;
    ctx.drawImage(finalPreview, 0, 0);
}

// Nueva función que replica EXACTAMENTE el procesamiento que se hace al guardar
function createFinalPreview(correctedMat) {
    try {
        // PASO 1: Aplicar mejoras de imagen (igual que al guardar)
        let processed = applyFinalImageProcessing(correctedMat);
        
        // PASO 2: Convertir a canvas con el mismo procesamiento que al guardar
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = processed.cols;
        tempCanvas.height = processed.rows;
        const tctx = tempCanvas.getContext('2d');
        
        // Convertir Mat a canvas
        cv.imshow(tempCanvas, processed);
        
        // PASO 3: Aplicar el mismo procesamiento de píxeles que al guardar
        const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        // MISMO PROCESAMIENTO MEJORADO: Eliminar bordes negros y aumentar saturación
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];
            
            // Calcular brillo del píxel
            const brightness = (r + g + b) / 3;
            
            // Si el píxel es transparente O muy oscuro (borde negro), convertir a blanco puro
            if (alpha === 0 || brightness < 70) { // MÁS AGRESIVO para blanco puro
                data[i] = 255;     // R = blanco
                data[i + 1] = 255; // G = blanco
                data[i + 2] = 255; // B = blanco
                data[i + 3] = 255; // A = opaco
            } else {
                // Para píxeles con color, aumentar ligeramente la saturación
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max === 0 ? 0 : (max - min) / max;
                
                if (saturation > 0.1) { // Solo si tiene algo de color
                    // Aumentar saturación manteniendo el tono
                    const factor = 1.15; // +15% saturación adicional
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    
                    data[i] = Math.min(255, Math.max(0, gray + factor * (r - gray)));
                    data[i + 1] = Math.min(255, Math.max(0, gray + factor * (g - gray)));
                    data[i + 2] = Math.min(255, Math.max(0, gray + factor * (b - gray)));
                }
            }
        }
        
        // Aplicar los cambios
        tctx.putImageData(imageData, 0, 0);
        
        // Cleanup
        processed.delete();
        
        return tempCanvas;
        
    } catch (error) {
        console.error('Error creando preview final:', error);
        // En caso de error, crear un canvas simple
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = correctedMat.cols;
        fallbackCanvas.height = correctedMat.rows;
        cv.imshow(fallbackCanvas, correctedMat);
        return fallbackCanvas;
    }
}

// Nueva función para aplicar el procesamiento final que se mostrará en el preview
function applyFinalImageProcessing(inputMat) {
    try {
        // Crear una copia para no modificar el original
        let processed = inputMat.clone();
        
        // NUEVO: Crear máscara para detectar bordes negros/oscuros y reemplazarlos por blanco
        let gray = new cv.Mat();
        cv.cvtColor(processed, gray, cv.COLOR_RGBA2GRAY);
        
        // Crear máscara para píxeles muy oscuros Y FONDO BEIGE - THRESHOLD AJUSTADO
        let darkMask = new cv.Mat();
        cv.threshold(gray, darkMask, 85, 255, cv.THRESH_BINARY_INV); // Más agresivo: de 75 a 85 para incluir más grises
        
        // Aplicar fondo blanco puro a píxeles oscuros y beige
        for (let y = 0; y < processed.rows; y++) {
            for (let x = 0; x < processed.cols; x++) {
                const maskValue = darkMask.ucharPtr(y, x)[0];
                if (maskValue > 0) { // Si es un píxel oscuro o beige
                    const pixelPtr = processed.ucharPtr(y, x);
                    pixelPtr[0] = 255; // R = blanco puro
                    pixelPtr[1] = 255; // G = blanco puro
                    pixelPtr[2] = 255; // B = blanco puro
                    pixelPtr[3] = 255; // A = opaco
                }
            }
        }
        
        // PROCESAMIENTO SIMPLIFICADO: Solo realce mínimo de contraste
        processed.convertTo(processed, -1, 1.15, 15); // Aumentar brillo de +10 a +15 para esquinas más blancas
        
        // PASO FINAL: Limpieza AGRESIVA de bordes negros y preservación de verdes
        for (let y = 0; y < processed.rows; y++) {
            for (let x = 0; x < processed.cols; x++) {
                const pixelPtr = processed.ucharPtr(y, x);
                const r = pixelPtr[0];
                const g = pixelPtr[1];
                const b = pixelPtr[2];
                const brightness = (r + g + b) / 3;
                
                // Detectar fondo beige RGB(252,240,239)
                const isBeige = (r > 240 && g > 230 && b > 230 && r > g && r > b);
                
                // DETECCIÓN MÁS AGRESIVA de bordes negros y esquinas grises
                const isBlackBorder = (
                    brightness < 65 ||  // Más agresivo: de 50 a 65
                    (r < 75 && g < 75 && b < 75) ||  // Expandir rango: de 60 a 75
                    (Math.max(r, g, b) < 85) ||  // Más agresivo: de 70 a 85
                    // NUEVO: Detectar específicamente bordes de la imagen
                    (x < 3 || x >= processed.cols - 3 || y < 3 || y >= processed.rows - 3) && brightness < 200
                );
                
                if (isBlackBorder || isBeige) {
                    pixelPtr[0] = 255; // R = blanco puro
                    pixelPtr[1] = 255; // G = blanco puro  
                    pixelPtr[2] = 255; // B = blanco puro
                    pixelPtr[3] = 255; // A = opaco
                } else {
                    // PRESERVAR VERDES específicamente
                    if (g > r && g > b && g - Math.max(r, b) > 12 && brightness > 50) {
                        // Potenciar verdes +25%
                        pixelPtr[1] = Math.min(255, g * 1.25);
                    }
                }
            }
        }
        
        // PASO ADICIONAL: Filtro radial para blanquear bordes sin afectar el centro
        const centerX = processed.cols / 2;
        const centerY = processed.rows / 2;
        const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
        const borderThreshold = 0.70; // Solo afectar el 30% exterior (70%-100% del radio)
        
        for (let y = 0; y < processed.rows; y++) {
            for (let x = 0; x < processed.cols; x++) {
                // Calcular distancia desde el centro (normalizada 0-1)
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const normalizedDistance = distance / maxRadius;
                
                // Solo procesar píxeles en el borde exterior (70%-100% del radio)
                if (normalizedDistance > borderThreshold) {
                    const pixelPtr = processed.ucharPtr(y, x);
                    const r = pixelPtr[0];
                    const g = pixelPtr[1];
                    const b = pixelPtr[2];
                    const brightness = (r + g + b) / 3;
                    
                    // Calcular factor de blanqueado radial (más fuerte hacia los bordes)
                    const borderFactor = (normalizedDistance - borderThreshold) / (1 - borderThreshold);
                    const whiteningFactor = borderFactor * borderFactor; // Cuadrático para transición suave
                    
                    // Detectar halos azulados/negros en los bordes
                    const isHalo = (
                        brightness < 120 || // Píxeles no suficientemente blancos
                        (b > r && b > g) || // Predominio azul (halo azulado)
                        (r < 100 && g < 100 && b < 100) // Píxeles oscuros
                    );
                    
                    if (isHalo) {
                        // Blanquear completamente el halo
                        pixelPtr[0] = 255;
                        pixelPtr[1] = 255;
                        pixelPtr[2] = 255;
                        pixelPtr[3] = 255;
                    } else {
                        // Para píxeles no-halo, aplicar blanqueado gradual radial
                        const targetWhite = 255;
                        pixelPtr[0] = Math.round(r + (targetWhite - r) * whiteningFactor * 0.4);
                        pixelPtr[1] = Math.round(g + (targetWhite - g) * whiteningFactor * 0.4);
                        pixelPtr[2] = Math.round(b + (targetWhite - b) * whiteningFactor * 0.4);
                    }
                }
            }
        }
        
        // PASO FINAL: FORZADO ULTRA AGRESIVO - ESQUINAS Y BORDES 100% BLANCOS
        const edgeBlanking = 25; // 25px de borde FORZADO a blanco absoluto
        const cornerBlanking = 80; // AUMENTAR a 80px para esquinas (era 50px)
        
        for (let y = 0; y < processed.rows; y++) {
            for (let x = 0; x < processed.cols; x++) {
                // Distancias desde cada borde
                const distFromLeft = x;
                const distFromRight = processed.cols - 1 - x;
                const distFromTop = y;
                const distFromBottom = processed.rows - 1 - y;
                
                // Distancia mínima desde cualquier borde
                const minDistFromEdge = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);
                
                // DETECCIÓN MÁS AGRESIVA DE ESQUINAS con distancia radial
                let isInCorner = false;
                
                // Esquina superior izquierda
                if (distFromLeft < cornerBlanking && distFromTop < cornerBlanking) {
                    const cornerDist = Math.sqrt(distFromLeft * distFromLeft + distFromTop * distFromTop);
                    if (cornerDist < cornerBlanking) isInCorner = true;
                }
                // Esquina superior derecha  
                if (distFromRight < cornerBlanking && distFromTop < cornerBlanking) {
                    const cornerDist = Math.sqrt(distFromRight * distFromRight + distFromTop * distFromTop);
                    if (cornerDist < cornerBlanking) isInCorner = true;
                }
                // Esquina inferior izquierda
                if (distFromLeft < cornerBlanking && distFromBottom < cornerBlanking) {
                    const cornerDist = Math.sqrt(distFromLeft * distFromLeft + distFromBottom * distFromBottom);
                    if (cornerDist < cornerBlanking) isInCorner = true;
                }
                // Esquina inferior derecha
                if (distFromRight < cornerBlanking && distFromBottom < cornerBlanking) {
                    const cornerDist = Math.sqrt(distFromRight * distFromRight + distFromBottom * distFromBottom);
                    if (cornerDist < cornerBlanking) isInCorner = true;
                }
                
                // FORZAR BLANCO ABSOLUTO sin excepciones
                const needsForcedWhite = isInCorner || minDistFromEdge < edgeBlanking;
                
                if (needsForcedWhite) {
                    const pixelPtr = processed.ucharPtr(y, x);
                    
                    // BLANCO ABSOLUTO - SIN EXCEPCIONES
                    pixelPtr[0] = 255; // R = BLANCO TOTAL
                    pixelPtr[1] = 255; // G = BLANCO TOTAL
                    pixelPtr[2] = 255; // B = BLANCO TOTAL
                    pixelPtr[3] = 255; // A = OPACO TOTAL
                }
            }
        }
        
        // PASO EXTRA: Segunda pasada ESPECÍFICA para esquinas con área aún mayor
        const megaCornerSize = 100; // 100px para eliminar cualquier halo residual
        
        for (let y = 0; y < processed.rows; y++) {
            for (let x = 0; x < processed.cols; x++) {
                const distFromLeft = x;
                const distFromRight = processed.cols - 1 - x;
                const distFromTop = y;
                const distFromBottom = processed.rows - 1 - y;
                
                // Detectar si está en zona de mega-esquina
                const isMegaCorner = (
                    (distFromLeft < megaCornerSize && distFromTop < megaCornerSize) ||      // Superior izquierda
                    (distFromRight < megaCornerSize && distFromTop < megaCornerSize) ||     // Superior derecha  
                    (distFromLeft < megaCornerSize && distFromBottom < megaCornerSize) ||   // Inferior izquierda
                    (distFromRight < megaCornerSize && distFromBottom < megaCornerSize)     // Inferior derecha
                );
                
                if (isMegaCorner) {
                    const pixelPtr = processed.ucharPtr(y, x);
                    const r = pixelPtr[0];
                    const g = pixelPtr[1]; 
                    const b = pixelPtr[2];
                    const brightness = (r + g + b) / 3;
                    
                    // Si NO es suficientemente blanco, forzar a blanco
                    if (brightness < 240) { // Cualquier cosa menos que casi-blanco
                        pixelPtr[0] = 255;
                        pixelPtr[1] = 255;
                        pixelPtr[2] = 255;
                        pixelPtr[3] = 255;
                    }
                }
            }
        }
        
        // Cleanup
        gray.delete();
        darkMask.delete();
        
        return processed;
        
    } catch (error) {
        console.error('Error en procesamiento final:', error);
        return inputMat.clone(); // Devolver copia sin procesar en caso de error
    }
}

function cleanupMats(mats) {
    mats.forEach(mat => {
        if (mat && typeof mat.delete === 'function') {
            mat.delete();
        }
    });
}

// ==============================
// PROCESAMIENTO AUTOMÁTICO COMPLETO
// ==============================

async function autoProcessAndApply() {
    try {
        updateOpenCVStatus('🔄 Paso 1/4: Detectando rectángulo...', 'normal');
        
        const processedImage = await detectAndProcessAutomatically();
        
        if (!processedImage) {
            updateOpenCVStatus('❌ No se pudo detectar/procesar el rectángulo automáticamente', 'error');
            return;
        }
        
        updateOpenCVStatus('🔄 Paso 2/4: Procesando imagen con preservación de colores...', 'normal');
        
        // PASO 2: Aplicar el mismo procesamiento que se muestra en el preview
        let finalProcessed = applyFinalImageProcessing(processedImage);
        
        // PASO 3: Convertir a canvas con mejor preservación de colores
        if (!finalProcessed || finalProcessed.cols === 0 || finalProcessed.rows === 0) {
            updateOpenCVStatus('❌ Error: Imagen procesada inválida', 'error');
            return;
        }
        
        // Crear canvas temporal con el tamaño correcto
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = finalProcessed.cols;
        tempCanvas.height = finalProcessed.rows;
        const tctx = tempCanvas.getContext('2d');
        
        // Mostrar la imagen procesada en el canvas de corrección (preview exacto usando la misma función)
        const previewCanvas = createFinalPreview(processedImage);
        const correctedCanvas = document.getElementById('correctedCanvas');
        if (correctedCanvas) {
            const ctx = correctedCanvas.getContext('2d');
            correctedCanvas.width = previewCanvas.width;
            correctedCanvas.height = previewCanvas.height;
            ctx.drawImage(previewCanvas, 0, 0);
        }
        
        // Convertir la imagen procesada final a blob
        cv.imshow(tempCanvas, finalProcessed);
        
        // Aplicar los cambios y guardar directamente
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png', 1.0));
        
        updateOpenCVStatus('🔄 Paso 3/4: Guardando en /processed...', 'normal');
        
        const savedFilename = await saveProcessedImage(blob);
        if (!savedFilename) {
            updateOpenCVStatus('❌ Error al guardar la imagen procesada', 'error');
            return;
        }
        
        updateOpenCVStatus('🔄 Paso 4/4: Aplicando como nueva imagen del patrón...', 'normal');
        
        await applyAsNewPatternImage(savedFilename);
        
        updateOpenCVStatus('✅ ¡PROCESO AUTOMÁTICO COMPLETADO! Imagen aplicada al patrón.', 'ready');
        
        // Cleanup de las matrices
        processedImage.delete();
        finalProcessed.delete();
        
    } catch (error) {
        console.error('Error en proceso automático:', error);
        updateOpenCVStatus('❌ Error en proceso automático: ' + error.message, 'error');
    }
}

async function detectAndProcessAutomatically() {
    // Similar a detectWhiteRectangleSimple pero sin UI
    try {
        let src = cv.imread(currentImage);
        let gray = new cv.Mat();
        let blurred = new cv.Mat();
        let edges = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        
        console.log(`AUTO: Imagen cargada: ${src.cols}x${src.rows}`);
        
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blurred, edges, 75, 200);
        
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        console.log(`AUTO: Encontrados ${contours.size()} contornos`);
        
        let maxArea = 0;
        let biggestContour = null;
        
        for (let i = 0; i < contours.size(); ++i) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour, false);
            
            if (area > maxArea && area > 1000) {
                if (biggestContour) biggestContour.delete();
                biggestContour = contour.clone();
                maxArea = area;
            }
        }
        
        if (!biggestContour || maxArea <= 1000) {
            console.log('AUTO: No se encontró rectángulo válido');
            cleanupMats([src, gray, blurred, edges, contours, hierarchy]);
            return null;
        }
        
        console.log('AUTO: Aplicando corrección de perspectiva...');
        
        const correctedImage = applyPerspectiveCorrection(src, biggestContour);
        if (correctedImage) {
            drawCorrectedResult(correctedImage);
        }
        
        cleanupMats([src, gray, blurred, edges, contours, hierarchy]);
        if (biggestContour) biggestContour.delete();
        
        console.log('AUTO: ✓ Detección y procesamiento completados');
        return correctedImage;
        
    } catch (error) {
        console.error('Error en detección automática:', error);
        return null;
    }
}

// ==============================
// COMUNICACIÓN CON SERVIDOR
// FLUJO COMPLETO DE PROCESAMIENTO:
// 1. OpenCV procesa imagen desde /captura → genera canvas
// 2. saveProcessedImage() → guarda canvas como processed/processed.png (temporal)
// 3. applyAsNewPatternImage() → server genera JPG final en /patterns
// 4. brush-reveal.html se actualiza con último JPG de /patterns
// 5. screen.html usa processed/processed.png para vista en vivo
// ==============================

async function saveProcessedImage(blob) {
    try {
        // Don't compress for PNG to preserve quality and transparency
        const reader = new FileReader();
        const imageDataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        
        return new Promise((resolve, reject) => {
            if (!window.socket) {
                reject(new Error('Socket no disponible'));
                return;
            }
            
            // Set up timeout before emitting
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout guardando imagen'));
            }, 45000); // Increased timeout to 45 seconds
            
            // Set up one-time listener before emitting
            const responseHandler = (response) => {
                clearTimeout(timeoutId);
                if (response.success) {
                    resolve(response.filename);
                } else {
                    reject(new Error(response.message || 'Error desconocido al guardar'));
                }
            };
            
            window.socket.once('processedImageSaved', responseHandler);
            
            // Emit the save request
            window.socket.emit('saveProcessedImage', { imageDataUrl });
        });
        
    } catch (error) {
        console.error('Error guardando imagen:', error);
        return null;
    }
}

async function applyAsNewPatternImage(filename) {
    try {
        return new Promise((resolve, reject) => {
            if (!window.socket) {
                reject(new Error('Socket no disponible'));
                return;
            }
            
            // Set up timeout before emitting
            const timeoutId = setTimeout(() => {
                reject(new Error('Timeout aplicando imagen'));
            }, 45000); // Increased timeout to 45 seconds
            
            // Set up one-time listener before emitting
            const responseHandler = (response) => {
                clearTimeout(timeoutId);
                if (response.success) {
                    console.log('✅ Imagen aplicada exitosamente:', response);
                    resolve(true);
                } else {
                    reject(new Error(response.message || 'Error desconocido al aplicar'));
                }
            };
            
            window.socket.once('processedImageApplied', (response) => {
                responseHandler(response);
                
                // NUEVO: Después de aplicar la imagen, solicitar captura de canvas completo
                setTimeout(() => {
                    console.log('📸 Solicitando captura de canvas completo desde pantalla 1...');
                    window.socket.emit('requestCanvasCaptureFromScreen', { screenId: 1 });
                    
                    // Escuchar confirmación de guardado
                    window.socket.once('canvasSaved', (data) => {
                        if (data.success) {
                            console.log(`✅ Patrón completo guardado: ${data.filename}`);
                            updateProcessStatus(`✅ Patrón completo guardado: ${data.filename}`, 'success');
                        } else {
                            console.error(`❌ Error guardando patrón: ${data.error}`);
                            updateProcessStatus(`❌ Error guardando patrón: ${data.error}`, 'error');
                        }
                    });
                }, 1000); // Esperar 1 segundo para que se renderice completamente
            });
            
            const selected = (window.selectedImage || 'red');
            console.log(`🎨 Aplicando imagen como patrón con imagen seleccionada: ${selected}`);
            
            // Emit the apply request
            window.socket.emit('applyProcessedImage', { selectedImage: selected });
        });
        
    } catch (error) {
        console.error('Error aplicando imagen al patrón:', error);
        return false;
    }
}

// ==============================
// PROCESO AUTOMÁTICO DESDE CAPTURA
// ==============================

function updateProcessStatus(message, type = 'normal') {
    const statusDiv = document.getElementById('processStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `process-status ${type}`;
    }
}

function showKeyIndicator(key) {
    // Crear indicador visual de tecla presionada
    const indicator = document.createElement('div');
    indicator.className = 'key-indicator';
    indicator.textContent = `Tecla "${key}" presionada - Iniciando proceso automático`;
    document.body.appendChild(indicator);
    
    setTimeout(() => {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }, 2000);
}

async function scanCapturaFolder() {
    try {
        updateProcessStatus('🔍 Escaneando carpeta /captura...', 'scanning');
        
        const response = await fetch('/api/captura/scan');
        const data = await response.json();
        
        if (!data.success) {
            updateProcessStatus(`❌ ${data.message}`, 'error');
            return null;
        }
        
        updateProcessStatus(`📷 Imagen encontrada: ${data.filename} (${data.totalImages} total)`, 'success');
        return data;
        
    } catch (error) {
        console.error('Error escaneando captura:', error);
        updateProcessStatus('❌ Error al escanear la carpeta /captura', 'error');
        return null;
    }
}

async function loadImageFromCaptura(imagePath) {
    try {
        updateProcessStatus('⏳ Cargando imagen desde /captura...', 'processing');
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
                currentImage = img;
                originalImageData = imagePath;
                
                // Mostrar preview
                const previewImg = document.getElementById('imagePreview');
                if (previewImg) {
                    previewImg.src = imagePath;
                    previewImg.style.display = 'block';
                }
                
                updateProcessStatus('✅ Imagen cargada correctamente', 'success');
                console.log(`Imagen cargada desde captura: ${img.width}x${img.height}`);
                resolve(img);
            };
            
            img.onerror = function() {
                updateProcessStatus('❌ Error al cargar la imagen', 'error');
                reject(new Error('Error cargando imagen'));
            };
            
            img.src = imagePath;
        });
        
    } catch (error) {
        console.error('Error cargando imagen:', error);
        updateProcessStatus('❌ Error al cargar la imagen', 'error');
        return null;
    }
}

async function processImageFromCaptura() {
    try {
        if (!opencvReady) {
            updateProcessStatus('❌ OpenCV aún no está listo', 'error');
            return false;
        }
        
        // Paso 1: Escanear carpeta
        const scanResult = await scanCapturaFolder();
        if (!scanResult) return false;
        
        // Paso 2: Cargar imagen
        const loadedImage = await loadImageFromCaptura(scanResult.imagePath);
        if (!loadedImage) return false;
        
        // Paso 3: Procesar automáticamente
        updateProcessStatus('🔄 Detectando y procesando rectángulo...', 'processing');
        
        const processedImage = await detectAndProcessAutomatically();
        if (!processedImage) {
            updateProcessStatus('❌ No se pudo detectar/procesar el rectángulo', 'error');
            return false;
        }
        
        // Paso 4: Aplicar procesamiento final y guardar
        updateProcessStatus('🔄 Aplicando filtros y guardando...', 'processing');
        
        let finalProcessed = applyFinalImageProcessing(processedImage);
        
        // Crear preview
        const previewCanvas = createFinalPreview(processedImage);
        const correctedCanvas = document.getElementById('correctedCanvas');
        if (correctedCanvas) {
            const ctx = correctedCanvas.getContext('2d');
            correctedCanvas.width = previewCanvas.width;
            correctedCanvas.height = previewCanvas.height;
            ctx.drawImage(previewCanvas, 0, 0);
        }
        
        // Convertir a blob y guardar
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = finalProcessed.cols;
        tempCanvas.height = finalProcessed.rows;
        const tctx = tempCanvas.getContext('2d');
        
        cv.imshow(tempCanvas, finalProcessed);
        
        // Aplicar cambios y guardar directamente
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png', 1.0));
        
        const savedFilename = await saveProcessedImage(blob);
        if (!savedFilename) {
            updateProcessStatus('❌ Error al guardar la imagen procesada', 'error');
            return false;
        }
        
        await applyAsNewPatternImage(savedFilename);
        
        updateProcessStatus('🎉 ¡PROCESO COMPLETADO! Imagen procesada y aplicada al patrón.', 'success');
        
        // Cleanup
        processedImage.delete();
        finalProcessed.delete();
        
        return true;
        
    } catch (error) {
        console.error('Error en proceso automático desde captura:', error);
        updateProcessStatus('❌ Error en proceso: ' + error.message, 'error');
        return false;
    }
}

// Función para proceso manual desde captura
async function manualProcessFromCaptura() {
    try {
        const scanResult = await scanCapturaFolder();
        if (!scanResult) return;
        
        const loadedImage = await loadImageFromCaptura(scanResult.imagePath);
        if (!loadedImage) return;
        
        updateProcessStatus('✅ Imagen cargada. Usa los botones de detección manual si es necesario.', 'success');
        
    } catch (error) {
        console.error('Error en carga manual:', error);
        updateProcessStatus('❌ Error en carga manual: ' + error.message, 'error');
    }
}

// ==============================
// INICIALIZACIÓN
// ==============================

function initializeOpenCVProcessor() {
    // Cargar OpenCV cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadOpenCV);
    } else {
        loadOpenCV();
    }
    
    // Configurar manejadores de eventos cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupImageHandlers);
        document.addEventListener('DOMContentLoaded', setupKeyboardListener);
    } else {
        setupImageHandlers();
        setupKeyboardListener();
    }
}

// Configurar listener de teclado para la tecla "9"
function setupKeyboardListener() {
    document.addEventListener('keydown', function(event) {
        // Verificar que no estemos en un input o textarea
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (event.key === '9' || event.keyCode === 57) {
            event.preventDefault();
            console.log('Tecla "9" presionada - Iniciando proceso automático');
            showKeyIndicator('9');
            processImageFromCaptura();
        }
    });
    
    console.log('🎹 Listener de teclado configurado - Presiona "9" para proceso automático');
}

// Exponer funciones globales necesarias
window.onOpenCvReady = onOpenCvReady;
window.detectWhiteRectangleSimple = detectWhiteRectangleSimple;
window.autoProcessAndApply = autoProcessAndApply;
window.manualProcessFromCaptura = manualProcessFromCaptura;
window.processImageFromCaptura = processImageFromCaptura;

// Inicializar automáticamente
initializeOpenCVProcessor();
