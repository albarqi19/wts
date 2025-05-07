/**
 * @file webhookIntegration.js
 * @description Integración mejorada con webhooks para sistemas externos
 */

const axios = require('axios');
const crypto = require('crypto');
const BaseIntegration = require('../../common/baseIntegration');
const { clients } = require('../../../services/whatsappClient');

class WebhookIntegration extends BaseIntegration {
    constructor(integration) {
        super(integration);
        
        // Verificar existencia de propiedades específicas de Webhook
        this.config.webhookUrl = this.config.webhookUrl || '';
        this.config.notifyOnNewMessage = this.config.notifyOnNewMessage !== undefined ? this.config.notifyOnNewMessage : true;
        this.config.notifyOnStatusChange = this.config.notifyOnStatusChange !== undefined ? this.config.notifyOnStatusChange : true;
        this.config.notifyOnGroupActivity = this.config.notifyOnGroupActivity !== undefined ? this.config.notifyOnGroupActivity : false;
        this.config.format = this.config.format || 'standard'; // standard, custom
        this.config.customFormat = this.config.customFormat || null;
        this.config.events = this.config.events || ['message', 'message_ack', 'group_join', 'group_leave'];
        this.config.secret = this.config.secret || '';
        this.config.headers = this.config.headers || {};
        this.config.retries = this.config.retries || 3;
        this.config.retryDelay = this.config.retryDelay || 3000; // ms

        // Filtros
        this.config.filters = this.config.filters || {
            includeMedia: true,
            includeGroups: false,
            onlyContacts: false,
            messageTypes: ['chat', 'image', 'video', 'audio', 'document']
        };
    }

    /**
     * Valida la configuración de la integración de Webhook
     * @returns {Object} Resultado de la validación
     */
    validateConfig() {
        if (!this.config.webhookUrl) {
            return { isValid: false, message: 'Se requiere la URL del webhook' };
        }

        return { isValid: true, message: 'Configuración válida' };
    }

    /**
     * Procesa la integración con webhook
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async process() {
        try {
            console.log(`Verificando integración webhook ${this.name} (${this.id})`);
            const validation = this.validateConfig();
            
            if (!validation.isValid) {
                throw new Error(`Configuración no válida: ${validation.message}`);
            }
            
            // Las integraciones de webhook son principalmente basadas en eventos
            // Este método sólo hace una verificación de salud
            const healthCheck = await this._performWebhookHealthCheck();
            return { 
                sent: 0, 
                failed: 0, 
                processed: 1,
                healthCheck
            };
        } catch (error) {
            console.error(`Error en la integración webhook ${this.name}:`, error);
            this.logError(error);
            return { 
                sent: 0, 
                failed: 1, 
                processed: 1, 
                error: error.message 
            };
        }
    }

    /**
     * Procesa un mensaje entrante y notifica al webhook si está configurado
     * @param {Object} message Mensaje entrante
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processIncomingMessage(message) {
        // Si la notificación de mensajes nuevos no está activada, no procesar
        if (!this.config.notifyOnNewMessage) {
            return { processed: false, reason: 'Notificación de mensajes desactivada' };
        }

        // Aplicar filtros configurados
        if (!this._shouldProcessMessage(message)) {
            return { processed: false, reason: 'Mensaje filtrado por configuración' };
        }

        try {
            // Preparar el payload según el formato configurado
            const payload = await this._formatMessagePayload(message, 'message');
            
            // Enviar la notificación al webhook
            const result = await this._sendToWebhook(payload);
            
            return { 
                processed: true, 
                sent: result.success,
                failed: !result.success,
                status: result.status,
                response: result.response
            };
        } catch (error) {
            console.error(`Error al procesar mensaje para webhook:`, error);
            return { processed: true, sent: false, error: error.message };
        }
    }

    /**
     * Procesa un cambio de estado de mensaje (leído, entregado, etc)
     * @param {Object} messageInfo Información del mensaje
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processMessageStatusChange(messageInfo) {
        // Si la notificación de cambios de estado no está activada, no procesar
        if (!this.config.notifyOnStatusChange) {
            return { processed: false, reason: 'Notificación de cambios de estado desactivada' };
        }

        try {
            // Preparar el payload según el formato configurado
            const payload = this._formatStatusChangePayload(messageInfo);
            
            // Enviar la notificación al webhook
            const result = await this._sendToWebhook(payload);
            
            return { 
                processed: true, 
                sent: result.success,
                status: result.status
            };
        } catch (error) {
            console.error(`Error al procesar cambio de estado para webhook:`, error);
            return { processed: true, sent: false, error: error.message };
        }
    }

    /**
     * Procesa actividad de grupo (unirse, salir, etc)
     * @param {Object} groupInfo Información del grupo y evento
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processGroupActivity(groupInfo) {
        // Si la notificación de actividad de grupo no está activada, no procesar
        if (!this.config.notifyOnGroupActivity) {
            return { processed: false, reason: 'Notificación de actividad de grupo desactivada' };
        }

        try {
            // Preparar el payload según el formato configurado
            const payload = this._formatGroupActivityPayload(groupInfo);
            
            // Enviar la notificación al webhook
            const result = await this._sendToWebhook(payload);
            
            return { 
                processed: true, 
                sent: result.success,
                status: result.status
            };
        } catch (error) {
            console.error(`Error al procesar actividad de grupo para webhook:`, error);
            return { processed: true, sent: false, error: error.message };
        }
    }

    /**
     * Determina si un mensaje debe ser procesado según los filtros configurados
     * @param {Object} message Mensaje a evaluar
     * @returns {boolean} true si el mensaje debe procesarse
     */
    _shouldProcessMessage(message) {
        // Verificar filtros de tipo de mensaje
        if (this.config.filters.messageTypes && !this.config.filters.messageTypes.includes(message.type)) {
            return false;
        }
        
        // Verificar si es un grupo y si debemos procesar grupos
        if (message.isGroupMsg && !this.config.filters.includeGroups) {
            return false;
        }
        
        // Verificar si hay medios adjuntos y si debemos incluirlos
        if (message.hasMedia && !this.config.filters.includeMedia) {
            return false;
        }
        
        // Verificar si solo debemos procesar contactos conocidos
        if (this.config.filters.onlyContacts) {
            // Esta verificación depende de la implementación específica del cliente de WhatsApp
            const isContact = message.fromContact || message._data?.notifyName;
            if (!isContact) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Formatea un mensaje para enviarlo al webhook
     * @param {Object} message Mensaje a formatear
     * @param {string} eventType Tipo de evento
     * @returns {Promise<Object>} Payload formateado
     */
    async _formatMessagePayload(message, eventType = 'message') {
        // Si es formato personalizado y hay una plantilla definida
        if (this.config.format === 'custom' && this.config.customFormat) {
            return this._applyCustomFormat(message, eventType);
        }

        // Formato estándar
        const chat = await message.getChat();
        const sender = await message.getContact();
        
        const payload = {
            integrationId: this.id,
            integrationName: this.name,
            event: eventType,
            timestamp: new Date().toISOString(),
            message: {
                id: message.id._serialized,
                from: message.from,
                to: message.to,
                author: message.author || message.from,
                body: message.body,
                type: message.type,
                timestamp: message.timestamp,
                hasMedia: message.hasMedia,
                isForwarded: message.isForwarded,
                isStatus: message.isStatus,
                isStarred: message.isStarred,
                fromMe: message.fromMe,
                hasQuotedMsg: message.hasQuotedMsg
            },
            chat: {
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup
            },
            sender: {
                id: sender.id._serialized,
                name: sender.name || sender.pushname || '',
                number: sender.number,
                isMyContact: sender.isMyContact
            }
        };
        
        // Si hay una respuesta citada, incluir información básica
        if (message.hasQuotedMsg) {
            try {
                const quotedMsg = await message.getQuotedMessage();
                payload.quotedMessage = {
                    id: quotedMsg.id._serialized,
                    body: quotedMsg.body,
                    type: quotedMsg.type,
                    fromMe: quotedMsg.fromMe
                };
            } catch (error) {
                console.warn('No se pudo obtener el mensaje citado:', error);
            }
        }
        
        // Si tiene medios, incluir detalles
        if (message.hasMedia && this.config.filters.includeMedia) {
            try {
                const media = await message.downloadMedia();
                payload.media = {
                    mimetype: media.mimetype,
                    filename: media.filename || '',
                    // No incluimos los datos binarios por defecto, son demasiado grandes
                    size: media.data ? Buffer.from(media.data, 'base64').length : 0
                };
            } catch (error) {
                console.warn('No se pudieron descargar los medios adjuntos:', error);
            }
        }
        
        return payload;
    }

    /**
     * Formatea un cambio de estado de mensaje para enviarlo al webhook
     * @param {Object} messageInfo Información del cambio de estado
     * @returns {Object} Payload formateado
     */
    _formatStatusChangePayload(messageInfo) {
        // Si es formato personalizado y hay una plantilla definida
        if (this.config.format === 'custom' && this.config.customFormat) {
            return this._applyCustomFormat(messageInfo, 'message_ack');
        }

        // Formato estándar
        return {
            integrationId: this.id,
            integrationName: this.name,
            event: 'message_ack',
            timestamp: new Date().toISOString(),
            message: {
                id: messageInfo.id._serialized,
                ack: messageInfo.ack,
                status: this._getStatusTextFromAck(messageInfo.ack),
                fromMe: true,
                to: messageInfo.to
            }
        };
    }

    /**
     * Formatea un evento de grupo para enviarlo al webhook
     * @param {Object} groupInfo Información del evento de grupo
     * @returns {Object} Payload formateado
     */
    _formatGroupActivityPayload(groupInfo) {
        // Si es formato personalizado y hay una plantilla definida
        if (this.config.format === 'custom' && this.config.customFormat) {
            return this._applyCustomFormat(groupInfo, groupInfo.event);
        }

        // Formato estándar
        return {
            integrationId: this.id,
            integrationName: this.name,
            event: groupInfo.event,
            timestamp: new Date().toISOString(),
            group: {
                id: groupInfo.group.id._serialized,
                name: groupInfo.group.name,
                participants: groupInfo.group.participants.length
            },
            user: {
                id: groupInfo.user.id._serialized,
                name: groupInfo.user.name || groupInfo.user.pushname || '',
                number: groupInfo.user.number
            },
            by: groupInfo.by ? {
                id: groupInfo.by.id._serialized,
                name: groupInfo.by.name || groupInfo.by.pushname || '',
                number: groupInfo.by.number
            } : null
        };
    }

    /**
     * Aplica un formato personalizado según la plantilla configurada
     * @param {Object} data Datos a formatear
     * @param {string} eventType Tipo de evento
     * @returns {Object} Datos formateados según plantilla personalizada
     */
    _applyCustomFormat(data, eventType) {
        try {
            const template = this.config.customFormat[eventType] || this.config.customFormat.default;
            
            if (!template) {
                throw new Error(`No hay plantilla definida para el evento ${eventType}`);
            }
            
            // Realizar una copia superficial para la manipulación
            const result = { ...template };
            
            // Reemplazar marcadores de posición en el template
            const replacePlaceholders = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === 'string') {
                        obj[key] = this._replacePlaceholders(obj[key], data);
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        replacePlaceholders(obj[key]);
                    }
                }
            };
            
            replacePlaceholders(result);
            
            // Añadir metadatos mínimos
            result.meta = {
                integrationId: this.id,
                timestamp: new Date().toISOString()
            };
            
            return result;
        } catch (error) {
            console.error('Error al aplicar formato personalizado:', error);
            // En caso de error, volver al formato estándar
            return {
                integrationId: this.id,
                integrationName: this.name,
                event: eventType,
                timestamp: new Date().toISOString(),
                data: data,
                error: 'Error al aplicar formato personalizado'
            };
        }
    }

    /**
     * Reemplaza marcadores de posición en una cadena
     * @param {string} template Plantilla con marcadores
     * @param {Object} data Datos para reemplazar
     * @returns {string} Cadena con marcadores reemplazados
     */
    _replacePlaceholders(template, data) {
        return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let value = data;
            
            for (const key of keys) {
                if (value === undefined || value === null) return '';
                value = value[key];
            }
            
            return value !== undefined ? value : '';
        });
    }

    /**
     * Convierte el código de confirmación en texto descriptivo
     * @param {number} ack Código de confirmación
     * @returns {string} Descripción del estado
     */
    _getStatusTextFromAck(ack) {
        switch (ack) {
            case 0: return 'pending';
            case 1: return 'sent';
            case 2: return 'received';
            case 3: return 'read';
            case 4: return 'played'; // Para mensajes de voz
            default: return 'unknown';
        }
    }

    /**
     * Envía datos al webhook configurado
     * @param {Object} payload Datos a enviar
     * @returns {Promise<Object>} Resultado del envío
     */
    async _sendToWebhook(payload) {
        let retries = this.config.retries;
        let lastError = null;

        while (retries >= 0) {
            try {
                // Añadir firma si hay una clave secreta configurada
                const headers = { ...this.config.headers, 'Content-Type': 'application/json' };
                
                if (this.config.secret) {
                    const signature = crypto
                        .createHmac('sha256', this.config.secret)
                        .update(JSON.stringify(payload))
                        .digest('hex');
                    
                    headers['X-Webhook-Signature'] = signature;
                }
                
                const response = await axios({
                    method: 'POST',
                    url: this.config.webhookUrl,
                    headers: headers,
                    data: payload,
                    timeout: 10000 // 10 segundos máximo
                });
                
                return {
                    success: response.status >= 200 && response.status < 300,
                    status: response.status,
                    response: {
                        data: response.data,
                        headers: response.headers
                    }
                };
            } catch (error) {
                lastError = error;
                retries--;
                
                if (retries >= 0) {
                    console.warn(`Error al enviar a webhook, reintentando (${this.config.retries - retries}/${this.config.retries}):`, error.message);
                    // Esperar antes de reintentar
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        }
        
        // Si llegamos aquí, todos los reintentos fallaron
        console.error('Todos los intentos de envío al webhook fallaron:', lastError);
        return {
            success: false,
            status: lastError.response ? lastError.response.status : 0,
            error: lastError.message
        };
    }

    /**
     * Realiza una verificación de salud del webhook
     * @returns {Promise<Object>} Resultado de la verificación
     */
    async _performWebhookHealthCheck() {
        try {
            const testPayload = {
                integrationId: this.id,
                integrationName: this.name,
                event: 'health_check',
                timestamp: new Date().toISOString(),
                message: 'Verificación de disponibilidad del webhook'
            };
            
            const result = await this._sendToWebhook(testPayload);
            
            return {
                success: result.success,
                status: result.status,
                message: result.success ? 'Webhook disponible' : 'Error al contactar el webhook'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Error al verificar disponibilidad del webhook'
            };
        }
    }
}

module.exports = WebhookIntegration;