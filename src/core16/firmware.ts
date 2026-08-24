/**
 * JustGo firmware services are narrow real-mode contracts, not a copied BIOS.
 * They let the native Core-16 path exercise boot-sector reads with deterministic
 * guest-visible register and memory effects.
 */
import type { MemoryBus } from "./memory";
import { FLAG_CARRY, physicalAddress, type Cpu16State, u16 } from "./types";

export interface FirmwareInterruptService {
  handleInterrupt(vector: number, state: Cpu16State, memory: MemoryBus): boolean;
}

export interface BiosBlockDevice {
  readonly sectorSize: number;
  readonly sectorCount: number;
  readSector(lba: number): Uint8Array | undefined;
}

export interface PcBiosOptions {
  readonly bootDevice?: BiosBlockDevice;
  readonly conventionalMemoryKiB?: number;
  readonly heads?: number;
  readonly sectorsPerTrack?: number;
}

/** Small deterministic PC BIOS service profile for boot corpus execution. */
export class PcBiosServices implements FirmwareInterruptService {
  private readonly conventionalMemoryKiB: number;
  private readonly heads: number;
  private readonly sectorsPerTrack: number;

  constructor(private readonly options: PcBiosOptions = {}) {
    this.conventionalMemoryKiB = options.conventionalMemoryKiB ?? 640;
    this.heads = options.heads ?? 16;
    this.sectorsPerTrack = options.sectorsPerTrack ?? 63;
  }

  handleInterrupt(vector: number, state: Cpu16State, memory: MemoryBus): boolean {
    if (vector === 0x12) {
      state.ax = u16(this.conventionalMemoryKiB);
      this.setCarry(state, false);
      return true;
    }
    if (vector !== 0x13) return false;
    const ah = state.ax >>> 8;
    if (ah === 0x00) {
      state.ax &= 0x00ff;
      this.setCarry(state, false);
      return true;
    }
    if (ah !== 0x02 || !this.options.bootDevice) {
      this.failDisk(state, 0x01);
      return true;
    }
    return this.readChsSectors(state, memory);
  }

  private readChsSectors(state: Cpu16State, memory: MemoryBus): boolean {
    const count = state.ax & 0xff;
    const sector = state.cx & 0x3f;
    const cylinder = ((state.cx >>> 8) & 0xff) | ((state.cx & 0xc0) << 2);
    const head = state.dx >>> 8;
    const drive = state.dx & 0xff;
    const device = this.options.bootDevice!;
    if (drive !== 0x80 || count === 0 || sector === 0 || sector > this.sectorsPerTrack || head >= this.heads || device.sectorSize !== 512) {
      this.failDisk(state, 0x04);
      return true;
    }
    const firstLba = ((cylinder * this.heads + head) * this.sectorsPerTrack) + sector - 1;
    if (firstLba + count > device.sectorCount) {
      this.failDisk(state, 0x04);
      return true;
    }
    let destination = physicalAddress(state.es, state.bx);
    for (let index = 0; index < count; index += 1) {
      const bytes = device.readSector(firstLba + index);
      if (!bytes || bytes.byteLength !== 512) {
        this.failDisk(state, 0x20);
        return true;
      }
      memory.load(destination, bytes);
      destination += 512;
    }
    state.ax = (state.ax & 0xff00) | count;
    this.setCarry(state, false);
    return true;
  }

  private failDisk(state: Cpu16State, status: number): void {
    state.ax = (status << 8) | (state.ax & 0xff);
    this.setCarry(state, true);
  }

  private setCarry(state: Cpu16State, enabled: boolean): void {
    state.flags = enabled ? state.flags | FLAG_CARRY : state.flags & ~FLAG_CARRY;
  }
}
