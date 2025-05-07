const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const { connectDB } = require('./src/config/database');
const { 
  verifyActivationCode, 
  getDeviceInfo, 
  validateDeviceOnStartup 
} = require('./src/services/activationService');

// تفعيل وضع العرض (لتجاوز التحقق من قاعدة البيانات)
const DEMO_MODE = true;

// حالة تطبيق إلكترون
let mainWindow;
let serverProcess;
let loginWindow;
let isAuthenticated = false;
let serverReady = false;
let updateAvailable = false;
let updateDownloaded = false;

// تكوين المحدث التلقائي
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// التحقق من التحديثات كل ساعة
const CHECK_UPDATE_INTERVAL = 60 * 60 * 1000; // ساعة واحدة

// التحقق من حالة الخادم
function checkServerStatus(retryCount = 0, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    if (retryCount >= maxRetries) {
      reject(new Error('تجاوز الحد الأقصى لعدد المحاولات'));
      return;
    }

    const options = {
      host: 'localhost',
      port: 3000,
      path: '/api/status',
      timeout: 1000
    };

    const req = http.get(options, (res) => {
      if (res.statusCode === 200) {
        serverReady = true;
        console.log('✅ تم التحقق من جاهزية الخادم');
        resolve(true);
      } else {
        console.log(`⏳ انتظار الخادم... المحاولة ${retryCount + 1}/${maxRetries}`);
        setTimeout(() => checkServerStatus(retryCount + 1, maxRetries).then(resolve).catch(reject), 500);
      }
    });

    req.on('error', (err) => {
      console.log(`⏳ انتظار الخادم... المحاولة ${retryCount + 1}/${maxRetries}`);
      setTimeout(() => checkServerStatus(retryCount + 1, maxRetries).then(resolve).catch(reject), 500);
    });

    req.on('timeout', () => {
      req.abort();
      console.log(`⏳ انتظار الخادم... المحاولة ${retryCount + 1}/${maxRetries}`);
      setTimeout(() => checkServerStatus(retryCount + 1, maxRetries).then(resolve).catch(reject), 500);
    });
  });
}

// إعداد وتهيئة Express server 
function startServer() {
  console.log('بدء تشغيل خادم Express...');
  
  // تعيين متغير البيئة ليخبر التطبيق أنه يعمل داخل Electron
  const env = Object.assign({}, process.env, { 
    RUNNING_IN_ELECTRON: 'true',
    DEMO_MODE: DEMO_MODE ? 'true' : 'false'
  });
  
  serverProcess = spawn('node', ['app.js'], {
    stdio: 'inherit',
    env: env
  });
  
  serverProcess.on('error', (error) => {
    console.error('خطأ في تشغيل الخادم:', error);
  });

  // انتظار حتى يكون الخادم جاهزاً
  return checkServerStatus().catch(err => {
    console.warn('⚠️ الخادم قد لا يكون جاهزًا بعد، محاولة المتابعة على أي حال...');
  });
}

// إنشاء نافذة تسجيل الدخول
function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    resizable: false,
    fullscreenable: false,
    title: 'تسجيل الدخول - خادم WhatsApp',
    icon: path.join(__dirname, 'public', 'favicon.ico')
  });

  // تحميل صفحة تسجيل الدخول
  loginWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'public', 'login.html'),
    protocol: 'file:',
    slashes: true
  }));

  loginWindow.on('closed', () => {
    loginWindow = null;
    if (!isAuthenticated) {
      app.quit();
    }
  });
}

// إنشاء النافذة الرئيسية بعد تسجيل الدخول
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'خادم WhatsApp',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    show: false, // إخفاء النافذة حتى يتم تحميل المحتوى
    backgroundColor: '#f0f0f0' // لتجنب الشاشة البيضاء
  });

  // URL الخادم المحلي
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: 'localhost:3000',
    protocol: 'http:',
    slashes: true
  });

  // تسجيل حدث عندما تصبح الصفحة جاهزة
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    console.log('✅ تم تحميل الصفحة بنجاح');
    
    // إذا تم تنزيل تحديث أثناء تحميل النافذة
    if (updateDownloaded) {
      showUpdateNotification();
    }
  });

  // تسجيل حدث عندما يفشل تحميل الصفحة
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`⚠️ فشل في تحميل الصفحة: ${errorDescription}`);
    
    // محاولة إعادة التحميل بعد تأخير قصير
    setTimeout(() => {
      console.log('🔄 محاولة إعادة تحميل الصفحة...');
      mainWindow.loadURL(startUrl);
    }, 1000);
  });

  mainWindow.loadURL(startUrl);

  // فتح أدوات المطور (DevTools) في بيئة التطوير
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// التحقق من تفعيل الجهاز وبدء التطبيق
async function initializeApp() {
  try {
    // في وضع العرض، تجاوز التحقق من قاعدة البيانات
    if (DEMO_MODE) {
      console.log('🚀 تشغيل البرنامج في وضع العرض (بدون قاعدة بيانات)');
      await startServer();
      
      // إضافة تأخير إضافي لضمان أن الخادم جاهز بالفعل
      console.log('⏳ انتظار جاهزية الخادم للتحميل الأولي...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      isAuthenticated = true;
      createMainWindow();
      return;
    }
    
    // الاتصال بقاعدة البيانات
    await connectDB();
    
    // بدء تشغيل الخادم
    await startServer();
    
    // التحقق من حالة تفعيل الجهاز
    const isValidDevice = await validateDeviceOnStartup();
    
    if (isValidDevice) {
      // إذا كان الجهاز مفعل بالفعل، افتح النافذة الرئيسية مباشرة
      isAuthenticated = true;
      createMainWindow();
    } else {
      // إذا لم يكن الجهاز مفعل، افتح نافذة تسجيل الدخول
      createLoginWindow();
    }
  } catch (error) {
    console.error('خطأ في تهيئة التطبيق:', error);
    // إذا فشل الاتصال بقاعدة البيانات، يمكن فتح نافذة الخطأ
    createLoginWindow(); // سيتم عرض رسالة خطأ في نافذة تسجيل الدخول
  }
}

// المحدث التلقائي - أحداث
autoUpdater.on('checking-for-update', () => {
  console.log('🔍 جاري التحقق من وجود تحديثات...');
});

autoUpdater.on('update-available', (info) => {
  console.log('🆕 تحديث متاح:', info.version);
  updateAvailable = true;
  
  // عرض إشعار بوجود تحديث (يمكن تعديله حسب الحاجة)
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('✅ أنت تستخدم أحدث إصدار من البرنامج');
});

autoUpdater.on('error', (err) => {
  console.error('❌ حدث خطأ في المحدث التلقائي:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  const logMessage = `⏬ سرعة التنزيل: ${Math.round(progressObj.bytesPerSecond / 1024)} كيلوبايت/ثانية - تم تنزيل ${progressObj.percent.toFixed(2)}%`;
  console.log(logMessage);
  
  // إرسال تقدم التنزيل إلى النافذة الرئيسية
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ تم تنزيل التحديث وسيتم تثبيته عند إعادة تشغيل التطبيق');
  updateDownloaded = true;
  
  // عرض إشعار بأن التحديث جاهز
  showUpdateNotification();
});

// عرض إشعار التحديث وطلب إعادة التشغيل
function showUpdateNotification() {
  if (!mainWindow) {
    return;
  }
  
  // عرض حوار التأكيد
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'تحديث متاح',
    message: 'تم تنزيل إصدار جديد من التطبيق',
    detail: 'هل تريد تثبيت التحديث الآن وإعادة تشغيل التطبيق؟',
    buttons: ['تثبيت وإعادة تشغيل', 'لاحقًا'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) {
      // تثبيت التحديث وإعادة تشغيل التطبيق
      autoUpdater.quitAndInstall(true, true);
    }
  });
}

// يدويًا - التحقق من التحديثات
function checkForUpdates() {
  autoUpdater.checkForUpdates()
    .catch(err => {
      console.error('خطأ أثناء التحقق من التحديثات:', err);
    });
}

// عند جاهزية التطبيق
app.on('ready', () => {
  // بدء التطبيق
  initializeApp();
  
  // التحقق من التحديثات عند بدء التشغيل
  if (!process.env.DEV_MODE) {
    // في بيئة الإنتاج فقط
    setTimeout(() => {
      console.log('البدء في التحقق من وجود تحديثات...');
      checkForUpdates();
    }, 5000); // تأخير لمدة 5 ثوانٍ للسماح ببدء التشغيل بسلاسة
    
    // التحقق بشكل دوري
    setInterval(checkForUpdates, CHECK_UPDATE_INTERVAL);
  }
});

// طلب الحصول على معلومات الإصدار الحالي
ipcMain.handle('get-version-info', () => {
  return {
    version: app.getVersion(),
    appName: app.getName()
  };
});

// التحقق من رمز التفعيل
ipcMain.handle('get-device-info', async () => {
  // في وضع العرض، إرجاع معلومات وهمية
  if (DEMO_MODE) {
    return {
      id: 'demo-device-id-12345',
      isActivated: true,
      activationCode: 'DEMO123'
    };
  }
  return getDeviceInfo();
});

ipcMain.on('verify-code', async (event, code) => {
  // في وضع العرض، اعتبر أي رمز صالح
  if (DEMO_MODE) {
    event.reply('verification-result', {
      success: true,
      message: 'رمز التفعيل صالح في وضع العرض'
    });
    isAuthenticated = true;
    return;
  }
  
  try {
    const result = await verifyActivationCode(code);
    event.reply('verification-result', result);
    
    if (result.success) {
      isAuthenticated = true;
    }
  } catch (error) {
    console.error('خطأ في التحقق من الرمز:', error);
    event.reply('verification-result', {
      success: false,
      message: 'حدث خطأ أثناء التحقق من الرمز'
    });
  }
});

// إشعار بنجاح تسجيل الدخول
ipcMain.on('login-success', () => {
  isAuthenticated = true;
  if (loginWindow) loginWindow.close();
  createMainWindow();
});

// طلب التحقق اليدوي من التحديثات
ipcMain.on('check-for-updates', () => {
  checkForUpdates();
  if (mainWindow) {
    mainWindow.webContents.send('checking-for-updates');
  }
});

// طلب تثبيت التحديث
ipcMain.on('install-update', () => {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(true, true);
  }
});

// التأكد من إغلاق التطبيق عند إغلاق جميع النوافذ
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// إغلاق عملية الخادم عند إغلاق التطبيق
app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});