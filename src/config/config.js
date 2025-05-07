/**
 * @file config.js
 * @description ملف الإعدادات الرئيسي للتطبيق
 */

const path = require('path');
const fs = require('fs');

// مسار مجلد البيانات الرئيسي
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// التأكد من وجود مجلد البيانات
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// الإعدادات العامة للتطبيق
const config = {
    // مسارات الملفات والمجلدات
    DATA_DIR: DATA_DIR,
    DEVICES_FILE: path.join(DATA_DIR, 'devices.json'),
    CHATS_FILE: path.join(DATA_DIR, 'chats.json'),
    CONTACTS_FILE: path.join(DATA_DIR, 'contacts.json'),
    INTEGRATIONS_FILE: path.join(DATA_DIR, 'integrations.json'),
    TEMP_MEDIA_DIR: path.join(DATA_DIR, 'temp_media'),
    SENT_MESSAGES_DIR: path.join(DATA_DIR, 'sent_messages'),

    // إعدادات الرد الذكي
    AI_RESPONSES_FILE: path.join(DATA_DIR, 'ai_responses.json'),

    // المدة الزمنية لانتهاء جلسة المستخدم (بالمللي ثانية)
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 ساعة

    // إعدادات API الافتراضية
    DEFAULT_API_PORT: 3000,
    
    // إعدادات قاعدة البيانات (إذا تم استخدامها)
    DATABASE: {
        USE_DATABASE: false,
        TYPE: 'sqlite', // أو mysql أو postgresql
        CONNECTION: {
            filename: path.join(DATA_DIR, 'database.sqlite') // لـ SQLite
            // host: 'localhost', // لـ MySQL أو PostgreSQL
            // user: 'user',
            // password: 'password',
            // database: 'whatsapp_server'
        }
    }
};

module.exports = config;