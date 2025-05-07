/**
 * @file gracefulShutdown.js
 * @description وظائف لإدارة إيقاف التشغيل السلس للتطبيق
 */

/**
 * إعداد معالجات لإيقاف التشغيل السلس
 * @param {http.Server} server كائن الخادم HTTP
 */
function setupGracefulShutdown(server) {
  // التعامل مع إشارات الإنهاء لإيقاف التشغيل بشكل سلس
  process.on('SIGTERM', () => {
    console.log('تم استلام إشارة SIGTERM، إيقاف التشغيل...');
    gracefulShutdown(server);
  });

  process.on('SIGINT', () => {
    console.log('تم استلام إشارة SIGINT، إيقاف التشغيل...');
    gracefulShutdown(server);
  });

  return server;
}

/**
 * تنفيذ عملية الإيقاف السلس
 * @param {http.Server} server كائن الخادم HTTP
 */
function gracefulShutdown(server) {
  server.close(() => {
    console.log('تم إغلاق الخادم.');
    // يمكن إضافة أي منطق تنظيف إضافي هنا قبل الخروج
    process.exit(0);
  });
}

module.exports = { setupGracefulShutdown };