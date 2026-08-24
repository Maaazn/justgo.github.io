import { describe, expect, it } from "vitest";
import { LinearMemory } from "../src/core16/memory";
import { createLongModeControlState, CR0_PAGING, CR0_PROTECTED_MODE, CR4_PAE, EFER_LME } from "../src/core64/control";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { readLongModeGdtCodeDescriptor } from "../src/core64/gdt";

describe("JustGo Core-64 GDT", () => {
  it("reads a present long-mode executable descriptor from guest memory", () => {
    const memory = new LinearMemory();
    const control = createLongModeControlState({ cr0: CR0_PROTECTED_MODE | CR0_PAGING, cr3: 0x1000n, cr4: CR4_PAE, efer: EFER_LME });
    // Identity map the first 16KiB for this descriptor fixture.
    const writeEntry = (at: number, value: number) => { memory.write8(at, value); memory.write8(at + 1, value >>> 8); memory.write8(at + 2, value >>> 16); memory.write8(at + 3, value >>> 24); };
    writeEntry(0x1000, 0x2003); writeEntry(0x2000, 0x3003); writeEntry(0x3000, 0x4003); writeEntry(0x4000, 0x0003);
    const address = new LongModeAddressSpace(memory, control);
    memory.write8(0x500 + 8 + 5, 0x9a); memory.write8(0x500 + 8 + 6, 0x20);
    expect(readLongModeGdtCodeDescriptor(address, { base: 0x500n, limit: 0x17 }, 0x08)).toMatchObject({ selector: 0x08, present: true, executable: true, longMode: true });
  });
});
