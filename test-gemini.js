/**
 * سكريبت اختبار الرد الذكي مباشرة
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// مفتاح API
const API_KEY = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';

// دالة لإنشاء رد باستخدام Google Gemini
async function generateResponse(message) {
    try {
        console.log('جارٍ إنشاء رد باستخدام Google Gemini...');
        console.log(`الرسالة: "${message}"`);
        
        // إنشاء مثيل Google Gemini
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        
        // إعدادات توليد النص
        const generationConfig = {
            temperature: 0.7,
            maxOutputTokens: 800,
        };
        
        // إرسال الطلب إلى Google Gemini
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig,
        });
        
        // الحصول على الرد
        const response = result.response;
        const text = response.text();
        
        console.log('\n--- الرد ---');
        console.log(text);
        console.log('------------');
        
        return text;
    } catch (error) {
        console.error('خطأ في إنشاء الرد:', error);
        return 'حدث خطأ أثناء إنشاء الرد. يرجى المحاولة مرة أخرى.';
    }
}

// الحصول على الرسالة من سطر الأوامر
const message = process.argv[2] || 'مرحبا';

// تشغيل الاختبار
generateResponse(message)
    .catch(error => console.error('خطأ:', error));
