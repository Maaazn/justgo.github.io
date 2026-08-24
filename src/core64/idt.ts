import type { LongModeAddressSpace } from "./address-space";
import { isCanonicalAddress } from "./paging";
import type { Cpu64State } from "./registers";

export const RFLAGS_INTERRUPT_ENABLE = 1n << 9n;
const IDT_GATE_BYTES = 16n;

export interface LongModeIdtr {
  base: bigint;
  limit: number;
}

export interface LongModeIdtGate {
  vector: number;
  offset: bigint;
  selector: number;
  ist: number;
  type: "interrupt" | "trap";
  present: boolean;
}

export class LongModeIdtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LongModeIdtError";
  }
}

export function createLongModeIdtr(overrides: Partial<LongModeIdtr> = {}): LongModeIdtr {
  return { base: 0n, limit: 0, ...overrides };
}

function read16(memory: LongModeAddressSpace, address: bigint): number {
  return memory.read8(address, "read") | (memory.read8(address + 1n, "read") << 8);
}

function read32(memory: LongModeAddressSpace, address: bigint): number {
  let value = 0;
  for (let offset = 0; offset < 4; offset += 1) value |= memory.read8(address + BigInt(offset), "read") << (offset * 8);
  return value >>> 0;
}

function write64(memory: LongModeAddressSpace, address: bigint, value: bigint): void {
  for (let offset = 0; offset < 8; offset += 1) memory.write8(address + BigInt(offset), Number((value >> BigInt(offset * 8)) & 0xffn));
}

export function readLongModeIdtGate(memory: LongModeAddressSpace, idtr: LongModeIdtr, vector: number): LongModeIdtGate {
  if (!Number.isInteger(vector) || vector < 0 || vector > 255) throw new LongModeIdtError("رقم IDT vector يجب أن يقع بين 0 و255.");
  const offset = BigInt(vector) * IDT_GATE_BYTES;
  if (offset + IDT_GATE_BYTES - 1n > BigInt(idtr.limit)) throw new LongModeIdtError(`بوابة IDT للمتجه ${vector} تتجاوز حد IDTR.`);
  const address = idtr.base + offset;
  const low = read16(memory, address);
  const selector = read16(memory, address + 2n);
  const ist = memory.read8(address + 4n, "read") & 0x7;
  const attributes = memory.read8(address + 5n, "read");
  const gateType = attributes & 0xf;
  if (gateType !== 0xe && gateType !== 0xf) throw new LongModeIdtError(`بوابة IDT للمتجه ${vector} ليست interrupt أو trap gate.`);
  const middle = read16(memory, address + 6n);
  const high = read32(memory, address + 8n);
  const handler = BigInt(low) | (BigInt(middle) << 16n) | (BigInt(high) << 32n);
  if (!isCanonicalAddress(handler)) throw new LongModeIdtError(`عنوان معالج IDT للمتجه ${vector} ليس canonical.`);
  return { vector, offset: handler, selector, ist, type: gateType === 0xe ? "interrupt" : "trap", present: (attributes & 0x80) !== 0 };
}

export function pushLongModeInterruptFrame(
  memory: LongModeAddressSpace,
  state: Cpu64State,
  gate: LongModeIdtGate,
  options: { readonly returnRip: bigint; readonly errorCode?: number; readonly stackPointer?: bigint } = { returnRip: state.rip },
): void {
  if (!gate.present) throw new LongModeIdtError(`بوابة IDT للمتجه ${gate.vector} غير present.`);
  if (gate.selector === 0) throw new LongModeIdtError(`بوابة IDT للمتجه ${gate.vector} لا تحتوي code selector صالحاً.`);
  if ((gate.selector & 0x3) !== 0) throw new LongModeIdtError("انتقال امتياز IDT غير منفذ في Core-64 الحالي.");
  if (options.stackPointer !== undefined) state.rsp = options.stackPointer;
  const push = (value: bigint) => { state.rsp -= 8n; write64(memory, state.rsp, value); };
  push(state.rflags);
  push(BigInt(state.cs));
  push(options.returnRip);
  if (options.errorCode !== undefined) push(BigInt(options.errorCode >>> 0));
  state.rip = gate.offset;
  state.cs = gate.selector;
  if (gate.type === "interrupt") state.rflags &= ~RFLAGS_INTERRUPT_ENABLE;
  state.halted = false;
}

export function popLongModeIretFrame(memory: LongModeAddressSpace, state: Cpu64State): void {
  const pop = (): bigint => {
    let value = 0n;
    for (let offset = 0; offset < 8; offset += 1) value |= BigInt(memory.read8(state.rsp + BigInt(offset), "read")) << BigInt(offset * 8);
    state.rsp += 8n;
    return value;
  };
  const rip = pop();
  const cs = pop();
  const rflags = pop();
  if (!isCanonicalAddress(rip)) throw new LongModeIdtError("IRETQ استعاد RIP غير canonical.");
  if ((cs & 0x3n) !== 0n) throw new LongModeIdtError("IRETQ إلى privilege level مختلف غير منفذ في Core-64 الحالي.");
  state.rip = rip;
  state.cs = Number(cs & 0xffffn);
  state.rflags = rflags;
}
