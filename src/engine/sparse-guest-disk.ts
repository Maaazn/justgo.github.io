/**
 * JustGo virtual-disk design: exposes real ATA address space while allocating
 * only 64 KiB chunks the guest touches. No multi-gigabyte ArrayBuffer is made.
 */
import type { SparseChunkStore } from "./sparse-disk-storage";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const CHUNK_BYTES = 64 * 1024;

export type VirtualDiskGiB = 20 | 32 | 48 | 64;

export const VIRTUAL_DISK_OPTIONS: readonly { readonly giB: VirtualDiskGiB; readonly label: string }[] = [
  { giB: 20, label: "20 GiB — قرص ATA sparse" },
  { giB: 32, label: "32 GiB — قرص ATA sparse" },
  { giB: 48, label: "48 GiB — قرص ATA sparse" },
  { giB: 64, label: "64 GiB — قرص ATA sparse" },
];

/** Matches the narrow buffer contract consumed by the JustGo v86 BSD-2-Clause fork. */
export class SparseGuestDisk {
  readonly __justgo_sparse_buffer = true;
  readonly byteLength: number;
  onload?: (result: object) => void;
  onprogress?: (progress: { loaded: number; total: number; lengthComputable: boolean }) => void;
  private readonly chunks = new Map<number, Uint8Array>();
  private readonly diskId?: string;
  private readonly store?: SparseChunkStore;

  constructor(
    readonly sizeGiB: VirtualDiskGiB,
    options: { diskId?: string; store?: SparseChunkStore } = {},
  ) {
    this.byteLength = sizeGiB * GIB;
    this.diskId = options.diskId;
    this.store = options.store;
  }

  load(): void {
    this.onload?.(Object.create(null));
  }

  get(start: number, length: number, callback: (bytes: Uint8Array) => void): void {
    this.assertRange(start, length);
    void this.read(start, length).then(callback);
  }

  set(start: number, bytes: Uint8Array, callback: () => void): void {
    this.assertRange(start, bytes.byteLength);
    let sourceOffset = 0;
    while (sourceOffset < bytes.byteLength) {
      const absolute = start + sourceOffset;
      const chunkIndex = Math.floor(absolute / CHUNK_BYTES);
      const offsetInChunk = absolute % CHUNK_BYTES;
      const count = Math.min(CHUNK_BYTES - offsetInChunk, bytes.byteLength - sourceOffset);
      const chunk = this.chunks.get(chunkIndex) ?? this.createChunk(chunkIndex);
      chunk.set(bytes.subarray(sourceOffset, sourceOffset + count), offsetInChunk);
      sourceOffset += count;
    }
    void this.persistTouchedChunks(start, bytes.byteLength).finally(callback);
  }

  get_buffer(callback: (buffer?: ArrayBuffer) => void): void {
    // Exporting a whole sparse disk would force its declared capacity into RAM.
    callback();
  }

  get_state(): [number, [number, Uint8Array][]] {
    return [this.byteLength, [...this.chunks.entries()].map(([index, chunk]) => [index, chunk.slice()])];
  }

  set_state(state: [number, [number, Uint8Array][]]): void {
    if (state[0] !== this.byteLength) throw new Error("حالة القرص لا تطابق سعته المعلنة.");
    this.chunks.clear();
    for (const [index, chunk] of state[1]) this.chunks.set(index, chunk.slice());
  }

  get allocatedBytes(): number {
    return this.chunks.size * CHUNK_BYTES;
  }

  private async read(start: number, length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    let targetOffset = 0;
    while (targetOffset < result.byteLength) {
      const absolute = start + targetOffset;
      const chunkIndex = Math.floor(absolute / CHUNK_BYTES);
      const offsetInChunk = absolute % CHUNK_BYTES;
      const count = Math.min(CHUNK_BYTES - offsetInChunk, result.byteLength - targetOffset);
      const chunk = await this.loadChunk(chunkIndex);
      if (chunk) result.set(chunk.subarray(offsetInChunk, offsetInChunk + count), targetOffset);
      targetOffset += count;
    }
    return result;
  }

  private async loadChunk(index: number): Promise<Uint8Array | undefined> {
    const memory = this.chunks.get(index);
    if (memory) return memory;
    if (!this.store || !this.diskId) return undefined;
    const stored = await this.store.read(this.diskId, index);
    if (stored) this.chunks.set(index, stored);
    return stored;
  }

  private async persistTouchedChunks(start: number, length: number): Promise<void> {
    if (!this.store || !this.diskId) return;
    const first = Math.floor(start / CHUNK_BYTES);
    const last = Math.floor((start + length - 1) / CHUNK_BYTES);
    await Promise.all(
      Array.from({ length: last - first + 1 }, (_, offset) => first + offset).map(async (index) => {
        const chunk = this.chunks.get(index);
        if (chunk) await this.store!.write(this.diskId!, index, chunk);
      }),
    );
  }

  private createChunk(index: number): Uint8Array {
    const chunk = new Uint8Array(CHUNK_BYTES);
    this.chunks.set(index, chunk);
    return chunk;
  }

  private assertRange(start: number, length: number): void {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length <= 0 || start + length > this.byteLength) {
      throw new RangeError("قراءة أو كتابة القرص تقع خارج السعة المعلنة.");
    }
  }
}
