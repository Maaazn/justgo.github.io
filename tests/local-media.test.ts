import { describe, expect, it } from "vitest";
import { LocalFileBlockMedia, LocalMediaRangeError } from "../src/core16/local-media";

function image(bytes: number[]): Blob & { name?: string } {
  const file = new Blob([new Uint8Array(bytes)]);
  Object.defineProperty(file, "name", { value: "fixture.img" });
  return file;
}

describe("JustGo local-only block media", () => {
  it("reads sectors lazily from a visitor-side Blob and records no upload target", async () => {
    const media = new LocalFileBlockMedia(image([0, 1, 2, 3, 4, 5]), "hard-disk", 4);
    expect(media.manifest).toEqual({ fileName: "fixture.img", bytes: 6, format: "hard-disk", sectorSize: 4, source: "visitor-device-only" });
    await expect(media.readSector(0)).resolves.toEqual(new Uint8Array([0, 1, 2, 3]));
    await expect(media.readSector(1)).resolves.toEqual(new Uint8Array([4, 5]));
  });

  it("rejects out-of-range local reads instead of silently wrapping disk data", async () => {
    const media = new LocalFileBlockMedia(image([0, 1, 2, 3]), "cdrom", 2);
    await expect(media.readSector(2)).rejects.toBeInstanceOf(LocalMediaRangeError);
    await expect(media.readRange(3, 2)).rejects.toBeInstanceOf(LocalMediaRangeError);
  });
});
