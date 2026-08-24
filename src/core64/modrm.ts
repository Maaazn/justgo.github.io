import type { RexPrefix } from "./decoder";
import { register64 } from "./decoder";
import { u64, type Register64Name } from "./registers";

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

export interface ModRmMemory64 {
  readonly reg: Register64Name;
  readonly address: bigint;
}

export interface ModRmByteReader {
  read8(): number;
  read32(): number;
  rip(): bigint;
}

function signed8(value: number): bigint { return BigInt(value & 0x80 ? value - 0x100 : value); }
function signed32(value: number): bigint { return BigInt(value & 0x8000_0000 ? value - 0x1_0000_0000 : value); }

/** Resolves 64-bit ModR/M memory forms, including SIB and RIP-relative addressing. */
export function decodeModRmMemory64(byte: number, rex: RexPrefix | undefined, reader: ModRmByteReader, valueOf: (register: Register64Name) => bigint): ModRmMemory64 {
  const mod = (byte >>> 6) & 3;
  if (mod === 3) throw new Error("ModR/M register form لا يملك عنوان ذاكرة.");
  const rmLow = byte & 7;
  const reg = register64((byte >>> 3) & 7, rex?.r ?? false);
  let base = 0n;
  let index = 0n;
  let displacement = 0n;
  if (rmLow === 4) {
    const sib = reader.read8();
    const scale = 1n << BigInt((sib >>> 6) & 3);
    const indexLow = (sib >>> 3) & 7;
    const baseLow = sib & 7;
    if (!(indexLow === 4 && !rex?.x)) index = valueOf(register64(indexLow, rex?.x ?? false)) * scale;
    if (mod === 0 && baseLow === 5) displacement = signed32(reader.read32());
    else base = valueOf(register64(baseLow, rex?.b ?? false));
  } else if (mod === 0 && rmLow === 5) {
    displacement = signed32(reader.read32());
    base = reader.rip(); // RIP points at the next instruction after displacement.
  } else base = valueOf(register64(rmLow, rex?.b ?? false));
  if (mod === 1) displacement += signed8(reader.read8());
  if (mod === 2) displacement += signed32(reader.read32());
  return { reg, address: u64(base + index + displacement) };
}
