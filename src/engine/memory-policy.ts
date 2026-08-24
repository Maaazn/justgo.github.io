/**
 * JustGo memory policy: guest RAM is an explicit browser budget, never an
 * implicit promise. Large tiers are opt-in desktop experiments, not mobile defaults.
 */
export type GuestMemoryMiB = 32 | 64 | 128 | 256 | 512 | 1024 | 2048;

export interface MemoryEnvironment {
  readonly isTouchFirst: boolean;
  readonly deviceMemoryGiB?: number;
}

export interface MemoryOption {
  readonly miB: GuestMemoryMiB;
  readonly label: string;
  readonly state: "available" | "confirmation" | "blocked";
  readonly note?: string;
}

const MEMORY_TIERS: readonly GuestMemoryMiB[] = [32, 64, 128, 256, 512, 1024, 2048];

export function detectMemoryEnvironment(): MemoryEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touchPoints = nav.maxTouchPoints ?? 0;
  const phoneOrTablet = /iPhone|iPad|iPod|Android/i.test(nav.userAgent);
  return { isTouchFirst: phoneOrTablet || touchPoints > 1, deviceMemoryGiB: nav.deviceMemory };
}

export function memoryOptions(environment: MemoryEnvironment): readonly MemoryOption[] {
  return MEMORY_TIERS.map((miB) => {
    const label = miB >= 1024 ? `${miB / 1024} GiB${miB === 2048 ? " (تجربة سطح مكتب)" : " (سطح مكتب)"}` : `${miB} MiB`;
    if (environment.isTouchFirst && miB > 512) {
      return { miB, label, state: "blocked", note: "محجوب على الهاتف/اللمس لحماية المتصفح من الحجز القسري." };
    }
    if (miB >= 1024) {
      return { miB, label, state: "confirmation", note: "يتطلب تأكيداً لأن الذاكرة تحجز داخل المتصفح وقد يفشل الجهاز المضيف." };
    }
    return { miB, label, state: "available" };
  });
}

export function memoryLaunchMessage(option: MemoryOption): string | undefined {
  if (option.state === "blocked") return option.note;
  if (option.state === "confirmation") return `سيحاول JustGo حجز ${option.label} لذاكرة الضيف داخل هذه العلامة. قد يرفض المتصفح الطلب أو ينهي الجلسة إذا لم تتوفر الذاكرة.`;
  return undefined;
}
