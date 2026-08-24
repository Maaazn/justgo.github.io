import { describe, expect, it } from "vitest";
import { createLongModeControlState, CR0_PAGING, CR0_PROTECTED_MODE, CR4_PAE, EFER_LME } from "../src/core64/control";
import { classifyExecutionMode, enterLongMode } from "../src/core64/transition";
import { enterLongModeFromGdt } from "../src/core64/transition";
import { LongModeAddressSpace } from "../src/core64/address-space";
import { LinearMemory } from "../src/core16/memory";

const control = createLongModeControlState({ cr0: CR0_PROTECTED_MODE | CR0_PAGING, cr3: 0x1000n, cr4: CR4_PAE, efer: EFER_LME });
const code = { selector: 0x08, present: true, executable: true, longMode: true };

describe("JustGo Core-64 long-mode transition", () => {
  it("enters long mode only after a valid protected-mode control sequence and code segment", () => {
    const protectedState = { mode: classifyExecutionMode(control), control, cs: 0x08, rip: 0x2000n } as const;
    expect(enterLongMode(protectedState, code, 0xffff_8000_0000_1234n)).toMatchObject({ mode: "long", cs: 0x08, rip: 0xffff_8000_0000_1234n });
  });

  it("rejects a transition lacking a long-mode code descriptor", () => {
    const protectedState = { mode: "protected" as const, control, cs: 0x08, rip: 0n };
    expect(() => enterLongMode(protectedState, { ...code, longMode: false }, 0n)).toThrow("بعلم L");
  });

  it("enters long mode from a guest GDT descriptor", () => {
    const memory = new LinearMemory();
    const writeEntry = (at: number, value: number) => { memory.write8(at, value); memory.write8(at + 1, value >>> 8); memory.write8(at + 2, value >>> 16); memory.write8(at + 3, value >>> 24); };
    writeEntry(0x1000, 0x2003); writeEntry(0x2000, 0x3003); writeEntry(0x3000, 0x4003); writeEntry(0x4000, 0x0003);
    memory.write8(0x500 + 8 + 5, 0x9a); memory.write8(0x500 + 8 + 6, 0x20);
    const address = new LongModeAddressSpace(memory, control);
    const protectedState = { mode: "protected" as const, control, cs: 0x08, rip: 0n };
    expect(enterLongModeFromGdt(protectedState, address, { base: 0x500n, limit: 0x17 }, 0x08, 0x600n)).toMatchObject({ mode: "long", rip: 0x600n });
  });
});
