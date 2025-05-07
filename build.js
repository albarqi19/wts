/**
 * @file build.js
 * @description سكريبت لبناء تطبيق Electron وتعبئته للتوزيع
 */

const builder = require('electron-builder');
const { setupBuild, getPackageInfo } = require('./build-config');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// الحصول على معلومات الحزمة
const packageInfo = getPackageInfo();
console.log(`📦 بناء حزمة توزيع لـ ${packageInfo.name} v${packageInfo.version}`);

// التأكد من أن أيقونة التطبيق موجودة
const iconPath = path.join(__dirname, 'build', 'icon.ico');
if (!fs.existsSync(iconPath)) {
  console.warn('⚠️ لم يتم العثور على أيقونة التطبيق (icon.ico). سيتم استخدام أيقونة افتراضية.');
  // هنا يمكن نسخ أيقونة افتراضية إذا لزم الأمر
}

// التأكد من وجود ملف الترخيص
const licensePath = path.join(__dirname, 'LICENSE.txt');
if (!fs.existsSync(licensePath)) {
  console.warn('⚠️ لم يتم العثور على ملف الترخيص (LICENSE.txt). سيتم تخطي تضمينه.');
}

// التحقق من وجود ملف نصي لبرنامج التثبيت
const installerScriptPath = path.join(__dirname, 'installer.nsh');
if (!fs.existsSync(installerScriptPath)) {
  console.warn('⚠️ لم يتم العثور على ملف النص البرمجي للمثبت (installer.nsh). سيتم تخطي تضمينه.');
}

// تنظيف مجلد dist قبل البناء
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('🧹 تنظيف مجلد dist السابق...');
  fs.rmSync(distPath, { recursive: true, force: true });
}

// تشغيل أمر تثبيت المتطلبات إذا لزم الأمر
console.log('📥 التحقق من تثبيت جميع المتطلبات...');
const installDeps = spawn('npm', ['install'], { stdio: 'inherit' });

installDeps.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ فشل في تثبيت المتطلبات');
    process.exit(1);
  }

  console.log('✅ تم تثبيت جميع المتطلبات');
  console.log('🔨 بدء عملية البناء...');

  // الحصول على تكوين البناء
  const config = setupBuild();

  // بناء التطبيق
  builder.build({
    targets: builder.Platform.WINDOWS.createTarget(),
    config: config
  })
  .then((result) => {
    console.log('✅ تم بناء التطبيق بنجاح!');
    console.log(`📂 مسار الناتج: ${distPath}`);
    console.log('ملفات الناتج:');
    result.forEach((file) => {
      console.log(`- ${file}`);
    });
  })
  .catch((error) => {
    console.error('❌ فشل في بناء التطبيق:', error);
    process.exit(1);
  });
});