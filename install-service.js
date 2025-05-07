// install-service.js
// Este script instala la aplicación como un servicio de Windows
const { Service } = require('node-windows');
const path = require('path');

// Ruta completa al script principal de la aplicación
const scriptPath = path.join(__dirname, 'app.js');
console.log('Ruta del script a instalar:', scriptPath);

// Configurar el nuevo servicio
const svc = new Service({
  name: 'WhatsAppServerService',
  description: 'Servidor de WhatsApp con interfaz web para enviar mensajes',
  script: scriptPath,
  // Directorio de trabajo (donde se ejecutará el servicio)
  workingDirectory: __dirname,
  // Opciones adicionales
  allowServiceLogon: true,
  // Solo dependemos del registro de eventos de Windows
  dependencies: ['Eventlog']
});

// Escuchar eventos de instalación
svc.on('install', function() {
  console.log('Servicio instalado correctamente.');
  // Iniciar el servicio después de la instalación
  svc.start();
});

svc.on('start', function() {
  console.log('Servicio iniciado correctamente.');
  console.log('El servidor de WhatsApp se ejecutará automáticamente al iniciar Windows.');
});

svc.on('alreadyinstalled', function() {
  console.log('El servicio ya está instalado.');
  console.log('Intentando iniciar el servicio...');
  svc.start();
});

svc.on('error', function(error) {
  console.error('Error durante la instalación del servicio:', error);
});

// Instalación del servicio
console.log('Instalando la aplicación como servicio de Windows...');
svc.install();