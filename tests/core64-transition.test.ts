import { describe, expect, it } from "vitest";
import { createLongModeControlState, CR0_PAGING, CR0_PROTECTED_MODE, CR4_PAE, EFER_LME } from "../src/core64/control";
import { classifyExecutionMode, enterLongMode } from "../src/core64/transition";

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
});
