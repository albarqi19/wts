/**
 * @file crmIntegration.js
 * @description Integración con sistemas CRM populares (HubSpot, Salesforce, Zoho)
 */

const axios = require('axios');
const BaseIntegration = require('../../common/baseIntegration');
const { clients } = require('../../../services/whatsappClient');

class CRMIntegration extends BaseIntegration {
    constructor(integration) {
        super(integration);
        
        // Verificar existencia de propiedades específicas de CRM
        this.config.provider = this.config.provider || 'hubspot';
        this.config.apiKey = this.config.apiKey || '';
        this.config.contactsSync = this.config.contactsSync !== undefined ? this.config.contactsSync : true;
        this.config.messageSync = this.config.messageSync !== undefined ? this.config.messageSync : true;
        this.config.syncDirection = this.config.syncDirection || 'bidirectional'; // bidirectional, toWhatsApp, fromWhatsApp
    }

    /**
     * Valida la configuración de la integración CRM
     * @returns {Object} Resultado de la validación
     */
    validateConfig() {
        if (!this.config.provider) {
            return { isValid: false, message: 'Se requiere el proveedor de CRM' };
        }
        
        if (!this.config.apiKey) {
            return { isValid: false, message: 'Se requiere la clave API del CRM' };
        }

        return { isValid: true, message: 'Configuración válida' };
    }

    /**
     * Procesa la integración con el CRM
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async process() {
        try {
            console.log(`Iniciando proceso de integración CRM ${this.name} (${this.id}) con proveedor ${this.config.provider}`);
            const validation = this.validateConfig();
            
            if (!validation.isValid) {
                throw new Error(`Configuración no válida: ${validation.message}`);
            }
            
            // Verificar disponibilidad del cliente de WhatsApp
            const client = clients[this.deviceId]?.client;
            if (!client || clients[this.deviceId]?.status !== 'authenticated') {
                throw new Error(`El cliente de WhatsApp para el dispositivo ${this.deviceId} no está disponible o autenticado`);
            }

            const stats = { sent: 0, failed: 0, processed: 0 };

            // Sincronizar según la dirección configurada
            if (this.config.syncDirection === 'bidirectional' || this.config.syncDirection === 'fromWhatsApp') {
                // Sincronizar contactos de WhatsApp al CRM si está habilitado
                if (this.config.contactsSync) {
                    const contactSyncResult = await this.syncContactsToCRM(client);
                    stats.processed += contactSyncResult.processed;
                    stats.sent += contactSyncResult.sent;
                    stats.failed += contactSyncResult.failed;
                }

                // Sincronizar mensajes de WhatsApp al CRM si está habilitado
                if (this.config.messageSync) {
                    const messageSyncResult = await this.syncMessagesToCRM(client);
                    stats.processed += messageSyncResult.processed;
                    stats.sent += messageSyncResult.sent;
                    stats.failed += messageSyncResult.failed;
                }
            }

            if (this.config.syncDirection === 'bidirectional' || this.config.syncDirection === 'toWhatsApp') {
                // Sincronizar mensajes/tareas del CRM a WhatsApp
                const tasksResult = await this.syncTasksToWhatsApp(client);
                stats.processed += tasksResult.processed;
                stats.sent += tasksResult.sent;
                stats.failed += tasksResult.failed;
            }

            console.log(`Completado proceso de integración CRM ${this.name}: ${JSON.stringify(stats)}`);
            return stats;
        } catch (error) {
            console.error(`Error en la integración CRM ${this.name}:`, error);
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
     * Sincroniza contactos de WhatsApp al CRM
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Estadísticas de la sincronización
     */
    async syncContactsToCRM(client) {
        const stats = { sent: 0, failed: 0, processed: 0 };
        console.log(`Sincronizando contactos de WhatsApp al CRM ${this.config.provider}`);
        
        try {
            // Obtener contactos de WhatsApp
            const contacts = await client.getContacts();
            stats.processed = contacts.length;
            
            // Implementación específica para cada proveedor de CRM
            switch (this.config.provider) {
                case 'hubspot':
                    await this._syncContactsToHubSpot(contacts, stats);
                    break;
                case 'salesforce':
                    await this._syncContactsToSalesforce(contacts, stats);
                    break;
                case 'zoho':
                    await this._syncContactsToZoho(contacts, stats);
                    break;
                default:
                    throw new Error(`Proveedor CRM no soportado: ${this.config.provider}`);
            }
            
            return stats;
        } catch (error) {
            console.error(`Error sincronizando contactos al CRM:`, error);
            stats.failed = stats.processed;
            throw error;
        }
    }

    /**
     * Sincroniza mensajes de WhatsApp al CRM
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Estadísticas de la sincronización
     */
    async syncMessagesToCRM(client) {
        const stats = { sent: 0, failed: 0, processed: 0 };
        console.log(`Sincronizando mensajes de WhatsApp al CRM ${this.config.provider}`);
        
        try {
            // Obtener chats y mensajes recientes
            const chats = await client.getChats();
            const lastSync = this.lastSync ? new Date(this.lastSync) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Últimas 24h por defecto
            
            for (const chat of chats) {
                try {
                    // Filtrar mensajes desde la última sincronización
                    const messages = await chat.fetchMessages({ limit: 50 });
                    const newMessages = messages.filter(msg => {
                        const msgDate = new Date(msg.timestamp * 1000);
                        return msgDate > lastSync;
                    });
                    
                    stats.processed += newMessages.length;
                    
                    // Implementación específica para cada proveedor
                    switch (this.config.provider) {
                        case 'hubspot':
                            await this._syncMessagesToHubSpot(chat, newMessages, stats);
                            break;
                        case 'salesforce':
                            await this._syncMessagesToSalesforce(chat, newMessages, stats);
                            break;
                        case 'zoho':
                            await this._syncMessagesToZoho(chat, newMessages, stats);
                            break;
                        default:
                            throw new Error(`Proveedor CRM no soportado: ${this.config.provider}`);
                    }
                } catch (chatError) {
                    console.error(`Error procesando chat ${chat.name}:`, chatError);
                    stats.failed += 1;
                }
            }
            
            return stats;
        } catch (error) {
            console.error(`Error sincronizando mensajes al CRM:`, error);
            stats.failed = stats.processed;
            throw error;
        }
    }

    /**
     * Sincroniza tareas/mensajes del CRM a WhatsApp
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Estadísticas de la sincronización
     */
    async syncTasksToWhatsApp(client) {
        const stats = { sent: 0, failed: 0, processed: 0 };
        console.log(`Sincronizando tareas/mensajes del CRM ${this.config.provider} a WhatsApp`);
        
        try {
            // Implementación específica para cada proveedor
            switch (this.config.provider) {
                case 'hubspot':
                    await this._syncTasksFromHubSpot(client, stats);
                    break;
                case 'salesforce':
                    await this._syncTasksFromSalesforce(client, stats);
                    break;
                case 'zoho':
                    await this._syncTasksFromZoho(client, stats);
                    break;
                default:
                    throw new Error(`Proveedor CRM no soportado: ${this.config.provider}`);
            }
            
            return stats;
        } catch (error) {
            console.error(`Error sincronizando tareas del CRM:`, error);
            stats.failed = stats.processed;
            throw error;
        }
    }

    // Métodos específicos para cada proveedor de CRM

    // --- HubSpot ---
    async _syncContactsToHubSpot(contacts, stats) {
        // Implementación de la sincronización de contactos a HubSpot
        for (const contact of contacts) {
            try {
                const contactData = {
                    properties: {
                        firstname: contact.name || contact.pushname || '',
                        phone: contact.id.user,
                        whatsapp_id: contact.id._serialized
                    }
                };

                await axios({
                    method: 'POST',
                    url: 'https://api.hubapi.com/crm/v3/objects/contacts',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    data: contactData
                });

                stats.sent++;
            } catch (error) {
                console.error(`Error al sincronizar contacto ${contact.id.user} a HubSpot:`, error.message);
                stats.failed++;
            }
        }
    }

    async _syncMessagesToHubSpot(chat, messages, stats) {
        // Implementación de la sincronización de mensajes a HubSpot
        // Esta es una implementación simplificada que registra las actividades en HubSpot
        
        if (!messages.length) return;
        
        try {
            // Obtener el contacto asociado en HubSpot
            const contactResponse = await axios({
                method: 'GET',
                url: `https://api.hubapi.com/crm/v3/objects/contacts/search`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                data: {
                    filterGroups: [{
                        filters: [{
                            propertyName: 'phone',
                            operator: 'EQ',
                            value: chat.id.user
                        }]
                    }]
                }
            });
            
            if (contactResponse.data.total === 0) {
                console.warn(`No se encontró contacto en HubSpot para ${chat.id.user}`);
                stats.failed += messages.length;
                return;
            }
            
            const contactId = contactResponse.data.results[0].id;
            
            // Registrar mensajes como notas/actividades
            for (const msg of messages) {
                try {
                    const noteData = {
                        properties: {
                            hs_note_body: msg.body,
                            hs_timestamp: new Date(msg.timestamp * 1000).getTime(),
                            hs_note_body_html: `<p>${msg.fromMe ? 'Enviado' : 'Recibido'}: ${msg.body}</p>`
                        },
                        associations: [{
                            to: {
                                id: contactId
                            },
                            types: [{
                                associationCategory: "HUBSPOT_DEFINED",
                                associationTypeId: 1
                            }]
                        }]
                    };
                    
                    await axios({
                        method: 'POST',
                        url: 'https://api.hubapi.com/crm/v3/objects/notes',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.config.apiKey}`
                        },
                        data: noteData
                    });
                    
                    stats.sent++;
                } catch (error) {
                    console.error(`Error al registrar mensaje en HubSpot:`, error.message);
                    stats.failed++;
                }
            }
        } catch (error) {
            console.error(`Error general al sincronizar mensajes a HubSpot:`, error.message);
            stats.failed += messages.length;
        }
    }

    async _syncTasksFromHubSpot(client, stats) {
        try {
            // Buscar tareas pendientes en HubSpot con etiqueta "whatsapp"
            const tasksResponse = await axios({
                method: 'GET',
                url: `https://api.hubapi.com/crm/v3/objects/tasks/search`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                data: {
                    filterGroups: [{
                        filters: [{
                            propertyName: 'hs_task_status',
                            operator: 'EQ',
                            value: 'NOT_STARTED'
                        }, {
                            propertyName: 'hs_task_subject',
                            operator: 'CONTAINS_TOKEN',
                            value: 'whatsapp'
                        }]
                    }]
                },
                properties: ['hs_task_body', 'hubspot_owner_id']
            });
            
            const tasks = tasksResponse.data.results || [];
            stats.processed = tasks.length;
            
            for (const task of tasks) {
                try {
                    // Buscar el contacto asociado
                    const associationsResponse = await axios({
                        method: 'GET',
                        url: `https://api.hubapi.com/crm/v3/objects/tasks/${task.id}/associations/contacts`,
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`
                        }
                    });
                    
                    if (!associationsResponse.data.results.length) {
                        console.warn(`Tarea ${task.id} no tiene contacto asociado`);
                        stats.failed++;
                        continue;
                    }
                    
                    const contactId = associationsResponse.data.results[0].id;
                    
                    // Obtener detalles del contacto
                    const contactResponse = await axios({
                        method: 'GET',
                        url: `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`
                        },
                        params: {
                            properties: 'phone'
                        }
                    });
                    
                    const phone = contactResponse.data.properties.phone;
                    if (!phone) {
                        console.warn(`Contacto ${contactId} no tiene número de teléfono`);
                        stats.failed++;
                        continue;
                    }
                    
                    // Enviar mensaje por WhatsApp
                    const message = task.properties.hs_task_body;
                    const formattedPhone = `${phone}@c.us`;
                    
                    await client.sendMessage(formattedPhone, message);
                    
                    // Actualizar tarea como completada
                    await axios({
                        method: 'PATCH',
                        url: `https://api.hubapi.com/crm/v3/objects/tasks/${task.id}`,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.config.apiKey}`
                        },
                        data: {
                            properties: {
                                hs_task_status: 'COMPLETED'
                            }
                        }
                    });
                    
                    stats.sent++;
                } catch (error) {
                    console.error(`Error al procesar tarea ${task.id}:`, error.message);
                    stats.failed++;
                }
            }
        } catch (error) {
            console.error(`Error general al sincronizar tareas de HubSpot:`, error.message);
            throw error;
        }
        
        return stats;
    }

    // --- Salesforce ---
    async _syncContactsToSalesforce(contacts, stats) {
        // Implementación de sincronización de contactos con Salesforce
        // Código simplificado - en una implementación real, se utilizaría la API de JSforce o similar
        for (const contact of contacts) {
            try {
                // Implementación básica de ejemplo
                await axios({
                    method: 'POST',
                    url: `${this.config.instanceUrl}/services/data/v55.0/sobjects/Contact`,
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        FirstName: contact.name || '',
                        LastName: contact.pushname || 'WhatsApp Contact',
                        Phone: contact.id.user,
                        WhatsApp_ID__c: contact.id._serialized
                    }
                });
                
                stats.sent++;
            } catch (error) {
                console.error(`Error al sincronizar contacto ${contact.id.user} a Salesforce:`, error.message);
                stats.failed++;
            }
        }
    }

    async _syncMessagesToSalesforce(chat, messages, stats) {
        // Implementación simplificada para Salesforce
        // En una implementación real, se usaría una biblioteca específica para Salesforce
        console.log(`Sincronización de mensajes a Salesforce no implementada completamente`);
        stats.processed = messages.length;
        stats.failed = messages.length; // Marcamos como fallidos por ahora
    }

    async _syncTasksFromSalesforce(client, stats) {
        // Implementación simplificada para Salesforce
        console.log(`Sincronización de tareas desde Salesforce no implementada completamente`);
        return stats;
    }

    // --- Zoho ---
    async _syncContactsToZoho(contacts, stats) {
        // Implementación simplificada para Zoho
        for (const contact of contacts) {
            try {
                await axios({
                    method: 'POST',
                    url: `https://www.zohoapis.com/crm/v2/Contacts`,
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        data: [{
                            First_Name: contact.name || '',
                            Last_Name: contact.pushname || 'WhatsApp Contact',
                            Phone: contact.id.user,
                            WhatsApp_ID: contact.id._serialized
                        }]
                    }
                });
                
                stats.sent++;
            } catch (error) {
                console.error(`Error al sincronizar contacto ${contact.id.user} a Zoho:`, error.message);
                stats.failed++;
            }
        }
    }

    async _syncMessagesToZoho(chat, messages, stats) {
        // Implementación simplificada para Zoho
        console.log(`Sincronización de mensajes a Zoho no implementada completamente`);
        stats.processed = messages.length;
        stats.failed = messages.length;
    }

    async _syncTasksFromZoho(client, stats) {
        // Implementación simplificada para Zoho
        console.log(`Sincronización de tareas desde Zoho no implementada completamente`);
        return stats;
    }
}

module.exports = CRMIntegration;