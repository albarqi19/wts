/**
 * @file build-config.js
 * @description تكوين إضافي لعملية بناء حزمة التوزيع
 */

const path = require('path');
const fs = require('fs');

// تأكد من وجود مجلد التطبيق
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

// الحصول على بيانات التوزيع من package.json
const getPackageInfo = () => {
  const packageJson = require('./package.json');
  return {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    author: packageJson.author
  };
};

// تحديد أيقونة التطبيق
const getIconPath = () => {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  
  // إنشاء أيقونة افتراضية إذا لم تكن موجودة
  if (!fs.existsSync(iconPath)) {
    console.warn('⚠️ لم يتم العثور على أيقونة التطبيق في مجلد build. سيتم استخدام الأيقونة الافتراضية.');
    // يمكن هنا نسخ أيقونة افتراضية إذا كانت متاحة
  }
  
  return iconPath;
};

// تكوينات البناء المخصصة
const buildConfig = {
  appId: 'com.whatsapp.server',
  productName: 'WhatsApp Server',
  copyright: `Copyright © ${new Date().getFullYear()}`,
  directories: {
    output: path.join(__dirname, 'dist'),
    buildResources: path.join(__dirname, 'build')
  },
  files: [
    '**/*',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*/{.editorconfig,.eslintrc.json,.gitattributes,.gitignore,.travis.yml}',
    '!{.git,.idea,.vscode,docs,temp,dist,.github}'
  ],
  extraResources: [
    {
      from: 'data',
      to: 'data',
      filter: ['**/*']
    }
  ],
  win: {
    target: 'nsis',
    icon: getIconPath()
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    installerIcon: getIconPath(),
    uninstallerIcon: getIconPath(),
    license: path.join(__dirname, 'LICENSE.txt'),
    installerHeaderIcon: getIconPath()
  }
};

// إعداد البناء
const setupBuild = () => {
  ensureDirectoryExists(buildConfig.directories.output);
  ensureDirectoryExists(buildConfig.directories.buildResources);
  
  // يمكن إضافة المزيد من الإعدادات هنا
  
  return buildConfig;
};

module.exports = { setupBuild, getPackageInfo };