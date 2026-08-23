/**
 * JustGo Core-64 register model. BigInt avoids silent precision loss while
 * retaining explicit unsigned 64-bit wrapping at the architecture boundary.
 */
export type Register64Name =
  | "rax" | "rbx" | "rcx" | "rdx" | "rsi" | "rdi" | "rbp" | "rsp"
  | "r8" | "r9" | "r10" | "r11" | "r12" | "r13" | "r14" | "r15";

export interface Cpu64State {
  rax: bigint; rbx: bigint; rcx: bigint; rdx: bigint;
  rsi: bigint; rdi: bigint; rbp: bigint; rsp: bigint;
  r8: bigint; r9: bigint; r10: bigint; r11: bigint;
  r12: bigint; r13: bigint; r14: bigint; r15: bigint;
  rip: bigint;
  rflags: bigint;
  halted: boolean;
  steps: number;
}

export const U64_MASK = 0xffff_ffff_ffff_ffffn;
export const U32_MASK = 0xffff_ffffn;

export function u64(value: bigint): bigint { return value & U64_MASK; }
export function low32(value: bigint): number { return Number(value & U32_MASK); }
export function write32ZeroExtended(value: bigint): bigint { return value & U32_MASK; }

export function createCpu64State(overrides: Partial<Cpu64State> = {}): Cpu64State {
  return {
    rax: 0n, rbx: 0n, rcx: 0n, rdx: 0n, rsi: 0n, rdi: 0n, rbp: 0n, rsp: 0n,
    r8: 0n, r9: 0n, r10: 0n, r11: 0n, r12: 0n, r13: 0n, r14: 0n, r15: 0n,
    rip: 0n, rflags: 0x2n, halted: false, steps: 0, ...overrides,
  };
}
