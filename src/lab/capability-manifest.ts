/**
 * Machine-readable integration evidence for the native JustGo path. Entries
 * are accepted only when their modules, tests, and explicit limits are known.
 * This is a review contract, not a compatibility claim or a size target.
 */
export type CapabilityMaturity = "validated" | "partial" | "planned";

export interface JustGoCapability {
  readonly id: string;
  readonly label: string;
  readonly maturity: CapabilityMaturity;
  readonly modules: readonly string[];
  readonly tests: readonly string[];
  readonly evidence: string;
  readonly limits: readonly string[];
}

export const JUSTGO_CAPABILITY_MANIFEST: readonly JustGoCapability[] = [
  {
    id: "core64-memory-execution",
    label: "Core-64 memory and narrow execution",
    maturity: "validated",
    modules: ["src/core64/address-space.ts", "src/core64/cpu.ts", "src/core64/modrm.ts"],
    tests: ["tests/core64-cpu.test.ts", "tests/core64-paging.test.ts", "tests/core64-alu.test.ts"],
    evidence: "PML4 4KiB translation and a bounded REX/MOV/ALU/HLT interpreter run guest byte sequences.",
    limits: ["No complete x86-64 decoder.", "No large pages or NX."],
  },
  {
    id: "interrupt-delivery",
    label: "Core-64 IDT and platform interrupt delivery",
    maturity: "validated",
    modules: ["src/core64/idt.ts", "src/core64/tss.ts", "src/core64/pic-dispatch.ts"],
    tests: ["tests/core64-idt.test.ts"],
    evidence: "PIT, RTC, and ATA completion fixtures deliver PIC vectors into IDT gates and IRETQ frames.",
    limits: ["Ring-0-only delivery.", "No complete privilege transition or hardware TSS switching."],
  },
  {
    id: "local-storage-platform",
    label: "Local media and scheduled ATA PIO",
    maturity: "validated",
    modules: ["src/core16/local-media.ts", "src/core16/ata.ts", "src/core16/pic.ts"],
    tests: ["tests/ata.test.ts", "tests/deterministic-scheduler.test.ts", "tests/core64-idt.test.ts"],
    evidence: "Visitor-owned Blob sectors are prefetched on demand; BSY persists until storage pump completion then IRQ14 follows PIC→IDT.",
    limits: ["No DMA, AHCI, filesystem, partition, or boot-chain support.", "Blob promise completion is host-timed."],
  },
  {
    id: "deterministic-replay",
    label: "Deterministic scheduler and differential replay",
    maturity: "validated",
    modules: ["src/lab/deterministic-scheduler.ts", "src/lab/replay.ts", "src/lab/execution-corpus.ts"],
    tests: ["tests/deterministic-scheduler.test.ts", "tests/replay.test.ts"],
    evidence: "PS/2 batches, RTC/PIC events, watched memory, and registers are compared across scheduler runs.",
    limits: ["Only explicitly watched memory bytes are compared.", "Live local I/O timing is not forced during replay."],
  },
  {
    id: "os-boot-compatibility",
    label: "General operating-system boot compatibility",
    maturity: "planned",
    modules: [],
    tests: [],
    evidence: "No compatibility evidence is recorded.",
    limits: ["Windows and Linux boot are not supported claims.", "No BIOS/UEFI or complete storage boot stack."],
  },
];

export function validateCapabilityManifest(entries: readonly JustGoCapability[] = JUSTGO_CAPABILITY_MANIFEST): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) throw new Error("معرف قدرة JustGo مفقود أو مكرر.");
    ids.add(entry.id);
    if (!entry.evidence || entry.limits.length === 0) throw new Error(`قدرة JustGo ${entry.id} تفتقد الدليل أو الحدود.`);
    if (entry.maturity === "validated" && (entry.modules.length === 0 || entry.tests.length === 0)) throw new Error(`قدرة JustGo المثبتة ${entry.id} تحتاج وحدة واختباراً.`);
  }
}

export function capabilityById(id: string): JustGoCapability {
  const capability = JUSTGO_CAPABILITY_MANIFEST.find((entry) => entry.id === id);
  if (!capability) throw new Error(`قدرة JustGo غير معروفة: ${id}`);
  return capability;
}

export function publicationBlockers(entries: readonly JustGoCapability[] = JUSTGO_CAPABILITY_MANIFEST): readonly JustGoCapability[] {
  return entries.filter((entry) => entry.maturity !== "validated");
}
