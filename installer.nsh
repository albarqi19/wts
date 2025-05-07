!macro customInstall
  ; تحقق مما إذا كان Node.js مثبت
  nsExec::ExecToStack 'node --version'
  Pop $0
  Pop $1
  
  ${If} $0 != 0
    MessageBox MB_YESNO "يتطلب هذا البرنامج تثبيت Node.js. هل ترغب في تثبيته الآن؟" IDYES installNode IDNO continueWithoutNode
    
    installNode:
      ; تنزيل وتثبيت Node.js
      DetailPrint "جاري تنزيل وتثبيت Node.js..."
      inetc::get "https://nodejs.org/dist/v18.17.1/node-v18.17.1-x64.msi" "$TEMP\node-installer.msi" /END
      Pop $0
      ${If} $0 != "OK"
        MessageBox MB_OK "فشل تنزيل Node.js. الرجاء تثبيته يدويًا وإعادة تشغيل المُثبت."
        Abort
      ${EndIf}
      
      DetailPrint "جاري تثبيت Node.js..."
      ExecWait 'msiexec /i "$TEMP\node-installer.msi" /quiet'
      
    continueWithoutNode:
  ${EndIf}
  
  ; تحقق مما إذا كانت MongoDB مثبتة
  nsExec::ExecToStack 'mongod --version'
  Pop $0
  Pop $1
  
  ${If} $0 != 0
    MessageBox MB_YESNO "يتطلب هذا البرنامج تثبيت MongoDB. هل ترغب في تثبيتها الآن؟" IDYES installMongoDB IDNO continueWithoutMongoDB
    
    installMongoDB:
      ; تنزيل وتثبيت MongoDB
      DetailPrint "جاري تنزيل وتثبيت MongoDB..."
      inetc::get "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-6.0.6-signed.msi" "$TEMP\mongodb-installer.msi" /END
      Pop $0
      ${If} $0 != "OK"
        MessageBox MB_OK "فشل تنزيل MongoDB. الرجاء تثبيتها يدويًا وإعادة تشغيل المُثبت."
        Abort
      ${EndIf}
      
      DetailPrint "جاري تثبيت MongoDB..."
      ExecWait 'msiexec /i "$TEMP\mongodb-installer.msi" /quiet ADDLOCAL="all"'
      
    continueWithoutMongoDB:
  ${EndIf}
  
  ; إنشاء مجلدات البيانات
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\data\devices"
  CreateDirectory "$INSTDIR\data\sent_messages"
  CreateDirectory "$INSTDIR\data\temp_media"
  
  ; نسخ ملفات البيانات الافتراضية إذا كانت موجودة
  CopyFiles /SILENT "$EXEDIR\data\*.json" "$INSTDIR\data"
  
  ; إنشاء اختصارات إضافية
  CreateShortCut "$DESKTOP\WhatsApp Server.lnk" "$INSTDIR\${PRODUCT_NAME}.exe" "" "$INSTDIR\${PRODUCT_NAME}.exe" 0
  
  ; إضافة خيار لبدء التطبيق مع بدء تشغيل Windows
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}" "$INSTDIR\${PRODUCT_NAME}.exe --hidden"
!macroend