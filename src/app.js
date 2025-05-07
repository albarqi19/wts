/**
 * @file app.js
 * @description نقطة الدخول الرئيسية لتطبيق خادم WhatsApp
 */

require('dotenv').config();
const path = require('path');
const { initializeDirectoriesAndFiles } = require('./utils/initDirs');
const { scheduleIntegrations } = require('./integrations');
const { initializeActiveClients } = require('./services/whatsappClient');
const { setupGracefulShutdown } = require('./utils/gracefulShutdown');
const deviceRoutes = require('./routes/deviceRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const aiResponseRoutes = require('./routes/aiResponseRoutes'); // إضافة مسارات الرد الذكي
const statusRoutes = require('./routes/statusRoutes'); // إضافة مسارات الحالة والإحصائيات
const legacyRoutes = require('./routes/legacyRoutes');
const configureServer = require('./config/server');
const configureSocket = require('./config/socket');
const { handleNotFound, handleServerError } = require('./middleware/errorHandler');
const deviceController = require('./controllers/deviceController');
const { aiResponseService } = require('./services/aiResponseService');
const { connectDB } = require('./config/database'); // استيراد اتصال قاعدة البيانات
const express = require('express');

// تحديد ما إذا كان التطبيق يعمل في وضع العرض
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// تحديد ما إذا كان التطبيق يعمل في بيئة Electron
const isElectron = process.env.RUNNING_IN_ELECTRON === 'true';

// محاولة الاتصال بقاعدة البيانات MongoDB
const initMongoDB = async () => {
  // تجاوز الاتصال بقاعدة البيانات في وضع العرض
  if (DEMO_MODE) {
    console.log('🚀 تشغيل الخادم في وضع العرض - تم تجاوز الاتصال بقاعدة البيانات');
    return true;
  }
  
  try {
    await connectDB();
    console.log('✅ تم الاتصال بقاعدة بيانات MongoDB');
    return true;
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات MongoDB:', error.message);
    return false;
  }
};

// تهيئة الدلائل والملفات اللازمة
initializeDirectoriesAndFiles();

// إنشاء وتكوين الخادم و Socket.IO
let io; // سيتم تعيينه بواسطة configureSocket
const { app, server } = configureServer(io); // مرر io هنا، سيتم استخدامه داخل configureServer
io = configureSocket(server); // قم بتكوين Socket.IO وربطه بالخادم

// إضافة المسار للملفات الثابتة إذا كان التطبيق يعمل في بيئة Electron
if (isElectron) {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  console.log(`📁 تم تعيين مجلد الملفات الثابتة: ${publicPath}`);
}

// إعادة تعيين io في الطلبات بعد تهيئته بشكل صحيح
app.use((req, res, next) => {
    req.io = io;
    req.aiResponseService = aiResponseService; // إضافة خدمة الرد الذكي إلى الطلب
    req.demoMode = DEMO_MODE; // إضافة متغير وضع العرض للاستخدام في مسارات API
    next();
});

// تهيئة عملاء واتساب النشطة
initializeActiveClients(io);

// إضافة مسار مباشر لحذف جميع الجلسات
app.post('/api/devices/delete-all-sessions', deviceController.deleteAllSessions);

// تسجيل مسارات API
app.use('/', statusRoutes); // تسجيل مسارات الحالة والإحصائيات
app.use('/api', deviceRoutes);
app.use('/api', integrationRoutes);
app.use('/api', messageRoutes);
app.use('/api', aiResponseRoutes);

// تسجيل مسارات API القديمة للتوافقية الخلفية
app.use('/', legacyRoutes);

// معالجة أي مسار غير موجود
app.use(handleNotFound);

// معالجة الأخطاء
app.use(handleServerError);

// جدولة التكاملات النشطة (تجاوز في وضع العرض)
if (!DEMO_MODE) {
  scheduleIntegrations();
}

// محاولة الاتصال بقاعدة البيانات MongoDB
initMongoDB();

// تحديد منفذ الاستماع
const PORT = process.env.PORT || 3000;

// بدء الاستماع على المنفذ المحدد
server.listen(PORT, () => {
    console.log(`✅ تم بدء الخادم على المنفذ ${PORT}`);
    console.log(`🌐 يمكنك الوصول إلى الواجهة من خلال: http://localhost:${PORT}`);
    
    // إضافة رسالة خاصة إذا كان التطبيق يعمل في بيئة Electron
    if (isElectron) {
      console.log('🖥️ التطبيق يعمل كتطبيق سطح مكتب باستخدام Electron');
    }
    
    // إضافة رسالة لوضع العرض
    if (DEMO_MODE) {
      console.log('🎭 التطبيق يعمل في وضع العرض - بعض الوظائف قد لا تعمل');
    }
});

// إعداد إيقاف التشغيل السلس
setupGracefulShutdown(server);

// تصدير التطبيق والخادم للاستخدام في أجزاء أخرى من البرنامج
module.exports = { app, server };