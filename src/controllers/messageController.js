/**
 * @file messageController.js
 * @description متحكم للتعامل مع عمليات الرسائل
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config/paths');
const { clients } = require('../services/whatsappClient');
const multer = require('multer');
// إضافة استيراد MessageMedia من مكتبة whatsapp-web.js
const { MessageMedia } = require('whatsapp-web.js');

// تخزين مهام الإرسال الجماعي
const bulkJobs = {};

// إنشاء مجلد للوسائط المؤقتة إذا لم يكن موجودًا
const TEMP_MEDIA_DIR = path.join(__dirname, '../../data/temp_media');
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// تكوين مكتبة multer لتحميل الملفات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, TEMP_MEDIA_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // حد 10 ميجابايت للملفات
    fileFilter: function (req, file, cb) {
        // السماح بالصور فقط
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('يسمح فقط بتحميل ملفات الصور!'), false);
        }
        cb(null, true);
    }
}).single('file');

/**
 * تحميل ملف صورة للإرسال
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function uploadMedia(req, res) {
    upload(req, res, function (err) {
        if (err) {
            console.error('خطأ في تحميل الملف:', err);
            return res.status(400).json({
                status: false,
                message: err.message
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                status: false,
                message: 'لم يتم تقديم أي ملف للتحميل'
            });
        }

        const filePath = req.file.path;
        
        // إرجاع معلومات الملف المُحمل
        res.json({
            status: true,
            message: 'تم تحميل الملف بنجاح',
            data: {
                filePath: filePath,
                fileName: req.file.filename,
                fileSize: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    });
}

/**
 * إرسال رسالة واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function sendMessage(req, res) {
    try {
        const { deviceId, phoneNumber, message, options, chatId } = req.body;

        if (!deviceId || (!phoneNumber && !chatId) || !message) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز ورقم الهاتف (أو معرف المحادثة) والرسالة مطلوبة'
            });
        }

        // التحقق من اتصال العميل
        const client = clients[deviceId];
        if (!client || !client.client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل'
            });
        }

        // تعديل للتحقق من كلا الحالتين: authenticated و connected
        if (client.status !== 'authenticated' && client.status !== 'connected') {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير مصادق عليه أو غير متصل'
            });
        }

        // تحديد المستلم (إما chatId مباشرة أو تنسيق رقم الهاتف)
        let recipient;
        
        if (chatId) {
            // إذا تم تمرير معرف المحادثة، استخدمه مباشرة
            recipient = chatId;
        } else {
            // معالجة رقم الهاتف بطريقة تتوافق مع متطلبات واتساب
            recipient = phoneNumber.toString().trim();
            
            // إزالة أي رموز خاصة أو مسافات
            recipient = recipient.replace(/[\s+\-()]/g, '');
            
            // إذا بدأ الرقم بالرمز +، قم بإزالته
            if (recipient.startsWith('+')) {
                recipient = recipient.substring(1);
            }
            
            // التأكد من أن الرقم لا يبدأ بأصفار متعددة - أصفار متعددة تسبب خطأ wid
            while (recipient.startsWith('00')) {
                recipient = recipient.substring(1);
            }
            
            // إضافة @c.us إذا لم يكن موجودًا بالفعل
            if (!recipient.includes('@')) {
                recipient = `${recipient}@c.us`;
            }
        }

        console.log(`محاولة إرسال رسالة إلى: ${recipient}`);

        // إرسال الرسالة
        let sentMessage;
        if (options && options.mediaUrl) {
            // تعديل: إرسال رسالة وسائط باستخدام كائن MessageMedia بدلاً من URL مباشر
            let media;

            // التحقق من كون الوسائط URL عادي أو مسار ملف محلي
            if (options.mediaUrl.startsWith('http')) {
                // إذا كان URL عادي، استخدم fromUrl
                media = await MessageMedia.fromUrl(options.mediaUrl);
            } else {
                // إذا كان مسار ملف محلي، استخدم fromFilePath
                try {
                    // قد يكون المسار مباشراً أو بتنسيق file://
                    const cleanPath = options.mediaUrl.replace('file:///', '');
                    media = MessageMedia.fromFilePath(cleanPath);
                } catch (fileError) {
                    console.error('خطأ في قراءة ملف الوسائط:', fileError);
                    
                    // محاولة أخرى بقراءة الملف يدويًا
                    try {
                        const filePath = options.mediaUrl.replace('file:///', '');
                        const mimeType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 
                                        path.extname(filePath).toLowerCase() === '.jpg' || 
                                        path.extname(filePath).toLowerCase() === '.jpeg' ? 'image/jpeg' : 
                                        'application/octet-stream';
                        
                        const data = fs.readFileSync(filePath);
                        const base64Data = Buffer.from(data).toString('base64');
                        
                        media = new MessageMedia(mimeType, base64Data, path.basename(filePath));
                    } catch (manualError) {
                        throw new Error(`فشل قراءة ملف الوسائط: ${manualError.message}`);
                    }
                }
            }
            
            // إرسال رسالة الوسائط
            sentMessage = await client.client.sendMessage(recipient, media, {
                caption: message
            });
        } else {
            // إرسال رسالة نصية
            sentMessage = await client.client.sendMessage(recipient, message);
        }

        // تسجيل الرسالة المرسلة
        const messageLog = {
            id: uuidv4(),
            deviceId,
            timestamp: new Date().toISOString(),
            to: recipient,
            message: message,
            mediaUrl: options?.mediaUrl || null,
            status: 'sent',
            messageId: sentMessage.id ? sentMessage.id.id : null
        };

        // إنشاء مجلد الرسائل المرسلة إذا لم يكن موجودًا
        if (!fs.existsSync(CONFIG.SENT_MESSAGES_DIR)) {
            fs.mkdirSync(CONFIG.SENT_MESSAGES_DIR, { recursive: true });
        }

        // حفظ الرسالة في ملف منفصل
        const messageFilePath = path.join(CONFIG.SENT_MESSAGES_DIR, `${messageLog.id}.json`);
        fs.writeFileSync(messageFilePath, JSON.stringify(messageLog, null, 2));

        res.json({
            status: true,
            message: 'تم إرسال الرسالة بنجاح',
            data: messageLog
        });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            status: false,
            message: `حدث خطأ أثناء إرسال الرسالة: ${error.message}`
        });
    }
}

/**
 * إرسال رسائل متعددة لعدة أرقام مع دعم التخصيص
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function sendBulkMessages(req, res) {
    try {
        const { 
            deviceId,
            recipients,
            messageTemplate,
            options,
            delayBetweenMessages
        } = req.body;

        if (!deviceId || !recipients || !messageTemplate || !recipients.length) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز وقائمة المستلمين وقالب الرسالة مطلوبة'
            });
        }

        // التحقق من اتصال العميل
        const client = clients[deviceId];
        if (!client || !client.client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل'
            });
        }

        // تعديل للتحقق من كلا الحالتين: authenticated و connected
        if (client.status !== 'authenticated' && client.status !== 'connected') {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير مصادق عليه أو غير متصل'
            });
        }

        // إنشاء معرف للمهمة الجماعية
        const bulkJobId = uuidv4();
        
        // إنشاء كائن لتخزين حالة المهمة
        const bulkJob = {
            id: bulkJobId,
            deviceId,
            totalMessages: recipients.length,
            sentMessages: 0,
            failedMessages: 0,
            status: 'processing',
            startTime: new Date().toISOString(),
            endTime: null,
            results: []
        };

        // تخزين حالة المهمة
        bulkJobs[bulkJobId] = bulkJob;

        // إرسال استجابة فورية مع معرف المهمة
        res.json({
            status: true,
            message: 'بدأت عملية الإرسال الجماعي',
            data: {
                bulkJobId,
                totalMessages: recipients.length
            }
        });

        // معالجة الرسائل في الخلفية
        processBulkMessages(bulkJob, recipients, messageTemplate, options, delayBetweenMessages || 2000);
    } catch (error) {
        console.error('خطأ في بدء الإرسال الجماعي:', error);
        res.status(500).json({
            status: false,
            message: `حدث خطأ أثناء بدء الإرسال الجماعي: ${error.message}`
        });
    }
}

/**
 * معالجة إرسال الرسائل المتعددة في الخلفية
 * @param {Object} bulkJob - كائن المهمة الجماعية
 * @param {Array} recipients - قائمة المستلمين
 * @param {String} messageTemplate - قالب الرسالة
 * @param {Object} options - خيارات إضافية
 * @param {Number} delayBetweenMessages - التأخير بين الرسائل (بالمللي ثانية)
 */
async function processBulkMessages(bulkJob, recipients, messageTemplate, options, delayBetweenMessages) {
    try {
        const client = clients[bulkJob.deviceId];
        
        // إذا كان هناك وسائط، نقوم بتحميلها مرة واحدة لاستخدامها عدة مرات
        let mediaObject = null;
        if (options && options.mediaUrl) {
            try {
                // التحقق من كون الوسائط URL عادي أو مسار ملف محلي
                if (options.mediaUrl.startsWith('http')) {
                    // إذا كان URL عادي، استخدم fromUrl
                    mediaObject = await MessageMedia.fromUrl(options.mediaUrl);
                } else {
                    // إذا كان مسار ملف محلي، استخدم fromFilePath
                    try {
                        // قد يكون المسار مباشراً أو بتنسيق file://
                        const cleanPath = options.mediaUrl.replace('file:///', '');
                        mediaObject = MessageMedia.fromFilePath(cleanPath);
                    } catch (fileError) {
                        console.error('خطأ في قراءة ملف الوسائط:', fileError);
                        
                        // محاولة أخرى بقراءة الملف يدويًا
                        try {
                            const filePath = options.mediaUrl.replace('file:///', '');
                            const mimeType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 
                                          path.extname(filePath).toLowerCase() === '.jpg' || 
                                          path.extname(filePath).toLowerCase() === '.jpeg' ? 'image/jpeg' : 
                                          'application/octet-stream';
                            
                            const data = fs.readFileSync(filePath);
                            const base64Data = Buffer.from(data).toString('base64');
                            
                            mediaObject = new MessageMedia(mimeType, base64Data, path.basename(filePath));
                        } catch (manualError) {
                            throw new Error(`فشل قراءة ملف الوسائط: ${manualError.message}`);
                        }
                    }
                }
                console.log('تم تحميل الوسائط بنجاح للإرسال الجماعي');
            } catch (mediaError) {
                console.error('خطأ في تحميل الوسائط للإرسال الجماعي:', mediaError);
                throw mediaError;
            }
        }
        
        for (const recipient of recipients) {
            try {
                // تخصيص الرسالة لهذا المستلم
                const personalizedMessage = personalizeMessage(messageTemplate, recipient);

                // ==== معالجة رقم الهاتف - طريقة جديدة أكثر بساطة ====
                let phone = recipient.phoneNumber.toString().trim();
                
                // 1. إزالة جميع الأحرف غير الرقمية
                phone = phone.replace(/\D/g, '');
                
                // 2. إذا كان الرقم يبدأ برمز بلد فعلاً، نستخدمه كما هو
                // لتبسيط الأمور، سنقوم بإنشاء معرف المحادثة يدوياً
                const chatId = `${phone}@c.us`;

                console.log(`[الرسائل الجماعية] محاولة إرسال رسالة إلى: ${chatId}`);

                // ==== جزء الإرسال ====
                let sentMessage;
                try {
                    if (mediaObject) {
                        // فحص ما إذا كان المستخدم يريد إرسال نص مع الصورة
                        const sendTextWithMedia = !options.mediaTextOption || options.mediaTextOption === 'withText';
                        
                        // إرسال رسالة وسائط باستخدام كائن MessageMedia
                        sentMessage = await client.client.sendMessage(
                            chatId, 
                            mediaObject, 
                            {
                                caption: sendTextWithMedia ? personalizedMessage : '' // إرسال النص فقط إذا كان الخيار هو إرسال النص مع الصورة
                            }
                        );
                    } else {
                        // إرسال رسالة نصية
                        sentMessage = await client.client.sendMessage(chatId, personalizedMessage);
                    }
                } catch (sendError) {
                    // في حالة الفشل، نحاول نهجًا آخر
                    console.error(`فشل الإرسال باستخدام النهج الأول: ${sendError.message}`);
                    
                    // نحاول بديلاً - استخدام طريقة getNumberId إذا كانت متوفرة في العميل
                    try {
                        if (client.client && typeof client.client.getNumberId === 'function') {
                            const numberData = await client.client.getNumberId(phone);
                            if (numberData) {
                                console.log(`تم العثور على معرف للرقم: ${JSON.stringify(numberData)}`);
                                
                                if (mediaObject) {
                                    // فحص ما إذا كان المستخدم يريد إرسال نص مع الصورة
                                    const sendTextWithMedia = !options.mediaTextOption || options.mediaTextOption === 'withText';
                                    
                                    sentMessage = await client.client.sendMessage(
                                        numberData._serialized, 
                                        mediaObject, 
                                        {
                                            caption: sendTextWithMedia ? personalizedMessage : '' // إرسال النص فقط إذا كان الخيار هو إرسال النص مع الصورة
                                        }
                                    );
                                } else {
                                    sentMessage = await client.client.sendMessage(numberData._serialized, personalizedMessage);
                                }
                            } else {
                                throw new Error(`لم يتم العثور على معرف لرقم الهاتف: ${phone}`);
                            }
                        } else {
                            throw sendError; // إذا لم تكن الدالة متاحة، نعيد إطلاق الخطأ الأصلي
                        }
                    } catch (fallbackError) {
                        throw fallbackError;
                    }
                }
                
                // تسجيل الرسالة المرسلة
                const messageLog = {
                    id: uuidv4(),
                    bulkJobId: bulkJob.id,
                    deviceId: bulkJob.deviceId,
                    timestamp: new Date().toISOString(),
                    to: chatId,
                    recipient: recipient,
                    message: personalizedMessage,
                    mediaUrl: options?.mediaUrl || null,
                    mediaTextOption: options?.mediaTextOption || 'withText',
                    status: 'sent',
                    messageId: sentMessage?.id?.id || null
                };

                // تحديث حالة المهمة
                bulkJob.sentMessages++;
                bulkJob.results.push(messageLog);

                // إنشاء مجلد الرسائل المرسلة إذا لم يكن موجودًا
                if (!fs.existsSync(CONFIG.SENT_MESSAGES_DIR)) {
                    fs.mkdirSync(CONFIG.SENT_MESSAGES_DIR, { recursive: true });
                }

                // حفظ الرسالة في ملف منفصل
                const messageFilePath = path.join(CONFIG.SENT_MESSAGES_DIR, `${messageLog.id}.json`);
                fs.writeFileSync(messageFilePath, JSON.stringify(messageLog, null, 2));

            } catch (error) {
                console.error(`خطأ في إرسال الرسالة إلى ${recipient.phoneNumber}:`, error);
                bulkJob.failedMessages++;
                bulkJob.results.push({
                    recipient: recipient,
                    error: error.message,
                    status: 'failed',
                    timestamp: new Date().toISOString()
                });
            }
            
            // انتظار المدة المحددة بين الرسائل لتجنب الحظر
            if (delayBetweenMessages > 0 && recipients.indexOf(recipient) < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
            }
        }

        // تحديث حالة المهمة عند الانتهاء
        bulkJob.status = 'completed';
        bulkJob.endTime = new Date().toISOString();
        
        console.log(`تمت مهمة الإرسال الجماعي ${bulkJob.id}: تم إرسال ${bulkJob.sentMessages} من أصل ${bulkJob.totalMessages} رسالة`);

        // الاحتفاظ بالمهمة لمدة ساعة ثم حذفها من الذاكرة
        setTimeout(() => {
            delete bulkJobs[bulkJob.id];
            console.log(`تم حذف مهمة الإرسال الجماعي ${bulkJob.id} من الذاكرة`);
        }, 3600000); // 1 ساعة
    } catch (error) {
        console.error('خطأ في معالجة الإرسال الجماعي:', error);
        bulkJob.status = 'error';
        bulkJob.endTime = new Date().toISOString();
        bulkJob.error = error.message;
    }
}

/**
 * تخصيص الرسالة باستخدام بيانات المستلم
 * @param {String} template - قالب الرسالة
 * @param {Object} recipient - بيانات المستلم
 * @returns {String} الرسالة المخصصة
 */
function personalizeMessage(template, recipient) {
    let personalizedMessage = template;
    
    // استبدال العناصر المخصصة في الرسالة
    if (recipient.name) {
        personalizedMessage = personalizedMessage.replace(/\{name\}/g, recipient.name);
    }
    
    if (recipient.firstName) {
        personalizedMessage = personalizedMessage.replace(/\{firstName\}/g, recipient.firstName);
    }
    
    if (recipient.lastName) {
        personalizedMessage = personalizedMessage.replace(/\{lastName\}/g, recipient.lastName);
    }
    
    // إضافة التاريخ والوقت الحاليين
    const now = new Date();
    personalizedMessage = personalizedMessage.replace(/\{date\}/g, now.toLocaleDateString('ar-SA'));
    personalizedMessage = personalizedMessage.replace(/\{time\}/g, now.toLocaleTimeString('ar-SA'));
    
    // استبدال أي حقول مخصصة أخرى
    Object.keys(recipient).forEach(key => {
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        personalizedMessage = personalizedMessage.replace(placeholder, recipient[key]);
    });
    
    return personalizedMessage;
}

/**
 * الحصول على حالة مهمة إرسال جماعي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getBulkJobStatus(req, res) {
    try {
        const { bulkJobId } = req.params;
        
        if (!bulkJobId) {
            return res.status(400).json({
                status: false,
                message: 'معرف المهمة مطلوب'
            });
        }
        
        // التحقق من وجود المهمة
        if (!bulkJobs[bulkJobId]) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على المهمة'
            });
        }
        
        const bulkJob = bulkJobs[bulkJobId];
        
        res.json({
            status: true,
            data: {
                id: bulkJob.id,
                deviceId: bulkJob.deviceId,
                status: bulkJob.status,
                totalMessages: bulkJob.totalMessages,
                sentMessages: bulkJob.sentMessages,
                failedMessages: bulkJob.failedMessages,
                startTime: bulkJob.startTime,
                endTime: bulkJob.endTime,
                progress: Math.round((bulkJob.sentMessages + bulkJob.failedMessages) / bulkJob.totalMessages * 100),
                error: bulkJob.error || null
            }
        });
    } catch (error) {
        console.error('خطأ في الحصول على حالة المهمة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على حالة المهمة'
        });
    }
}

/**
 * الحصول على الرسائل المرسلة من مهمة إرسال جماعي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getBulkJobMessages(req, res) {
    try {
        const { bulkJobId } = req.params;
        
        if (!bulkJobId) {
            return res.status(400).json({
                status: false,
                message: 'معرف المهمة مطلوب'
            });
        }
        
        // قراءة الرسائل من ملفات JSON
        if (!fs.existsSync(CONFIG.SENT_MESSAGES_DIR)) {
            return res.json({
                status: true,
                data: []
            });
        }

        const messageFiles = fs.readdirSync(CONFIG.SENT_MESSAGES_DIR)
            .filter(file => file.endsWith('.json'));
        
        let jobMessages = [];
        
        for (const file of messageFiles) {
            try {
                const filePath = path.join(CONFIG.SENT_MESSAGES_DIR, file);
                const messageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (messageData.bulkJobId === bulkJobId) {
                    jobMessages.push(messageData);
                }
            } catch (err) {
                console.error(`خطأ في قراءة ملف الرسالة ${file}:`, err);
            }
        }
        
        // ترتيب الرسائل حسب الطابع الزمني
        jobMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        res.json({
            status: true,
            data: jobMessages
        });
    } catch (error) {
        console.error('خطأ في الحصول على رسائل المهمة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على رسائل المهمة'
        });
    }
}

/**
 * الحصول على جميع الرسائل المرسلة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getSentMessages(req, res) {
    try {
        const { deviceId, limit } = req.query;
        
        if (!fs.existsSync(CONFIG.SENT_MESSAGES_DIR)) {
            return res.json({
                status: true,
                data: []
            });
        }

        const messageFiles = fs.readdirSync(CONFIG.SENT_MESSAGES_DIR)
            .filter(file => file.endsWith('.json'));
        
        let messages = [];
        
        for (const file of messageFiles) {
            try {
                const filePath = path.join(CONFIG.SENT_MESSAGES_DIR, file);
                const messageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // إذا تم تحديد معرف الجهاز، قم بتصفية الرسائل وفقًا لذلك
                if (!deviceId || messageData.deviceId === deviceId) {
                    messages.push(messageData);
                }
            } catch (err) {
                console.error(`خطأ في قراءة ملف الرسالة ${file}:`, err);
            }
        }
        
        // ترتيب الرسائل حسب الطابع الزمني (الأحدث أولاً)
        messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // تحديد عدد الرسائل
        if (limit) {
            messages = messages.slice(0, parseInt(limit, 10));
        }
        
        res.json({
            status: true,
            data: messages
        });
    } catch (error) {
        console.error('خطأ في الحصول على الرسائل المرسلة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على الرسائل المرسلة'
        });
    }
}

/**
 * الحصول على رسائل محادثة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChatMessages(req, res) {
    try {
        const { deviceId, chatId, limit } = req.params;
        
        if (!deviceId || !chatId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز والمحادثة مطلوبان'
            });
        }
        
        // التحقق من اتصال العميل
        const client = clients[deviceId];
        if (!client || !client.client || client.status !== 'authenticated') {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل أو غير مصادق عليه'
            });
        }
        
        // الحصول على الرسائل
        const limitNum = limit ? parseInt(limit, 10) : 50;
        const messages = await client.client.getChatById(chatId)
            .then(chat => chat.fetchMessages({limit: limitNum}));
        
        res.json({
            status: true,
            data: messages
        });
    } catch (error) {
        console.error('خطأ في الحصول على رسائل المحادثة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على رسائل المحادثة'
        });
    }
}

/**
 * الحصول على رسائل محادثة معينة بواسطة معرف المحادثة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChatMessagesByChatId(req, res) {
    try {
        const { chatId } = req.params;
        const { deviceId, limit } = req.query;
        
        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }
        
        if (!chatId) {
            return res.status(400).json({
                status: false,
                message: 'معرف المحادثة مطلوب'
            });
        }
        
        // التحقق من اتصال العميل
        const client = clients[deviceId];
        if (!client || !client.client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل'
            });
        }
        
        // تعديل للتحقق من كلا الحالتين: authenticated و connected
        if (client.status !== 'authenticated' && client.status !== 'connected') {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير مصادق عليه أو غير متصل'
            });
        }
        
        // الحصول على رسائل المحادثة
        const limitNum = limit ? parseInt(limit, 10) : 50;
        
        try {
            const chat = await client.client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: limitNum });
            
            res.json({
                status: true,
                data: messages.map(msg => ({
                    id: msg.id.id,
                    body: msg.body,
                    type: msg.type,
                    timestamp: msg.timestamp,
                    fromMe: msg.fromMe,
                    from: msg.from,
                    to: msg.to,
                    author: msg.author,
                    deviceType: msg.deviceType,
                    isForwarded: msg.isForwarded,
                    isStatus: msg.isStatus,
                    isStarred: msg.isStarred,
                    hasQuotedMsg: msg.hasQuotedMsg
                }))
            });
        } catch (err) {
            console.error(`خطأ في الحصول على محادثة ${chatId}:`, err);
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على المحادثة أو حدث خطأ في استرجاع الرسائل'
            });
        }
    } catch (error) {
        console.error('خطأ في الحصول على رسائل المحادثة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على رسائل المحادثة'
        });
    }
}

/**
 * الحصول على آخر الرسائل من جهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getLatestMessages(req, res) {
    try {
        const { deviceId } = req.params;
        
        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }
        
        // التحقق من اتصال العميل
        const client = clients[deviceId];
        if (!client || !client.client || client.status !== 'authenticated') {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل أو غير مصادق عليه'
            });
        }
        
        // الحصول على آخر الرسائل من كل محادثة
        const chats = await client.client.getChats();
        const latestMessages = [];
        
        for (const chat of chats) {
            const messages = await chat.fetchMessages({limit: 1});
            if (messages.length > 0) {
                latestMessages.push({
                    chatId: chat.id._serialized,
                    name: chat.name,
                    message: messages[0]
                });
            }
        }
        
        res.json({
            status: true,
            data: latestMessages
        });
    } catch (error) {
        console.error('خطأ في الحصول على آخر الرسائل:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على آخر الرسائل'
        });
    }
}

module.exports = {
    sendMessage,
    sendBulkMessages,
    getBulkJobStatus,
    getBulkJobMessages,
    getSentMessages,
    getChatMessages,
    getLatestMessages,
    getChatMessagesByChatId,
    uploadMedia
};