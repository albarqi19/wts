/**
 * @file src/integrations/index.js
 * @description إدارة التكاملات والجدولة
 */

const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { google } = require('googleapis');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config/paths');
const { clients } = require('../services/whatsappClient'); // قد تحتاج لتعديل المسار أو طريقة الوصول

// تحميل التكاملات
let integrations = [];
if (fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
    try {
        integrations = JSON.parse(fs.readFileSync(CONFIG.INTEGRATIONS_FILE));
    } catch (error) {
        console.error('خطأ في قراءة ملف التكاملات:', error);
    }
}

// تخزين مهام الجدولة
const integrationJobs = {};

// --- وظائف Google Sheets ---

// المصادقة مع Google Sheets
async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: CONFIG.GOOGLE_CREDENTIALS_FILE, // تأكد من وجود هذا الملف وتكوينه
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return await auth.getClient();
}

// جلب بيانات من Google Sheets
async function getGoogleSheetsData(sheetId, range, sheetName = '') {
    try {
        const authClient = await getGoogleSheetsClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const sheetRange = sheetName ? `${sheetName}!${range}` : range;

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: sheetRange,
        });
        return response.data.values || [];
    } catch (error) {
        console.error('خطأ في جلب البيانات من Google Sheets:', error);
        throw new Error('فشل في جلب البيانات من Google Sheets');
    }
}

// تحديث بيانات في Google Sheets
async function updateGoogleSheetsData(sheetId, range, values, sheetName = '') {
    try {
        const authClient = await getGoogleSheetsClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const sheetRange = sheetName ? `${sheetName}!${range}` : range;

        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: sheetRange,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: values,
            },
        });
        console.log(`تم تحديث البيانات في Google Sheets: ${sheetRange}`);
    } catch (error) {
        console.error('خطأ في تحديث البيانات في Google Sheets:', error);
        throw new Error('فشل في تحديث البيانات في Google Sheets');
    }
}

// --- وظائف Webhook ---

// إرسال حدث إلى webhook
async function sendWebhookEvent(integration, eventType, eventData) {
    if (!integration || !integration.config || !integration.config.webhookUrl) {
        console.warn(`تكامل Webhook ${integration.id} لا يحتوي على URL.`);
        return;
    }

    const webhookUrl = integration.config.webhookUrl;
    const payload = {
        integrationId: integration.id,
        integrationName: integration.name,
        deviceId: integration.deviceId,
        eventType: eventType,
        timestamp: new Date().toISOString(),
        data: eventData
    };

    try {
        const response = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`تم إرسال حدث ${eventType} إلى webhook ${integration.id}:`, response.status);
    } catch (error) {
        console.error(`خطأ في إرسال حدث ${eventType} إلى webhook ${integration.id}:`, error.message);
        // يمكنك إضافة منطق لإعادة المحاولة هنا إذا لزم الأمر
    }
}

// --- معالجة التكاملات ---

// معالجة التكامل مع Google Sheets
async function processGoogleSheetsIntegration(integration) {
    console.log(`بدء معالجة تكامل Google Sheets: ${integration.name} (${integration.id})`);
    const { sheetId, phoneColumn, messageColumn, statusColumn, sheetName } = integration.config;
    const deviceId = integration.deviceId;
    const stats = { sent: 0, failed: 0, processed: 0 };

    if (!clients[deviceId] || !clients[deviceId].client || clients[deviceId].status !== 'authenticated') {
        console.warn(`الجهاز ${deviceId} غير متصل أو غير مصادق عليه لتكامل ${integration.id}`);
        throw new Error(`الجهاز ${deviceId} غير جاهز`);
    }

    try {
        // جلب البيانات من الجدول (تجاهل الصف الأول - العناوين)
        const range = `${phoneColumn}2:${statusColumn || messageColumn}`; // اقرأ حتى عمود الحالة إن وجد
        const rows = await getGoogleSheetsData(sheetId, range, sheetName);
        stats.processed = rows.length;

        for (let i = 0; i < rows.length; i++) {
            const rowIndex = i + 2; // رقم الصف الفعلي في الجدول (يبدأ من 1)
            const row = rows[i];
            const phone = row[0]; // العمود الأول هو الهاتف
            const message = row[1]; // العمود الثاني هو الرسالة
            const currentStatus = statusColumn ? row[row.length - 1] : null; // آخر عمود هو الحالة

            // تحقق مما إذا كان يجب إرسال الرسالة (إذا لم يكن هناك عمود حالة أو إذا كانت الحالة فارغة أو ليست "تم الإرسال")
            if (phone && message && (!statusColumn || !currentStatus || currentStatus.toLowerCase() !== 'sent')) {
                try {
                    const chatId = `${phone}@c.us`; // تنسيق معرف واتساب
                    await clients[deviceId].client.sendMessage(chatId, message);
                    console.log(`تم إرسال رسالة إلى ${phone} من تكامل ${integration.id}`);
                    stats.sent++;

                    // تحديث الحالة في الجدول إذا كان العمود موجودًا
                    if (statusColumn) {
                        const statusRange = `${statusColumn}${rowIndex}`; // خلية الحالة لهذا الصف
                        await updateGoogleSheetsData(sheetId, statusRange, [['Sent']], sheetName);
                    }
                } catch (sendError) {
                    console.error(`فشل إرسال رسالة إلى ${phone} من تكامل ${integration.id}:`, sendError.message);
                    stats.failed++;
                    // تحديث الحالة إلى "فشل" إذا كان العمود موجودًا
                    if (statusColumn) {
                        const statusRange = `${statusColumn}${rowIndex}`; // خلية الحالة لهذا الصف
                        await updateGoogleSheetsData(sheetId, statusRange, [['Failed']], sheetName);
                    }
                }
            }
        }
        console.log(`اكتملت معالجة تكامل Google Sheets: ${integration.name}`, stats);
        return stats;
    } catch (error) {
        console.error(`خطأ فادح في معالجة تكامل Google Sheets ${integration.id}:`, error);
        throw error;
    }
}

// معالجة التكامل مع Webhook (عند استقبال رسالة)
async function processWebhookIntegration(integration, eventType, eventData) {
    console.log(`معالجة حدث ${eventType} لتكامل webhook: ${integration.name} (${integration.id})`);
    try {
        await sendWebhookEvent(integration, eventType, eventData);
    } catch (error) {
        console.error(`خطأ في معالجة تكامل webhook ${integration.id}:`, error);
        // لا ترمي خطأ هنا لمنع إيقاف معالجة الرسائل الأخرى
    }
}

// --- جدولة التكاملات ---

// جدولة تكامل معين
function scheduleIntegration(integration) {
    if (!integration.active) {
        console.log(`التكامل ${integration.name} (${integration.id}) غير نشط، لن يتم جدولته.`);
        return;
    }

    // إلغاء المهمة القديمة إذا كانت موجودة
    if (integrationJobs[integration.id]) {
        integrationJobs[integration.id].cancel();
        console.log(`تم إلغاء الجدولة القديمة للتكامل: ${integration.name} (${integration.id})`);
    }

    // تحديد فترة المزامنة
    const interval = integration.syncInterval || 5; // افتراضي 5 دقائق
    const cronRule = `*/${interval} * * * *`;

    console.log(`جدولة تكامل: ${integration.name} (${integration.id}) للتشغيل كل ${interval} دقائق`);

    // جدولة المهمة
    const job = schedule.scheduleJob(cronRule, async () => {
        console.log(`تشغيل تكامل مجدول: ${integration.name} (${integration.id})`);
        const integrationIndex = integrations.findIndex(i => i.id === integration.id);
        if (integrationIndex === -1) {
            console.warn(`التكامل ${integration.id} لم يعد موجودًا، إلغاء المهمة.`);
            job.cancel();
            delete integrationJobs[integration.id];
            return;
        }

        const currentIntegration = integrations[integrationIndex];
        if (!currentIntegration.active) {
            console.log(`التكامل ${currentIntegration.name} (${currentIntegration.id}) غير نشط، تخطي التشغيل.`);
            return;
        }

        try {
            let stats = {};
            if (currentIntegration.type === 'google_sheets') {
                stats = await processGoogleSheetsIntegration(currentIntegration);
            } else if (currentIntegration.type === 'webhook') {
                // تكاملات Webhook عادة ما تعمل عند استقبال الأحداث، ولكن يمكن إضافة منطق هنا إذا لزم الأمر
                console.log(`تكامل Webhook ${currentIntegration.name} لا يتطلب تشغيلًا مجدولًا للمعالجة.`);
            }

            // تحديث وقت آخر مزامنة والإحصائيات
            currentIntegration.lastSync = new Date().toISOString();
            currentIntegration.stats = {
                ...currentIntegration.stats || {},
                sent: (currentIntegration.stats?.sent || 0) + (stats.sent || 0),
                failed: (currentIntegration.stats?.failed || 0) + (stats.failed || 0),
                processed: (currentIntegration.stats?.processed || 0) + (stats.processed || 0),
                lastRun: {
                    date: currentIntegration.lastSync,
                    stats: stats
                }
            };
            delete currentIntegration.lastError; // إزالة الخطأ الأخير عند النجاح

            fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify(integrations, null, 2));
            console.log(`اكتمل تشغيل التكامل المجدول: ${currentIntegration.name} (${currentIntegration.id})`, stats);

        } catch (error) {
            console.error(`خطأ في تنفيذ التكامل المجدول: ${currentIntegration.name} (${currentIntegration.id})`, error.message);

            // تحديث حالة الخطأ
            currentIntegration.lastError = {
                date: new Date().toISOString(),
                message: error.message
            };
            fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify(integrations, null, 2));
        }
    });

    // تخزين المهمة
    integrationJobs[integration.id] = job;
}

// جدولة جميع التكاملات النشطة
function scheduleIntegrations() {
    console.log('بدء جدولة التكاملات النشطة...');
    // إلغاء جميع الجدولات السابقة
    Object.values(integrationJobs).forEach(job => {
        if (job && typeof job.cancel === 'function') {
            job.cancel();
        }
    });
    Object.keys(integrationJobs).forEach(key => delete integrationJobs[key]);

    // إعادة قراءة التكاملات من الملف لضمان الحصول على أحدث قائمة
    if (fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
        try {
            integrations = JSON.parse(fs.readFileSync(CONFIG.INTEGRATIONS_FILE));
        } catch (error) {
            console.error('خطأ في إعادة قراءة ملف التكاملات للجدولة:', error);
            return; // لا تتابع إذا كان هناك خطأ في القراءة
        }
    }

    // جدولة التكاملات النشطة
    integrations.forEach(integration => {
        if (integration.active && (integration.type === 'google_sheets')) { // جدولة تكاملات Google Sheets فقط حاليًا
            scheduleIntegration(integration);
        }
    });
    console.log('اكتملت جدولة التكاملات النشطة.');
}

// --- وظائف مساعدة لإدارة التكاملات (تستخدمها المسارات) ---

function getIntegrations() {
    return integrations;
}

function getIntegrationById(id) {
    return integrations.find(i => i.id === id);
}

function addIntegration(newIntegrationData) {
    const { type, name, deviceId, config, syncInterval, active } = newIntegrationData;

    if (!type || !name || !deviceId) {
        throw new Error('نوع التكامل، اسمه ومعرف الجهاز مطلوبة');
    }

    // التحقق من صحة التكوين حسب النوع
    if (type === 'google_sheets') {
        if (!config || !config.sheetId || !config.phoneColumn || !config.messageColumn) {
            throw new Error('معرف جدول البيانات، عمود الهاتف وعمود الرسالة مطلوبة لتكامل Google Sheets');
        }
    } else if (type === 'webhook') {
        if (!config || !config.webhookUrl) {
            throw new Error('عنوان URL للـ webhook مطلوب لتكامل Webhook');
        }
    }

    const integrationId = uuidv4();
    const newIntegration = {
        id: integrationId,
        type,
        name,
        deviceId,
        config,
        syncInterval: syncInterval || 5,
        active: active !== undefined ? active : true,
        createdAt: new Date().toISOString(),
        lastSync: null,
        stats: { sent: 0, failed: 0, processed: 0 }
    };

    integrations.push(newIntegration);
    saveIntegrations();

    if (newIntegration.active && newIntegration.type === 'google_sheets') {
        scheduleIntegration(newIntegration);
    }

    return newIntegration;
}

function updateIntegration(id, updatedData) {
    const integrationIndex = integrations.findIndex(i => i.id === id);
    if (integrationIndex === -1) {
        throw new Error('التكامل غير موجود');
    }

    const originalIntegration = integrations[integrationIndex];
    const wasActive = originalIntegration.active;
    const originalType = originalIntegration.type;

    // تحديث المعلومات
    integrations[integrationIndex] = {
        ...originalIntegration,
        ...updatedData,
        config: updatedData.config ? { ...originalIntegration.config, ...updatedData.config } : originalIntegration.config,
        updatedAt: new Date().toISOString()
    };

    const updatedIntegration = integrations[integrationIndex];
    saveIntegrations();

    // إعادة الجدولة إذا تغيرت الحالة أو الفاصل الزمني أو النوع (إذا كان يدعم الجدولة)
    if (updatedIntegration.type === 'google_sheets' && (wasActive !== updatedIntegration.active || originalIntegration.syncInterval !== updatedIntegration.syncInterval || originalType !== updatedIntegration.type)) {
        if (integrationJobs[id]) {
            integrationJobs[id].cancel();
            delete integrationJobs[id];
        }
        if (updatedIntegration.active) {
            scheduleIntegration(updatedIntegration);
        }
    } else if (updatedIntegration.type !== 'google_sheets' && integrationJobs[id]) {
        // إلغاء الجدولة إذا لم يعد النوع يدعمها
        integrationJobs[id].cancel();
        delete integrationJobs[id];
    }

    return updatedIntegration;
}

function deleteIntegration(id) {
    // إعادة تحميل التكاملات من الملف للتأكد من استخدام أحدث البيانات
    try {
        if (fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
            integrations = JSON.parse(fs.readFileSync(CONFIG.INTEGRATIONS_FILE));
            console.log(`تم إعادة تحميل ${integrations.length} تكامل من الملف قبل عملية الحذف.`);
        }
    } catch (error) {
        console.error('خطأ في إعادة تحميل ملف التكاملات قبل الحذف:', error);
    }
    
    // البحث عن التكامل المطلوب حذفه
    const integrationIndex = integrations.findIndex(i => i.id === id);
    if (integrationIndex === -1) {
        console.warn(`لا يمكن العثور على التكامل بمعرف: ${id} للحذف. عدد التكاملات المتاحة: ${integrations.length}`);
        
        // بدلاً من رمي استثناء، نقوم بمسح أي تكاملات قديمة بنفس المعرف من الذاكرة المؤقتة وملف التكاملات
        // هذا يضمن أن الملف والذاكرة متزامنين حتى لو كان هناك خلل في المزامنة
        if (integrationJobs[id]) {
            integrationJobs[id].cancel();
            delete integrationJobs[id];
            console.log(`تم إلغاء جدولة التكامل (${id}) رغم عدم وجوده في القائمة`);
        }
        
        // عودة بيانات فارغة لتجنب الخطأ في واجهة المستخدم
        return { id: id, message: "تم التعامل مع طلب الحذف، لكن التكامل غير موجود في القائمة" };
    }

    // إلغاء الجدولة إذا كانت موجودة
    if (integrationJobs[id]) {
        integrationJobs[id].cancel();
        delete integrationJobs[id];
    }

    // حذف التكامل وحفظ التغييرات
    const deletedIntegration = integrations.splice(integrationIndex, 1)[0];
    console.log(`تم حذف التكامل: ${deletedIntegration.name} (${deletedIntegration.id})`);
    saveIntegrations();
    
    return deletedIntegration;
}

function toggleIntegration(id, active) {
    const integrationIndex = integrations.findIndex(i => i.id === id);
    if (integrationIndex === -1) {
        throw new Error('التكامل غير موجود');
    }

    const integration = integrations[integrationIndex];
    integration.active = active !== undefined ? active : !integration.active;
    integration.updatedAt = new Date().toISOString();
    saveIntegrations();

    // إعادة الجدولة
    if (integration.type === 'google_sheets') { // فقط للأنواع التي تدعم الجدولة
        if (integrationJobs[id]) {
            integrationJobs[id].cancel();
            delete integrationJobs[id];
        }
        if (integration.active) {
            scheduleIntegration(integration);
        }
    }

    return integration;
}

async function runIntegrationManually(id) {
    // إعادة تحميل التكاملات من الملف للتأكد من استخدام أحدث البيانات
    try {
        if (fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
            integrations = JSON.parse(fs.readFileSync(CONFIG.INTEGRATIONS_FILE));
            console.log(`تم إعادة تحميل ${integrations.length} تكامل من الملف قبل التنفيذ.`);
        }
    } catch (error) {
        console.error('خطأ في إعادة تحميل ملف التكاملات:', error);
    }

    // البحث عن التكامل المطلوب
    const integrationIndex = integrations.findIndex(i => i.id === id);
    if (integrationIndex === -1) {
        console.warn(`لا يمكن العثور على التكامل بمعرف: ${id}. عدد التكاملات المتاحة: ${integrations.length}`);
        
        // عودة برسالة خطأ أكثر وضوحًا وفائدة
        return { 
            error: true, 
            message: "لم يتم العثور على التكامل، قد يكون تم حذفه بالفعل. الرجاء تحديث الصفحة وإعادة المحاولة.",
            id: id 
        };
    }

    const integration = integrations[integrationIndex];
    console.log(`تشغيل يدوي للتكامل: ${integration.name} (${integration.id})`);

    try {
        let stats = {};
        if (integration.type === 'google_sheets') {
            stats = await processGoogleSheetsIntegration(integration);
        } else if (integration.type === 'webhook') {
            // لا يوجد إجراء يدوي قياسي لتكاملات webhook التي تعتمد على الأحداث
            console.log(`التكامل ${integration.name} من نوع webhook، لا يوجد إجراء تشغيل يدوي.`);
            stats = { message: "Webhook integrations are event-driven and don't have a manual run action." };
        }

        // تحديث وقت آخر مزامنة والإحصائيات
        integration.lastSync = new Date().toISOString();
        integration.stats = {
            ...integration.stats || {},
            sent: (integration.stats?.sent || 0) + (stats.sent || 0),
            failed: (integration.stats?.failed || 0) + (stats.failed || 0),
            processed: (integration.stats?.processed || 0) + (stats.processed || 0),
            lastRun: {
                date: integration.lastSync,
                stats: stats
            }
        };
        delete integration.lastError; // إزالة الخطأ الأخير عند النجاح

        saveIntegrations();
        console.log(`اكتمل التشغيل اليدوي للتكامل: ${integration.name} (${integration.id})`, stats);
        return { integration, stats };

    } catch (error) {
        console.error(`خطأ في التشغيل اليدوي للتكامل: ${integration.name} (${integration.id})`, error.message);
        integration.lastError = {
            date: new Date().toISOString(),
            message: error.message
        };
        saveIntegrations();
        throw error; // إعادة رمي الخطأ ليتم التعامل معه في المسار
    }
}

function saveIntegrations() {
    try {
        fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify(integrations, null, 2));
    } catch (error) {
        console.error('فشل في حفظ ملف التكاملات:', error);
    }
}

// تصدير الوظائف اللازمة
module.exports = {
    scheduleIntegrations,
    scheduleIntegration,
    processWebhookIntegration, // تحتاجها خدمة whatsappClient عند استقبال رسالة
    getIntegrations,
    getIntegrationById,
    addIntegration,
    updateIntegration,
    deleteIntegration,
    toggleIntegration,
    runIntegrationManually,
    integrations, // تصدير القائمة نفسها إذا احتاجتها وحدات أخرى مباشرة
    integrationJobs // قد تحتاجها لإدارة المهام من الخارج
};