/**
 * @file clean-project.js
 * @description سكريبت لتنظيف المشروع من بيانات الأجهزة والتكاملات للإصدار العام
 */

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

// مجلد البيانات
const dataDir = path.join(__dirname, '..', 'data');

// حذف الأجهزة
function deleteDevices() {
  console.log('🗑️ جاري حذف بيانات الأجهزة...');
  
  const devicesDir = path.join(dataDir, 'devices');
  
  // التحقق من وجود المجلد
  if (fs.existsSync(devicesDir)) {
    // حذف جميع الأجهزة
    const deviceDirs = fs.readdirSync(devicesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    let deletedCount = 0;
    
    deviceDirs.forEach(dir => {
      const deviceDirPath = path.join(devicesDir, dir);
      try {
        rimraf.sync(deviceDirPath);
        deletedCount++;
      } catch (err) {
        console.error(`❌ فشل في حذف مجلد الجهاز: ${dir}`, err);
      }
    });
    
    console.log(`✅ تم حذف ${deletedCount} من مجلدات الأجهزة`);
    
    // إنشاء ملف فارغ .gitkeep للحفاظ على المجلد في git
    fs.writeFileSync(path.join(devicesDir, '.gitkeep'), '');
  } else {
    console.log('⚠️ مجلد الأجهزة غير موجود');
  }
}

// حذف التكاملات
function deleteIntegrations() {
  console.log('🗑️ جاري حذف بيانات التكاملات...');
  
  const integrationsFile = path.join(dataDir, 'integrations.json');
  
  // تهيئة ملف التكاملات بقائمة فارغة
  if (fs.existsSync(integrationsFile)) {
    try {
      fs.writeFileSync(integrationsFile, JSON.stringify([], null, 2));
      console.log('✅ تم تفريغ ملف التكاملات');
    } catch (err) {
      console.error('❌ فشل في تفريغ ملف التكاملات', err);
    }
  } else {
    console.log('⚠️ ملف التكاملات غير موجود');
  }
}

// حذف الرسائل المرسلة
function deleteSentMessages() {
  console.log('🗑️ جاري حذف بيانات الرسائل المرسلة...');
  
  const messagesDir = path.join(dataDir, 'sent_messages');
  
  // التحقق من وجود المجلد
  if (fs.existsSync(messagesDir)) {
    // حذف جميع ملفات الرسائل
    const messageFiles = fs.readdirSync(messagesDir)
      .filter(file => file.endsWith('.json'));
    
    let deletedCount = 0;
    
    messageFiles.forEach(file => {
      try {
        fs.unlinkSync(path.join(messagesDir, file));
        deletedCount++;
      } catch (err) {
        console.error(`❌ فشل في حذف ملف الرسالة: ${file}`, err);
      }
    });
    
    console.log(`✅ تم حذف ${deletedCount} من ملفات الرسائل`);
    
    // إنشاء ملف فارغ .gitkeep للحفاظ على المجلد في git
    fs.writeFileSync(path.join(messagesDir, '.gitkeep'), '');
  } else {
    console.log('⚠️ مجلد الرسائل المرسلة غير موجود');
  }
}

// حذف الوسائط المؤقتة
function deleteTempMedia() {
  console.log('🗑️ جاري حذف الوسائط المؤقتة...');
  
  const mediaDir = path.join(dataDir, 'temp_media');
  
  // التحقق من وجود المجلد
  if (fs.existsSync(mediaDir)) {
    // حذف جميع ملفات الوسائط
    const mediaFiles = fs.readdirSync(mediaDir);
    
    let deletedCount = 0;
    
    mediaFiles.forEach(file => {
      if (file === '.gitkeep') return; // تجاهل ملف .gitkeep
      
      try {
        fs.unlinkSync(path.join(mediaDir, file));
        deletedCount++;
      } catch (err) {
        console.error(`❌ فشل في حذف ملف الوسائط: ${file}`, err);
      }
    });
    
    console.log(`✅ تم حذف ${deletedCount} من ملفات الوسائط`);
    
    // إنشاء ملف فارغ .gitkeep للحفاظ على المجلد في git
    fs.writeFileSync(path.join(mediaDir, '.gitkeep'), '');
  } else {
    console.log('⚠️ مجلد الوسائط المؤقتة غير موجود');
  }
}

// تفريغ ملفات جهات الاتصال والمحادثات
function resetJsonFiles() {
  console.log('🗑️ جاري إعادة تعيين ملفات JSON...');
  
  // جهات الاتصال
  const contactsFile = path.join(dataDir, 'contacts.json');
  if (fs.existsSync(contactsFile)) {
    try {
      fs.writeFileSync(contactsFile, JSON.stringify({}, null, 2));
      console.log('✅ تم تفريغ ملف جهات الاتصال');
    } catch (err) {
      console.error('❌ فشل في تفريغ ملف جهات الاتصال', err);
    }
  }
  
  // المحادثات
  const chatsFile = path.join(dataDir, 'chats.json');
  if (fs.existsSync(chatsFile)) {
    try {
      fs.writeFileSync(chatsFile, JSON.stringify({}, null, 2));
      console.log('✅ تم تفريغ ملف المحادثات');
    } catch (err) {
      console.error('❌ فشل في تفريغ ملف المحادثات', err);
    }
  }
}

// التحقق من وجود rimraf، وتثبيته إذا لم يكن موجوداً
function ensureRimraf() {
  try {
    require.resolve('rimraf');
    return Promise.resolve();
  } catch (err) {
    console.log('📦 جاري تثبيت حزمة rimraf...');
    
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec('npm install rimraf --no-save', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ فشل في تثبيت rimraf:', error);
          reject(error);
          return;
        }
        console.log('✅ تم تثبيت rimraf بنجاح');
        resolve();
      });
    });
  }
}

// تنفيذ جميع العمليات
async function cleanProject() {
  console.log('🧹 بدء تنظيف المشروع...');
  
  try {
    // التأكد من وجود rimraf
    await ensureRimraf();
    
    // حذف البيانات
    deleteDevices();
    deleteIntegrations();
    deleteSentMessages();
    deleteTempMedia();
    resetJsonFiles();
    
    console.log('✨ تم تنظيف المشروع بنجاح!');
  } catch (err) {
    console.error('❌ حدث خطأ أثناء تنظيف المشروع:', err);
  }
}

// تنفيذ العمليات
cleanProject();