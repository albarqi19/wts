/**
 * @file baseIntegration.js
 * @description Clase base para todas las integraciones
 */

class BaseIntegration {
    constructor(integration) {
        this.id = integration.id;
        this.name = integration.name;
        this.type = integration.type;
        this.deviceId = integration.deviceId;
        this.config = integration.config || {};
        this.syncInterval = integration.syncInterval || 5;
        this.active = integration.active !== undefined ? integration.active : true;
        this.createdAt = integration.createdAt || new Date().toISOString();
        this.updatedAt = integration.updatedAt;
        this.lastSync = integration.lastSync;
        this.stats = integration.stats || { sent: 0, failed: 0, processed: 0 };
        this.lastError = integration.lastError;
    }

    /**
     * Validar la configuración de la integración
     * @returns {Object} Resultado de la validación { isValid: boolean, message: string }
     */
    validateConfig() {
        return { isValid: true, message: 'Valid configuration' };
    }

    /**
     * Procesa la integración (debe ser implementado por las clases hijas)
     * @returns {Promise<Object>} Resultados del procesamiento
     */
    async process() {
        throw new Error('El método process() debe ser implementado por las clases hijas');
    }

    /**
     * Actualiza las estadísticas después del procesamiento
     * @param {Object} result Resultados del procesamiento
     */
    updateStats(result) {
        if (!result) return;

        this.lastSync = new Date().toISOString();
        
        // Acumular estadísticas
        this.stats.sent = (this.stats.sent || 0) + (result.sent || 0);
        this.stats.failed = (this.stats.failed || 0) + (result.failed || 0);
        this.stats.processed = (this.stats.processed || 0) + (result.processed || 0);
        
        // Guardar resultados de la última ejecución
        this.stats.lastRun = {
            date: this.lastSync,
            stats: result
        };
        
        // Limpiar error si la ejecución fue exitosa
        if (!result.error) {
            delete this.lastError;
        }
    }

    /**
     * Registra un error en la integración
     * @param {Error} error Error ocurrido
     */
    logError(error) {
        this.lastError = {
            date: new Date().toISOString(),
            message: error.message,
            stack: error.stack
        };
    }

    /**
     * Convierte la instancia de integración a un objeto simple
     * @returns {Object} Representación de la integración como objeto
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            deviceId: this.deviceId,
            config: this.config,
            syncInterval: this.syncInterval,
            active: this.active,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastSync: this.lastSync,
            stats: this.stats,
            lastError: this.lastError
        };
    }
}

module.exports = BaseIntegration;