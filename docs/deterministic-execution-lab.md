# JustGo — مختبر التنفيذ الحتمي والعرض

## القرار المعماري

يحافظ محرك JustGo على حالة CPU والذاكرة والأجهزة وجدولة الأحداث في JavaScript/WebAssembly الحتمية. يستخدم WebGPU فقط لنقل الـframebuffer والرسم والقياسات الموازية الاختيارية، ولا ينفذ تعليمات x86 ولا يقرر ترتيب CPU أو المقاطعات. يظل Canvas 2D بديلاً متوافقاً عند عدم إتاحة WebGPU.

WebGPU متاح في سياقات آمنة فقط وتظل إتاحته غير موحدة بين المتصفحات، لذلك لا يجوز أن يكون متطلباً وحيداً لعرض JustGo.[1] تعتمد طبقة الرسم على `GPUAdapter` ثم `GPUDevice` ومورد texture/buffer واضح لكل إطار، بينما تنشأ موارد Canvas محلياً في مسار البديل.[1] [2]

## الساعة الحتمية

كل tick من المختبر يمر بالترتيب الآتي:

1. يسجل بداية tick ورقم الدورة الحالي.
2. ينفذ CPU حصة تعليمات ثابتة أو يصل إلى حدث مرئي.
3. يمرر الدورات إلى PIT ثم يعالج المقاطعات المعلقة في نقطة التسليم المحددة.
4. يستهلك إدخال PS/2 الذي وصل قبل tick نفسه فقط.
5. يوسم framebuffer dirty ثم يطلب الرسم دون تغيير حالة الضيف.
6. يضيف سجلاً منظماً قابلاً للمقارنة في إعادة التشغيل.

لا يعتمد ترتيب الخطوات على `requestAnimationFrame` أو وعد GPU؛ تلك عوامل عرض خارجية لا تدخل في ترتيب حالة الضيف.

## سجل الإقلاع

كل حدث يحمل `tick` و`sequence` و`source` و`kind` وبيانات صغيرة قابلة للتسلسل. تشمل المصادر CPU وPIT وPS/2 وmemory وvideo وrenderer. يفرق السجل بين خطأ ضيف معماري وخطأ مضيف أو فشل renderer، ولا يحول فشل WebGPU إلى فشل تشغيل CPU.

## قواعد WebGPU

عند توفره، يحمل WebGPU بيانات framebuffer عبر مورد مسمى ومجموعة debug لكل إطار. توصي مراجع Khronos باستخدام labels وdebug groups، ورفع buffers عبر `queue.writeBuffer()` عند الشك، وإنشاء pipelines بصورة غير متزامنة لتجنب توقف الواجهة.[2]

لا يطلب JustGo compute workload غير ظاهر للمستخدم ولا يحتفظ بقياسات GPU دقيقة في سجل الإقلاع. تحذر مواصفة WebGPU من أن موارد GPU عالمية ومحدودة وأن الحمل العالي قد يخضع لقيود أو watchdog من المتصفح.[3]

## المراجع

[1] [MDN — WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

[2] [Khronos — WebGPU Best Practices](https://www.khronos.org/developers/linkto/webgpu-best-practices)

[3] [W3C — WebGPU Specification](https://www.w3.org/TR/webgpu/)
