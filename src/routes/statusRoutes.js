/**
 * @file statusRoutes.js
 * @description مسارات API لحالة الخادم والإحصائيات
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { readdirSync } = require('fs');

// الحصول على حالة الخادم
router.get('/api/status', async (req, res) => {
    try {
        // التحقق مما إذا كان التطبيق في وضع العرض
        if (req.demoMode) {
            // إرجاع بيانات وهمية في وضع العرض
            return res.json({
                server: true,
                whatsapp: true,
                database: true,
                aiService: true
            });
        }

        // التحقق من حالة الأجهزة المتصلة
        let whatsappStatus = false;
        if (req.activeClients && Object.keys(req.activeClients).length > 0) {
            whatsappStatus = Object.values(req.activeClients).some(client => client && client.isReady);
        }
        
        // التحقق من حالة قاعدة البيانات
        const databaseStatus = mongoose.connection.readyState === 1; // 1 = متصل
        
        // التحقق من حالة خدمة الذكاء الاصطناعي (يمكن تعديلها حسب الاحتياجات الفعلية)
        let aiServiceStatus = false;
        try {
            // افحص ما إذا كانت خدمة الذكاء الاصطناعي مهيأة
            if (req.aiResponseService && req.aiResponseService.isInitialized) {
                aiServiceStatus = true;
            }
        } catch (e) {
            // في حالة حدوث خطأ، افترض أنها غير متصلة
            aiServiceStatus = false;
        }
        
        res.json({
            server: true,  // الخادم يعمل بما أن الطلب وصل إلى هنا
            whatsapp: whatsappStatus,
            database: databaseStatus,
            aiService: aiServiceStatus
        });
    } catch (error) {
        console.error('خطأ في الحصول على حالة الخادم:', error);
        res.status(500).json({ error: 'خطأ في الحصول على حالة الخادم' });
    }
});

// الحصول على إحصائيات لوحة المعلومات
router.get('/api/dashboard/stats', async (req, res) => {
    try {
        // التحقق مما إذا كان التطبيق في وضع العرض
        if (req.demoMode) {
            // إرجاع بيانات وهمية في وضع العرض
            return res.json({
                devices: 3,
                messages: 1250,
                contacts: 142,
                aiResponses: 283
            });
        }

        const dataDir = path.join(process.cwd(), 'data');
        
        // عدد الأجهزة المتصلة
        let connectedDevices = 0;
        try {
            const devicesDir = path.join(dataDir, 'devices');
            if (fs.existsSync(devicesDir)) {
                const deviceDirs = readdirSync(devicesDir, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                const sessionDirs = deviceDirs.filter(dir => dir.startsWith('session-'));
                connectedDevices = sessionDirs.length;
            }
        } catch (e) {
            console.error('خطأ في حساب الأجهزة المتصلة:', e);
        }
        
        // عدد الرسائل المرسلة
        let sentMessages = 0;
        try {
            const messagesDir = path.join(dataDir, 'sent_messages');
            if (fs.existsSync(messagesDir)) {
                const messageFiles = fs.readdirSync(messagesDir).filter(file => file.endsWith('.json'));
                sentMessages = messageFiles.length;
            }
        } catch (e) {
            console.error('خطأ في حساب الرسائل المرسلة:', e);
        }
        
        // عدد جهات الاتصال
        let contacts = 0;
        try {
            const contactsFile = path.join(dataDir, 'contacts.json');
            if (fs.existsSync(contactsFile)) {
                const contactsData = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
                contacts = Object.keys(contactsData).length;
            }
        } catch (e) {
            console.error('خطأ في حساب جهات الاتصال:', e);
        }
        
        // عدد الردود الآلية (هذا مجرد مثال، قد تحتاج إلى تعديله)
        let aiResponses = 0;
        try {
            // يمكنك تعديل هذا حسب كيفية تخزين الردود الآلية في تطبيقك
            const aiBotEnabled = req.aiResponseService && req.aiResponseService.isInitialized;
            if (aiBotEnabled) {
                // يمكن أن يتم استرجاع هذا العدد من قاعدة البيانات أو من ملف تكوين
                aiResponses = 0; // قيمة افتراضية
            }
        } catch (e) {
            console.error('خطأ في حساب الردود الآلية:', e);
        }
        
        res.json({
            devices: connectedDevices,
            messages: sentMessages,
            contacts: contacts,
            aiResponses: aiResponses
        });
    } catch (error) {
        console.error('خطأ في الحصول على إحصائيات لوحة المعلومات:', error);
        res.status(500).json({ error: 'خطأ في الحصول على إحصائيات لوحة المعلومات' });
    }
});

module.exports = router;