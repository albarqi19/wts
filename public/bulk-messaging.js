/**
 * bulk-messaging.js
 * ملف JavaScript خاص بصفحة الإرسال الجماعي
 */

// القائمة العامة للمستلمين
const recipients = [];
let currentDeviceId = null;
let bulkJobId = null;
let statusCheckInterval = null;

// عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // تحميل الأجهزة المتاحة
    loadDevices();
    
    // ربط الأحداث بالأزرار والعناصر
    setupEventListeners();
    
    // إخفاء خيارات النص مع الصورة في البداية إذا لم يكن هناك رابط صورة
    toggleMediaTextOptions();
});

/**
 * تحميل الأجهزة المتاحة
 */
async function loadDevices() {
    try {
        const response = await fetch('/api/devices');
        const data = await response.json();
        
        if (data.status && data.data.length > 0) {
            const deviceSelect = document.getElementById('deviceSelect');
            deviceSelect.innerHTML = '<option value="">اختر جهازاً...</option>';
            
            data.data.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name || device.id} (${device.status})`;
                deviceSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('حدث خطأ في تحميل الأجهزة:', error);
        showAlert('حدث خطأ في تحميل الأجهزة', 'danger');
    }
}

/**
 * إعداد مستمعي الأحداث
 */
function setupEventListeners() {
    // حدث تغيير الجهاز
    document.getElementById('deviceSelect').addEventListener('change', onDeviceChange);
    
    // أحداث إضافة المستلمين
    document.getElementById('addManualNumbers').addEventListener('click', addManualNumbers);
    document.getElementById('excelFile').addEventListener('change', handleExcelFileUpload);
    document.getElementById('importExcelBtn').addEventListener('click', importFromExcel);
    document.getElementById('clearRecipients').addEventListener('click', clearRecipients);
    
    // أحداث تحديث معاينة الرسالة
    document.getElementById('messageTemplate').addEventListener('input', updateMessagePreview);
    document.getElementById('mediaUrl').addEventListener('input', function() {
        updateMessagePreview();
        toggleMediaTextOptions();
    });
    
    // أحداث تغيير خيارات النص مع الصورة
    document.getElementsByName('mediaTextOption').forEach(radio => {
        radio.addEventListener('change', updateMessagePreview);
    });
    
    // حدث تغيير التأخير بين الرسائل
    document.getElementById('delaySlider').addEventListener('input', updateDelayValue);
    
    // حدث إرسال الرسائل
    document.getElementById('sendBulkMessages').addEventListener('click', startBulkMessaging);
}

/**
 * إظهار/إخفاء خيارات النص مع الصورة
 */
function toggleMediaTextOptions() {
    const mediaUrl = document.getElementById('mediaUrl').value.trim();
    const optionsContainer = document.getElementById('mediaTextOptionsContainer');
    
    if (mediaUrl) {
        optionsContainer.style.display = 'block';
    } else {
        optionsContainer.style.display = 'none';
    }
}

/**
 * معالجة حدث تغيير الجهاز
 */
async function onDeviceChange(event) {
    const deviceId = event.target.value;
    currentDeviceId = deviceId;
    
    if (!deviceId) {
        document.getElementById('deviceStatus').innerHTML = '';
        document.getElementById('sendBulkMessages').disabled = true;
        return;
    }
    
    try {
        const response = await fetch(`/api/devices/${deviceId}`);
        const data = await response.json();
        
        if (data.status) {
            const device = data.data;
            let statusHtml = '';
            
            if (device.status === 'authenticated') {
                statusHtml = `
                    <div class="alert alert-success">
                        <i class="bi bi-check-circle"></i> الجهاز متصل ومستعد للإرسال
                    </div>`;
                // تمكين زر الإرسال إذا كان هناك مستلمين
                document.getElementById('sendBulkMessages').disabled = recipients.length === 0;
            } else {
                statusHtml = `
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle"></i> الجهاز غير متصل. قم بتسجيل الدخول من صفحة الأجهزة أولاً.
                    </div>`;
                document.getElementById('sendBulkMessages').disabled = true;
            }
            
            document.getElementById('deviceStatus').innerHTML = statusHtml;
        }
    } catch (error) {
        console.error('حدث خطأ في تحميل معلومات الجهاز:', error);
        document.getElementById('deviceStatus').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-circle"></i> حدث خطأ في تحميل معلومات الجهاز
            </div>`;
        document.getElementById('sendBulkMessages').disabled = true;
    }
    
    updateSendButtonState();
}

/**
 * إضافة أرقام يدوياً
 */
function addManualNumbers() {
    const numbersText = document.getElementById('manualNumbers').value.trim();
    const namePrefix = document.getElementById('namePrefix').value.trim();
    
    if (!numbersText) {
        showAlert('الرجاء إدخال أرقام هواتف', 'warning');
        return;
    }
    
    // تقسيم الأرقام حسب السطور
    const numbers = numbersText.split('\n').filter(n => n.trim());
    
    if (numbers.length === 0) {
        showAlert('لم يتم العثور على أرقام صالحة', 'warning');
        return;
    }
    
    // إضافة كل رقم كمستلم
    numbers.forEach((number, index) => {
        const cleanNumber = number.trim().replace(/\D+/g, '');
        
        if (cleanNumber) {
            const recipient = {
                phoneNumber: cleanNumber,
                name: namePrefix ? `${namePrefix} ${index + 1}` : '',
            };
            
            // التحقق من عدم وجود الرقم مسبقاً
            if (!recipients.some(r => r.phoneNumber === recipient.phoneNumber)) {
                recipients.push(recipient);
            }
        }
    });
    
    // تحديث قائمة المستلمين
    updateRecipientsList();
    
    // إعادة تعيين الحقول
    document.getElementById('manualNumbers').value = '';
    
    showAlert(`تمت إضافة ${numbers.length} من الأرقام بنجاح`, 'success');
    updateSendButtonState();
}

/**
 * معالجة تحميل ملف Excel
 */
function handleExcelFileUpload(event) {
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // التحقق من وجود بيانات
            if (jsonData.length < 2) { // الصف الأول للعناوين والباقي للبيانات
                showAlert('الملف لا يحتوي على بيانات كافية', 'warning');
                return;
            }
            
            // الحصول على أسماء الأعمدة
            const headers = jsonData[0];
            
            // عرض اختيارات الأعمدة
            const phoneColumnSelect = document.getElementById('phoneColumn');
            const nameColumnSelect = document.getElementById('nameColumn');
            
            phoneColumnSelect.innerHTML = '';
            nameColumnSelect.innerHTML = '<option value="">-- لا يوجد --</option>';
            
            headers.forEach((header, index) => {
                const phoneOption = document.createElement('option');
                phoneOption.value = index;
                phoneOption.textContent = header || `عمود ${index + 1}`;
                phoneColumnSelect.appendChild(phoneOption);
                
                const nameOption = document.createElement('option');
                nameOption.value = index;
                nameOption.textContent = header || `عمود ${index + 1}`;
                nameColumnSelect.appendChild(nameOption);
            });
            
            // عرض قسم اختيار الأعمدة
            document.getElementById('excelColumnsContainer').classList.remove('d-none');
            document.getElementById('importExcelBtn').disabled = false;
            
            // تخزين البيانات في متغير عام للاستخدام لاحقاً
            window.excelData = jsonData;
            
        } catch (error) {
            console.error('حدث خطأ في قراءة ملف Excel:', error);
            showAlert('حدث خطأ في قراءة الملف', 'danger');
        }
    };
    
    reader.onerror = function(error) {
        console.error('حدث خطأ في قراءة الملف:', error);
        showAlert('حدث خطأ في قراءة الملف', 'danger');
    };
    
    reader.readAsBinaryString(file);
}

/**
 * استيراد البيانات من Excel
 */
function importFromExcel() {
    if (!window.excelData || window.excelData.length < 2) {
        showAlert('لا توجد بيانات للاستيراد', 'warning');
        return;
    }
    
    const phoneColumnIndex = parseInt(document.getElementById('phoneColumn').value, 10);
    const nameColumnIndex = document.getElementById('nameColumn').value !== '' 
        ? parseInt(document.getElementById('nameColumn').value, 10) 
        : null;
    
    // التحقق من اختيار عمود الهاتف
    if (isNaN(phoneColumnIndex)) {
        showAlert('الرجاء اختيار عمود رقم الهاتف', 'warning');
        return;
    }
    
    // الحصول على أسماء الأعمدة
    const headers = window.excelData[0];
    
    // استيراد بيانات المستلمين (بدءًا من الصف الثاني)
    for (let i = 1; i < window.excelData.length; i++) {
        const row = window.excelData[i];
        
        if (!row[phoneColumnIndex]) {
            continue; // تخطي الصفوف بدون رقم هاتف
        }
        
        // معالجة رقم الهاتف
        const cleanNumber = row[phoneColumnIndex].toString().trim().replace(/\D+/g, '');
        
        if (!cleanNumber) {
            continue; // تخطي الأرقام غير الصالحة
        }
        
        // إنشاء كائن المستلم
        const recipient = {
            phoneNumber: cleanNumber,
            name: nameColumnIndex !== null && row[nameColumnIndex] ? row[nameColumnIndex].toString() : '',
        };
        
        // إضافة جميع البيانات الإضافية من الصف
        for (let j = 0; j < headers.length; j++) {
            if (j !== phoneColumnIndex && j !== nameColumnIndex && headers[j]) {
                recipient[headers[j]] = row[j] !== undefined ? row[j].toString() : '';
            }
        }
        
        // التحقق من عدم وجود الرقم مسبقاً
        if (!recipients.some(r => r.phoneNumber === recipient.phoneNumber)) {
            recipients.push(recipient);
        }
    }
    
    // تحديث قائمة المستلمين
    updateRecipientsList();
    
    // إعادة تعيين الحقول
    document.getElementById('excelFile').value = '';
    document.getElementById('excelColumnsContainer').classList.add('d-none');
    document.getElementById('importExcelBtn').disabled = true;
    
    showAlert(`تمت إضافة ${window.excelData.length - 1} من المستلمين بنجاح`, 'success');
    updateSendButtonState();
}

/**
 * تحديث قائمة المستلمين في واجهة المستخدم
 */
function updateRecipientsList() {
    const recipientsList = document.getElementById('recipientsList');
    const recipientsCount = document.getElementById('recipientsCount');
    
    recipientsList.innerHTML = '';
    recipientsCount.textContent = recipients.length;
    
    recipients.forEach((recipient, index) => {
        const row = document.createElement('tr');
        
        // تجهيز البيانات الإضافية
        const additionalData = Object.keys(recipient)
            .filter(key => key !== 'phoneNumber' && key !== 'name')
            .map(key => `${key}: ${recipient[key]}`)
            .join(', ');
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td dir="ltr">${recipient.phoneNumber}</td>
            <td>${recipient.name || '-'}</td>
            <td>${additionalData || '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger delete-recipient" data-index="${index}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        
        recipientsList.appendChild(row);
    });
    
    // إضافة أحداث لأزرار الحذف
    document.querySelectorAll('.delete-recipient').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('button').dataset.index, 10);
            deleteRecipient(index);
        });
    });
}

/**
 * حذف مستلم من القائمة
 */
function deleteRecipient(index) {
    if (index >= 0 && index < recipients.length) {
        recipients.splice(index, 1);
        updateRecipientsList();
        updateSendButtonState();
    }
}

/**
 * مسح قائمة المستلمين
 */
function clearRecipients() {
    if (recipients.length === 0) return;
    
    if (confirm('هل أنت متأكد من رغبتك في مسح جميع المستلمين؟')) {
        recipients.length = 0; // تفريغ المصفوفة
        updateRecipientsList();
        updateSendButtonState();
    }
}

/**
 * تحديث معاينة الرسالة
 */
function updateMessagePreview() {
    const template = document.getElementById('messageTemplate').value;
    const previewElement = document.getElementById('messagePreview');
    const mediaUrl = document.getElementById('mediaUrl').value.trim();
    const mediaTextOption = document.querySelector('input[name="mediaTextOption"]:checked')?.value;
    
    if (!template && !mediaUrl) {
        previewElement.textContent = 'اكتب نص الرسالة للمعاينة...';
        return;
    }
    
    // إنشاء بيانات نموذجية للمعاينة
    const sampleData = {
        name: 'محمد',
        firstName: 'محمد',
        lastName: 'أحمد',
        date: new Date().toLocaleDateString('ar-SA'),
        time: new Date().toLocaleTimeString('ar-SA'),
        company: 'الشركة النموذجية',
        id: '12345'
    };
    
    // استبدال العناصر في قالب الرسالة
    let previewText = template;
    
    Object.keys(sampleData).forEach(key => {
        const placeholder = new RegExp(`\\{${key}\\}`, 'g');
        previewText = previewText.replace(placeholder, sampleData[key]);
    });
    
    if (mediaUrl) {
        if (mediaTextOption === 'withText') {
            previewText += `\n[صورة: ${mediaUrl}]`;
        } else if (mediaTextOption === 'withoutText') {
            previewText = `[صورة: ${mediaUrl}]`;
        }
    }
    
    previewElement.textContent = previewText;
}

/**
 * تحديث قيمة التأخير بين الرسائل
 */
function updateDelayValue(event) {
    const value = event.target.value;
    document.getElementById('delayValue').textContent = value;
}

/**
 * تحديث حالة زر الإرسال
 */
function updateSendButtonState() {
    const deviceId = currentDeviceId;
    const hasRecipients = recipients.length > 0;
    const hasMessage = document.getElementById('messageTemplate').value.trim() !== '' || document.getElementById('mediaUrl').value.trim() !== '';
    
    document.getElementById('sendBulkMessages').disabled = !deviceId || !hasRecipients || !hasMessage;
}

/**
 * بدء عملية الإرسال الجماعي
 */
async function startBulkMessaging() {
    // التحقق من توفر جميع البيانات المطلوبة
    const deviceId = currentDeviceId;
    const messageTemplate = document.getElementById('messageTemplate').value.trim();
    const mediaUrl = document.getElementById('mediaUrl').value.trim();
    const mediaTextOption = document.querySelector('input[name="mediaTextOption"]:checked')?.value;
    const delaySeconds = parseInt(document.getElementById('delaySlider').value, 10);
    
    if (!deviceId) {
        showAlert('الرجاء اختيار جهاز', 'warning');
        return;
    }
    
    if (recipients.length === 0) {
        showAlert('لا يوجد مستلمين للإرسال', 'warning');
        return;
    }
    
    if (!messageTemplate && !mediaUrl) {
        showAlert('الرجاء كتابة نص الرسالة أو إدخال رابط الصورة', 'warning');
        return;
    }
    
    // عرض قسم حالة الإرسال
    document.getElementById('jobStatusCard').classList.remove('d-none');
    
    // تحديث حقول حالة الإرسال
    document.getElementById('totalMessageCount').textContent = recipients.length;
    document.getElementById('sentMessageCount').textContent = '0';
    document.getElementById('failedMessageCount').textContent = '0';
    document.getElementById('sendingProgress').style.width = '0%';
    document.getElementById('sendingProgress').textContent = '0%';
    document.getElementById('jobStatus').textContent = 'جاري الإرسال...';
    
    // تعطيل زر الإرسال أثناء العملية
    document.getElementById('sendBulkMessages').disabled = true;
    
    // إرسال طلب بدء الإرسال الجماعي
    try {
        const response = await fetch('/api/messages/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                deviceId,
                recipients,
                messageTemplate,
                options: mediaUrl ? { mediaUrl, mediaTextOption } : undefined,
                delayBetweenMessages: delaySeconds * 1000, // تحويل الثواني إلى مللي ثانية
            }),
        });
        
        const data = await response.json();
        
        if (data.status) {
            bulkJobId = data.data.bulkJobId;
            
            // بدء التحقق من حالة المهمة
            startStatusCheck();
            
            showAlert('تم بدء عملية الإرسال بنجاح', 'success');
        } else {
            document.getElementById('jobStatus').textContent = 'حدث خطأ: ' + data.message;
            document.getElementById('jobStatus').classList.add('text-danger');
            document.getElementById('sendBulkMessages').disabled = false;
        }
    } catch (error) {
        console.error('حدث خطأ في بدء الإرسال الجماعي:', error);
        document.getElementById('jobStatus').textContent = 'حدث خطأ في الاتصال بالخادم';
        document.getElementById('jobStatus').classList.add('text-danger');
        document.getElementById('sendBulkMessages').disabled = false;
    }
}

/**
 * بدء التحقق من حالة مهمة الإرسال
 */
function startStatusCheck() {
    // التحقق من التقدم كل 2 ثانية
    statusCheckInterval = setInterval(checkJobStatus, 2000);
}

/**
 * التحقق من حالة مهمة الإرسال
 */
async function checkJobStatus() {
    if (!bulkJobId) return;
    
    try {
        const response = await fetch(`/api/messages/bulk/${bulkJobId}/status`);
        const data = await response.json();
        
        if (data.status) {
            const jobStatus = data.data;
            
            // تحديث شريط التقدم
            const progressPercent = jobStatus.progress || 0;
            document.getElementById('sendingProgress').style.width = `${progressPercent}%`;
            document.getElementById('sendingProgress').textContent = `${progressPercent}%`;
            
            // تحديث العدادات
            document.getElementById('sentMessageCount').textContent = jobStatus.sentMessages;
            document.getElementById('failedMessageCount').textContent = jobStatus.failedMessages;
            
            // التحقق من اكتمال المهمة
            if (jobStatus.status === 'completed' || jobStatus.status === 'error') {
                // وقف التحقق من الحالة
                clearInterval(statusCheckInterval);
                
                // تحديث حالة المهمة
                if (jobStatus.status === 'completed') {
                    document.getElementById('jobStatus').textContent = 'اكتمل الإرسال';
                    document.getElementById('jobStatus').classList.add('text-success');
                    showAlert('تم إرسال الرسائل بنجاح', 'success');
                } else {
                    document.getElementById('jobStatus').textContent = 'حدث خطأ: ' + (jobStatus.error || 'خطأ غير معروف');
                    document.getElementById('jobStatus').classList.add('text-danger');
                    showAlert('حدث خطأ أثناء الإرسال', 'danger');
                }
                
                // إعادة تفعيل زر الإرسال
                document.getElementById('sendBulkMessages').disabled = false;
            }
        }
    } catch (error) {
        console.error('حدث خطأ في التحقق من حالة المهمة:', error);
        // لا نوقف التحقق في حالة الخطأ، سنحاول مرة أخرى
    }
}

/**
 * عرض تنبيه للمستخدم
 * @param {string} message - نص الرسالة
 * @param {string} type - نوع التنبيه (success, warning, danger)
 */
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // إزالة التنبيه تلقائياً بعد 5 ثواني
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
}