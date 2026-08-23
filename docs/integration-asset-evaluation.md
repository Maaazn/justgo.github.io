# JustGo — تقييم مكونات الاختصار والأصول الكبيرة

## قرار معماري

لا يُضاف ملف كبير لمجرد رفع حجم المستودع. الأصل أو المكوّن الكبير مقبول فقط إن كان له دور قابل للقياس في التشغيل أو الاختبار، وترخيص موثق، ومسار تخزين لا يربك clone العادي. صور الضيف والـfirmware المبنية وأي حزم تنفيذية تحفظ خارج Git العادي، مع checksum ومصدر واضح.

| المصدر | ما الذي يختصره | الرخصة/الحالة | قرار JustGo |
|---|---|---|---|
| [v86](https://github.com/copy/v86) | نموذج جهاز x86 واسع، أجهزة PIT وPS/2/VGA/IDE، وJIT إلى Wasm | BSD-2-Clause، مع تبعيات فرعية مرخصة منفصلة | يبقى موصل تشغيل اختياري ومرجع اختبار؛ لا تُنسخ وحداته إلى Core JustGo بلا عزل ومراجعة notices. |
| [v86: how it works](https://github.com/copy/v86/blob/master/docs/how-it-works.md) | نموذج hot pages وtwo-pass basic blocks وTLB/إبطال صفحات الكود | وثيقة هندسية للمشروع | تستخدم لتصميم مرحلة JIT لاحقة؛ لا تعني أن block-cache الحالي JIT أو Wasm مولّد. |
| [WebGPU](https://www.w3.org/TR/webgpu/) | واجهة GPU رسمية للـtexture/render/compute | مواصفة W3C، لا أصل runtime | تستخدم فقط لتقديم framebuffer أو عمل مرئي مبرر؛ لا تستبدل CPU emulator ولا تعمل في الخلفية. |
| [SeaBIOS](https://github.com/coreboot/seabios) | firmware x86 مفتوح المصدر متكامل | LGPL-3.0 | لا يدمج source أو binary افتراضياً. يمكن دراسة بناء artifact منفصل فقط بعد مراجعة التزامات LGPL والتوافق مع model الأجهزة. |
| [Bochs](https://github.com/bochs-emu/Bochs) | مرجع دقيق لأجهزة IA-32 ونماذج الاختبار | LGPL-2.1 | مرجع هندسي فقط حالياً؛ لا يُنسخ أو يدمج في المتصفح بلا مشروع ترخيص/port مستقل. |
| [verr](https://github.com/nepx/verr) | اختبارات self-checking صغيرة تدل عبر منفذ I/O | يجب تدقيق ملف LICENSE قبل إدخال ملفات | مرشح ممتاز لadapter اختبار منفصل، لا يحمّل كـasset كبير ولا يدمج قبل تثبيت رخصته. |
| [kvm-unit-tests](https://github.com/kvm-unit-tests/kvm-unit-tests) | corpus كبير لاختبارات CPU/ذاكرة/افتراضية | GPL-2.0 | مرجع لسيناريوهات الاختبار فقط. لا ينسخ إلى JustGo المرخص بصورة مختلفة. |

## ترابط المرحلة التالية

الأولوية ليست زيادة الشفرة؛ بل جعل tick الحتمي يمرر **مدخل PS/2 → CPU quota → PIT/IRQ → framebuffer dirty/frame-ready → trace**. يعالج renderer الخطأ محلياً كحدث عرض فقط، ولا يكتب سجلات الضيف أو يغير تسلسل CPU. هذا يتيح replay يصحح مشاكل الإقلاع قبل العمل على protected mode أو long mode الأوسع.

## سياسة الأحجام

إذا احتجنا صورة FreeDOS أو ReactOS أو artifact firmware أو corpus اختبار كبير، يوضع في مخزن كائنات/إصدار مرفق أو يختاره المستخدم محلياً. يوثق المصدر وSHA-256 والترخيص، ولا تُضمّن Windows أو مفاتيح أو أصول غير مخصصة للتوزيع. لا يتم تنزيل أو إضافة أي أصل في هذه المرحلة لمجرد الحجم.

## مراجع

[1] [v86 repository and license](https://github.com/copy/v86)  
[2] [v86 JIT architecture](https://github.com/copy/v86/blob/master/docs/how-it-works.md)  
[3] [W3C WebGPU specification](https://www.w3.org/TR/webgpu/)  
[4] [SeaBIOS repository](https://github.com/coreboot/seabios)  
[5] [Bochs repository](https://github.com/bochs-emu/Bochs)  
[6] [verr emulator tests](https://github.com/nepx/verr)  
[7] [KVM unit tests](https://github.com/kvm-unit-tests/kvm-unit-tests)
