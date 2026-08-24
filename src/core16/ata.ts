/** ATA primary-channel PIO read core: LBA28, sector count, DRQ FIFO and IRQ14. */
import type { InterruptSink } from "./devices";
import { LocalMediaSectorCache } from "./local-media";
import { u8 } from "./types";

export interface AtaBlockMedia { readonly sectorSize: number; readonly sectorCount: number; readSector(index: number): Uint8Array; }

/**
 * Bridges visitor-owned asynchronous Blob storage to synchronous ATA PIO.
 * The scheduler must call prefetch before a guest command exposes DRQ.
 */
export class PrefetchedAtaMedia implements AtaBlockMedia {
  readonly sectorSize = 512;

  constructor(private readonly cache: LocalMediaSectorCache, readonly sectorCount: number) {
    if (!Number.isInteger(sectorCount) || sectorCount <= 0) throw new Error("عدد قطاعات وسيط ATA المسبق غير صالح.");
  }

  async prefetch(index: number): Promise<Uint8Array> { return this.cache.prefetch(index); }
  readSector(index: number): Uint8Array { return this.cache.readCached(index); }
}

export class AtaPioDevice {
  static readonly DATA = 0x1f0;
  static readonly SECTOR_COUNT = 0x1f2;
  static readonly LBA_LOW = 0x1f3;
  static readonly LBA_MID = 0x1f4;
  static readonly LBA_HIGH = 0x1f5;
  static readonly DRIVE = 0x1f6;
  static readonly STATUS_COMMAND = 0x1f7;
  static readonly STATUS_DRQ = 0x08;
  static readonly STATUS_ERR = 0x01;
  static readonly STATUS_RDY = 0x40;
  private sectorCount = 0;
  private lbaLow = 0;
  private lbaMid = 0;
  private lbaHigh = 0;
  private drive = 0xe0;
  private status = AtaPioDevice.STATUS_RDY;
  private fifo: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private cursor = 0;
  private sectorsRemaining = 0;
  private nextLba = 0;

  constructor(private readonly media: AtaBlockMedia, private readonly interrupts: InterruptSink, private readonly irqVector = 0x76) {
    if (media.sectorSize !== 512) throw new Error("ATA PIO في هذه المرحلة يتطلب قطاعات 512 بايت.");
  }

  in8(port: number): number {
    switch (port & 0xffff) {
      case AtaPioDevice.DATA: return this.readData();
      case AtaPioDevice.SECTOR_COUNT: return this.sectorCount;
      case AtaPioDevice.LBA_LOW: return this.lbaLow;
      case AtaPioDevice.LBA_MID: return this.lbaMid;
      case AtaPioDevice.LBA_HIGH: return this.lbaHigh;
      case AtaPioDevice.DRIVE: return this.drive;
      case AtaPioDevice.STATUS_COMMAND: return this.status;
      default: throw new Error(`منفذ ATA غير صالح: 0x${port.toString(16)}.`);
    }
  }

  out8(port: number, value: number): void {
    const data = u8(value);
    switch (port & 0xffff) {
      case AtaPioDevice.SECTOR_COUNT: this.sectorCount = data; return;
      case AtaPioDevice.LBA_LOW: this.lbaLow = data; return;
      case AtaPioDevice.LBA_MID: this.lbaMid = data; return;
      case AtaPioDevice.LBA_HIGH: this.lbaHigh = data; return;
      case AtaPioDevice.DRIVE: this.drive = data; return;
      case AtaPioDevice.STATUS_COMMAND: this.command(data); return;
      default: throw new Error(`منفذ ATA غير صالح: 0x${port.toString(16)}.`);
    }
  }

  snapshot(): Readonly<{ status: number; lba: number; sectorsRemaining: number; fifoBytesRemaining: number }> {
    return { status: this.status, lba: this.nextLba, sectorsRemaining: this.sectorsRemaining, fifoBytesRemaining: Math.max(0, this.fifo.length - this.cursor) };
  }

  private command(command: number): void {
    this.status = AtaPioDevice.STATUS_RDY;
    if (command !== 0x20) { this.status |= AtaPioDevice.STATUS_ERR; return; }
    if ((this.drive & 0x40) === 0) { this.status |= AtaPioDevice.STATUS_ERR; return; }
    this.nextLba = ((this.drive & 0x0f) << 24) | (this.lbaHigh << 16) | (this.lbaMid << 8) | this.lbaLow;
    this.sectorsRemaining = this.sectorCount === 0 ? 256 : this.sectorCount;
    this.loadNextSector();
  }

  private readData(): number {
    if ((this.status & AtaPioDevice.STATUS_DRQ) === 0) return 0xff;
    const value = this.fifo[this.cursor++] ?? 0xff;
    if (this.cursor >= this.fifo.length) {
      this.sectorsRemaining -= 1;
      this.nextLba += 1;
      if (this.sectorsRemaining > 0) this.loadNextSector();
      else { this.status = AtaPioDevice.STATUS_RDY; this.interrupts.request(this.irqVector); }
    }
    return value;
  }

  private loadNextSector(): void {
    if (this.nextLba < 0 || this.nextLba >= this.media.sectorCount) { this.status = AtaPioDevice.STATUS_RDY | AtaPioDevice.STATUS_ERR; this.interrupts.request(this.irqVector); return; }
    this.fifo = this.media.readSector(this.nextLba);
    this.cursor = 0;
    this.status = AtaPioDevice.STATUS_RDY | AtaPioDevice.STATUS_DRQ;
    this.interrupts.request(this.irqVector);
  }
}
