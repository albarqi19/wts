// ملف integration.js
// تهيئة المتغيرات العامة
let devices = [];
let integrations = [];

// وظيفة عرض تنبيه للمستخدم
function showAlert(message, type = 'info', duration = 5000) {
    // إزالة التنبيهات السابقة
    const existingAlerts = document.querySelectorAll('.alert-container');
    existingAlerts.forEach(alert => alert.remove());
    
    // إنشاء التنبيه
    const alertContainer = document.createElement('div');
    alertContainer.className = 'alert-container position-fixed top-0 start-50 translate-middle-x p-3';
    alertContainer.style.zIndex = '1050';
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="إغلاق"></button>
    `;
    
    alertContainer.appendChild(alert);
    document.body.appendChild(alertContainer);
    
    // إزالة التنبيه بعد مدة معينة
    if (duration > 0) {
        setTimeout(() => {
            if (alertContainer) {
                alertContainer.remove();
            }
        }, duration);
    }
}

// وظيفة تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // عناصر DOM الرئيسية
    const integrationsList = document.getElementById('integrationsList');
    const integrationType = document.getElementById('integrationType');
    const integrationForm = document.getElementById('integrationForm');
    const saveIntegrationBtn = document.getElementById('saveIntegration');
    const deleteIntegrationBtn = document.getElementById('deleteIntegration');
    const runIntegrationNowBtn = document.getElementById('runIntegrationNow');

    // تحميل الأجهزة والتكاملات
    loadDevices();
    loadIntegrations();

    // إضافة معالجات الأحداث
    integrationType.addEventListener('change', showIntegrationFields);
    saveIntegrationBtn.addEventListener('click', saveIntegration);
    deleteIntegrationBtn.addEventListener('click', deleteIntegration);
    runIntegrationNowBtn.addEventListener('click', runIntegrationNow);

    // معالجات أحداث خاصة بالتكامل ثنائي الاتجاه
    document.getElementById('enableReceiveData').addEventListener('change', toggleReceiveDataSection);
    document.getElementById('generateToken').addEventListener('click', generateRandomToken);
    document.getElementById('generateSecret').addEventListener('click', generateRandomSecret);

    // تحديث عنوان URL الذي سيستقبل البيانات عند تغيير التوكن
    document.getElementById('webhookToken').addEventListener('input', updateReceiveUrl);
});

// وظيفة إظهار حقول التكامل المناسبة حسب النوع
function showIntegrationFields() {
    // إخفاء جميع الحقول
    document.querySelectorAll('.integration-fields').forEach(field => {
        field.classList.add('d-none');
    });

    // إظهار الحقول المناسبة للنوع المحدد
    const integrationType = document.getElementById('integrationType').value;
    if (integrationType) {
        // تعيين معرف العنصر بشكل صحيح بناءً على نوع التكامل
        let fieldsElementId;
        
        // تعامل خاص مع google_sheets لمطابقته مع معرف العنصر googleSheetsFields
        if (integrationType === 'google_sheets') {
            fieldsElementId = 'googleSheetsFields';
        } else {
            fieldsElementId = `${integrationType}Fields`;
        }
        
        const fieldsElement = document.getElementById(fieldsElementId);
        if (fieldsElement) {
            fieldsElement.classList.remove('d-none');
            console.log(`تم عرض حقول التكامل لـ ${integrationType} (عنصر: ${fieldsElementId})`);
        } else {
            console.warn(`لم يتم العثور على عنصر بمعرف ${fieldsElementId}`);
        }
    }
    
    // إذا كان نوع التكامل هو webhook، تحديث عنوان URL لاستقبال البيانات
    if (integrationType === 'webhook') {
        updateReceiveUrl();
    }
}

// وظيفة إظهار/إخفاء قسم استقبال البيانات
function toggleReceiveDataSection() {
    const isEnabled = document.getElementById('enableReceiveData').checked;
    const receiveDataSection = document.getElementById('receiveDataSection');
    
    if (isEnabled) {
        receiveDataSection.style.display = 'block';
        // إنشاء توكن تلقائي إذا كان الحقل فارغاً
        if (!document.getElementById('webhookToken').value) {
            generateRandomToken();
        }
    } else {
        receiveDataSection.style.display = 'none';
    }
    
    // تحديث عنوان URL
    updateReceiveUrl();
}

// وظيفة إنشاء توكن عشوائي
function generateRandomToken() {
    const token = generateRandomString(32);
    document.getElementById('webhookToken').value = token;
    updateReceiveUrl();
}

// وظيفة إنشاء مفتاح سري عشوائي
function generateRandomSecret() {
    const secret = generateRandomString(64);
    document.getElementById('webhookSecret').value = secret;
}

// وظيفة إنشاء نص عشوائي
function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// وظيفة تحديث عنوان URL لاستقبال البيانات
function updateReceiveUrl() {
    const token = document.getElementById('webhookToken').value || '{token}';
    const baseUrl = window.location.origin; // سيتم استخدام عنوان الخادم الحالي
    const receiveUrl = `${baseUrl}/api/webhook/${token}`;
    
    document.getElementById('webhookReceiveUrl').textContent = receiveUrl;
}

// وظيفة تحميل الأجهزة من الخادم
function loadDevices() {
    fetch('/api/devices')
        .then(response => response.json())
        .then(response => {
            // الأجهزة قد تكون في شكل {status: true, data: Array} أو مباشرة كمصفوفة
            let data;
            
            if (response && response.status === true && Array.isArray(response.data)) {
                // الشكل {status: true, data: Array}
                console.log('تم استلام بيانات الأجهزة بنجاح:', response.data.length);
                data = response.data;
            } else if (Array.isArray(response)) {
                // الشكل مباشرة كمصفوفة
                data = response;
            } else {
                // في حالة وجود هيكل آخر غير متوقع
                console.warn('تنسيق بيانات الأجهزة غير متوقع:', response);
                data = [];
                showAlert('تنسيق بيانات الأجهزة غير صحيح', 'warning');
                return;
            }
            
            // تصفية الأجهزة النشطة فقط
            devices = data.filter(d => d.active);
            console.log(`تم تحميل ${devices.length} جهاز نشط`);
            
            // تعبئة قوائم الأجهزة في النماذج
            populateDeviceSelect('deviceId', devices);
            populateDeviceSelect('webhookDeviceId', devices);
            populateDeviceSelect('crmDeviceId', devices);
            populateDeviceSelect('emailDeviceId', devices);
            populateDeviceSelect('aiDeviceId', devices);
        })
        .catch(error => {
            console.error('خطأ في تحميل الأجهزة:', error);
            showAlert('خطأ في تحميل الأجهزة', 'danger');
        });
}

// وظيفة تعبئة قوائم الأجهزة
function populateDeviceSelect(selectId, devices) {
    const select = document.getElementById(selectId);
    
    // إضافة خيار افتراضي
    select.innerHTML = '<option value="" selected disabled>اختر الجهاز</option>';
    
    // إضافة الأجهزة
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name;
        select.appendChild(option);
    });
}

// وظيفة تحميل التكاملات من الخادم
function loadIntegrations() {
    fetch('/api/integrations')
        .then(response => response.json())
        .then(data => {
            integrations = data;
            displayIntegrations(integrations);
        })
        .catch(error => {
            console.error('خطأ في تحميل التكاملات:', error);
            showAlert('خطأ في تحميل التكاملات', 'danger');
        });
}

// وظيفة عرض التكاملات في الواجهة
function displayIntegrations(integrations) {
    const container = document.getElementById('integrationsList');
    
    // إخفاء مؤشر التحميل
    container.querySelector('.loading-indicator').classList.add('d-none');
    
    // التحقق من وجود تكاملات
    if (integrations.length === 0) {
        container.querySelector('.no-data-message').classList.remove('d-none');
        return;
    }
    
    // إنشاء بطاقات للتكاملات
    const cards = document.createElement('div');
    cards.className = 'row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4';
    
    integrations.forEach(integration => {
        const card = createIntegrationCard(integration);
        cards.appendChild(card);
    });
    
    container.appendChild(cards);
}

// وظيفة إنشاء بطاقة تكامل
function createIntegrationCard(integration) {
    // إنشاء عناصر البطاقة
    const col = document.createElement('div');
    col.className = 'col';
    
    const card = document.createElement('div');
    card.className = `card h-100 ${integration.active ? 'border-success' : 'border-secondary'}`;
    
    const cardHeader = document.createElement('div');
    cardHeader.className = `card-header d-flex justify-content-between ${integration.active ? 'bg-success bg-opacity-25' : 'bg-secondary bg-opacity-25'}`;
    
    const title = document.createElement('h5');
    title.className = 'card-title mb-0';
    title.textContent = integration.name;
    
    // إضافة رمز حسب نوع التكامل
    let icon;
    switch(integration.type) {
        case 'google_sheets':
            icon = 'bi-file-earmark-spreadsheet';
            break;
        case 'webhook':
            icon = 'bi-link-45deg';
            break;
        case 'crm':
            icon = 'bi-people';
            break;
        case 'email':
            icon = 'bi-envelope';
            break;
        case 'ai':
            icon = 'bi-robot';
            break;
        default:
            icon = 'bi-gear';
    }
    
    // إضافة العناصر إلى البطاقة
    title.innerHTML = `<i class="bi ${icon} me-2"></i> ${integration.name}`;
    
    const statusBadge = document.createElement('span');
    statusBadge.className = `badge ${integration.active ? 'bg-success' : 'bg-secondary'}`;
    statusBadge.textContent = integration.active ? 'نشط' : 'معطل';
    
    cardHeader.appendChild(title);
    cardHeader.appendChild(statusBadge);
    
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // معلومات أساسية
    cardBody.innerHTML = `
        <p class="card-text">
            <strong>النوع:</strong> ${getIntegrationTypeName(integration.type)}<br>
            <strong>الجهاز:</strong> ${integration.deviceName || 'غير معروف'}<br>
            <strong>آخر تشغيل:</strong> ${integration.lastSync ? new Date(integration.lastSync).toLocaleString() : 'لم يتم التشغيل بعد'}
        </p>
        <hr>
    `;
    
    // معلومات إضافية حسب النوع
    if (integration.type === 'google_sheets') {
        cardBody.innerHTML += `
            <p class="card-text">
                <strong>جدول البيانات:</strong> ${integration.config?.sheetId ? integration.config.sheetId.substring(0, 15) + '...' : 'غير محدد'}<br>
                <strong>فترة المزامنة:</strong> كل ${integration.syncInterval} دقائق
            </p>
        `;
    } else if (integration.type === 'webhook') {
        cardBody.innerHTML += `
            <p class="card-text">
                <strong>عنوان الـ webhook:</strong> ${integration.config?.webhookUrl ? integration.config.webhookUrl.substring(0, 30) + '...' : 'غير محدد'}<br>
                <strong>التحديث:</strong> ${integration.config?.isRealtime ? 'فوري' : `كل ${integration.syncInterval} دقائق`}
            </p>
        `;
        
        // إضافة معلومات عن استقبال البيانات إذا كان مفعلاً
        if (integration.config?.token) {
            cardBody.innerHTML += `
                <div class="alert alert-info py-1 mt-2">
                    <small><i class="bi bi-arrow-left-right"></i> تكامل ثنائي الاتجاه مفعل</small>
                </div>
            `;
        }
    }
    
    // إحصائيات
    if (integration.stats) {
        cardBody.innerHTML += `
            <div class="mt-2">
                <small class="text-muted">
                    تم معالجة: ${integration.stats.processed || 0} | 
                    نجاح: ${integration.stats.sent || 0} | 
                    فشل: ${integration.stats.failed || 0}
                </small>
            </div>
        `;
    }
    
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer d-flex justify-content-between';
    
    const detailsBtn = document.createElement('button');
    detailsBtn.className = 'btn btn-sm btn-info';
    detailsBtn.innerHTML = '<i class="bi bi-info-circle me-1"></i> التفاصيل';
    detailsBtn.onclick = () => showIntegrationDetails(integration.id);
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `btn btn-sm ${integration.active ? 'btn-warning' : 'btn-success'}`;
    toggleBtn.innerHTML = integration.active ? 
        '<i class="bi bi-pause-circle me-1"></i> إيقاف' : 
        '<i class="bi bi-play-circle me-1"></i> تشغيل';
    toggleBtn.onclick = () => toggleIntegration(integration.id, !integration.active);
    
    cardFooter.appendChild(detailsBtn);
    cardFooter.appendChild(toggleBtn);
    
    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
    col.appendChild(card);
    
    return col;
}

// وظيفة الحصول على اسم نوع التكامل
function getIntegrationTypeName(type) {
    switch(type) {
        case 'google_sheets':
            return 'Google Sheets';
        case 'webhook':
            return 'Webhook';
        case 'crm':
            return 'نظام CRM';
        case 'email':
            return 'بريد إلكتروني';
        case 'ai':
            return 'ذكاء اصطناعي';
        default:
            return type;
    }
}

// وظيفة إظهار تفاصيل التكامل
function showIntegrationDetails(integrationId) {
    const integration = integrations.find(i => i.id === integrationId);
    
    if (!integration) {
        showAlert('لم يتم العثور على التكامل', 'danger');
        return;
    }
    
    const detailsModal = document.getElementById('integrationDetailsModal');
    const detailsBody = document.getElementById('integrationDetailsBody');
    
    if (!detailsModal || !detailsBody) {
        showAlert('عنصر التفاصيل غير موجود في الصفحة', 'danger');
        return;
    }
    
    // عنوان ومعلومات أساسية
    detailsBody.innerHTML = `
        <h4>${integration.name}</h4>
        <div class="row mb-3">
            <div class="col-md-6">
                <p>
                    <strong>النوع:</strong> ${getIntegrationTypeName(integration.type)}<br>
                    <strong>الجهاز:</strong> ${integration.deviceName || 'غير معروف'}<br>
                    <strong>تاريخ الإنشاء:</strong> ${new Date(integration.createdAt).toLocaleString()}<br>
                    <strong>الحالة:</strong> ${integration.active ? '<span class="badge bg-success">نشط</span>' : '<span class="badge bg-secondary">معطل</span>'}
                </p>
            </div>
            <div class="col-md-6">
                <p>
                    <strong>آخر تشغيل:</strong> ${integration.lastSync ? new Date(integration.lastSync).toLocaleString() : 'لم يتم التشغيل بعد'}<br>
                    <strong>آخر تحديث:</strong> ${integration.updatedAt ? new Date(integration.updatedAt).toLocaleString() : '-'}<br>
                    <strong>فترة المزامنة:</strong> ${integration.syncInterval == 0 ? 'فوري' : `كل ${integration.syncInterval} دقائق`}
                </p>
            </div>
        </div>
    `;
    
    // إظهار التكوين حسب النوع
    detailsBody.innerHTML += `<h5>تفاصيل التكوين</h5>`;
    
    if (integration.type === 'google_sheets') {
        detailsBody.innerHTML += `
            <div class="mb-3">
                <p>
                    <strong>معرف جدول البيانات:</strong> ${integration.config?.sheetId || 'غير محدد'}<br>
                    <strong>اسم الورقة:</strong> ${integration.config?.sheetName || 'الورقة الافتراضية'}<br>
                    <strong>عمود الهاتف:</strong> ${integration.config?.phoneColumn || 'غير محدد'}<br>
                    <strong>عمود الرسالة:</strong> ${integration.config?.messageColumn || 'غير محدد'}<br>
                    <strong>عمود الحالة:</strong> ${integration.config?.statusColumn || 'لا يوجد'}
                </p>
                <div class="alert alert-info">
                    <strong>رابط جدول البيانات:</strong><br>
                    <a href="https://docs.google.com/spreadsheets/d/${integration.config?.sheetId}" target="_blank" class="link-info">
                        https://docs.google.com/spreadsheets/d/${integration.config?.sheetId}
                    </a>
                </div>
            </div>
        `;
    } else if (integration.type === 'webhook') {
        detailsBody.innerHTML += `
            <div class="mb-3">
                <p>
                    <strong>عنوان الـ webhook:</strong> ${integration.config?.webhookUrl || 'غير محدد'}<br>
                    <strong>إشعار عند الرسائل الجديدة:</strong> ${integration.config?.notifyOnNewMessage ? 'نعم' : 'لا'}<br>
                    <strong>إشعار عند تغيير الحالة:</strong> ${integration.config?.notifyOnStatusChange ? 'نعم' : 'لا'}<br>
                    <strong>إشعار عند نشاط المجموعات:</strong> ${integration.config?.notifyOnGroupActivity ? 'نعم' : 'لا'}
                </p>
            </div>
        `;
        
        // إظهار معلومات استقبال البيانات إذا كان مفعلاً
        if (integration.config?.token) {
            const baseUrl = window.location.origin;
            detailsBody.innerHTML += `
                <div class="card border-info mb-3">
                    <div class="card-header bg-info bg-opacity-25">
                        <h5 class="mb-0"><i class="bi bi-arrow-left-right"></i> معلومات التكامل ثنائي الاتجاه</h5>
                    </div>
                    <div class="card-body">
                        <p><strong>رمز الوصول (token):</strong> <code>${integration.config.token}</code></p>
                        <p><strong>عنوان URL لاستقبال البيانات:</strong><br>
                        <code>${baseUrl}/api/webhook/${integration.config.token}</code></p>
                        
                        <p><strong>أمثلة على الإجراءات التي يمكن إرسالها:</strong></p>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-header">إرسال رسالة نصية</div>
                                    <div class="card-body">
<pre class="bg-light p-2"><code>{
  "action": "send_message",
  "phone": "971501234567",
  "message": "نص الرسالة"
}</code></pre>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card">
                                    <div class="card-header">إرسال وسائط</div>
                                    <div class="card-body">
<pre class="bg-light p-2"><code>{
  "action": "send_media",
  "phone": "971501234567",
  "url": "https://example.com/image.jpg"
}</code></pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    // إظهار الإحصائيات
    if (integration.stats) {
        detailsBody.innerHTML += `
            <h5>الإحصائيات</h5>
            <div class="mb-3">
                <div class="row">
                    <div class="col-md-4">
                        <div class="card text-center">
                            <div class="card-body">
                                <h5 class="card-title">${integration.stats.processed || 0}</h5>
                                <p class="card-text">تمت معالجته</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card text-center bg-success text-white">
                            <div class="card-body">
                                <h5 class="card-title">${integration.stats.sent || 0}</h5>
                                <p class="card-text">تم بنجاح</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card text-center bg-danger text-white">
                            <div class="card-body">
                                <h5 class="card-title">${integration.stats.failed || 0}</h5>
                                <p class="card-text">فشل</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // إظهار آخر الأخطاء إذا وجدت
    if (integration.lastError) {
        detailsBody.innerHTML += `
            <div class="alert alert-danger">
                <h5>آخر خطأ:</h5>
                <p>${integration.lastError.message}</p>
                <small>${new Date(integration.lastError.date).toLocaleString()}</small>
            </div>
        `;
    }
    
    // تخزين معرف التكامل في الزر للاستخدام في وظائف الحذف والتشغيل
    document.getElementById('deleteIntegration').setAttribute('data-integration-id', integrationId);
    document.getElementById('runIntegrationNow').setAttribute('data-integration-id', integrationId);
    
    // فتح النافذة
    const bsModal = new bootstrap.Modal(detailsModal);
    bsModal.show();
}

// وظيفة تبديل حالة التكامل (نشط/غير نشط)
function toggleIntegration(integrationId, active) {
    fetch(`/api/integrations/${integrationId}/toggle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'حدث خطأ أثناء تغيير حالة التكامل'); });
        }
        return response.json();
    })
    .then(data => {
        showAlert(`تم ${active ? 'تفعيل' : 'إيقاف'} التكامل بنجاح`, 'success');
        loadIntegrations(); // إعادة تحميل القائمة
    })
    .catch(error => {
        console.error('خطأ في تغيير حالة التكامل:', error);
        showAlert(error.message, 'danger');
    });
}

// وظيفة حذف التكامل
function deleteIntegration() {
    const integrationId = document.getElementById('deleteIntegration').getAttribute('data-integration-id');
    
    if (!integrationId) {
        showAlert('لم يتم تحديد التكامل', 'danger');
        return;
    }
    
    if (!confirm('هل أنت متأكد من حذف هذا التكامل؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    
    fetch(`/api/integrations/${integrationId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'حدث خطأ أثناء حذف التكامل'); });
        }
        return response.json();
    })
    .then(data => {
        showAlert('تم حذف التكامل بنجاح', 'success');
        
        // إغلاق النافذة وإعادة تحميل التكاملات
        const modalElement = document.getElementById('integrationDetailsModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
        
        loadIntegrations();
    })
    .catch(error => {
        console.error('خطأ في حذف التكامل:', error);
        showAlert(error.message, 'danger');
    });
}

// وظيفة تشغيل التكامل يدويًا
function runIntegrationNow() {
    const integrationId = document.getElementById('runIntegrationNow').getAttribute('data-integration-id');
    
    if (!integrationId) {
        showAlert('لم يتم تحديد التكامل', 'danger');
        return;
    }
    
    // إظهار رسالة الانتظار
    showAlert('جاري تشغيل التكامل...', 'info', 2000);
    
    fetch(`/api/integrations/${integrationId}/run`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'حدث خطأ أثناء تشغيل التكامل'); });
        }
        return response.json();
    })
    .then(data => {
        showAlert('تم تشغيل التكامل بنجاح', 'success');
        
        // إغلاق النافذة وإعادة تحميل التكاملات
        const modalElement = document.getElementById('integrationDetailsModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
        
        setTimeout(() => {
            loadIntegrations();
        }, 1000);
    })
    .catch(error => {
        console.error('خطأ في تشغيل التكامل:', error);
        showAlert(error.message, 'danger');
    });
}

// وظائف جمع بيانات التكامل
function saveIntegration() {
    // الحصول على نوع التكامل
    const integrationType = document.getElementById('integrationType').value;
    
    if (!integrationType) {
        showAlert('يرجى اختيار نوع التكامل', 'warning');
        return;
    }
    
    // تجميع بيانات التكامل حسب النوع
    let integrationData;
    try {
        switch(integrationType) {
            case 'google_sheets':
                integrationData = collectGoogleSheetsData();
                break;
            case 'webhook':
                integrationData = collectWebhookData();
                break;
            case 'crm':
                integrationData = collectCrmData();
                break;
            case 'email':
                integrationData = collectEmailData();
                break;
            case 'ai':
                integrationData = collectAiData();
                break;
            default:
                throw new Error('نوع التكامل غير مدعوم');
        }
    } catch (error) {
        showAlert(error.message, 'danger');
        return;
    }
    
    console.log('بيانات التكامل التي سيتم إرسالها:', integrationData);
    
    // إضافة التكامل
    fetch('/api/integrations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(integrationData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.message || 'حدث خطأ أثناء إضافة التكامل'); });
        }
        return response.json();
    })
    .then(data => {
        showAlert('تم إضافة التكامل بنجاح', 'success');
        
        // إغلاق النافذة وإعادة تحميل التكاملات
        const modalElement = document.getElementById('addIntegrationModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
        
        resetIntegrationForm();
        loadIntegrations();
    })
    .catch(error => {
        console.error('خطأ في إضافة التكامل:', error);
        showAlert(error.message, 'danger');
    });
}

// وظيفة جمع بيانات تكامل Google Sheets
function collectGoogleSheetsData() {
    const name = document.getElementById('integrationName').value.trim();
    const deviceId = document.getElementById('deviceId').value;
    const sheetId = document.getElementById('sheetId').value.trim();
    const sheetName = document.getElementById('sheetName').value.trim();
    const phoneColumn = document.getElementById('phoneColumn').value.trim();
    const messageColumn = document.getElementById('messageColumn').value.trim();
    const syncInterval = parseInt(document.getElementById('syncInterval').value);
    const markAsSent = document.getElementById('markAsSent').checked;
    const sendOnlyNew = document.getElementById('sendOnlyNew').checked;
    
    // التحقق من البيانات
    if (!name) throw new Error('يرجى إدخال اسم التكامل');
    if (!deviceId) throw new Error('يرجى اختيار الجهاز');
    if (!sheetId) throw new Error('يرجى إدخال معرف جدول البيانات');
    if (!phoneColumn) throw new Error('يرجى إدخال عمود رقم الهاتف');
    if (!messageColumn) throw new Error('يرجى إدخال عمود الرسالة');
    
    return {
        type: 'google_sheets',
        name: name,
        deviceId: deviceId,
        config: {
            sheetId: sheetId,
            sheetName: sheetName,
            phoneColumn: phoneColumn,
            messageColumn: messageColumn,
            statusColumn: markAsSent ? messageColumn.charAt(0).toUpperCase() + String.fromCharCode(messageColumn.charCodeAt(0) + 1) : '',
            sendOnlyNew: sendOnlyNew
        },
        syncInterval: syncInterval,
        active: true
    };
}

// وظيفة جمع بيانات تكامل Webhook
function collectWebhookData() {
    const name = document.getElementById('webhookIntegrationName').value.trim();
    const deviceId = document.getElementById('webhookDeviceId').value;
    const webhookUrl = document.getElementById('webhookUrl').value.trim();
    const syncInterval = parseInt(document.getElementById('webhookSyncInterval').value) || 0;
    const notifyOnNewMessage = document.getElementById('notifyOnNewMessage')?.checked || true;
    const notifyOnStatusChange = document.getElementById('notifyOnStatusChange')?.checked || false;
    const notifyOnGroupActivity = document.getElementById('notifyOnGroupActivity')?.checked || false;
    
    // خيارات استقبال البيانات
    const enableReceiveData = document.getElementById('enableReceiveData')?.checked || false;
    const token = enableReceiveData ? document.getElementById('webhookToken').value.trim() : '';
    const secret = enableReceiveData ? document.getElementById('webhookSecret').value.trim() : '';
    
    // التحقق من البيانات
    if (!name) throw new Error('يرجى إدخال اسم التكامل');
    if (!deviceId) throw new Error('يرجى اختيار الجهاز');
    if (!webhookUrl) throw new Error('يرجى إدخال عنوان الـ webhook');
    
    // التحقق من وجود توكن إذا تم تفعيل استقبال البيانات
    if (enableReceiveData && !token) {
        throw new Error('يرجى إنشاء رمز الوصول (token) لتمكين استقبال البيانات');
    }
    
    console.log('تجميع بيانات تكامل Webhook:', { name, deviceId, webhookUrl, syncInterval });
    
    return {
        type: 'webhook',
        name: name,
        deviceId: deviceId,
        config: {
            webhookUrl: webhookUrl,
            notifyOnNewMessage: notifyOnNewMessage,
            notifyOnStatusChange: notifyOnStatusChange,
            notifyOnGroupActivity: notifyOnGroupActivity,
            isRealtime: syncInterval === 0,
            // إضافة خيارات استقبال البيانات
            token: token,
            secret: secret,
            enableReceiveData: enableReceiveData
        },
        syncInterval: syncInterval,
        active: true
    };
}

// وظيفة إعادة تعيين نموذج التكامل
function resetIntegrationForm() {
    const form = document.getElementById('integrationForm');
    if (form) {
        form.reset();
    }
    
    document.querySelectorAll('.integration-fields').forEach(field => {
        field.classList.add('d-none');
    });
    
    const select = document.getElementById('integrationType');
    if (select) {
        select.selectedIndex = 0;
    }
    
    // إعادة ضبط قسم استقبال البيانات
    const receiveDataSection = document.getElementById('receiveDataSection');
    if (receiveDataSection) {
        receiveDataSection.style.display = 'none';
    }
}