import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { LongModePageFault, isCanonicalAddress, translatePml4 } from "../src/core64/paging";

function write64(memory: LinearMemory, address: number, value: bigint): void {
  for (let byte = 0; byte < 8; byte += 1) memory.write8(address + byte, Number((value >> BigInt(byte * 8)) & 0xffn));
}

describe("JustGo Core-64 PML4 paging", () => {
  it("walks a present and writable 4-level mapping", () => {
    const memory = new LinearMemory();
    write64(memory, 0x1000, 0x2003n);
    write64(memory, 0x2000, 0x3003n);
    write64(memory, 0x3000, 0x4003n);
    write64(memory, 0x4000, 0x9003n);
    expect(translatePml4(memory, 0x1000n, 0x123n, "write")).toBe(0x9123n);
  });

  it("rejects noncanonical or non-present mappings", () => {
    const memory = new LinearMemory();
    expect(isCanonicalAddress(0x0001_0000_0000_0000n)).toBe(false);
    expect(() => translatePml4(memory, 0x1000n, 0x0001_0000_0000_0000n, "read")).toThrow(LongModePageFault);
    expect(() => translatePml4(memory, 0x1000n, 0x22n, "read")).toThrow("PML4E غير موجود");
  });
});
