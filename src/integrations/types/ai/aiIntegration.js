/**
 * @file aiIntegration.js
 * @description Integración con servicios de IA para respuestas automáticas (OpenAI, Dialogflow, etc.)
 */

const axios = require('axios');
const BaseIntegration = require('../../common/baseIntegration');
const { clients } = require('../../../services/whatsappClient');

class AIIntegration extends BaseIntegration {
    constructor(integration) {
        super(integration);
        
        // Verificar existencia de propiedades específicas de IA
        this.config.provider = this.config.provider || 'openai';
        this.config.apiKey = this.config.apiKey || '';
        this.config.model = this.config.model || 'gpt-3.5-turbo';
        this.config.autoReply = this.config.autoReply !== undefined ? this.config.autoReply : true;
        this.config.replyToGroups = this.config.replyToGroups !== undefined ? this.config.replyToGroups : false;
        this.config.systemPrompt = this.config.systemPrompt || 'Eres un asistente amable y eficiente que responde preguntas de clientes por WhatsApp. Sé conciso y útil.';
        this.config.maximumTokens = this.config.maximumTokens || 500;
        this.config.triggerWords = this.config.triggerWords || ['bot', 'ayuda', 'asistente'];
        this.config.autoReplyDelay = this.config.autoReplyDelay || 1000; // milisegundos
        this.config.enabledTimeWindows = this.config.enabledTimeWindows || [
            { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }, // Lun-Vie 9am-6pm
            { days: [6], from: '10:00', to: '14:00' }               // Sábado 10am-2pm
        ];
    }

    /**
     * Valida la configuración de la integración de IA
     * @returns {Object} Resultado de la validación
     */
    validateConfig() {
        if (!this.config.provider) {
            return { isValid: false, message: 'Se requiere el proveedor de IA' };
        }
        
        if (!this.config.apiKey) {
            return { isValid: false, message: 'Se requiere la clave API de IA' };
        }

        return { isValid: true, message: 'Configuración válida' };
    }

    /**
     * Procesa la integración con el servicio de IA
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async process() {
        try {
            console.log(`Iniciando proceso de integración IA ${this.name} (${this.id}) con proveedor ${this.config.provider}`);
            const validation = this.validateConfig();
            
            if (!validation.isValid) {
                throw new Error(`Configuración no válida: ${validation.message}`);
            }
            
            // Este método no realiza ningún procesamiento por lotes
            // La integración con IA está diseñada para funcionar con eventos de mensajes
            console.log(`La integración con IA ${this.name} está configurada y lista para respuestas automáticas`);
            
            return { sent: 0, failed: 0, processed: 0 };
        } catch (error) {
            console.error(`Error en la integración IA ${this.name}:`, error);
            this.logError(error);
            return { 
                sent: 0, 
                failed: 0, 
                processed: 0, 
                error: error.message 
            };
        }
    }

    /**
     * Procesa un mensaje entrante y genera una respuesta de IA si corresponde
     * @param {Object} message Mensaje entrante
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processIncomingMessage(message, client) {
        if (!message || message.fromMe) {
            return { processed: false, reason: 'El mensaje es propio o nulo' };
        }

        // Verificar si el mensaje es de un grupo y si debemos responder a grupos
        const chat = await message.getChat();
        if (chat.isGroup && !this.config.replyToGroups) {
            return { processed: false, reason: 'El mensaje es de un grupo y las respuestas a grupos están desactivadas' };
        }

        // Verificar si estamos dentro de la ventana de tiempo permitida
        if (!this._isWithinEnabledTimeWindow()) {
            return { processed: false, reason: 'Fuera de la ventana de tiempo habilitada' };
        }

        // Verificar si el mensaje contiene palabras detonadoras o si debemos responder automáticamente
        const shouldReply = this.config.autoReply || 
                            this._containsTriggerWords(message.body);

        if (!shouldReply) {
            return { processed: false, reason: 'No se detectaron palabras detonadoras' };
        }

        try {
            // Generar respuesta con IA según el proveedor configurado
            const aiResponse = await this._generateAIResponse(message);
            
            if (!aiResponse) {
                return { processed: true, sent: false, reason: 'No se pudo generar una respuesta' };
            }

            // Enviar respuesta con un pequeño retraso para que parezca más natural
            setTimeout(async () => {
                try {
                    await client.sendMessage(message.from, aiResponse);
                    console.log(`Respuesta de IA enviada a ${message.from}`);
                } catch (sendError) {
                    console.error(`Error al enviar respuesta de IA a ${message.from}:`, sendError);
                }
            }, this.config.autoReplyDelay);
            
            return { processed: true, sent: true, response: aiResponse };
        } catch (error) {
            console.error(`Error al procesar mensaje con IA:`, error);
            return { processed: true, sent: false, error: error.message };
        }
    }

    /**
     * Genera una respuesta utilizando el servicio de IA correspondiente
     * @param {Object} message Mensaje entrante
     * @returns {Promise<string>} Respuesta generada por la IA
     */
    async _generateAIResponse(message) {
        try {
            const messageBody = message.body.trim();
            
            // Si es un mensaje vacío o sólo contiene media, responder genéricamente
            if (!messageBody) {
                return "Gracias por tu mensaje. ¿En qué puedo ayudarte?";
            }

            switch (this.config.provider) {
                case 'openai':
                    return await this._generateOpenAIResponse(messageBody);
                case 'dialogflow':
                    return await this._generateDialogflowResponse(messageBody, message.from);
                case 'custom':
                    return await this._generateCustomAPIResponse(messageBody);
                default:
                    throw new Error(`Proveedor de IA no soportado: ${this.config.provider}`);
            }
        } catch (error) {
            console.error('Error al generar respuesta de IA:', error);
            return "Lo siento, no pude procesar tu mensaje en este momento.";
        }
    }

    /**
     * Verifica si el mensaje contiene palabras detonadoras
     * @param {string} messageText Texto del mensaje
     * @returns {boolean} true si contiene palabras detonadoras
     */
    _containsTriggerWords(messageText) {
        if (!messageText) return false;
        
        const lowerCaseMessage = messageText.toLowerCase();
        return this.config.triggerWords.some(word => 
            lowerCaseMessage.includes(word.toLowerCase())
        );
    }

    /**
     * Comprueba si el momento actual está dentro de una ventana de tiempo habilitada
     * @returns {boolean} true si estamos en una ventana de tiempo habilitada
     */
    _isWithinEnabledTimeWindow() {
        // Si no hay ventanas configuradas, siempre está habilitado
        if (!this.config.enabledTimeWindows || this.config.enabledTimeWindows.length === 0) {
            return true;
        }

        const now = new Date();
        const currentDay = now.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        // Verificar si estamos dentro de alguna ventana habilitada
        return this.config.enabledTimeWindows.some(window => {
            // Comprobar si el día actual está en los días permitidos
            if (!window.days.includes(currentDay)) {
                return false;
            }

            // Comprobar si la hora actual está entre el inicio y el fin
            return currentTime >= window.from && currentTime <= window.to;
        });
    }

    // --- OpenAI ---
    async _generateOpenAIResponse(messageText) {
        try {
            const response = await axios({
                method: 'POST',
                url: 'https://api.openai.com/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                data: {
                    model: this.config.model,
                    messages: [
                        {
                            role: "system",
                            content: this.config.systemPrompt
                        },
                        {
                            role: "user",
                            content: messageText
                        }
                    ],
                    max_tokens: this.config.maximumTokens,
                    temperature: 0.7
                }
            });

            if (response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content.trim();
            } else {
                throw new Error('No se recibió una respuesta válida de OpenAI');
            }
        } catch (error) {
            console.error('Error en la solicitud a OpenAI:', error.message);
            throw error;
        }
    }

    // --- Dialogflow ---
    async _generateDialogflowResponse(messageText, sessionId) {
        try {
            // Dialogflow ES API v2
            const projectId = this.config.projectId || '';
            
            const response = await axios({
                method: 'POST',
                url: `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/sessions/${sessionId}:detectIntent`,
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    queryInput: {
                        text: {
                            text: messageText,
                            languageCode: 'es'
                        }
                    }
                }
            });

            if (response.data && 
                response.data.queryResult && 
                response.data.queryResult.fulfillmentText) {
                return response.data.queryResult.fulfillmentText;
            } else {
                throw new Error('No se recibió una respuesta válida de Dialogflow');
            }
        } catch (error) {
            console.error('Error en la solicitud a Dialogflow:', error.message);
            throw error;
        }
    }

    // --- API Personalizada ---
    async _generateCustomAPIResponse(messageText) {
        try {
            if (!this.config.customApiUrl) {
                throw new Error('URL de API personalizada no configurada');
            }
            
            const response = await axios({
                method: 'POST',
                url: this.config.customApiUrl,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.config.customApiAuth || ''
                },
                data: {
                    message: messageText,
                    config: {
                        systemPrompt: this.config.systemPrompt,
                        maxTokens: this.config.maximumTokens
                    }
                }
            });

            if (response.data && response.data.response) {
                return response.data.response;
            } else {
                throw new Error('La respuesta de la API personalizada no tiene el formato esperado');
            }
        } catch (error) {
            console.error('Error en la solicitud a la API personalizada:', error.message);
            throw error;
        }
    }
}

module.exports = AIIntegration;