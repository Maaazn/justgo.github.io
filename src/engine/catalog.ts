import type { LocalImageDescriptor } from "./contracts";

/**
 * JustGo Local Engine design: catalog records provenance and support level;
 * no proprietary OS image is included in this repository.
 */
export const LOCAL_IMAGES: readonly LocalImageDescriptor[] = [
  {
    id: "freedos-demo",
    label: "FreeDOS — صورة اختبار x86",
    family: "freedos",
    format: "hard-disk",
    source: "external-demo",
    imageUrl: "https://raw.githubusercontent.com/copy/images/master/freedos722.img",
    terms: "صورة اختبار عامة مستخدمة لتأكيد المحرك؛ لا تمثل Windows أو بديلاً عنه.",
    supportLevel: "verified-demo",
  },
  {
    id: "reactos-experimental",
    label: "ReactOS — Windows-compatible Alpha",
    family: "reactos",
    format: "cdrom",
    source: "future-hosted",
    terms: "ReactOS مشروع GPL Alpha. لا تُضمَّن صورة هنا قبل اختبارها والتحقق من مصدرها وتوافقها.",
    supportLevel: "not-bundled",
  },
  {
    id: "custom-local-image",
    label: "صورة x86 تختارها أنت",
    family: "custom",
    format: "hard-disk",
    source: "user-provided",
    terms: "لا تُشغّل إلا صورة لديك حق استخدامها. يمنع المشروع رفعها أو توزيعها تلقائياً.",
    supportLevel: "experimental",
  },
] as const;

export function getImageById(id: string): LocalImageDescriptor {
  const image = LOCAL_IMAGES.find((candidate) => candidate.id === id);
  if (!image) {
    throw new Error("بيئة التشغيل المطلوبة غير موجودة في كتالوج JustGo.");
  }
  return image;
}
