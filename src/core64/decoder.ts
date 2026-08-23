import type { Register64Name } from "./registers";

export interface RexPrefix {
  readonly raw: number;
  readonly w: boolean;
  readonly r: boolean;
  readonly x: boolean;
  readonly b: boolean;
}

const REGISTERS: readonly Register64Name[] = [
  "rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi",
  "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15",
];

export function decodeRex(byte: number): RexPrefix | undefined {
  if ((byte & 0xf0) !== 0x40) return undefined;
  return { raw: byte, w: (byte & 0x08) !== 0, r: (byte & 0x04) !== 0, x: (byte & 0x02) !== 0, b: (byte & 0x01) !== 0 };
}

export function register64(encoded: number, extension = false): Register64Name {
  return REGISTERS[(encoded & 7) | (extension ? 8 : 0)] ?? "rax";
}

export function signExtend32(value: number): bigint {
  const normalized = BigInt(value >>> 0);
  return (normalized & 0x8000_0000n) === 0n ? normalized : normalized - 0x1_0000_0000n;
}
