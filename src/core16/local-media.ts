/**
 * Local-only block media for the JustGo engine. A Browser File is sliced on
 * demand so an ISO/IMG is not uploaded, persisted, or copied in full to RAM.
 * The current v86 bridge cannot stream a File directly; this adapter belongs
 * to the growing native JustGo storage path.
 */
export type LocalMediaFormat = "hard-disk" | "cdrom";

export interface LocalMediaManifest {
  fileName: string;
  bytes: number;
  format: LocalMediaFormat;
  sectorSize: number;
  source: "visitor-device-only";
}

export class LocalMediaRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalMediaRangeError";
  }
}

export class LocalFileBlockMedia {
  readonly manifest: LocalMediaManifest;

  constructor(private readonly file: Blob & { name?: string }, format: LocalMediaFormat, readonly sectorSize = 512) {
    if (!Number.isInteger(sectorSize) || sectorSize <= 0) throw new LocalMediaRangeError("حجم القطاع المحلي غير صالح.");
    this.manifest = {
      fileName: file.name || "local-image",
      bytes: file.size,
      format,
      sectorSize,
      source: "visitor-device-only",
    };
  }

  get sectorCount(): number {
    return Math.ceil(this.file.size / this.sectorSize);
  }

  async readSector(index: number): Promise<Uint8Array> {
    if (!Number.isInteger(index) || index < 0 || index >= this.sectorCount) {
      throw new LocalMediaRangeError("قطاع الوسيط المحلي خارج النطاق.");
    }
    const start = index * this.sectorSize;
    const end = Math.min(start + this.sectorSize, this.file.size);
    return new Uint8Array(await this.file.slice(start, end).arrayBuffer());
  }

  async readRange(offset: number, length: number): Promise<Uint8Array> {
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > this.file.size) {
      throw new LocalMediaRangeError("نطاق قراءة الوسيط المحلي غير صالح.");
    }
    return new Uint8Array(await this.file.slice(offset, offset + length).arrayBuffer());
  }
}
