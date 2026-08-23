import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";
import { LongModeFramebuffer } from "../src/core64/framebuffer";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

function createFramebuffer(): LongModeFramebuffer {
  const memory = new LinearMemory();
  write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n);
  write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
  const space = new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n }));
  return new LongModeFramebuffer(space, 0x100n, 2, 2);
}

describe("JustGo Core-64 framebuffer", () => {
  it("reads, writes, snapshots and bounds-checks guest-visible pixels", () => {
    const framebuffer = createFramebuffer();
    framebuffer.writePixel(1, 1, { red: 16, green: 32, blue: 64, alpha: 255 });
    expect(framebuffer.readPixel(1, 1)).toEqual({ red: 16, green: 32, blue: 64, alpha: 255 });
    expect(Array.from(framebuffer.snapshot().slice(12, 16))).toEqual([16, 32, 64, 255]);
    expect(() => framebuffer.writePixel(2, 0, { red: 0, green: 0, blue: 0, alpha: 0 })).toThrow(RangeError);
  });
});
