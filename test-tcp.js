const net = require('net');

const TCP_PORT = 6000;
const tcpServer = net.createServer();

tcpServer.on('connection', (socket) => {
    console.log('📡 *** TCP TEST *** Nueva conexión desde:', socket.remoteAddress + ':' + socket.remotePort);
    
    socket.on('data', (data) => {
        const message = data.toString().trim();
        console.log(`📨 *** TCP TEST *** Mensaje recibido: "${message}"`);
        
        if (message === 'save') {
            console.log('📸 *** TCP TEST *** ¡Mensaje "save" recibido correctamente!');
            socket.write('OK - TCP funcionando\n');
        } else {
            console.log(`⚠️ *** TCP TEST *** Mensaje: "${message}"`);
            socket.write('MENSAJE RECIBIDO: ' + message + '\n');
        }
    });
    
    socket.on('error', (err) => {
        console.error('❌ *** TCP TEST *** Error en conexión:', err);
    });
    
    socket.on('close', () => {
        console.log('📡 *** TCP TEST *** Conexión cerrada');
    });
});

tcpServer.on('listening', () => {
    const address = tcpServer.address();
    console.log(`📡 *** TCP TEST *** Servidor TCP funcionando en puerto ${address.port}`);
    console.log(`🧪 *** TCP TEST *** Listo para recibir mensajes desde VVVV`);
});

tcpServer.on('error', (err) => {
    console.error('❌ *** TCP TEST *** Error en servidor:', err);
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`🚀 *** TCP TEST *** Iniciando servidor TCP en puerto ${TCP_PORT}`);
    console.log(`📡 *** TCP TEST *** Escuchando en todas las interfaces (0.0.0.0:${TCP_PORT})`);
});

// Mantener el proceso vivo
process.on('SIGINT', () => {
    console.log('\n🛑 *** TCP TEST *** Cerrando servidor TCP...');
    tcpServer.close(() => {
        console.log('✅ *** TCP TEST *** Servidor TCP cerrado');
        process.exit(0);
    });
});
