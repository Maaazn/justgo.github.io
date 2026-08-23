import { describe, expect, it } from "vitest";
import { assertLongModeReady, createLongModeControlState, CR0_PAGING, CR0_PROTECTED_MODE, CR4_PAE, EFER_LME, longModeActive } from "../src/core64/control";
import { createCpu64State, low32, u64, write32ZeroExtended } from "../src/core64/registers";

describe("JustGo Core-64 control and registers", () => {
  it("requires the full CR0/CR4/EFER long-mode transition", () => {
    const incomplete = createLongModeControlState({ cr0: CR0_PROTECTED_MODE | CR0_PAGING, cr3: 0x1000n });
    expect(longModeActive(incomplete)).toBe(false);
    const ready = createLongModeControlState({ cr0: CR0_PROTECTED_MODE | CR0_PAGING, cr3: 0x1000n, cr4: CR4_PAE, efer: EFER_LME });
    expect(() => assertLongModeReady(ready)).not.toThrow();
    expect(longModeActive(ready)).toBe(true);
  });

  it("models 64-bit wrap and x86-64 zero extension after a 32-bit write", () => {
    expect(u64(-1n)).toBe(0xffff_ffff_ffff_ffffn);
    expect(write32ZeroExtended(0xffff_ffff_1234_5678n)).toBe(0x1234_5678n);
    expect(low32(createCpu64State({ rax: 0xffff_ffff_0000_0042n }).rax)).toBe(0x42);
  });
});
