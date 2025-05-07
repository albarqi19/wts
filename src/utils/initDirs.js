/**
 * @file initDirs.js
 * @description تهيئة المجلدات والملفات اللازمة للتطبيق
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config/paths');

/**
 * تهيئة المجلدات والملفات الضرورية
 */
function initializeDirectoriesAndFiles() {
    console.log('تهيئة المجلدات والملفات...');
    
    // إنشاء المجلد الرئيسي للبيانات
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
        console.log(`تم إنشاء مجلد البيانات: ${CONFIG.DATA_DIR}`);
    }
    
    // إنشاء مجلد الأجهزة
    if (!fs.existsSync(CONFIG.DEVICES_DIR)) {
        fs.mkdirSync(CONFIG.DEVICES_DIR, { recursive: true });
        console.log(`تم إنشاء مجلد الأجهزة: ${CONFIG.DEVICES_DIR}`);
    }
    
    // إنشاء مجلد الرسائل المرسلة
    if (!fs.existsSync(CONFIG.SENT_MESSAGES_DIR)) {
        fs.mkdirSync(CONFIG.SENT_MESSAGES_DIR, { recursive: true });
        console.log(`تم إنشاء مجلد الرسائل المرسلة: ${CONFIG.SENT_MESSAGES_DIR}`);
    }
    
    // إنشاء/تهيئة ملف الأجهزة
    if (!fs.existsSync(CONFIG.DEVICES_FILE)) {
        fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify([], null, 2));
        console.log(`تم إنشاء ملف الأجهزة: ${CONFIG.DEVICES_FILE}`);
    }
    
    // إنشاء/تهيئة ملف جهات الاتصال
    if (!fs.existsSync(CONFIG.CONTACTS_FILE)) {
        fs.writeFileSync(CONFIG.CONTACTS_FILE, JSON.stringify([], null, 2));
        console.log(`تم إنشاء ملف جهات الاتصال: ${CONFIG.CONTACTS_FILE}`);
    }
    
    // إنشاء/تهيئة ملف المحادثات
    if (!fs.existsSync(CONFIG.CHATS_FILE)) {
        fs.writeFileSync(CONFIG.CHATS_FILE, JSON.stringify([], null, 2));
        console.log(`تم إنشاء ملف المحادثات: ${CONFIG.CHATS_FILE}`);
    }
    
    // إنشاء/تهيئة ملف التكاملات
    if (!fs.existsSync(CONFIG.INTEGRATIONS_FILE)) {
        fs.writeFileSync(CONFIG.INTEGRATIONS_FILE, JSON.stringify([], null, 2));
        console.log(`تم إنشاء ملف التكاملات: ${CONFIG.INTEGRATIONS_FILE}`);
    }
    
    console.log('تمت تهيئة المجلدات والملفات بنجاح');
}

module.exports = {
    initializeDirectoriesAndFiles
};