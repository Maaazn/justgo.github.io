import type { LongModeAddressSpace } from "./address-space";

export interface LongModeGdtr { readonly base: bigint; readonly limit: number; }

export interface LongModeGdtCodeDescriptor {
  readonly selector: number;
  readonly present: boolean;
  readonly executable: boolean;
  readonly longMode: boolean;
}

function read8(memory: LongModeAddressSpace, address: bigint): number { return memory.read8(address, "read"); }

/** Read the narrow code-segment subset needed by the current long-mode transition. */
export function readLongModeGdtCodeDescriptor(memory: LongModeAddressSpace, gdtr: LongModeGdtr, selector: number): LongModeGdtCodeDescriptor {
  if (!Number.isInteger(selector) || selector < 0 || (selector & 0x4) !== 0) throw new Error("selector GDT غير صالح في Core-64 الحالي.");
  const offset = selector & 0xfff8;
  if (offset === 0 || offset + 7 > gdtr.limit) throw new Error("descriptor GDT يتجاوز حد GDTR أو يشير إلى null.");
  const address = gdtr.base + BigInt(offset);
  const access = read8(memory, address + 5n);
  const flags = read8(memory, address + 6n);
  return { selector, present: (access & 0x80) !== 0, executable: (access & 0x18) === 0x18 && (access & 0x08) !== 0, longMode: (flags & 0x20) !== 0 };
}
