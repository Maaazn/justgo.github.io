# JustGo — الإدخال المتكيّف وكتالوج البيئات

## قرار الإدخال على iOS

لا يدعم Safari على iOS/iPadOS واجهة Pointer Lock، لذلك لا يجوز أن يعتمد JustGo عليها لإخفاء المؤشر أو قراءة الحركة الخام للماوس على iPhone أو iPad.[1] يعتمد التنفيذ على **Pointer Events** عند توفرها، مع `pointerType` للتمييز بين mouse وtouch وpen، ومع بديل لمس مباشر وإيماءات ظاهرة عندما يغيب الدعم أو يفشل الالتقاط. يتوفر دعم Pointer Events الكامل في iOS Safari 13.2 فأحدث، لذا يجب التعامل أيضاً مع `pointercancel` وتعيين `touch-action` بعناية.[2]

| القدرة | macOS ومتصفحات سطح المكتب المتوافقة | iPhone/iPad Safari |
|---|---|---|
| Pointer Lock | يستخدم عند موافقة المستخدم ونجاح الطلب | لا يعتمد عليه؛ غير مدعوم |
| Pointer Events | قناة الإدخال الموحدة | قناة الإدخال الأساسية على الإصدارات الحديثة |
| لمس مباشر | اختياري | بديل ضروري للمؤشر المقفل |
| عجلة ومفاتيح | تمرر إلى الشاشة الافتراضية عند الدعم | تمرر من أحداث الإدخال العادية، مع عدم ادعاء حركة خام |

## كتالوج البيئات المفتوحة

لن تضع JustGo صوراً ضخمة في Git. الكتالوج يصف البيئة وترخيصها ومصدرها، ثم يحمّل الأصل على الطلب من مصدر مشروع أو يقبل ملفاً محلياً يختاره المستخدم. قبل إعادة توزيع أي صورة، تراجع JustGo الرخصة الفعلية لكل إصدار ومكوّن، وتحفظ الإشعارات والمصدر المقابل حيث يلزم.

| البيئة | وضعها في الكتالوج | ملاحظة الترخيص |
|---|---|---|
| FreeDOS | اختبار x86 صغير | المشروع حزم متعددة التراخيص؛ لا يفترض ترخيصاً موحداً للصورة.[3] |
| ReactOS | مرشح لاختبار Windows-compatible مفتوح | أغلب الشفرة GPL مع مكونات أخرى؛ لا يعادل Windows 10 ولا يصبح مستقراً بذلك.[4] |
| KolibriOS | مرشح x86 صغير | GPLv2؛ تتطلب إعادة التوزيع التزامات النص والمصدر المقابل.[5] |
| Alpine Linux | مرشح لينكس خفيف لاحق | تراخيص على مستوى الحزمة وفق سياسة Alpine؛ لا تفترض ترخيصاً واحداً للنظام.[6] |

## سياسة ISO المحلي

يقبل JustGo، في مسار منفصل، ملف ISO أو صورة قرص من جهاز المستخدم فقط. لا يرفع الملف، ولا يضعه في Git أو IndexedDB أو التحليلات، ولا يبدأ الإقلاع إلا بعد تحقق محلي من نوع الملف وحدود الذاكرة وإقرار المستخدم. هذا مسار لا يعني تلقائياً أن المحرك يدعم كل نظام؛ توافق الإقلاع يظل نتيجة اختبار قابلة للقياس.

## المراجع

[1] [Pointer Lock API — Can I use](https://caniuse.com/pointerlock)

[2] [Pointer events — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)

[3] [FreeDOS development and licensing context](https://www.freedos.org/about/devel/)

[4] [ReactOS Intellectual Property Guideline](https://reactos.org/intellectual-property-guideline/)

[5] [KolibriOS download and GPLv2](https://kolibrios.org/en/download)

[6] [Alpine Linux package policies](https://wiki.alpinelinux.org/wiki/Package_policies)
