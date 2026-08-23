/** JustGo Core-16 design: the 20-bit bus is explicit and wraps at 1 MiB. */
import { u8, u16 } from "./types";

export interface MemoryBus {
  read8(address: number): number;
  read16(address: number): number;
  write8(address: number, value: number): void;
  write16(address: number, value: number): void;
  load(address: number, bytes: Uint8Array): void;
  clear(): void;
}

const ADDRESS_MASK = 0xfffff;

export class LinearMemory implements MemoryBus {
  private readonly bytes = new Uint8Array(ADDRESS_MASK + 1);

  read8(address: number): number {
    return this.bytes[address & ADDRESS_MASK] ?? 0;
  }

  read16(address: number): number {
    return this.read8(address) | (this.read8(address + 1) << 8);
  }

  write8(address: number, value: number): void {
    this.bytes[address & ADDRESS_MASK] = u8(value);
  }

  write16(address: number, value: number): void {
    const normalized = u16(value);
    this.write8(address, normalized);
    this.write8(address + 1, normalized >>> 8);
  }

  load(address: number, bytes: Uint8Array): void {
    bytes.forEach((byte, index) => this.write8(address + index, byte));
  }

  clear(): void {
    this.bytes.fill(0);
  }
}
