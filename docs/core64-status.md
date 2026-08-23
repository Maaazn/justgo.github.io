# JustGo Core-64 — حالة المرحلة الأولى

## ما يعمل الآن

| الطبقة | الحالة | التحقق |
|---|---|---|
| السجلات | `RAX` حتى `R15` و`RIP` و`RFLAGS` عبر `BigInt` | اختبارات wrap وzero-extension |
| التحكم | CR0 وCR3 وCR4 وEFER وتسلسل readiness | اختبارات انتقال قانوني ومرفوض |
| الذاكرة | PML4 رباعي المستويات وصفحات 4KiB وعناوين canonical | اختبارات read/write ورفض page fault |
| الانتقال | نموذج protected → long mode مع code segment بعلم L | اختبار transition حتمي |
| التعليمات | REX، MOV، ADD، SUB، CMP وHLT ضمن register/immediate محدود | برامج ضيف 64-bit مصغرة |
| الرسوميات | framebuffer RGBA فوق مساحة PML4 | اختبار pixel وsnapshot وحدود |
| الاستثناءات | vectors وإطارات invalid opcode وGP وPF | اختبارات vector والسياق |

## القياس

ينفذ معيار Core-64 برنامجاً حتمياً من 8,001 تعليمة `REX.W ADD` موزعة على صفحات PML4 متعددة. سجلت بيئة الاختبار الحالية `137.35ms`. هذه النتيجة تصف المفسر TypeScript الحالي فقط؛ لا تقارن بمحرك JIT ولا تشير إلى إمكانية تشغيل نظام تشغيل كامل.

## حدود صريحة

لا ينفذ Core-64 حتى الآن address forms في ModR/M أو IDT حقيقية أو exception delivery إلى guest أو interrupts 64-bit أو large pages أو NX أو firmware أو متحكم تخزين أو USB ضيف. لذلك لا يشغل Windows أو Linux حقيقياً حالياً، ولا يجب تقديمه على أنه يفعل ذلك. تُبنى الطبقات التالية فقط بعد اختبار كل عقد ومطابقته.

## المراجع الهندسية

ترتيب long mode ومصفوفة العمل موثقان في [long-mode-roadmap.md](./long-mode-roadmap.md)، بينما نطاق إدخال/مخرجات المتصفح موثق في [compatibility-matrix.md](./compatibility-matrix.md).
