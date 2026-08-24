/** ATA primary-channel PIO read core: LBA28, sector count, DRQ FIFO and IRQ14. */
import type { InterruptSink } from "./devices";
import { LocalMediaSectorCache } from "./local-media";
import { u8 } from "./types";

export interface AtaBlockMedia { readonly sectorSize: number; readonly sectorCount: number; readSector(index: number): Uint8Array; }
export interface AsyncAtaBlockMedia { readonly sectorSize: number; readonly sectorCount: number; prefetch(index: number): Promise<Uint8Array>; readSector(index: number): Uint8Array; }
export interface AtaPortDevice { in8(port: number): number; out8(port: number, value: number): void; }
export interface AtaStorageEvent { readonly kind: "ata.prefetch.ready" | "ata.prefetch.error"; readonly lba: number; }

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

/**
 * Scheduler-owned ATA PIO read path for a visitor-selected local image.
 * Port writes only queue asynchronous File prefetch work. The storage phase is
 * the sole point that exposes DRQ and signals completion, so guest execution
 * never blocks on Blob I/O or observes a sector before it is cached.
 */
export class ScheduledAtaPioDevice implements AtaPortDevice {
  static readonly DATA = AtaPioDevice.DATA;
  static readonly SECTOR_COUNT = AtaPioDevice.SECTOR_COUNT;
  static readonly LBA_LOW = AtaPioDevice.LBA_LOW;
  static readonly LBA_MID = AtaPioDevice.LBA_MID;
  static readonly LBA_HIGH = AtaPioDevice.LBA_HIGH;
  static readonly DRIVE = AtaPioDevice.DRIVE;
  static readonly STATUS_COMMAND = AtaPioDevice.STATUS_COMMAND;
  static readonly STATUS_DRQ = AtaPioDevice.STATUS_DRQ;
  static readonly STATUS_ERR = AtaPioDevice.STATUS_ERR;
  static readonly STATUS_RDY = AtaPioDevice.STATUS_RDY;
  static readonly STATUS_BSY = 0x80;
  private sectorCount = 0;
  private lbaLow = 0;
  private lbaMid = 0;
  private lbaHigh = 0;
  private drive = 0xe0;
  private status = ScheduledAtaPioDevice.STATUS_RDY;
  private fifo: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private cursor = 0;
  private sectorsRemaining = 0;
  private nextLba = 0;
  private pendingLba: number | undefined;
  private completion: "ready" | "error" | undefined;

  constructor(private readonly media: AsyncAtaBlockMedia, private readonly interrupts: InterruptSink, private readonly irqVector = 0x76) {
    if (media.sectorSize !== 512) throw new Error("ATA PIO في هذه المرحلة يتطلب قطاعات 512 بايت.");
  }

  in8(port: number): number {
    switch (port & 0xffff) {
      case ScheduledAtaPioDevice.DATA: return this.readData();
      case ScheduledAtaPioDevice.SECTOR_COUNT: return this.sectorCount;
      case ScheduledAtaPioDevice.LBA_LOW: return this.lbaLow;
      case ScheduledAtaPioDevice.LBA_MID: return this.lbaMid;
      case ScheduledAtaPioDevice.LBA_HIGH: return this.lbaHigh;
      case ScheduledAtaPioDevice.DRIVE: return this.drive;
      case ScheduledAtaPioDevice.STATUS_COMMAND: return this.status;
      default: throw new Error(`منفذ ATA غير صالح: 0x${port.toString(16)}.`);
    }
  }

  out8(port: number, value: number): void {
    const data = u8(value);
    switch (port & 0xffff) {
      case ScheduledAtaPioDevice.SECTOR_COUNT: this.sectorCount = data; return;
      case ScheduledAtaPioDevice.LBA_LOW: this.lbaLow = data; return;
      case ScheduledAtaPioDevice.LBA_MID: this.lbaMid = data; return;
      case ScheduledAtaPioDevice.LBA_HIGH: this.lbaHigh = data; return;
      case ScheduledAtaPioDevice.DRIVE: this.drive = data; return;
      case ScheduledAtaPioDevice.STATUS_COMMAND: this.command(data); return;
      default: throw new Error(`منفذ ATA غير صالح: 0x${port.toString(16)}.`);
    }
  }

  snapshot(): Readonly<{ status: number; lba: number; sectorsRemaining: number; fifoBytesRemaining: number; pendingLba?: number }> {
    return { status: this.status, lba: this.nextLba, sectorsRemaining: this.sectorsRemaining, fifoBytesRemaining: Math.max(0, this.fifo.length - this.cursor), pendingLba: this.pendingLba };
  }

  /** Called only by the deterministic scheduler storage phase. */
  pump(): readonly AtaStorageEvent[] {
    const lba = this.pendingLba;
    if (lba === undefined || this.completion === undefined) return [];
    const completion = this.completion;
    this.pendingLba = undefined;
    this.completion = undefined;
    if (completion === "error") {
      this.status = ScheduledAtaPioDevice.STATUS_RDY | ScheduledAtaPioDevice.STATUS_ERR;
      this.interrupts.request(this.irqVector);
      return [{ kind: "ata.prefetch.error", lba }];
    }
    try {
      this.fifo = this.media.readSector(lba);
      this.cursor = 0;
      this.status = ScheduledAtaPioDevice.STATUS_RDY | ScheduledAtaPioDevice.STATUS_DRQ;
      this.interrupts.request(this.irqVector);
      return [{ kind: "ata.prefetch.ready", lba }];
    } catch {
      this.status = ScheduledAtaPioDevice.STATUS_RDY | ScheduledAtaPioDevice.STATUS_ERR;
      this.interrupts.request(this.irqVector);
      return [{ kind: "ata.prefetch.error", lba }];
    }
  }

  private command(command: number): void {
    this.status = ScheduledAtaPioDevice.STATUS_RDY;
    this.pendingLba = undefined;
    this.completion = undefined;
    if (command !== 0x20 || (this.drive & 0x40) === 0) { this.status |= ScheduledAtaPioDevice.STATUS_ERR; return; }
    this.nextLba = ((this.drive & 0x0f) << 24) | (this.lbaHigh << 16) | (this.lbaMid << 8) | this.lbaLow;
    this.sectorsRemaining = this.sectorCount === 0 ? 256 : this.sectorCount;
    this.queueNextSector();
  }

  private readData(): number {
    if ((this.status & ScheduledAtaPioDevice.STATUS_DRQ) === 0) return 0xff;
    const value = this.fifo[this.cursor++] ?? 0xff;
    if (this.cursor >= this.fifo.length) {
      this.sectorsRemaining -= 1;
      this.nextLba += 1;
      if (this.sectorsRemaining > 0) this.queueNextSector();
      else { this.status = ScheduledAtaPioDevice.STATUS_RDY; this.interrupts.request(this.irqVector); }
    }
    return value;
  }

  private queueNextSector(): void {
    if (this.nextLba < 0 || this.nextLba >= this.media.sectorCount) {
      this.status = ScheduledAtaPioDevice.STATUS_RDY | ScheduledAtaPioDevice.STATUS_ERR;
      this.interrupts.request(this.irqVector);
      return;
    }
    const lba = this.nextLba;
    this.status = ScheduledAtaPioDevice.STATUS_RDY | ScheduledAtaPioDevice.STATUS_BSY;
    this.pendingLba = lba;
    void this.media.prefetch(lba).then(
      () => { if (this.pendingLba === lba) this.completion = "ready"; },
      () => { if (this.pendingLba === lba) this.completion = "error"; },
    );
  }
}
