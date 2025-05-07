const { contextBridge, ipcRenderer } = require('electron');

// تصدير واجهة برمجة التطبيقات (API) لنوافذ التقديم
contextBridge.exposeInMainWorld('electron', {
  // تسجيل الدخول
  login: (credentials) => {
    ipcRenderer.send('attempt-login', credentials);
  },
  
  // استماع لنتيجة تسجيل الدخول
  onLoginResult: (callback) => {
    ipcRenderer.on('login-result', (_, result) => callback(result));
  },
  
  // إرسال رمز التفعيل للتحقق
  verifyActivationCode: (code) => {
    ipcRenderer.send('verify-code', code);
  },
  
  // استماع لنتيجة التحقق من الرمز
  onVerificationResult: (callback) => {
    ipcRenderer.on('verification-result', (_, result) => callback(result));
  },
  
  // إشعار بنجاح تسجيل الدخول
  notifyLoginSuccess: () => {
    ipcRenderer.send('login-success');
  },
  
  // الحصول على معلومات الجهاز
  getDeviceInfo: () => {
    return ipcRenderer.invoke('get-device-info');
  },
  
  // التحديث التلقائي
  
  // طلب التحقق من وجود تحديثات
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  
  // تثبيت التحديث المتاح
  installUpdate: () => {
    ipcRenderer.send('install-update');
  },
  
  // استماع لوجود تحديث متاح
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  
  // استماع لتقدم تنزيل التحديث
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (_, progress) => callback(progress));
  },
  
  // استماع لاكتمال تنزيل التحديث
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },
  
  // استماع لبدء عملية التحقق من التحديثات
  onCheckingForUpdate: (callback) => {
    ipcRenderer.on('checking-for-updates', () => callback());
  },
  
  // الحصول على معلومات الإصدار الحالي
  getVersionInfo: () => {
    return ipcRenderer.invoke('get-version-info');
  }
});

// إضافة استماع لأحداث DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  // يمكن إضافة شيفرة تنفذ عند تحميل النافذة هنا
});