import type { LongModeIdtGate } from "./idt";
import { isCanonicalAddress } from "./paging";

/** Narrow long-mode TSS subset used solely for IDT IST stack selection. */
export interface LongModeTss {
  readonly ist: readonly bigint[];
}

export function createLongModeTss(overrides: Partial<LongModeTss> = {}): LongModeTss {
  return { ist: [0n, 0n, 0n, 0n, 0n, 0n, 0n], ...overrides };
}

export function selectInterruptStack(gate: LongModeIdtGate, tss: LongModeTss | undefined, currentRsp: bigint): bigint {
  if (gate.ist === 0) return currentRsp;
  const stack = tss?.ist[gate.ist - 1] ?? 0n;
  if (stack === 0n || !isCanonicalAddress(stack)) throw new Error(`IST${gate.ist} غير صالح لبوابة IDT ${gate.vector}.`);
  return stack;
}
