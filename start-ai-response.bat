@echo off
echo جاري تشغيل سكريبت اختبار الرد الذكي...
echo.
echo لاختبار الرد الذكي مباشرة من Terminal:
echo node test-ai-response.js "مرحبا، كيف حالك؟"
echo.
echo لتشغيل عميل واتساب مستقل:
echo node whatsapp-ai-response.js
echo.
echo اختر أحد الخيارات:
echo 1. اختبار الرد الذكي مباشرة
echo 2. تشغيل عميل واتساب مستقل
echo.
set /p choice=اختر رقم الخيار (1 أو 2): 

if "%choice%"=="1" (
    set /p message=أدخل الرسالة: 
    node test-ai-response.js "%message%"
    pause
) else if "%choice%"=="2" (
    node whatsapp-ai-response.js
) else (
    echo خيار غير صالح!
    pause
)
