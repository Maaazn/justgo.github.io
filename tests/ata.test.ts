import { describe, expect, it } from "vitest";
import { AtaPioDevice, PrefetchedAtaMedia, ScheduledAtaPioDevice, type AsyncAtaBlockMedia } from "../src/core16/ata";
import { SectorDisk } from "../src/core16/devices";
import { LocalFileBlockMedia, LocalMediaSectorCache } from "../src/core16/local-media";

class DeferredAtaMedia implements AsyncAtaBlockMedia {
  readonly sectorSize = 512;
  readonly sectorCount = 1;
  readonly prefetches: number[] = [];
  private cached = false;
  private resolve: (() => void) | undefined;
  private readonly bytes = new Uint8Array(512);

  constructor() { this.bytes[0] = 0xa5; }

  prefetch(index: number): Promise<Uint8Array> {
    this.prefetches.push(index);
    return new Promise((resolve) => { this.resolve = () => { this.cached = true; resolve(this.bytes.slice()); }; });
  }

  readSector(index: number): Uint8Array {
    if (!this.cached || index !== 0) throw new Error("sector is not cached");
    return this.bytes.slice();
  }

  complete(): void { this.resolve?.(); }
}

class RejectingAtaMedia implements AsyncAtaBlockMedia {
  readonly sectorSize = 512;
  readonly sectorCount = 1;
  async prefetch(): Promise<Uint8Array> { throw new Error("local read failed"); }
  readSector(): Uint8Array { throw new Error("no cached sector after failed prefetch"); }
}

describe("JustGo ATA PIO primary device", () => {
  it("serves an LBA28 sector through the DRQ data FIFO and signals IRQ14", () => {
    const disk = new SectorDisk(2); const sector = new Uint8Array(512); sector[0] = 0x34; sector[1] = 0x12; sector[511] = 0xfe; disk.writeSector(1, sector);
    const vectors: number[] = []; const ata = new AtaPioDevice(disk, { request: (vector) => vectors.push(vector) });
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 1); ata.out8(0x1f4, 0); ata.out8(0x1f5, 0); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    expect(ata.in8(0x1f7) & AtaPioDevice.STATUS_DRQ).toBe(AtaPioDevice.STATUS_DRQ);
    expect(ata.in8(0x1f0)).toBe(0x34); expect(ata.in8(0x1f0)).toBe(0x12);
    for (let index = 2; index < 512; index += 1) ata.in8(0x1f0);
    expect(ata.in8(0x1f7)).toBe(AtaPioDevice.STATUS_RDY);
    expect(vectors).toEqual([0x76, 0x76]);
  });

  it("reports an ATA error for an out-of-range LBA without exposing data", () => {
    const disk = new SectorDisk(1); const ata = new AtaPioDevice(disk, { request: () => undefined });
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 4); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    expect(ata.in8(0x1f7) & AtaPioDevice.STATUS_ERR).toBe(AtaPioDevice.STATUS_ERR);
    expect(ata.in8(0x1f0)).toBe(0xff);
  });

  it("exposes visitor-owned Blob sectors to ATA only after deterministic prefetch", async () => {
    const bytes = new Uint8Array(512); bytes[0] = 0x5a;
    const local = new LocalFileBlockMedia(new Blob([bytes]), "hard-disk");
    const media = new PrefetchedAtaMedia(new LocalMediaSectorCache(local), local.sectorCount);
    expect(() => media.readSector(0)).toThrow(/prefetch/);
    await media.prefetch(0);
    expect(media.readSector(0)[0]).toBe(0x5a);
  });

  it("keeps a local-media ATA command busy until the scheduler storage pump receives prefetch completion", async () => {
    const media = new DeferredAtaMedia(); const vectors: number[] = [];
    const ata = new ScheduledAtaPioDevice(media, { request: (vector) => vectors.push(vector) });
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 0); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    expect(ata.in8(0x1f7) & ScheduledAtaPioDevice.STATUS_BSY).toBe(ScheduledAtaPioDevice.STATUS_BSY);
    expect(ata.in8(0x1f7) & ScheduledAtaPioDevice.STATUS_DRQ).toBe(0);
    expect(ata.in8(0x1f0)).toBe(0xff);
    expect(ata.pump()).toEqual([]);
    media.complete(); await Promise.resolve();
    expect(ata.pump()).toEqual([{ kind: "ata.prefetch.ready", lba: 0 }]);
    expect(ata.in8(0x1f7) & ScheduledAtaPioDevice.STATUS_DRQ).toBe(ScheduledAtaPioDevice.STATUS_DRQ);
    expect(ata.in8(0x1f0)).toBe(0xa5);
    for (let index = 1; index < 512; index += 1) ata.in8(0x1f0);
    expect(vectors).toEqual([0x76, 0x76]);
    expect(media.prefetches).toEqual([0]);
  });

  it("reports a local prefetch failure from the storage phase without exposing DRQ", async () => {
    const vectors: number[] = []; const ata = new ScheduledAtaPioDevice(new RejectingAtaMedia(), { request: (vector) => vectors.push(vector) });
    ata.out8(0x1f2, 1); ata.out8(0x1f3, 0); ata.out8(0x1f6, 0xe0); ata.out8(0x1f7, 0x20);
    await Promise.resolve();
    expect(ata.pump()).toEqual([{ kind: "ata.prefetch.error", lba: 0 }]);
    expect(ata.in8(0x1f7) & ScheduledAtaPioDevice.STATUS_ERR).toBe(ScheduledAtaPioDevice.STATUS_ERR);
    expect(ata.in8(0x1f7) & ScheduledAtaPioDevice.STATUS_DRQ).toBe(0);
    expect(vectors).toEqual([0x76]);
  });
});
