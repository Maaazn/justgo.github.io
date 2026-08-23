/**
 * Core-16 protected-mode foundation. These functions parse descriptors and
 * walk 32-bit page tables, but do not pretend that the interpreter executes
 * protected-mode instructions yet. Keeping them pure makes the 386 transition
 * measurable and testable before it changes CPU behaviour.
 */
import type { MemoryBus } from "./memory";
import { u32 } from "./types";

export type MemoryAccess = "read" | "write" | "execute";

export interface SegmentDescriptor {
  selector: number;
  base: number;
  limit: number;
  present: boolean;
  executable: boolean;
  writable: boolean;
  descriptorPrivilegeLevel: number;
  granularity4KiB: boolean;
}

export class ProtectionFault extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectionFault";
  }
}

export class PageFault extends Error {
  constructor(readonly linearAddress: number, message: string) {
    super(message);
    this.name = "PageFault";
  }
}

function read32(memory: MemoryBus, address: number): number {
  return u32(memory.read16(address) | (memory.read16(address + 2) << 16));
}

export function protectedModeEnabled(cr0: number): boolean {
  return (cr0 & 1) === 1;
}

export function pagingEnabled(cr0: number): boolean {
  return (u32(cr0) & 0x80000000) !== 0;
}

export function readSegmentDescriptor(memory: MemoryBus, gdtrBase: number, gdtrLimit: number, selector: number): SegmentDescriptor {
  const index = selector >>> 3;
  const offset = index * 8;
  if ((selector & 0x4) !== 0) throw new ProtectionFault("LDT selectors are not implemented in Core-16 yet.");
  if (index === 0) throw new ProtectionFault("The null segment selector cannot be loaded.");
  if (offset + 7 > gdtrLimit) throw new ProtectionFault("Segment selector exceeds the configured GDT limit.");

  const address = u32(gdtrBase + offset);
  const limitLow = memory.read16(address);
  const baseLow = memory.read16(address + 2);
  const baseMiddle = memory.read8(address + 4);
  const access = memory.read8(address + 5);
  const flagsAndLimit = memory.read8(address + 6);
  const baseHigh = memory.read8(address + 7);
  const granularity4KiB = (flagsAndLimit & 0x80) !== 0;
  const rawLimit = u32(limitLow | ((flagsAndLimit & 0x0f) << 16));

  return {
    selector,
    base: u32(baseLow | (baseMiddle << 16) | (baseHigh << 24)),
    limit: granularity4KiB ? u32((rawLimit << 12) | 0xfff) : rawLimit,
    present: (access & 0x80) !== 0,
    executable: (access & 0x08) !== 0,
    writable: (access & 0x02) !== 0,
    descriptorPrivilegeLevel: (access >>> 5) & 0x03,
    granularity4KiB,
  };
}

export function assertSegmentAccess(descriptor: SegmentDescriptor, offset: number, access: MemoryAccess): number {
  if (!descriptor.present) throw new ProtectionFault("The selected segment is not present.");
  if (u32(offset) > descriptor.limit) throw new ProtectionFault("Segment offset exceeds descriptor limit.");
  if (access === "execute" && !descriptor.executable) throw new ProtectionFault("Execution requires a code segment.");
  if (access === "write" && (!descriptor.writable || descriptor.executable)) throw new ProtectionFault("Write requires a writable data segment.");
  return u32(descriptor.base + offset);
}

export function translatePage32(memory: MemoryBus, cr3: number, linearAddress: number, access: MemoryAccess): number {
  const linear = u32(linearAddress);
  const directoryBase = u32(cr3) & 0xfffff000;
  const directoryIndex = linear >>> 22;
  const tableIndex = (linear >>> 12) & 0x03ff;
  const pde = read32(memory, directoryBase + directoryIndex * 4);
  if ((pde & 1) === 0) throw new PageFault(linear, "Page directory entry is not present.");
  if (access === "write" && (pde & 2) === 0) throw new PageFault(linear, "Page directory denies write access.");

  const tableBase = pde & 0xfffff000;
  const pte = read32(memory, tableBase + tableIndex * 4);
  if ((pte & 1) === 0) throw new PageFault(linear, "Page table entry is not present.");
  if (access === "write" && (pte & 2) === 0) throw new PageFault(linear, "Page table denies write access.");
  return u32((pte & 0xfffff000) | (linear & 0xfff));
}
