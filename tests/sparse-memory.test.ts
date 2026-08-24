import { describe, expect, it } from "vitest";
import { SparsePhysicalMemory } from "../src/core16/memory";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { createLongModeControlState } from "../src/core64/control";

function write64(memory: SparsePhysicalMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

describe("JustGo sparse physical memory", () => {
  it("does not allocate unread high memory", () => {
    const memory = new SparsePhysicalMemory();
    expect(memory.read8(0xc000_0000)).toBe(0);
    expect(memory.allocatedPageCount()).toBe(0);
    memory.write8(0xc000_0123, 0x5a);
    expect(memory.read8(0xc000_0123)).toBe(0x5a);
    expect(memory.allocatedByteLength()).toBe(4096);
  });

  it("maps a Core-64 page to physical memory above 2GiB", () => {
    const memory = new SparsePhysicalMemory();
    const virtualAddress = 0x0000_0000_8000_0123n;
    const physicalPage = 0xc000_0000n;
    const presentWritable = 0x3n;

    write64(memory, 0x1000, 0x2000n | presentWritable);
    write64(memory, 0x2000 + 2 * 8, 0x3000n | presentWritable);
    write64(memory, 0x3000, 0x4000n | presentWritable);
    write64(memory, 0x4000, physicalPage | presentWritable);
    memory.write8(Number(physicalPage) + 0x123, 0xa5);

    const space = new LongModeAddressSpace(memory, createLongModeControlState({ cr3: 0x1000n }));
    expect(space.read8(virtualAddress)).toBe(0xa5);
    expect(memory.allocatedPageCount()).toBe(5);
  });
});
