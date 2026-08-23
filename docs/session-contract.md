# JustGo Session Contract v0

## المبادئ

العقدة لا تنشئ جلسة عند النقر مباشرة من غير تحقق. تمر الجلسة بمسار محدد، ولا يتلقى العميل إلا معرفاً عاماً قصير العمر ومعلومات الإشارة. لا تظهر عناوين الشبكة الخاصة أو أسرار TURN أو معرفات المضيف للعميل.

## أحداث Gateway

| الحدث | المرسل | البيانات الدنيا |
|---|---|---|
| `session.request` | العميل | رابط، runtime، viewport |
| `session.queued` | Gateway | معرف عام، موضع تقريبي، مهلة |
| `session.ready` | Gateway | معرف عام، انتهاء الرمز، URL الإشارة |
| `stream.offer` | العميل | SDP offer بعد التفويض |
| `stream.answer` | Gateway | SDP answer بعد تصفية المضيف |
| `session.heartbeat` | العميل | معرف عام، رقم تسلسلي |
| `session.ended` | Gateway | سبب عام فقط |

## مدخلات القناة

يقتصر بروتوكول الإدخال على أحداث منخفضة المستوى، وتطبّق كل رسالة حدود حجم ومعدل.

```ts
type InputEvent =
  | { kind: "pointer"; x: number; y: number; buttons: number; sequence: number }
  | { kind: "wheel"; deltaX: number; deltaY: number; sequence: number }
  | { kind: "key"; code: string; action: "down" | "up"; sequence: number }
  | { kind: "viewport"; width: number; height: number; dpr: number; sequence: number }
  | { kind: "heartbeat"; sequence: number };
```

لا يحتوي البروتوكول على قناة ملفات، ولا يرسل محتوى الحافظة في الإصدار الأول.

## الإنهاء

تنتهي الجلسة عند غياب heartbeat، تجاوز المدة، نفاد الحصة، طلب المستخدم الإغلاق، أو فشل صحة المضيف. في كل حالة، يبطل Gateway الرمز ثم يأمر Host Adapter بالتدمير، ثم يسجل سبباً تشغيلياً غير حساس.
