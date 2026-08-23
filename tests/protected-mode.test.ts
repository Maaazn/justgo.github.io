import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { assertSegmentAccess, PageFault, pagingEnabled, protectedModeEnabled, readSegmentDescriptor, translatePage32 } from "../src/core16/protected-mode";

function write32(memory: LinearMemory, address: number, value: number): void {
  memory.write16(address, value);
  memory.write16(address + 2, value >>> 16);
}

describe("JustGo protected-mode foundation", () => {
  it("parses a present 4KiB-granular code descriptor from a GDT", () => {
    const memory = new LinearMemory();
    const gdt = 0x500;
    // base=0x12345000, limit=0xFFFFF, access=present code/read, granularity=4KiB
    memory.load(gdt + 8, new Uint8Array([0xff, 0xff, 0x00, 0x50, 0x34, 0x9a, 0xcf, 0x12]));
    const descriptor = readSegmentDescriptor(memory, gdt, 15, 0x08);
    expect(descriptor.base).toBe(0x12345000);
    expect(descriptor.limit).toBe(0xffffffff);
    expect(descriptor.executable).toBe(true);
    expect(assertSegmentAccess(descriptor, 0x20, "execute")).toBe(0x12345020);
  });

  it("walks a present 4KiB page mapping and protects writes", () => {
    const memory = new LinearMemory();
    write32(memory, 0x1000, 0x2003);
    write32(memory, 0x2004, 0x3003);
    expect(translatePage32(memory, 0x1000, 0x1234, "read")).toBe(0x3234);
    expect(translatePage32(memory, 0x1000, 0x1234, "write")).toBe(0x3234);
    write32(memory, 0x2004, 0x3001);
    expect(() => translatePage32(memory, 0x1000, 0x1234, "write")).toThrow(PageFault);
  });

  it("recognises CR0 protected-mode and paging flags without changing CPU execution", () => {
    expect(protectedModeEnabled(1)).toBe(true);
    expect(pagingEnabled(0x80000001)).toBe(true);
    expect(protectedModeEnabled(0)).toBe(false);
  });
});
