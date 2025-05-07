// uninstall-service.js
// Este script desinstala el servicio de Windows
const { Service } = require('node-windows');
const path = require('path');

// Ruta completa al script principal de la aplicación
const scriptPath = path.join(__dirname, 'app.js');
console.log('Ruta del script a desinstalar:', scriptPath);

// Configurar el servicio (debe tener la misma configuración que en la instalación)
const svc = new Service({
  name: 'WhatsAppServerService',
  description: 'Servidor de WhatsApp con interfaz web para enviar mensajes',
  script: scriptPath
});

// Escuchar eventos de desinstalación
svc.on('uninstall', function() {
  console.log('Servicio desinstalado correctamente.');
});

svc.on('error', function(error) {
  console.error('Error durante la desinstalación del servicio:', error);
});

// Desinstalación del servicio
console.log('Desinstalando el servicio de Windows...');
svc.uninstall();