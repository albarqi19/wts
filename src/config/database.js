/**
 * @file database.js
 * @description إعداد الاتصال بقاعدة البيانات MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');

// الاتصال بقاعدة البيانات MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.error('⚠️  رابط اتصال MongoDB غير محدد في ملف .env');
      return false;
    }
    
    const conn = await mongoose.connect(mongoURI);
    
    console.log(`✅ تم الاتصال بقاعدة البيانات MongoDB: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ خطأ في الاتصال بقاعدة البيانات: ${error.message}`);
    return false;
  }
};

module.exports = { connectDB };