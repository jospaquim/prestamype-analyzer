// Background script para la extensión Prestamype Analyzer
console.log('🚀 Prestamype Analyzer background script iniciado');

// Instalación de la extensión
chrome.runtime.onInstalled.addListener((details) => {
    console.log('📦 Extensión instalada:', details.reason);
    
    if (details.reason === 'install') {
        // Primera instalación
        console.log('✨ Primera instalación de Prestamype Analyzer');
        
        // Configurar valores por defecto
        chrome.storage.local.set({
            analyzer_config: {
                budget: 10000,
                minReturn: 8,
                maxRisk: 'C'
            }
        });
    }
});

// Manejo de clics en el icono de la extensión
chrome.action.onClicked.addListener((tab) => {
    console.log('🖱️ Click en extensión, pestaña:', tab.url);
    
    // Verificar si estamos en Prestamype
    if (!tab.url.includes('prestamype.com')) {
        // Mostrar notificación si no estamos en Prestamype
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-48.png',
            title: 'Prestamype Analyzer',
            message: 'Esta extensión solo funciona en Prestamype.com'
        });
        return;
    }
    
    // El popup se abrirá automáticamente
});

// Manejo de mensajes de content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Mensaje recibido en background:', request);
    
    if (request.action === 'log') {
        console.log('📝 Log desde content script:', request.message);
    }
    
    // No necesitamos responder a estos mensajes
    return false;
});

// Manejo de errores no capturados
chrome.runtime.onSuspend.addListener(() => {
    console.log('💤 Background script suspendido');
});

console.log('✅ Background script configurado correctamente');