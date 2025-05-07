const socketIO = require('socket.io');
const { clients } = require('../services/whatsappClient');

function configureSocket(server) {
    // تكوين Socket.IO مع إعدادات محسنة للاتصال
    const io = socketIO(server, {
        pingTimeout: 60000, // زيادة مهلة انتظار الاستجابة للـ ping
        pingInterval: 25000, // تعيين فاصل زمني معقول للـ ping
        connectTimeout: 60000, // زيادة مهلة الاتصال
        // تمكين استعادة حالة الاتصال
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000, // السماح بإعادة الاتصال خلال دقيقتين
        }
    });

    // إعداد أحداث Socket.IO
    io.on('connection', (socket) => {
        console.log('اتصال جديد بـ Socket.IO:', socket.id);

        // إرسال حالة الأجهزة المتصلة عند الاتصال
        Object.keys(clients).forEach(deviceId => {
            if (clients[deviceId]) {
                // إرسال حالة الجهاز
                socket.emit(`device_status_update`, {
                    id: deviceId,
                    status: clients[deviceId].status,
                    info: clients[deviceId].info
                });

                // إرسال رمز QR إذا كان متاحاً
                if (clients[deviceId].qr) {
                    socket.emit(`qr:${deviceId}`, clients[deviceId].qr);
                    socket.emit('qr', clients[deviceId].qr); // للتوافقية مع الواجهة القديمة
                }

                // إرسال حالة المصادقة إذا كان الجهاز متصل
                if ((clients[deviceId].status === 'authenticated' || clients[deviceId].status === 'connected') && clients[deviceId].info) {
                    socket.emit(`authenticated:${deviceId}`, clients[deviceId].info);
                    socket.emit(`connected:${deviceId}`, clients[deviceId].info);
                    socket.emit('authenticated', clients[deviceId].info); // للتوافقية مع الواجهة القديمة
                    socket.emit('connected', clients[deviceId].info); // للتوافقية مع الواجهة القديمة
                }
            }
        });

        // معالجة فصل الاتصال
        socket.on('disconnect', () => {
            console.log('انقطاع اتصال Socket.IO:', socket.id);
        });
    });

    return io;
}

module.exports = configureSocket;
