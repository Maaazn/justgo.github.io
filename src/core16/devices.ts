/**
 * JustGo Core-16 design: device emulation is modeled through small, testable
 * buses. These are foundations, not a claim of complete PC compatibility.
 */
import type { MemoryBus } from "./memory";
import type { PortBus } from "./ports";
import { u8 } from "./types";

export interface MemoryMappedDevice {
  readonly start: number;
  readonly end: number;
  read8(offset: number): number;
  write8(offset: number, value: number): void;
}

export class MappedMemory implements MemoryBus {
  constructor(private readonly ram: MemoryBus, private readonly devices: readonly MemoryMappedDevice[]) {}

  read8(address: number): number {
    const device = this.find(address);
    return device ? device.read8(address - device.start) : this.ram.read8(address);
  }

  read16(address: number): number {
    return this.read8(address) | (this.read8(address + 1) << 8);
  }

  write8(address: number, value: number): void {
    const device = this.find(address);
    if (device) device.write8(address - device.start, value);
    else this.ram.write8(address, value);
  }

  write16(address: number, value: number): void {
    this.write8(address, value);
    this.write8(address + 1, value >>> 8);
  }

  load(address: number, bytes: Uint8Array): void {
    bytes.forEach((byte, index) => this.write8(address + index, byte));
  }

  clear(): void {
    this.ram.clear();
  }

  private find(address: number): MemoryMappedDevice | undefined {
    const physical = address & 0xfffff;
    return this.devices.find((device) => physical >= device.start && physical <= device.end);
  }
}

export class TextModeVga implements MemoryMappedDevice {
  readonly start = 0xb8000;
  readonly end = this.start + 80 * 25 * 2 - 1;
  private readonly bytes = new Uint8Array(80 * 25 * 2);

  read8(offset: number): number { return this.bytes[offset] ?? 0; }
  write8(offset: number, value: number): void { this.bytes[offset] = u8(value); }

  line(row: number): string {
    if (row < 0 || row >= 25) throw new Error("صف VGA خارج النطاق.");
    return Array.from({ length: 80 }, (_, column) => {
      const code = this.bytes[(row * 80 + column) * 2] ?? 32;
      return String.fromCharCode(code || 32);
    }).join("");
  }
}

export class SectorDisk {
  private readonly bytes: Uint8Array;

  constructor(sectors: number, readonly sectorSize = 512) {
    if (!Number.isInteger(sectors) || sectors <= 0) throw new Error("يجب أن يحتوي القرص على قطاع واحد على الأقل.");
    this.bytes = new Uint8Array(sectors * sectorSize);
  }

  readSector(index: number): Uint8Array {
    const start = this.offset(index);
    return this.bytes.slice(start, start + this.sectorSize);
  }

  writeSector(index: number, contents: Uint8Array): void {
    if (contents.length !== this.sectorSize) throw new Error("حجم بيانات القطاع غير صحيح.");
    this.bytes.set(contents, this.offset(index));
  }

  private offset(index: number): number {
    const offset = index * this.sectorSize;
    if (!Number.isInteger(index) || index < 0 || offset >= this.bytes.length) throw new Error("قطاع قرص خارج النطاق.");
    return offset;
  }
}

export class DevicePortBus implements PortBus {
  readonly debugOutput: number[] = [];
  private readonly keyboard: number[] = [];

  enqueueKeyboardScanCode(code: number): void {
    this.keyboard.push(u8(code));
  }

  in8(port: number): number {
    if ((port & 0xffff) === 0x60) return this.keyboard.shift() ?? 0;
    return 0xff;
  }

  out8(port: number, value: number): void {
    if ((port & 0xffff) === 0xe9) this.debugOutput.push(u8(value));
  }

  debugText(): string {
    return String.fromCharCode(...this.debugOutput);
  }
}
