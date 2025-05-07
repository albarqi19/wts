/**
 * @file test-activation.js
 * @description اختبار نظام التفعيل ورموز التفعيل
 */

require('dotenv').config();
const { connectDB } = require('../src/config/database');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// تعريف نموذج رمز التفعيل
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

// إضافة الدوال المساعدة
activationCodeSchema.methods.isValid = function() {
  return !this.isUsed && new Date() < this.expiresAt;
};

// تعريف النموذج
const ActivationCode = mongoose.model('ActivationCode', activationCodeSchema);

// وظيفة توليد رمز تفعيل عشوائي
function generateActivationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// وظيفة إنشاء رمز تفعيل جديد
async function createRandomActivationCode() {
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

// وظيفة محاكاة تفعيل رمز
async function simulateActivation(code, deviceId) {
  try {
    const activationCode = await ActivationCode.findOne({ code });
    
    if (!activationCode) {
      console.error(`❌ الرمز ${code} غير موجود`);
      return false;
    }
    
    if (!activationCode.isValid()) {
      console.error(`❌ الرمز ${code} غير صالح أو منتهي الصلاحية`);
      return false;
    }
    
    // التحقق من أن الرمز غير مستخدم على جهاز آخر
    if (activationCode.deviceId && activationCode.deviceId !== deviceId) {
      console.error(`❌ الرمز ${code} مستخدم بالفعل على جهاز آخر`);
      return false;
    }
    
    // تحديث معلومات الرمز
    activationCode.isUsed = true;
    activationCode.deviceId = deviceId;
    activationCode.usedAt = new Date();
    await activationCode.save();
    
    console.log(`✅ تم تفعيل الرمز ${code} للجهاز ${deviceId}`);
    return true;
  } catch (error) {
    console.error('❌ خطأ في تفعيل الرمز:', error);
    return false;
  }
}

// وظيفة رئيسية للاختبار
async function runTest() {
  try {
    console.log('🧪 بدء اختبار نظام التفعيل...');
    
    // الاتصال بقاعدة البيانات
    await connectDB();
    console.log('✅ تم الاتصال بقاعدة البيانات');
    
    // إنشاء رمز تفعيل جديد
    const code = await createRandomActivationCode();
    
    // محاكاة أجهزة متعددة
    const deviceId1 = uuidv4();
    const deviceId2 = uuidv4();
    
    console.log(`\n📱 جهاز 1: ${deviceId1}`);
    console.log(`📱 جهاز 2: ${deviceId2}`);
    
    // محاولة تفعيل الرمز على الجهاز الأول
    console.log(`\n🔄 محاولة تفعيل الرمز ${code} على الجهاز الأول...`);
    const result1 = await simulateActivation(code, deviceId1);
    
    // محاولة تفعيل نفس الرمز على جهاز آخر (يجب أن يفشل)
    console.log(`\n🔄 محاولة تفعيل نفس الرمز ${code} على الجهاز الثاني...`);
    const result2 = await simulateActivation(code, deviceId2);
    
    console.log('\n--- نتائج الاختبار ---');
    console.log(`تفعيل الجهاز الأول: ${result1 ? 'نجاح ✅' : 'فشل ❌'}`);
    console.log(`تفعيل الجهاز الثاني: ${result2 ? 'نجاح ✅' : 'فشل ❌ (متوقع)'}`);
    
    // التحقق من أن الاختبار نجح
    if (result1 && !result2) {
      console.log('\n✅ اجتاز الاختبار بنجاح: الرمز يعمل مرة واحدة فقط لجهاز واحد');
    } else {
      console.log('\n❌ فشل الاختبار: يجب أن يعمل الرمز مرة واحدة فقط لجهاز واحد');
    }
  } catch (error) {
    console.error('\n❌ حدث خطأ أثناء الاختبار:', error);
  } finally {
    // إغلاق الاتصال بقاعدة البيانات
    await mongoose.connection.close();
    console.log('\n👋 تم إغلاق الاتصال بقاعدة البيانات');
  }
}

// تشغيل الاختبار
runTest();