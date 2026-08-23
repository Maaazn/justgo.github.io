import { describe, expect, it } from "vitest";
import { Core16, UnsupportedAddressingModeError } from "../src/core16/cpu";
import { LinearMemory } from "../src/core16/memory";
import { TestPortBus } from "../src/core16/ports";

describe("JustGo Core-16 ModR/M register instructions", () => {
  it("moves, adds, subtracts and compares 16-bit register operands", () => {
    const core = new Core16(new LinearMemory(), new TestPortBus());
    // MOV AX,1; MOV BX,2; ADD AX,BX; MOV BX,AX; SUB BX,AX; CMP AX,AX; HLT
    core.loadProgram(Uint8Array.from([0xb8, 1, 0, 0xbb, 2, 0, 0x01, 0xd8, 0x89, 0xc3, 0x29, 0xc3, 0x39, 0xc0, 0xf4]));
    core.run();
    expect(core.state.ax).toBe(3);
    expect(core.state.bx).toBe(0);
    expect(core.state.flags & 0x40).toBe(0x40);
  });

  it("fails loudly for memory ModR/M until addressing is implemented", () => {
    const core = new Core16(new LinearMemory(), new TestPortBus());
    core.loadProgram(Uint8Array.from([0x89, 0x00]));
    expect(() => core.step()).toThrow(UnsupportedAddressingModeError);
  });
});
