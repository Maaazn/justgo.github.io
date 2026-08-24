/**
 * JustGo memory policy: guest RAM is selected by the visitor and requested
 * directly from the active browser on every platform.
 */
export type GuestMemoryMiB = 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096;

export interface MemoryEnvironment {
  readonly isTouchFirst: boolean;
  readonly deviceMemoryGiB?: number;
}

export interface MemoryOption {
  readonly miB: GuestMemoryMiB;
  readonly label: string;
  readonly state: "available";
  readonly note?: string;
}

const MEMORY_TIERS: readonly GuestMemoryMiB[] = [32, 64, 128, 256, 512, 1024, 2048, 4096];

export function detectMemoryEnvironment(): MemoryEnvironment {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touchPoints = nav.maxTouchPoints ?? 0;
  const phoneOrTablet = /iPhone|iPad|iPod|Android/i.test(nav.userAgent);
  return { isTouchFirst: phoneOrTablet || touchPoints > 1, deviceMemoryGiB: nav.deviceMemory };
}

export function memoryOptions(environment: MemoryEnvironment): readonly MemoryOption[] {
  void environment;
  return MEMORY_TIERS.map((miB) => {
    const label = miB >= 1024 ? `${miB / 1024} GiB` : `${miB} MiB`;
    return { miB, label, state: "available", note: "يطلبها JustGo محلياً من المتصفح لهذه الجلسة." };
  });
}

export function memoryLaunchMessage(option: MemoryOption): string | undefined {
  void option;
  return undefined;
}
