/**
 * @file aiResponseService.js
 * @description خدمة الرد الذكي باستخدام Google Gemini وربط Google Sheets (نسخة مدمجة ومحسنة)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios'); // قد لا يكون مطلوبًا إذا تم التحول بالكامل إلى google-spreadsheet
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const CONFIG = require('../config/config'); // استخدام مسار الإعدادات من الكود الجديد

// مسارات الملفات
const DATA_DIR = CONFIG.DATA_DIR || path.join(__dirname, '..', 'data'); // التأكد من وجود قيمة افتراضية
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
const AI_RESPONSES_FILE_LEGACY = path.join(DATA_DIR, 'ai_responses.json'); // للمقارنة أو القراءة الأولية

// التأكد من وجود مجلد البيانات
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class AIResponseService {
    constructor() {
        this.allIntegrations = []; // لتخزين جميع التكاملات من integrations.json
        this.responses = [];       // لتخزين نماذج الرد الذكي فقط
        this.activeResponses = new Map(); // النماذج النشطة جاهزة للاستخدام
        this.conversationHistory = new Map(); // سجل المحادثات لكل مستخدم ونموذج
        this.sheetsCache = new Map();       // ذاكرة تخزين مؤقت لبيانات Google Sheets
        this.googleAIInstances = {};      // لتخزين مثيلات Gemini API (يمكن تحسينها لاحقًا)
        this.googleSheetsInstances = {};   // لتخزين مثيلات Google Sheets API (يمكن تحسينها لاحقًا)

        this.loadIntegrations();
        this.initializeActiveResponses();
    }

    /**
     * تحميل جميع التكاملات من الملف الرئيسي، وتصفية نماذج الرد الذكي.
     */
    loadIntegrations() {
        try {
            if (fs.existsSync(INTEGRATIONS_FILE)) {
                this.allIntegrations = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));
                // تصفية نماذج الرد الذكي من بين جميع التكاملات
                this.responses = this.allIntegrations.filter(integration => integration.type === 'ai-response') || [];
                console.log(`تم تحميل ${this.responses.length} نموذج رد ذكي من ${INTEGRATIONS_FILE}`);
            } else if (fs.existsSync(AI_RESPONSES_FILE_LEGACY)) {
                // في حالة عدم وجود ملف التكاملات الرئيسي، اقرأ من الملف القديم (للتوافقية الأولية)
                console.warn(`ملف ${INTEGRATIONS_FILE} غير موجود، سيتم القراءة من ${AI_RESPONSES_FILE_LEGACY}`);
                this.responses = JSON.parse(fs.readFileSync(AI_RESPONSES_FILE_LEGACY, 'utf8'));
                // قم بإنشاء ملف التكاملات للمستقبل
                this.allIntegrations = this.responses.map(response => ({ ...response, type: 'ai-response' }));
                this.saveIntegrations();
                console.log(`تم تحميل ${this.responses.length} نموذج رد ذكي من الملف القديم وإنشاء ${INTEGRATIONS_FILE}`);
            } else {
                console.log('لم يتم العثور على ملف تكاملات أو ملف ردود ذكية قديم.');
                this.allIntegrations = [];
                this.responses = [];
                // إنشاء ملف تكاملات فارغ إذا لم يكن موجودًا
                 fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify([], null, 2), 'utf8');
            }
        } catch (error) {
            console.error('خطأ فادح في تحميل التكاملات أو نماذج الرد الذكي:', error);
            this.allIntegrations = [];
            this.responses = [];
        }
    }

    /**
     * حفظ جميع التكاملات (بما في ذلك الردود الذكية المحدثة) في الملف الرئيسي.
     */
    async saveIntegrations() {
        try {
            // التأكد من وجود مجلد البيانات
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            // استبدال نماذج الرد الذكي القديمة في قائمة التكاملات الكلية بالنسخ المحدثة
            const otherIntegrations = this.allIntegrations.filter(integration => integration.type !== 'ai-response');
            const updatedIntegrations = [...otherIntegrations, ...this.responses.map(response => ({
                ...response,
                type: 'ai-response' // التأكد من وجود النوع
            }))];

            // تحديث القائمة الكلية قبل الحفظ
            this.allIntegrations = updatedIntegrations;

            // كتابة القائمة المحدثة بالكامل في ملف التكاملات
            fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(updatedIntegrations, null, 2), 'utf8');
            console.log(`تم حفظ ${updatedIntegrations.length} تكامل في ${INTEGRATIONS_FILE}`);

        } catch (error) {
            console.error('خطأ في حفظ التكاملات:', error);
            // لا ترمي الخطأ هنا لمنع توقف التطبيق، لكن قم بتسجيله
        }
    }

    /**
     * تهيئة النماذج النشطة عند بدء التشغيل أو بعد التحديث.
     */
    async initializeActiveResponses() {
        console.log('جارٍ تهيئة نماذج الرد الذكي النشطة...');
        this.activeResponses.clear(); // مسح الخريطة قبل إعادة التهيئة
        this.sheetsCache.clear(); // مسح ذاكرة التخزين المؤقت للشيتات أيضًا
        let initializedCount = 0;
        for (const response of this.responses) {
            if (response.active) {
                const success = await this.initializeResponseRuntime(response);
                if (success) {
                    initializedCount++;
                }
            }
        }
        console.log(`تم تهيئة ${initializedCount} نموذج رد ذكي نشط.`);
    }

    /**
     * تهيئة نموذج رد ذكي واحد (للذاكرة النشطة وتحميل البيانات).
     * @param {Object} response - بيانات نموذج الرد الذكي.
     * @returns {Promise<boolean>} نجاح التهيئة.
     */
    async initializeResponseRuntime(response) {
        try {
            if (!response || !response.id) {
                console.error('محاولة تهيئة نموذج رد بدون معرف:', response);
                return false;
            }
             if (!response.active) {
                 this.removeResponseFromRuntime(response.id); // التأكد من إزالته إذا كان غير نشط
                 return true; // يعتبر نجاحًا لأنه تم التعامل مع الحالة غير النشطة
             }

            console.log(`تهيئة نموذج الرد (${response.id})...`);
            this.activeResponses.set(response.id, response);

            // تهيئة بيانات Google Sheets إذا كان النموذج يستخدمها ويتطلب ذلك
            if ((response.type === 'sheets_enhanced' || response.type === 'sheets_query') &&
                response.config?.sheetsId && response.config?.googleCredentialsPath) { // التأكد من وجود المسار للمصادقة
                await this.loadSheetsData(response.id, response.config.sheetsId, response.config.sheetName, response.config.googleCredentialsPath);
            } else if ((response.type === 'sheets_enhanced' || response.type === 'sheets_query') && response.config?.sheetsId) {
                 console.warn(`نموذج (${response.id}) يستخدم Sheets ولكن googleCredentialsPath غير محدد. لن يتم تحميل البيانات.`);
            }

            return true;
        } catch (error) {
            console.error(`خطأ في تهيئة نموذج الرد الذكي (${response.id}) في الذاكرة:`, error);
            this.activeResponses.delete(response.id); // إزالته من النشطين في حالة الفشل
            return false;
        }
    }

    /**
     * إعادة تهيئة نموذج رد ذكي (عادة بعد التحديث).
     * @param {string} responseId - معرف نموذج الرد الذكي.
     * @returns {Promise<boolean>} نجاح إعادة التهيئة.
     */
    async reinitializeResponse(responseId) {
        try {
            console.log(`إعادة تهيئة نموذج الرد (${responseId})...`);
            const response = this.responses.find(r => r.id === responseId);
            if (!response) {
                console.error(`لم يتم العثور على نموذج الرد (${responseId}) لإعادة تهيئته.`);
                this.removeResponseFromRuntime(responseId); // إزالته من الذاكرة إذا لم يعد موجودًا
                return false;
            }

            // إزالة النموذج من الذاكرة المؤقتة أولاً
            this.removeResponseFromRuntime(responseId);

            // إعادة تهيئة النموذج إذا كان نشطًا
            return await this.initializeResponseRuntime(response); // استخدام الدالة المحدثة

        } catch (error) {
            console.error(`خطأ في إعادة تهيئة نموذج الرد الذكي (${responseId}):`, error);
            return false;
        }
    }

    /**
     * إزالة نموذج رد ذكي من الذاكرة النشطة وذاكرة التخزين المؤقت.
     * @param {string} responseId - معرف نموذج الرد الذكي.
     * @returns {boolean} نجاح الإزالة من الذاكرة.
     */
    removeResponseFromRuntime(responseId) {
        try {
            this.activeResponses.delete(responseId);
            this.conversationHistory.delete(responseId); // مسح سجل المحادثات المرتبط به
            // مسح سجلات المحادثات الفردية لهذا النموذج
             for (let key of this.conversationHistory.keys()) {
                if (key.startsWith(`${responseId}_`)) {
                    this.conversationHistory.delete(key);
                }
            }
            this.sheetsCache.delete(responseId);
            console.log(`تمت إزالة نموذج الرد (${responseId}) من الذاكرة النشطة.`);
            return true;
        } catch (error) {
            console.error(`خطأ في إزالة نموذج الرد الذكي (${responseId}) من الذاكرة:`, error);
            return false;
        }
    }


    // --- CRUD Operations ---

    /**
     * الحصول على جميع نماذج الرد الذكي (من الإعدادات المحملة).
     * @returns {Promise<Array>} قائمة نماذج الرد الذكي.
     */
    async getAllResponses() {
        return [...this.responses]; // إرجاع نسخة لتجنب التعديل الخارجي المباشر
    }

    /**
     * الحصول على نموذج رد ذكي بواسطة المعرف.
     * @param {string} id - معرف نموذج الرد الذكي.
     * @returns {Promise<Object|null>} نموذج الرد الذكي أو null.
     */
    async getResponseById(id) {
        return this.responses.find(response => response.id === id) || null;
    }

    /**
     * إضافة نموذج رد ذكي جديد.
     * @param {Object} responseData - بيانات نموذج الرد الذكي الجديد (بدون type).
     * @returns {Promise<Object>} نموذج الرد الذكي المضاف.
     */
    async addResponse(responseData) {
         if (!responseData.id) {
            throw new Error('معرف النموذج (id) مطلوب لإضافة رد ذكي.');
        }
        if (this.responses.some(r => r.id === responseData.id)) {
            throw new Error(`نموذج رد ذكي بالمعرف ${responseData.id} موجود بالفعل.`);
        }

        const newResponse = {
            ...responseData,
            type: 'ai-response', // التأكد من إضافة النوع
            active: responseData.active !== undefined ? responseData.active : true, // افتراضي نشط
            stats: { repliesCount: 0, successCount: 0, failedCount: 0 } // تهيئة الإحصائيات
        };

        this.responses.push(newResponse);
        await this.saveIntegrations(); // حفظ التغيير في الملف

        // تهيئة النموذج إذا كان نشطًا
        if (newResponse.active) {
            await this.initializeResponseRuntime(newResponse);
        }
        return newResponse;
    }

    /**
     * تحديث نموذج رد ذكي موجود.
     * @param {string} id - معرف نموذج الرد الذكي للتحديث.
     * @param {Object} updatedData - البيانات الجديدة للنموذج (يمكن أن تكون جزئية).
     * @returns {Promise<Object>} نموذج الرد الذكي المحدث.
     */
    async updateResponse(id, updatedData) {
        const index = this.responses.findIndex(response => response.id === id);
        if (index === -1) {
            throw new Error(`نموذج الرد الذكي بالمعرف ${id} غير موجود.`);
        }

        // دمج البيانات القديمة مع الجديدة، مع الحفاظ على النوع والإحصائيات إن لم يتم توفيرها
        const originalResponse = this.responses[index];
        const updatedResponse = {
            ...originalResponse,
            ...updatedData,
            id: id, // التأكد من عدم تغيير المعرف
            type: 'ai-response', // التأكد من الحفاظ على النوع
            stats: updatedData.stats || originalResponse.stats // الحفاظ على الإحصائيات القديمة إذا لم يتم تحديثها
        };

        this.responses[index] = updatedResponse;
        await this.saveIntegrations(); // حفظ التغيير في الملف

        // إعادة تهيئة النموذج في الذاكرة (سيتعامل مع حالة active الجديدة)
        await this.reinitializeResponse(id);

        return updatedResponse;
    }

    /**
     * حذف نموذج رد ذكي.
     * @param {string} id - معرف نموذج الرد الذكي للحذف.
     * @returns {Promise<boolean>} نتيجة الحذف (true إذا تم الحذف).
     */
    async deleteResponse(id) {
        const initialLength = this.responses.length;
        this.responses = this.responses.filter(response => response.id !== id);

        if (this.responses.length !== initialLength) {
            await this.saveIntegrations(); // حفظ التغيير في الملف
            this.removeResponseFromRuntime(id); // إزالته من الذاكرة النشطة
            return true;
        }

        return false; // لم يتم العثور عليه لحذفه
    }

    /**
    * تعيين حالة نموذج رد ذكي (نشط/متوقف).
    * @param {string} responseId - معرف نموذج الرد الذكي.
    * @param {boolean} isActive - الحالة الجديدة.
    * @returns {Promise<boolean>} نجاح تعيين الحالة.
    */
    async setResponseStatus(responseId, isActive) {
        try {
            const responseIndex = this.responses.findIndex(r => r.id === responseId);
            if (responseIndex === -1) {
                console.error(`محاولة تغيير حالة نموذج غير موجود: ${responseId}`);
                return false;
            }

            // تحديث الحالة في مصفوفة الإعدادات
            this.responses[responseIndex].active = isActive;
            await this.saveIntegrations(); // حفظ الحالة الجديدة في الملف

            // تحديث الحالة في الذاكرة
            if (isActive) {
                // إذا أصبح نشطًا، قم بتهيئته أو إعادة تهيئته
                return await this.initializeResponseRuntime(this.responses[responseIndex]);
            } else {
                // إذا أصبح غير نشط، قم بإزالته من الذاكرة النشطة
                return this.removeResponseFromRuntime(responseId);
            }
        } catch (error) {
            console.error(`خطأ في تعيين حالة نموذج الرد الذكي (${responseId}):`, error);
            return false;
        }
    }

    // --- Google Sheets Integration (Using google-spreadsheet with JWT Auth) ---

    /**
     * الحصول على مثيل JWT Auth Client.
     * @param {string} credentialsPath - مسار ملف بيانات اعتماد حساب الخدمة JSON.
     * @returns {Promise<JWT>}
     */
    async getServiceAccountAuth(credentialsPath) {
        try {
            if (!fs.existsSync(credentialsPath)) {
                 throw new Error(`ملف بيانات الاعتماد (${credentialsPath}) غير موجود.`);
             }
            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            const jwt = new JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'], // أو .readonly إذا كان كافيًا
            });
            await jwt.authorize(); // التأكد من أن المصادقة ناجحة
            return jwt;
        } catch (error) {
             console.error(`خطأ في إنشاء JWT Auth Client من ${credentialsPath}:`, error);
             throw error; // إعادة رمي الخطأ ليتم التعامل معه في الدالة المستدعية
         }
    }

     /**
      * جلب بيانات من Google Sheets باستخدام المصادقة.
      * @param {string} sheetId - معرف ملف Google Sheets.
      * @param {string} sheetName - اسم الورقة (اختياري, سيتم استخدام أول ورقة إذا لم يحدد).
      * @param {string} credentialsPath - مسار ملف بيانات اعتماد حساب الخدمة JSON.
      * @returns {Promise<Array<Object>>} بيانات الجدول كـ Array of Objects.
      */
     async fetchGoogleSheetsData(sheetId, sheetName = '', credentialsPath) {
         try {
              if (!credentialsPath) {
                 throw new Error('مسار ملف بيانات اعتماد Google (credentialsPath) مطلوب لجلب بيانات Sheets.');
             }
             const auth = await this.getServiceAccountAuth(credentialsPath);
             const doc = new GoogleSpreadsheet(sheetId, auth);
             await doc.loadInfo(); // تحميل معلومات الملف والأوراق

             let sheet;
             if (sheetName) {
                 sheet = doc.sheetsByTitle[sheetName];
                 if (!sheet) {
                     throw new Error(`لم يتم العثور على ورقة بالاسم "${sheetName}" في الملف ${sheetId}`);
                 }
             } else {
                 sheet = doc.sheetsByIndex[0]; // استخدام أول ورقة إذا لم يحدد الاسم
                 if (!sheet) {
                      throw new Error(`لا توجد أوراق في الملف ${sheetId}`);
                  }
                 console.log(`اسم الورقة لم يحدد، سيتم استخدام أول ورقة: "${sheet.title}"`);
             }

             const rows = await sheet.getRows(); // جلب جميع الصفوف

             // تحويل الصفوف إلى كائنات بسيطة (key: header, value: cell value)
             const data = rows.map(row => row.toObject());

             console.log(`تم جلب ${data.length} صف من "${sheet.title}" في ملف ${sheetId}`);
             return data;

         } catch (error) {
             console.error(`خطأ في جلب بيانات Google Sheets (${sheetId}, الورقة: ${sheetName || 'الأولى'}):`, error);
             // قد يكون الخطأ بسبب الصلاحيات أو عدم وجود الملف/الورقة
             if (error.response?.data?.error) {
                 console.error('تفاصيل خطأ Google API:', error.response.data.error);
             }
             throw error; // إعادة رمي الخطأ للدالة المستدعية
         }
     }


    /**
     * تحميل وتخزين بيانات Google Sheets في الذاكرة المؤقتة.
     * @param {string} responseId - معرف نموذج الرد الذكي.
     * @param {string} sheetId - معرف ملف Google Sheets.
     * @param {string} sheetName - اسم الورقة (اختياري).
     * @param {string} credentialsPath - مسار ملف بيانات اعتماد حساب الخدمة JSON.
     * @returns {Promise<boolean>} نجاح التحميل.
     */
    async loadSheetsData(responseId, sheetId, sheetName = '', credentialsPath) {
        // التحقق من وجود مسار بيانات الاعتماد قبل المتابعة
         if (!credentialsPath) {
             console.error(`لا يمكن تحميل بيانات Sheets للنموذج ${responseId} بدون googleCredentialsPath.`);
             this.sheetsCache.delete(responseId); // التأكد من إزالة أي بيانات قديمة
             return false;
         }
        try {
            console.log(`جارٍ تحميل بيانات Google Sheets لنموذج ${responseId} (Sheet ID: ${sheetId})...`);
            const sheetsData = await this.fetchGoogleSheetsData(sheetId, sheetName, credentialsPath);

            if (!sheetsData) { // fetchGoogleSheetsData سترمي خطأ في حالة الفشل الحقيقي
                console.error(`فشل جلب بيانات Google Sheets للنموذج ${responseId}.`);
                this.sheetsCache.delete(responseId);
                return false;
            }
             if (sheetsData.length === 0) {
                 console.warn(`لا توجد بيانات في Google Sheet (${sheetId}) للنموذج ${responseId}. قد يكون هذا طبيعيًا أو خطأ في البيانات.`);
                 // لا يزال يعتبر نجاحًا من حيث الاتصال، ولكن مع تحذير
             }

            // تخزين البيانات في الذاكرة المؤقتة مع الطابع الزمني
            this.sheetsCache.set(responseId, {
                data: sheetsData,
                timestamp: Date.now(),
                sheetId: sheetId,
                sheetName: sheetName,
                credentialsPath: credentialsPath // حفظ المسار لإعادة التحميل لاحقًا إذا لزم الأمر
            });

            console.log(`تم تحميل وتخزين ${sheetsData.length} صف من بيانات Google Sheets لنموذج ${responseId}.`);
            return true;
        } catch (error) {
            console.error(`خطأ فادح في تحميل بيانات Google Sheets للنموذج (${responseId}):`, error);
            this.sheetsCache.delete(responseId); // إزالة البيانات غير المكتملة أو الفاشلة
            return false;
        }
    }

    /**
     * البحث عن بيانات المستخدم في بيانات Google Sheets المخزنة مؤقتًا.
     * @param {string} responseId - معرف نموذج الرد الذكي.
     * @param {string} phone - رقم هاتف المستخدم.
     * @param {string} name - اسم المستخدم (اختياري).
     * @returns {Object|null} بيانات المستخدم أو null إذا لم يتم العثور عليه.
     */
    findUserInSheetsData(responseId, phone, name = '') {
        try {
            const cached = this.sheetsCache.get(responseId);
             if (!cached || !cached.data) {
                 console.warn(`لا توجد بيانات Sheets مخزنة مؤقتًا للنموذج ${responseId} للبحث عن المستخدم.`);
                 // قد تحتاج إلى محاولة إعادة التحميل هنا إذا كان منطقيًا
                 // await this.loadSheetsData(responseId, cached.sheetId, cached.sheetName, cached.credentialsPath);
                 // cached = this.sheetsCache.get(responseId);
                 // if (!cached || !cached.data) return null;
                 return null;
             }

             const responseConfig = this.activeResponses.get(responseId)?.config;
             if (!responseConfig) {
                  console.warn(`لا توجد إعدادات نشطة للنموذج ${responseId} لتحديد عمود المعرف.`);
                 return null;
             }

            const sheetsData = cached.data;
            const {
                identifierColumn = 'رقم_الهاتف', // العمود الافتراضي للبحث بالرقم
                nameColumn = 'الاسم', // العمود الافتراضي للبحث بالاسم
                identifyByName = true, // السماح بالبحث بالاسم افتراضيًا
                matchExactPhone = false // هل يجب مطابقة الرقم بالكامل أم النهاية فقط؟
            } = responseConfig;

             // تنظيف رقم هاتف البحث
             const cleanSearchPhone = phone ? String(phone).replace(/\D/g, '') : '';

             // 1. البحث باستخدام رقم الهاتف
             if (cleanSearchPhone) {
                 const userDataByPhone = sheetsData.find(row => {
                     const rowPhoneValue = row[identifierColumn];
                     if (!rowPhoneValue) return false;
                     const cleanRowPhone = String(rowPhoneValue).replace(/\D/g, '');
                     if (!cleanRowPhone) return false;

                     if (matchExactPhone) {
                         return cleanRowPhone === cleanSearchPhone;
                     } else {
                         // المطابقة إذا كان رقم الصف ينتهي برقم البحث (للتعامل مع رموز الدول المختلفة)
                         return cleanRowPhone.endsWith(cleanSearchPhone);
                     }
                 });
                 if (userDataByPhone) {
                    // console.log(`تم العثور على المستخدم بالهاتف (${phone}) في النموذج ${responseId}`);
                     return userDataByPhone;
                 }
             }

             // 2. البحث باستخدام الاسم إذا لم يتم العثور عليه بالهاتف وكان مسموحًا ومتاحًا
             const searchName = name ? String(name).trim().toLowerCase() : '';
             if (identifyByName && searchName && !userDataByPhone) { // تأكد من البحث بالاسم فقط إذا فشل البحث بالهاتف
                 const userDataByName = sheetsData.find(row => {
                     const rowNameValue = row[nameColumn]; // استخدم العمود المحدد في الإعدادات
                     if (!rowNameValue) return false;
                     const cleanRowName = String(rowNameValue).trim().toLowerCase();
                     // مطابقة تامة أو جزئية (يمكن تعديلها حسب الحاجة)
                     return cleanRowName && (cleanRowName === searchName || cleanRowName.includes(searchName));
                 });
                 if (userDataByName) {
                     console.log(`تم العثور على المستخدم بالاسم (${name}) في النموذج ${responseId}`);
                     return userDataByName;
                 }
             }

             // إذا لم يتم العثور عليه بأي طريقة
            // console.log(`لم يتم العثور على المستخدم (الهاتف: ${phone}, الاسم: ${name}) في النموذج ${responseId}`);
             return null;

        } catch (error) {
            console.error(`خطأ في البحث عن بيانات المستخدم للنموذج (${responseId}):`, error);
            return null;
        }
    }


    // --- Gemini Integration ---

    /**
     * الحصول على مثيل Google Gemini API (أو إنشائه إذا لم يكن موجودًا).
     * @param {string} apiKey - مفتاح API لـ Google Gemini.
     * @returns {GoogleGenerativeAI}
     */
    getGeminiInstance(apiKey) {
        if (!apiKey) {
            throw new Error('مفتاح API لـ Google Gemini مطلوب');
        }
        // يمكن إضافة تخزين مؤقت للمثيلات هنا إذا لزم الأمر، ولكن قد لا يكون ضروريًا
        // if (!this.googleAIInstances[apiKey]) {
        //     this.googleAIInstances[apiKey] = new GoogleGenerativeAI(apiKey);
        // }
        // return this.googleAIInstances[apiKey];
         return new GoogleGenerativeAI(apiKey); // إنشاء جديد في كل مرة أبسط حاليًا
    }

    /**
     * إنشاء رد باستخدام Google Gemini.
     * @param {string} prompt - النص التوجيهي الرئيسي (رسالة المستخدم أو النص المعزز).
     * @param {string} systemPrompt - التعليمات العامة للنظام (الشخصية، السياق).
     * @param {string} apiKey - مفتاح API لـ Google Gemini.
     * @param {string} model - اسم نموذج Gemini (مثل 'gemini-pro').
     * @param {Array} history - سجل المحادثة السابق [ { role: 'user'/'model', content: '...' } ].
     * @param {Object} generationConfigOverrides - إعدادات توليد إضافية لتجاوز الافتراضيات.
     * @returns {Promise<string>} النص الناتج من Gemini.
     */
    async generateGeminiResponse(prompt, systemPrompt, apiKey, model = 'gemini-1.5-flash-latest', history = [], generationConfigOverrides = {}) {
        try {
            const genAI = this.getGeminiInstance(apiKey);
            const modelInstance = genAI.getGenerativeModel({
                 model: model,
                 systemInstruction: systemPrompt || "أنت مساعد ودود ومفيد." // توفير قيمة افتراضية قوية
                });

            // إعدادات التوليد الافتراضية (من الكود القديم) يمكن تعديلها
            const generationConfig = {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1000,
                ...generationConfigOverrides // دمج التجاوزات إذا وجدت
            };

            // إعدادات السلامة الافتراضية (من الكود القديم)
            const safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
            ];

            // تحويل سجل المحادثة إلى التنسيق المطلوب لواجهة برمجة تطبيقات Gemini
            const geminiHistory = history.map(msg => ({
                role: msg.role, // يجب أن يكون 'user' أو 'model'
                parts: [{ text: msg.content }]
            }));

            // بدء محادثة جديدة أو استخدام المحادثة الموجودة (إذا كان يدعمها النموذج/المكتبة بشكل مباشر)
             // الطريقة الحالية باستخدام startChat هي الأنسب لسياق المحادثة
             const chat = modelInstance.startChat({
                 history: geminiHistory,
                 generationConfig,
                 safetySettings
             });

            // إرسال الرسالة الحالية (prompt)
            const result = await chat.sendMessage(prompt);
            const response = result.response;

             // التحقق من وجود نص في الرد
             if (!response || typeof response.text !== 'function') {
                 console.error('استجابة Gemini غير متوقعة أو فارغة:', response);
                  // محاولة التحقق من سبب الحظر إذا كان متاحًا
                  if (response?.promptFeedback?.blockReason) {
                      console.error(`تم حظر الرد بسبب: ${response.promptFeedback.blockReason}`);
                      throw new Error(`تم حظر الرد بسبب: ${response.promptFeedback.blockReason}`);
                  }
                 throw new Error('استجابة Gemini غير متوقعة أو فارغة.');
             }

            const responseText = response.text();
           // console.log("Gemini Response:", responseText); // للتصحيح
            return responseText;

        } catch (error) {
            console.error(`خطأ في إنشاء رد باستخدام Google Gemini (Model: ${model}):`, error);
             // إضافة تفاصيل إضافية إذا كان خطأ API معروفًا
             if (error.message?.includes('API key not valid')) {
                 console.error('الخطأ يتعلق بمفتاح API. يرجى التحقق من صلاحيته.');
             } else if (error.message?.includes('quota')) {
                  console.error('تجاوزت حصة الاستخدام (Quota) لـ Google Gemini API.');
              }
            throw error; // إعادة رمي الخطأ ليتم التعامل معه في generateResponse
        }
    }

    // --- Response Generation Logic ---

    /**
     * توليد نص الاستفسار المعزز للنماذج المرتبطة بـ Google Sheets.
     * @param {Object} userData - بيانات المستخدم من Google Sheets.
     * @param {string} userMessage - رسالة المستخدم.
     * @param {Object} responseConfig - إعدادات نموذج الرد الذكي.
     * @returns {string} نص الاستفسار المعزز.
     */
    generateEnhancedPrompt(userData, userMessage, responseConfig) {
        // بناء النص بشكل أكثر تنظيمًا ووضوحًا لـ LLM
        let prompt = "## سياق المستخدم:\n";
        prompt += "البيانات التالية خاصة بالمستخدم الذي يطرح السؤال:\n";
        Object.entries(userData).forEach(([key, value]) => {
             // تجاهل القيم الفارغة أو المفاتيح غير المرغوب فيها إذا لزم الأمر
             if (value !== null && value !== undefined && String(value).trim() !== '') {
                prompt += `- ${key}: ${value}\n`;
             }
        });

         // إضافة تعليمات أو أمثلة من الإعدادات إذا كانت متوفرة
         if (responseConfig.sheetsQueryExamples) {
             prompt += `\n## أمثلة لكيفية استخدام البيانات (للمساعد فقط):\n${responseConfig.sheetsQueryExamples}\n`;
         }
        if (responseConfig.additionalContext) {
             prompt += `\n## سياق إضافي للمساعد:\n${responseConfig.additionalContext}\n`;
         }

        prompt += `\n## سؤال المستخدم:\n${userMessage}`;

        return prompt;
    }

    /**
     * إنشاء رد مباشر من بيانات Sheets بناءً على الكلمات المفتاحية (بدون LLM).
     * @param {Object} userData - بيانات المستخدم من Google Sheets.
     * @param {string} userMessage - رسالة المستخدم.
     * @param {Object} responseConfig - إعدادات نموذج الرد.
     * @returns {string} النص الناتج أو رسالة الخطأ.
     */
    generateSheetsQueryResponse(userData, userMessage, responseConfig) {
        try {
            // الحصول على الكلمات المفتاحية من الرسالة (بعد تنظيفها)
            const keywords = userMessage.toLowerCase().match(/\b(\w+)\b/g) || []; // استخراج الكلمات فقط

            if (keywords.length === 0) {
                return responseConfig.fallbackMessage || 'يرجى تحديد ما تبحث عنه بوضوح.';
            }

            // البحث عن الأعمدة التي تتطابق كلماتها المفتاحية مع كلمات في اسمها (أو اسم بديل)
             let matchedData = {};
             const userDataKeys = Object.keys(userData);

            keywords.forEach(keyword => {
                userDataKeys.forEach(columnKey => {
                     // البحث عن الكلمة المفتاحية في اسم العمود (مع تجاهل حالة الأحرف)
                    if (columnKey.toLowerCase().includes(keyword)) {
                        // التأكد من عدم إضافة نفس العمود مرتين
                        if (!matchedData[columnKey] && userData[columnKey] !== null && userData[columnKey] !== undefined && String(userData[columnKey]).trim() !== '') {
                             matchedData[columnKey] = userData[columnKey];
                        }
                    }
                });
            });

            if (Object.keys(matchedData).length === 0) {
                // إذا لم يتم العثور على تطابق مباشر للكلمات المفتاحية في أسماء الأعمدة،
                // يمكن محاولة البحث عن الأعمدة المحددة في الإعدادات إن وجدت
                if (responseConfig.defaultQueryColumns && Array.isArray(responseConfig.defaultQueryColumns)) {
                     responseConfig.defaultQueryColumns.forEach(colName => {
                         if (userData[colName] !== null && userData[colName] !== undefined && String(userData[colName]).trim() !== '') {
                              matchedData[colName] = userData[colName];
                          }
                     });
                 }

                 // إذا ظل فارغًا بعد التحقق من الأعمدة الافتراضية
                 if (Object.keys(matchedData).length === 0) {
                    return responseConfig.fallbackMessage || 'عذرًا، لم أتمكن من العثور على المعلومات المطلوبة بناءً على طلبك.';
                 }
            }

            // بناء الرد من البيانات المطابقة
            let responseText = "إليك المعلومات التي وجدتها:\n";
            Object.entries(matchedData).forEach(([key, value]) => {
                responseText += `- ${key}: ${value}\n`;
            });

            return responseText.trim();

        } catch (error) {
            console.error('خطأ في إنشاء رد استعلام Google Sheets المباشر:', error);
            return responseConfig.errorMessage || responseConfig.fallbackMessage || 'عذرًا، حدث خطأ أثناء معالجة استفسارك.';
        }
    }

    // --- Conversation History Management ---

    /**
     * تحديث سياق المحادثة للمستخدم مع نموذج معين.
     * @param {string} responseId - معرف نموذج الرد.
     * @param {string} userId - معرف المستخدم (مثل رقم الهاتف).
     * @param {string} userMessage - رسالة المستخدم.
     * @param {string} botResponse - رد النظام.
     * @param {number} maxHistoryLength - أقصى عدد لـ "أزواج" الرسائل (user+model) للحفظ.
     */
    updateConversationHistory(responseId, userId, userMessage, botResponse, maxHistoryLength = 5) {
        try {
             // استخدام معرف فريد للمحادثة يجمع بين النموذج والمستخدم
            const conversationId = `${responseId}_${userId}`;

            if (!this.conversationHistory.has(conversationId)) {
                this.conversationHistory.set(conversationId, []);
            }

            const history = this.conversationHistory.get(conversationId);

            // إضافة رسالة المستخدم
            history.push({
                role: 'user',
                content: userMessage,
                timestamp: Date.now()
            });

            // إضافة رد البوت
            history.push({
                role: 'model', // استخدام 'model' كما يتوقع Gemini API
                content: botResponse,
                timestamp: Date.now()
            });

            // الحفاظ على حجم السجل ضمن الحد الأقصى
            // maxHistoryLength يمثل عدد الأزواج (user+model), لذا الحد الأقصى للعناصر هو maxHistoryLength * 2
            while (history.length > maxHistoryLength * 2) {
                history.shift(); // إزالة أقدم عنصر (رسالة مستخدم)
                history.shift(); // إزالة ثاني أقدم عنصر (رد بوت)
            }

           // لا حاجة لـ .set مرة أخرى لأننا نعدل على نفس مرجع المصفوفة
           // this.conversationHistory.set(conversationId, history);

        } catch (error) {
            console.error(`خطأ في تحديث سياق المحادثة (${conversationId}):`, error);
        }
    }

    /**
     * الحصول على سياق المحادثة السابق لمستخدم ونموذج معين.
     * @param {string} responseId - معرف نموذج الرد.
     * @param {string} userId - معرف المستخدم.
     * @returns {Array} سجل المحادثة بالتنسيق المطلوب [ { role: 'user'/'model', content: '...' } ].
     */
    getConversationHistory(responseId, userId) {
        try {
            const conversationId = `${responseId}_${userId}`;
            // إرجاع نسخة من السجل لتجنب التعديل الخارجي العرضي
            return this.conversationHistory.has(conversationId) ? [...this.conversationHistory.get(conversationId)] : [];
        } catch (error) {
            console.error(`خطأ في الحصول على سياق المحادثة (${conversationId}):`, error);
            return [];
        }
    }

    // --- Stats and Utilities ---

    /**
     * تحديث إحصائيات نموذج الرد (عدد الردود، النجاح، الفشل).
     * @param {string} responseId - معرف نموذج الرد.
     * @param {boolean} isSuccess - هل كانت الاستجابة ناجحة؟.
     */
    async updateResponseStats(responseId, isSuccess) {
        try {
            const responseIndex = this.responses.findIndex(r => r.id === responseId);
            if (responseIndex === -1) {
                console.warn(`محاولة تحديث إحصائيات لنموذج غير موجود: ${responseId}`);
                return;
            }

             // التأكد من وجود كائن الإحصائيات
             if (!this.responses[responseIndex].stats) {
                 this.responses[responseIndex].stats = { repliesCount: 0, successCount: 0, failedCount: 0 };
             }
             const stats = this.responses[responseIndex].stats;

            // تحديث العدادات
            stats.repliesCount = (stats.repliesCount || 0) + 1;
            if (isSuccess) {
                stats.successCount = (stats.successCount || 0) + 1;
            } else {
                stats.failedCount = (stats.failedCount || 0) + 1;
            }

            // حفظ التغييرات في الملف (قد يكون من الأفضل تجميع الحفظ لتقليل عمليات الكتابة)
             // يمكن تأجيل الحفظ واستدعاء saveIntegrations بشكل دوري أو عند إيقاف التشغيل
            await this.saveIntegrations();

        } catch (error) {
            console.error(`خطأ في تحديث إحصائيات نموذج الرد (${responseId}):`, error);
        }
    }

    /**
     * التحقق من وجود كلمة مفعّلة (Trigger Word) في نص المستخدم.
     * @param {string} text - نص رسالة المستخدم.
     * @param {Array<string>} triggerWords - قائمة الكلمات المفعّلة من إعدادات النموذج.
     * @returns {boolean} هل تم العثور على كلمة مفعّلة؟.
     */
    hasTriggerWord(text, triggerWords) {
         // إذا لم تكن هناك كلمات مفعلة محددة، أو النص فارغ، فلا يوجد تطابق
        if (!triggerWords || triggerWords.length === 0 || !text) {
            return false;
        }

        const lowerText = text.toLowerCase().trim();
         // التأكد من أن triggerWords هي مصفوفة من السلاسل النصية
         if (!Array.isArray(triggerWords)) {
             console.warn("triggerWords ليست مصفوفة، سيتم تجاهلها.");
             return false;
         }

        return triggerWords.some(word =>
            word && typeof word === 'string' && lowerText.includes(word.toLowerCase().trim())
        );
    }

    // --- Main Processing Logic ---

    /**
     * معالجة رسالة واردة وإنشاء الرد المناسب بناءً على إعدادات النموذج.
     * @param {Object} params - معلمات المعالجة.
     * @param {string} params.responseId - معرف نموذج الرد المحدد.
     * @param {string} params.messageText - نص رسالة المستخدم.
     * @param {string} params.phone - رقم هاتف المستخدم (للتعريف والسجل).
     * @param {string} [params.name=''] - اسم المستخدم (اختياري، للبحث في Sheets).
     * @param {boolean} [params.isTestMode=false] - هل هو وضع اختبار (لإظهار الأخطاء بشكل أوضح).
     * @returns {Promise<string|null>} النص الناتج أو null إذا لم يتم إنشاء رد.
     */
    async generateResponse(params) {
        const { responseId, messageText, phone, name = '', isTestMode = false } = params;
        let responseConfig = null; // سيتم استخدام config الخاص بالنموذج النشط

        try {
            // 1. الحصول على إعدادات النموذج النشط
            const activeResponse = this.activeResponses.get(responseId);
            if (!activeResponse) {
                 // إذا لم يكن في الذاكرة النشطة (قد يكون تم إيقافه للتو أو لم يبدأ بعد)
                  if (!isTestMode) return null; // في الوضع العادي، تجاهل
                  else throw new Error(`النموذج ${responseId} غير نشط أو غير موجود في الذاكرة.`);
            }
            responseConfig = activeResponse.config; // الوصول إلى .config

             // 2. التحقق من الكلمات المفعّلة (إذا لم يكن ردًا تلقائيًا على الكل)
             if (!isTestMode && !responseConfig.autoReplyAll) {
                 const triggerWords = responseConfig.triggerWords || [];
                 if (!this.hasTriggerWord(messageText, triggerWords)) {
                    // console.log(`الرسالة لا تحتوي على كلمة مفعلة للنموذج ${responseId}.`);
                     return null; // لا يوجد رد مطلوب
                 }
             }

            // 3. تحديد هوية المستخدم (للسجل والبحث)
            const userId = phone || (isTestMode ? 'test_user' : 'unknown_user');

            // 4. الحصول على سجل المحادثة السابق (إذا كان مطلوبًا)
            const history = responseConfig.rememberHistory
                ? this.getConversationHistory(responseId, userId)
                : [];

            // 5. توليد الرد بناءً على نوع النموذج
            let responseText = '';

            switch (activeResponse.responseType) { // استخدام اسم الحقل الصحيح لنوع الرد
                case 'gemini_only': {
                    if (!responseConfig.geminiApiKey) throw new Error('geminiApiKey مطلوب لـ gemini_only');
                    responseText = await this.generateGeminiResponse(
                        messageText,
                        responseConfig.systemPrompt,
                        responseConfig.geminiApiKey,
                        responseConfig.model,
                        history,
                        responseConfig.generationConfig // تمرير إعدادات التوليد الإضافية
                    );
                    break;
                }

                case 'sheets_enhanced': {
                     if (!responseConfig.geminiApiKey) throw new Error('geminiApiKey مطلوب لـ sheets_enhanced');
                     if (!responseConfig.sheetsId) throw new Error('sheetsId مطلوب لـ sheets_enhanced');
                     if (!responseConfig.googleCredentialsPath) throw new Error('googleCredentialsPath مطلوب لـ sheets_enhanced');

                    // أ. البحث عن بيانات المستخدم في Sheets
                     const userData = this.findUserInSheetsData(responseId, phone, name);
                     if (!userData) {
                          responseText = responseConfig.userNotFoundMessage || responseConfig.fallbackMessage || 'عذرًا، لم أتمكن من العثور على بياناتك للرد على استفسارك.';
                          // لا يعتبر فشلًا بالضرورة، لكن لا يمكن المتابعة
                          await this.updateResponseStats(responseId, true); // اعتباره ردًا (وإن كان برسالة خطأ للمستخدم)
                          return responseText;
                      }

                     // ب. توليد النص المعزز لـ Gemini
                     const enhancedPrompt = this.generateEnhancedPrompt(userData, messageText, responseConfig);

                    // ج. استدعاء Gemini مع النص المعزز والسجل
                    responseText = await this.generateGeminiResponse(
                        enhancedPrompt,
                        responseConfig.systemPrompt,
                        responseConfig.geminiApiKey,
                        responseConfig.model,
                        history,
                        responseConfig.generationConfig
                    );
                    break;
                }

                case 'sheets_query': {
                    if (!responseConfig.sheetsId) throw new Error('sheetsId مطلوب لـ sheets_query');
                     if (!responseConfig.googleCredentialsPath) throw new Error('googleCredentialsPath مطلوب لـ sheets_query');

                     // أ. البحث عن بيانات المستخدم في Sheets
                     const userData = this.findUserInSheetsData(responseId, phone, name);
                     if (!userData) {
                          responseText = responseConfig.userNotFoundMessage || responseConfig.fallbackMessage || 'عذرًا، لم أتمكن من العثور على بياناتك للرد على استفسارك.';
                          await this.updateResponseStats(responseId, true); // اعتباره ردًا
                          return responseText;
                      }

                    // ب. توليد الرد المباشر من البيانات بناءً على الرسالة
                    responseText = this.generateSheetsQueryResponse(userData, messageText, responseConfig);
                    break;
                }

                default:
                    console.warn(`نوع نموذج الرد (${activeResponse.responseType}) غير مدعوم حاليًا للنموذج ${responseId}.`);
                    // يمكن رمي خطأ أو إرجاع رسالة افتراضية
                     if (isTestMode) throw new Error(`نوع نموذج الرد غير صالح: ${activeResponse.responseType}`);
                     return null; // لا ترد إذا كان النوع غير معروف في الوضع العادي
            }

            // 6. التحقق من أن الرد ليس فارغًا
             if (!responseText || !String(responseText).trim()) {
                 console.warn(`تم إنشاء رد فارغ للنموذج ${responseId}. قد يكون بسبب Gemini أو منطق sheets_query.`);
                  // لا تقم بتحديث السجل أو الإحصائيات إذا كان الرد فارغًا تمامًا
                 return null;
             }

            // 7. تحديث سجل المحادثة (إذا كان مطلوبًا والرد غير فارغ)
            if (responseConfig.rememberHistory) {
                this.updateConversationHistory(
                    responseId,
                    userId,
                    messageText,
                    responseText,
                    responseConfig.maxHistoryLength || 5
                );
            }

            // 8. تحديث الإحصائيات (إذا لم يكن وضع اختبار)
            if (!isTestMode) {
                await this.updateResponseStats(responseId, true); // تم إنشاء رد بنجاح
            }

            return responseText.trim(); // إرجاع الرد النهائي

        } catch (error) {
            console.error(`خطأ فادح أثناء معالجة الرد للنموذج ${responseId}:`, error);

            // تحديث الإحصائيات كفشل (إذا لم يكن وضع اختبار)
            if (!isTestMode) {
                await this.updateResponseStats(responseId, false);
            }

            // في وضع الاختبار، أعد رمي الخطأ لتسهيل التصحيح
            if (isTestMode) {
                throw error;
            }

            // في وضع الإنتاج، أرجع رسالة خطأ عامة للمستخدم
             const errorMsg = responseConfig?.errorMessage || 'عذرًا، واجهت مشكلة أثناء معالجة طلبك. يرجى المحاولة مرة أخرى لاحقًا.';
             return errorMsg;
        }
    }

     /**
      * معالجة رسالة WhatsApp واردة وتحديد النموذج المناسب للرد.
      * @param {Object} message - كائن رسالة WhatsApp (يجب أن يحتوي على body, from, to, isGroupMsg, notifyName, الخ).
      * @param {string} deviceId - معرف الجهاز الذي استلم الرسالة (لتحديد النماذج المرتبطة به).
      * @returns {Promise<string|null>} نص الرد أو null إذا لم يرد أي نموذج.
      */
     async processIncomingMessage(message, deviceId) {
         try {
             // 1. التحقق الأساسي من الرسالة والجهاز
             if (!message || !message.body || !message.from || !deviceId) {
                 console.warn('تجاهل رسالة واردة غير مكتملة أو بدون معرف جهاز.');
                 return null;
             }
             const messageText = message.body.trim();
             if (!messageText) {
                  console.warn('تجاهل رسالة واردة فارغة.');
                 return null;
             }

             // 2. تحديد معلومات المرسل والمجموعة
              const phone = message.from.split('@')[0];
              const name = message.notifyName || ''; // قد لا يكون متاحًا دائمًا
              const isGroup = message.isGroupMsg || message.from.includes('-'); // طريقة للتحقق من المجموعة

             // 3. تصفية النماذج النشطة المرتبطة بالجهاز وتناسب نوع المحادثة (فردي/مجموعة)
             const potentialResponses = Array.from(this.activeResponses.values()) // الحصول على قيم Map
                 .filter(response => {
                     const config = response.config;
                     // التحقق من الجهاز، ومن حالة المجموعة (إذا كانت رسالة مجموعة، يجب أن يسمح النموذج بالرد على المجموعات)
                     return response.deviceId === deviceId && (!isGroup || config.replyToGroups);
                 });

             if (potentialResponses.length === 0) {
                // console.log(`لا توجد نماذج رد ذكي نشطة للجهاز ${deviceId} تستجيب لهذا النوع من الرسائل.`);
                 return null;
             }

            // 4. محاولة إنشاء رد من كل نموذج مؤهل بالترتيب (يمكن إضافة أولوية لاحقًا)
             for (const response of potentialResponses) {
                 try {
                     const responseText = await this.generateResponse({
                         responseId: response.id,
                         messageText: messageText,
                         phone: phone,
                         name: name,
                         isTestMode: false // الوضع العادي لمعالجة الرسائل الواردة
                     });

                     // إذا تم إنشاء رد غير فارغ بواسطة هذا النموذج، قم بإرجاعه فورًا
                     if (responseText && responseText.trim()) {
                         console.log(`تم إنشاء رد بواسطة النموذج ${response.id} للرسالة من ${phone}.`);
                         return responseText.trim();
                     }
                     // إذا كان الرد null أو فارغًا (بسبب عدم تطابق الكلمات المفعلة مثلاً)، استمر للمحاولة مع النموذج التالي

                 } catch (responseError) {
                     // تسجيل الخطأ الخاص بهذا النموذج فقط، ولكن استمر في المحاولة مع النماذج الأخرى
                     console.error(`خطأ أثناء محاولة الرد باستخدام النموذج ${response.id} للرسالة من ${phone}:`, responseError);
                      // لا تقم بتحديث إحصائيات الفشل هنا، فهي تُحدث داخل generateResponse
                     // استمر في الحلقة...
                 }
             }

             // 5. إذا لم يقم أي نموذج بإنشاء رد
             console.log(`لم يقم أي نموذج نشط بإنشاء رد للرسالة من ${phone} على الجهاز ${deviceId}.`);
             return null;

         } catch (error) {
             console.error('خطأ عام فادح في معالجة الرسالة الواردة:', error);
             return null; // تجنب إيقاف الخدمة بسبب خطأ غير متوقع في المعالجة
         }
     }
}

// --- التصدير ---
// يمكنك اختيار تصدير الكلاس نفسه أو مثيل منه حسب طريقة استخدامك له في التطبيق الرئيسي
// الخيار 1: تصدير الكلاس (يتطلب إنشاء مثيل في مكان آخر)
// module.exports = AIResponseService;

// الخيار 2: تصدير مثيل جاهز (Singleton Pattern - يضمن وجود نسخة واحدة)
const aiResponseServiceInstance = new AIResponseService();
module.exports = aiResponseServiceInstance;

// --- (اختياري) بدء التهيئة الأولية ---
// يمكن استدعاء التهيئة هنا أو في ملف بدء التشغيل الرئيسي لتطبيقك
// aiResponseServiceInstance.initializeActiveResponses().catch(err => {
//     console.error("فشل التهيئة الأولية لنماذج الرد الذكي:", err);
// });