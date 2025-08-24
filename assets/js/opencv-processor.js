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
    
    const processButton = document.getElementById('processButton');
    const autoProcessButton = document.getElementById('autoProcessButton');
    
    if (processButton) processButton.disabled = false;
    if (autoProcessButton) autoProcessButton.disabled = false;
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
    const imageInput = document.getElementById('imageInput');
    const uploadArea = document.querySelector('.image-upload');
    
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    loadImageForProcessing(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (uploadArea) {
        setupDragAndDrop(uploadArea);
    }
}

function setupDragAndDrop(uploadArea) {
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const imageInput = document.getElementById('imageInput');
            if (imageInput) {
                imageInput.files = files;
                imageInput.dispatchEvent(new Event('change'));
            }
        }
    });
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
    
    cv.imshow(correctedCanvas, correctedMat);
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
        
        updateOpenCVStatus('🔄 Paso 2/4: Convirtiendo imagen...', 'normal');
        
        // PASO 2: Convertir la imagen procesada correctamente
        // Verificar que tenemos una imagen procesada válida
        if (!processedImage || processedImage.cols === 0 || processedImage.rows === 0) {
            updateOpenCVStatus('❌ Error: Imagen procesada inválida', 'error');
            return;
        }
        
        // Crear canvas temporal con el tamaño correcto de la imagen procesada
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = processedImage.cols;
        tempCanvas.height = processedImage.rows;
        const tctx = tempCanvas.getContext('2d');
        
        // Mostrar la imagen procesada en el canvas de corrección primero
        cv.imshow(document.getElementById('correctedCanvas'), processedImage);
        
        // 1. Fondo blanco absoluto en el canvas temporal
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 2. Configurar composición para manejar transparencias correctamente
        tctx.globalCompositeOperation = 'source-over';
        
        // 3. Convertir Mat de OpenCV a canvas correctamente
        // Crear un canvas auxiliar del tamaño exacto de la imagen
        const auxCanvas = document.createElement('canvas');
        auxCanvas.width = processedImage.cols;
        auxCanvas.height = processedImage.rows;
        cv.imshow(auxCanvas, processedImage);
        
        // Dibujar la imagen del canvas auxiliar al canvas temporal con fondo blanco
        tctx.drawImage(auxCanvas, 0, 0);
        
        // 4. Optimizar píxeles para asegurar fondo blanco puro
        const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 255) {
                // Pixel semi-transparente -> blanco puro
                data[i] = 255;     // R
                data[i + 1] = 255; // G
                data[i + 2] = 255; // B
                data[i + 3] = 255; // A
            }
        }
        
        // Aplicar los cambios finales
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
        
        processedImage.delete();
        
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
    } else {
        setupImageHandlers();
    }
}

// Exponer funciones globales necesarias
window.onOpenCvReady = onOpenCvReady;
window.detectWhiteRectangleSimple = detectWhiteRectangleSimple;
window.autoProcessAndApply = autoProcessAndApply;

// Inicializar automáticamente
initializeOpenCVProcessor();
