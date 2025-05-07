/**
 * @file deviceController.js
 * @description متحكم للتعامل مع عمليات الأجهزة
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const glob = require('glob');
const CONFIG = require('../config/paths');
const {
    clients,
    initializeClient,
    updateDeviceStatus,
    updateDeviceChats,
    updateDeviceContacts
} = require('../services/whatsappClient');

/**
 * الحصول على كل الأجهزة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getAllDevices(req, res) {
    try {
        // قراءة ملف الأجهزة
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // تحديث حالات الأجهزة من الذاكرة
        const updatedDevices = devices.map(device => {
            if (clients[device.id]) {
                return {
                    ...device,
                    currentStatus: clients[device.id].status,
                    info: clients[device.id].info
                };
            }
            return device;
        });

        res.json({
            status: true,
            data: updatedDevices
        });
    } catch (error) {
        console.error('خطأ في استرداد الأجهزة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء استرداد الأجهزة'
        });
    }
}

/**
 * إضافة جهاز جديد
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function addDevice(req, res) {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                status: false,
                message: 'اسم الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة الحالي
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // إنشاء معرف فريد للجهاز
        const deviceId = uuidv4();

        // إنشاء كائن الجهاز الجديد
        const newDevice = {
            id: deviceId,
            name,
            active: true,
            status: 'disconnected',
            dateCreated: new Date().toISOString()
        };

        // إضافة الجهاز الجديد للقائمة
        devices.push(newDevice);

        // حفظ التغييرات
        fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));

        console.log(`تمت إضافة جهاز جديد: ${name} (${deviceId})`);

        // إرسال إشعار Socket.IO
        if (req.io) {
            req.io.emit('new_device', newDevice);
            req.io.emit('device_status_update', {
                id: deviceId,
                status: 'disconnected',
                message: 'تمت إضافة الجهاز بنجاح. انقر على اتصال لتوصيل الجهاز.'
            });
        }

        // ملاحظة مهمة: لا نقوم بتهيئة الاتصال هنا، بل ننتظر من المستخدم أن يضغط على زر الاتصال
        
        res.json({
            status: true,
            message: 'تمت إضافة الجهاز بنجاح. انقر على اتصال لتوصيل الجهاز.',
            data: newDevice
        });
    } catch (error) {
        console.error('خطأ في إضافة الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء إضافة الجهاز'
        });
    }
}

/**
 * تحديث معلومات جهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function updateDevice(req, res) {
    try {
        const { deviceId } = req.params;
        const { name, active } = req.body;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // البحث عن الجهاز
        const deviceIndex = devices.findIndex(device => device.id === deviceId);

        if (deviceIndex === -1) {
            return res.status(404).json({
                status: false,
                message: 'الجهاز غير موجود'
            });
        }

        // تحديث معلومات الجهاز
        if (name !== undefined) {
            devices[deviceIndex].name = name;
        }

        if (active !== undefined) {
            devices[deviceIndex].active = active;
        }

        devices[deviceIndex].lastModified = new Date().toISOString();

        // حفظ التغييرات
        fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));

        // إرسال إشعار Socket.IO
        if (req.io) {
            req.io.emit('device_update', devices[deviceIndex]);
        }

        res.json({
            status: true,
            message: 'تم تحديث الجهاز بنجاح',
            data: devices[deviceIndex]
        });
    } catch (error) {
        console.error('خطأ في تحديث الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء تحديث الجهاز'
        });
    }
}

/**
 * حذف جهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function deleteDevice(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // البحث عن الجهاز
        const deviceIndex = devices.findIndex(device => device.id === deviceId);

        if (deviceIndex === -1) {
            return res.status(404).json({
                status: false,
                message: 'الجهاز غير موجود'
            });
        }

        const deletedDevice = devices[deviceIndex];

        // قطع اتصال الجهاز إذا كان متصلًا
        if (clients[deviceId] && clients[deviceId].client) {
            try {
                await clients[deviceId].client.logout();
                await clients[deviceId].client.destroy();
                delete clients[deviceId];
            } catch (error) {
                console.error(`خطأ في قطع اتصال الجهاز (${deviceId}):`, error);
            }
        }

        // حذف الجهاز من القائمة
        devices.splice(deviceIndex, 1);

        // حفظ التغييرات
        fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));

        // إرسال إشعار Socket.IO
        if (req.io) {
            req.io.emit('device_deleted', { id: deviceId });
        }

        res.json({
            status: true,
            message: 'تم حذف الجهاز بنجاح',
            data: { id: deviceId, name: deletedDevice.name }
        });
    } catch (error) {
        console.error('خطأ في حذف الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء حذف الجهاز'
        });
    }
}

/**
 * توصيل جهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function connectDevice(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // البحث عن الجهاز
        const deviceIndex = devices.findIndex(device => device.id === deviceId);

        if (deviceIndex === -1) {
            return res.status(404).json({
                status: false,
                message: 'الجهاز غير موجود'
            });
        }

        const device = devices[deviceIndex];
        console.log(`محاولة الاتصال بالجهاز ${device.name} (${deviceId})`);

        // التحقق من حالة الاتصال الحالية بشكل مفصل
        if (clients[deviceId]) {
            const currentStatus = clients[deviceId].status;
            console.log(`الحالة الحالية للجهاز ${deviceId}: ${currentStatus}`);

            // إذا كان الجهاز بالفعل في حالة اتصال نشطة (متصل أو جاري الاتصال)
            if (['authenticated', 'connected', 'qr_ready', 'initializing', 'connecting'].includes(currentStatus)) {
                console.log(`الجهاز ${deviceId} في عملية اتصال نشطة بالفعل (${currentStatus}). إرسال الحالة الحالية.`);

                // إذا كان لدينا رمز QR، أرسله مرة أخرى
                if (currentStatus === 'qr_ready' && clients[deviceId].qr) {
                    console.log(`إعادة إرسال رمز QR للجهاز ${deviceId}`);

                    if (req.io) {
                        req.io.emit(`qr:${deviceId}`, clients[deviceId].qr);
                        req.io.emit('qr', clients[deviceId].qr); // للتوافقية
                    }
                }

                // إرسال إشعار بحالة الاتصال الحالية
                if (req.io) {
                    req.io.emit('device_status_update', {
                        id: deviceId,
                        status: currentStatus,
                        info: clients[deviceId].info,
                        qr: currentStatus === 'qr_ready' ? clients[deviceId].qr : null
                    });

                    // إرسال إشعارات المصادقة والاتصال إذا كان متصلاً بالفعل
                    if ((currentStatus === 'authenticated' || currentStatus === 'connected') && clients[deviceId].info) {
                        req.io.emit(`authenticated:${deviceId}`, clients[deviceId].info);
                        req.io.emit(`connected:${deviceId}`, clients[deviceId].info);
                    }
                }

                return res.json({
                    status: true,
                    message: `الجهاز في حالة ${currentStatus} بالفعل`,
                    data: {
                        id: deviceId,
                        status: currentStatus,
                        info: clients[deviceId].info,
                        qr: currentStatus === 'qr_ready' ? clients[deviceId].qr : null
                    }
                });
            }
            // إذا كان الجهاز في حالة انقطاع الاتصال أو فشل، نحتاج إلى إعادة تهيئته
            else if (['disconnected', 'auth_failure', 'initialization_failed', 'error'].includes(currentStatus)) {
                console.log(`الجهاز ${deviceId} منقطع أو فشلت التهيئة (${currentStatus}). إعادة المحاولة.`);
                // سيتم معالجة إعادة التهيئة أدناه
            }
        }

        // في هذه النقطة، إما أن الجهاز غير موجود في clients أو نحتاج لإعادة محاولة الاتصال

        // تهيئة عميل واتساب (سيتعامل مع حالات الجهاز الموجود بالفعل)
        console.log(`تهيئة/إعادة تهيئة عميل واتساب للجهاز ${deviceId}`);
        initializeClient(deviceId, devices[deviceIndex].name, req.io);

        // تحديث حالة الجهاز في الملف
        devices[deviceIndex].status = 'connecting';
        devices[deviceIndex].lastConnectAttempt = new Date().toISOString();
        fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));

        // التأكد من clients[deviceId] موجود الآن بعد التهيئة
        if (!clients[deviceId]) {
            return res.status(500).json({
                status: false,
                message: 'فشل في تهيئة عميل واتساب'
            });
        }

        // إرسال الاستجابة
        res.json({
            status: true,
            message: 'تمت بدء عملية الاتصال بنجاح',
            data: {
                id: deviceId,
                status: clients[deviceId].status,
                qr: clients[deviceId].qr
            }
        });
    } catch (error) {
        console.error('خطأ في اتصال الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الاتصال بالجهاز',
            error: error.message
        });
    }
}

/**
 * قطع اتصال جهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function disconnectDevice(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // التحقق من وجود العميل
        if (!clients[deviceId] || !clients[deviceId].client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير متصل'
            });
        }

        // قطع اتصال العميل
        try {
            await clients[deviceId].client.logout();
            await clients[deviceId].client.destroy();

            // تحديث الحالة
            clients[deviceId].status = 'disconnected';
            clients[deviceId].qr = null;

            // تحديث حالة الجهاز في الملف
            updateDeviceStatus(deviceId, 'disconnected');

            // إرسال إشعار Socket.IO
            if (req.io) {
                req.io.emit('disconnected', 'تم قطع الاتصال من قبل المستخدم');
                req.io.emit('device_status_update', {
                    id: deviceId,
                    status: 'disconnected'
                });
            }

            res.json({
                status: true,
                message: 'تم قطع اتصال الجهاز بنجاح'
            });
        } catch (error) {
            console.error(`خطأ في قطع اتصال الجهاز (${deviceId}):`, error);
            res.status(500).json({
                status: false,
                message: 'حدث خطأ أثناء قطع اتصال الجهاز'
            });
        }
    } catch (error) {
        console.error('خطأ في قطع اتصال الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء قطع اتصال الجهاز'
        });
    }
}

/**
 * حذف جميع الجلسات من النظام
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function deleteAllSessions(req, res) {
    try {
        // قطع اتصال جميع العملاء أولاً
        const clientIds = Object.keys(clients);

        // قطع اتصال كل عميل وتدميره
        for (const clientId of clientIds) {
            if (clients[clientId] && clients[clientId].client) {
                try {
                    console.log(`محاولة قطع اتصال الجهاز ${clientId}...`);
                    await clients[clientId].client.logout().catch(e => console.error(`خطأ في تسجيل الخروج للجهاز ${clientId}:`, e));
                    await clients[clientId].client.destroy().catch(e => console.error(`خطأ في تدمير العميل للجهاز ${clientId}:`, e));
                    delete clients[clientId];
                    console.log(`تم قطع اتصال الجهاز ${clientId} بنجاح`);
                } catch (error) {
                    console.error(`خطأ أثناء قطع اتصال الجهاز ${clientId}:`, error);
                }
            }
        }

        // حذف مجلدات الجلسات
        const sessionPattern = path.join(CONFIG.DATA_DIR, 'devices', 'session-*');
        const sessionFolders = glob.sync(sessionPattern);

        if (sessionFolders.length === 0) {
            console.log('لا توجد مجلدات جلسات للحذف');
        } else {
            console.log(`وجدت ${sessionFolders.length} مجلدات جلسات للحذف`);

            for (const folder of sessionFolders) {
                try {
                    console.log(`جاري حذف مجلد الجلسة: ${folder}`);
                    fs.rmSync(folder, { recursive: true, force: true });
                    console.log(`تم حذف مجلد الجلسة: ${folder}`);
                } catch (error) {
                    console.error(`خطأ في حذف مجلد الجلسة ${folder}:`, error);
                }
            }
        }

        // تحديث ملف الأجهزة لتعيين جميع الأجهزة كغير متصلة
        if (fs.existsSync(CONFIG.DEVICES_FILE)) {
            const devices = JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'));

            const updatedDevices = devices.map(device => ({
                ...device,
                status: 'disconnected',
                lastDisconnected: new Date().toISOString()
            }));

            fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(updatedDevices, null, 2));
            console.log('تم تحديث جميع حالات الأجهزة إلى "disconnected"');
        }

        // إرسال إشعار Socket.IO إذا كان متاحًا
        if (req.io) {
            req.io.emit('all_sessions_deleted', {
                message: 'تم حذف جميع الجلسات بنجاح'
            });
        }

        res.json({
            status: true,
            message: 'تم حذف جميع الجلسات بنجاح',
            deletedSessions: sessionFolders.map(folder => path.basename(folder))
        });
    } catch (error) {
        console.error('خطأ في حذف جميع الجلسات:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء حذف الجلسات',
            error: error.message
        });
    }
}

/**
 * الحصول على رمز QR للجهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getDeviceQR(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة للتحقق من وجود الجهاز
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // البحث عن الجهاز
        const deviceExists = devices.some(device => device.id === deviceId);

        if (!deviceExists) {
            return res.status(404).json({
                status: false,
                message: 'الجهاز غير موجود'
            });
        }

        // التحقق من وجود العميل وإنشاؤه إذا لم يكن موجودًا
        if (!clients[deviceId]) {
            // الجهاز موجود في الملف لكن ليس لديه عميل مهيأ
            const device = devices.find(d => d.id === deviceId);
            console.log(`تهيئة عميل جديد للجهاز ${deviceId} عند طلب رمز QR`);
            initializeClient(deviceId, device.name, req.io);

            // إرسال استجابة مؤقتة للسماح بتهيئة العميل
            return res.json({
                status: true,
                data: {
                    id: deviceId,
                    status: 'initializing',
                    qr: null,
                    message: 'جارِ تهيئة العميل...'
                }
            });
        }

        // إذا كان العميل موجودًا لكن غير متصل، نحاول الاتصال به
        if (clients[deviceId].status === 'disconnected' || clients[deviceId].status === 'initialization_failed') {
            // محاولة إعادة الاتصال بالجهاز
            const device = devices.find(d => d.id === deviceId);
            console.log(`محاولة إعادة الاتصال بالجهاز ${deviceId} عند طلب رمز QR`);

            // إذا كان العميل موجودًا، نحاول تدميره أولاً
            if (clients[deviceId].client) {
                try {
                    await clients[deviceId].client.destroy();
                } catch (error) {
                    console.error(`خطأ في تدمير العميل السابق (${deviceId}):`, error);
                }
            }

            // إعادة تهيئة العميل
            initializeClient(deviceId, device.name, req.io);

            // تحديث حالة الجهاز في الملف
            const deviceIndex = devices.findIndex(d => d.id === deviceId);
            if (deviceIndex !== -1) {
                devices[deviceIndex].status = 'connecting';
                devices[deviceIndex].lastConnectAttempt = new Date().toISOString();
                fs.writeFileSync(CONFIG.DEVICES_FILE, JSON.stringify(devices, null, 2));
            }
        }

        // إرسال البيانات الحالية
        res.json({
            status: true,
            data: {
                id: deviceId,
                status: clients[deviceId].status,
                qr: clients[deviceId].qr,
                info: clients[deviceId].info
            }
        });
    } catch (error) {
        console.error('خطأ في الحصول على رمز QR:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على رمز QR'
        });
    }
}

/**
 * الحصول على محادثات الجهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getDeviceChats(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // التحقق من وجود العميل والاتصال
        if (!clients[deviceId] || !clients[deviceId].client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير موجود أو غير متصل'
            });
        }

        // التحقق من حالة العميل - تعديل للسماح بحالة connected
        if (clients[deviceId].status !== 'authenticated' && clients[deviceId].status !== 'connected') {
            return res.status(403).json({
                status: false,
                message: 'الجهاز غير مصادق عليه أو غير متصل'
            });
        }

        try {
            // تحديث المحادثات
            const chats = await updateDeviceChats(deviceId, clients[deviceId].client);

            res.json({
                status: true,
                data: chats
            });
        } catch (error) {
            console.error(`خطأ في الحصول على محادثات الجهاز (${deviceId}):`, error);

            // محاولة قراءة الملف مباشرة إذا فشلت عملية التحديث
            try {
                const chatFilePath = path.join(CONFIG.DEVICES_DIR, deviceId, 'chats.json');
                if (fs.existsSync(chatFilePath)) {
                    const chats = JSON.parse(fs.readFileSync(chatFilePath, 'utf8'));
                    return res.json({
                        status: true,
                        data: chats,
                        note: 'تم استرداد المحادثات من الملف المخزن'
                    });
                }
            } catch (fileError) {
                console.error(`فشل استرداد المحادثات من الملف (${deviceId}):`, fileError);
            }

            res.status(500).json({
                status: false,
                message: 'حدث خطأ أثناء الحصول على المحادثات'
            });
        }
    } catch (error) {
        console.error('خطأ في الحصول على محادثات الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على محادثات الجهاز'
        });
    }
}

/**
 * الحصول على جهات اتصال الجهاز
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getDeviceContacts(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // التحقق من وجود العميل والاتصال
        if (!clients[deviceId] || !clients[deviceId].client) {
            return res.status(400).json({
                status: false,
                message: 'الجهاز غير موجود أو غير متصل'
            });
        }

        // التحقق من حالة العميل
        if (clients[deviceId].status !== 'authenticated' && clients[deviceId].status !== 'connected') {
            return res.status(403).json({
                status: false,
                message: 'الجهاز غير مصادق عليه أو غير متصل'
            });
        }

        try {
            // تحديث جهات الاتصال
            const contacts = await updateDeviceContacts(deviceId, clients[deviceId].client);

            res.json({
                status: true,
                data: contacts
            });
        } catch (error) {
            console.error(`خطأ في الحصول على جهات اتصال الجهاز (${deviceId}):`, error);
            res.status(500).json({
                status: false,
                message: 'حدث خطأ أثناء الحصول على جهات الاتصال'
            });
        }
    } catch (error) {
        console.error('خطأ في الحصول على جهات اتصال الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على جهات اتصال الجهاز'
        });
    }
}

/**
 * تسجيل الخروج من كل الأجهزة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function logoutAllDevices(req, res) {
    try {
        // الحصول على قائمة معرفات العملاء المتصلين
        const connectedClientIds = Object.keys(clients);

        if (connectedClientIds.length === 0) {
            return res.json({
                status: true,
                message: 'لا توجد أجهزة متصلة للخروج منها'
            });
        }

        // قائمة الوعود لتسجيل الخروج من كل العملاء
        const logoutPromises = connectedClientIds.map(async (deviceId) => {
            if (clients[deviceId] && clients[deviceId].client) {
                try {
                    await clients[deviceId].client.logout();
                    await clients[deviceId].client.destroy();

                    // تحديث الحالة
                    clients[deviceId].status = 'disconnected';
                    clients[deviceId].qr = null;

                    // تحديث حالة الجهاز في الملف
                    updateDeviceStatus(deviceId, 'disconnected');

                    // إرسال إشعار Socket.IO
                    if (req.io) {
                        req.io.emit(`disconnected:${deviceId}`, 'تم تسجيل الخروج من الجهاز');
                        req.io.emit('device_status_update', {
                            id: deviceId,
                            status: 'disconnected'
                        });
                    }

                    return {
                        id: deviceId,
                        success: true
                    };
                } catch (error) {
                    console.error(`خطأ في تسجيل الخروج من الجهاز (${deviceId}):`, error);
                    return {
                        id: deviceId,
                        success: false,
                        error: error.message
                    };
                }
            }
            return {
                id: deviceId,
                success: false,
                error: 'العميل غير موجود'
            };
        });

        // انتظار انتهاء كل عمليات تسجيل الخروج
        const results = await Promise.all(logoutPromises);

        // إرسال إشعار Socket.IO عام
        if (req.io) {
            req.io.emit('disconnected', 'تم تسجيل الخروج من كل الأجهزة');
        }

        res.json({
            status: true,
            message: `تم تسجيل الخروج من ${results.filter(r => r.success).length} جهاز`,
            data: results
        });
    } catch (error) {
        console.error('خطأ في تسجيل الخروج من كل الأجهزة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء تسجيل الخروج'
        });
    }
}

/**
 * الحصول على معلومات جهاز واحد
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getDeviceInfo(req, res) {
    try {
        const { deviceId } = req.params;

        if (!deviceId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز مطلوب'
            });
        }

        // قراءة ملف الأجهزة
        const devices = fs.existsSync(CONFIG.DEVICES_FILE)
            ? JSON.parse(fs.readFileSync(CONFIG.DEVICES_FILE, 'utf8'))
            : [];

        // البحث عن الجهاز
        const device = devices.find(device => device.id === deviceId);

        if (!device) {
            return res.status(404).json({
                status: false,
                message: 'الجهاز غير موجود'
            });
        }

        // تحديث معلومات حالة الجهاز من الذاكرة
        let deviceInfo = { ...device };
        if (clients[deviceId]) {
            deviceInfo.currentStatus = clients[deviceId].status;
            deviceInfo.qr = clients[deviceId].qr;
            deviceInfo.info = clients[deviceId].info;
        }

        res.json({
            status: true,
            data: deviceInfo
        });
    } catch (error) {
        console.error('خطأ في الحصول على معلومات الجهاز:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على معلومات الجهاز'
        });
    }
}

/**
 * الحصول على جميع المحادثات لجهاز معين
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChats(req, res) {
    try {
        const { deviceId } = req.query;

        // إذا تم تحديد معرف الجهاز، نحضر محادثات هذا الجهاز فقط
        if (deviceId) {
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

            const chats = await client.client.getChats();

            res.json({
                status: true,
                data: chats.map(chat => ({
                    id: chat.id._serialized,
                    name: chat.name,
                    isGroup: chat.isGroup,
                    unreadCount: chat.unreadCount,
                    timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null,
                    pinned: chat.pinned,
                    muteExpiration: chat.muteExpiration,
                    archived: chat.archived
                }))
            });
            return;
        }

        // إذا لم يتم تحديد معرف الجهاز، نحضر محادثات جميع الأجهزة المتصلة
        const allChats = {};

        for (const [id, client] of Object.entries(clients)) {
            // تعديل للتحقق من كلا الحالتين: authenticated و connected
            if (client && client.client && (client.status === 'authenticated' || client.status === 'connected')) {
                try {
                    const deviceChats = await client.client.getChats();

                    allChats[id] = deviceChats.map(chat => ({
                        id: chat.id._serialized,
                        name: chat.name,
                        isGroup: chat.isGroup,
                        unreadCount: chat.unreadCount,
                        timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null,
                        pinned: chat.pinned,
                        muteExpiration: chat.muteExpiration,
                        archived: chat.archived
                    }));
                } catch (err) {
                    console.error(`خطأ في الحصول على محادثات الجهاز ${id}:`, err);
                    allChats[id] = { error: err.message };
                }
            }
        }

        res.json({
            status: true,
            data: allChats
        });
    } catch (error) {
        console.error('خطأ في الحصول على المحادثات:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على المحادثات'
        });
    }
}

/**
 * الحصول على جهات الاتصال لجهاز معين
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getContacts(req, res) {
    try {
        const { deviceId } = req.query;

        // إذا تم تحديد معرف الجهاز، نحضر جهات اتصال هذا الجهاز فقط
        if (deviceId) {
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

            const contacts = await client.client.getContacts();

            res.json({
                status: true,
                data: contacts.map(contact => ({
                    id: contact.id._serialized,
                    name: contact.name,
                    pushname: contact.pushname,
                    number: contact.number || contact.id.user,
                    isGroup: contact.isGroup,
                    isWAContact: contact.isWAContact,
                    isMyContact: contact.isMyContact
                }))
            });
            return;
        }

        // إذا لم يتم تحديد معرف الجهاز، نحضر جهات اتصال جميع الأجهزة المتصلة
        const allContacts = {};

        for (const [id, client] of Object.entries(clients)) {
            // تعديل للتحقق من كلا الحالتين: authenticated و connected
            if (client && client.client && (client.status === 'authenticated' || client.status === 'connected')) {
                try {
                    const deviceContacts = await client.client.getContacts();

                    allContacts[id] = deviceContacts.map(contact => ({
                        id: contact.id._serialized,
                        name: contact.name,
                        pushname: contact.pushname,
                        number: contact.number || contact.id.user,
                        isGroup: contact.isGroup,
                        isWAContact: contact.isWAContact,
                        isMyContact: contact.isMyContact
                    }));
                } catch (err) {
                    console.error(`خطأ في الحصول على جهات اتصال الجهاز ${id}:`, err);
                    allContacts[id] = { error: err.message };
                }
            }
        }

        res.json({
            status: true,
            data: allContacts
        });
    } catch (error) {
        console.error('خطأ في الحصول على جهات الاتصال:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على جهات الاتصال'
        });
    }
}

/**
 * الحصول على معلومات محادثة محددة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChatInfo(req, res) {
    try {
        const { deviceId } = req.query;
        const { chatId } = req.params;

        if (!deviceId || !chatId) {
            return res.status(400).json({
                status: false,
                message: 'معرف الجهاز والمحادثة مطلوبان'
            });
        }

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

        const chat = await client.client.getChatById(chatId);
        if (!chat) {
            return res.status(404).json({
                status: false,
                message: 'لم يتم العثور على المحادثة'
            });
        }

        res.json({
            status: true,
            data: {
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                unreadCount: chat.unreadCount,
                timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null,
                pinned: chat.pinned,
                muteExpiration: chat.muteExpiration,
                archived: chat.archived,
                participants: chat.isGroup ? await chat.participants.map(p => p.id._serialized) : []
            }
        });
    } catch (error) {
        console.error('خطأ في الحصول على معلومات المحادثة:', error);
        res.status(500).json({
            status: false,
            message: 'حدث خطأ أثناء الحصول على معلومات المحادثة'
        });
    }
}

// تصدير الوظائف
module.exports = {
    getAllDevices,
    addDevice,
    updateDevice,
    deleteDevice,
    connectDevice,
    disconnectDevice,
    deleteAllSessions,
    getDeviceQR,
    getDeviceChats,
    getDeviceContacts,
    logoutAllDevices,
    getDeviceInfo,
    getChats,
    getContacts,
    getChatInfo
};