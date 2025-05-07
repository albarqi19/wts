/**
 * @file deviceRoutes.js
 * @description مسارات API الخاصة بالأجهزة
 */

const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// حذف جميع الجلسات - ضعه في الأعلى قبل المسارات التي تستخدم :deviceId
router.post('/devices/delete-all-sessions', deviceController.deleteAllSessions);

// الحصول على كل الأجهزة
router.get('/devices', deviceController.getAllDevices);

// إضافة جهاز جديد
router.post('/devices', deviceController.addDevice);

// تحديث معلومات جهاز
router.put('/devices/:deviceId', deviceController.updateDevice);

// حذف جهاز
router.delete('/devices/:deviceId', deviceController.deleteDevice);

// توصيل جهاز
router.post('/devices/:deviceId/connect', deviceController.connectDevice);

// قطع اتصال جهاز
router.post('/devices/:deviceId/disconnect', deviceController.disconnectDevice);

// الحصول على رمز QR للجهاز
router.get('/devices/:deviceId/qr', deviceController.getDeviceQR);

// الحصول على محادثات الجهاز
router.get('/devices/:deviceId/chats', deviceController.getDeviceChats);

// الحصول على جهات اتصال الجهاز
router.get('/devices/:deviceId/contacts', deviceController.getDeviceContacts);

// تسجيل الخروج من كل الأجهزة
router.post('/devices/logout-all', deviceController.logoutAllDevices);

// الحصول على معلومات جهاز واحد
router.get('/devices/:deviceId', deviceController.getDeviceInfo);

// الحصول على جميع المحادثات (يمكن تحديد الجهاز بواسطة ?deviceId=xxx)
router.get('/chats', deviceController.getChats);

// الحصول على جهات الاتصال (يمكن تحديد الجهاز بواسطة ?deviceId=xxx)
router.get('/contacts', deviceController.getContacts);

// الحصول على معلومات محادثة محددة
router.get('/chat/:chatId', deviceController.getChatInfo);

module.exports = router;