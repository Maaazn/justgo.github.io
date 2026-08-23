import type { EngineIntegration, IntegrationDecision } from "./contracts";

export const ENGINE_INTEGRATIONS: readonly EngineIntegration[] = [
  {
    id: "justgo-core16",
    label: "JustGo Core-16",
    status: "active",
    origin: "justgo",
    sourceUrl: "./src/core16",
    license: "Project-owned source",
    noticeRequired: false,
    supportedArchitectures: ["x86 real mode (partial)"],
    allowedRoles: ["runtime-bridge", "test-oracle"],
    restrictions: ["ليس محرك 32-bit أو Windows، ولا يسمح الادعاء بخلاف ذلك."],
  },
  {
    id: "v86-bridge",
    label: "v86 runtime bridge",
    status: "active",
    origin: "third-party",
    sourceUrl: "https://github.com/copy/v86",
    license: "BSD-2-Clause with separately licensed dependencies",
    noticeRequired: true,
    supportedArchitectures: ["x86 WebAssembly"],
    allowedRoles: ["runtime-bridge"],
    restrictions: ["يستخدم عبر موصل معزول فقط.", "تحفظ إشعاراته وتراخيص تبعياته عند التوزيع."],
  },
  {
    id: "qemu-tcg-reference",
    label: "QEMU / TCG",
    status: "reference-only",
    origin: "third-party",
    sourceUrl: "https://gitlab.com/qemu-project/qemu",
    license: "QEMU GPLv2; TCG files have mixed licenses",
    noticeRequired: true,
    supportedArchitectures: ["multi-architecture"],
    allowedRoles: ["design-reference"],
    restrictions: ["لا تُنسخ شيفرة أو ملفات قبل تدقيق ترخيص الملف والتبعية على حدة."],
  },
  {
    id: "bochs-reference",
    label: "Bochs",
    status: "reference-only",
    origin: "third-party",
    sourceUrl: "https://github.com/bochs-emu/Bochs",
    license: "LGPL-2.1 with file-level exceptions",
    noticeRequired: true,
    supportedArchitectures: ["IA-32/x86"],
    allowedRoles: ["design-reference", "test-oracle"],
    restrictions: ["أي نقل أو دمج يفتح مراجعة LGPL كاملة وإشعار التعديلات."],
  },
] as const;

export function getIntegration(id: string): EngineIntegration {
  const integration = ENGINE_INTEGRATIONS.find((candidate) => candidate.id === id);
  if (!integration) throw new Error(`محرك التكامل غير معروف: ${id}`);
  return integration;
}

export function evaluateIntegration(integration: EngineIntegration, role: EngineIntegration["allowedRoles"][number], hasNotice: boolean): IntegrationDecision {
  const reasons: string[] = [];
  if (integration.status === "blocked") reasons.push("هذا التكامل محظور في JustGo.");
  if (integration.status === "reference-only" && role !== "design-reference" && role !== "test-oracle") reasons.push("المحرك مسموح كمرجع فقط، وليس مكوّناً تشغيلياً.");
  if (!integration.allowedRoles.includes(role)) reasons.push("الدور المطلوب ليس مصرحاً لهذا المحرك.");
  if (integration.noticeRequired && !hasNotice) reasons.push("يجب تسجيل إشعار الترخيص قبل تفعيل المكوّن.");
  return { allowed: reasons.length === 0, reasons };
}
