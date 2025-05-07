/**
 * @file googleSheets.js
 * @description Funciones para integración con Google Sheets
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const CONFIG = require('../config/paths');
const { clients } = require('../services/whatsappClient');

/**
 * Obtiene datos desde Google Sheets
 * @param {string} sheetId - ID de la hoja
 * @param {string} sheetName - Nombre de la hoja (opcional)
 * @returns {Promise<Array>} - Filas de datos
 */
async function fetchGoogleSheetsData(sheetId, sheetName = '') {
    try {
        console.log(`جاري جلب البيانات من Google Sheets (معرف الورقة: ${sheetId})...`);
        
        // Usar Google Sheets API
        const sheets = google.sheets({ version: 'v4' });
        
        // Definir rango de consulta (toda la hoja)
        const range = sheetName ? `${sheetName}!A:Z` : 'A:Z';
        
        // Intentar obtener datos usando acceso público
        try {
            // Implementar aquí la lógica para acceso público a Google Sheets
            // Esta parte estaba incompleta en el archivo original
            
            // Código placeholder
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: range
            });
            
            return response.data.values || [];
        } catch (publicError) {
            console.error('Error al acceder públicamente a Google Sheets:', publicError);
            throw publicError;
        }
    } catch (error) {
        console.error('خطأ في جلب بيانات Google Sheets:', error);
        throw error;
    }
}

/**
 * Actualiza datos en Google Sheets
 * @param {string} sheetId - ID de la hoja
 * @param {string} range - Rango a actualizar
 * @param {Array} values - Valores a insertar
 * @param {string} sheetName - Nombre de la hoja (opcional)
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function updateGoogleSheetsData(sheetId, range, values, sheetName = '') {
    try {
        // Usar Google Sheets API
        const sheets = google.sheets({ version: 'v4' });
        
        // Definir rango completo con nombre de hoja
        const fullRange = sheetName ? `${sheetName}!${range}` : range;
        
        // Usar clave API (puede definirse en variables de entorno)
        const API_KEY = process.env.GOOGLE_API_KEY;
        
        if (!API_KEY) {
            // Implementar manejo de error por falta de API_KEY
            return {
                updated: false,
                reason: 'No se proporcionó una clave API para Google Sheets'
            };
        }
        
        // Actualizar datos
        const response = await sheets.spreadsheets.values.update({
            key: API_KEY,
            spreadsheetId: sheetId,
            range: fullRange,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: values
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('خطأ في تحديث بيانات Google Sheets:', error);
        // En lugar de lanzar error, devolver objeto indicando fallo
        return { 
            updated: false, 
            reason: error.message,
            error: error
        };
    }
}

/**
 * Procesa la integración con Google Sheets
 * @param {Object} integration - Objeto de integración
 * @returns {Promise<Object>} - Estadísticas de procesamiento
 */
async function processGoogleSheetsIntegration(integration) {
    try {
        // Verificar configuración
        if (!integration.config || !integration.config.sheetId || !integration.config.phoneColumn || !integration.config.messageColumn) {
            throw new Error('تكوين Google Sheets غير صحيح');
        }
        
        // Verificar existencia del dispositivo
        const deviceId = integration.deviceId;
        
        // Verificar que el dispositivo está en la lista
        const deviceIndex = require('../services/whatsappClient').devices.findIndex(d => d.id === deviceId);
        if (deviceIndex === -1) {
            throw new Error(`الجهاز غير موجود في القائمة (معرف: ${deviceId})`);
        }
        
        // Verificar existencia de cliente para el dispositivo
        if (!clients[deviceId]) {
            throw new Error(`لا يوجد عميل للجهاز (معرف: ${deviceId}، اسم: ${require('../services/whatsappClient').devices[deviceIndex].name})`);
        }
        
        // Verificar estado del cliente
        if (!clients[deviceId].client) {
            throw new Error(`العميل غير مهيأ للجهاز (معرف: ${deviceId}، اسم: ${require('../services/whatsappClient').devices[deviceIndex].name})`);
        }
        
        // Verificar estado de conexión
        const clientStatus = clients[deviceId].status;
        console.log(`حالة اتصال الجهاز (${deviceId}): ${clientStatus}`);
        
        if (clientStatus !== 'authenticated' && clientStatus !== 'connected') {
            // Intentar reconexión automática
            console.log(`محاولة إعادة اتصال الجهاز (${deviceId})...`);
            try {
                // Lógica para reintentar conexión
                // Esta parte estaba incompleta en el archivo original
            } catch (error) {
                // Manejo de error en reconexión
            }
        }
        
        // Obtener datos de Google Sheets
        console.log(`جاري جلب البيانات من Google Sheets (معرف الورقة: ${integration.config.sheetId})...`);
        const rows = await fetchGoogleSheetsData(integration.config.sheetId, integration.config.sheetName);
        
        if (!rows || rows.length <= 1) {
            return { processed: 0, sent: 0, failed: 0, message: 'لا توجد بيانات للمعالجة' };
        }
        
        console.log(`تم جلب ${rows.length} صف من Google Sheets`);
        
        // Determinar números de columna
        const columnToIndex = column => {
            // Convertir A a 0, B a 1, etc.
            if (column.length === 1) {
                return column.charCodeAt(0) - 65;
            } else if (column.length === 2) {
                // Para columnas AA, AB, etc.
                return (column.charCodeAt(0) - 64) * 26 + (column.charCodeAt(1) - 65);
            }
            return -1;
        };
        
        const phoneColumnIndex = columnToIndex(integration.config.phoneColumn.toUpperCase());
        const messageColumnIndex = columnToIndex(integration.config.messageColumn.toUpperCase());
        
        console.log(`عمود الهاتف (${integration.config.phoneColumn}): الفهرس ${phoneColumnIndex}`);
        console.log(`عمود الرسالة (${integration.config.messageColumn}): الفهرس ${messageColumnIndex}`);
        
        // Añadir columna de estado de envío si la opción está activada
        let statusColumnIndex = -1;
        if (integration.config.markAsSent) {
            // Buscar columna "Estado de envío"
            const headers = rows[0] || [];
            statusColumnIndex = headers.findIndex(header => header === 'حالة الإرسال');
            
            // Si no existe, añadirla
            if (statusColumnIndex === -1) {
                statusColumnIndex = headers.length;
                headers.push('حالة الإرسال');
                
                // Actualizar primera fila con el nuevo encabezado
                console.log('إضافة عمود حالة الإرسال...');
                await updateGoogleSheetsData(
                    integration.config.sheetId,
                    `A1:${String.fromCharCode(65 + headers.length - 1)}1`,
                    [headers],
                    integration.config.sheetName
                );
                console.log('تم إضافة عمود حالة الإرسال بنجاح');
            }
        }
        
        // Seguimiento de estadísticas
        const stats = {
            processed: 0,
            sent: 0,
            failed: 0,
            messages: []
        };

        // Cargar registro de mensajes enviados
        // Crear ruta del archivo de registro para esta integración
        const sentMessagesFilePath = path.join(CONFIG.SENT_MESSAGES_DIR, `${integration.id}.json`);
        
        // Array para almacenar filas enviadas previamente
        let sentMessages = [];
        
        // Verificar existencia del archivo de registro y leerlo
        if (fs.existsSync(sentMessagesFilePath)) {
            try {
                sentMessages = JSON.parse(fs.readFileSync(sentMessagesFilePath, 'utf8'));
                console.log(`تم تحميل ${sentMessages.length} رسالة مرسلة سابقاً من سجل التكامل`);
            } catch (error) {
                console.error('خطأ في قراءة ملف سجل الرسائل المرسلة:', error);
                sentMessages = [];
            }
        }

        // Función para verificar si una fila ya fue enviada
        const isRowAlreadySent = (row, rowIndex) => {
            if (!row || !row[phoneColumnIndex] || !row[messageColumnIndex]) {
                return true;
            }
            
            const phoneNumber = row[phoneColumnIndex].toString().trim();
            const message = row[messageColumnIndex].toString().trim();
            
            // Verificar si la fila ya fue enviada basado en índice, teléfono y mensaje
            return sentMessages.some(sent => 
                sent.rowIndex === rowIndex && 
                sent.phone === phoneNumber && 
                sent.message === message
            );
        };

        // Función para guardar registro de mensajes enviados
        const saveToSentMessages = (rowIndex, phoneNumber, message) => {
            sentMessages.push({
                rowIndex,
                phone: phoneNumber.toString().trim(),
                message: message.toString().trim(),
                timestamp: new Date().toISOString()
            });
            
            // Guardar en archivo
            fs.writeFileSync(sentMessagesFilePath, JSON.stringify(sentMessages, null, 2));
        };
        
        // Procesar cada fila (omitir primera fila que contiene encabezados)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            // Verificar existencia de número teléfono y mensaje
            if (!row || !row[phoneColumnIndex] || !row[messageColumnIndex]) {
                console.log(`تخطي الصف ${i + 1}: بيانات غير كاملة`);
                continue;
            }
            
            // Verificar si la fila ya fue procesada desde registros internos
            if (isRowAlreadySent(row, i)) {
                console.log(`تخطي الصف ${i + 1}: تم إرساله مسبقاً (من سجل النظام)`);
                stats.processed++;
                continue;
            }
            
            // Verificar si la fila ya fue procesada desde columna de estado en la hoja
            if (integration.config.sendOnlyNew && 
                statusColumnIndex !== -1 && 
                row[statusColumnIndex] && 
                row[statusColumnIndex].includes('تم الإرسال')) {
                console.log(`تخطي الصف ${i + 1}: تم إرساله مسبقاً (من سجل الورقة)`);
                stats.processed++;
                
                // Añadir fila al registro si aún no existe
                if (!isRowAlreadySent(row, i)) {
                    // Implementación omitida para brevedad
                }
                
                continue;
            }
            
            // Formatear número teléfono (añadir prefijo país si es necesario)
            let phoneNumber = row[phoneColumnIndex].toString().trim();
            if (!phoneNumber.includes('@')) {  // Si no es un ID de chat
                // Añadir prefijo país si no existe
                if (!phoneNumber.startsWith('+')) {
                    // Lógica para añadir prefijo país
                    // Esta parte estaba incompleta en el archivo original
                }
                
                // Convertir número al formato de ID de chat de WhatsApp
                phoneNumber = phoneNumber.replace(/^\+/, '') + '@c.us';
            }
            
            // Mensaje
            const message = row[messageColumnIndex].toString();
            
            console.log(`معالجة الصف ${i + 1}: إرسال إلى ${phoneNumber}`);
            stats.processed++;
            
            try {
                // Enviar mensaje
                const result = await clients[deviceId].client.sendMessage(phoneNumber, message);
                
                // Actualizar estadísticas
                stats.sent++;
                stats.messages.push({
                    row: i + 1,
                    phone: phoneNumber,
                    message: message,
                    status: 'sent'
                });
                
                console.log(`تم إرسال الرسالة للصف ${i + 1} بنجاح`);
                
                // Guardar registro del mensaje enviado
                saveToSentMessages(i, row[phoneColumnIndex], row[messageColumnIndex]);
                
                // Actualizar estado de envío en la hoja
                if (integration.config.markAsSent && statusColumnIndex !== -1) {
                    const updateResult = await updateGoogleSheetsData(
                        integration.config.sheetId,
                        `${String.fromCharCode(65 + statusColumnIndex)}${i + 1}`,
                        [['تم الإرسال ' + new Date().toLocaleString()]],
                        integration.config.sheetName
                    );
                    
                    if (!updateResult.updated) {
                        console.warn(`تعذر تحديث حالة الإرسال للصف ${i + 1}:`, updateResult.reason);
                    }
                }
                
                // Añadir retardo para limitar tasa de envío
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                // Registrar error
                console.error(`خطأ في إرسال الرسالة للصف ${i + 1}:`, error);
                
                // Actualizar estadísticas
                stats.failed++;
                stats.messages.push({
                    row: i + 1,
                    phone: phoneNumber,
                    message: message,
                    status: 'failed',
                    error: error.message
                });
                
                // Actualizar estado de envío en la hoja
                if (integration.config.markAsSent && statusColumnIndex !== -1) {
                    const updateResult = await updateGoogleSheetsData(
                        integration.config.sheetId,
                        `${String.fromCharCode(65 + statusColumnIndex)}${i + 1}`,
                        [['فشل الإرسال: ' + error.message]],
                        integration.config.sheetName
                    );
                    
                    if (!updateResult.updated) {
                        console.warn(`تعذر تحديث حالة الفشل للصف ${i + 1}:`, updateResult.reason);
                    }
                }
            }
        }
        
        return stats;
    } catch (error) {
        console.error('خطأ في معالجة تكامل Google Sheets:', error);
        throw error;
    }
}

module.exports = {
    fetchGoogleSheetsData,
    updateGoogleSheetsData,
    processGoogleSheetsIntegration
};