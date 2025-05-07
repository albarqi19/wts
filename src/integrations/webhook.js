/**
 * @file webhook.js
 * @description Funciones para integración con webhooks
 */

const axios = require('axios');
const { clients } = require('../services/whatsappClient');

/**
 * Envía un evento a un webhook
 * @param {Object} integration - Objeto de integración
 * @param {string} eventType - Tipo de evento
 * @param {Object} eventData - Datos del evento
 * @returns {Promise<boolean>} - Resultado del envío
 */
async function sendWebhookEvent(integration, eventType, eventData) {
    try {
        if (!integration.config || !integration.config.webhookUrl) {
            console.error('URL de webhook no configurada para la integración:', integration.name);
            return false;
        }

        console.log(`إرسال حدث ${eventType} إلى webhook ${integration.name}`);
        
        // Preparar datos del evento
        const payload = {
            eventType,
            timestamp: new Date().toISOString(),
            deviceId: integration.deviceId,
            data: eventData
        };
        
        // Enviar evento al webhook URL
        const response = await axios.post(integration.config.webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-WTSAPP-SIGNATURE': integration.id
            }
        });
        
        console.log(`تم إرسال الحدث ${eventType} بنجاح إلى ${integration.name}:`, response.status);
        return true;
    } catch (error) {
        console.error(`خطأ في إرسال حدث ${eventType} إلى webhook ${integration.name}:`, error.message);
        return false;
    }
}

/**
 * Procesa una integración de webhook
 * @param {Object} integration - Objeto de integración
 * @param {string} eventType - Tipo de evento
 * @param {Object} eventData - Datos del evento
 * @returns {Promise<Object>} - Estadísticas de procesamiento
 */
async function processWebhookIntegration(integration, eventType, eventData) {
    try {
        // Verificar configuración del webhook
        if (!integration.config || !integration.config.webhookUrl) {
            console.error('URL de webhook no configurada para la integración:', integration.name);
            return {
                sent: 0,
                failed: 1,
                eventType
            };
        }
        
        // Enviar evento al webhook
        const result = await sendWebhookEvent(integration, eventType, eventData);
        
        return {
            sent: result ? 1 : 0,
            failed: result ? 0 : 1,
            eventType
        };
    } catch (error) {
        console.error('خطأ في معالجة تكامل webhook:', error);
        throw error;
    }
}

module.exports = {
    sendWebhookEvent,
    processWebhookIntegration
};