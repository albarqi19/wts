/**
 * @file emailIntegration.js
 * @description Integración con plataformas de marketing por correo electrónico (Mailchimp, SendGrid, Sendinblue)
 */

const axios = require('axios');
const BaseIntegration = require('../../common/baseIntegration');
const { clients } = require('../../../services/whatsappClient');

class EmailIntegration extends BaseIntegration {
    constructor(integration) {
        super(integration);
        
        // Verificar existencia de propiedades específicas de Email
        this.config.provider = this.config.provider || 'mailchimp';
        this.config.apiKey = this.config.apiKey || '';
        this.config.listId = this.config.listId || '';
        this.config.syncContacts = this.config.syncContacts !== undefined ? this.config.syncContacts : true;
        this.config.sendCampaigns = this.config.sendCampaigns !== undefined ? this.config.sendCampaigns : true;
        this.config.defaultCampaignTag = this.config.defaultCampaignTag || 'whatsapp';
    }

    /**
     * Valida la configuración de la integración de Email
     * @returns {Object} Resultado de la validación
     */
    validateConfig() {
        if (!this.config.provider) {
            return { isValid: false, message: 'Se requiere el proveedor de Email Marketing' };
        }
        
        if (!this.config.apiKey) {
            return { isValid: false, message: 'Se requiere la clave API' };
        }

        if (this.config.syncContacts && !this.config.listId) {
            return { isValid: false, message: 'Se requiere el ID de la lista para sincronización de contactos' };
        }

        return { isValid: true, message: 'Configuración válida' };
    }

    /**
     * Procesa la integración con la plataforma de Email Marketing
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async process() {
        try {
            console.log(`Iniciando proceso de integración Email ${this.name} (${this.id}) con proveedor ${this.config.provider}`);
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

            // Sincronizar contactos de WhatsApp a la plataforma de Email si está habilitado
            if (this.config.syncContacts) {
                const contactSyncResult = await this.syncContactsToEmailPlatform(client);
                stats.processed += contactSyncResult.processed;
                stats.sent += contactSyncResult.sent;
                stats.failed += contactSyncResult.failed;
            }

            // Enviar campañas pendientes por WhatsApp si está habilitado
            if (this.config.sendCampaigns) {
                const campaignResult = await this.sendCampaignsViaWhatsApp(client);
                stats.processed += campaignResult.processed;
                stats.sent += campaignResult.sent;
                stats.failed += campaignResult.failed;
            }

            console.log(`Completado proceso de integración Email ${this.name}: ${JSON.stringify(stats)}`);
            return stats;
        } catch (error) {
            console.error(`Error en la integración Email ${this.name}:`, error);
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
     * Sincroniza contactos de WhatsApp a la plataforma de Email Marketing
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Estadísticas de la sincronización
     */
    async syncContactsToEmailPlatform(client) {
        const stats = { sent: 0, failed: 0, processed: 0 };
        console.log(`Sincronizando contactos de WhatsApp a ${this.config.provider}`);
        
        try {
            // Obtener contactos de WhatsApp
            const contacts = await client.getContacts();
            stats.processed = contacts.length;
            
            // Filtrar contactos válidos (que tengan nombre)
            const validContacts = contacts.filter(contact => 
                contact.name || contact.pushname || contact.shortName || contact.formattedName
            );
            
            if (validContacts.length === 0) {
                console.log('No hay contactos válidos para sincronizar');
                return stats;
            }
            
            // Implementación específica para cada proveedor
            switch (this.config.provider) {
                case 'mailchimp':
                    await this._syncContactsToMailchimp(validContacts, stats);
                    break;
                case 'sendgrid':
                    await this._syncContactsToSendGrid(validContacts, stats);
                    break;
                case 'sendinblue':
                    await this._syncContactsToSendinblue(validContacts, stats);
                    break;
                default:
                    throw new Error(`Proveedor de Email no soportado: ${this.config.provider}`);
            }
            
            return stats;
        } catch (error) {
            console.error(`Error sincronizando contactos a ${this.config.provider}:`, error);
            stats.failed = stats.processed;
            throw error;
        }
    }

    /**
     * Envía campañas por WhatsApp
     * @param {Object} client Cliente de WhatsApp
     * @returns {Promise<Object>} Estadísticas del envío
     */
    async sendCampaignsViaWhatsApp(client) {
        const stats = { sent: 0, failed: 0, processed: 0 };
        console.log(`Buscando campañas para enviar por WhatsApp desde ${this.config.provider}`);
        
        try {
            // Implementación específica para cada proveedor
            switch (this.config.provider) {
                case 'mailchimp':
                    await this._sendMailchimpCampaigns(client, stats);
                    break;
                case 'sendgrid':
                    await this._sendSendGridCampaigns(client, stats);
                    break;
                case 'sendinblue':
                    await this._sendSendinblueCampaigns(client, stats);
                    break;
                default:
                    throw new Error(`Proveedor de Email no soportado: ${this.config.provider}`);
            }
            
            return stats;
        } catch (error) {
            console.error(`Error enviando campañas desde ${this.config.provider}:`, error);
            stats.failed = stats.processed;
            throw error;
        }
    }

    // --- Mailchimp ---
    async _syncContactsToMailchimp(contacts, stats) {
        try {
            // Verificar al menos un contacto con correo electrónico
            const contactsWithEmail = contacts.filter(contact => contact.email);
            
            if (contactsWithEmail.length === 0) {
                console.log('No hay contactos con correo electrónico para sincronizar con Mailchimp');
                return;
            }
            
            const datacenter = this.config.apiKey.split('-')[1]; // Extraer datacenter del API Key
            
            // Preparar datos para operación por lotes
            const operations = contactsWithEmail.map(contact => ({
                method: 'POST',
                path: `/lists/${this.config.listId}/members`,
                body: JSON.stringify({
                    email_address: contact.email,
                    status: 'subscribed',
                    merge_fields: {
                        FNAME: contact.name || contact.pushname || '',
                        PHONE: contact.id.user
                    },
                    tags: ['whatsapp']
                })
            }));
            
            // Crear operación por lotes
            const batchResponse = await axios({
                method: 'POST',
                url: `https://${datacenter}.api.mailchimp.com/3.0/batches`,
                auth: {
                    username: 'anystring',
                    password: this.config.apiKey
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                data: {
                    operations: operations
                }
            });
            
            console.log(`Operación por lotes de Mailchimp iniciada: ${batchResponse.data.id}`);
            stats.sent = contactsWithEmail.length;
        } catch (error) {
            console.error('Error en la sincronización con Mailchimp:', error.message);
            stats.failed = stats.processed;
        }
    }

    async _sendMailchimpCampaigns(client, stats) {
        try {
            const datacenter = this.config.apiKey.split('-')[1];
            
            // Buscar campañas con la etiqueta de WhatsApp
            const campaignsResponse = await axios({
                method: 'GET',
                url: `https://${datacenter}.api.mailchimp.com/3.0/campaigns`,
                auth: {
                    username: 'anystring',
                    password: this.config.apiKey
                },
                params: {
                    status: 'sent',
                    tag: this.config.defaultCampaignTag,
                    count: 5,
                    sort_field: 'send_time',
                    sort_dir: 'desc'
                }
            });
            
            const campaigns = campaignsResponse.data.campaigns;
            if (!campaigns || campaigns.length === 0) {
                console.log('No hay campañas recientes para enviar por WhatsApp');
                return stats;
            }
            
            stats.processed = campaigns.length;
            
            // Procesar solo la campaña más reciente
            const recentCampaign = campaigns[0];
            
            // Obtener el contenido de la campaña
            const contentResponse = await axios({
                method: 'GET',
                url: `https://${datacenter}.api.mailchimp.com/3.0/campaigns/${recentCampaign.id}/content`,
                auth: {
                    username: 'anystring',
                    password: this.config.apiKey
                }
            });
            
            const htmlContent = contentResponse.data.html;
            
            // Convertir HTML a texto plano simple
            const textContent = this._convertHtmlToText(htmlContent);
            
            // Obtener suscriptores de la lista
            const membersResponse = await axios({
                method: 'GET',
                url: `https://${datacenter}.api.mailchimp.com/3.0/lists/${this.config.listId}/members`,
                auth: {
                    username: 'anystring',
                    password: this.config.apiKey
                },
                params: {
                    count: 100,
                    status: 'subscribed'
                }
            });
            
            const members = membersResponse.data.members;
            
            // Enviar la campaña por WhatsApp a los miembros que tienen teléfono
            for (const member of members) {
                try {
                    const phone = member.merge_fields.PHONE;
                    if (phone) {
                        const message = `*${recentCampaign.settings.subject_line}*\n\n${textContent}\n\n(Campaña de email enviada por WhatsApp)`;
                        await client.sendMessage(`${phone}@c.us`, message);
                        stats.sent++;
                    }
                } catch (error) {
                    console.error(`Error al enviar campaña a ${member.email_address}:`, error.message);
                    stats.failed++;
                }
            }
        } catch (error) {
            console.error('Error al procesar campañas de Mailchimp:', error.message);
            stats.failed = stats.processed;
        }
    }

    // --- SendGrid ---
    async _syncContactsToSendGrid(contacts, stats) {
        try {
            // Preparar contactos en formato SendGrid
            const contactsData = contacts.map(contact => ({
                email: contact.email || `${contact.id.user}@whatsapp.placeholder`,
                first_name: contact.name || contact.pushname || '',
                phone_number: contact.id.user,
                custom_fields: {
                    whatsapp_id: contact.id._serialized
                }
            }));
            
            // Crear contactos en SendGrid
            await axios({
                method: 'PUT',
                url: 'https://api.sendgrid.com/v3/marketing/contacts',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    list_ids: [this.config.listId],
                    contacts: contactsData
                }
            });
            
            stats.sent = contactsData.length;
        } catch (error) {
            console.error('Error en la sincronización con SendGrid:', error.message);
            stats.failed = stats.processed;
        }
    }

    async _sendSendGridCampaigns(client, stats) {
        // SendGrid no tiene una API sencilla para obtener campañas recientes
        // Esta es una implementación simplificada
        console.log('Envío de campañas de SendGrid por WhatsApp no implementado completamente');
        return stats;
    }

    // --- Sendinblue ---
    async _syncContactsToSendinblue(contacts, stats) {
        try {
            // Crear contactos por lotes en Sendinblue
            const contactBatches = [];
            const batchSize = 50;
            
            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                
                const contactsData = batch.map(contact => ({
                    email: contact.email || `${contact.id.user}@whatsapp.placeholder`,
                    attributes: {
                        FIRSTNAME: contact.name || contact.pushname || '',
                        SMS: contact.id.user,
                        WHATSAPP_ID: contact.id._serialized
                    },
                    listIds: [parseInt(this.config.listId)]
                }));
                
                contactBatches.push(contactsData);
            }
            
            for (const batch of contactBatches) {
                await axios({
                    method: 'POST',
                    url: 'https://api.sendinblue.com/v3/contacts/import',
                    headers: {
                        'api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        contacts: batch,
                        updateEnabled: true
                    }
                });
                
                stats.sent += batch.length;
            }
        } catch (error) {
            console.error('Error en la sincronización con Sendinblue:', error.message);
            stats.failed = stats.processed;
        }
    }

    async _sendSendinblueCampaigns(client, stats) {
        try {
            // Obtener últimas campañas de email
            const campaignsResponse = await axios({
                method: 'GET',
                url: 'https://api.sendinblue.com/v3/emailCampaigns',
                headers: {
                    'api-key': this.config.apiKey
                },
                params: {
                    limit: 5,
                    offset: 0,
                    sort: 'desc'
                }
            });
            
            const campaigns = campaignsResponse.data.campaigns;
            if (!campaigns || campaigns.length === 0) {
                console.log('No hay campañas de Sendinblue para enviar');
                return stats;
            }
            
            // Filtrar campañas que tengan la etiqueta de WhatsApp
            const whatsappCampaigns = campaigns.filter(campaign => 
                campaign.tag && campaign.tag.includes(this.config.defaultCampaignTag)
            );
            
            if (whatsappCampaigns.length === 0) {
                console.log(`No hay campañas con la etiqueta ${this.config.defaultCampaignTag}`);
                return stats;
            }
            
            stats.processed = whatsappCampaigns.length;
            
            // Obtener detalles de la campaña más reciente
            const recentCampaign = whatsappCampaigns[0];
            
            // Obtener contactos de la lista
            const contactsResponse = await axios({
                method: 'GET',
                url: `https://api.sendinblue.com/v3/contacts/lists/${this.config.listId}/contacts`,
                headers: {
                    'api-key': this.config.apiKey
                },
                params: {
                    limit: 100
                }
            });
            
            const contacts = contactsResponse.data.contacts;
            
            // Enviar la campaña por WhatsApp a los contactos con número
            for (const contact of contacts) {
                try {
                    const phone = contact.attributes.SMS;
                    if (phone) {
                        let message = `*${recentCampaign.name}*\n\n`;
                        
                        if (recentCampaign.subject) {
                            message += `${recentCampaign.subject}\n\n`;
                        }
                        
                        message += `Para ver la campaña completa, revisa tu correo.\n\n(Enviado por WhatsApp desde ${this.name})`;
                        
                        await client.sendMessage(`${phone}@c.us`, message);
                        stats.sent++;
                    }
                } catch (error) {
                    console.error(`Error al enviar campaña a ${contact.email}:`, error.message);
                    stats.failed++;
                }
            }
        } catch (error) {
            console.error('Error al procesar campañas de Sendinblue:', error.message);
            stats.failed = stats.processed;
        }
    }

    /**
     * Convierte contenido HTML a texto plano
     * @param {string} html Contenido HTML
     * @returns {string} Texto plano
     */
    _convertHtmlToText(html) {
        return html
            .replace(/<style([\s\S]*?)<\/style>/gi, '')
            .replace(/<script([\s\S]*?)<\/script>/gi, '')
            .replace(/<\/div>/ig, '\n')
            .replace(/<\/li>/ig, '\n')
            .replace(/<li>/ig, '  * ')
            .replace(/<\/ul>/ig, '\n')
            .replace(/<\/p>/ig, '\n')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<[^>]+>/ig, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim();
    }
}

module.exports = EmailIntegration;