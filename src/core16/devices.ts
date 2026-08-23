/**
 * JustGo Core-16 design: device emulation is modeled through small, testable
 * buses. These are foundations, not a claim of complete PC compatibility.
 */
import type { MemoryBus } from "./memory";
import type { PortBus } from "./ports";
import { Ps2Controller } from "./ps2";
import { u8 } from "./types";

export interface InterruptSink {
  request(vector: number): void;
}

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

/**
 * A linear RGBA framebuffer mapped into guest memory. It is intentionally a
 * small graphics foundation, not a claim of a complete VGA register model.
 */
export class FrameBufferVga implements MemoryMappedDevice {
  readonly start = 0xa0000;
  readonly end: number;
  private readonly bytes: Uint8Array;

  constructor(readonly width = 320, readonly height = 200) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("أبعاد framebuffer غير صالحة.");
    const byteLength = width * height * 4;
    if (byteLength > 0x40000) throw new Error("حجم framebuffer يتجاوز نافذة الفيديو المتاحة في Core-16.");
    this.bytes = new Uint8Array(byteLength);
    this.end = this.start + byteLength - 1;
  }

  read8(offset: number): number { return this.bytes[offset] ?? 0; }
  write8(offset: number, value: number): void {
    if (offset < 0 || offset >= this.bytes.length) throw new Error("كتابة framebuffer خارج النطاق.");
    this.bytes[offset] = u8(value);
  }

  setPixel(x: number, y: number, rgba: readonly [number, number, number, number]): void {
    const offset = this.pixelOffset(x, y);
    rgba.forEach((channel, index) => { this.bytes[offset + index] = u8(channel); });
  }

  pixel(x: number, y: number): readonly [number, number, number, number] {
    const offset = this.pixelOffset(x, y);
    return [this.bytes[offset] ?? 0, this.bytes[offset + 1] ?? 0, this.bytes[offset + 2] ?? 0, this.bytes[offset + 3] ?? 0];
  }

  frame(): Uint8Array { return this.bytes.slice(); }

  private pixelOffset(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) throw new Error("بكسل framebuffer خارج النطاق.");
    return (y * this.width + x) * 4;
  }
}

/** Read-only firmware window for the 0xF0000–0xFFFFF system ROM region. */
export class FirmwareRom implements MemoryMappedDevice {
  readonly start: number;
  readonly end: number;
  readonly ignoredWrites: number[] = [];

  constructor(bytes: Uint8Array, start = 0x100000 - bytes.length) {
    if (bytes.length === 0 || bytes.length > 0x10000) throw new Error("حجم ROM firmware يجب أن يكون بين 1 و65536 بايت.");
    if (start < 0xf0000 || start + bytes.length > 0x100000) throw new Error("يجب أن يقع ROM firmware داخل نافذة النظام العليا.");
    this.bytes = bytes.slice();
    this.start = start;
    this.end = start + bytes.length - 1;
  }

  private readonly bytes: Uint8Array;

  read8(offset: number): number {
    return this.bytes[offset] ?? 0xff;
  }

  write8(_offset: number, value: number): void {
    this.ignoredWrites.push(u8(value));
  }
}

/** Builds a deterministic ROM whose x86 reset vector jumps to `entryOffset`. */
export function createResetVectorRom(entryOffset = 0): FirmwareRom {
  if (!Number.isInteger(entryOffset) || entryOffset < 0 || entryOffset > 0xfffb) throw new Error("مدخل ROM firmware خارج النطاق.");
  const bytes = new Uint8Array(0x10000).fill(0xf4);
  const vector = 0xfff0;
  bytes[vector] = 0xea; // far JMP ptr16:16
  bytes[vector + 1] = entryOffset & 0xff;
  bytes[vector + 2] = entryOffset >>> 8;
  bytes[vector + 3] = 0x00;
  bytes[vector + 4] = 0xf0;
  return new FirmwareRom(bytes, 0xf0000);
}

/**
 * Minimal programmable interval timer. The CPU scheduler supplies oscillator
 * ticks; each elapsed divisor period queues IRQ0. Port command decoding and
 * clock calibration remain a later device layer.
 */
export class ProgrammableIntervalTimer {
  static readonly OSCILLATOR_HZ = 1_193_182;
  private divisor = 65_536;
  private elapsed = 0;

  constructor(private readonly interrupts: InterruptSink, private readonly irqVector = 0x08) {}

  configureDivisor(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error("مقسّم PIT خارج النطاق.");
    this.divisor = value === 0 ? 65_536 : value;
    this.elapsed = 0;
  }

  advanceOscillatorTicks(ticks: number): number {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error("عدد نبضات PIT غير صالح.");
    this.elapsed += ticks;
    const interrupts = Math.floor(this.elapsed / this.divisor);
    this.elapsed %= this.divisor;
    for (let index = 0; index < interrupts; index += 1) this.interrupts.request(this.irqVector);
    return interrupts;
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

export interface PortDiagnostic {
  readonly direction: "in" | "out";
  readonly port: number;
  readonly value?: number;
}

export class DevicePortBus implements PortBus {
  readonly debugOutput: number[] = [];
  readonly ps2 = new Ps2Controller();
  readonly unsupportedPorts: PortDiagnostic[] = [];

  constructor(private readonly strictUnsupportedPorts = false) {}

  enqueueKeyboardScanCode(code: number): void {
    this.ps2.enqueueScanCode(code);
  }

  in8(port: number): number {
    const normalizedPort = port & 0xffff;
    if (normalizedPort === 0x60) return this.ps2.readData();
    if (normalizedPort === 0x64) return this.ps2.readStatus();
    this.reportUnsupported({ direction: "in", port: normalizedPort });
    return 0xff;
  }

  out8(port: number, value: number): void {
    const normalizedPort = port & 0xffff;
    if (normalizedPort === 0xe9) { this.debugOutput.push(u8(value)); return; }
    if (normalizedPort === 0x64) { this.ps2.writeControllerCommand(value); return; }
    if (normalizedPort === 0x60) { this.ps2.writeData(value); return; }
    this.reportUnsupported({ direction: "out", port: normalizedPort, value: u8(value) });
  }

  debugText(): string {
    return String.fromCharCode(...this.debugOutput);
  }

  private reportUnsupported(event: PortDiagnostic): void {
    this.unsupportedPorts.push(event);
    if (this.strictUnsupportedPorts) throw new Error(`منفذ I/O غير مدعوم: 0x${event.port.toString(16)}.`);
  }
}
