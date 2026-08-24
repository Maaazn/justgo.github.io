import { describe, expect, it } from "vitest";
import { SparseGuestDisk } from "../src/engine/sparse-guest-disk";
import type { SparseChunkStore } from "../src/engine/sparse-disk-storage";

class MemoryChunkStore implements SparseChunkStore {
  private readonly chunks = new Map<string, Uint8Array>();

  async read(diskId: string, chunkIndex: number): Promise<Uint8Array | undefined> {
    return this.chunks.get(`${diskId}:${chunkIndex}`)?.slice();
  }

  async write(diskId: string, chunkIndex: number, bytes: Uint8Array): Promise<void> {
    this.chunks.set(`${diskId}:${chunkIndex}`, bytes.slice());
  }
}

function writeSectors(disk: SparseGuestDisk, start: number, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve) => disk.set(start, bytes, resolve));
}

function read(disk: SparseGuestDisk, start: number, length: number): Promise<Uint8Array> {
  return new Promise((resolve) => disk.get(start, length, resolve));
}

describe("SparseGuestDisk", () => {
  it("exposes a 64 GiB ATA address space without allocating it", () => {
    const disk = new SparseGuestDisk(64);
    expect(disk.byteLength).toBe(64 * 1024 * 1024 * 1024);
    expect(disk.allocatedBytes).toBe(0);
    disk.get(disk.byteLength - 512, 512, (bytes) => expect([...bytes]).toEqual(new Array(512).fill(0)));
  });

  it("persists writes crossing a sparse chunk boundary while allocating only touched chunks", async () => {
    const disk = new SparseGuestDisk(20);
    const start = 64 * 1024 - 256;
    const write = new Uint8Array(512).fill(0x5a);
    await writeSectors(disk, start, write);
    expect(disk.allocatedBytes).toBe(128 * 1024);
    expect([...(await read(disk, start, 512))]).toEqual([...write]);
  });

  it("restores written sectors into a later disk instance without allocating its advertised capacity", async () => {
    const store = new MemoryChunkStore();
    const written = new Uint8Array([0x4a, 0x47, 0x2d, 0x44]);
    const first = new SparseGuestDisk(20, { diskId: "windows-installer", store });
    await writeSectors(first, 2 * 64 * 1024 + 12, written);

    const restored = new SparseGuestDisk(20, { diskId: "windows-installer", store });
    expect([...(await read(restored, 2 * 64 * 1024 + 12, written.byteLength))]).toEqual([...written]);
    expect(restored.allocatedBytes).toBe(64 * 1024);
  });
});
