/**
 * @file activationService.js
 * @description خدمة التحقق من رموز التفعيل وإدارة الأجهزة المصرح لها
 */

const { v4: uuidv4 } = require('uuid');
const ActivationCode = require('../models/ActivationCode');
const fs = require('fs');
const path = require('path');

// تحديد ما إذا كنا نعمل داخل بيئة Electron
const isElectron = process.env.RUNNING_IN_ELECTRON === 'true';

// تعريف كائن التخزين
let store;

// إذا كنا في بيئة Electron، استخدم electron-store
if (isElectron) {
  const ElectronStore = require('electron-store');
  store = new ElectronStore();
} else {
  // تنفيذ نسخة بسيطة من واجهة store للاستخدام خارج Electron
  const storePath = path.join(process.cwd(), 'data', 'local-store.json');
  
  // إنشاء مجلد البيانات إذا لم يكن موجوداً
  if (!fs.existsSync(path.dirname(storePath))) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
  }
  
  // تحميل البيانات من الملف إذا كان موجوداً
  let data = {};
  try {
    if (fs.existsSync(storePath)) {
      data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    }
  } catch (error) {
    console.error('خطأ في قراءة ملف التخزين المحلي:', error);
  }
  
  // إنشاء كائن تخزين بديل
  store = {
    get: (key) => data[key],
    set: (key, value) => {
      data[key] = value;
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
      return value;
    },
    delete: (key) => {
      delete data[key];
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    }
  };
}

// الحصول على معرف الجهاز أو إنشاء معرف جديد إذا لم يكن موجودًا
const getDeviceId = () => {
  let deviceId = store.get('deviceId');
  
  if (!deviceId) {
    deviceId = uuidv4();
    store.set('deviceId', deviceId);
  }
  
  return deviceId;
};

// التحقق من صحة رمز التفعيل
const verifyActivationCode = async (code) => {
  try {
    const deviceId = getDeviceId();
    
    // البحث عن الرمز في قاعدة البيانات
    const activationCode = await ActivationCode.findOne({ code });
    
    if (!activationCode) {
      return {
        success: false,
        message: 'رمز التفعيل غير صالح'
      };
    }
    
    // التحقق من صلاحية الرمز
    if (!activationCode.isValid()) {
      return {
        success: false,
        message: 'رمز التفعيل منتهي الصلاحية أو تم استخدامه مسبقًا'
      };
    }
    
    // إذا كان الرمز مستخدم بالفعل على جهاز آخر
    if (activationCode.deviceId && activationCode.deviceId !== deviceId) {
      return {
        success: false,
        message: 'هذا الرمز مستخدم بالفعل على جهاز آخر'
      };
    }
    
    // تحديث معلومات الرمز
    await activationCode.markAsUsed(null, deviceId);
    
    // تخزين حالة التفعيل في التخزين المحلي
    store.set('isActivated', true);
    store.set('activationCode', code);
    
    return {
      success: true,
      message: 'تم التحقق من الرمز بنجاح'
    };
  } catch (error) {
    console.error('خطأ في التحقق من رمز التفعيل:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء التحقق من الرمز'
    };
  }
};

// التحقق من تفعيل الجهاز
const isDeviceActivated = () => {
  return store.get('isActivated') === true;
};

// الحصول على معلومات الجهاز
const getDeviceInfo = () => {
  return {
    id: getDeviceId(),
    isActivated: isDeviceActivated(),
    activationCode: store.get('activationCode')
  };
};

// التحقق من صلاحية الجهاز عند بدء التشغيل
const validateDeviceOnStartup = async () => {
  if (!isDeviceActivated()) return false;
  
  const deviceId = getDeviceId();
  const code = store.get('activationCode');
  
  if (!code) return false;
  
  try {
    const activationCode = await ActivationCode.findOne({ code });
    if (!activationCode || activationCode.deviceId !== deviceId) {
      // إعادة تعيين حالة التفعيل إذا لم يعد الجهاز مصرح له
      store.set('isActivated', false);
      store.delete('activationCode');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('خطأ في التحقق من صلاحية الجهاز:', error);
    return false;
  }
};

module.exports = {
  getDeviceId,
  verifyActivationCode,
  isDeviceActivated,
  getDeviceInfo,
  validateDeviceOnStartup
};