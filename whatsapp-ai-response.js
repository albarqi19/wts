/**
 * سكريبت محاكاة استلام رسالة والرد عليها في الواتساب
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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

// إنشاء عميل واتساب
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage'
        ]
    }
});

// معالج عند إنشاء رمز QR
client.on('qr', (qr) => {
    console.log('امسح رمز QR التالي باستخدام تطبيق واتساب على هاتفك:');
    qrcode.generate(qr, { small: true });
});

// معالج عند جهوزية العميل
client.on('ready', () => {
    console.log('تم تسجيل الدخول إلى واتساب بنجاح!');
    console.log('الآن يمكنك إرسال رسالة إلى هذا الرقم وسيتم الرد عليها تلقائيًا.');
});

// معالج عند استلام رسالة جديدة
client.on('message', async (message) => {
    if (message.fromMe) return; // تجاهل الرسائل المرسلة مننا
    
    console.log(`رسالة جديدة من: ${message.from}`);
    console.log(`محتوى الرسالة: "${message.body}"`);
    
    // تحميل نماذج الرد الذكي
    const aiResponses = loadAIResponses();
    console.log(`تم العثور على ${aiResponses.length} نموذج رد ذكي نشط`);
    
    if (aiResponses.length === 0) {
        console.log('لا توجد نماذج رد ذكي نشطة. لن يتم معالجة الرسالة.');
        return;
    }
    
    // استخدام أول نموذج نشط
    const firstActiveResponse = aiResponses[0];
    console.log(`استخدام النموذج: ${firstActiveResponse.name} (${firstActiveResponse.id})`);
    
    // التحقق من المشغلات (إذا كانت موجودة)
    if (firstActiveResponse.triggers && firstActiveResponse.triggers.length > 0) {
        console.log(`التحقق من المشغلات. عدد المشغلات: ${firstActiveResponse.triggers.length}`);
        
        const messageText = message.body.toLowerCase();
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
    
    try {
        // إنشاء الرد
        const response = await generateResponse(message.body, firstActiveResponse.config);
        
        // عرض الرد
        console.log('\n--- الرد ---');
        console.log(response);
        console.log('------------');
        
        // إرسال الرد
        await message.reply(response);
        console.log('تم إرسال الرد بنجاح!');
    } catch (error) {
        console.error('خطأ في معالجة الرسالة:', error);
    }
});

// بدء تشغيل العميل
console.log('جارٍ بدء تشغيل عميل واتساب...');
client.initialize();
