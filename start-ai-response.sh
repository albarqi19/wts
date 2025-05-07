#!/bin/bash

echo "جاري تشغيل سكريبت اختبار الرد الذكي..."
echo
echo "لاختبار الرد الذكي مباشرة من Terminal:"
echo "node test-ai-response.js \"مرحبا، كيف حالك؟\""
echo
echo "لتشغيل عميل واتساب مستقل:"
echo "node whatsapp-ai-response.js"
echo
echo "اختر أحد الخيارات:"
echo "1. اختبار الرد الذكي مباشرة"
echo "2. تشغيل عميل واتساب مستقل"
echo

read -p "اختر رقم الخيار (1 أو 2): " choice

if [ "$choice" = "1" ]; then
    read -p "أدخل الرسالة: " message
    node test-ai-response.js "$message"
    read -p "اضغط Enter للخروج..."
elif [ "$choice" = "2" ]; then
    node whatsapp-ai-response.js
else
    echo "خيار غير صالح!"
    read -p "اضغط Enter للخروج..."
fi
