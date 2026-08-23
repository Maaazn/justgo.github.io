import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { createLongModeControlState } from "../src/core64/control";
import { LongModeAddressSpace } from "../src/core64/address-space";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

describe("JustGo Core-64 address space", () => {
  it("reads and writes through a PML4 mapping", () => {
    const memory = new LinearMemory();
    write64(memory, 0x1000, 0x2003n); write64(memory, 0x2000, 0x3003n);
    write64(memory, 0x3000, 0x4003n); write64(memory, 0x4000, 0x8003n);
    const space = new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n }));
    space.write8(0x21n, 0x7f);
    expect(space.read8(0x21n)).toBe(0x7f);
  });
});
