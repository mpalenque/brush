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
        
        const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0, width, 0, width, height, 0, height
        ]);
        
        // Aplicar transformación de perspectiva
        const transformMatrix = cv.getPerspectiveTransform(srcCorners, dstCorners);
        let warped = new cv.Mat();
        cv.warpPerspective(mat, warped, transformMatrix, new cv.Size(width, height));
        
        // Cleanup
        approx.delete();
        srcCorners.delete();
        dstCorners.delete();
        transformMatrix.delete();
        
        console.log(`Imagen corregida: ${width}x${height}`);
        return warped;
        
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
        
        // Solo cambiar píxeles completamente transparentes, preservar todo lo demás
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha === 0) {
                data[i] = 255;     // R
                data[i + 1] = 255; // G
                data[i + 2] = 255; // B
                data[i + 3] = 255; // A
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
        
        // PROCESAMIENTO 1: Realce de contraste y brillo más visible
        processed.convertTo(processed, -1, 1.2, 15); // Alpha=1.2 (20% más contraste), Beta=15 (más brillo)
        
        // PROCESAMIENTO 2: Mejora de nitidez más notable
        let sharpened = new cv.Mat();
        let kernel = cv.matFromArray(3, 3, cv.CV_32FC1, [
            0, -0.7, 0,
            -0.7, 3.8, -0.7,
            0, -0.7, 0
        ]);
        cv.filter2D(processed, sharpened, cv.CV_8UC4, kernel);
        kernel.delete();
        
        // Mezclar con más nitidez para que sea más visible (50% de nitidez)
        cv.addWeighted(processed, 0.5, sharpened, 0.5, 0, processed);
        sharpened.delete();
        
        // PROCESAMIENTO 3: Saturación de colores (para preservar y realzar las flores)
        let hsv = new cv.Mat();
        cv.cvtColor(processed, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        
        // Aumentar ligeramente la saturación para realzar los colores de las flores
        let channels = new cv.MatVector();
        cv.split(hsv, channels);
        let saturation = channels.get(1);
        saturation.convertTo(saturation, -1, 1.1, 0); // +10% saturación
        channels.set(1, saturation);
        cv.merge(channels, hsv);
        
        cv.cvtColor(hsv, processed, cv.COLOR_HSV2RGB);
        cv.cvtColor(processed, processed, cv.COLOR_RGB2RGBA);
        
        // Cleanup
        hsv.delete();
        channels.delete();
        saturation.delete();
        
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
        
        // Solo ajustar píxeles completamente transparentes (alpha = 0) a blanco
        const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            // Solo cambiar píxeles completamente transparentes, preservar todo lo demás
            if (alpha === 0) {
                data[i] = 255;     // R
                data[i + 1] = 255; // G
                data[i + 2] = 255; // B
                data[i + 3] = 255; // A
            }
        }
        
        // Aplicar los cambios mínimos
        tctx.putImageData(imageData, 0, 0);
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
// ==============================

async function saveProcessedImage(blob) {
    try {
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
            
            window.socket.emit('saveProcessedImage', { imageDataUrl });
            
            window.socket.once('processedImageSaved', (response) => {
                if (response.success) {
                    resolve(response.filename);
                } else {
                    reject(new Error(response.message));
                }
            });
            
            setTimeout(() => {
                reject(new Error('Timeout guardando imagen'));
            }, 30000);
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
            
            window.socket.emit('applyProcessedImage', {});
            
            window.socket.once('processedImageApplied', (response) => {
                if (response.success) {
                    resolve(true);
                } else {
                    reject(new Error(response.message));
                }
            });
            
            setTimeout(() => {
                reject(new Error('Timeout aplicando imagen'));
            }, 30000);
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
        
        const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha === 0) {
                data[i] = 255;     // R
                data[i + 1] = 255; // G
                data[i + 2] = 255; // B
                data[i + 3] = 255; // A
            }
        }
        
        tctx.putImageData(imageData, 0, 0);
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

// Configurar listener de teclado para la tecla "1"
function setupKeyboardListener() {
    document.addEventListener('keydown', function(event) {
        // Verificar que no estemos en un input o textarea
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (event.key === '1' || event.keyCode === 49) {
            event.preventDefault();
            console.log('Tecla "1" presionada - Iniciando proceso automático');
            showKeyIndicator('1');
            processImageFromCaptura();
        }
    });
    
    console.log('🎹 Listener de teclado configurado - Presiona "1" para proceso automático');
}

// Exponer funciones globales necesarias
window.onOpenCvReady = onOpenCvReady;
window.detectWhiteRectangleSimple = detectWhiteRectangleSimple;
window.autoProcessAndApply = autoProcessAndApply;
window.manualProcessFromCaptura = manualProcessFromCaptura;
window.processImageFromCaptura = processImageFromCaptura;

// Inicializar automáticamente
initializeOpenCVProcessor();
