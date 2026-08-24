# JustGo Core-64 — حالة المرحلة الأولى

## ما يعمل الآن

| الطبقة | الحالة | التحقق |
|---|---|---|
| السجلات | `RAX` حتى `R15` و`RIP` و`RFLAGS` عبر `BigInt` | اختبارات wrap وzero-extension |
| التحكم | CR0 وCR3 وCR4 وEFER وتسلسل readiness | اختبارات انتقال قانوني ومرفوض |
| الذاكرة | PML4 رباعي المستويات وصفحات 4KiB وعناوين canonical | اختبارات read/write ورفض page fault |
| الانتقال | نموذج protected → long mode مع code segment بعلم L | اختبار transition حتمي |
| التعليمات | REX، MOV، ADD، SUB، CMP، HLT وIRETQ ضمن نطاق محدود | برامج ضيف 64-bit مصغرة |
| operands الذاكرة | ModR/M بقاعدة وإزاحة وSIB وRIP-relative لمسار MOV | اختبار نقل 64-bit عبر PML4 |
| الرسوميات | framebuffer RGBA فوق مساحة PML4 | اختبار pixel وsnapshot وحدود |
| الاستثناءات والمقاطعات | vectors وإطارات invalid opcode وGP وPF، وIDTR/IDT 64-bit وinterrupt/trap gates وIRETQ | اختبارات frame وIRQ وexception عبر PML4 |

## القياس

ينفذ معيار Core-64 برنامجاً حتمياً من 8,001 تعليمة `REX.W ADD` موزعة على صفحات PML4 متعددة. سجلت بيئة الاختبار الحالية `137.35ms`. هذه النتيجة تصف المفسر TypeScript الحالي فقط؛ لا تقارن بمحرك JIT ولا تشير إلى إمكانية تشغيل نظام تشغيل كامل.

## حدود صريحة

لا ينفذ Core-64 حتى الآن سوى جزء محدد من address forms في ModR/M، ولا يملك انتقال امتياز أو TSS/IST stack switching أو PIC/CMOS/ATA أو large pages أو NX أو firmware أو متحكم تخزين أو USB ضيف. لذلك لا يشغل Windows أو Linux حقيقياً حالياً، ولا يجب تقديمه على أنه يفعل ذلك. تُبنى الطبقات التالية فقط بعد اختبار كل عقد ومطابقته.

## المراجع الهندسية

ترتيب long mode ومصفوفة العمل موثقان في [long-mode-roadmap.md](./long-mode-roadmap.md)، بينما نطاق إدخال/مخرجات المتصفح موثق في [compatibility-matrix.md](./compatibility-matrix.md).
