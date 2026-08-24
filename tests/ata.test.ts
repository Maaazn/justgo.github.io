import { describe, expect, it } from "vitest";
import { AtaPioDevice, PrefetchedAtaMedia } from "../src/core16/ata";
import { SectorDisk } from "../src/core16/devices";
import { LocalFileBlockMedia, LocalMediaSectorCache } from "../src/core16/local-media";

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
});
