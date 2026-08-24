# Core-64 Instruction Coverage Map

هذا المستند هو عقد توسعة للمفسر المحلي في JustGo، وليس ادعاء توافق مع نظام تشغيل. المرجع الدلالي لكل encoding والأعلام هو Intel SDM Volume 2؛ أما الحماية والمقاطعات والذاكرة فيرجع تصميمها إلى Volume 3 [1].

| العائلة | الحالة الحالية | الدليل التنفيذي | الأولوية التالية | معيار القبول |
|---|---|---|---|---|
| نقل البيانات | `MOV r, imm` و`MOV r/m, r` و`MOV r, r/m` و`MOV r/m, imm` | PML4 وModR/M واختبارات سجل وذاكرة | `LEA` وامتدادات الأحجام | برنامج ضيف يثبت register وmemory وRIP |
| الحساب والمنطق | `ADD` و`SUB` و`CMP` و`AND` و`OR` و`XOR` و`TEST` | ZF/SF/CF/OF في الاختبارات | immediates و`INC/DEC` وشروط Jcc إضافية | مقارنة أعلام منظمة مع corpus |
| التحكم والمكدس | `JMP` و`JZ/JNZ` و`CALL/RET` و`PUSH/POP` | return frame في ذاكرة مترجمة | Jcc الموسعة وindirect control transfer | trace يتطابق مع RIP وRSP وحالة الذاكرة |
| هوية المعالج | `CPUID` محافظ وحتمي | لا يعرض ميزات مضيف غير منفذة | leaves ذات contract فقط | لا تظهر feature bit قبل تنفيذها فعلاً |
| المقاطعات | IDT وIRETQ وPIC→IDT | اختبارات IRQ وIST محدودة | fault taxonomy وprivilege transitions | frame وحالة fault وعودة محددة |
| firmware/الإقلاع | غير مكتمل في المسار الأصلي | جسر v86 مستقل للتوافق العملي | E820 وA20 وINT 13h/15h وPOST corpus | boot trace مرخص ومحدد المرحلة |
| أجهزة المنصة | PIT/RTC/PIC/ATA PIO في طبقات محدودة | scheduler وreplay حتمي | PCI/ATAPI/ACPI وفق عقود منفصلة | IRQ وI/O trace واختبار device contract |

## قواعد التوسع

لا تدخل تعليمة إلى الحالة المنفذة إلا مع decoder، ودلالة عرض صحيحة، وأعلام موثقة، واختبار register أو memory، وحالة فشل واضحة لما لم ينفذ. لا يعد حجم المصدر أو حجم البناء معيار توافق.

يظل مسار **v86** جسراً مستقلاً لتشغيل وسائط المستخدم محلياً. ولا يحول تقدمه أو نقطة Windows Boot Manager إلى دليل أن Core-64 الأصلي صار محرك إقلاع كامل.

## References

[1]: https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html "Intel® 64 and IA-32 Architectures Software Developer Manuals"
