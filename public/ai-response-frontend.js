// ai-response-frontend.js
// ملف JavaScript خاص بالواجهة لصفحة الرد الذكي (Google Gemini)

document.addEventListener('DOMContentLoaded', async function() {
    // عناصر DOM
    const aiResponsesList = document.getElementById('aiResponsesList');
    const noResponses = document.getElementById('noResponses');
    const showActiveOnly = document.getElementById('showActiveOnly');
    const testResponseSelect = document.getElementById('testResponseSelect');
    const testMessage = document.getElementById('testMessage');
    const btnTestResponse = document.getElementById('btnTestResponse');
    const testResultContainer = document.getElementById('testResultContainer');
    const testResultText = document.getElementById('testResultText');
    const btnAddResponse = document.getElementById('btnAddResponse');
    const deviceIdSelect = document.getElementById('deviceId');
    const modalTitle = document.getElementById('modalTitle');
    const responseForm = document.getElementById('responseForm');
    const responseId = document.getElementById('responseId');
    const btnSaveResponse = document.getElementById('btnSaveResponse');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    
    // تخزين مؤقت لنماذج الرد الذكي
    let responses = [];
    let currentResponseId = null;

    // نافذة Bootstrap Modal
    const addResponseModal = new bootstrap.Modal(document.getElementById('addResponseModal'));
    const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));

    // تفعيل/تعطيل قسم Google Sheets بطريقة محسنة
    const useGoogleSheetsCheckbox = document.getElementById('useGoogleSheets');
    const googleSheetsSettings = document.getElementById('googleSheetsSettings');
    
    if (useGoogleSheetsCheckbox) {
        useGoogleSheetsCheckbox.addEventListener('change', function() {
            if (googleSheetsSettings) {
                googleSheetsSettings.style.display = this.checked ? 'block' : 'none';
                console.log('تم تغيير حالة عرض إعدادات Google Sheets إلى: ' + (this.checked ? 'ظاهر' : 'مخفي'));
            } else {
                console.error('لم يتم العثور على عنصر googleSheetsSettings');
            }
        });
    } else {
        console.error('لم يتم العثور على عنصر useGoogleSheets');
    }
    
    // التأكد من تطبيق الحالة الأولية
    if (useGoogleSheetsCheckbox && googleSheetsSettings) {
        googleSheetsSettings.style.display = useGoogleSheetsCheckbox.checked ? 'block' : 'none';
    }

    // التبديل بين عرض النماذج النشطة فقط
    showActiveOnly.addEventListener('change', function() {
        loadResponses();
    });

    // تحميل نماذج الرد الذكي
    async function loadResponses() {
        try {
            const response = await fetch('/api/responses');
            if (!response.ok) {
                throw new Error('فشل تحميل نماذج الرد الذكي');
            }
            const data = await response.json();
            if (data.status) {
                responses = data.data;
                renderResponses();
                populateTestResponseSelect();
            } else {
                throw new Error(data.message || 'فشل تحميل نماذج الرد الذكي');
            }
        } catch (error) {
            console.error('خطأ في تحميل نماذج الرد الذكي:', error);
            showError('خطأ في تحميل نماذج الرد الذكي: ' + error.message);
        }
    }

    // عرض نماذج الرد الذكي في الجدول
    function renderResponses() {
        aiResponsesList.innerHTML = '';
        
        // تصفية النماذج إذا كان عرض النماذج النشطة فقط مفعّل
        const filteredResponses = showActiveOnly.checked 
            ? responses.filter(r => r.active) 
            : responses;
        
        if (filteredResponses.length === 0) {
            noResponses.style.display = 'block';
            return;
        }
        
        noResponses.style.display = 'none';
        
        filteredResponses.forEach(response => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${response.name || '-'}</td>
                <td>${response.description || '-'}</td>
                <td>${getResponseTypeDisplay(response.responseType)}</td>
                <td>${response.deviceId || '-'}</td>
                <td>
                    <span class="badge ${response.active ? 'bg-success' : 'bg-danger'}">
                        ${response.active ? 'نشط' : 'متوقف'}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-info btn-edit" data-id="${response.id}" title="تعديل">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-warning btn-toggle" data-id="${response.id}" data-active="${response.active}" title="${response.active ? 'إيقاف' : 'تفعيل'}">
                            <i class="bi ${response.active ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                        </button>
                        <button class="btn btn-danger btn-delete" data-id="${response.id}" title="حذف">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            
            // إضافة معالجات الأحداث للأزرار
            aiResponsesList.appendChild(tr);
            
            // زر التعديل
            tr.querySelector('.btn-edit').addEventListener('click', () => {
                editResponse(response.id);
            });
            
            // زر التبديل (تفعيل/إيقاف)
            tr.querySelector('.btn-toggle').addEventListener('click', () => {
                toggleResponseStatus(response.id, !response.active);
            });
            
            // زر الحذف
            tr.querySelector('.btn-delete').addEventListener('click', () => {
                confirmDeleteResponse(response.id);
            });
        });
    }

    // الحصول على عرض نوع الرد بصيغة مقروءة
    function getResponseTypeDisplay(type) {
        const types = {
            'gemini': 'Google Gemini',
            'gemini_only': 'Google Gemini',
            'sheets_enhanced': 'Gemini + Google Sheets',
            'sheets_query': 'Google Sheets Query'
        };
        return types[type] || type;
    }

    // تحميل الأجهزة المتاحة
    async function loadDevices() {
        try {
            const response = await fetch('/api/devices');
            if (!response.ok) {
                throw new Error('فشل تحميل الأجهزة');
            }
            const data = await response.json();
            if (data.status) {
                deviceIdSelect.innerHTML = '<option value="">-- اختر جهازًا --</option>';
                data.data.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = device.name || `جهاز ${device.id.substr(0, 8)}`;
                    deviceIdSelect.appendChild(option);
                });
            } else {
                throw new Error(data.message || 'فشل تحميل الأجهزة');
            }
        } catch (error) {
            console.error('خطأ في تحميل الأجهزة:', error);
            showError('خطأ في تحميل الأجهزة: ' + error.message);
        }
    }

    // تعبئة قائمة نماذج الرد الذكي للاختبار
    function populateTestResponseSelect() {
        testResponseSelect.innerHTML = '<option value="">-- اختر نموذج رد ذكي --</option>';
        const activeResponses = responses.filter(r => r.active);
        activeResponses.forEach(response => {
            const option = document.createElement('option');
            option.value = response.id;
            option.textContent = response.name;
            testResponseSelect.appendChild(option);
        });
        
        // تفعيل/تعطيل زر الاختبار
        toggleTestButton();
    }

    // تفعيل/تعطيل زر اختبار الرد
    function toggleTestButton() {
        btnTestResponse.disabled = !testResponseSelect.value || !testMessage.value;
    }

    // إعداد النموذج للإضافة
    function setupFormForAdd() {
        modalTitle.textContent = 'إضافة نموذج رد ذكي جديد';
        responseForm.reset();
        responseId.value = generateUUID();
        btnSaveResponse.textContent = 'إضافة';
        document.getElementById('googleSheetsSettings').style.display = 'none';
        currentResponseId = null;
    }

    // إعداد النموذج للتعديل
    async function editResponse(id) {
        try {
            modalTitle.textContent = 'تعديل نموذج الرد الذكي';
            const response = await fetch(`/api/responses/${id}`);
            if (!response.ok) {
                throw new Error('فشل تحميل بيانات النموذج');
            }
            const data = await response.json();
            if (!data.status) {
                throw new Error(data.message || 'فشل تحميل بيانات النموذج');
            }
            
            const responseData = data.data;
            currentResponseId = id;
            
            // تعبئة النموذج بالبيانات
            responseId.value = responseData.id;
            document.getElementById('responseName').value = responseData.name || '';
            document.getElementById('responseDescription').value = responseData.description || '';
            document.getElementById('responseType').value = responseData.responseType || 'gemini';
            document.getElementById('deviceId').value = responseData.deviceId || '';
            
            // إعدادات Google Gemini
            if (responseData.config) {
                document.getElementById('geminiApiKey').value = responseData.config.geminiApiKey || '';
                document.getElementById('geminiModel').value = responseData.config.model || 'gemini-pro';
                document.getElementById('geminiTemperature').value = responseData.config.generationConfig?.temperature || 0.7;
                document.getElementById('geminiMaxTokens').value = responseData.config.generationConfig?.maxOutputTokens || 800;
                
                // إعدادات Google Sheets
                const useSheets = responseData.responseType === 'sheets_enhanced' || responseData.responseType === 'sheets_query';
                document.getElementById('useGoogleSheets').checked = useSheets;
                document.getElementById('googleSheetsSettings').style.display = useSheets ? 'block' : 'none';
                
                if (useSheets) {
                    document.getElementById('googleSheetsId').value = responseData.config.sheetsId || '';
                    document.getElementById('sheetIndex').value = responseData.config.sheetIndex || 0;
                }
                
                // كلمات مفتاحية للتفعيل
                document.getElementById('triggers').value = Array.isArray(responseData.config.triggerWords) 
                    ? responseData.config.triggerWords.join(', ') 
                    : responseData.config.triggerWords || '';
            }
            
            document.getElementById('responseActive').checked = responseData.active !== false;
            btnSaveResponse.textContent = 'حفظ التغييرات';
            
            addResponseModal.show();
            
        } catch (error) {
            console.error('خطأ في تحميل بيانات النموذج:', error);
            showError('خطأ في تحميل بيانات النموذج: ' + error.message);
        }
    }

    // تبديل حالة النموذج (نشط/متوقف)
    async function toggleResponseStatus(id, newStatus) {
        try {
            const response = await fetch(`/api/responses/${id}/toggle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ active: newStatus })
            });
            
            if (!response.ok) {
                throw new Error('فشل تغيير حالة النموذج');
            }
            
            const data = await response.json();
            if (data.status) {
                showSuccess(`تم ${newStatus ? 'تفعيل' : 'إيقاف'} النموذج بنجاح`);
                loadResponses(); // إعادة تحميل القائمة
            } else {
                throw new Error(data.message || 'فشل تغيير حالة النموذج');
            }
        } catch (error) {
            console.error('خطأ في تغيير حالة النموذج:', error);
            showError('خطأ في تغيير حالة النموذج: ' + error.message);
        }
    }

    // تأكيد حذف النموذج
    function confirmDeleteResponse(id) {
        currentResponseId = id;
        deleteConfirmModal.show();
    }

    // حذف النموذج
    async function deleteResponse() {
        if (!currentResponseId) return;
        
        try {
            const response = await fetch(`/api/responses/${currentResponseId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('فشل حذف النموذج');
            }
            
            const data = await response.json();
            if (data.status) {
                showSuccess('تم حذف النموذج بنجاح');
                deleteConfirmModal.hide();
                loadResponses(); // إعادة تحميل القائمة
            } else {
                throw new Error(data.message || 'فشل حذف النموذج');
            }
        } catch (error) {
            console.error('خطأ في حذف النموذج:', error);
            showError('خطأ في حذف النموذج: ' + error.message);
            deleteConfirmModal.hide();
        }
    }

    // حفظ النموذج (إضافة/تعديل)
    async function saveResponse() {
        try {
            // التحقق من الحقول الإلزامية
            const name = document.getElementById('responseName').value;
            const deviceId = document.getElementById('deviceId').value;
            const geminiApiKey = document.getElementById('geminiApiKey').value;
            
            if (!name || !deviceId || !geminiApiKey) {
                throw new Error('يرجى ملء جميع الحقول الإلزامية');
            }
            
            // بناء كائن البيانات
            const responseData = {
                id: responseId.value,
                name: name,
                description: document.getElementById('responseDescription').value,
                type: document.getElementById('responseType').value,
                deviceId: deviceId,
                active: document.getElementById('responseActive').checked,
                config: {
                    apiKey: geminiApiKey,
                    model: document.getElementById('geminiModel').value,
                    generationConfig: {
                        temperature: parseFloat(document.getElementById('geminiTemperature').value),
                        maxOutputTokens: parseInt(document.getElementById('geminiMaxTokens').value)
                    }
                }
            };
            
            // إضافة إعدادات Google Sheets إذا كانت مفعّلة
            if (document.getElementById('useGoogleSheets').checked) {
                const sheetsId = document.getElementById('googleSheetsId').value;
                if (!sheetsId) {
                    throw new Error('يرجى إدخال معرف ملف Google Sheets');
                }
                
                responseData.type = 'sheets_enhanced';
                responseData.config.googleSheetsId = sheetsId;
                responseData.config.sheetIndex = parseInt(document.getElementById('sheetIndex').value);
            }
            
            // إضافة الكلمات المفتاحية للتفعيل
            const triggers = document.getElementById('triggers').value;
            if (triggers) {
                responseData.triggers = triggers
                    .split(',')
                    .map(word => word.trim())
                    .filter(word => word);
            }
            
            // تحديد طريقة الإرسال (POST للإضافة، PUT للتعديل)
            const isEdit = !!currentResponseId;
            const method = isEdit ? 'PUT' : 'POST';
            const url = isEdit 
                ? `/api/responses/${currentResponseId}`
                : '/api/responses';
            
            console.log('Sending request with data:', JSON.stringify(responseData, null, 2));
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(responseData)
            });
            
            if (!response.ok) {
                throw new Error(`فشل ${isEdit ? 'تعديل' : 'إضافة'} النموذج`);
            }
            
            const data = await response.json();
            if (data.status) {
                showSuccess(`تم ${isEdit ? 'تعديل' : 'إضافة'} النموذج بنجاح`);
                addResponseModal.hide();
                loadResponses(); // إعادة تحميل القائمة
            } else {
                throw new Error(data.message || `فشل ${isEdit ? 'تعديل' : 'إضافة'} النموذج`);
            }
            
        } catch (error) {
            console.error(`خطأ في ${currentResponseId ? 'تعديل' : 'إضافة'} النموذج:`, error);
            showError(`خطأ في ${currentResponseId ? 'تعديل' : 'إضافة'} النموذج: ` + error.message);
        }
    }

    // اختبار النموذج
    async function testResponse() {
        try {
            const responseId = testResponseSelect.value;
            const messageText = testMessage.value;
            
            if (!responseId || !messageText) {
                throw new Error('يرجى اختيار نموذج وإدخال رسالة للاختبار');
            }
            
            // عرض حالة الانتظار
            testResultContainer.style.display = 'block';
            testResultText.innerHTML = '<div class="text-center"><div class="spinner-border text-primary"></div><p class="mt-2">جارٍ معالجة الرد...</p></div>';
            
            const response = await fetch(`/api/responses/${responseId}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: messageText,
                    isTestMode: true
                })
            });
            
            if (!response.ok) {
                throw new Error('فشل اختبار النموذج');
            }
            
            const data = await response.json();
            if (data.status) {
                testResultText.textContent = data.data || 'لم يتم إنشاء رد';
            } else {
                throw new Error(data.message || 'فشل اختبار النموذج');
            }
            
        } catch (error) {
            console.error('خطأ في اختبار النموذج:', error);
            testResultContainer.style.display = 'block';
            testResultText.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        }
    }

    // إنشاء معرف فريد
    function generateUUID() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    // عرض رسالة نجاح
    function showSuccess(message) {
        // يمكن إضافة مكتبة لعرض الإشعارات مثل toastr أو sweetalert
        alert(message);
    }

    // عرض رسالة خطأ
    function showError(message) {
        // يمكن إضافة مكتبة لعرض الإشعارات مثل toastr أو sweetalert
        alert(message);
    }

    // تسجيل معالجات الأحداث
    btnAddResponse.addEventListener('click', () => {
        setupFormForAdd();
        addResponseModal.show();
    });
    
    btnSaveResponse.addEventListener('click', saveResponse);
    btnConfirmDelete.addEventListener('click', deleteResponse);
    
    testResponseSelect.addEventListener('change', toggleTestButton);
    testMessage.addEventListener('input', toggleTestButton);
    btnTestResponse.addEventListener('click', testResponse);

    // تحميل البيانات عند بدء التشغيل
    loadResponses();
    loadDevices();
});