/**
 * @file activation-manager.js
 * @description أداة لإدارة رموز التفعيل في قاعدة بيانات MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const readline = require('readline');
const { connectDB } = require('../src/config/database');

// إنشاء واجهة سطر الأوامر التفاعلية
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// تعريف نموذج رمز التفعيل مباشرة هنا لتجنب مشاكل الاستيراد
const activationCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    length: 6
  },
  deviceId: {
    type: String,
    default: null
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// إنشاء النموذج
const ActivationCode = mongoose.model('ActivationCode', activationCodeSchema);

// توليد رمز تفعيل عشوائي من 6 أرقام
function generateActivationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// إنشاء رمز تفعيل جديد
async function createActivationCode() {
  const code = generateActivationCode();
  
  // تعيين تاريخ انتهاء الصلاحية (سنة من الآن)
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  
  const activationCode = new ActivationCode({
    code,
    expiresAt
  });
  
  await activationCode.save();
  console.log(`✅ تم إنشاء رمز تفعيل جديد: ${code}`);
  console.log(`تاريخ انتهاء الصلاحية: ${expiresAt.toLocaleDateString()}`);
  return code;
}

// عرض جميع رموز التفعيل
async function listActivationCodes() {
  const codes = await ActivationCode.find().sort({ createdAt: -1 });
  
  if (codes.length === 0) {
    console.log('❌ لا توجد رموز تفعيل في قاعدة البيانات');
    return;
  }
  
  console.log('\n=== رموز التفعيل ===');
  console.log('-'.repeat(60));
  console.log('الرمز\t\tمستخدم\t\tالجهاز\t\tتاريخ الإنشاء\t\tتاريخ الانتهاء');
  console.log('-'.repeat(60));
  
  codes.forEach(code => {
    console.log(`${code.code}\t${code.isUsed ? '✅' : '❌'}\t${code.deviceId ? code.deviceId.substring(0, 8) + '...' : 'لا يوجد'}\t${code.createdAt.toLocaleDateString()}\t${code.expiresAt.toLocaleDateString()}`);
  });
}

// إلغاء تفعيل رمز معين
async function deactivateCode(code) {
  const activationCode = await ActivationCode.findOne({ code });
  
  if (!activationCode) {
    console.log(`❌ الرمز ${code} غير موجود`);
    return;
  }
  
  activationCode.isUsed = false;
  activationCode.deviceId = null;
  activationCode.usedBy = null;
  activationCode.usedAt = null;
  
  await activationCode.save();
  console.log(`✅ تم إلغاء تفعيل الرمز ${code} بنجاح`);
}

// حذف رمز معين
async function deleteCode(code) {
  const result = await ActivationCode.deleteOne({ code });
  
  if (result.deletedCount === 0) {
    console.log(`❌ الرمز ${code} غير موجود`);
    return;
  }
  
  console.log(`✅ تم حذف الرمز ${code} بنجاح`);
}

// عرض القائمة الرئيسية
function showMainMenu() {
  console.log('\n=== مدير رموز التفعيل ===');
  console.log('1. إنشاء رمز تفعيل جديد');
  console.log('2. عرض جميع رموز التفعيل');
  console.log('3. إلغاء تفعيل رمز');
  console.log('4. حذف رمز');
  console.log('0. خروج');
  console.log('-'.repeat(25));
  
  rl.question('اختر رقم العملية: ', async (choice) => {
    switch (choice) {
      case '1':
        await createActivationCode();
        showMainMenu();
        break;
      case '2':
        await listActivationCodes();
        showMainMenu();
        break;
      case '3':
        rl.question('أدخل الرمز المراد إلغاء تفعيله: ', async (code) => {
          await deactivateCode(code);
          showMainMenu();
        });
        break;
      case '4':
        rl.question('أدخل الرمز المراد حذفه: ', async (code) => {
          await deleteCode(code);
          showMainMenu();
        });
        break;
      case '0':
        console.log('جاري الخروج...');
        rl.close();
        mongoose.connection.close();
        break;
      default:
        console.log('❌ اختيار غير صالح');
        showMainMenu();
        break;
    }
  });
}

// البدء
async function start() {
  console.log('جاري الاتصال بقاعدة البيانات...');
  const isConnected = await connectDB();
  
  if (!isConnected) {
    console.error('❌ فشل الاتصال بقاعدة البيانات');
    process.exit(1);
  }
  
  showMainMenu();
}

// تشغيل البرنامج
start();