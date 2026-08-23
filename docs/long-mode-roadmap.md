# JustGo — خريطة long mode و64-bit

## الهدف

يضيف هذا المسار طبقة x86-64 قابلة للاختبار إلى JustGo. لا تعني الخريطة تشغيل Windows أو التوافق مع نظام كامل؛ هدفها الأول هو تمثيل انتقال المعالج والذاكرة بطريقة حتمية، ثم توسيع التعليمات والأجهزة على مراحل.

## ترتيب الانتقال

| الترتيب | وحدة JustGo | شرط النجاح |
|---:|---|---|
| 1 | `CpuFeatures` | يعلن CPUID دعم long mode وPAE بصورة قابلة للضبط في الاختبارات |
| 2 | `ControlRegisters` | يضبط CR4.PAE ويقبل CR3 المحاذي لصفحة |
| 3 | `LongModeMsrs` | يضبط EFER.LME فقط عبر واجهة MSR محددة |
| 4 | `Pml4Translator` | يمر عبر PML4 ثم PDPT ثم PD ثم PT ويطبق present/write/user بوضوح |
| 5 | `ModeTransition` | لا يفعّل LMA حتى تتوافر PAE وLME وCR0.PG وCR0.PE |
| 6 | `LongModeRegisters` | يضيف RAX–R15 وRIP وRFLAGS وRSP بعرض 64-bit |
| 7 | `LongModeDecoder` | يقرأ REX ثم مجموعة تعليمات ضيقة ومختبرة قبل أي توسع |

يشترط long mode paging رباعي المستويات، ويُفعّل PAE عبر CR4 قبل CR0.PG؛ ويعبر مؤشر الجذر من CR3 إلى PML4. ينتج عن اجتماع LME وPE وPG وPAE تفعيل حالة long mode الداخلية، ثم يحتاج التحول إلى 64-bit code segment في GDT قبل تنفيذ التعليمات ذات سجلات 64-bit.[1] [2]

## تقسيم الشيفرة والاختبارات

لا يُقاس التقدم بعدد الأسطر. كل وحدة تضاف مع ثلاث طبقات على الأقل: اختبار قيمة صالحة، اختبار حالة انتقال أو حد، واختبار رفض واضح لحالة غير قانونية. وتضاف القياسات فقط إلى مسارات يمكن تكرارها، مثل ترجمة عنوان أو تنفيذ كتلة تعليمات.

| الحزمة | الدور | الاختبارات المطلوبة |
|---|---|---|
| `core64/registers` | سجلات 64-bit وعمليات mask/sign | عرض السجل والجزء الأدنى وامتداد الإشارة |
| `core64/control` | CR0/CR3/CR4 وEFER | تسلسل قانوني وحالات رفض |
| `core64/paging` | PML4 وترجمة 4KiB | كل مستوى، present، write، canonical address |
| `core64/decoder` | REX/opcodes | تعليمات مدعومة ورفض opcode غير مطبق |
| `core64/interrupts` | إطار IDT طويل | vector وstack frame لاحقاً |
| `tests/fixtures` | برامج ضيف صغيرة | انتقال mode وكتابة framebuffer وتعامل مع fault |

## حدود المرحلة

لا تدخل 5-level paging أو SMP أو USB controller guest أو firmware خارجي في مرحلة long mode الأولى. كما أن 64-bit code لا يغني عن أجهزة التخزين والعرض والاستثناءات اللازمة لنظام تشغيل حقيقي.

## المراجع

[1] [OSDev Wiki — Setting Up Long Mode](https://wiki.osdev.org/Setting_Up_Long_Mode)

[2] [AMD64 Architecture Programmer’s Manual, Volume 2](https://bluewaters.ncsa.illinois.edu/liferay-content/document-library/amd_2_24593.pdf)
