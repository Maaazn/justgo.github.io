# JustGo Core-64 — حالة المرحلة الأولى

## ما يعمل الآن

| الطبقة | الحالة | التحقق |
|---|---|---|
| السجلات | `RAX` حتى `R15` و`RIP` و`RFLAGS` عبر `BigInt` | اختبارات wrap وzero-extension |
| التحكم | CR0 وCR3 وCR4 وEFER وتسلسل readiness | اختبارات انتقال قانوني ومرفوض |
| الذاكرة | PML4 رباعي المستويات وصفحات 4KiB وعناوين canonical | اختبارات read/write ورفض page fault |
| الانتقال | نموذج protected → long mode مع code segment بعلم L أو descriptor GDT ضيف مقروء عبر PML4 | اختبارات transition وGDT حتمية |
| التعليمات | REX، MOV، ADD، SUB، CMP، HLT وIRETQ ضمن نطاق محدود | برامج ضيف 64-bit مصغرة |
| operands الذاكرة | ModR/M بقاعدة وإزاحة وSIB وRIP-relative لمسار MOV | اختبار نقل 64-bit عبر PML4 |
| الرسوميات | framebuffer RGBA فوق مساحة PML4 | اختبار pixel وsnapshot وحدود |
| الاستثناءات والمقاطعات | vectors وإطارات invalid opcode وGP وPF، وIDTR/IDT 64-bit وinterrupt/trap gates وIRETQ | اختبارات frame وIRQ وexception عبر PML4 |
| TSS/IST | اختيار IST محدود من TSS محمّل صراحةً، مع رفض انتقال privilege غير المدعوم | اختبار stack delivery ورفض الحدود |
| أجهزة المنصة | PIC 8259A مزدوج، PIT، CMOS/RTC وATA PIO LBA28؛ يمر IRQ0 وIRQ8 وIRQ14 عبر PIC إلى IDT | fixtures جدولة وEOI وIDT متكاملة |
| وسيط محلي | `Blob/File` يقرأ قطاعات 512 بايت عند الطلب ضمن cache محدود؛ ATA يبقى BSY حتى اكتمال prefetch في مرحلة التخزين | اختبارات عدم التعريض قبل cache وترتيب storage→PIC |
| replay | مقارنة trace مع snapshot معماري للسجلات وRIP/RSP/RFLAGS؛ fixture Core-64 متكرر يبين انحراف الحالة الأول | اختبارات repeat/divergence |

## القياس

ينفذ معيار Core-64 برنامجاً حتمياً من 8,001 تعليمة `REX.W ADD` موزعة على صفحات PML4 متعددة. هذه النتيجة تصف المفسر TypeScript الحالي فقط؛ لا تقارن بمحرك JIT ولا تشير إلى إمكانية تشغيل نظام تشغيل كامل.

## حدود صريحة

لا ينفذ Core-64 حتى الآن سوى جزء محدد من address forms في ModR/M ولا ينفذ انتقال امتياز كاملًا أو TSS hardware stack switching أو إطارات SS/RSP0. كما أن PIC/CMOS/ATA نماذج منصة محدودة بعقود منافذ واختبارات، وليست مسار إقلاع قرص أو توافق firmware كامل. لا توجد large pages أو NX أو USB guest controller أو نموذج IDT faults كامل أو مجموعة تعليمات كافية لنواة حديثة. لذلك لا يشغل Windows أو Linux حقيقيين حالياً، ولا يجب تقديمه على أنه يفعل ذلك. يظل الوسيط محلياً يختاره المستخدم ولا يُرفع أو يُضمَّن في المستودع.

## المراجع الهندسية

ترتيب long mode ومصفوفة العمل موثقان في [long-mode-roadmap.md](./long-mode-roadmap.md)، بينما نطاق إدخال/مخرجات المتصفح موثق في [compatibility-matrix.md](./compatibility-matrix.md).
