export type ContractMaturity = "foundation" | "verified" | "experimental" | "planned";

export interface EngineContract {
  readonly id: string;
  readonly milestone: "5k" | "20k" | "60k" | "200k" | "500k";
  readonly area: "execution" | "memory" | "devices" | "input" | "video" | "storage" | "diagnostics" | "integration" | "verification";
  readonly module: string;
  readonly maturity: ContractMaturity;
  readonly invariant: string;
  readonly verification: string;
  readonly measurement: string;
}

/**
 * This catalog is deliberately executable data, not a line-count promise.
 * Reports and CI can query every planned/implemented contract from one source.
 */
export const ENGINE_CONTRACTS: readonly EngineContract[] = [
  { id: "core16-step", milestone: "5k", area: "execution", module: "src/core16/cpu.ts", maturity: "verified", invariant: "One step emits one ordered decoded instruction or a defined fault.", verification: "tests/core16.test.ts", measurement: "instructions per deterministic program" },
  { id: "core16-cache-equivalence", milestone: "5k", area: "execution", module: "src/core16/block-cache.ts", maturity: "verified", invariant: "Cached blocks preserve interpreter guest state and invalidate written code pages.", verification: "tests/block-cache.test.ts; tests/execution-provider.test.ts", measurement: "cache hits and interpreter/cache ratio" },
  { id: "core64-address-space", milestone: "20k", area: "memory", module: "src/core64/paging.ts", maturity: "verified", invariant: "PML4 translation rejects non-canonical and unmapped addresses.", verification: "tests/core64-paging.test.ts", measurement: "page-walk coverage" },
  { id: "core64-instruction-subset", milestone: "20k", area: "execution", module: "src/core64/cpu.ts", maturity: "verified", invariant: "Supported REX register instructions mutate BigInt registers and flags deterministically.", verification: "tests/core64-cpu.test.ts; tests/core64-alu.test.ts", measurement: "REX.W instructions per benchmark" },
  { id: "ps2-queue", milestone: "20k", area: "input", module: "src/lab/deterministic-input.ts", maturity: "verified", invariant: "Host input reaches 8042 only when a scheduler tick consumes a FIFO batch.", verification: "tests/deterministic-input.test.ts; tests/deterministic-scheduler.test.ts", measurement: "events per tick and replay equality" },
  { id: "clock-order", milestone: "20k", area: "diagnostics", module: "src/lab/deterministic-scheduler.ts", maturity: "verified", invariant: "Input, CPU, PIT and video marker execute in a fixed order with no wall clock in trace.", verification: "tests/deterministic-scheduler.test.ts", measurement: "boot trace equality" },
  { id: "framebuffer-present", milestone: "20k", area: "video", module: "src/render/framebuffer-renderer.ts", maturity: "verified", invariant: "Renderer accepts validated RGBA only and cannot mutate guest CPU state.", verification: "tests/framebuffer-renderer.test.ts", measurement: "frames presented and fallback selection" },
  { id: "replay-corpus", milestone: "60k", area: "diagnostics", module: "src/lab/replay.ts", maturity: "planned", invariant: "Recorded input batches replay into an equivalent trace or report a first divergence.", verification: "tests/replay.test.ts", measurement: "replay divergence index" },
  { id: "modrm-addressing", milestone: "60k", area: "execution", module: "src/core64/modrm-memory.ts", maturity: "planned", invariant: "Address forms check canonicality, paging permissions and operand-size semantics.", verification: "tests/core64-modrm-memory.test.ts", measurement: "address-form coverage" },
  { id: "idt-delivery", milestone: "60k", area: "devices", module: "src/core64/idt.ts", maturity: "planned", invariant: "Exceptions and interrupts build architecturally ordered guest frames through a validated IDT.", verification: "tests/core64-idt.test.ts", measurement: "delivered vectors by class" },
  { id: "storage-controller", milestone: "200k", area: "storage", module: "src/devices/ata/", maturity: "planned", invariant: "Guest commands are bounded, sector-ordered and never upload local media.", verification: "tests/ata/", measurement: "sector reads, faults and latency buckets" },
  { id: "cpu-corpus", milestone: "200k", area: "execution", module: "src/verification/x86-corpus/", maturity: "planned", invariant: "Each adopted external test has a pinned license, source hash and adapter result.", verification: "tests/corpus/", measurement: "passed/blocked/skipped corpus cases" },
  { id: "differential-execution", milestone: "500k", area: "verification", module: "src/verification/differential/", maturity: "planned", invariant: "Selected programs compare state and trace against an approved reference implementation.", verification: "tests/differential/", measurement: "first divergence and reproducible seed" },
];

export function contractById(id: string): EngineContract | undefined {
  return ENGINE_CONTRACTS.find((contract) => contract.id === id);
}

export function contractsForMilestone(milestone: EngineContract["milestone"]): readonly EngineContract[] {
  return ENGINE_CONTRACTS.filter((contract) => contract.milestone === milestone);
}

export function validateContractCatalog(contracts: readonly EngineContract[] = ENGINE_CONTRACTS): void {
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (!/^[a-z0-9-]+$/.test(contract.id) || ids.has(contract.id)) throw new Error("معرّف عقد مكرر أو غير صالح.");
    ids.add(contract.id);
    if (!contract.module.startsWith("src/") || !contract.verification.startsWith("tests/")) throw new Error(`عقد ${contract.id} يحتاج مسار وحدة واختبار صريحين.`);
    if (!contract.invariant || !contract.measurement) throw new Error(`عقد ${contract.id} يحتاج invariant وقياساً.`);
  }
}
