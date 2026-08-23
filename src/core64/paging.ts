import type { MemoryBus } from "../core16/memory";

export type LongModeAccess = "read" | "write" | "execute";

export class LongModePageFault extends Error {
  constructor(readonly virtualAddress: bigint, message: string) {
    super(message);
    this.name = "LongModePageFault";
  }
}

const PRESENT = 1n;
const WRITABLE = 1n << 1n;
const ADDRESS_MASK = 0x000f_ffff_ffff_f000n;
const PAGE_OFFSET_MASK = 0xfffn;

function read64(memory: MemoryBus, address: number): bigint {
  let value = 0n;
  for (let byte = 0; byte < 8; byte += 1) value |= BigInt(memory.read8(address + byte)) << BigInt(byte * 8);
  return value;
}

function tableAddress(entry: bigint, virtualAddress: bigint, level: string): number {
  const address = entry & ADDRESS_MASK;
  if (address > BigInt(Number.MAX_SAFE_INTEGER)) throw new LongModePageFault(virtualAddress, `${level} يشير إلى عنوان مادي خارج تمثيل JustGo الحالي.`);
  return Number(address);
}

function requireEntry(entry: bigint, virtualAddress: bigint, level: string, access: LongModeAccess): void {
  if ((entry & PRESENT) === 0n) throw new LongModePageFault(virtualAddress, `${level} غير موجود.`);
  if (access === "write" && (entry & WRITABLE) === 0n) throw new LongModePageFault(virtualAddress, `${level} يمنع الكتابة.`);
}

export function isCanonicalAddress(address: bigint): boolean {
  const high = (address >> 48n) & 0xffffn;
  return high === 0n || high === 0xffffn;
}

/** Walks 4-level 4KiB paging. Large pages and NX are deliberate later stages. */
export function translatePml4(memory: MemoryBus, cr3: bigint, virtualAddress: bigint, access: LongModeAccess): bigint {
  if (!isCanonicalAddress(virtualAddress)) throw new LongModePageFault(virtualAddress, "العنوان الافتراضي ليس canonical في long mode.");
  if ((cr3 & 0xfffn) !== 0n) throw new LongModePageFault(virtualAddress, "CR3 غير محاذٍ إلى صفحة.");
  const indexes = [39n, 30n, 21n, 12n].map((shift) => Number((virtualAddress >> shift) & 0x1ffn));
  const names = ["PML4E", "PDPTE", "PDE", "PTE"];
  let table = tableAddress(cr3, virtualAddress, "CR3");
  for (let index = 0; index < indexes.length; index += 1) {
    const entry = read64(memory, table + indexes[index] * 8);
    requireEntry(entry, virtualAddress, names[index] ?? "entry", access);
    if (index === indexes.length - 1) return (entry & ADDRESS_MASK) | (virtualAddress & PAGE_OFFSET_MASK);
    table = tableAddress(entry, virtualAddress, names[index] ?? "entry");
  }
  throw new LongModePageFault(virtualAddress, "فشل مسار PML4 بصورة غير متوقعة.");
}
