/**
 * @file aiResponseService.js
 * @description خدمة الرد الذكي باستخدام Google Gemini وربط Google Sheets
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const CONFIG = require('../config/config');

// مسار حفظ ملف إعدادات الرد الذكي
const AI_CONFIG_PATH = path.join(CONFIG.DATA_DIR, 'ai_responses.json');
const INTEGRATIONS_FILE = path.join(CONFIG.DATA_DIR, 'integrations.json');

class AIResponseService {
    constructor() {
        this.responses = [];
        this.googleAIInstances = {};
        this.googleSheetsInstances = {};
        this.loadResponses();
    }

    /**
     * تحميل نماذج الرد الذكي من الملف
     */
    loadResponses() {
        try {
            console.log('جارٍ تحميل نماذج الرد الذكي...');

            // قراءة من ملف التكاملات الرئيسي
            if (fs.existsSync(INTEGRATIONS_FILE)) {
                console.log(`تم العثور على ملف التكاملات: ${INTEGRATIONS_FILE}`);
                const integrations = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));
                console.log(`عدد التكاملات المحملة: ${integrations.length}`);

                this.responses = integrations.filter(integration => integration.type === 'ai-response') || [];
                console.log(`عدد نماذج الرد الذكي المحملة: ${this.responses.length}`);

                // طباعة معلومات عن كل نموذج
                this.responses.forEach(response => {
                    console.log(`نموذج: ${response.id} - ${response.name}, نشط: ${response.active}, الجهاز: ${response.deviceId || 'غير محدد'}`);
                });
            } else {
                // إذا لم يوجد ملف التكاملات، تحقق من وجود ملف خاص للرد الذكي
                console.log(`لم يتم العثور على ملف التكاملات. التحقق من وجود ملف خاص للرد الذكي: ${AI_CONFIG_PATH}`);

                if (fs.existsSync(AI_CONFIG_PATH)) {
                    console.log(`تم العثور على ملف الرد الذكي: ${AI_CONFIG_PATH}`);
                    this.responses = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
                    console.log(`عدد نماذج الرد الذكي المحملة: ${this.responses.length}`);
                } else {
                    console.log('لم يتم العثور على أي ملف للرد الذكي. سيتم استخدام قائمة فارغة.');
                    this.responses = [];
                }
            }

            // التحقق من صحة النماذج
            this.responses = this.responses.filter(response => {
                if (!response.id || !response.name || !response.type) {
                    console.warn(`تم تجاهل نموذج غير صالح:`, response);
                    return false;
                }
                return true;
            });

            console.log(`تم تحميل ${this.responses.length} نموذج رد ذكي بنجاح.`);
        } catch (error) {
            console.error('خطأ في تحميل نماذج الرد الذكي:', error);
            this.responses = [];
        }
    }

    /**
     * حفظ نماذج الرد الذكي في الملف
     */
    async saveResponses() {
        try {
            // التأكد من وجود مجلد البيانات
            if (!fs.existsSync(CONFIG.DATA_DIR)) {
                fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
            }

            // حفظ في ملف التكاملات الرئيسي
            if (fs.existsSync(INTEGRATIONS_FILE)) {
                const integrations = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));

                // إزالة جميع تكاملات الرد الذكي السابقة
                const otherIntegrations = integrations.filter(integration => integration.type !== 'ai-response');

                // إضافة نماذج الرد الذكي الحالية
                const updatedIntegrations = [...otherIntegrations, ...this.responses.map(response => ({
                    ...response,
                    type: 'ai-response'
                }))];

                fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(updatedIntegrations, null, 2));
            } else {
                // إذا لم يوجد ملف التكاملات، احفظ في ملف منفصل
                fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(this.responses, null, 2));
            }
        } catch (error) {
            console.error('خطأ في حفظ نماذج الرد الذكي:', error);
            throw error;
        }
    }

    /**
     * الحصول على جميع نماذج الرد الذكي
     * @returns {Array} قائمة نماذج الرد الذكي
     */
    async getAllResponses() {
        return this.responses;
    }

    /**
     * الحصول على نموذج رد ذكي بواسطة المعرف
     * @param {String} id معرف نموذج الرد الذكي
     * @returns {Object} نموذج الرد الذكي
     */
    async getResponseById(id) {
        return this.responses.find(response => response.id === id);
    }

    /**
     * إضافة نموذج رد ذكي جديد
     * @param {Object} response نموذج الرد الذكي
     * @returns {Object} نموذج الرد الذكي المضاف
     */
    async addResponse(response) {
        this.responses.push(response);
        await this.saveResponses();
        return response;
    }

    /**
     * تحديث نموذج رد ذكي
     * @param {String} id معرف نموذج الرد الذكي
     * @param {Object} updatedResponse نموذج الرد الذكي المحدث
     * @returns {Object} نموذج الرد الذكي المحدث
     */
    async updateResponse(id, updatedResponse) {
        const index = this.responses.findIndex(response => response.id === id);
        if (index === -1) {
            throw new Error('نموذج الرد الذكي غير موجود');
        }

        this.responses[index] = updatedResponse;
        await this.saveResponses();
        return updatedResponse;
    }

    /**
     * حذف نموذج رد ذكي
     * @param {String} id معرف نموذج الرد الذكي
     * @returns {Boolean} نتيجة الحذف
     */
    async deleteResponse(id) {
        const initialLength = this.responses.length;
        this.responses = this.responses.filter(response => response.id !== id);

        if (this.responses.length !== initialLength) {
            await this.saveResponses();
            return true;
        }

        return false;
    }

    /**
     * إنشاء مثيل Google Gemini
     * @param {Object} config إعدادات Google Gemini
     * @returns {Object} مثيل Google Gemini
     */
    getGeminiInstance(config) {
        // استخدام مفتاح API الافتراضي إذا لم يتم توفيره
        const apiKey = config.apiKey || 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';

        const cacheKey = apiKey;

        try {
            if (!this.googleAIInstances[cacheKey]) {
                console.log(`إنشاء مثيل جديد لـ Google Gemini باستخدام مفتاح API`);
                this.googleAIInstances[cacheKey] = new GoogleGenerativeAI(apiKey);
            }

            return this.googleAIInstances[cacheKey];
        } catch (error) {
            console.error(`خطأ في إنشاء مثيل Google Gemini:`, error);
            // محاولة إنشاء مثيل جديد باستخدام المفتاح الافتراضي
            return new GoogleGenerativeAI('AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0');
        }
    }

    /**
     * إنشاء مثيل Google Sheets
     * @param {Object} config إعدادات Google Sheets
     * @returns {Object} مثيل Google Sheets
     */
    async getGoogleSheetsInstance(config) {
        if (!config.googleSheetsId) {
            throw new Error('معرف ملف Google Sheets مطلوب');
        }

        const cacheKey = config.googleSheetsId;

        if (!this.googleSheetsInstances[cacheKey]) {
            // إذا كانت الإعدادات تحتوي على بيانات اعتماد الخدمة
            if (config.serviceAccountCredentials) {
                const serviceAccountAuth = new JWT({
                    email: config.serviceAccountCredentials.client_email,
                    key: config.serviceAccountCredentials.private_key,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });

                const doc = new GoogleSpreadsheet(config.googleSheetsId, serviceAccountAuth);
                await doc.loadInfo();
                this.googleSheetsInstances[cacheKey] = doc;
            } else {
                // استخدام وصول مشترك بدون مصادقة (يجب أن يكون الملف عامًا للقراءة)
                const doc = new GoogleSpreadsheet(config.googleSheetsId);
                await doc.useApiKey(config.apiKey); // استخدام مفتاح API نفسه لـ Gemini
                await doc.loadInfo();
                this.googleSheetsInstances[cacheKey] = doc;
            }
        }

        return this.googleSheetsInstances[cacheKey];
    }

    /**
     * قراءة البيانات من Google Sheets
     * @param {Object} config إعدادات Google Sheets
     * @returns {Array} البيانات المقروءة
     */
    async readSheetData(config) {
        try {
            const doc = await this.getGoogleSheetsInstance(config);

            // التعامل مع ورقة عمل محددة
            const sheetIndex = config.sheetIndex || 0;
            const sheet = doc.sheetsByIndex[sheetIndex];

            if (!sheet) {
                throw new Error(`ورقة العمل رقم ${sheetIndex} غير موجودة`);
            }

            await sheet.loadCells();
            const rows = await sheet.getRows();

            // تحويل البيانات إلى تنسيق مناسب
            return rows.map(row => {
                const rowData = {};
                sheet.headerValues.forEach(header => {
                    rowData[header] = row[header];
                });
                return rowData;
            });
        } catch (error) {
            console.error('خطأ في قراءة بيانات Google Sheets:', error);
            throw error;
        }
    }

    /**
     * تحويل البيانات إلى نص مناسب للاستخدام في سياق الرد الذكي
     * @param {Array} data البيانات المقروءة
     * @returns {String} النص المحول
     */
    formatDataToContext(data) {
        if (!data || data.length === 0) {
            return "لا توجد بيانات متاحة.";
        }

        let context = "فيما يلي البيانات المتاحة:\n\n";

        data.forEach((row, index) => {
            context += `${index + 1}. `;

            for (const [key, value] of Object.entries(row)) {
                context += `${key}: ${value}, `;
            }

            // إزالة الفاصلة الأخيرة
            context = context.slice(0, -2);
            context += "\n";
        });

        return context;
    }

    /**
     * البحث في بيانات Google Sheets
     * @param {Array} data البيانات
     * @param {String} query الاستعلام
     * @returns {Array} نتائج البحث
     */
    searchInSheetData(data, query) {
        if (!data || data.length === 0 || !query) {
            return [];
        }

        const lowerQuery = query.toLowerCase();

        return data.filter(row => {
            for (const value of Object.values(row)) {
                if (value && value.toString().toLowerCase().includes(lowerQuery)) {
                    return true;
                }
            }
            return false;
        });
    }

    /**
     * معالجة رسالة باستخدام نموذج الرد الذكي
     * @param {Object} message الرسالة الواردة
     * @param {Object} responseConfig إعدادات نموذج الرد الذكي
     * @returns {Object} الرد المولد
     */
    async processMessage(message, responseConfig) {
        console.log(`بدء معالجة الرسالة باستخدام نموذج: ${responseConfig.id} - ${responseConfig.name}`);

        // التحقق من فعالية النموذج
        if (!responseConfig.active) {
            console.log(`نموذج الرد الذكي ${responseConfig.id} غير مفعل.`);
            return null;
        }

        let queryText = '';

        if (typeof message === 'string') {
            queryText = message;
            console.log(`الرسالة من نوع نص: "${queryText}"`);
        } else if (message.body) {
            queryText = message.body;
            console.log(`الرسالة من نوع كائن: "${queryText}"`);
        } else {
            console.error('تنسيق رسالة غير صالح:', message);
            return null;
        }

        // التحقق من المشغلات (Triggers) إذا كانت محددة
        if (responseConfig.triggers && responseConfig.triggers.length > 0) {
            console.log(`التحقق من المشغلات. عدد المشغلات: ${responseConfig.triggers.length}`);
            console.log(`المشغلات: ${JSON.stringify(responseConfig.triggers)}`);

            const messageText = queryText.toLowerCase();
            const matchesTrigger = responseConfig.triggers.some(trigger => {
                const matches = messageText.includes(trigger.toLowerCase());
                console.log(`التحقق من المشغل: "${trigger}" - يتطابق: ${matches}`);
                return matches;
            });

            if (!matchesTrigger) {
                console.log(`الرسالة لا تطابق أي مشغل لنموذج الرد الذكي ${responseConfig.id}.`);
                return null;
            } else {
                console.log(`الرسالة تطابق أحد المشغلات لنموذج الرد الذكي ${responseConfig.id}.`);
            }
        } else {
            console.log(`لا توجد مشغلات محددة لنموذج الرد الذكي ${responseConfig.id}. سيتم معالجة جميع الرسائل.`);
        }

        try {
            // استخدام Google Sheets إذا كان مفعلاً
            let sheetData = null;
            let contextWithSheetData = '';

            if (responseConfig.config && (responseConfig.config.useGoogleSheets || responseConfig.config.googleSheetsId)) {
                try {
                    sheetData = await this.readSheetData(responseConfig.config);

                    // تحسين البحث إذا كان هناك استعلام محدد
                    if (queryText) {
                        const relevantData = this.searchInSheetData(sheetData, queryText);
                        if (relevantData.length > 0) {
                            contextWithSheetData = this.formatDataToContext(relevantData);
                        } else {
                            contextWithSheetData = this.formatDataToContext(sheetData);
                        }
                    } else {
                        contextWithSheetData = this.formatDataToContext(sheetData);
                    }
                } catch (sheetError) {
                    console.error(`خطأ في قراءة بيانات Google Sheets:`, sheetError);
                    contextWithSheetData = "تعذر قراءة بيانات جوجل شيت: " + sheetError.message;
                }
            }

            // استدعاء Gemini API - تعديل لدعم أنواع إضافية
            const type = responseConfig.type || 'gemini';

            switch (type) {
                case 'gemini':
                case 'sheets_enhanced': // إضافة دعم لنوع sheets_enhanced
                case 'gemini_only':     // إضافة دعم لنوع gemini_only
                    return await this.generateGeminiResponse(queryText, contextWithSheetData, responseConfig.config, sheetData);

                case 'sheets_query':
                    // التعامل مع الاستعلامات المباشرة من البيانات بدون AI
                    if (sheetData) {
                        const relevantData = this.searchInSheetData(sheetData, queryText);
                        const formattedData = this.formatDataToContext(relevantData.length > 0 ? relevantData : sheetData);
                        return {
                            text: `نتائج البحث:\n\n${formattedData}`,
                            metadata: { type: 'direct_query', dataRows: sheetData.length }
                        };
                    } else {
                        return {
                            text: "لم يتم العثور على بيانات للرد على استفسارك.",
                            metadata: { type: 'direct_query', error: 'no_data' }
                        };
                    }

                default:
                    throw new Error(`نوع نموذج الرد الذكي غير مدعوم: ${type}`);
            }
        } catch (error) {
            console.error(`خطأ في معالجة الرسالة بواسطة نموذج الرد الذكي ${responseConfig.id}:`, error);
            return {
                text: `عذراً، حدث خطأ في معالجة الرسالة: ${error.message}`,
                metadata: { error: error.message }
            };
        }
    }

    /**
     * استخدام Google Gemini لتوليد رد ذكي
     * @param {String} query الاستعلام
     * @param {String} context السياق الإضافي
     * @param {Object} config إعدادات Google Gemini
     * @param {Array} rawData البيانات الخام (اختياري)
     * @returns {Object} الرد المولد
     */
    async generateGeminiResponse(query, context, config, rawData = null) {
        try {
            // استخدام مفتاح API الجديد إذا لم يتم تحديده في الإعدادات
            if (!config.apiKey) {
                config.apiKey = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0'; // استخدام المفتاح الجديد
                console.log('استخدام مفتاح API الافتراضي لـ Google Gemini');
            }

            const genAI = this.getGeminiInstance(config);

            // قائمة النماذج المتوافقة المتاحة حاليًا (مرتبة حسب الأفضلية)
            const compatibleModels = [
                'gemini-1.5-flash-latest',
                'gemini-1.5-flash',
                'gemini-1.5-pro',
                'gemini-pro',
                'gemini-pro-latest'
            ];

            // اختيار النموذج المناسب مع التحقق من صلاحية النموذج
            let modelName = config.model || 'gemini-pro';
            let modelToUse = 'gemini-pro'; // استخدام gemini-pro كنموذج افتراضي

            // التحقق من النموذج وتحويله إذا لزم الأمر
            if (modelName.includes('2.0') || !compatibleModels.includes(modelName)) {
                console.log(`تحذير: النموذج ${modelName} غير متوفر، سيتم استخدام النموذج الافتراضي gemini-pro.`);
            } else {
                modelToUse = modelName;
            }

            console.log(`استخدام النموذج: ${modelToUse}`);
            const model = genAI.getGenerativeModel({ model: modelToUse });

            // إعداد المطالبة بناءً على السياق (إذا وجد)
            let promptText = query;

            if (context) {
                promptText = `${context}\n\nسؤال العميل: ${query}\n\nالرجاء الإجابة على سؤال العميل بناءً على البيانات المقدمة أعلاه. إذا كانت الإجابة غير موجودة في البيانات، يرجى التوضيح بأن المعلومات غير متوفرة.`;
                console.log('تم إضافة سياق إضافي للمطالبة');
            }

            console.log(`المطالبة النهائية: "${promptText.substring(0, 100)}..."`);

            // إعدادات توليد النص
            const generationConfig = {
                temperature: config.temperature || 0.7,
                topK: config.topK || 40,
                topP: config.topP || 0.95,
                maxOutputTokens: config.maxTokens || 800,
            };

            console.log(`إعدادات توليد النص:`, generationConfig);
            console.log(`مفتاح API: ${config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'غير محدد'}`);
            console.log(`النموذج المستخدم: ${modelToUse}`);

            // توليد النص
            try {
                console.log('جارٍ إرسال الطلب إلى Google Gemini...');

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: promptText }] }],
                    generationConfig,
                });

                console.log('تم استلام الرد من Google Gemini');

                const response = result.response;
                const text = response.text();

                console.log(`الرد: "${text.substring(0, 100)}..."`);

                return {
                    text,
                    metadata: {
                        model: modelToUse,
                        usedGoogleSheets: !!context,
                        dataRows: rawData ? rawData.length : 0
                    }
                };

            } catch (generateError) {
                // إذا فشل توليد المحتوى، إرجاع رسالة خطأ أكثر تفصيلاً
                console.error('خطأ أثناء توليد المحتوى:', generateError);

                // إرجاع رسالة خطأ صديقة للمستخدم
                return {
                    text: "عذراً، لم أتمكن من معالجة طلبك في الوقت الحالي. قد تكون هناك مشكلة مع خدمة الذكاء الاصطناعي. يرجى التحقق من صلاحية مفتاح API أو المحاولة لاحقاً.",
                    metadata: {
                        error: true,
                        errorMessage: generateError.message,
                        model: modelToUse
                    }
                };
            }

        } catch (error) {
            console.error('خطأ في توليد الرد باستخدام Google Gemini:', error);
            return {
                text: `حدثت مشكلة أثناء الاتصال بخدمة الذكاء الاصطناعي: ${error.message}`,
                metadata: {
                    error: true,
                    errorMessage: error.message
                }
            };
        }
    }

    /**
     * معالجة رسالة واردة من عميل واتساب
     * @param {Object} message رسالة واتساب الواردة
     * @param {Object} client عميل واتساب
     * @returns {Object} نتيجة المعالجة
     */
    async processIncomingWhatsAppMessage(message, client) {
        console.log('بدء معالجة رسالة واتساب واردة');
        console.log('محتوى الرسالة:', message.body);
        console.log('معرف الجهاز:', client.id);

        // التحقق من تحميل النماذج
        if (this.responses.length === 0) {
            console.log('لا توجد نماذج رد ذكي محملة. إعادة تحميل النماذج...');
            this.loadResponses();
            console.log('عدد النماذج المحملة:', this.responses.length);
        }

        // الحصول على جميع نماذج الرد الذكي النشطة للجهاز
        const deviceId = client.id || '';
        console.log('البحث عن نماذج الرد الذكي للجهاز:', deviceId);

        const activeResponses = this.responses.filter(
            response => {
                const isActive = response.active;
                const matchesDevice = !response.deviceId || response.deviceId === deviceId;
                console.log(`نموذج ${response.id} - ${response.name}: نشط=${isActive}, يتطابق مع الجهاز=${matchesDevice}, معرف الجهاز في النموذج=${response.deviceId || 'غير محدد'}`);
                return isActive && matchesDevice;
            }
        );

        console.log('عدد نماذج الرد الذكي النشطة للجهاز:', activeResponses.length);

        if (activeResponses.length === 0) {
            return { processed: false, reason: 'لا توجد نماذج رد ذكي نشطة' };
        }

        for (const response of activeResponses) {
            try {
                const responseResult = await this.processMessage(message, response);

                // إذا تمت معالجة الرسالة ويوجد رد
                if (responseResult && responseResult.text) {
                    // إرسال الرد إلى المرسل الأصلي
                    const chat = await client.client.getChatById(message.from);
                    await chat.sendMessage(responseResult.text);

                    return {
                        processed: true,
                        responseId: response.id,
                        responseName: response.name,
                        response: responseResult.text
                    };
                }
            } catch (error) {
                console.error(`خطأ في معالجة الرسالة بواسطة نموذج الرد الذكي ${response.id}:`, error);
            }
        }

        return { processed: false, reason: 'لا توجد ردود مناسبة' };
    }
}

// إنشاء كائن مفرد (singleton)
const aiResponseService = new AIResponseService();

module.exports = { aiResponseService };