/**
 * سكريبت اختبار الرد الذكي مباشرة من Terminal
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// مفتاح API الافتراضي
const DEFAULT_API_KEY = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';

// قراءة ملف التكاملات
const INTEGRATIONS_FILE = path.join(__dirname, 'data', 'integrations.json');

// دالة لقراءة نماذج الرد الذكي
function loadAIResponses() {
    try {
        if (fs.existsSync(INTEGRATIONS_FILE)) {
            const integrations = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));
            return integrations.filter(integration => integration.type === 'ai-response' && integration.active);
        }
    } catch (error) {
        console.error('خطأ في قراءة ملف التكاملات:', error);
    }
    return [];
}

// دالة لإنشاء رد باستخدام Google Gemini
async function generateResponse(message, modelConfig) {
    try {
        console.log('جارٍ إنشاء رد باستخدام Google Gemini...');
        
        // التأكد من وجود مفتاح API
        const apiKey = modelConfig.apiKey || DEFAULT_API_KEY;
        const modelName = modelConfig.model || 'gemini-pro';
        
        console.log(`استخدام النموذج: ${modelName}`);
        console.log(`مفتاح API: ${apiKey.substring(0, 10)}...`);
        
        // إنشاء مثيل Google Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // إعدادات توليد النص
        const generationConfig = {
            temperature: modelConfig.temperature || 0.7,
            maxOutputTokens: modelConfig.maxOutputTokens || 800,
        };
        
        console.log('إرسال الطلب إلى Google Gemini...');
        
        // إرسال الطلب
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig,
        });
        
        // الحصول على الرد
        const response = result.response;
        const text = response.text();
        
        console.log('تم استلام الرد من Google Gemini');
        
        return text;
    } catch (error) {
        console.error('خطأ في إنشاء الرد:', error);
        return 'حدث خطأ أثناء إنشاء الرد. يرجى المحاولة مرة أخرى.';
    }
}

// دالة رئيسية لاختبار الرد الذكي
async function testAIResponse(message) {
    console.log(`الرسالة: "${message}"`);
    
    // تحميل نماذج الرد الذكي
    const aiResponses = loadAIResponses();
    console.log(`تم العثور على ${aiResponses.length} نموذج رد ذكي نشط`);
    
    if (aiResponses.length === 0) {
        console.log('لا توجد نماذج رد ذكي نشطة. يرجى التحقق من ملف التكاملات.');
        return;
    }
    
    // استخدام أول نموذج نشط
    const firstActiveResponse = aiResponses[0];
    console.log(`استخدام النموذج: ${firstActiveResponse.name} (${firstActiveResponse.id})`);
    
    // التحقق من المشغلات (إذا كانت موجودة)
    if (firstActiveResponse.triggers && firstActiveResponse.triggers.length > 0) {
        console.log(`التحقق من المشغلات. عدد المشغلات: ${firstActiveResponse.triggers.length}`);
        
        const messageText = message.toLowerCase();
        const matchesTrigger = firstActiveResponse.triggers.some(trigger => {
            const matches = messageText.includes(trigger.toLowerCase());
            console.log(`التحقق من المشغل: "${trigger}" - يتطابق: ${matches}`);
            return matches;
        });
        
        if (!matchesTrigger) {
            console.log('الرسالة لا تطابق أي مشغل. لن يتم معالجة الرسالة.');
            return;
        }
    }
    
    // إنشاء الرد
    const response = await generateResponse(message, firstActiveResponse.config);
    
    // عرض الرد
    console.log('\n--- الرد ---');
    console.log(response);
    console.log('------------');
}

// الحصول على الرسالة من سطر الأوامر
const message = process.argv[2] || 'مرحبا';

// تشغيل الاختبار
testAIResponse(message)
    .catch(error => console.error('خطأ:', error));
