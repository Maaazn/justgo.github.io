import { LongModeAddressSpace } from "./address-space";

export interface RgbaPixel {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

/**
 * Framebuffer guest-visible through PML4 translation. Rendering is deliberately
 * separated: UI code can consume snapshot() without owning guest memory.
 */
export class LongModeFramebuffer {
  private dirty = true;
  private revision = 0;

  constructor(
    private readonly addressSpace: LongModeAddressSpace,
    readonly baseAddress: bigint,
    readonly width: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("أبعاد framebuffer يجب أن تكون أعداداً صحيحة موجبة.");
  }

  writePixel(x: number, y: number, pixel: RgbaPixel): void {
    const address = this.pixelAddress(x, y);
    this.addressSpace.write8(address, pixel.red);
    this.addressSpace.write8(address + 1n, pixel.green);
    this.addressSpace.write8(address + 2n, pixel.blue);
    this.addressSpace.write8(address + 3n, pixel.alpha);
    this.dirty = true;
    this.revision += 1;
  }

  readPixel(x: number, y: number): RgbaPixel {
    const address = this.pixelAddress(x, y);
    return {
      red: this.addressSpace.read8(address),
      green: this.addressSpace.read8(address + 1n),
      blue: this.addressSpace.read8(address + 2n),
      alpha: this.addressSpace.read8(address + 3n),
    };
  }

  snapshot(): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = (y * this.width + x) * 4;
        const pixel = this.readPixel(x, y);
        pixels[index] = pixel.red; pixels[index + 1] = pixel.green;
        pixels[index + 2] = pixel.blue; pixels[index + 3] = pixel.alpha;
      }
    }
    return pixels;
  }

  /** Renderer may clear this marker after a successful presentation only. */
  takeDirty(): { readonly dirty: boolean; readonly revision: number } {
    const state = { dirty: this.dirty, revision: this.revision };
    this.dirty = false;
    return state;
  }

  private pixelAddress(x: number, y: number): bigint {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) throw new RangeError("إحداثيات framebuffer خارج السطح.");
    return this.baseAddress + BigInt((y * this.width + x) * 4);
  }
}
