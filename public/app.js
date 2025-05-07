// تهيئة اتصال Socket.io - تعديل هذا العنوان ليكون عنوان خادمك المكشوف للإنترنت
const serverUrl = 'http://your-server-address:3000'; // غيّر هذا إلى عنوان خادمك الحقيقي
const socket = io(serverUrl);

// عناصر الصفحة
const statusElement = document.getElementById('status');
const qrcodeContainer = document.getElementById('qrcode-container');
const qrcodeElement = document.getElementById('qrcode');
const clientInfoElement = document.getElementById('client-info');
const profileNameElement = document.getElementById('profile-name');
const profileNumberElement = document.getElementById('profile-number');
const logoutButton = document.getElementById('logout-btn');
const messageForm = document.getElementById('message-form');
const phoneNumberInput = document.getElementById('phone-number');
const messageTextInput = document.getElementById('message-text');
const sendButton = document.getElementById('send-btn');
const sendStatusElement = document.getElementById('send-status');
const logContent = document.getElementById('log-content');

// إضافة سجل في سجل الأحداث
function addLog(message, type = 'info') {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timeString}] ${message}`;
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// تحديث حالة الاتصال
function updateStatus(status, type = 'warning') {
    statusElement.className = `alert alert-${type}`;
    statusElement.textContent = status;
    addLog(status, type === 'success' ? 'info' : type);
}

// عند الاتصال
socket.on('connect', () => {
    updateStatus('متصل بالخادم، في انتظار تهيئة واتساب...', 'info');
    addLog('تم الاتصال بالخادم');
});

// عند قطع الاتصال
socket.on('disconnect', () => {
    updateStatus('انقطع الاتصال بالخادم', 'danger');
    sendButton.disabled = true;
    qrcodeContainer.classList.remove('d-none');
    clientInfoElement.classList.add('d-none');
    logoutButton.classList.add('d-none');
    addLog('انقطع الاتصال بالخادم', 'error');
});

// استقبال رمز QR
socket.on('qr', (qrImage) => {
    qrcodeElement.innerHTML = `<img src="${qrImage}" alt="رمز QR">`;
    qrcodeContainer.classList.remove('d-none');
    clientInfoElement.classList.add('d-none');
    logoutButton.classList.add('d-none');
    updateStatus('امسح رمز QR باستخدام تطبيق واتساب على هاتفك', 'warning');
    addLog('تم توليد رمز QR جديد', 'info');
});

// عند المصادقة
socket.on('authenticated', (info) => {
    updateStatus('تم تسجيل الدخول بنجاح!', 'success');
    qrcodeContainer.classList.add('d-none');
    clientInfoElement.classList.remove('d-none');
    logoutButton.classList.remove('d-none');
    sendButton.disabled = false;
    
    if (info && info.wid) {
        const phoneNumber = info.wid.replace('@c.us', '');
        profileNumberElement.textContent = phoneNumber;
        addLog(`تم تسجيل الدخول برقم الهاتف: ${phoneNumber}`, 'info');
    }
    
    if (info && info.pushname) {
        profileNameElement.textContent = info.pushname;
        addLog(`تم تسجيل الدخول باسم: ${info.pushname}`, 'info');
    }
});

// عند فشل المصادقة
socket.on('auth_failure', (message) => {
    updateStatus(`فشل في المصادقة: ${message}`, 'danger');
    qrcodeContainer.classList.remove('d-none');
    clientInfoElement.classList.add('d-none');
    logoutButton.classList.add('d-none');
    sendButton.disabled = true;
    addLog(`فشل في المصادقة: ${message}`, 'error');
});

// عند انقطاع الاتصال
socket.on('disconnected', (reason) => {
    updateStatus(`تم قطع الاتصال: ${reason}`, 'warning');
    qrcodeContainer.classList.remove('d-none');
    clientInfoElement.classList.add('d-none');
    logoutButton.classList.add('d-none');
    sendButton.disabled = true;
    addLog(`تم قطع الاتصال: ${reason}`, 'warning');
});

// معالجة إرسال الرسالة
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneNumber = phoneNumberInput.value.trim();
    const messageText = messageTextInput.value.trim();
    
    if (!phoneNumber || !messageText) {
        showSendStatus('يرجى ملء جميع الحقول المطلوبة', 'danger');
        return;
    }
    
    // تعطيل زر الإرسال أثناء المعالجة
    sendButton.disabled = true;
    sendButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> جارٍ الإرسال...';
    
    try {
        addLog(`جار إرسال رسالة إلى الرقم: ${phoneNumber}`, 'info');
        
        const response = await fetch(`${serverUrl}/api/messages/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ number: phoneNumber, message: messageText })
        });
        
        const result = await response.json();
        
        if (result.status) {
            showSendStatus(`تم إرسال الرسالة بنجاح!`, 'success');
            messageTextInput.value = '';
            addLog(`تم إرسال الرسالة بنجاح إلى الرقم: ${phoneNumber}`, 'info');
        } else {
            showSendStatus(`فشل في إرسال الرسالة: ${result.message}`, 'danger');
            addLog(`فشل في إرسال الرسالة: ${result.message}`, 'error');
        }
    } catch (error) {
        showSendStatus(`خطأ: ${error.message}`, 'danger');
        addLog(`خطأ في إرسال الرسالة: ${error.message}`, 'error');
    } finally {
        // إعادة تمكين زر الإرسال
        sendButton.disabled = false;
        sendButton.textContent = 'إرسال الرسالة';
    }
});

// عرض حالة إرسال الرسالة
function showSendStatus(message, type = 'info') {
    sendStatusElement.className = `alert alert-${type}`;
    sendStatusElement.textContent = message;
    sendStatusElement.classList.remove('d-none');
    
    // إخفاء الرسالة بعد 5 ثوانٍ
    setTimeout(() => {
        sendStatusElement.classList.add('d-none');
    }, 5000);
}

// معالجة زر تسجيل الخروج
logoutButton.addEventListener('click', async () => {
    try {
        const response = await fetch(`${serverUrl}/logout`, {
            method: 'POST'
        });
        
        if (response.ok) {
            updateStatus('تم تسجيل الخروج بنجاح، في انتظار رمز QR جديد...', 'warning');
            qrcodeContainer.classList.remove('d-none');
            clientInfoElement.classList.add('d-none');
            logoutButton.classList.add('d-none');
            sendButton.disabled = true;
            addLog('تم تسجيل الخروج بنجاح', 'info');
        } else {
            addLog('فشل في تسجيل الخروج', 'error');
        }
    } catch (error) {
        addLog(`خطأ في تسجيل الخروج: ${error.message}`, 'error');
    }
});

// إضافة سجل بدء التشغيل
addLog('تم تحميل التطبيق', 'info');