/**
 * @file aiResponseController.js
 * @description وحدة التحكم في نظام الرد الذكي بواسطة Google Gemini وربطه بـ Google Sheets
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { aiResponseService } = require('../services/aiResponseService');
const CONFIG = require('../config/config');

// مسار حفظ ملف إعدادات الرد الذكي
const AI_RESPONSES_FILE = path.join(CONFIG.DATA_DIR, 'integrations.json');

/**
 * الحصول على جميع نماذج الرد الذكي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getAllAIResponses(req, res) {
    try {
        const responses = await aiResponseService.getAllResponses();

        res.json({
            status: true,
            data: responses
        });
    } catch (error) {
        console.error('خطأ في الحصول على نماذج الرد الذكي:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على نماذج الرد الذكي'
        });
    }
}

/**
 * الحصول على نموذج رد ذكي محدد
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getAIResponse(req, res) {
    try {
        const { responseId } = req.params;

        if (!responseId) {
            return res.status(400).json({
                status: false,
                message: 'معرف نموذج الرد الذكي مطلوب'
            });
        }

        const response = await aiResponseService.getResponseById(responseId);

        if (!response) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على نموذج الرد الذكي'
            });
        }

        res.json({
            status: true,
            data: response
        });
    } catch (error) {
        console.error(`خطأ في الحصول على نموذج الرد الذكي ${req.params.responseId}:`, error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على نموذج الرد الذكي'
        });
    }
}

/**
 * إضافة نموذج رد ذكي جديد
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function addAIResponse(req, res) {
    try {
        const {
            name,
            description,
            type,
            active = true,
            config = {},
            triggers = [],
            deviceId
        } = req.body;

        if (!name || !type || !deviceId) {
            return res.status(400).json({
                status: false,
                message: 'اسم النموذج ونوعه ومعرف الجهاز مطلوبة'
            });
        }

        // التحقق من صحة الإعدادات
        if (type === 'gemini' && !config.model) {
            return res.status(400).json({
                status: false,
                message: 'نموذج Google Gemini مطلوب'
            });
        }

        // استخدام مفتاح API الافتراضي إذا لم يتم توفيره
        if (type === 'gemini' && !config.apiKey) {
            config.apiKey = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';
            console.log('استخدام مفتاح API الافتراضي لـ Google Gemini');
        }

        if (config.useGoogleSheets && !config.googleSheetsId) {
            return res.status(400).json({
                status: false,
                message: 'معرف ملف Google Sheets مطلوب عند تفعيل خاصية Google Sheets'
            });
        }

        const newResponse = {
            id: uuidv4(),
            name,
            description,
            type,
            active,
            config,
            triggers,
            deviceId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await aiResponseService.addResponse(newResponse);

        res.status(201).json({
            status: true,
            message: 'تمت إضافة نموذج الرد الذكي بنجاح',
            data: newResponse
        });
    } catch (error) {
        console.error('خطأ في إضافة نموذج رد ذكي:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء إضافة نموذج الرد الذكي'
        });
    }
}

/**
 * تحديث نموذج رد ذكي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function updateAIResponse(req, res) {
    try {
        const { responseId } = req.params;
        const {
            name,
            description,
            type,
            active,
            config,
            triggers,
            deviceId
        } = req.body;

        if (!responseId) {
            return res.status(400).json({
                status: false,
                message: 'معرف نموذج الرد الذكي مطلوب'
            });
        }

        // التأكد من وجود النموذج
        const existingResponse = await aiResponseService.getResponseById(responseId);
        if (!existingResponse) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على نموذج الرد الذكي'
            });
        }

        // التحقق من صحة الإعدادات
        if (type === 'gemini' && config && !config.model) {
            return res.status(400).json({
                status: false,
                message: 'نموذج Google Gemini مطلوب'
            });
        }

        // استخدام مفتاح API الافتراضي إذا لم يتم توفيره
        if (type === 'gemini' && config && !config.apiKey) {
            config.apiKey = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';
            console.log('استخدام مفتاح API الافتراضي لـ Google Gemini في التحديث');
        }

        if (config && config.useGoogleSheets && !config.googleSheetsId) {
            return res.status(400).json({
                status: false,
                message: 'معرف ملف Google Sheets مطلوب عند تفعيل خاصية Google Sheets'
            });
        }

        const updatedResponse = {
            ...existingResponse,
            name: name || existingResponse.name,
            description: description !== undefined ? description : existingResponse.description,
            type: type || existingResponse.type,
            active: active !== undefined ? active : existingResponse.active,
            config: config ? { ...existingResponse.config, ...config } : existingResponse.config,
            triggers: triggers || existingResponse.triggers,
            deviceId: deviceId || existingResponse.deviceId,
            updatedAt: new Date().toISOString()
        };

        await aiResponseService.updateResponse(responseId, updatedResponse);

        res.json({
            status: true,
            message: 'تم تحديث نموذج الرد الذكي بنجاح',
            data: updatedResponse
        });
    } catch (error) {
        console.error(`خطأ في تحديث نموذج الرد الذكي ${req.params.responseId}:`, error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء تحديث نموذج الرد الذكي'
        });
    }
}

/**
 * حذف نموذج رد ذكي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function deleteAIResponse(req, res) {
    try {
        const { responseId } = req.params;

        if (!responseId) {
            return res.status(400).json({
                status: false,
                message: 'معرف نموذج الرد الذكي مطلوب'
            });
        }

        // التأكد من وجود النموذج
        const existingResponse = await aiResponseService.getResponseById(responseId);
        if (!existingResponse) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على نموذج الرد الذكي'
            });
        }

        await aiResponseService.deleteResponse(responseId);

        res.json({
            status: true,
            message: 'تم حذف نموذج الرد الذكي بنجاح'
        });
    } catch (error) {
        console.error(`خطأ في حذف نموذج الرد الذكي ${req.params.responseId}:`, error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء حذف نموذج الرد الذكي'
        });
    }
}

/**
 * تفعيل/إيقاف نموذج رد ذكي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function toggleAIResponse(req, res) {
    try {
        const { responseId } = req.params;

        if (!responseId) {
            return res.status(400).json({
                status: false,
                message: 'معرف نموذج الرد الذكي مطلوب'
            });
        }

        // التأكد من وجود النموذج
        const existingResponse = await aiResponseService.getResponseById(responseId);
        if (!existingResponse) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على نموذج الرد الذكي'
            });
        }

        const updatedResponse = {
            ...existingResponse,
            active: !existingResponse.active,
            updatedAt: new Date().toISOString()
        };

        await aiResponseService.updateResponse(responseId, updatedResponse);

        res.json({
            status: true,
            message: `تم ${updatedResponse.active ? 'تفعيل' : 'إيقاف'} نموذج الرد الذكي بنجاح`,
            data: updatedResponse
        });
    } catch (error) {
        console.error(`خطأ في تبديل حالة نموذج الرد الذكي ${req.params.responseId}:`, error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء تبديل حالة نموذج الرد الذكي'
        });
    }
}

/**
 * اختبار نموذج رد ذكي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function testAIResponse(req, res) {
    try {
        const { responseId } = req.params;
        const { message } = req.body;

        if (!responseId) {
            return res.status(400).json({
                status: false,
                message: 'معرف نموذج الرد الذكي مطلوب'
            });
        }

        if (!message) {
            return res.status(400).json({
                status: false,
                message: 'الرسالة مطلوبة للاختبار'
            });
        }

        // التأكد من وجود النموذج
        const response = await aiResponseService.getResponseById(responseId);
        if (!response) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على نموذج الرد الذكي'
            });
        }

        // التحقق من صلاحية النموذج قبل الاختبار
        if (response.config?.model && (response.config.model.includes('2.0') || !['gemini-pro', 'gemini-pro-latest', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'].includes(response.config.model))) {
            response.config.model = 'gemini-pro'; // استبدال النموذج بنموذج متوافق
            console.log(`تم استبدال النموذج غير المتوافق بنموذج gemini-pro`);
        }

        // التأكد من وجود مفتاح API أو استخدام المفتاح الافتراضي
        if (!response.config) {
            response.config = {};
        }

        // استخدام مفتاح API الجديد إذا لم يتم تحديده
        if (!response.config.apiKey) {
            response.config.apiKey = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';
            console.log('استخدام مفتاح API الافتراضي للاختبار');
        }

        // اختبار النموذج
        const result = await aiResponseService.processMessage(message, response);

        if (!result) {
            return res.json({
                status: true,
                data: 'لم يتم إنشاء رد. تحقق من المشغلات (triggers) إذا كانت مكونة.'
            });
        }

        res.json({
            status: true,
            data: result.text || result,
            metadata: result.metadata
        });
    } catch (error) {
        console.error(`خطأ في اختبار نموذج الرد الذكي ${req.params.responseId}:`, error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء اختبار نموذج الرد الذكي'
        });
    }
}

// تصدير الوظائف
module.exports = {
    getAllAIResponses,
    getAIResponse,
    addAIResponse,
    updateAIResponse,
    deleteAIResponse,
    toggleAIResponse,
    testAIResponse
};