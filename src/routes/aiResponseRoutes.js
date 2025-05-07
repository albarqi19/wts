/**
 * @file aiResponseRoutes.js
 * @description مسارات API لنظام الرد الذكي بواسطة Google Gemini مع دعم Google Sheets
 */

const express = require('express');
const router = express.Router();
const aiResponseController = require('../controllers/aiResponseController');

// الحصول على جميع نماذج الرد الذكي
router.get('/responses', aiResponseController.getAllAIResponses);

// الحصول على نموذج رد ذكي محدد
router.get('/responses/:responseId', aiResponseController.getAIResponse);

// إضافة نموذج رد ذكي جديد
router.post('/responses', aiResponseController.addAIResponse);

// تحديث نموذج رد ذكي
router.put('/responses/:responseId', aiResponseController.updateAIResponse);

// حذف نموذج رد ذكي
router.delete('/responses/:responseId', aiResponseController.deleteAIResponse);

// تفعيل/إيقاف نموذج رد ذكي
router.post('/responses/:responseId/toggle', aiResponseController.toggleAIResponse);

// اختبار نموذج رد ذكي
router.post('/responses/:responseId/test', aiResponseController.testAIResponse);

module.exports = router;