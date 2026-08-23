import type { Register16Name } from "./types";

const REGISTER16: readonly Register16Name[] = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"];

export interface ModRmOperand {
  mod: number;
  reg: number;
  rm: number;
}

export function decodeModRm(byte: number): ModRmOperand {
  return { mod: (byte >>> 6) & 0x03, reg: (byte >>> 3) & 0x07, rm: byte & 0x07 };
}

export function register16(encoding: number): Register16Name {
  const name = REGISTER16[encoding & 0x07];
  if (!name) throw new Error(`ترميز سجل 16-bit غير صالح: ${encoding}.`);
  return name;
}
