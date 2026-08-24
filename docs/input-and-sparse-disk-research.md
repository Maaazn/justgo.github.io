# بحث الإدخال والقرص sparse

## مؤشر النظام على iPhone وiPad

توضح [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) أن Pointer Lock هو الآلية القياسية التي تخفي cursor النظامي وتثبت حركة المؤشر داخل العنصر. كما تصنفه MDN كقدرة محدودة التوفر، وتظهر نتائج التوافق أن Safari على iOS لا يقدم هذه القدرة. لذلك يمكن لواجهة JustGo إخفاء أو رسم **مؤشرها الافتراضي** داخل سطح الضيف، لكن لا تستطيع صفحة Safari على iPhone فرض إخفاء overlay الخاص بنظام iOS.

توضح [Apple iPhone User Guide](https://support.apple.com/guide/iphone/adjust-pointer-settings-iphec6e1e60b/ios) أن إعدادات مؤشر iPhone وإخفائه التلقائي تقع ضمن إعدادات النظام. ذلك يفسر اختلاف التجربة عن iPad ولا يثبت وجود واجهة ويب تسمح بالتحكم في المؤشر النظامي.

## قرص ضيف sparse قابل للكتابة

في [v86 issue #1353](https://github.com/copy/v86/issues/1353)، يوضح مشروع v86 أن إنشاء قرص فارغ كبير عبر `ArrayBuffer` يفشل عند أحجام كبيرة. ويشرح maintainer أن `AsyncXHRBuffer` مناسب للملفات الكبيرة المستضافة، لا لإنشاء قرص جديد، ويقترح buffer sparse يخلق أصفاراً عند القراءة من أجزاء غير مخصصة ويخزن فقط الكتل المكتوبة.

يكشف مصدر [`buffer.js`](https://raw.githubusercontent.com/copy/v86/master/src/buffer.js) أن واجهة buffer الفعلية للمحرك تتطلب `byteLength` و`load()` و`get(offset,len,callback)` و`set(offset,data,callback)` وطرق الحالة. الكتل الصغرى للمحرك 256 byte. لذلك يمكن لقرص JustGo حقيقي بسعة 20–64GiB أن يعرض السعة للضيف ويخصص محلياً فقط القطاعات التي تكتب، مع backing IndexedDB. لا يجوز تمثيل تلك السعات بمجرد عنصر واجهة أو `ArrayBuffer` كامل.

يبقى استخدام قرص sparse مع v86 عملاً تكاملياً: يحتاج تمرير buffer خاص متوافق مع عقد v86، وجدولة read/write في IndexedDB، واختبارات أن Windows يرى قرص ATA قابل للتقسيم والكتابة. لا يدّعي هذا المستند اكتمال هذا الربط.
