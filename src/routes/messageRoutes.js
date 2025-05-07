/**
 * @file messageRoutes.js
 * @description مسارات API الخاصة بالرسائل
 */

const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// تحميل وسائط (صور، ملفات)
router.post('/upload', messageController.uploadMedia);

// إرسال رسالة واحدة
router.post('/messages/send', messageController.sendMessage);

// إرسال رسائل متعددة (جماعية)
router.post('/messages/bulk', messageController.sendBulkMessages);

// الحصول على حالة مهمة الإرسال الجماعي
router.get('/messages/bulk/:bulkJobId/status', messageController.getBulkJobStatus);

// الحصول على رسائل مهمة إرسال جماعي محددة
router.get('/messages/bulk/:bulkJobId/messages', messageController.getBulkJobMessages);

// الحصول على الرسائل المرسلة
router.get('/messages/sent', messageController.getSentMessages);

// الحصول على رسائل محادثة
router.get('/messages/:deviceId/chat/:chatId', messageController.getChatMessages);
router.get('/messages/:deviceId/chat/:chatId/:limit', messageController.getChatMessages);

// الحصول على رسائل محادثة بمعرف المحادثة فقط (باستخدام query parameter للجهاز)
router.get('/chat/:chatId/messages', messageController.getChatMessagesByChatId);

// الحصول على آخر الرسائل من جهاز
router.get('/messages/:deviceId/latest', messageController.getLatestMessages);

module.exports = router;