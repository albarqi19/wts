/**
 * @file integrationManager.js
 * @description Administrador central de integraciones que maneja todas las integraciones disponibles
 */

const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config/paths');
const { clients } = require('../services/whatsappClient');
const integrationRegistry = require('./integrationRegistry');

// Clase administradora de integraciones
class IntegrationManager {
    constructor() {
        this.integrations = [];
        this.integrationJobs = {};
        
        // Cargar las integraciones desde el archivo
        this.loadIntegrations();
    }

    /**
     * Carga las integraciones desde el archivo
     */
    loadIntegrations() {
        try {
            if (fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
                const rawData = fs.readFileSync(CONFIG.INTEGRATIONS_FILE, 'utf8');
                const integrationData = JSON.parse(rawData);
                
                this.integrations = integrationData.map(data => {
                    return integrationRegistry.createIntegration(data);
                }).filter(Boolean); // Filtrar null/undefined
                
                console.log(`Cargadas ${this.integrations.length} integraciones`);
            } else {
                console.log('No se encontró archivo de integraciones, se creará uno nuevo cuando sea necesario');
                this.integrations = [];
            }
        } catch (error) {
            console.error('Error al cargar las integraciones:', error);
            this.integrations = [];
        }
    }

    /**
     * Guarda todas las integraciones en el archivo
     */
    saveIntegrations() {
        try {
            const dir = path.dirname(CONFIG.INTEGRATIONS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const rawData = JSON.stringify(this.integrations.map(integration => integration.toJSON()), null, 2);
            fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, rawData);
            console.log(`Guardadas ${this.integrations.length} integraciones en ${CONFIG.INTEGRATIONS_FILE}`);
        } catch (error) {
            console.error('Error al guardar las integraciones:', error);
        }
    }

    /**
     * Obtiene todas las integraciones
     * @returns {Array} Lista de integraciones
     */
    getIntegrations() {
        return this.integrations;
    }

    /**
     * Obtiene una integración por su ID
     * @param {string} id ID de la integración
     * @returns {Object|null} Integración o null si no se encuentra
     */
    getIntegrationById(id) {
        return this.integrations.find(integration => integration.id === id) || null;
    }

    /**
     * Añade una nueva integración
     * @param {Object} integrationData Datos de la nueva integración
     * @returns {Object} Integración creada
     */
    addIntegration(integrationData) {
        // Verificar datos mínimos requeridos
        if (!integrationData.type || !integrationData.name || !integrationData.deviceId) {
            throw new Error('Tipo de integración, nombre y dispositivo son obligatorios');
        }
        
        // Verificar que sea un tipo de integración válido
        if (!integrationRegistry.getIntegrationType(integrationData.type)) {
            throw new Error(`Tipo de integración no válido: ${integrationData.type}`);
        }
        
        // Crear ID único para la integración
        const id = uuidv4();
        
        // Crear instancia de la integración
        const integrationWithId = {
            ...integrationData,
            id,
            active: integrationData.active !== undefined ? integrationData.active : true,
            createdAt: new Date().toISOString(),
            syncInterval: integrationData.syncInterval || 5
        };
        
        const newIntegration = integrationRegistry.createIntegration(integrationWithId);
        
        if (!newIntegration) {
            throw new Error(`No se pudo crear la integración de tipo ${integrationData.type}`);
        }
        
        // Guardar la nueva integración
        this.integrations.push(newIntegration);
        this.saveIntegrations();
        
        // Programar si está activa
        if (newIntegration.active) {
            this.scheduleIntegration(newIntegration);
        }
        
        return newIntegration;
    }

    /**
     * Actualiza una integración existente
     * @param {string} id ID de la integración a actualizar
     * @param {Object} updatedData Nuevos datos para la integración
     * @returns {Object} Integración actualizada
     */
    updateIntegration(id, updatedData) {
        const integrationIndex = this.integrations.findIndex(i => i.id === id);
        if (integrationIndex === -1) {
            throw new Error(`Integración no encontrada: ${id}`);
        }
        
        const currentIntegration = this.integrations[integrationIndex];
        
        // Conservar el tipo original y el ID
        const updatedIntegration = {
            ...currentIntegration.toJSON(),
            ...updatedData,
            id: currentIntegration.id,
            type: currentIntegration.type, // El tipo no se puede cambiar
            updatedAt: new Date().toISOString()
        };
        
        // Crear nueva instancia con los datos actualizados
        const newIntegrationInstance = integrationRegistry.createIntegration(updatedIntegration);
        
        if (!newIntegrationInstance) {
            throw new Error(`No se pudo actualizar la integración ${id}`);
        }
        
        // Reemplazar la integración antigua por la nueva
        this.integrations[integrationIndex] = newIntegrationInstance;
        this.saveIntegrations();
        
        // Actualizar programación si es necesario
        if (currentIntegration.active !== newIntegrationInstance.active || 
            currentIntegration.syncInterval !== newIntegrationInstance.syncInterval) {
            
            // Cancelar programación anterior
            if (this.integrationJobs[id]) {
                this.integrationJobs[id].cancel();
                delete this.integrationJobs[id];
            }
            
            // Programar nuevamente si está activa
            if (newIntegrationInstance.active) {
                this.scheduleIntegration(newIntegrationInstance);
            }
        }
        
        return newIntegrationInstance;
    }

    /**
     * Elimina una integración
     * @param {string} id ID de la integración a eliminar
     * @returns {Object} Integración eliminada
     */
    deleteIntegration(id) {
        const integrationIndex = this.integrations.findIndex(i => i.id === id);
        if (integrationIndex === -1) {
            throw new Error(`Integración no encontrada: ${id}`);
        }
        
        // Cancelar programación si existe
        if (this.integrationJobs[id]) {
            this.integrationJobs[id].cancel();
            delete this.integrationJobs[id];
        }
        
        // Eliminar la integración
        const deletedIntegration = this.integrations.splice(integrationIndex, 1)[0];
        
        // Guardar cambios
        this.saveIntegrations();
        
        return deletedIntegration;
    }

    /**
     * Activa o desactiva una integración
     * @param {string} id ID de la integración
     * @param {boolean} active Estado activo o inactivo
     * @returns {Object} Resultado de la operación
     */
    toggleIntegration(id, active) {
        const integration = this.getIntegrationById(id);
        if (!integration) {
            throw new Error(`Integración no encontrada: ${id}`);
        }
        
        const newActive = active !== undefined ? active : !integration.active;
        
        // Actualizar estado
        const updatedIntegration = this.updateIntegration(id, {
            active: newActive
        });
        
        return {
            success: true,
            message: newActive ? 'Integración activada' : 'Integración desactivada',
            active: newActive,
            integration: updatedIntegration
        };
    }

    /**
     * Programa una integración para ejecutarse periódicamente
     * @param {Object} integration Integración a programar
     */
    scheduleIntegration(integration) {
        // Cancelar programación previa si existe
        if (this.integrationJobs[integration.id]) {
            this.integrationJobs[integration.id].cancel();
            delete this.integrationJobs[integration.id];
        }
        
        if (!integration.active) {
            console.log(`La integración ${integration.name} (${integration.id}) no está activa, no se programará`);
            return;
        }
        
        const interval = integration.syncInterval || 5; // Por defecto, cada 5 minutos
        const cronRule = `*/${interval} * * * *`; // Formato: minuto hora día-mes mes día-semana
        
        console.log(`Programando integración ${integration.name} (${integration.id}) para ejecutarse cada ${interval} minutos`);
        
        // Crear trabajo programado
        const job = schedule.scheduleJob(cronRule, async () => {
            await this.runIntegration(integration.id);
        });
        
        // Guardar trabajo programado
        this.integrationJobs[integration.id] = job;
    }

    /**
     * Programa todas las integraciones activas
     */
    scheduleAllIntegrations() {
        console.log('Programando todas las integraciones activas...');
        
        // Cancelar todas las programaciones previas
        Object.values(this.integrationJobs).forEach(job => {
            if (job && typeof job.cancel === 'function') {
                job.cancel();
            }
        });
        
        // Reiniciar objeto de trabajos
        this.integrationJobs = {};
        
        // Programar integraciones activas
        this.integrations.forEach(integration => {
            if (integration.active) {
                this.scheduleIntegration(integration);
            }
        });
        
        console.log(`${Object.keys(this.integrationJobs).length} integraciones programadas`);
    }

    /**
     * Ejecuta manualmente una integración
     * @param {string} id ID de la integración a ejecutar
     * @returns {Promise<Object>} Resultado de la ejecución
     */
    async runIntegration(id) {
        const integration = this.getIntegrationById(id);
        if (!integration) {
            throw new Error(`Integración no encontrada: ${id}`);
        }
        
        try {
            console.log(`Ejecutando manualmente la integración ${integration.name} (${integration.id})`);
            
            // Verificar disponibilidad del cliente de WhatsApp
            const client = clients[integration.deviceId]?.client;
            if (!client || clients[integration.deviceId]?.status !== 'authenticated') {
                throw new Error(`El cliente de WhatsApp para el dispositivo ${integration.deviceId} no está disponible o autenticado`);
            }
            
            // Ejecutar la integración
            const result = await integration.process();
            
            // Actualizar estadísticas
            integration.updateStats(result);
            
            // Guardar cambios
            this.saveIntegrations();
            
            return { 
                success: true, 
                message: 'Integración ejecutada correctamente',
                result 
            };
        } catch (error) {
            console.error(`Error al ejecutar la integración ${integration.name} (${integration.id}):`, error);
            
            // Registrar error
            integration.logError(error);
            
            // Guardar cambios
            this.saveIntegrations();
            
            return { 
                success: false, 
                message: `Error: ${error.message}`,
                error: error.message 
            };
        }
    }

    /**
     * Procesa un mensaje entrante con todas las integraciones relevantes
     * @param {Object} message Mensaje entrante
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async processIncomingMessage(message) {
        const results = [];
        
        // Obtener cliente de WhatsApp para el mensaje
        const clientId = message._data.from.split('@')[0];
        const client = Object.values(clients).find(c => c.info && c.info.wid._serialized === clientId)?.client;
        
        if (!client) {
            console.warn(`No se encontró cliente para procesar mensaje de ${clientId}`);
            return { processed: false, reason: 'Cliente no encontrado' };
        }
        
        // Procesar el mensaje con todas las integraciones activas que deban procesarlo
        for (const integration of this.integrations.filter(i => i.active)) {
            try {
                // Las integraciones de webhook y IA procesan mensajes entrantes
                if (integration.type === 'webhook' && typeof integration.processIncomingMessage === 'function') {
                    const result = await integration.processIncomingMessage(message);
                    results.push({
                        integrationId: integration.id,
                        type: 'webhook',
                        result
                    });
                }
                else if (integration.type === 'ai' && typeof integration.processIncomingMessage === 'function') {
                    const result = await integration.processIncomingMessage(message, client);
                    results.push({
                        integrationId: integration.id,
                        type: 'ai',
                        result
                    });
                }
            } catch (error) {
                console.error(`Error al procesar mensaje con integración ${integration.id}:`, error);
                results.push({
                    integrationId: integration.id,
                    error: error.message
                });
            }
        }
        
        return {
            processed: results.length > 0,
            results
        };
    }

    /**
     * Procesa un cambio de estado de mensaje con todas las integraciones relevantes
     * @param {Object} messageInfo Información del mensaje
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async processMessageStatusChange(messageInfo) {
        const results = [];
        
        // Procesar el cambio de estado con todas las integraciones activas que deban procesarlo
        for (const integration of this.integrations.filter(i => i.active)) {
            try {
                // Solo las integraciones de webhook procesan cambios de estado
                if (integration.type === 'webhook' && typeof integration.processMessageStatusChange === 'function') {
                    const result = await integration.processMessageStatusChange(messageInfo);
                    results.push({
                        integrationId: integration.id,
                        type: 'webhook',
                        result
                    });
                }
            } catch (error) {
                console.error(`Error al procesar cambio de estado con integración ${integration.id}:`, error);
                results.push({
                    integrationId: integration.id,
                    error: error.message
                });
            }
        }
        
        return {
            processed: results.length > 0,
            results
        };
    }
}

// Crear una instancia singleton
const integrationManager = new IntegrationManager();

module.exports = integrationManager;