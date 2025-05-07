/**
 * @file integrationController.js
 * @description Controlador para la gestión de integraciones
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const CONFIG = require('../config/paths');
const integrationService = require('../integrations/index');
const { devices, clients } = require('../services/whatsappClient');
const crypto = require('crypto');

/**
 * Obtiene todas las integraciones
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function getAllIntegrations(req, res) {
    try {
        // Añadir información de nombres de dispositivos
        const integrationsWithDeviceNames = integrationService.integrations.map(integration => {
            const device = devices.find(d => d.id === integration.deviceId) || {};
            return {
                ...integration,
                deviceName: device.name
            };
        });
        
        // Devolver directamente el array de integraciones (sin objeto envolvente)
        res.json(integrationsWithDeviceNames);
    } catch (error) {
        console.error('خطأ في جلب التكاملات:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء جلب التكاملات' });
    }
}

/**
 * Obtiene una integración específica
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function getIntegration(req, res) {
    try {
        const { integrationId } = req.params;
        
        // Buscar la integración
        const integration = integrationService.integrations.find(i => i.id === integrationId);
        if (!integration) {
            return res.status(404).json({ status: false, message: 'التكامل غير موجود' });
        }
        
        // Añadir información del dispositivo
        const device = devices.find(d => d.id === integration.deviceId) || {};
        
        res.json({ 
            status: true, 
            data: {
                ...integration,
                deviceName: device.name
            } 
        });
    } catch (error) {
        console.error('خطأ في جلب التكامل:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء جلب التكامل' });
    }
}

/**
 * Añade una nueva integración
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function addIntegration(req, res) {
    try {
        const { type, name, deviceId, config, syncInterval, active } = req.body;
        
        if (!type || !name || !deviceId) {
            return res.status(400).json({ status: false, message: 'نوع التكامل، اسمه ومعرف الجهاز مطلوبة' });
        }
        
        // Validar configuración según tipo
        if (type === 'google_sheets') {
            if (!config || !config.sheetId || !config.phoneColumn || !config.messageColumn) {
                return res.status(400).json({ 
                    status: false, 
                    message: 'تكوين Google Sheets غير صحيح. مطلوب: معرف الجدول، عمود رقم الهاتف، وعمود الرسالة'
                });
            }
        }
        
        // Crear un ID único para la integración
        const integrationId = uuidv4();
        
        // Crear objeto de nueva integración
        const newIntegration = {
            id: integrationId,
            type,
            name,
            deviceId,
            config,
            syncInterval: syncInterval || 5, // Por defecto 5 minutos
            active: active !== undefined ? active : true,
            createdAt: new Date().toISOString(),
            lastSync: null,
            stats: {
                sent: 0,
                failed: 0,
                processed: 0
            }
        };
        
        // Añadir integración a la lista
        integrationService.integrations.push(newIntegration);
        
        // Guardar cambios
        fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify(integrationService.integrations, null, 2));
        
        // Programar integración
        if (newIntegration.active) {
            integrationService.scheduleIntegration(newIntegration);
        }
        
        // Devolver directamente el objeto de integración
        res.json(newIntegration);
    } catch (error) {
        console.error('خطأ في إضافة التكامل:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء إضافة التكامل' });
    }
}

/**
 * Actualiza una integración
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function updateIntegration(req, res) {
    try {
        const { integrationId } = req.params;
        const { name, deviceId, config, syncInterval, active } = req.body;
        
        // Buscar la integración
        const integrationIndex = integrationService.integrations.findIndex(i => i.id === integrationId);
        if (integrationIndex === -1) {
            return res.status(404).json({ status: false, message: 'التكامل غير موجود' });
        }
        
        // Actualizar información
        if (name !== undefined) {
            integrationService.integrations[integrationIndex].name = name;
        }
        
        if (deviceId !== undefined) {
            integrationService.integrations[integrationIndex].deviceId = deviceId;
        }
        
        if (config !== undefined) {
            integrationService.integrations[integrationIndex].config = { 
                ...integrationService.integrations[integrationIndex].config,
                ...config
            };
        }
        
        if (syncInterval !== undefined) {
            integrationService.integrations[integrationIndex].syncInterval = syncInterval;
        }
        
        if (active !== undefined) {
            integrationService.integrations[integrationIndex].active = active;
        }
        
        // Actualizar fecha de modificación
        integrationService.integrations[integrationIndex].updatedAt = new Date().toISOString();
        
        // Guardar cambios
        fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify(integrationService.integrations, null, 2));
        
        // Reprogramar integración
        if (integrationService.integrations[integrationIndex].id in integrationService.integrationJobs) {
            integrationService.integrationJobs[integrationIndex].cancel();
        }
        
        if (integrationService.integrations[integrationIndex].active) {
            integrationService.scheduleIntegration(integrationService.integrations[integrationIndex]);
        }
        
        res.json({ 
            status: true, 
            message: 'تم تحديث التكامل بنجاح',
            data: integrationService.integrations[integrationIndex]
        });
    } catch (error) {
        console.error('خطأ في تحديث التكامل:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء تحديث التكامل' });
    }
}

/**
 * Elimina una integración
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function deleteIntegration(req, res) {
    try {
        const { integrationId } = req.params;
        
        // استخدام دالة سيرفس لحذف التكامل بدلاً من الحذف مباشرة
        try {
            const deletedIntegration = integrationService.deleteIntegration(integrationId);
            
            // تسجيل التفاصيل للتشخيص
            console.log(`تم حذف التكامل: ${integrationId}`, deletedIntegration);
            
            res.json({ 
                status: true, 
                message: 'تم حذف التكامل بنجاح',
                data: deletedIntegration
            });
        } catch (serviceError) {
            console.error('خطأ في دالة حذف التكامل:', serviceError);
            return res.status(404).json({ status: false, message: serviceError.message || 'التكامل غير موجود' });
        }
    } catch (error) {
        console.error('خطأ في حذف التكامل:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء حذف التكامل' });
    }
}

/**
 * Activa o desactiva una integración
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
function toggleIntegration(req, res) {
    try {
        const { integrationId } = req.params;
        const { active } = req.body;
        
        const result = integrationService.toggleIntegration(integrationId, active);
        
        if (!result.success) {
            return res.status(404).json({ status: false, message: result.message });
        }
        
        res.json({ 
            status: true, 
            message: result.message,
            data: {
                id: integrationId,
                active: result.active
            }
        });
    } catch (error) {
        console.error('خطأ في تبديل حالة التكامل:', error);
        res.status(500).json({ status: false, message: 'حدث خطأ أثناء تبديل حالة التكامل' });
    }
}

/**
 * Ejecuta una integración manualmente
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
async function runIntegration(req, res) {
    try {
        const { integrationId } = req.params;
        
        // إرسال استجابة فورية للعميل بأن العملية بدأت
        res.json({ 
            status: true, 
            message: 'تم بدء تشغيل التكامل',
            data: {
                id: integrationId
            }
        });
        
        // تنفيذ التكامل في الخلفية وتسجيل النتائج
        try {
            const result = await integrationService.runIntegrationManually(integrationId);
            
            // التحقق من وجود خطأ في نتيجة التنفيذ
            if (result && result.error) {
                console.error(`خطأ في تشغيل التكامل ${integrationId}: ${result.message}`);
            } else {
                console.log(`تم تشغيل التكامل بنجاح: ${integrationId}`, result);
            }
        } catch (runError) {
            console.error(`Error al ejecutar integración ${integrationId}: ${runError.message}`);
        }
    } catch (error) {
        console.error('خطأ في تشغيل التكامل:', error);
        // في هذه الحالة، لن يتم إرسال استجابة لأننا أرسلنا بالفعل استجابة إيجابية
    }
}

/**
 * Recibe datos de webhooks externos (como n8n) y ejecuta acciones
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
async function receiveWebhookData(req, res) {
    try {
        const { integrationId } = req.params;
        const webhookData = req.body;
        
        console.log(`استقبال بيانات webhook لتكامل ${integrationId}:`, JSON.stringify(webhookData).substring(0, 200) + '...');
        
        // التحقق من وجود التكامل
        const integration = integrationService.getIntegrationById(integrationId);
        if (!integration) {
            return res.status(404).json({ 
                status: false, 
                message: 'التكامل غير موجود'
            });
        }
        
        // التحقق من الأمان إذا تم تكوين مفتاح سري
        if (integration.config.secret) {
            const receivedSignature = req.headers['x-webhook-signature'] || 
                                     req.headers['x-signature'] || 
                                     req.headers['signature'];
            
            // إذا كان هناك مفتاح سري مكون ولم يتم توفير توقيع، ارفض الطلب
            if (!receivedSignature) {
                console.warn(`تم رفض طلب webhook بدون توقيع للتكامل ${integrationId}`);
                return res.status(401).json({ 
                    status: false, 
                    message: 'التوقيع مطلوب' 
                });
            }
            
            // التحقق من صحة التوقيع
            const expectedSignature = crypto
                .createHmac('sha256', integration.config.secret)
                .update(JSON.stringify(webhookData))
                .digest('hex');
            
            if (receivedSignature !== expectedSignature) {
                console.warn(`توقيع webhook غير صالح للتكامل ${integrationId}`);
                return res.status(401).json({ 
                    status: false, 
                    message: 'توقيع غير صالح' 
                });
            }
        }
        
        // التحقق من وجود إجراء مطلوب تنفيذه
        if (!webhookData.action) {
            return res.status(400).json({ 
                status: false, 
                message: 'يجب تحديد الإجراء المطلوب في البيانات الواردة'
            });
        }
        
        // التحقق من جاهزية الجهاز
        const deviceId = integration.deviceId;
        if (!clients[deviceId] || !clients[deviceId].client || clients[deviceId].status !== 'connected') {
            return res.status(400).json({ 
                status: false, 
                message: 'الجهاز غير متصل' 
            });
        }
        
        const client = clients[deviceId].client;
        
        // معالجة الإجراء المطلوب
        let result = { status: true };
        
        switch (webhookData.action) {
            case 'send_message':
                // إرسال رسالة نصية
                if (!webhookData.phone || !webhookData.message) {
                    return res.status(400).json({ 
                        status: false, 
                        message: 'يجب توفير رقم الهاتف ونص الرسالة' 
                    });
                }
                
                try {
                    // تنسيق رقم الهاتف بشكل صحيح
                    let phone = webhookData.phone.toString().replace(/[^0-9]/g, '');
                    if (!phone.includes('@')) {
                        phone = `${phone}@c.us`;
                    }
                    
                    // إرسال الرسالة
                    const sentMessage = await client.sendMessage(phone, webhookData.message);
                    
                    result.messageId = sentMessage.id._serialized;
                    result.message = 'تم إرسال الرسالة بنجاح';
                } catch (error) {
                    console.error(`خطأ في إرسال الرسالة:`, error);
                    return res.status(500).json({ 
                        status: false, 
                        message: `فشل إرسال الرسالة: ${error.message}` 
                    });
                }
                break;
                
            case 'send_media':
                // إرسال وسائط (صورة، فيديو، صوت، ملف)
                if (!webhookData.phone || (!webhookData.media && !webhookData.url)) {
                    return res.status(400).json({ 
                        status: false, 
                        message: 'يجب توفير رقم الهاتف ورابط الوسائط أو البيانات المشفرة بـ base64' 
                    });
                }
                
                try {
                    // تنسيق رقم الهاتف بشكل صحيح
                    let phone = webhookData.phone.toString().replace(/[^0-9]/g, '');
                    if (!phone.includes('@')) {
                        phone = `${phone}@c.us`;
                    }
                    
                    let media;
                    // حالة تقديم URL للوسائط
                    if (webhookData.url) {
                        const { MessageMedia } = require('whatsapp-web.js');
                        media = await MessageMedia.fromUrl(webhookData.url, {
                            unsafeMime: true,
                            filename: webhookData.filename
                        });
                    } 
                    // حالة تقديم بيانات base64 للوسائط
                    else if (webhookData.media) {
                        const { MessageMedia } = require('whatsapp-web.js');
                        media = new MessageMedia(
                            webhookData.media.mimetype || 'application/octet-stream',
                            webhookData.media.data,
                            webhookData.media.filename || 'file'
                        );
                    }
                    
                    // إرسال الوسائط
                    const sentMedia = await client.sendMessage(phone, media, {
                        caption: webhookData.caption || '',
                        sendMediaAsDocument: webhookData.asDocument || false
                    });
                    
                    result.messageId = sentMedia.id._serialized;
                    result.message = 'تم إرسال الوسائط بنجاح';
                } catch (error) {
                    console.error(`خطأ في إرسال الوسائط:`, error);
                    return res.status(500).json({ 
                        status: false, 
                        message: `فشل إرسال الوسائط: ${error.message}` 
                    });
                }
                break;
                
            case 'get_chats':
                // الحصول على قائمة المحادثات
                try {
                    const chats = await client.getChats();
                    result.chats = chats.map(chat => ({
                        id: chat.id._serialized,
                        name: chat.name,
                        isGroup: chat.isGroup,
                        timestamp: chat.timestamp,
                        unreadCount: chat.unreadCount
                    }));
                    result.message = 'تم جلب المحادثات بنجاح';
                } catch (error) {
                    console.error(`خطأ في جلب المحادثات:`, error);
                    return res.status(500).json({ 
                        status: false, 
                        message: `فشل في جلب المحادثات: ${error.message}` 
                    });
                }
                break;
                
            case 'get_contacts':
                // الحصول على قائمة جهات الاتصال
                try {
                    const contacts = await client.getContacts();
                    result.contacts = contacts
                        .filter(contact => contact.isMyContact || contact.name)
                        .map(contact => ({
                            id: contact.id._serialized,
                            name: contact.name || '',
                            number: contact.id.user,
                            isMyContact: contact.isMyContact || false
                        }));
                    result.message = 'تم جلب جهات الاتصال بنجاح';
                } catch (error) {
                    console.error(`خطأ في جلب جهات الاتصال:`, error);
                    return res.status(500).json({ 
                        status: false, 
                        message: `فشل في جلب جهات الاتصال: ${error.message}` 
                    });
                }
                break;
                
            default:
                return res.status(400).json({ 
                    status: false, 
                    message: `الإجراء ${webhookData.action} غير مدعوم` 
                });
        }
        
        res.json(result);
    } catch (error) {
        console.error('خطأ في معالجة طلب webhook:', error);
        res.status(500).json({ 
            status: false, 
            message: `حدث خطأ أثناء معالجة طلب webhook: ${error.message}` 
        });
    }
}

/**
 * Recibe datos de webhooks externos usando un token en lugar de un ID de integración
 * @param {Object} req - Solicitud HTTP
 * @param {Object} res - Respuesta HTTP
 */
async function receiveExternalWebhook(req, res) {
    try {
        const { token } = req.params;
        const webhookData = req.body;
        
        console.log(`استقبال بيانات webhook بالرمز ${token}:`, JSON.stringify(webhookData).substring(0, 200) + '...');
        
        // البحث عن التكامل المطابق للرمز
        const integration = integrationService.integrations.find(i => 
            i.config && i.config.token && i.config.token === token
        );
        
        if (!integration) {
            return res.status(404).json({ 
                status: false, 
                message: 'رمز التكامل غير صالح'
            });
        }
        
        // تعديل الطلب ثم إعادة توجيهه إلى الوظيفة الرئيسية
        req.params.integrationId = integration.id;
        return receiveWebhookData(req, res);
    } catch (error) {
        console.error('خطأ في معالجة طلب webhook خارجي:', error);
        res.status(500).json({ 
            status: false, 
            message: `حدث خطأ أثناء معالجة طلب webhook خارجي: ${error.message}` 
        });
    }
}

module.exports = {
    getAllIntegrations,
    getIntegration,
    addIntegration,
    updateIntegration,
    deleteIntegration,
    toggleIntegration,
    runIntegration,
    receiveWebhookData,
    receiveExternalWebhook
};