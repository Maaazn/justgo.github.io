/**
 * JustGo Core-16 design: real-mode CPU state is isolated from UI and devices
 * so instruction semantics can be tested deterministically.
 */
export type Register16Name = "ax" | "cx" | "dx" | "bx" | "sp" | "bp" | "si" | "di";

export interface Cpu16State {
  ax: number;
  bx: number;
  cx: number;
  dx: number;
  sp: number;
  bp: number;
  si: number;
  di: number;
  cs: number;
  ds: number;
  es: number;
  ss: number;
  ip: number;
  flags: number;
  halted: boolean;
  steps: number;
}

/** Registers that become meaningful during the 386 transition. They are kept
 * separate from the real-mode interpreter until instruction support arrives. */
export interface CpuProtectionState {
  cr0: number;
  cr3: number;
  gdtrBase: number;
  gdtrLimit: number;
}

export interface StepTrace {
  address: number;
  opcode: number;
  mnemonic: string;
}

export const FLAG_CARRY = 1 << 0;
export const FLAG_PARITY = 1 << 2;
export const FLAG_AUXILIARY = 1 << 4;
export const FLAG_ZERO = 1 << 6;
export const FLAG_SIGN = 1 << 7;
export const FLAG_INTERRUPT = 1 << 9;
export const FLAG_DIRECTION = 1 << 10;
export const FLAG_OVERFLOW = 1 << 11;

export function u8(value: number): number {
  return value & 0xff;
}

export function u16(value: number): number {
  return value & 0xffff;
}

export function u32(value: number): number {
  return value >>> 0;
}

export function signed8(value: number): number {
  const normalized = u8(value);
  return normalized & 0x80 ? normalized - 0x100 : normalized;
}

export function signed16(value: number): number {
  const normalized = u16(value);
  return normalized & 0x8000 ? normalized - 0x10000 : normalized;
}

export function physicalAddress(segment: number, offset: number): number {
  return ((u16(segment) << 4) + u16(offset)) & 0xfffff;
}

export function createCpu16State(overrides: Partial<Cpu16State> = {}): Cpu16State {
  return {
    ax: 0,
    bx: 0,
    cx: 0,
    dx: 0,
    sp: 0xfffe,
    bp: 0,
    si: 0,
    di: 0,
    cs: 0,
    ds: 0,
    es: 0,
    ss: 0,
    ip: 0,
    flags: 0x0002,
    halted: false,
    steps: 0,
    ...overrides,
  };
}

export function createCpuProtectionState(overrides: Partial<CpuProtectionState> = {}): CpuProtectionState {
  return { cr0: 0, cr3: 0, gdtrBase: 0, gdtrLimit: 0, ...overrides };
}
