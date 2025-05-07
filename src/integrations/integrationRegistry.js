/**
 * @file integrationRegistry.js
 * @description Registro central de todos los tipos de integraciones disponibles
 */

// Importaciones de los diferentes tipos de integraciones
const GoogleSheetsIntegration = require('./types/googleSheets/googleSheetsIntegration');
const WebhookIntegration = require('./types/webhook/webhookIntegration');
const CRMIntegration = require('./types/crm/crmIntegration');
const EmailIntegration = require('./types/email/emailIntegration');
const AIIntegration = require('./types/ai/aiIntegration');

/**
 * Clase que administra el registro de todos los tipos de integraciones disponibles
 */
class IntegrationRegistry {
    constructor() {
        // Registro de tipos de integración
        this.integrationTypes = {
            'google_sheets': {
                name: 'Google Sheets',
                description: 'Integración con hojas de cálculo de Google',
                class: GoogleSheetsIntegration,
                icon: 'bi-file-earmark-spreadsheet'
            },
            'webhook': {
                name: 'Webhook',
                description: 'Integración con sistemas externos a través de webhooks',
                class: WebhookIntegration,
                icon: 'bi-link-45deg'
            },
            'crm': {
                name: 'CRM',
                description: 'Integración con sistemas CRM populares',
                class: CRMIntegration,
                icon: 'bi-people'
            },
            'email': {
                name: 'Email Marketing',
                description: 'Integración con plataformas de marketing por email',
                class: EmailIntegration,
                icon: 'bi-envelope'
            },
            'ai': {
                name: 'AI Assistant',
                description: 'Integración con servicios de Inteligencia Artificial para respuestas automáticas',
                class: AIIntegration,
                icon: 'bi-robot'
            }
        };
        
        // Sistemas CRM soportados
        this.crmSystems = {
            'hubspot': {
                name: 'HubSpot',
                description: 'Plataforma de CRM todo en uno'
            },
            'salesforce': {
                name: 'Salesforce',
                description: 'Plataforma líder de CRM en la nube'
            },
            'zoho': {
                name: 'Zoho CRM',
                description: 'Solución CRM completa para negocios de todo tamaño'
            }
        };
        
        // Plataformas de Email Marketing soportadas
        this.emailPlatforms = {
            'mailchimp': {
                name: 'Mailchimp',
                description: 'Plataforma de marketing por email y automatización'
            },
            'sendgrid': {
                name: 'SendGrid',
                description: 'Servicio de entrega de email en la nube'
            },
            'sendinblue': {
                name: 'Sendinblue',
                description: 'Plataforma de marketing digital todo en uno'
            }
        };
        
        // Servicios de IA soportados
        this.aiServices = {
            'openai': {
                name: 'OpenAI',
                description: 'Integración con la API de ChatGPT para respuestas automáticas inteligentes'
            },
            'dialogflow': {
                name: 'Dialogflow',
                description: 'Plataforma de comprensión del lenguaje natural de Google'
            },
            'custom': {
                name: 'API Personalizada',
                description: 'Integración con API personalizada de IA'
            }
        };
    }

    /**
     * Obtiene todos los tipos de integración disponibles
     * @returns {Object} Tipos de integración disponibles
     */
    getIntegrationTypes() {
        return this.integrationTypes;
    }

    /**
     * Obtiene un tipo de integración específico
     * @param {string} type Tipo de integración
     * @returns {Object|null} Información del tipo de integración o null si no existe
     */
    getIntegrationType(type) {
        return this.integrationTypes[type] || null;
    }

    /**
     * Obtiene todos los sistemas CRM soportados
     * @returns {Object} Sistemas CRM soportados
     */
    getCRMSystems() {
        return this.crmSystems;
    }

    /**
     * Obtiene todas las plataformas de Email Marketing soportadas
     * @returns {Object} Plataformas de Email Marketing soportadas
     */
    getEmailPlatforms() {
        return this.emailPlatforms;
    }

    /**
     * Obtiene todos los servicios de IA soportados
     * @returns {Object} Servicios de IA soportados
     */
    getAIServices() {
        return this.aiServices;
    }

    /**
     * Crea una instancia de integración basada en los datos
     * @param {Object} integrationData Datos de la integración
     * @returns {Object|null} Instancia de la integración o null si el tipo no existe
     */
    createIntegration(integrationData) {
        const type = integrationData.type;
        const integrationTypeInfo = this.getIntegrationType(type);
        
        if (!integrationTypeInfo) {
            console.error(`Tipo de integración desconocido: ${type}`);
            return null;
        }
        
        try {
            return new integrationTypeInfo.class(integrationData);
        } catch (error) {
            console.error(`Error al crear integración de tipo ${type}:`, error);
            return null;
        }
    }
}

module.exports = new IntegrationRegistry();