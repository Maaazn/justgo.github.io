import type { RexPrefix } from "./decoder";
import { register64 } from "./decoder";
import type { Register64Name } from "./registers";

export interface ModRm64 {
  readonly mod: number;
  readonly reg: Register64Name;
  readonly rm: Register64Name;
}

export class UnsupportedCore64AddressingError extends Error {
  constructor(opcode: number, mod: number) {
    super(`نمط ModR/M ذاكرة غير مدعوم بعد في Core-64 للتعليمة 0x${opcode.toString(16)} (mod=${mod}).`);
    this.name = "UnsupportedCore64AddressingError";
  }
}

export function decodeModRm64(byte: number, rex: RexPrefix | undefined, opcode: number): ModRm64 {
  const mod = (byte >>> 6) & 3;
  if (mod !== 3) throw new UnsupportedCore64AddressingError(opcode, mod);
  return { mod, reg: register64((byte >>> 3) & 7, rex?.r ?? false), rm: register64(byte & 7, rex?.b ?? false) };
}
