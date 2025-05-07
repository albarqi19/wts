/**
 * @file paths.js
 * @description Configuración de rutas y constantes para la aplicación
 */

const path = require('path');

// Rutas de directorios principales
const CONFIG = {
    DATA_DIR: path.join(__dirname, '../../data'),
    DEVICES_DIR: path.join(__dirname, '../../data/devices'),
    CHATS_FILE: path.join(__dirname, '../../data/chats.json'),
    CONTACTS_FILE: path.join(__dirname, '../../data/contacts.json'),
    DEVICES_FILE: path.join(__dirname, '../../data/devices.json'),
    INTEGRATIONS_FILE: path.join(__dirname, '../../data/integrations.json'),
    SENT_MESSAGES_DIR: path.join(__dirname, '../../data/sent_messages'),
    PUBLIC_DIR: path.join(__dirname, '../../public')
};

module.exports = CONFIG;