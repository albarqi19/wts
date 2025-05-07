/**
 * @file legacyRoutes.js
 * @description مسارات API القديمة للتوافقية الخلفية مع الواجهة الحالية
 */

const express = require('express');
const router = express.Router();
const { clients } = require('../services/whatsappClient');
const messageController = require('../controllers/messageController');
const deviceController = require('../controllers/deviceController');

/**
 * @route POST /send-message
 * @description إرسال رسالة عبر المسار القديم (للتوافقية الخلفية)
 */
router.post('/send-message', async (req, res) => {
  try {
    const { number, message } = req.body;

    // البحث عن أول جهاز متصل
    const activeClientId = Object.keys(clients).find(id =>
      clients[id] && clients[id].client &&
      (clients[id].status === 'authenticated' || clients[id].status === 'connected')
    );

    if (!activeClientId) {
      return res.json({ status: false, message: 'لا يوجد جهاز متصل' });
    }

    // تحويل المسار القديم إلى المسار الجديد في الخلفية
    req.body = { deviceId: activeClientId, to: number, message: message };

    // استدعاء المتحكم مباشرة
    await messageController.sendMessage(req, res);
  } catch (error) {
    console.error('خطأ في إرسال الرسالة عبر المسار القديم:', error);
    res.status(500).json({ status: false, message: 'حدث خطأ أثناء إرسال الرسالة' });
  }
});

/**
 * @route POST /logout
 * @description تسجيل الخروج من جميع الأجهزة عبر المسار القديم (للتوافقية الخلفية)
 */
router.post('/logout', async (req, res) => {
  try {
    await deviceController.logoutAllDevices(req, res);
  } catch (error) {
    console.error('خطأ في تسجيل الخروج عبر المسار القديم:', error);
    res.status(500).json({ status: false, message: 'حدث خطأ أثناء تسجيل الخروج' });
  }
});

module.exports = router;