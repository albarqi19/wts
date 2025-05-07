/**
 * @file whatsappClient.js
 * @description خدمة إدارة عملاء واتساب
 */

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // استيراد Google Gemini
const CONFIG = require('../config/paths');
const { aiResponseService } = require('./aiResponseService'); // استيراد خدمة الرد الذكي

// قراءة ملف الأجهزة
let devices = [];
try {
    if (fs.existsSync(CONFIG.DEVICES_FILE)) {
        devices = JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE));
    }
} catch (error) {
    console.error('خطأ في قراءة ملف الأجهزة:', error);
    devices = [];
}

// حاوية لعملاء واتساب
const clients = {};

// حاوية لتخزين سياق المحادثات
const conversationContexts = {};

// الحد الأقصى للرسائل المحفوظة في السياق لكل محادثة
const MAX_CONTEXT_MESSAGES = 100;

// معدل انتهاء صلاحية السياق (بالدقائق)
const CONTEXT_EXPIRY_MINUTES = 60;

/**
 * إدارة سياق المحادثات
 */

/**
 * إضافة رسالة إلى سياق محادثة
 * @param {string} deviceId معرف الجهاز
 * @param {string} chatId معرف المحادثة
 * @param {string} role دور المرسل ('user' أو 'assistant')
 * @param {string} content محتوى الرسالة
 */
function addMessageToContext(deviceId, chatId, role, content) {
    // إنشاء معرف فريد للمحادثة (مزيج من معرف الجهاز ومعرف المحادثة)
    const conversationId = `${deviceId}_${chatId}`;
    
    // إنشاء سياق محادثة جديد إذا لم يكن موجوداً
    if (!conversationContexts[conversationId]) {
        conversationContexts[conversationId] = {
            messages: [],
            lastUpdate: Date.now()
        };
    }
    
    // إضافة الرسالة إلى سياق المحادثة
    conversationContexts[conversationId].messages.push({
        role,
        parts: [{ text: content }]
    });
    
    // تحديث توقيت آخر تحديث
    conversationContexts[conversationId].lastUpdate = Date.now();
    
    // الحفاظ على عدد محدود من الرسائل في السياق
    if (conversationContexts[conversationId].messages.length > MAX_CONTEXT_MESSAGES) {
        // إزالة أقدم رسالتين مع الحفاظ على أول رسالة (تعليمات النظام)
        const systemInstruction = conversationContexts[conversationId].messages[0];
        conversationContexts[conversationId].messages = 
            [systemInstruction, ...conversationContexts[conversationId].messages.slice(-MAX_CONTEXT_MESSAGES + 1)];
    }
    
    console.log(`تم إضافة رسالة إلى سياق المحادثة (${conversationId}). عدد الرسائل الحالي: ${conversationContexts[conversationId].messages.length}`);
}

/**
 * الحصول على سياق محادثة
 * @param {string} deviceId معرف الجهاز
 * @param {string} chatId معرف المحادثة
 * @returns {Array} قائمة الرسائل في السياق
 */
function getConversationContext(deviceId, chatId) {
    const conversationId = `${deviceId}_${chatId}`;
    
    // التحقق من وجود سياق للمحادثة
    if (!conversationContexts[conversationId]) {
        return [];
    }
    
    // التحقق من انتهاء صلاحية السياق
    const expiryTime = conversationContexts[conversationId].lastUpdate + (CONTEXT_EXPIRY_MINUTES * 60 * 1000);
    if (Date.now() > expiryTime) {
        console.log(`تم انتهاء صلاحية سياق المحادثة (${conversationId}). سيتم إنشاء سياق جديد.`);
        delete conversationContexts[conversationId];
        return [];
    }
    
    return conversationContexts[conversationId].messages;
}

/**
 * إضافة تعليمات النظام إلى سياق محادثة
 * @param {string} deviceId معرف الجهاز
 * @param {string} chatId معرف المحادثة
 * @param {string} systemInstruction تعليمات النظام
 */
function setSystemInstruction(deviceId, chatId, systemInstruction) {
    const conversationId = `${deviceId}_${chatId}`;
    
    // إنشاء سياق محادثة جديد إذا لم يكن موجوداً
    if (!conversationContexts[conversationId]) {
        conversationContexts[conversationId] = {
            messages: [],
            lastUpdate: Date.now(),
            systemInstruction: systemInstruction // تخزين تعليمات النظام بشكل منفصل
        };
    } else {
        // تحديث تعليمات النظام فقط
        conversationContexts[conversationId].systemInstruction = systemInstruction;
    }
    
    console.log(`تم تعيين تعليمات النظام لسياق المحادثة (${conversationId})`);
}

/**
 * حذف سياق محادثة
 * @param {string} deviceId معرف الجهاز
 * @param {string} chatId معرف المحادثة
 */
function clearConversationContext(deviceId, chatId) {
    const conversationId = `${deviceId}_${chatId}`;
    
    if (conversationContexts[conversationId]) {
        delete conversationContexts[conversationId];
        console.log(`تم حذف سياق المحادثة (${conversationId})`);
    }
}

/**
 * تنظيف سياقات المحادثات القديمة
 * يتم استدعاء هذه الدالة دوريًا لحذف سياقات المحادثات التي انتهت صلاحيتها
 */
function cleanupExpiredContexts() {
    const now = Date.now();
    const expiryTimeMs = CONTEXT_EXPIRY_MINUTES * 60 * 1000;
    
    let expiredCount = 0;
    
    for (const conversationId in conversationContexts) {
        const lastUpdate = conversationContexts[conversationId].lastUpdate;
        if (now - lastUpdate > expiryTimeMs) {
            delete conversationContexts[conversationId];
            expiredCount++;
        }
    }
    
    if (expiredCount > 0) {
        console.log(`تم حذف ${expiredCount} سياقات محادثة منتهية الصلاحية`);
    }
}

// تنظيف السياقات منتهية الصلاحية كل ساعة
setInterval(cleanupExpiredContexts, 60 * 60 * 1000);

/**
 * تحديث حالة الجهاز في الملف
 * @param {string} deviceId معرف الجهاز
 * @param {string} status الحالة الجديدة
 * @param {Object} info معلومات إضافية (اختياري)
 */
function updateDeviceStatus(deviceId, status, info = null) {
    try {
        const deviceIndex = devices.findIndex(device => device.id === deviceId);

        if (deviceIndex !== -1) {
            devices[deviceIndex].status = status;

            if (info) {
                devices[deviceIndex].info = info;
            }

            fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));
        }
    } catch (error) {
        console.error(`خطأ في تحديث حالة الجهاز (${deviceId}):`, error);
    }
}

/**
 * تهيئة عميل واتساب للجهاز
 * @param {string} deviceId معرف الجهاز
 * @param {string} deviceName اسم الجهاز
 * @param {Object} io كائن Socket.IO (اختياري)
 * @returns {Object} عميل واتساب
 */
function initializeClient(deviceId, deviceName, io = null) {
    try {
        // التحقق إذا كان العميل موجوداً بالفعل ونشط
        if (clients[deviceId]) {
            const existingStatus = clients[deviceId].status;
            
            // إذا كان العميل بالفعل في حالة اتصال نشط، فلا داعي لإعادة التهيئة
            if (['authenticated', 'connected', 'initializing', 'connecting', 'qr_ready'].includes(existingStatus)) {
                console.log(`العميل موجود بالفعل للجهاز ${deviceName} (${deviceId}) بحالة: ${existingStatus}. لن تتم إعادة التهيئة.`);
                
                // إرسال إشعار بالحالة الحالية
                if (io) {
                    io.emit('device_status_update', {
                        id: deviceId,
                        status: existingStatus,
                        info: clients[deviceId].info,
                        qr: clients[deviceId].qr
                    });
                }
                
                return clients[deviceId].client;
            }
            
            // إذا كان العميل موجوداً لكن في حالة غير نشطة، حاول تدميره قبل إعادة التهيئة
            if (clients[deviceId].client) {
                console.log(`العميل موجود للجهاز ${deviceName} (${deviceId}) بحالة: ${existingStatus}. سيتم تدميره وإعادة التهيئة.`);
                try {
                    // حاول إغلاق الجلسة بطريقة آمنة
                    clients[deviceId].client.destroy().catch(e => {
                        console.error(`خطأ في تدمير العميل السابق لجهاز ${deviceId}:`, e);
                    });
                    
                    // تأخير قصير للسماح بإتمام عملية التدمير
                    setTimeout(() => {}, 1000);
                } catch (destroyError) {
                    console.error(`خطأ في تدمير العميل السابق لجهاز ${deviceId}:`, destroyError);
                }
            }
        }

        console.log(`تهيئة عميل واتساب للجهاز: ${deviceName} (${deviceId})`);

        // إنشاء مجلد للجهاز إذا لم يكن موجوداً
        const deviceDir = path.join(CONFIG.DEVICES_DIR, deviceId);
        if (!fs.existsSync(deviceDir)) {
            fs.mkdirSync(deviceDir, { recursive: true });
        }

        // تكوين عميل واتساب
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: deviceId,
                dataPath: CONFIG.DEVICES_DIR
            }),
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

        // تسجيل الحالة الأولية
        clients[deviceId] = {
            client,
            status: 'initializing',
            qr: null,
            info: null
        };

        updateDeviceStatus(deviceId, 'initializing');

        // معالج عند إنشاء رمز QR
        client.on('qr', async (qrData) => {
            console.log(`تم إنشاء رمز QR للجهاز: ${deviceName}`);

            try {
                // تحويل نص QR إلى صورة قاعدة64
                const qrImageData = await qrcode.toDataURL(qrData);

                // تخزين الرمز وتحديث الحالة
                clients[deviceId].qr = qrImageData;
                clients[deviceId].status = 'qr_ready';

                updateDeviceStatus(deviceId, 'qr_ready');

                // إرسال رمز QR عبر Socket.IO
                if (io) {
                    io.emit(`qr:${deviceId}`, qrImageData);
                    io.emit('qr', qrImageData); // للتوافقية مع الواجهة القديمة

                    // إرسال تحديث الحالة
                    io.emit('device_status_update', {
                        id: deviceId,
                        status: 'qr_ready'
                    });
                }
            } catch (error) {
                console.error(`خطأ في معالجة رمز QR للجهاز (${deviceId}):`, error);
            }
        });

        // معالج عند بدء المصادقة
        client.on('authenticated', async () => {
            console.log(`تم مصادقة الجهاز: ${deviceName}`);

            clients[deviceId].status = 'authenticated';
            updateDeviceStatus(deviceId, 'authenticated');

            // إرسال حالة المصادقة عبر Socket.IO
            if (io) {
                io.emit('device_status_update', {
                    id: deviceId,
                    status: 'authenticated'
                });
            }
        });

        // معالج عند فشل المصادقة
        client.on('auth_failure', (message) => {
            console.error(`فشل مصادقة الجهاز: ${deviceName} - ${message}`);

            clients[deviceId].status = 'auth_failure';
            updateDeviceStatus(deviceId, 'auth_failure');

            // إرسال حالة فشل المصادقة عبر Socket.IO
            if (io) {
                io.emit('auth_failure', message);
                io.emit('device_status_update', {
                    id: deviceId,
                    status: 'auth_failure',
                    message: message
                });
            }
        });

        // معالج عند جهوزية العميل
        client.on('ready', async () => {
            console.log(`عميل واتساب جاهز للجهاز: ${deviceName}`);

            try {
                // الحصول على معلومات الجهاز - تعديل للاستخدام الصحيح للوصول إلى معرف الجهاز
                // في النسخ الحديثة من whatsapp-web.js، المعرف متاح مباشرة من خلال client.info.wid
                if (client.info && client.info.wid) {
                    clients[deviceId].info = {
                        wid: client.info.wid._serialized || client.info.wid,
                        pushname: client.info.pushname || null,
                        platform: client.info.platform || null
                    };
                } else {
                    // استخدام طريقة بديلة للحصول على معرف الجهاز
                    console.log('تعذر الوصول إلى معرف الجهاز من client.info.wid، محاولة طرق بديلة...');
                    
                    // محاولة استخدام getWid إذا كانت متوفرة
                    if (typeof client.getWid === 'function') {
                        const wid = await client.getWid();
                        clients[deviceId].info = {
                            wid: wid._serialized || wid,
                            pushname: client.info ? client.info.pushname : null,
                            platform: client.info ? client.info.platform : null
                        };
                    } else {
                        // استخدام طريقة بديلة أخرى أو معلومات افتراضية
                        clients[deviceId].info = {
                            wid: `${deviceId}@c.us`,
                            pushname: deviceName || null,
                            platform: 'unknown'
                        };
                        console.warn(`لم يتم العثور على معرف الجهاز لـ ${deviceId}، تم استخدام معرف افتراضي`);
                    }
                }

                // تغيير الحالة إلى connected بدلاً من authenticated
                clients[deviceId].status = 'connected';
                updateDeviceStatus(deviceId, 'connected', clients[deviceId].info);

                // تحديث المحادثات وجهات الاتصال
                await updateDeviceChats(deviceId, client);
                await updateDeviceContacts(deviceId, client);

                // إرسال معلومات المصادقة والاتصال عبر Socket.IO
                if (io) {
                    io.emit(`authenticated:${deviceId}`, clients[deviceId].info);
                    io.emit(`connected:${deviceId}`, clients[deviceId].info);
                    io.emit('authenticated', clients[deviceId].info); // للتوافقية
                    io.emit('connected', clients[deviceId].info); // للتوافقية

                    io.emit('device_status_update', {
                        id: deviceId,
                        status: 'connected',
                        info: clients[deviceId].info
                    });
                }
            } catch (error) {
                console.error(`خطأ في تجهيز عميل واتساب (${deviceId}):`, error);
                
                // إنشاء معلومات افتراضية للتعافي من الخطأ
                clients[deviceId].info = {
                    wid: `${deviceId}@c.us`,
                    pushname: deviceName || null,
                    platform: 'unknown'
                };
                
                clients[deviceId].status = 'connected';
                updateDeviceStatus(deviceId, 'connected', clients[deviceId].info);
                
                // على الرغم من الخطأ، حاول تحديث المحادثات وجهات الاتصال
                try {
                    await updateDeviceChats(deviceId, client);
                    await updateDeviceContacts(deviceId, client);
                } catch (err) {
                    console.error(`خطأ في تحديث البيانات بعد الخطأ الأولي:`, err);
                }
            }
        });

        // معالج عند قطع الاتصال
        client.on('disconnected', (reason) => {
            console.log(`قطع اتصال الجهاز: ${deviceName} - ${reason}`);

            clients[deviceId].status = 'disconnected';
            updateDeviceStatus(deviceId, 'disconnected');

            // إرسال حالة قطع الاتصال عبر Socket.IO
            if (io) {
                io.emit('disconnected', reason);
                io.emit('device_status_update', {
                    id: deviceId,
                    status: 'disconnected',
                    reason: reason
                });
            }
        });

        // معالج عند استلام رسالة جديدة
        client.on('message', async (message) => {
            console.log(`رسالة جديدة للجهاز: ${deviceName} - من: ${message.from}`);

            try {
                // تحديث المحادثات عند استلام رسالة جديدة
                if (message.fromMe === false) {
                    await updateDeviceChats(deviceId, client);

                    // إضافة: معالجة تكامل webhook
                    try {
                        // استيراد خدمة التكاملات مع التحقق من وجودها أولاً
                        const integrationsService = require('../integrations');
                        
                        // إرسال الرسالة إلى جميع تكاملات webhook النشطة
                        console.log(`إرسال الرسالة إلى تكاملات webhook للجهاز: ${deviceId}`);
                        await integrationsService.processMessage(deviceId, message);
                    } catch (webhookError) {
                        console.error(`خطأ في معالجة تكامل webhook (${deviceId}):`, webhookError);
                    }

                    // معالجة الرسالة باستخدام خدمة الرد الذكي
                    try {
                        console.log(`محاولة معالجة الرسالة باستخدام الرد الذكي للجهاز: ${deviceId}`);
                        console.log(`محتوى الرسالة: "${message.body}"`);

                        // إعادة تحميل نماذج الرد الذكي للتأكد من تحديثها
                        aiResponseService.loadResponses();

                        // طباعة نماذج الرد الذكي المتاحة
                        console.log('نماذج الرد الذكي المتاحة:', JSON.stringify(aiResponseService.responses));

                        // التحقق من وجود نماذج رد ذكي نشطة
                        const activeResponses = aiResponseService.responses.filter(response => response.active);

                        if (activeResponses.length === 0) {
                            console.log('لا توجد نماذج رد ذكي نشطة. لن يتم معالجة الرسالة.');
                            return;
                        }

                        // معالجة مباشرة للرسالة باستخدام أول نموذج نشط
                        const firstActiveResponse = activeResponses[0];
                        console.log(`محاولة معالجة الرسالة باستخدام النموذج: ${firstActiveResponse.name} (${firstActiveResponse.id})`);

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
                                console.log(`الرسالة لا تطابق أي مشغل. لن يتم معالجة الرسالة.`);
                                return;
                            }
                        }

                        // إنشاء رد باستخدام Google Gemini
                        console.log('جارٍ إنشاء رد باستخدام Google Gemini...');

                        try {
                            // استخدام مفتاح API الرئيسي
                            const apiKey = 'AIzaSyBhLXbhF05-JfTsAi9P6rJm_N4QJhKfTr0';
                            console.log(`استخدام مفتاح API: ${apiKey.substring(0, 10)}...`);

                            // إنشاء مثيل Google Gemini
                            const genAI = new GoogleGenerativeAI(apiKey);
                            
                            // استخدام نموذج Gemini 2.0 Flash
                            const modelName = "gemini-2.0-flash";
                            console.log(`استخدام نموذج: ${modelName}`);
                            
                            // الحصول على معرّف المحادثة
                            const conversationId = `${deviceId}_${message.from}`;
                            
                            // تخزين تعليمات النظام أو إنشاؤها إذا لم تكن موجودة
                            if (!conversationContexts[conversationId] || !conversationContexts[conversationId].systemInstruction) {
                                setSystemInstruction(deviceId, message.from, firstActiveResponse.description || "");
                            }
                            
                            // إنشاء نموذج مع تعليمات النظام المخزنة
                            const model = genAI.getGenerativeModel({ 
                                model: modelName,
                                // استخدام تعليمات النظام المخزنة بشكل منفصل
                                systemInstruction: conversationContexts[conversationId].systemInstruction
                            });
                            
                            // إعدادات توليد النص
                            const generationConfig = {
                                temperature: 0.7,
                                maxOutputTokens: 800,
                                topK: 40,
                                topP: 0.95,
                            };

                            console.log(`محتوى الرسالة المرسلة إلى Gemini: "${message.body}"`);
                            console.log(`نص المطالبة المستخدم: "${conversationContexts[conversationId].systemInstruction || "غير محدد"}"`);
                            
                            // إضافة رسالة المستخدم الحالية إلى السياق
                            addMessageToContext(deviceId, message.from, 'user', message.body);
                            
                            // الحصول على سياق المحادثة (بدون تعليمات النظام، لأننا نرسلها بشكل منفصل)
                            let chatContext = getConversationContext(deviceId, message.from);
                            
                            console.log(`استخدام سياق المحادثة مع ${chatContext.length} رسائل`);
                            
                            // حذف أي رسائل بدور "system" من السياق لتجنب الخطأ
                            chatContext = chatContext.filter(msg => msg.role !== 'system');
                            
                            // إرسال الطلب إلى Google Gemini مع السياق
                            const result = await model.generateContent({
                                contents: chatContext,
                                generationConfig,
                            });

                            // الحصول على الرد
                            const text = result.response.text();

                            // إضافة رد المساعد إلى السياق
                            addMessageToContext(deviceId, message.from, 'assistant', text);

                            console.log(`تم إنشاء الرد: "${text.substring(0, 100)}..."`);

                            // إرسال الرد إلى المرسل الأصلي
                            const chat = await client.getChatById(message.from);
                            await chat.sendMessage(text);

                            console.log('تم إرسال الرد بنجاح');
                            return; // الخروج من الدالة بعد إرسال الرد بنجاح
                        } catch (geminiError) {
                            console.error('خطأ في إنشاء الرد باستخدام Google Gemini:', geminiError);
                            
                            try {
                                // إرسال رسالة اعتذار إلى المرسل الأصلي
                                const chat = await client.getChatById(message.from);
                                await chat.sendMessage("عذراً، لم أتمكن من معالجة رسالتك في الوقت الحالي. يرجى المحاولة مرة أخرى لاحقاً.");
                                console.log('تم إرسال رسالة اعتذار للمستخدم');
                            } catch (sendError) {
                                console.error('خطأ في إرسال رسالة اعتذار:', sendError);
                            }
                        }
                    } catch (aiError) {
                        console.error(`خطأ في معالجة الرسالة باستخدام الرد الذكي (${deviceId}):`, aiError);
                    }
                }

                // إرسال إشعار بالرسالة الجديدة عبر Socket.IO
                if (io) {
                    io.emit('new_message', {
                        deviceId: deviceId,
                        message: {
                            id: message.id._serialized,
                            from: message.from,
                            body: message.body,
                            timestamp: message.timestamp,
                            fromMe: message.fromMe
                        }
                    });
                }
            } catch (error) {
                console.error(`خطأ في معالجة رسالة جديدة (${deviceId}):`, error);
            }
        });

        // بدء تشغيل العميل مع معالجة الأخطاء
        client.initialize()
            .catch(error => {
                console.error(`خطأ في تهيئة عميل واتساب (${deviceId}):`, error);

                clients[deviceId].status = 'initialization_failed';
                updateDeviceStatus(deviceId, 'initialization_failed');

                // إرسال حالة فشل التهيئة عبر Socket.IO
                if (io) {
                    io.emit('device_status_update', {
                        id: deviceId,
                        status: 'initialization_failed',
                        error: error.message
                    });
                }
            });

        console.log(`تمت تهيئة عميل واتساب للجهاز: ${deviceName} (${deviceId})`);
        return client;
    } catch (error) {
        console.error(`خطأ في تهيئة عميل واتساب (${deviceId}):`, error);

        // تسجيل حالة الخطأ
        updateDeviceStatus(deviceId, 'error');

        // إرسال حالة الخطأ عبر Socket.IO
        if (io) {
            io.emit('device_status_update', {
                id: deviceId,
                status: 'error',
                error: error.message
            });
        }

        return null;
    }
}

/**
 * تحديث محادثات الجهاز
 * @param {string} deviceId معرف الجهاز
 * @param {Object} client كائن عميل واتساب
 * @returns {Promise<Array>} قائمة المحادثات
 */
async function updateDeviceChats(deviceId, client) {
    try {
        console.log(`تحديث محادثات الجهاز: ${deviceId}`);

        // الحصول على المحادثات
        const whatsappChats = await client.getChats();

        // تحويل بيانات المحادثات إلى تنسيق مناسب للتخزين
        const chats = whatsappChats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            timestamp: chat.timestamp,
            unreadCount: chat.unreadCount,
            lastMessage: chat.lastMessage ? {
                id: chat.lastMessage.id ? chat.lastMessage.id._serialized : null,
                body: chat.lastMessage.body,
                timestamp: chat.lastMessage.timestamp,
                from: chat.lastMessage.from,
                fromMe: chat.lastMessage.fromMe
            } : null
        }));

        // حفظ المحادثات في ملف
        const chatFilePath = path.join(CONFIG.DEVICES_DIR, deviceId, 'chats.json');
        fs.writeFileSync(chatFilePath, JSON.stringify(chats, null, 2));

        // أيضًا حفظها في مستوى أعلى لتسهيل الوصول
        const mainChatFilePath = path.join(CONFIG.DATA_DIR, 'chats.json');

        // قراءة الملف الحالي إذا كان موجوداً
        let allChats = {};
        if (fs.existsSync(mainChatFilePath)) {
            try {
                allChats = JSON.parse(fs.readFileSync(mainChatFilePath));
            } catch (err) {
                console.error('خطأ في قراءة ملف المحادثات الرئيسي:', err);
            }
        }

        // تحديث المحادثات لهذا الجهاز
        allChats[deviceId] = chats;

        // حفظ الملف
        fs.writeFileSync(mainChatFilePath, JSON.stringify(allChats, null, 2));

        return chats;
    } catch (error) {
        console.error(`خطأ في تحديث محادثات الجهاز (${deviceId}):`, error);
        return [];
    }
}

/**
 * تحديث جهات اتصال الجهاز
 * @param {string} deviceId معرف الجهاز
 * @param {Object} client كائن عميل واتساب
 * @returns {Promise<Array>} قائمة جهات الاتصال
 */
async function updateDeviceContacts(deviceId, client) {
    try {
        console.log(`تحديث جهات اتصال الجهاز: ${deviceId}`);

        // الحصول على جهات الاتصال
        const whatsappContacts = await client.getContacts();

        // تحويل بيانات جهات الاتصال إلى تنسيق مناسب للتخزين
        const contacts = whatsappContacts
            .filter(contact => contact.isMyContact || contact.name)
            .map(contact => ({
                id: contact.id._serialized,
                name: contact.name || '',
                pushname: contact.pushname || '',
                shortName: contact.shortName || '',
                isMyContact: contact.isMyContact || false,
                isGroup: contact.isGroup || false,
                isWAContact: contact.isWAContact || false,
                number: contact.id.user
            }));

        // حفظ جهات الاتصال في ملف
        const contactFilePath = path.join(CONFIG.DEVICES_DIR, deviceId, 'contacts.json');
        fs.writeFileSync(contactFilePath, JSON.stringify(contacts, null, 2));

        // أيضًا حفظها في مستوى أعلى لتسهيل الوصول
        const mainContactFilePath = path.join(CONFIG.DATA_DIR, 'contacts.json');

        // قراءة الملف الحالي إذا كان موجوداً
        let allContacts = {};
        if (fs.existsSync(mainContactFilePath)) {
            try {
                allContacts = JSON.parse(fs.readFileSync(mainContactFilePath));
            } catch (err) {
                console.error('خطأ في قراءة ملف جهات الاتصال الرئيسي:', err);
            }
        }

        // تحديث جهات الاتصال لهذا الجهاز
        allContacts[deviceId] = contacts;

        // حفظ الملف
        fs.writeFileSync(mainContactFilePath, JSON.stringify(allContacts, null, 2));

        return contacts;
    } catch (error) {
        console.error(`خطأ في تحديث جهات اتصال الجهاز (${deviceId}):`, error);
        return [];
    }
}

// تهيئة عملاء واتساب للأجهزة المفعلة
function initializeActiveClients(io = null) {
    const activeDevices = devices.filter(device => device.active);

    activeDevices.forEach(device => {
        initializeClient(device.id, device.name, io);
    });

    console.log(`تم تهيئة ${activeDevices.length} جهاز نشط`);
}

// تصدير العناصر المطلوبة
module.exports = {
    devices,
    clients,
    initializeClient,
    updateDeviceStatus,
    initializeActiveClients,
    updateDeviceChats,
    updateDeviceContacts,
    addMessageToContext,
    getConversationContext,
    setSystemInstruction,
    clearConversationContext
};