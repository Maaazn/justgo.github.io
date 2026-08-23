import type { MemoryBus } from "../core16/memory";
import type { LongModeControlState } from "./control";
import { translatePml4, type LongModeAccess } from "./paging";

/** Binds PML4 translation to byte-level guest-memory access without a CPU decoder. */
export class LongModeAddressSpace {
  constructor(private readonly memory: MemoryBus, private readonly control: LongModeControlState) {}

  read8(virtualAddress: bigint, access: LongModeAccess = "read"): number {
    return this.memory.read8(this.toPhysicalNumber(virtualAddress, access));
  }

  write8(virtualAddress: bigint, value: number): void {
    this.memory.write8(this.toPhysicalNumber(virtualAddress, "write"), value);
  }

  private toPhysicalNumber(virtualAddress: bigint, access: LongModeAccess): number {
    const physical = translatePml4(this.memory, this.control.cr3, virtualAddress, access);
    if (physical > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("العنوان المادي يتجاوز تمثيل JustGo الحالي.");
    return Number(physical);
  }
}
