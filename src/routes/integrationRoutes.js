/**
 * @file integrationRoutes.js
 * @description مسارات API الخاصة بالتكاملات
 */

const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');

// الحصول على كل التكاملات
router.get('/integrations', integrationController.getAllIntegrations);

// الحصول على تكامل محدد
router.get('/integrations/:integrationId', integrationController.getIntegration);

// إضافة تكامل جديد
router.post('/integrations', integrationController.addIntegration);

// تحديث تكامل
router.put('/integrations/:integrationId', integrationController.updateIntegration);

// حذف تكامل
router.delete('/integrations/:integrationId', integrationController.deleteIntegration);

// تشغيل/إيقاف تكامل
router.post('/integrations/:integrationId/toggle', integrationController.toggleIntegration);

// تشغيل تكامل يدويًا
router.post('/integrations/:integrationId/run', integrationController.runIntegration);

// استقبال البيانات من webhook خارجي (n8n)
router.post('/integrations/:integrationId/webhook', integrationController.receiveWebhookData);

// استقبال طلبات webhook من أي مصدر خارجي للتكامل، بدون تحديد معرف التكامل
router.post('/webhook/:token', integrationController.receiveExternalWebhook);

module.exports = router;